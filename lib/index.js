// src/update-errors.ts
var messages = {
  "INVALID_VERSION": [
    "\u65E0\u6CD5\u8BFB\u53D6\u5F53\u524D\u63D2\u4EF6\u7248\u672C\u3002",
    "Could not read the current plugin version."
  ],
  "AUTO_UPDATE_UNAVAILABLE": [
    "\u5F53\u524D\u73AF\u5883\u4E0D\u652F\u6301\u81EA\u52A8\u66F4\u65B0\uFF0C\u8BF7\u4F7F\u7528\u624B\u5DE5\u66F4\u65B0\u547D\u4EE4\u3002",
    "Automatic updates are unavailable. Use the manual update command."
  ],
  "UPDATE_TIMEOUT": [
    "\u66F4\u65B0\u8D85\u65F6\uFF0C\u5DF2\u8BF7\u6C42\u53D6\u6D88\uFF1B\u8FDB\u7A0B\u7ED3\u675F\u524D\u4E0D\u80FD\u518D\u6B21\u5B89\u88C5\u3002",
    "The update timed out and cancellation was requested. Wait for the process to exit before retrying."
  ],
  "UNTRUSTED_REQUEST": [
    "\u5DF2\u62D2\u7EDD\u975E\u672C\u673A\u540C\u6E90\u66F4\u65B0\u8BF7\u6C42\u3002",
    "The update request was rejected because it is not from the same local origin."
  ],
  "UPDATE_IN_PROGRESS": [
    "\u5F53\u524D\u63D2\u4EF6\u6B63\u5728\u66F4\u65B0\uFF0C\u8BF7\u7A0D\u5019\u3002",
    "The plugin is being updated. Please wait."
  ],
  "NOT_PUBLISHED": [
    "\u63D2\u4EF6\u5C1A\u672A\u53D1\u5E03\u5230 npm\u3002",
    "The plugin has not been published to npm yet."
  ],
  "REGISTRY_UNAVAILABLE": [
    "\u6682\u65F6\u65E0\u6CD5\u83B7\u53D6\u6700\u65B0\u7248\u672C\u3002",
    "Could not retrieve the latest version. Please try again later."
  ],
  "UPDATE_FAILED": [
    "\u66F4\u65B0\u5931\u8D25\uFF0C\u8BF7\u67E5\u770B\u670D\u52A1\u7AEF\u65E5\u5FD7\u3002",
    "The update failed. Check the server logs."
  ]
};
function updateErrorMessage(code, language) {
  const key = typeof code === "string" && Object.hasOwn(messages, code) ? code : "UPDATE_FAILED";
  return messages[key][/^zh(?:-|$)/i.test(language) ? 0 : 1];
}
var UpdateFailure = class extends Error {
  constructor(code, detail) {
    super(detail ?? updateErrorMessage(code, "zh"));
    this.code = code;
  }
};
function updateErrorPayload(code) {
  return { code, error: updateErrorMessage(code, "zh") };
}

