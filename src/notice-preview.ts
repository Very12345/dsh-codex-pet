import type {PresentationEntry} from './activity.ts';
export type NoticePhase='thinking'|'responding'|'preparing-tool'|'tool'|'compacting';
export interface NoticePreview {text:string;tool?:string;phase?:NoticePhase;attempt?:string;activeTools?:Record<string,string>;blocks?:Record<string,string>}
/** Project visible progress, never reasoning text, tool arguments or tool results. */
export function noticePreview(entries:readonly PresentationEntry[],previous?:NoticePreview):NoticePreview {
 let text=previous?.text??'',tool=previous?.tool,phase=previous?.phase,attempt=previous?.attempt;
 let activeTools={...previous?.activeTools},blocks={...previous?.blocks};
 const reset=()=>{text='';tool=undefined;attempt=undefined;activeTools={};blocks={};};
 for(const {event} of entries){
  const data=event.data;
  if(event.type==='turn/start'||event.type==='step/start'){reset();phase='thinking';}
  else if(event.type==='compaction/start'){reset();phase='compacting';}
  else if(event.type==='compaction/end'){reset();phase='thinking';}
  else if(event.type==='assistant/attempt'){reset();phase='thinking';}
  else if(event.type==='tool/call'&&typeof data?.name==='string'){
   tool=data.name.slice(0,80);activeTools[data.callId??'legacy:'+tool]=tool;phase='tool';
  }else if(event.type==='tool/result'){
   if(data?.message?.callId)delete activeTools[data.message.callId];else activeTools={};
   tool=Object.values(activeTools).at(-1);phase=tool?'tool':'thinking';
  }else if(event.type==='assistant/message'){
   const next=(data?.message?.content??[]).filter(block=>block.type==='text'&&typeof block.text==='string').map(block=>block.text).join('\n');
   text=next;tool=undefined;activeTools={};attempt=undefined;blocks={};phase=next.trim()?'responding':'thinking';
  }else if(event.type==='assistant/live-chunk'){
   const chunk=data?.chunk;if(!chunk)continue;
   if(attempt!==data?.attemptId){text='';blocks={};tool=undefined;attempt=data?.attemptId;}
   if(chunk.type==='text-delta'){
    const index=String(chunk.index??0);blocks[index]=((blocks[index]??'')+(chunk.text??'')).slice(0,1200);
    text=Object.keys(blocks).sort((a,b)=>Number(a)-Number(b)).map(key=>blocks[key]).join('\n');phase='responding';tool=undefined;
   }else if(chunk.type==='block-end'&&chunk.block?.type==='text'){
    blocks[String(chunk.index??0)]=(chunk.block.text??'').slice(0,1200);
    text=Object.keys(blocks).sort((a,b)=>Number(a)-Number(b)).map(key=>blocks[key]).join('\n');phase='responding';tool=undefined;
   }else if(chunk.type==='reasoning-delta'||chunk.type==='block-start'&&chunk.blockType==='reasoning'){phase='thinking';tool=undefined;}
   else if(chunk.type==='tool-call-delta'){phase='preparing-tool';tool=undefined;}
  }
  text=text.slice(0,1200);
 }
 return {text:text.replace(/\s+/g,' ').trim().slice(0,500),tool,phase,attempt,activeTools,blocks};
}
