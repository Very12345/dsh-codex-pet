import test from 'node:test';import assert from 'node:assert/strict';
import {createNotifications,type NotificationState} from '../src/notifications.ts';
import type {Store,SessionList,SessionSnapshot,EventWindow} from '../src/activity.ts';
function store<T>(value:T):Store<T>&{value:T}{return {value,getSnapshot(){return this.value;},subscribe(){return ()=>{};}};}
test('follow-up targets the original session, queues text and rejects stale tokens without creating/opening another session',async()=>{
 const list=store<SessionList>({ids:['a','b'],byId:{a:{id:'a',title:'A',running:true},b:{id:'b',title:'B',running:true}}}),sent:unknown[]=[],session=Object.assign(store<SessionSnapshot>({running:true,lastAgentError:null}),{async prompt(content:unknown,mode:string){sent.push({content,mode});return {ok:true};}});
 let state!:NotificationState;const engine=createNotifications({list,binding:id=>id==='a'?{session}:undefined,open(){throw Error('must not open');}},store(new Map()),value=>state=value);
 try{const item=state.items.find(item=>item.id==='a')!;await engine.command({type:'reply',id:'a',token:item.token,text:'Follow-up'});assert.deepEqual(sent,[{content:[{type:'text',text:'Follow-up'}],mode:'queue'}]);await assert.rejects(engine.command({type:'reply',id:'b',token:'wrong',text:'wrong target'}),/更新/);assert.equal(sent.length,1);}finally{engine.dispose();}
});
test('released session uses an operation reference and propagates host permission denial',async()=>{
 let target='';const list=store<SessionList>({ids:['a'],byId:{a:{id:'a',title:'A',running:false,completed:true}}});let state!:NotificationState;
 const engine=createNotifications({list,binding:()=>undefined,async using(id,_options,operation){target=id;await operation({ready:Promise.resolve(),binding:{session:{async prompt(){return {ok:false,error:{message:'Host permission denied'}};}}}});}},store(new Map()),value=>state=value);
 try{const item=state.items[0];await assert.rejects(engine.command({type:'reply',id:item.id,token:item.token,text:'Follow-up'}),/Host permission denied/);assert.equal(target,'a');await assert.rejects(engine.command({type:'reply',id:item.id,token:item.token,text:' ' }),/请输入/);}finally{engine.dispose();}
});
test('durable assistant summary persists when the completed session binding is released',()=>{
 const list=store<SessionList>({ids:['a'],byId:{a:{id:'a',title:'A',running:false,completed:true}}}),session=store<SessionSnapshot>({running:false,lastAgentError:null}),events=store<EventWindow>({revision:0,entries:[{type:'event',event:{type:'assistant/message',data:{message:{content:[{type:'text',text:'A visible final answer'}]}}}}],change:{kind:'replace',entries:[]}});let bound=true,state!:NotificationState;
 const engine=createNotifications({list,binding:()=>bound?{session,eventSource:events}:undefined},store(new Map()),value=>state=value);
 try{assert.equal(state.items[0].preview,'A visible final answer');bound=false;engine.sort(true);assert.equal(state.items[0].preview,'A visible final answer');}finally{engine.dispose();}
});
