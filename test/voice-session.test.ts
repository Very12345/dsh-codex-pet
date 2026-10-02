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