// src/plugin-updater.ts
import { spawn } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { homedir } from "node:os";
import { basename, dirname, isAbsolute, resolve } from "node:path";
import { fileURLToPath } from "node:url";
var PLUGIN_UPDATE_HEADER = "x-michengai-plugin-update";
function header(request, name2) {
  const value = request.headers?.[name2];
  return Array.isArray(value) ? value[0] : value;
}
function isLoopbackAddress(value) {
  const address = value?.toLowerCase().replace(/^\[|\]$/g, "");
  return address === "localhost" || address === "localhost." || address === "::1" || address?.startsWith("127.") === true || address?.startsWith("::ffff:127.") === true;
}
function isTrustedUpdateRequest(request) {
  if (header(request, PLUGIN_UPDATE_HEADER) !== "1") return false;
  if (!isLoopbackAddress(request.socket?.remoteAddress)) return false;
  const site = header(request, "sec-fetch-site");
  if (site !== void 0 && site !== "same-origin") return false;
  const origin = header(request, "origin");
  const host = header(request, "host");
  if (origin === void 0 || host === void 0) return false;
  try {
    const url = new URL(origin);
    return (url.protocol === "http:" || url.protocol === "https:") && isLoopbackAddress(url.hostname) && url.host === host;
  } catch {
    return false;
  }
}
function validProfileName(value) {
  return typeof value === "string" && value !== "" && value !== "." && value !== ".." && !value.includes("/") && !value.includes("\\") && !/[\0-\x1f\x7f]/.test(value);
}
function profileNameFromArgv(argv) {
  for (let index = 2; index < argv.length; index += 1) {
    if (argv[index] === "--profile") return argv[index + 1];
    if (argv[index]?.startsWith("--profile="))
      return argv[index].slice("--profile=".length);
  }
  return argv[2] === "web" ? "web" : void 0;
}
function isDshCliEntry(entry, manifest, packageRoot2) {
  if (typeof manifest !== "object" || manifest === null) return false;
  const value = manifest;
  if (value.name !== "@deepseek-ai/dsh") return false;
  const bin = typeof value.bin === "string" ? value.bin : typeof value.bin === "object" && value.bin !== null ? value.bin.dsh : void 0;
  return typeof bin === "string" && bin !== "" && !isAbsolute(bin) && resolve(packageRoot2, bin) === resolve(entry);
}
function cliEntry() {
  const value = process.argv[1];
  if (value === void 0 || value === "") return void 0;
  const entry = value.startsWith("file:") ? fileURLToPath(value) : resolve(process.cwd(), value);
  if (!existsSync(entry)) return void 0;
  for (let directory = dirname(entry); ; ) {
    const manifestPath = resolve(directory, "package.json");
    if (existsSync(manifestPath)) {
      try {
        if (isDshCliEntry(
          entry,
          JSON.parse(readFileSync(manifestPath, "utf8")),
          directory
        ))
          return entry;
      } catch {
      }
    }
    const parent = dirname(directory);
    if (parent === directory) return void 0;
    directory = parent;
  }
}
function runtime() {
  const profileDir = resolve(
    process.env.DSH_PROFILE_DIR ?? resolve(homedir(), ".dsh", "profiles", "web")
  );
  const selected = profileNameFromArgv(process.argv);
  const profileName = validProfileName(selected) ? selected : validProfileName(basename(profileDir)) ? basename(profileDir) : "web";
  const entry = cliEntry();
  return {
    profileName,
    profileDir,
    ...entry === void 0 ? {} : { cliEntry: entry }
  };
}
function parseSemver(value) {
  const match = /^v?(\d+)\.(\d+)\.(\d+)(?:-([0-9A-Za-z.-]+))?(?:\+[0-9A-Za-z.-]+)?$/.exec(
    value
  );
  if (match === null) return void 0;
  return {
    core: [Number(match[1]), Number(match[2]), Number(match[3])],
    prerelease: match[4]?.split(".") ?? []
  };
}
function isNewerVersion(currentValue, candidateValue) {
  const current = parseSemver(currentValue);
  const candidate = parseSemver(candidateValue);
  if (current === void 0 || candidate === void 0) return false;
  for (let index = 0; index < 3; index += 1) {
    if (candidate.core[index] !== current.core[index])
      return candidate.core[index] > current.core[index];
  }
  return comparePrerelease(candidate.prerelease, current.prerelease) > 0;
}
function comparePrerelease(left, right) {
  if (left.length === 0 || right.length === 0)
    return left.length === right.length ? 0 : left.length === 0 ? 1 : -1;
  const length = Math.max(left.length, right.length);
  for (let index = 0; index < length; index += 1) {
    const a = left[index];
    const b = right[index];
    if (a === void 0 || b === void 0)
      return a === b ? 0 : a === void 0 ? -1 : 1;
    if (a === b) continue;
    const aNumeric = /^\d+$/.test(a);
    const bNumeric = /^\d+$/.test(b);
    if (aNumeric && bNumeric) {
      const aNumber = BigInt(a);
      const bNumber = BigInt(b);
      if (aNumber !== bNumber) return aNumber > bNumber ? 1 : -1;
      continue;
    }
    if (aNumeric !== bNumeric) return aNumeric ? -1 : 1;
    return a > b ? 1 : -1;
  }
  return 0;
}
var latestCache;
async function latestVersion(packageName) {
  if (latestCache?.packageName === packageName && Date.now() < latestCache.expiresAt)
    return latestCache.version;
  try {
    const response = await fetch(
      `https://registry.npmjs.org/${encodeURIComponent(packageName)}/latest`,
      { signal: AbortSignal.timeout(8e3) }
    );
    if (response.status === 404) return null;
    if (!response.ok) return void 0;
    const value = await response.json();
    if (typeof value.version !== "string" || !parseSemver(value.version))
      return void 0;
    latestCache = {
      packageName,
      version: value.version,
      expiresAt: Date.now() + 5 * 6e4
    };
    return value.version;
  } catch {
    return void 0;
  }
}
async function currentVersion(manifestUrl) {
  const value = JSON.parse(await readFile(manifestUrl, "utf8"));
  if (typeof value.version !== "string" || !parseSemver(value.version))
    throw new UpdateFailure("INVALID_VERSION");
  return value.version;
}
async function status(options, target) {
  const current = await currentVersion(options.manifestUrl);
  const latest = await latestVersion(options.packageName);
  return {
    packageName: options.packageName,
    currentVersion: current,
    ...latest == null ? {} : { latestVersion: latest },
    notPublished: latest === null,
    latestCheckFailed: latest === void 0,
    updateAvailable: latest != null && isNewerVersion(current, latest),
    profileName: target.profileName,
    canAutoUpdate: target.cliEntry !== void 0
  };
}
async function install(target, packageSpec, track) {
  if (!target.cliEntry) throw new UpdateFailure("AUTO_UPDATE_UNAVAILABLE");
  const child = spawn(
    process.execPath,
    [
      target.cliEntry,
      "plugin",
      "--profile",
      target.profileName,
      "add",
      "--config.minimumReleaseAge=0",
      packageSpec,
      "--registry=https://registry.npmjs.org/"
    ],
    {
      cwd: target.profileDir,
      windowsHide: true,
      stdio: ["ignore", "pipe", "pipe"],
      env: { ...process.env, NO_COLOR: "1" }
    }
  );
  let detail = "";
  child.stdout.on("data", (chunk) => {
    detail = (detail + String(chunk)).slice(-4e3);
  });
  child.stderr.on("data", (chunk) => {
    detail = (detail + String(chunk)).slice(-4e3);
  });
  const done = new Promise((resolve3, reject) => {
    child.once("error", reject);
    child.once(
      "close",
      (code) => code === 0 ? resolve3() : reject(
        new UpdateFailure(
          "UPDATE_FAILED",
          detail.trim() || `\u66F4\u65B0\u8FDB\u7A0B\u9000\u51FA\u7801 ${code}`
        )
      )
    );
  });
  track(done);
  let timer;
  try {
    await Promise.race([
      done,
      new Promise((_, reject) => {
        timer = setTimeout(() => {
          child.kill();
          reject(new UpdateFailure("UPDATE_TIMEOUT"));
        }, 10 * 6e4);
      })
    ]);
  } finally {
    clearTimeout(timer);
  }
}
function json(response, statusCode, value) {
  response.writeHead(statusCode, {
    "content-type": "application/json; charset=utf-8",
    "cache-control": "no-store"
  });
  response.end(JSON.stringify(value));
}
function registerPluginUpdater(ctx, options) {
  const host = ctx;
  let installing = false;
  return host.webServer.register({
    kind: "exact",
    path: options.endpoint,
    handler: async (request, response) => {
      try {
        const target = runtime();
        if (request.method === "GET" || request.method === "HEAD") {
          const payload = await status(options, target);
          response.writeHead(200, {
            "content-type": "application/json; charset=utf-8",
            "cache-control": "no-store"
          });
          response.end(
            request.method === "HEAD" ? void 0 : JSON.stringify(payload)
          );
          return;
        }
        if (request.method !== "POST") {
          response.writeHead(405, { allow: "GET, HEAD, POST" });
          response.end();
          return;
        }
        if (!isTrustedUpdateRequest(request)) {
          json(response, 403, updateErrorPayload("UNTRUSTED_REQUEST"));
          return;
        }
        if (installing) {
          json(response, 409, updateErrorPayload("UPDATE_IN_PROGRESS"));
          return;
        }
        installing = true;
        let pendingInstall;
        try {
          const before = await status(options, target);
          if (before.notPublished) {
            json(response, 409, {
              ...before,
              ...updateErrorPayload("NOT_PUBLISHED")
            });
            return;
          }
          if (before.latestVersion === void 0) {
            json(response, 503, updateErrorPayload("REGISTRY_UNAVAILABLE"));
            return;
          }
          if (!before.updateAvailable) {
            json(response, 200, before);
            return;
          }
          await install(
            target,
            `${options.packageName}@${before.latestVersion}`,
            (done) => {
              pendingInstall = done;
            }
          );
          json(response, 200, {
            ...before,
            updatedVersion: before.latestVersion,
            restartRequired: true,
            autoReload: false
          });
        } finally {
          if (pendingInstall)
            void pendingInstall.then(
              () => {
                installing = false;
              },
              () => {
                installing = false;
              }
            );
          else installing = false;
        }
      } catch (error) {
        ctx.logger.warn(`plugin updater failed: ${String(error)}`);
        json(
          response,
          503,
          updateErrorPayload(
            error instanceof UpdateFailure ? error.code : "UPDATE_FAILED"
          )
        );
      }
    }
  });
}

// src/index.ts
import { fileURLToPath as fileURLToPath4 } from "node:url";
import { mkdir as mkdir2 } from "node:fs/promises";
import { join as join4 } from "node:path";
import { spawn as spawn4, execFile } from "node:child_process";

