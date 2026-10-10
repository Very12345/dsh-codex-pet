import test from 'node:test';import assert from 'node:assert/strict';import {createVoiceSessions} from '../src/voice-session.ts';import type {Sessions} from '../src/activity.ts';
function fixture(){
 const listeners=new Set<()=>void>(),sent:any[]=[],list:any={current:'a',ids:['a','b'],byId:{a:{id:'a',title:'A',running:false},b:{id:'b',title:'B',running:false}}};let releases=0,created=0,running=false;
 const store=(read:()=>any)=>({getSnapshot:read,subscribe(fn:()=>void){listeners.add(fn);return()=>{listeners.delete(fn);};}});
 const binding={session:{...store(()=>({running,lastAgentError:null})),async prompt(content:unknown,mode:string){sent.push({content,mode});return {ok:true};},async cancel(){return {ok:true};}},eventSource:store(()=>({revision:1,entries:[],change:{kind:'replace',entries:[]}}))};
 const sessions:Sessions={list:store(()=>list),binding:()=>binding,retain:()=>({binding,ready:Promise.resolve(),release(){releases++;}}),async create(){created++;const id=created===1?'new':'new-'+created;list.ids.push(id);list.byId[id]={id,title:'New',running:false};return id;}};
 return {sessions,sent,list,get releases(){return releases;},get created(){return created;},setRunning(value:boolean){running=value;}};
}
test('voice pins an explicitly requested session, preserves the host input modes and releases its lease on hangup',async()=>{
 const x=fixture(),voice=createVoiceSessions(x.sessions);try{assert.equal((await voice.begin('a')).sessionId,'a');x.list.current='b';await voice.send('第一句话',new AbortController().signal);x.setRunning(true);await voice.send('调整当前任务',new AbortController().signal);assert.equal(voice.snapshot().sessionId,'a');assert.deepEqual(x.sent.map(value=>value.mode),['queue','steer']);assert.equal(x.created,0);voice.end();assert.equal(x.releases,1);}finally{voice.dispose();}assert.equal(x.releases,1);
});
test('a new call creates a conversation only on the first utterance and a removed target never silently switches',async()=>{
 const x=fixture();const voice=createVoiceSessions(x.sessions);try{assert.equal((await voice.begin()).sessionId,null);assert.equal(x.created,0);await voice.send('新对话',new AbortController().signal);assert.equal(x.created,1);delete x.list.byId.new;await assert.rejects(voice.send('继续',new AbortController().signal),/移除/);assert.equal(x.created,1);}finally{voice.dispose();}
});
test('ending during a delayed retain releases exactly once and blocks late activation',async()=>{
 const x=fixture();let ready!:()=>void;x.sessions.retain=()=>({binding:x.sessions.binding('a')!,ready:new Promise<void>(resolve=>{ready=resolve;}),release(){x.sent.push('released');}});const voice=createVoiceSessions(x.sessions),pending=voice.begin('a');voice.end();ready();await assert.rejects(pending,/结束/);assert.deepEqual(x.sent,['released']);voice.dispose();
});
test('voice receives settled text beyond the card preview, and forwards clarification without rewriting the original request',async()=>{
 const x=fixture(),binding=x.sessions.binding('a')!,reply='目录/'.repeat(300)+'验证失败，尚不能交付。';binding.eventSource={getSnapshot:()=>({revision:1,entries:[{type:'event',event:{type:'assistant/message',seq:2,data:{message:{content:[{type:'text',text:reply}]}}}}],change:{kind:'replace',entries:[]}}),subscribe:()=>()=>{}};
 const voice=createVoiceSessions(x.sessions);try{await voice.begin('a');assert.equal(voice.snapshot().reply,reply);await voice.send('当前项目',new AbortController().signal,'user: 帮我整理一下\nassistant: 哪个项目？');assert.equal(x.sent[0].content[1].text,'当前项目');assert.ok(x.sent[0].content[0].text.includes('不提供额外权限'));}finally{voice.dispose();}
});
test('modern observations keep one result identity while a late turn end marks it settled',async()=>{
 const x=fixture(),binding=x.sessions.binding('a')!;const entries:any[]=[{type:'event',event:{seq:1,type:'turn/start',data:{turn:1}}},{type:'event',event:{seq:2,type:'assistant/message',data:{turn:1,step:0,message:{content:[{type:'text',text:'当前目录是工作区。'}]}}}}];
 binding.eventSource={getSnapshot:()=>({revision:entries.length,entries,change:{kind:'append',entries:[]}}),subscribe:()=>()=>{}};
 const voice=createVoiceSessions(x.sessions);try{const first=await voice.begin('a');assert.equal(first.running,false);assert.equal(first.settled,false);entries.push({type:'event',event:{seq:3,type:'turn/end',data:{turn:1,reason:{kind:'completed'}}}});const second=voice.snapshot();assert.equal(second.settled,true);assert.equal(first.replyKey,second.replyKey);assert.equal(first.resultKey,second.resultKey);assert.equal(second.outcome,'completed');}finally{voice.dispose();}
});
test('a cold retained binding is accessed only after the reference becomes ready',async()=>{
 const x=fixture(),binding=x.sessions.binding('a')!;let prepared=false,reads=0;
 x.sessions.retain=()=>({get binding(){reads++;assert.equal(prepared,true);return binding;},ready:new Promise<void>(resolve=>setImmediate(()=>{prepared=true;resolve();})),release(){x.sent.push('released');}});
 const voice=createVoiceSessions(x.sessions);try{const pending=voice.begin('a');assert.equal(reads,0);await pending;assert.equal(reads,1);}finally{voice.dispose();}assert.deepEqual(x.sent,['released']);
});

