import test from 'node:test';import assert from 'node:assert/strict';import {createVoiceSessions} from '../src/voice-session.ts';import type {Sessions} from '../src/activity.ts';
function fixture(){
 const listeners=new Set<()=>void>(),sent:any[]=[],list:any={current:'a',ids:['a','b'],byId:{a:{id:'a',title:'A',running:false},b:{id:'b',title:'B',running:false}}};let releases=0,created=0,running=false;
 const store=(read:()=>any)=>({getSnapshot:read,subscribe(fn:()=>void){listeners.add(fn);return()=>{listeners.delete(fn);};}});
 const binding={session:{...store(()=>({running,lastAgentError:null})),async prompt(content:unknown,mode:string){sent.push({content,mode});return {ok:true};},async cancel(){return {ok:true};}},eventSource:store(()=>({revision:1,entries:[],change:{kind:'replace',entries:[]}}))};
 const sessions:Sessions={list:store(()=>list),binding:()=>binding,retain:()=>({binding,ready:Promise.resolve(),release(){releases++;}}),async create(){created++;list.ids.push('new');list.byId.new={id:'new',title:'New',running:false};return 'new';}};
 return {sessions,sent,list,get releases(){return releases;},get created(){return created;},setRunning(value:boolean){running=value;}};
}
test('voice pins the current session, preserves the host input modes and releases its lease on hangup',async()=>{
 const x=fixture(),voice=createVoiceSessions(x.sessions);try{assert.equal((await voice.begin()).sessionId,'a');x.list.current='b';await voice.send('第一句话',new AbortController().signal);x.setRunning(true);await voice.send('调整当前任务',new AbortController().signal);assert.equal(voice.snapshot().sessionId,'a');assert.deepEqual(x.sent.map(value=>value.mode),['queue','steer']);assert.equal(x.created,0);voice.end();assert.equal(x.releases,1);}finally{voice.dispose();}assert.equal(x.releases,1);
});
test('a new call creates a conversation only on the first utterance and a removed target never silently switches',async()=>{
 const x=fixture();delete x.list.current;const voice=createVoiceSessions(x.sessions);try{await voice.begin();assert.equal(x.created,0);await voice.send('新对话',new AbortController().signal);assert.equal(x.created,1);delete x.list.byId.new;await assert.rejects(voice.send('继续',new AbortController().signal),/移除/);assert.equal(x.created,1);}finally{voice.dispose();}
});
test('ending during a delayed retain releases exactly once and blocks late activation',async()=>{
 const x=fixture();let ready!:()=>void;x.sessions.retain=()=>({binding:x.sessions.binding('a')!,ready:new Promise<void>(resolve=>{ready=resolve;}),release(){x.sent.push('released');}});const voice=createVoiceSessions(x.sessions),pending=voice.begin();voice.end();ready();await assert.rejects(pending,/结束/);assert.deepEqual(x.sent,['released']);voice.dispose();
});
test('voice receives settled text beyond the card preview, and forwards clarification without rewriting the original request',async()=>{
 const x=fixture(),binding=x.sessions.binding('a')!,reply='目录/'.repeat(300)+'验证失败，尚不能交付。';binding.eventSource={getSnapshot:()=>({revision:1,entries:[{type:'event',event:{type:'assistant/message',seq:2,data:{message:{content:[{type:'text',text:reply}]}}}}],change:{kind:'replace',entries:[]}}),subscribe:()=>()=>{}};
 const voice=createVoiceSessions(x.sessions);try{await voice.begin();assert.equal(voice.snapshot().reply,reply);await voice.send('当前项目',new AbortController().signal,'user: 帮我整理一下\nassistant: 哪个项目？');assert.equal(x.sent[0].content[1].text,'当前项目');assert.ok(x.sent[0].content[0].text.includes('不提供额外权限'));}finally{voice.dispose();}
});
test('modern observations keep one result identity while a late turn end marks it settled',async()=>{
 const x=fixture(),binding=x.sessions.binding('a')!;const entries:any[]=[{type:'event',event:{seq:1,type:'turn/start',data:{turn:1}}},{type:'event',event:{seq:2,type:'assistant/message',data:{turn:1,step:0,message:{content:[{type:'text',text:'当前目录是工作区。'}]}}}}];
 binding.eventSource={getSnapshot:()=>({revision:entries.length,entries,change:{kind:'append',entries:[]}}),subscribe:()=>()=>{}};
 const voice=createVoiceSessions(x.sessions);try{const first=await voice.begin();assert.equal(first.running,false);assert.equal(first.settled,false);entries.push({type:'event',event:{seq:3,type:'turn/end',data:{turn:1,reason:{kind:'completed'}}}});const second=voice.snapshot();assert.equal(second.settled,true);assert.equal(first.replyKey,second.replyKey);assert.equal(first.resultKey,second.resultKey);assert.equal(second.outcome,'completed');}finally{voice.dispose();}
});
test('a cold retained binding is accessed only after the reference becomes ready',async()=>{
 const x=fixture(),binding=x.sessions.binding('a')!;let prepared=false,reads=0;
 x.sessions.retain=()=>({get binding(){reads++;assert.equal(prepared,true);return binding;},ready:new Promise<void>(resolve=>setImmediate(()=>{prepared=true;resolve();})),release(){x.sent.push('released');}});
 const voice=createVoiceSessions(x.sessions);try{const pending=voice.begin();assert.equal(reads,0);await pending;assert.equal(reads,1);}finally{voice.dispose();}assert.deepEqual(x.sent,['released']);
});