// src/model.ts
var BASE = "/dsh-codex-pet";
var BUILTINS = [
  ["codex", "Codex", "The original Codex companion."],
  ["dewey", "Dewey", "A calm companion for focused workspace days."],
  ["fireball", "Fireball", "Hot path energy for fast iteration."],
  ["hoots", "Hoots", "A sharp-eyed owl for polished work in a blink."],
  ["rocky", "Rocky", "A steady rock when the diff gets large."],
  ["seedy", "Seedy", "Small green shoots for new ideas."],
  ["stacky", "Stacky", "A balanced stack for deep work."],
  ["bsod", "BSOD", "A tiny blue-screen gremlin."],
  ["null-signal", "Null Signal", "Quiet signal from the void."]
];
var ANIMATIONS = {
  idle: { row: 0, durations: [280, 110, 110, 140, 140, 320] },
  "running-right": {
    row: 1,
    durations: [120, 120, 120, 120, 120, 120, 120, 220]
  },
  "running-left": {
    row: 2,
    durations: [120, 120, 120, 120, 120, 120, 120, 220]
  },
  waving: { row: 3, durations: [140, 140, 140, 280] },
  jumping: { row: 4, durations: [140, 140, 140, 140, 280] },
  failed: { row: 5, durations: [140, 140, 140, 140, 140, 140, 140, 240] },
  waiting: { row: 6, durations: [150, 150, 150, 150, 150, 260] },
  running: { row: 7, durations: [120, 120, 120, 120, 120, 220] },
  review: { row: 8, durations: [150, 150, 150, 150, 150, 280] }
};
var DEFAULT_CONFIG = {
  selected: "codex",
  visible: true,
  size: 120,
  position: null,
  desktop: true,
  desktopPosition: null,
  callVoice: "",
  callRate: 0
};
function normalizeConfig(value, previous = DEFAULT_CONFIG) {
  if (!value || typeof value !== "object") throw new Error("\u914D\u7F6E\u5FC5\u987B\u662F\u5BF9\u8C61");
  const data = value;
  if (data.callVoice !== void 0 && (typeof data.callVoice !== "string" || data.callVoice.length > 160 || /[\x00-\x1f]/.test(data.callVoice))) throw new Error("\u7CFB\u7EDF\u58F0\u97F3\u65E0\u6548");
  if (data.callRate !== void 0 && (!Number.isInteger(data.callRate) || data.callRate < -5 || data.callRate > 5)) throw new Error("\u8BED\u901F\u987B\u4E3A -5\u20135");
  if (data.selected !== void 0 && (typeof data.selected !== "string" || !/^(builtin|custom):[\w-]+$|^[\w-]+$/.test(data.selected)))
    throw new Error("\u5BA0\u7269\u6807\u8BC6\u65E0\u6548");
  if (data.visible !== void 0 && typeof data.visible !== "boolean")
    throw new Error("\u663E\u793A\u72B6\u6001\u65E0\u6548");
  if (data.desktop !== void 0 && typeof data.desktop !== "boolean") throw new Error("\u684C\u9762\u663E\u793A\u72B6\u6001\u65E0\u6548");
  if (data.desktopPosition !== void 0 && data.desktopPosition !== null && (typeof data.desktopPosition.screen !== "string" || data.desktopPosition.screen.length > 128 || !Number.isFinite(data.desktopPosition.x) || !Number.isFinite(data.desktopPosition.y) || data.desktopPosition.x < 0 || data.desktopPosition.x > 1 || data.desktopPosition.y < 0 || data.desktopPosition.y > 1)) {
    throw new Error("\u684C\u9762\u4F4D\u7F6E\u65E0\u6548");
  }
  if (data.size !== void 0 && (!Number.isFinite(data.size) || data.size < 64 || data.size > 224))
    throw new Error("\u5BA0\u7269\u5927\u5C0F\u987B\u4E3A 64\u2013224");
  if (data.position !== void 0 && data.position !== null && (!Number.isFinite(data.position.x) || !Number.isFinite(data.position.y) || data.position.x < 0 || data.position.x > 1 || data.position.y < 0 || data.position.y > 1))
    throw new Error("\u4F4D\u7F6E\u65E0\u6548");
  return {
    selected: data.selected ?? previous.selected,
    visible: data.visible ?? previous.visible,
    size: data.size ?? previous.size,
    position: data.position === void 0 ? previous.position : data.position,
    desktop: data.desktop ?? previous.desktop ?? true,
    desktopPosition: data.desktopPosition === void 0 ? previous.desktopPosition ?? null : data.desktopPosition,
    callVoice: data.callVoice ?? previous.callVoice ?? "",
    callRate: data.callRate ?? previous.callRate ?? 0
  };
}

// src/library.ts
import { readFile as readFile2, readdir, realpath, stat, mkdir, writeFile, rename, unlink } from "node:fs/promises";
import { existsSync as existsSync2 } from "node:fs";
import { dirname as dirname2, join, resolve as resolve2, relative, isAbsolute as isAbsolute2 } from "node:path";
import { homedir as homedir2 } from "node:os";
import { randomUUID, createHash } from "node:crypto";
function imageVersion(bytes) {
  let width = 0, height = 0;
  if (bytes.length >= 30 && bytes.toString("ascii", 0, 4) === "RIFF" && bytes.toString("ascii", 8, 12) === "WEBP") {
    const kind = bytes.toString("ascii", 12, 16);
    if (kind === "VP8X") {
      width = 1 + bytes.readUIntLE(24, 3);
      height = 1 + bytes.readUIntLE(27, 3);
    } else if (kind === "VP8L" && bytes[20] === 47) {
      const bits = bytes.readUInt32LE(21);
      width = (bits & 16383) + 1;
      height = (bits >>> 14 & 16383) + 1;
    } else if (kind === "VP8 ") {
      width = bytes.readUInt16LE(26) & 16383;
      height = bytes.readUInt16LE(28) & 16383;
    }
  } else if (bytes.length >= 24 && bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))) {
    width = bytes.readUInt32BE(16);
    height = bytes.readUInt32BE(20);
  }
  if (width !== 1536 || ![1872, 2288].includes(height)) throw new Error(`\u56FE\u96C6\u5C3A\u5BF8 ${width}\xD7${height} \u4E0D\u7B26\u5408 Codex 8 \u5217\u534F\u8BAE`);
  return height === 2288 ? 2 : 1;
}
async function confined(root, file) {
  const base = await realpath(root), target = await realpath(resolve2(root, file));
  const rel = relative(base, target);
  if (rel.startsWith("..") || isAbsolute2(rel)) throw new Error("\u6587\u4EF6\u8D85\u51FA\u5BA0\u7269\u76EE\u5F55");
  return target;
}
async function smallRead(path, limit) {
  const info = await stat(path);
  if (!info.isFile() || info.size > limit) throw new Error("\u6587\u4EF6\u8FC7\u5927\u6216\u4E0D\u662F\u666E\u901A\u6587\u4EF6");
  return readFile2(path);
}
var PetLibrary = class {
  constructor(assetRoot, dataRoot = join(process.env.DSH_HOME ?? join(homedir2(), ".dsh"), "codex-pet"), skillRoot = resolve2(assetRoot, "..", "..", "skills")) {
    this.assetRoot = assetRoot;
    this.dataRoot = dataRoot;
    this.skillRoot = skillRoot;
    this.customPath = join(dataRoot, "pets");
    this.skillPath = join(skillRoot, "hatch-pet", "SKILL.md");
    this.statePath = join(dataRoot, "config.json");
  }
  customPath;
  skillPath;
  statePath;
  config = DEFAULT_CONFIG;
  pets = [];
  warnings = [];
  configWarnings = [];
  files = /* @__PURE__ */ new Map();
  queue = Promise.resolve();
  async init() {
    try {
      this.config = normalizeConfig(JSON.parse(await readFile2(this.statePath, "utf8")));
    } catch (error) {
      if (error.code !== "ENOENT") this.configWarnings.push("\u914D\u7F6E\u8BFB\u53D6\u5931\u8D25\uFF0C\u6682\u7528\u9ED8\u8BA4\u503C\uFF1B\u539F\u6587\u4EF6\u672A\u6539\u52A8\u3002");
    }
    await mkdir(this.customPath, { recursive: true });
    await this.refresh();
  }
  async refresh() {
    const pets = [];
    const files = /* @__PURE__ */ new Map();
    const warnings = [];
    const add = async (id, name2, description, root, asset, source) => {
      const file = await confined(root, asset);
      const bytes = await smallRead(file, 32 * 1024 * 1024), version = imageVersion(bytes);
      const revision = createHash("sha256").update(bytes).digest("hex").slice(0, 24);
      pets.push({ id, name: name2, description, version, source, url: `${BASE}/asset/${encodeURIComponent(id)}?v=${revision}` });
      files.set(id, { root, relative: asset });
    };
    for (const [id, name2, description] of BUILTINS) {
      try {
        await add(id, name2, description, this.assetRoot, `${id}/spritesheet.webp`, "builtin");
      } catch {
        warnings.push(`\u5185\u7F6E\u5BA0\u7269 ${name2} \u7684\u539F\u59CB\u56FE\u96C6\u7F3A\u5931\u6216\u4E0D\u517C\u5BB9\u3002`);
      }
    }
    let folders = [];
    try {
      folders = await readdir(this.customPath);
    } catch (error) {
      if (error.code !== "ENOENT") warnings.push("\u65E0\u6CD5\u8BFB\u53D6\u81EA\u5B9A\u4E49\u5BA0\u7269\u76EE\u5F55\u3002");
    }
    for (const folder of folders.sort()) {
      if (!/^[\w-]+$/.test(folder)) continue;
      try {
        const root = await confined(this.customPath, folder);
        const manifest = JSON.parse((await smallRead(await confined(root, "pet.json"), 64 * 1024)).toString("utf8"));
        if (typeof manifest.spritesheetPath !== "string") throw new Error("\u7F3A\u5C11\u56FE\u96C6\u8DEF\u5F84");
        await add(`custom:${folder}`, String(manifest.displayName ?? folder).slice(0, 100), String(manifest.description ?? "").slice(0, 300), root, manifest.spritesheetPath, "custom");
      } catch {
        warnings.push(`\u81EA\u5B9A\u4E49\u5BA0\u7269 ${folder} \u672A\u901A\u8FC7\u683C\u5F0F\u6821\u9A8C\u3002`);
      }
    }
    this.pets = pets;
    this.files = files;
    this.warnings = [...this.configWarnings, ...warnings];
  }
  async asset(id) {
    const entry = this.files.get(id);
    if (!entry) throw new Error("\u5BA0\u7269\u4E0D\u5B58\u5728");
    return smallRead(await confined(entry.root, entry.relative), 32 * 1024 * 1024);
  }
  async update(value) {
    const operation = this.queue.then(async () => {
      const config = normalizeConfig(value, this.config);
      if (!this.pets.some((pet) => pet.id === config.selected)) throw new Error("\u8BF7\u9009\u62E9\u5DF2\u52A0\u8F7D\u7684\u5BA0\u7269");
      await mkdir(dirname2(this.statePath), { recursive: true });
      const temp = `${this.statePath}.${randomUUID()}.tmp`;
      try {
        await writeFile(temp, JSON.stringify(config, null, 2), { encoding: "utf8", flag: "wx" });
        await rename(temp, this.statePath);
      } finally {
        await unlink(temp).catch((error) => {
          if (error.code !== "ENOENT") throw error;
        });
      }
      this.config = config;
      return config;
    });
    this.queue = operation.catch(() => void 0);
    return operation;
  }
  snapshot() {
    return { pets: this.pets, config: this.config, customPath: this.customPath, warnings: this.warnings, skillAvailable: existsSync2(this.skillPath), skillPath: this.skillPath };
  }
};