test('default call ignores an old selected task and its reply, then stays on its own new task',async()=>{
 const x=fixture(),binding=x.sessions.binding('a')!;binding.eventSource={getSnapshot:()=>({revision:1,entries:[{type:'event',event:{seq:1,type:'assistant/message',data:{message:{content:[{type:'text',text:'Old task reply'}]}}}}],change:{kind:'replace',entries:[]}}),subscribe:()=>()=>{}};
 const freshBinding={...binding,session:{...binding.session,getSnapshot:()=>({running:false,lastAgentError:null})},eventSource:{getSnapshot:()=>({revision:0,entries:[],change:{kind:'replace' as const,entries:[]}}),subscribe:()=>()=>{}}};
 const retained:string[]=[];const retain=x.sessions.retain!;x.sessions.retain=(id,options)=>{retained.push(id);const ref=retain(id,options);return {...ref,binding:id==='a'||id==='b'?binding:freshBinding};};
 const voice=createVoiceSessions(x.sessions);try{const initial=await voice.begin();assert.equal(initial.sessionId,null);assert.equal(initial.reply,'');assert.equal(initial.title,'新对话');assert.equal(initial.running,false);assert.deepEqual(retained,[]);
  await voice.send('新的任务',new AbortController().signal);assert.equal(voice.snapshot().sessionId,'new');assert.equal(voice.snapshot().reply,'');assert.equal(x.sent[0].mode,'queue');assert.deepEqual(retained,['new']);
  x.list.current='b';await voice.send('继续新任务',new AbortController().signal);assert.equal(x.created,1);assert.equal(voice.snapshot().sessionId,'new');
  voice.end();const next=await voice.begin();assert.equal(next.sessionId,null);assert.equal(next.reply,'');await voice.send('另一个任务',new AbortController().signal);assert.equal(x.created,2);assert.equal(voice.snapshot().sessionId,'new-2');
 }finally{voice.dispose();}
});

test('cancelling while the first task is being created never attaches or submits a late utterance',async()=>{
 const x=fixture();let finish!:()=>void;const create=x.sessions.create!;x.sessions.create=async options=>{await new Promise<void>(resolve=>{finish=resolve;});return create(options);};
 const voice=createVoiceSessions(x.sessions),controller=new AbortController();try{
  await voice.begin();const pending=voice.send('新的任务',controller.signal);controller.abort();finish();
  await assert.rejects(pending,{name:'AbortError'});assert.equal(voice.snapshot().sessionId,null);assert.deepEqual(x.sent,[]);
 }finally{voice.dispose();}
});
