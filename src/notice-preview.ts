import type {PresentationEntry} from './activity.ts';
export interface NoticePreview {text:string;tool?:string}
/** Read visible assistant text and tool names, excluding reasoning and arguments. */
export function noticePreview(entries:readonly PresentationEntry[]):NoticePreview {
 let text='',tool:string|undefined,attempt:string|undefined;
 for(const {event} of entries){
  if(event.type==='turn/start'){text='';tool=undefined;attempt=undefined;}
  else if(event.type==='tool/call'&&typeof event.data?.name==='string')tool=event.data.name.slice(0,80);
  else if(event.type==='assistant/message'){
   const next=(event.data?.message?.content??[]).filter(block=>block.type==='text'&&typeof block.text==='string').map(block=>block.text).join('\n');
   if(next.trim()){text=next;tool=undefined;}attempt=undefined;
  }else if(event.type==='assistant/live-chunk'&&event.data?.chunk?.type==='text-delta'){
   if(attempt!==event.data.attemptId){text='';attempt=event.data.attemptId;}
   text+=event.data.chunk.text??'';tool=undefined;
  }
  text=text.slice(0,1200);
 }
 return {text:text.replace(/\s+/g,' ').trim().slice(0,500),tool};
}