// src/desktop-runtime.ts
import { spawn as spawn2 } from "node:child_process";
import { createInterface } from "node:readline";
import { fileURLToPath as fileURLToPath2 } from "node:url";
import { randomUUID as randomUUID2 } from "node:crypto";

// src/electron-path.ts
import { existsSync as existsSync3 } from "node:fs";
import { join as join2 } from "node:path";
import { homedir as homedir3 } from "node:os";
function electronPath() {
  const home = process.env.DSH_HOME ?? join2(homedir3(), ".dsh");
  for (const path of [process.env.DSH_FLOATING_PET_ELECTRON, join2(home, "electron", "electron.exe"), join2(home, "codex-pet", "electron", "electron.exe")]) if (path && existsSync3(path)) return path;
  throw new Error("\u684C\u9762\u60AC\u6D6E\u9700\u8981 Electron \u8FD0\u884C\u65F6\uFF1B\u53EF\u901A\u8FC7 DSH_FLOATING_PET_ELECTRON \u6307\u5B9A electron.exe\uFF0C\u6216\u4F7F\u7528 ~/.dsh/electron \u4E2D\u5DF2\u6709\u7684\u5171\u4EAB\u8FD0\u884C\u65F6\u3002");
}

// src/desktop-runtime.ts
import { createServer } from "node:net";
var DesktopRuntime = class {
  constructor(library, options = {}) {
    this.library = library;
    this.options = options;
    this.supported = (options.platform ?? process.platform) === "win32";
  }
  supported;
  error = "";
  child;
  starting;
  cancelStart;
  lease;
  pending = /* @__PURE__ */ new Map();
  imageKey = "";
  image;
  sequence = 0;
  closed = false;
  stopTimer;
  heartbeat;
  speechJobs = /* @__PURE__ */ new Set();
  synthesis;
  socketServer;
  socket;
  get running() {
    return !!this.child && !this.error;
  }
  send(value) {
    const child = this.child;
    const output = this.options.spawn ? child?.stdin : this.socket;
    if (!child || !output || output.destroyed) throw new Error("Desktop pet process is unavailable");
    output.write(JSON.stringify(value) + "\n");
  }
  event(type, value) {
    const stream = this.lease?.stream;
    if (stream && !stream.destroyed) stream.write(`event: ${type}
data: ${JSON.stringify(value)}

`);
  }
  start() {
    if (this.starting) return this.starting;
    if (this.options.spawn) return this.spawnHelper();
    const operation = (async () => {
      const token = randomUUID2();
      const server = createServer((socket) => {
        const reader = createInterface({ input: socket }), timeout = setTimeout(() => socket.destroy(), 3e3);
        socket.on("error", () => {
        });
        reader.once("line", (line) => {
          clearTimeout(timeout);
          let hello;
          try {
            hello = JSON.parse(line);
          } catch {
            socket.destroy();
            return;
          }
          if (hello.token !== token || this.socket || hello.pid !== this.child?.pid) {
            socket.destroy();
            return;
          }
          this.socket = socket;
          socket.once("close", () => {
            if (this.socket === socket) {
              this.socket = void 0;
              if (this.child && !this.closed) {
                this.error = "Desktop companion connection closed";
                this.stop();
              }
            }
          });
        });
      });
      this.socketServer = server;
      await new Promise((resolve3, reject) => {
        server.once("error", reject);
        server.listen(0, "127.0.0.1", resolve3);
      });
      const address = server.address();
      if (!address || typeof address === "string") throw new Error("Desktop bridge unavailable");
      return await this.spawnHelper({ DSH_FLOATING_PET_BRIDGE_PORT: String(address.port), DSH_FLOATING_PET_BRIDGE_TOKEN: token });
    })().catch((error) => {
      this.starting = void 0;
      this.socket?.destroy();
      this.socket = void 0;
      this.socketServer?.close();
      this.socketServer = void 0;
      throw error;
    });
    this.starting = operation;
    return operation;
  }
  async spawnHelper(extraEnv = {}) {
    if (this.closed) throw new Error("Desktop pet has been unloaded");
    if (this.child) return this.starting;
    this.error = "";
    const executable = this.options.spawn ? "electron-fixture" : electronPath();
    const script = fileURLToPath2(new URL("../native/electron", import.meta.url));
    const env = Object.fromEntries(Object.entries(process.env).filter(([key]) => !/^DSH_/i.test(key) && !/(?:API.?KEY|TOKEN|SECRET|PASSWORD|CREDENTIAL)/i.test(key)));
    delete env.ELECTRON_RUN_AS_NODE;
    delete env.NODE_OPTIONS;
    Object.assign(env, extraEnv);
    if (this.options.fixture) env.DSH_PET_NATIVE_TEST = "1";
    const child = (this.options.spawn ?? spawn2)(executable, [script, "--parent-pid=" + process.pid], { windowsHide: true, stdio: ["pipe", "pipe", "pipe"], env });
    this.child = child;
    let stderr = "";
    child.stderr.on("data", (chunk) => {
      stderr = (stderr + String(chunk)).slice(-4096);
    });
    child.stdin.on("error", () => {
    });
    this.starting = new Promise((resolve3, reject) => {
      let ready = false;
      const timer = setTimeout(() => {
        reject(new Error("Desktop pet startup timed out"));
        this.stop();
      }, this.options.startupTimeoutMs ?? 15e3);
      this.cancelStart = (error) => {
        clearTimeout(timer);
        if (!ready) reject(error);
      };
      const lines = createInterface({ input: child.stdout });
      lines.on("line", (line) => {
        let message;
        try {
          message = JSON.parse(line);
        } catch {
          return;
        }
        if (message.type === "ready") {
          ready = true;
          clearTimeout(timer);
          this.cancelStart = void 0;
          resolve3();
        } else if (message.type === "command" && message.command && typeof message.command === "object") void this.dispatch(message.command, typeof message.id === "string" ? message.id : void 0).catch(() => {
        });
        else if (message.type === "settings") void this.dispatch({ type: "settings" }).catch(() => {
        });
        else if (message.type === "config") void this.changeConfig(message.value).catch((error) => {
          this.error = String(error);
          this.stop();
        });
        else if (message.type === "shown" && typeof message.id === "string") this.finish(message.id);
        else if (message.type === "inspection" && typeof message.id === "string") this.finish(message.id, void 0, message);
        else if (message.type === "native-error") {
          this.error = String(message.error ?? "Desktop drawing failed");
          this.stop();
        }
      });
      const fail = (cause) => {
        if (this.child !== child) return;
        clearTimeout(timer);
        lines.close();
        this.child = void 0;
        this.starting = void 0;
        this.cancelStart = void 0;
        this.imageKey = "";
        this.image = void 0;
        this.error = String(cause ?? stderr ?? "Desktop pet exited");
        if (!ready) reject(new Error(this.error));
        for (const [id] of this.pending) this.finish(id, this.error);
        this.event("stopped", { error: this.error });
        this.clearLease();
        this.socket?.destroy();
        this.socket = void 0;
        this.socketServer?.close();
        this.socketServer = void 0;
      };
      child.once("error", fail);
      child.once("exit", () => fail(stderr || "Desktop pet exited"));
    });
    return this.starting;
  }
  async begin(owner) {
    if (!this.supported) throw new Error("Desktop pets currently require Windows");
    if (typeof owner !== "string" || !/^[a-zA-Z0-9-]{1,80}$/.test(owner)) throw new Error("Invalid desktop client");
    if (!this.library.config.desktop) throw new Error("Desktop pet is disabled");
    if (this.lease?.stream && this.lease.owner !== owner) throw new Error("Another DSH window is displaying the desktop pet");
    this.clearLease();
    const lease = { owner, token: randomUUID2() };
    this.lease = lease;
    try {
      await this.start();
    } catch (error) {
      if (this.lease === lease) this.clearLease();
      throw error;
    }
    if (this.lease !== lease) throw new Error("Desktop client was replaced during startup");
    lease.reconnect = setTimeout(() => {
      if (this.lease === lease) this.stop();
    }, this.options.reconnectMs ?? 1e4);
    return { token: lease.token };
  }
  authorized(token) {
    if (typeof token !== "string" || !this.lease || token !== this.lease.token) throw new Error("Desktop display lease has expired");
    return this.lease;
  }
  attach(token, response) {
    const lease = this.authorized(token);
    clearTimeout(lease.reconnect);
    lease.stream?.end();
    lease.stream = response;
    response.writeHead(200, { "content-type": "text/event-stream; charset=utf-8", "cache-control": "no-store", "x-content-type-options": "nosniff", "x-accel-buffering": "no" });
    response.write(": desktop pet connected\n\n");
    clearInterval(this.heartbeat);
    this.heartbeat = setInterval(() => {
      if (!response.destroyed) response.write(": heartbeat\n\n");
    }, 15e3);
    response.on("close", () => {
      if (this.lease !== lease || lease.stream !== response) return;
      lease.stream = void 0;
      clearInterval(this.heartbeat);
      lease.reconnect = setTimeout(() => {
        if (this.lease === lease && !lease.stream) this.stop();
      }, this.options.reconnectMs ?? 1e4);
    });
  }
  wait(id, timeoutMs = 3e4) {
    return new Promise((resolve3, reject) => {
      const timer = setTimeout(() => this.finish(id, "DSH did not acknowledge the desktop pet action"), timeoutMs);
      this.pending.set(id, { resolve: resolve3, reject, timer });
    });
  }
  finish(id, error, result) {
    const value = this.pending.get(id);
    if (!value) return;
    this.pending.delete(id);
    clearTimeout(value.timer);
    if (error) value.reject(new Error(error));
    else value.resolve(result);
  }
  acknowledge(token, id, error) {
    this.authorized(token);
    if (typeof id !== "string" || !this.pending.has(id)) throw new Error("Desktop action has expired");
    this.finish(id, typeof error === "string" ? error.slice(0, 2e3) : void 0);
  }
  async dispatch(command, nativeId) {
    if (!this.lease?.stream) {
      if (this.child) this.send({ type: "result", id: nativeId, ok: false, error: "DSH connection is unavailable" });
      return;
    }
    const id = randomUUID2(), finished = this.wait(id, ["voice-toggle", "call-toggle"].includes(String(command?.type)) ? 18e4 : 3e4);
    this.event("command", { id, command });
    try {
      await finished;
      this.send({ type: "result", id: nativeId ?? id, ok: true });
    } catch (error) {
      if (this.child) this.send({ type: "result", id: nativeId ?? id, ok: false, error: String(error) });
    }
  }
  async changeConfig(value) {
    if (!value || typeof value !== "object") throw new Error("Invalid desktop preference");
    const data = value;
    await this.library.update({
      ...data.visible !== void 0 ? { visible: data.visible } : {},
      ...data.desktop !== void 0 ? { desktop: data.desktop } : {},
      ...data.desktopPosition !== void 0 ? { desktopPosition: data.desktopPosition } : {}
    });
    this.event("config", {});
    if (!this.library.config.desktop) this.stop();
  }
  async publish(token, value) {
    this.authorized(token);
    if (!value || typeof value !== "object") throw new Error("Invalid desktop snapshot");
    const source = value;
    if (!source.notifications || !Array.isArray(source.notifications.items) || source.notifications.items.length > 100) throw new Error("Invalid desktop notifications");
    const sequence = ++this.sequence;
    const pet = this.library.pets.find((pet2) => pet2.id === this.library.config.selected);
    let image;
    if (pet) {
      const key = pet.url;
      if (key !== this.imageKey) {
        if (source.spriteKey !== key || typeof source.image !== "string") throw new Error("Desktop sprite revision is missing or stale");
        const bytes = Buffer.from(source.image, "base64");
        if (bytes.length > 24 * 1024 * 1024 || !bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])) || imageVersion(bytes) !== pet.version) throw new Error("Invalid desktop PNG sprite");
        image = source.image;
        if (sequence !== this.sequence) return;
        this.imageKey = key;
        this.image = image;
      }
    }
    if (sequence !== this.sequence) return;
    this.authorized(token);
    const id = randomUUID2(), painted = this.wait(id, 15e3);
    try {
      this.send({
        type: "snapshot",
        id,
        image,
        version: pet?.version ?? 1,
        config: this.library.config,
        animations: ANIMATIONS,
        language: source.language,
        theme: source.theme === "dark" ? "dark" : "light",
        notifications: source.notifications
      });
    } catch (error) {
      this.finish(id, String(error));
    }
    await painted;
  }
  clearLease() {
    clearInterval(this.heartbeat);
    if (this.lease) {
      clearTimeout(this.lease.reconnect);
      this.lease.stream?.end();
    }
    this.lease = void 0;
  }
  stop() {
    for (const job of this.speechJobs) job.abort(new Error("Desktop speech was stopped"));
    this.event("stopped", this.error ? { error: this.error } : {});
    this.clearLease();
    const child = this.child;
    this.cancelStart?.(new Error("Desktop pet stopped during startup"));
    this.cancelStart = void 0;
    this.child = void 0;
    this.starting = void 0;
    this.imageKey = "";
    this.image = void 0;
    const socket = this.socket;
    this.socket = void 0;
    socket?.end('{"type":"close"}\n');
    this.socketServer?.close();
    this.socketServer = void 0;
    for (const [id] of this.pending) this.finish(id, "Desktop pet stopped");
    if (!child) return;
    if (!child.stdin.destroyed) child.stdin.end('{"type":"close"}\n');
    const stopTimer = setTimeout(() => {
      if (child.exitCode === null) child.kill();
    }, 3e3);
    this.stopTimer = stopTimer;
    stopTimer.unref();
    child.once("exit", () => clearTimeout(stopTimer));
  }
  release(token) {
    this.authorized(token);
    this.stop();
  }
  voiceReady(token, localOnly = false) {
    this.authorized(token);
    const speech = this.options.speech?.();
    if (!speech) throw new Error("\u8BF7\u5148\u5728 DSH \u4E2D\u542F\u7528\u8BED\u97F3\u8F93\u5165\u63D2\u4EF6");
    const state = speech.snapshot(), provider = state.providers.find((provider2) => provider2.id === state.selection.providerId);
    if (!provider) throw new Error("\u5F53\u524D\u8BED\u97F3\u8BC6\u522B\u5668\u4E0D\u53EF\u7528\uFF0C\u8BF7\u5728 DSH \u8BED\u97F3\u8BBE\u7F6E\u4E2D\u9009\u62E9\u53EF\u7528\u7684\u8BC6\u522B\u5668");
    if (localOnly && provider.location !== "host-local") throw new Error("\u672C\u5730\u901A\u8BDD\u9700\u8981\u5728 DSH \u8BED\u97F3\u8BBE\u7F6E\u4E2D\u9009\u62E9\u672C\u5730\u8BC6\u522B\u5668\uFF08SenseVoice\uFF09");
    const preparation = provider.preparation;
    if (preparation && !["ready", "standby", "waking"].includes(preparation.phase)) {
      if (preparation.phase === "failed") throw new Error("\u8BED\u97F3\u8BC6\u522B\u51C6\u5907\u5931\u8D25\uFF1A" + (preparation.message?.slice(0, 1e3) || "\u8BF7\u67E5\u770B DSH \u8BED\u97F3\u8BBE\u7F6E\u4E2D\u7684\u9519\u8BEF\u8BE6\u60C5"));
      if (["checking", "loading", "downloading", "cancelling"].includes(preparation.phase)) throw new Error({ checking: "\u8BED\u97F3\u8BC6\u522B\u6B63\u5728\u68C0\u67E5\u672C\u5730\u8D44\u6E90\uFF0C\u8BF7\u7A0D\u5019", loading: "\u8BED\u97F3\u8BC6\u522B\u6B63\u5728\u52A0\u8F7D\u6A21\u578B\uFF0C\u8BF7\u7A0D\u5019", downloading: "\u8BED\u97F3\u8BC6\u522B\u6B63\u5728\u4E0B\u8F7D\u6A21\u578B\uFF0C\u8BF7\u7A0D\u5019", cancelling: "\u8BED\u97F3\u6A21\u578B\u51C6\u5907\u6B63\u5728\u53D6\u6D88\uFF0C\u8BF7\u7A0D\u5019" }[preparation.phase]);
      throw new Error("\u8BED\u97F3\u8BC6\u522B\u6A21\u578B\u5C1A\u672A\u51C6\u5907\uFF0C\u8BF7\u5728 DSH \u8BED\u97F3\u8BBE\u7F6E\u4E2D\u51C6\u5907\u8BC6\u522B\u6A21\u578B");
    }
    return speech;
  }
  async transcribe(token, encoded, caller, localOnly = false) {
    const speech = this.voiceReady(token, localOnly);
    if (typeof encoded !== "string" || encoded.length > Math.ceil(4 * 1024 * 1024 / 3) * 4) throw new Error("\u5F55\u97F3\u8FC7\u5927");
    const audio = Buffer.from(encoded, "base64");
    if (audio.toString("base64") !== encoded || audio.length < 46 || audio.toString("ascii", 0, 4) !== "RIFF" || audio.toString("ascii", 8, 12) !== "WAVE" || audio.toString("ascii", 36, 40) !== "data" || audio.readUInt16LE(20) !== 1 || audio.readUInt16LE(22) !== 1 || audio.readUInt16LE(34) !== 16 || audio.readUInt32LE(40) !== audio.length - 44 || audio.readUInt32LE(24) < 8e3 || audio.readUInt32LE(24) > 48e3 || (audio.length - 44) / 2 / audio.readUInt32LE(24) > 120) throw new Error("\u65E0\u6548\u7684\u5F55\u97F3");
    const controller = new AbortController();
    this.speechJobs.add(controller);
    try {
      return await speech.transcribe(speech.resolve({ audio }), AbortSignal.any([caller, controller.signal]));
    } finally {
      this.speechJobs.delete(controller);
    }
  }
  voices() {
    if (!this.options.output) throw new Error("\u7CFB\u7EDF\u8BED\u97F3\u8F93\u51FA\u4E0D\u53EF\u7528");
    return this.options.output.voices();
  }
  async synthesize(token, value, caller) {
    this.authorized(token);
    if (!this.options.output) throw new Error("\u7CFB\u7EDF\u8BED\u97F3\u8F93\u51FA\u4E0D\u53EF\u7528");
    if (typeof value.text !== "string") throw new Error("\u8BED\u97F3\u8F93\u51FA\u6587\u5B57\u65E0\u6548");
    caller.throwIfAborted();
    this.synthesis?.abort(new Error("\u8BED\u97F3\u56DE\u590D\u5DF2\u88AB\u66F4\u65B0"));
    const controller = new AbortController();
    this.speechJobs.add(controller);
    this.synthesis = controller;
    try {
      const bytes = await this.options.output.synthesize(value.text, this.library.config.callVoice ?? "", this.library.config.callRate ?? 0, value.language === "en" ? "en" : "zh", AbortSignal.any([caller, controller.signal]));
      return { audioBase64: bytes.toString("base64") };
    } finally {
      this.speechJobs.delete(controller);
      if (this.synthesis === controller) this.synthesis = void 0;
    }
  }
  callState(token, value) {
    this.authorized(token);
    if (!value || typeof value !== "object") throw new Error("\u901A\u8BDD\u72B6\u6001\u65E0\u6548");
    const source = value;
    if (!["off", "starting", "listening", "recognizing", "working", "preparing-audio", "speaking", "muted", "error"].includes(String(source.phase))) throw new Error("\u901A\u8BDD\u72B6\u6001\u65E0\u6548");
    const short = (key, limit) => typeof source[key] === "string" ? source[key].slice(0, limit) : "";
    this.send({ type: "call-state", value: { phase: source.phase, active: source.active === true, muted: source.muted === true, title: short("title", 160), sessionId: short("sessionId", 100) || null, heard: short("heard", 500), said: short("said", 500), error: short("error", 1e3), level: typeof source.level === "number" && Number.isFinite(source.level) ? Math.max(0, Math.min(1, source.level)) : 0 } });
  }
  composer(token, value) {
    this.authorized(token);
    if (!value || typeof value !== "object") throw new Error("Invalid composer update");
    const data = value;
    this.send({ type: "composer", text: typeof data.text === "string" ? data.text.slice(0, 1e4) : "", error: typeof data.error === "string" ? data.error.slice(0, 2e3) : "", state: ["idle", "recording", "processing"].includes(String(data.state)) ? data.state : "idle" });
  }
  /** Internal diagnostics only; captures this helper's own sprite, never the desktop. */
  async inspect() {
    const id = randomUUID2(), result = this.wait(id, 5e3);
    try {
      this.send({ type: "inspect", id });
    } catch (error) {
      this.finish(id, String(error));
    }
    return await result;
  }
  dispose() {
    if (this.closed) return;
    this.closed = true;
    this.stop();
  }
};

