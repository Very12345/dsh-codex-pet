import {
    registerPluginUpdater,
    type HostRequest,
    type HostResponse,
} from "./plugin-updater.ts";
/** DSH Host 插件的宠物资源和配置路由。 */
import type { IncomingMessage, ServerResponse } from "node:http";
import { fileURLToPath } from "node:url";
import { readFile, mkdir } from "node:fs/promises";
import { join } from "node:path";
import { spawn, execFile } from "node:child_process";
import { BASE } from "./model.ts";
import { PetLibrary } from "./library.ts";
import {DesktopRuntime,type SpeechHost} from './desktop-runtime.ts';
import {WindowsSpeech,type SpeechOutput} from './local-speech.ts';
import type {VoiceModelServices} from './voice-dialogue.ts';
export const name = "very12345-codex-pet";
export const inject = ["webServer"];
const packageRoot = fileURLToPath(new URL("../", import.meta.url));
export function json(res: ServerResponse, status: number, data: unknown): void {
    res.writeHead(status, {
        "content-type": "application/json; charset=utf-8",
        "cache-control": "no-store",
        "x-content-type-options": "nosniff",
    });
    res.end(JSON.stringify(data));
}
export function trustedWrite(req: IncomingMessage): boolean {
    if (
        req.headers["x-dsh-pet"] !== "1" ||
        !req.headers["content-type"]?.startsWith("application/json")
    )
        return false;
    if (req.headers["sec-fetch-site"] === "cross-site") return false;
    if (req.headers.origin) {
        try {
            if (new URL(req.headers.origin).host !== req.headers.host)
                return false;
        } catch {
            return false;
        }
    }
    return true;
}
async function body(req: IncomingMessage, limit=16384): Promise<Record<string, unknown>> {
    let size = 0;
    const chunks: Buffer[] = [];
    for await (const chunk of req) {
        size += chunk.length;
        if (size > limit) throw new Error("请求过大");
        chunks.push(Buffer.from(chunk));
    }
    const value: unknown = JSON.parse(Buffer.concat(chunks).toString("utf8"));
    if (!value || typeof value !== "object" || Array.isArray(value))
        throw new Error("请求必须是 JSON 对象");
    return value as Record<string, unknown>;
}
export async function createHost(
    options: { root?: string; dataRoot?: string; skillRoot?: string;speech?:()=>SpeechHost|undefined;output?:SpeechOutput;voiceModels?:()=>VoiceModelServices;fixture?:boolean } = {},
) {
    const root = options.root ?? packageRoot;
    const library = new PetLibrary(
        join(root, "assets", "codex"),
        options.dataRoot,
        options.skillRoot,
    );
    await library.init();
    const output=options.output??new WindowsSpeech();
    const desktop = new DesktopRuntime(library,{speech:options.speech,output,voiceModels:options.voiceModels,fixture:options.fixture});
    let updateHandler:
        | ((req: HostRequest, res: HostResponse) => Promise<void>)
        | undefined;
    registerPluginUpdater(
        {
            logger: {
                warn: (message) => console.warn("[dsh-codex-pet]", message),
            },
            webServer: {
                register(route) {
                    updateHandler = route.handler;
                    return () => {
                        updateHandler = undefined;
                    };
                },
            },
        },
        {
            endpoint: `${BASE}/api/update`,
            packageName: "@very12345/dsh-codex-pet",
            manifestUrl: new URL("../package.json", import.meta.url),
        },
    );
    const snapshot = () => ({
        ...library.snapshot(),
        desktopSupported: desktop.supported,
        desktopError: desktop.error,
        creationAvailable: false,
        creation: null,
    });
    const handler = async (req: IncomingMessage, res: ServerResponse) => {
        try {
            // Host 校验阻止 DNS rebinding；远程 DSH 应由可信反向代理保留本机 Host。
            const authority = new URL(`http://${req.headers.host ?? ""}`);
            if (
                !["localhost", "127.0.0.1", "[::1]"].includes(
                    authority.hostname,
                )
            ) {
                json(res, 403, { error: "不受信任的 Host" });
                return;
            }
            const url = new URL(req.url ?? "/", authority);
            const path = url.pathname;
            if (path.startsWith(`${BASE}/api/desktop/`)) {
                if(req.socket.remoteAddress && !['127.0.0.1','::1','::ffff:127.0.0.1'].includes(req.socket.remoteAddress))throw new Error('桌面宠物只允许本机连接');
                if(req.method==='GET' && path===`${BASE}/api/desktop/events`){
                    if(req.headers['sec-fetch-site']==='cross-site')throw new Error('请求来源校验失败');
                    desktop.attach(url.searchParams.get('token'),res);return;
                }
                if(req.method==='GET'&&path===`${BASE}/api/desktop/tts-voices`){json(res,200,{voices:await desktop.voices()});return;}
                if(req.method!=='POST'){json(res,405,{error:'方法不支持'});return;}
                if(!trustedWrite(req)){json(res,403,{error:'请求来源校验失败'});return;}
                const value=await body(req,path===`${BASE}/api/desktop/snapshot`?32*1024*1024:path===`${BASE}/api/desktop/transcribe`?6*1024*1024:512*1024);
                if(path===`${BASE}/api/desktop/begin`){json(res,200,await desktop.begin(value.owner));return;}
                if(path===`${BASE}/api/desktop/snapshot`)await desktop.publish(value.token,value.snapshot);
                else if(path===`${BASE}/api/desktop/ack`)desktop.acknowledge(value.token,value.id,value.error);
                else if(path===`${BASE}/api/desktop/end`)desktop.release(value.token);
                else if(path===`${BASE}/api/desktop/voice-ready`)desktop.voiceReady(value.token,value.localOnly===true);
                else if(path===`${BASE}/api/desktop/composer`)desktop.composer(value.token,value.value);
                else if(path===`${BASE}/api/desktop/call-state`)desktop.callState(value.token,value.value);
                else if(path===`${BASE}/api/desktop/dialogue-end`)desktop.dialogueEnd(value.token,value.callId);
                else if(path===`${BASE}/api/desktop/dialogue-begin`||path===`${BASE}/api/desktop/dialogue`){const controller=new AbortController();res.once('close',()=>{if(!res.writableEnded)controller.abort();});const result=path.endsWith('dialogue-begin')?await desktop.dialogueBegin(value.token,value,controller.signal):await desktop.dialogueRespond(value.token,value,controller.signal);json(res,200,result??{});return;}
                else if(path===`${BASE}/api/desktop/tts`){const controller=new AbortController();res.once('close',()=>{if(!res.writableEnded)controller.abort();});json(res,200,await desktop.synthesize(value.token,value,controller.signal));return;}
                else if(path===`${BASE}/api/desktop/transcribe`){
                    const controller=new AbortController();res.once('close',()=>{if(!res.writableEnded)controller.abort();});
                    json(res,200,await desktop.transcribe(value.token,value.audioBase64,controller.signal,value.localOnly===true));return;
                }
                else {json(res,404,{error:'未知操作'});return;}
                json(res,200,{});return;
            }
            if (path === `${BASE}/api/update` && updateHandler) {
                await updateHandler(req, res);
                return;
            }
            if (req.method === "GET" && path === `${BASE}/api/state`) {
                json(res, 200, snapshot());
                return;
            }
            if (req.method === "GET" && path.startsWith(`${BASE}/asset/`)) {
                const bytes = await library.asset(
                    decodeURIComponent(path.slice(`${BASE}/asset/`.length)),
                );
                const png = bytes[0] === 137;
                res.writeHead(200, {
                    "content-type": png ? "image/png" : "image/webp",
                    "cache-control": "no-cache",
                    "x-content-type-options": "nosniff",
                });
                res.end(bytes);
                return;
            }
            if (!path.startsWith(`${BASE}/api/`)) {
                json(res, 404, { error: "未找到资源" });
                return;
            }
            if (req.method !== "POST") {
                json(res, 405, { error: "方法不支持" });
                return;
            }
            if (!trustedWrite(req)) {
                json(res, 403, { error: "请求来源校验失败" });
                return;
            }
            const value = await body(req);
            if (path === `${BASE}/api/config`) {
                await library.update(value);
                if(!library.config.desktop)desktop.stop();
            }
            else if (path === `${BASE}/api/refresh`) await library.refresh();
            else if (path === `${BASE}/api/create`) {
                throw new Error("请从 DSH 宠物设置发起创建会话");
            } else if (path === `${BASE}/api/open-folder`) {
                if (
                    req.socket.remoteAddress &&
                    !["127.0.0.1", "::1", "::ffff:127.0.0.1"].includes(
                        req.socket.remoteAddress,
                    )
                )
                    throw new Error("只能在运行 DSH 的本机打开文件夹");
                await mkdir(library.customPath, { recursive: true });
                if (process.platform === "win32") {
                    // 后台 Host 的窗口状态可能被 Explorer 继承，明确要求正常显示；目录经环境变量传递，不拼接脚本。
                    const powershell = join(
                        process.env.SystemRoot ?? "C:\\Windows",
                        "System32",
                        "WindowsPowerShell",
                        "v1.0",
                        "powershell.exe",
                    );
                    const script =
                        "$ErrorActionPreference = \"Stop\"; Start-Process -FilePath explorer.exe -ArgumentList ('\"' + $env:DSH_PET_OPEN_DIRECTORY + '\"') -WindowStyle Normal";
                    await new Promise<void>((resolve, reject) => {
                        execFile(
                            powershell,
                            [
                                "-NoProfile",
                                "-NonInteractive",
                                "-Command",
                                script,
                            ],
                            {
                                windowsHide: true,
                                timeout: 10000,
                                env: {
                                    ...process.env,
                                    DSH_PET_OPEN_DIRECTORY: library.customPath,
                                },
                            },
                            (error) =>
                                error
                                    ? reject(
                                          new Error(
                                              `打开文件夹失败：${error.message}`,
                                          ),
                                      )
                                    : resolve(),
                        );
                    });
                } else {
                    const command =
                        process.platform === "darwin" ? "open" : "xdg-open";
                    await new Promise<void>((resolve, reject) => {
                        const child = spawn(command, [library.customPath], {
                            shell: false,
                            stdio: "ignore",
                        });
                        child.once("error", reject);
                        child.once("spawn", () => {
                            child.unref();
                            resolve();
                        });
                    });
                }
            } else {
                json(res, 404, { error: "未知操作" });
                return;
            }
            json(res, 200, snapshot());
        } catch (error) {
            if (res.headersSent) res.end();
            else
                json(res, 400, {
                    error: error instanceof Error ? error.message : "操作失败",
                });
        }
    };
    return { handler, library, desktop, dispose: () => {desktop.dispose();output.dispose();} };
}
interface HostContext {
    get(name: string): {
        register(route: {
            kind: "prefix";
            path: string;
            handler: (req: IncomingMessage, res: ServerResponse) => void;
        }): () => void;
    };
    effect(effect: () => () => void): void;
}
export function apply(ctx: HostContext): void {
    ctx.effect(() => {
        let disposed = false,
            remove: (() => void) | undefined,
            host: Awaited<ReturnType<typeof createHost>> | undefined;
        const get=(name:string)=>{try{return (ctx as unknown as {get(name:string):unknown}).get(name);}catch{return undefined;}};
        void createHost({speech:()=>get('speechToText') as SpeechHost|undefined,voiceModels:()=>({llm:get('llm') as VoiceModelServices['llm'],defaults:get('agentDefaultModel') as VoiceModelServices['defaults'],sessions:get('sessionController') as VoiceModelServices['sessions']})})
            .then((value) => {
                host = value;
                if (disposed) {
                    host.dispose();
                    return;
                }
                remove = ctx.get("webServer").register({
                    kind: "prefix",
                    path: BASE,
                    handler: (req, res) => {
                        void value.handler(req, res);
                    },
                });
            })
            .catch((error) =>
                console.error("[dsh-codex-pet] 初始化失败", error),
            );
        return () => {
            disposed = true;
            remove?.();
            host?.dispose();
        };
    });
}
