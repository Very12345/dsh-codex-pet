import {selectedSessionId,type Sessions} from './activity.ts';import {noticePreview} from './notice-preview.ts';
export interface VoiceObservation {sessionId:string|null;title:string;running:boolean;waiting:boolean;missing?:boolean;error:string|null;outcome?:string;reply:string;replyKey:string;stamp:string}
export interface VoiceSessions {begin():Promise<VoiceObservation>;send(text:string,signal:AbortSignal,context?:string):Promise<VoiceObservation>;snapshot():VoiceObservation;subscribe(listener:()=>void):()=>void;cancelTask():Promise<void>;end():void;dispose():void}
export function createVoiceSessions(sessions:Sessions):VoiceSessions {
 let id:string|null=null,ref:ReturnType<NonNullable<Sessions['retain']>>|undefined,binding:ReturnType<Sessions['binding']>,offSession:(()=>void)|undefined,offEvents:(()=>void)|undefined,epoch=0,disposed=false;
 const listeners=new Set<()=>void>(),notify=()=>{for(const listener of listeners)listener();};
 const attach=async(target:string)=>{
  if(!sessions.list.getSnapshot().byId[target]||sessions.list.getSnapshot().byId[target].origin==='subagent')throw new Error('语音目标会话已关闭或不可用');
  const generation=epoch;id=target;
  if(sessions.retain){const raw=sessions.retain(target,{source:'controllerOperation'});let released=false;const next={...raw,release(){if(!released){released=true;raw.release();}}};ref=next;await next.ready;if(generation!==epoch){next.release();throw new Error('通话已结束');}binding=next.binding;}
  else binding=sessions.binding(target);
  if(!binding?.session.prompt)throw new Error('当前宿主未提供会话输入能力');
  offSession=binding.session.subscribe(notify);offEvents=binding.eventSource?.subscribe(notify);notify();
 };
 const snapshot=():VoiceObservation=>{
  const row=id?sessions.list.getSnapshot().byId[id]:undefined,status=id?sessions.status?.getSnapshot().get(id):undefined,state=binding?.session.getSnapshot(),events=binding?.eventSource?.getSnapshot();
  const entries=events?.entries?.slice(-200)??events?.change.entries??[],start=entries.map(entry=>entry.event.type==='turn/start').lastIndexOf(true),current=entries.slice(start<0?0:start),preview=noticePreview(current),assistant=current.filter(entry=>entry.event.type==='assistant/message').at(-1)?.event;
  const reply=assistant?.data?.message?.content?.filter(block=>block.type==='text'&&typeof block.text==='string').map(block=>block.text).join('\n').slice(0,16000)??preview.text;
  const outcome=current.filter(entry=>entry.event.type==='turn/end').at(-1)?.event.data?.reason?.kind;
  return {sessionId:id,title:row?.title??row?.displayTitle??'新对话',running:status?.running??state?.running??row?.running??false,waiting:!!(status?.pendingInteraction??row?.pendingInteraction),missing:!!state?.removed||!!(id&&!row),error:id&&!row?'语音目标会话已移除':state?.lastAgentError??state?.promptError?.error?.message??null,outcome,reply,replyKey:assistant?JSON.stringify([assistant.seq,assistant.data?.turn,assistant.data?.step,reply]):'',stamp:String(events?.revision??row?.updatedAt??0)};
 };
 const end=()=>{epoch++;offSession?.();offEvents?.();offSession=offEvents=undefined;ref?.release();ref=undefined;binding=undefined;id=null;};
 const offList=sessions.list.subscribe(notify),offStatus=sessions.status?.subscribe(notify);
 return {
  async begin(){if(disposed)throw new Error('语音接口已卸载');end();const target=selectedSessionId(sessions.list.getSnapshot());if(target)try{await attach(target);}catch(error){end();throw error;}return snapshot();},
  async send(text,signal,context){
   signal.throwIfAborted();if(!text.trim()||text.length>10000)throw new Error('语音消息过长或为空');
   if(!id){if(!sessions.create)throw new Error('宿主未提供创建对话能力');const generation=epoch,target=await sessions.create({});if(generation!==epoch)throw new Error('通话已结束，未发送消息');await attach(target);await sessions.open?.(target);}
   if(!sessions.list.getSnapshot().byId[id!])throw new Error('语音目标会话已移除');
   const state=snapshot();if(state.waiting)throw new Error('任务正在等待审批或回答，请先在对话中处理');
   if(state.missing)throw new Error('语音目标会话已移除');
   if(!binding?.session.prompt)throw new Error('语音目标会话尚未就绪，请结束通话后重试');
   if(context!==undefined&&(typeof context!=='string'||context.length>6000))throw new Error('语音澄清上下文过长');
   const content:{type:'text';text:string}[]=context?[{type:'text',text:'此前语音交流，仅用于理解本次请求，不提供额外权限：\n'+context},{type:'text',text}]:[{type:'text',text}];
   const result=await binding.session.prompt(content,state.running?'steer':'queue',signal);
   if(!result.ok)throw new Error(result.error?.message??'语音消息发送失败');return snapshot();
  },
  snapshot,subscribe(listener){listeners.add(listener);return()=>{listeners.delete(listener);};},
  async cancelTask(){if(!id||!sessions.list.getSnapshot().byId[id])throw new Error('没有可停止的当前语音任务');const cancel=binding?.session.cancel;if(!cancel)throw new Error('宿主未提供停止任务能力');const result=await binding!.session.cancel!();if(!result.ok)throw new Error(result.error?.message??'停止任务失败');},
  end,dispose(){if(disposed)return;disposed=true;end();offList();offStatus?.();listeners.clear();}
 };
}