// src/local-speech.ts
import { spawn as spawn3 } from "node:child_process";
import { join as join3 } from "node:path";
import { fileURLToPath as fileURLToPath3 } from "node:url";
var WindowsSpeech = class {
  constructor(platform = process.platform, launch = spawn3) {
    this.platform = platform;
    this.launch = launch;
  }
  jobs = /* @__PURE__ */ new Set();
  catalog;
  tail = Promise.resolve();
  disposed = false;
  run(mode, input, signal) {
    if (this.platform !== "win32") return Promise.reject(new Error("\u672C\u5730\u901A\u8BDD\u8BED\u97F3\u8F93\u51FA\u5F53\u524D\u652F\u6301 Windows"));
    if (this.disposed) return Promise.reject(new Error("\u7CFB\u7EDF\u8BED\u97F3\u670D\u52A1\u5DF2\u5173\u95ED"));
    signal.throwIfAborted();
    const controller = new AbortController();
    this.jobs.add(controller);
    const previous = this.tail;
    let release;
    this.tail = new Promise((resolve3) => {
      release = resolve3;
    });
    return new Promise((resolve3, reject) => {
      const combined = AbortSignal.any([signal, controller.signal]);
      let output = "", settled = false, child, timer;
      const abort = () => finish(new Error("\u8BED\u97F3\u8F93\u51FA\u5DF2\u53D6\u6D88"));
      function finish(error) {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        combined.removeEventListener("abort", abort);
        if (error) {
          child?.kill();
          reject(error);
        } else resolve3(output);
      }
      combined.addEventListener("abort", abort, { once: true });
      if (combined.aborted) abort();
      void previous.then(() => {
        if (settled) {
          release();
          return;
        }
        try {
          child = this.launch(join3(process.env.SystemRoot || "C:/Windows", "System32/WindowsPowerShell/v1.0/powershell.exe"), ["-NoProfile", "-NonInteractive", "-STA", "-ExecutionPolicy", "Bypass", "-File", fileURLToPath3(new URL("../native/voice/speech.ps1", import.meta.url)), "-Mode", mode], { windowsHide: true, stdio: ["pipe", "pipe", "pipe"] });
          timer = setTimeout(() => finish(new Error("\u7CFB\u7EDF\u8BED\u97F3\u5408\u6210\u8D85\u65F6")), 2e4);
          child.stdout.setEncoding("utf8");
          child.stdout.on("data", (part) => {
            output += part;
            if (output.length > 6 * 1024 * 1024) finish(new Error("\u7CFB\u7EDF\u8BED\u97F3\u8F93\u51FA\u8FC7\u5927"));
          });
          child.stderr.resume();
          child.stdin.on("error", () => {
          });
          child.on("error", () => finish(new Error("\u65E0\u6CD5\u542F\u52A8 Windows \u7CFB\u7EDF\u8BED\u97F3")));
          child.once("close", (code) => {
            finish(code === 0 ? void 0 : new Error("Windows \u7CFB\u7EDF\u8BED\u97F3\u5931\u8D25\uFF0C\u8BF7\u68C0\u67E5\u6240\u9009\u58F0\u97F3\u662F\u5426\u53EF\u7528"));
            release();
          });
          child.stdin.end(input ? JSON.stringify(input) : "");
        } catch {
          finish(new Error("\u65E0\u6CD5\u542F\u52A8 Windows \u7CFB\u7EDF\u8BED\u97F3"));
          release();
        }
      });
    }).finally(() => this.jobs.delete(controller));
  }
  voices() {
    return this.catalog ??= this.run("voices", null, new AbortController().signal).then((text) => {
      const list = JSON.parse(text);
      if (!Array.isArray(list) || list.some((voice) => !voice || typeof voice.name !== "string" || typeof voice.language !== "string")) throw new Error("\u7CFB\u7EDF\u58F0\u97F3\u5217\u8868\u65E0\u6548");
      return list;
    }).catch((error) => {
      this.catalog = void 0;
      throw error;
    });
  }
  async synthesize(text, voice, rate, language, signal) {
    if (typeof text !== "string" || !text.trim() || text.length > 500 || typeof voice !== "string" || voice.length > 160 || !Number.isInteger(rate) || rate < -5 || rate > 5 || !["zh", "en"].includes(language)) throw new Error("\u8BED\u97F3\u8F93\u51FA\u53C2\u6570\u65E0\u6548");
    const base64 = await this.run("synthesize", { text, voice, rate, language }, signal), bytes = Buffer.from(base64, "base64");
    if (bytes.length < 44 || bytes.length > 4 * 1024 * 1024 || bytes.toString("base64") !== base64 || bytes.toString("ascii", 0, 4) !== "RIFF" || bytes.toString("ascii", 8, 12) !== "WAVE") throw new Error("\u7CFB\u7EDF\u8BED\u97F3\u97F3\u9891\u65E0\u6548");
    return bytes;
  }
  dispose() {
    this.disposed = true;
    for (const job of this.jobs) job.abort();
    this.jobs.clear();
  }
};

