import test from 'node:test';import assert from 'node:assert/strict';
import {VoiceDialogue,dialogueInput,type DialogueInput,type VoiceModelRequest,type VoiceModelServices} from '../src/voice-dialogue.ts';
import type {GenerateOptions} from '@deepseek-ai/dsh-llm';
const task={sessionId:'owned',title:'工程',running:false,waiting:false,error:null,reply:'',replyKey:'',stamp:'1'};
function fixture(){
 const requests:VoiceModelRequest[]=[];let response={action:'reply',reply:'我在，有什么想聊的？'},finish='stop';
 const services:VoiceModelServices={defaults:{currentSelection:()=>({provider:'default',model:'default-model'})},sessions:{async projections(){return {values:{modelSelection:{next:{provider:'configured',model:'selected-model'},lastUsed:{provider:'old',model:'old-model'}}}};}},llm:{async *stream(request){requests.push(request);const sdkRequest:GenerateOptions={...request,sessionId:request.sessionId as GenerateOptions['sessionId']};assert.equal(sdkRequest.tools?.length,0);yield {type:'text-delta',index:0,text:JSON.stringify(response)};yield {type:'finish',reason:{kind:finish}};}}};
 return {dialogue:new VoiceDialogue(()=>services),services,requests,reply(action:string,reply:string){response={action,reply};},finish(value:string){finish=value;}};
}
test('spoken conversation uses the selected DSH model without tools, keeps short follow-up context, and has a separate cursor',async t=>{
 const x=fixture();t.after(()=>x.dialogue.dispose());await x.dialogue.ready(task,new AbortController().signal);const first=await x.dialogue.respond({mode:'utterance',text:'你好',task},new AbortController().signal);assert.equal(first.action,'reply');assert.equal(x.requests[0].provider,'configured');assert.equal(x.requests[0].model,'selected-model');assert.notEqual(x.requests[0].sessionId,task.sessionId);assert.ok(x.requests[0].system.includes('NO tools'));
 x.reply('reply','刚才是在问你想聊些什么。');await x.dialogue.respond({mode:'utterance',text:'你刚才说什么',task},new AbortController().signal);const messages=x.requests[1].messages;assert.deepEqual(messages.slice(0,1),x.requests[0].messages);assert.equal(messages[1].role,'assistant');assert.equal(JSON.parse(messages[1].content[0].text).reply,first.reply);const input=JSON.parse(messages.at(-1)!.content[0].text);assert.equal(input.user,'你刚才说什么');assert.equal(input.history,undefined);assert.equal(x.requests[1].sessionId,x.requests[0].sessionId);
});
test('spoken task results receive the useful facts after long directory listings instead of a truncated preview',async t=>{
 const x=fixture();t.after(()=>x.dialogue.dispose());x.reply('reply','改动已经保存，不过检查没有通过，缺少一项依赖。');const reply='## 文件列表\n'+('very-long-directory-name/another-file-name.ts\n'.repeat(80))+'\n检查失败：缺少依赖，尚未通过验证。';
 const result=await x.dialogue.respond({mode:'result',task:{...task,reply}},new AbortController().signal);assert.ok(JSON.parse(x.requests[0].messages[0].content[0].text).task.reply.endsWith('尚未通过验证。'));assert.ok(result.reply.includes('没有通过'));assert.ok(!result.reply.includes('directory'));
});
test('clarification context accompanies delegation while task-result responses cannot request actions',async t=>{
 const x=fixture();t.after(()=>x.dialogue.dispose());x.reply('clarify','你想处理哪个项目？');await x.dialogue.respond({mode:'utterance',text:'帮我整理一下',task},new AbortController().signal);
 x.reply('delegate','我来帮你处理。');const result=await x.dialogue.respond({mode:'utterance',text:'当前项目',task},new AbortController().signal);assert.ok(result.context?.includes('帮我整理一下'));assert.ok(result.context?.includes('哪个项目'));
 await assert.rejects(x.dialogue.respond({mode:'result',task},new AbortController().signal),/不能启动任务/);
});
test('missing or closed session models do not silently switch to another route',async t=>{
 const x=fixture();t.after(()=>x.dialogue.dispose());x.services.sessions={async projections(){return null;}};await assert.rejects(x.dialogue.ready(task,new AbortController().signal),/关闭/);assert.equal(x.requests.length,0);
 await x.dialogue.ready({...task,sessionId:null},new AbortController().signal);await x.dialogue.respond({mode:'utterance',text:'你好',task:{...task,sessionId:null}},new AbortController().signal);assert.equal(x.requests[0].provider,'default');
});
test('speech refuses technical identifiers, tools, malformed and incomplete model output without repairing or replaying',async t=>{
 const x=fixture();t.after(()=>x.dialogue.dispose());for(const reply of ['文件在 /home/owner/extremely-long-project-folder/file.ts。','目录是 08c153dd-9c72-41dc-ba62-626aa0f06cb6。','修改了 package.json。','这个是 dsh-webagent-integration。']){x.reply('reply',reply);await assert.rejects(x.dialogue.respond({mode:'result',task},new AbortController().signal),/技术细节/);}
 x.reply('reply','没有完成，还需要检查。');x.finish('max-tokens');await assert.rejects(x.dialogue.respond({mode:'result',task},new AbortController().signal),/未完成/);assert.equal(x.requests.length,5);
});
test('hangup cancels in-flight dialogue and forgets ephemeral history',async()=>{
 const x=fixture();let signal!:AbortSignal;x.services.llm={async *stream(request){signal=request.signal;await new Promise<void>((_,reject)=>request.signal.addEventListener('abort',()=>reject(new Error('cancelled')),{once:true}));}};
 const pending=x.dialogue.respond({mode:'utterance',text:'你好',task},new AbortController().signal),failed=assert.rejects(pending,/cancelled/);await new Promise(resolve=>setImmediate(resolve));x.dialogue.dispose();await failed;assert.equal(signal.aborted,true);await assert.rejects(x.dialogue.respond({mode:'utterance',text:'迟到',task},new AbortController().signal));
});
test('dialogue request admission bounds raw task output and does not accept client-supplied tools',()=>{
 const input:DialogueInput={mode:'utterance',text:'你好',task};assert.deepEqual(dialogueInput(input as unknown as Record<string,unknown>).text,'你好');assert.throws(()=>dialogueInput({...input,task:{...task,reply:'x'.repeat(16001)}}),/状态无效/);assert.throws(()=>dialogueInput({...input,text:''}),/过长或为空/);
});
test('cancelled queued dialogue cannot release the active model slot or enter spoken history',async t=>{
 const x=fixture();t.after(()=>x.dialogue.dispose());let begin!:()=>void,calls=0;x.services.llm={async *stream(){calls++;if(calls===1)await new Promise<void>(resolve=>{begin=resolve;});yield {type:'text-delta',text:JSON.stringify({action:'reply',reply:'我在。'})};yield {type:'finish',reason:{kind:'stop'}};}};
 const first=x.dialogue.respond({mode:'utterance',text:'第一句',task},new AbortController().signal);await new Promise(resolve=>setImmediate(resolve));const queued=new AbortController(),second=x.dialogue.respond({mode:'utterance',text:'已取消',task},queued.signal),failed=assert.rejects(second,/取消/);const third=x.dialogue.respond({mode:'utterance',text:'最后一句',task},new AbortController().signal);queued.abort();await failed;await new Promise(resolve=>setImmediate(resolve));assert.equal(calls,1);begin();await Promise.all([first,third]);assert.equal(calls,2);
});
test('cancelled task outcome reaches the spoken model alongside partial plans, without claiming completion',async t=>{
 const x=fixture();t.after(()=>x.dialogue.dispose());x.reply('reply','刚才已经停下来了，还没有完成。');const result=await x.dialogue.respond({mode:'result',task:{...task,outcome:'cancelled',reply:'我准备修改项目。'}},new AbortController().signal);assert.equal(JSON.parse(x.requests[0].messages[0].content[0].text).task.outcome,'cancelled');assert.equal(result.reply,'刚才已经停下来了，还没有完成。');assert.ok(x.requests[0].system.includes('cancelled task is not successful'));
});
test('unchanged task output is referenced from the existing exchange rather than copied into every new message',async t=>{
 const x=fixture();t.after(()=>x.dialogue.dispose());const current={...task,reply:'文件已保存，但测试尚未通过。'};
 await x.dialogue.respond({mode:'result',task:current},new AbortController().signal);await x.dialogue.respond({mode:'utterance',text:'下一步呢',task:current},new AbortController().signal);
 const first=JSON.parse(x.requests[0].messages[0].content[0].text),next=JSON.parse(x.requests[1].messages.at(-1)!.content[0].text);assert.equal(first.task.reply,current.reply);assert.equal(next.task.reply,undefined);assert.equal(next.task.replyUnchanged,true);assert.deepEqual(x.requests[1].messages[0],x.requests[0].messages[0]);
});
test('bounded model history resets browser affinity when pruning and does not lose the latest task facts',async t=>{
 const x=fixture();t.after(()=>x.dialogue.dispose());for(let i=0;i<14;i++)await x.dialogue.respond({mode:'utterance',text:'问候'+i,task},new AbortController().signal);
 assert.ok(x.requests.every(request=>request.messages.length<=25));assert.notEqual(x.requests[13].sessionId,x.requests[0].sessionId);assert.equal(JSON.parse(x.requests[13].messages.at(-1)!.content[0].text).task.reply,'');
 const long=fixture();t.after(()=>long.dialogue.dispose());for(let i=0;i<6;i++)await long.dialogue.respond({mode:'result',task:{...task,reply:'事实'+i+'x'.repeat(12000)}},new AbortController().signal);assert.ok(long.requests.every(request=>JSON.stringify(request.messages).length<50000));assert.ok(new Set(long.requests.map(request=>request.sessionId)).size>1);
});