// src/index.ts
var name = "very12345-codex-pet";
var inject = ["webServer"];
var packageRoot = fileURLToPath4(new URL("../", import.meta.url));
function json2(res, status2, data) {
  res.writeHead(status2, {
    "content-type": "application/json; charset=utf-8",
    "cache-control": "no-store",
    "x-content-type-options": "nosniff"
  });
  res.end(JSON.stringify(data));
}
function trustedWrite(req) {
  if (req.headers["x-dsh-pet"] !== "1" || !req.headers["content-type"]?.startsWith("application/json"))
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
async function body(req, limit = 16384) {
  let size = 0;
  const chunks = [];
  for await (const chunk of req) {
    size += chunk.length;
    if (size > limit) throw new Error("\u8BF7\u6C42\u8FC7\u5927");
    chunks.push(Buffer.from(chunk));
  }
  const value = JSON.parse(Buffer.concat(chunks).toString("utf8"));
  if (!value || typeof value !== "object" || Array.isArray(value))
    throw new Error("\u8BF7\u6C42\u5FC5\u987B\u662F JSON \u5BF9\u8C61");
  return value;
}
async function createHost(options = {}) {
  const root = options.root ?? packageRoot;
  const library = new PetLibrary(
    join4(root, "assets", "codex"),
    options.dataRoot,
    options.skillRoot
  );
  await library.init();
  const output = options.output ?? new WindowsSpeech();
  const desktop = new DesktopRuntime(library, { speech: options.speech, output, fixture: options.fixture });
  let updateHandler;
  registerPluginUpdater(
    {
      logger: {
        warn: (message) => console.warn("[dsh-codex-pet]", message)
      },
      webServer: {
        register(route) {
          updateHandler = route.handler;
          return () => {
            updateHandler = void 0;
          };
        }
      }
    },
    {
      endpoint: `${BASE}/api/update`,
      packageName: "@very12345/dsh-codex-pet",
      manifestUrl: new URL("../package.json", import.meta.url)
    }
  );
  const snapshot = () => ({
    ...library.snapshot(),
    desktopSupported: desktop.supported,
    desktopError: desktop.error,
    creationAvailable: false,
    creation: null
  });
  const handler = async (req, res) => {
    try {
      const authority = new URL(`http://${req.headers.host ?? ""}`);
      if (!["localhost", "127.0.0.1", "[::1]"].includes(
        authority.hostname
      )) {
        json2(res, 403, { error: "\u4E0D\u53D7\u4FE1\u4EFB\u7684 Host" });
        return;
      }
      const url = new URL(req.url ?? "/", authority);
      const path = url.pathname;
      if (path.startsWith(`${BASE}/api/desktop/`)) {
        if (req.socket.remoteAddress && !["127.0.0.1", "::1", "::ffff:127.0.0.1"].includes(req.socket.remoteAddress)) throw new Error("\u684C\u9762\u5BA0\u7269\u53EA\u5141\u8BB8\u672C\u673A\u8FDE\u63A5");
        if (req.method === "GET" && path === `${BASE}/api/desktop/events`) {
          if (req.headers["sec-fetch-site"] === "cross-site") throw new Error("\u8BF7\u6C42\u6765\u6E90\u6821\u9A8C\u5931\u8D25");
          desktop.attach(url.searchParams.get("token"), res);
          return;
        }
        if (req.method === "GET" && path === `${BASE}/api/desktop/tts-voices`) {
          json2(res, 200, { voices: await desktop.voices() });
          return;
        }
        if (req.method !== "POST") {
          json2(res, 405, { error: "\u65B9\u6CD5\u4E0D\u652F\u6301" });
          return;
        }
        if (!trustedWrite(req)) {
          json2(res, 403, { error: "\u8BF7\u6C42\u6765\u6E90\u6821\u9A8C\u5931\u8D25" });
          return;
        }
        const value2 = await body(req, path === `${BASE}/api/desktop/snapshot` ? 32 * 1024 * 1024 : path === `${BASE}/api/desktop/transcribe` ? 6 * 1024 * 1024 : 512 * 1024);
        if (path === `${BASE}/api/desktop/begin`) {
          json2(res, 200, await desktop.begin(value2.owner));
          return;
        }
        if (path === `${BASE}/api/desktop/snapshot`) await desktop.publish(value2.token, value2.snapshot);
        else if (path === `${BASE}/api/desktop/ack`) desktop.acknowledge(value2.token, value2.id, value2.error);
        else if (path === `${BASE}/api/desktop/end`) desktop.release(value2.token);
        else if (path === `${BASE}/api/desktop/voice-ready`) desktop.voiceReady(value2.token, value2.localOnly === true);
        else if (path === `${BASE}/api/desktop/composer`) desktop.composer(value2.token, value2.value);
        else if (path === `${BASE}/api/desktop/call-state`) desktop.callState(value2.token, value2.value);
        else if (path === `${BASE}/api/desktop/tts`) {
          const controller = new AbortController();
          res.once("close", () => {
            if (!res.writableEnded) controller.abort();
          });
          json2(res, 200, await desktop.synthesize(value2.token, value2, controller.signal));
          return;
        } else if (path === `${BASE}/api/desktop/transcribe`) {
          const controller = new AbortController();
          res.once("close", () => {
            if (!res.writableEnded) controller.abort();
          });
          json2(res, 200, await desktop.transcribe(value2.token, value2.audioBase64, controller.signal, value2.localOnly === true));
          return;
        } else {
          json2(res, 404, { error: "\u672A\u77E5\u64CD\u4F5C" });
          return;
        }
        json2(res, 200, {});
        return;
      }
      if (path === `${BASE}/api/update` && updateHandler) {
        await updateHandler(req, res);
        return;
      }
      if (req.method === "GET" && path === `${BASE}/api/state`) {
        json2(res, 200, snapshot());
        return;
      }
      if (req.method === "GET" && path.startsWith(`${BASE}/asset/`)) {
        const bytes = await library.asset(
          decodeURIComponent(path.slice(`${BASE}/asset/`.length))
        );
        const png = bytes[0] === 137;
        res.writeHead(200, {
          "content-type": png ? "image/png" : "image/webp",
          "cache-control": "no-cache",
          "x-content-type-options": "nosniff"
        });
        res.end(bytes);
        return;
      }
      if (!path.startsWith(`${BASE}/api/`)) {
        json2(res, 404, { error: "\u672A\u627E\u5230\u8D44\u6E90" });
        return;
      }
      if (req.method !== "POST") {
        json2(res, 405, { error: "\u65B9\u6CD5\u4E0D\u652F\u6301" });
        return;
      }
      if (!trustedWrite(req)) {
        json2(res, 403, { error: "\u8BF7\u6C42\u6765\u6E90\u6821\u9A8C\u5931\u8D25" });
        return;
      }
      const value = await body(req);
      if (path === `${BASE}/api/config`) {
        await library.update(value);
        if (!library.config.desktop) desktop.stop();
      } else if (path === `${BASE}/api/refresh`) await library.refresh();
      else if (path === `${BASE}/api/create`) {
        throw new Error("\u8BF7\u4ECE DSH \u5BA0\u7269\u8BBE\u7F6E\u53D1\u8D77\u521B\u5EFA\u4F1A\u8BDD");
      } else if (path === `${BASE}/api/open-folder`) {
        if (req.socket.remoteAddress && !["127.0.0.1", "::1", "::ffff:127.0.0.1"].includes(
          req.socket.remoteAddress
        ))
          throw new Error("\u53EA\u80FD\u5728\u8FD0\u884C DSH \u7684\u672C\u673A\u6253\u5F00\u6587\u4EF6\u5939");
        await mkdir2(library.customPath, { recursive: true });
        if (process.platform === "win32") {
          const powershell = join4(
            process.env.SystemRoot ?? "C:\\Windows",
            "System32",
            "WindowsPowerShell",
            "v1.0",
            "powershell.exe"
          );
          const script = `$ErrorActionPreference = "Stop"; Start-Process -FilePath explorer.exe -ArgumentList ('"' + $env:DSH_PET_OPEN_DIRECTORY + '"') -WindowStyle Normal`;
          await new Promise((resolve3, reject) => {
            execFile(
              powershell,
              [
                "-NoProfile",
                "-NonInteractive",
                "-Command",
                script
              ],
              {
                windowsHide: true,
                timeout: 1e4,
                env: {
                  ...process.env,
                  DSH_PET_OPEN_DIRECTORY: library.customPath
                }
              },
              (error) => error ? reject(
                new Error(
                  `\u6253\u5F00\u6587\u4EF6\u5939\u5931\u8D25\uFF1A${error.message}`
                )
              ) : resolve3()
            );
          });
        } else {
          const command = process.platform === "darwin" ? "open" : "xdg-open";
          await new Promise((resolve3, reject) => {
            const child = spawn4(command, [library.customPath], {
              shell: false,
              stdio: "ignore"
            });
            child.once("error", reject);
            child.once("spawn", () => {
              child.unref();
              resolve3();
            });
          });
        }
      } else {
        json2(res, 404, { error: "\u672A\u77E5\u64CD\u4F5C" });
        return;
      }
      json2(res, 200, snapshot());
    } catch (error) {
      if (res.headersSent) res.end();
      else
        json2(res, 400, {
          error: error instanceof Error ? error.message : "\u64CD\u4F5C\u5931\u8D25"
        });
    }
  };
  return { handler, library, desktop, dispose: () => {
    desktop.dispose();
    output.dispose();
  } };
}
function apply(ctx) {
  ctx.effect(() => {
    let disposed = false, remove, host;
    void createHost({ speech: () => ctx.get("speechToText") }).then((value) => {
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
        }
      });
    }).catch(
      (error) => console.error("[dsh-codex-pet] \u521D\u59CB\u5316\u5931\u8D25", error)
    );
    return () => {
      disposed = true;
      remove?.();
      host?.dispose();
    };
  });
}
export {
  apply,
  createHost,
  inject,
  json2 as json,
  name,
  trustedWrite
};
