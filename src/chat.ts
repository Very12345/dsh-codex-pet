import type {CreationSessions} from './creation.ts';
export async function sendCompanionChat(sessions:CreationSessions,text:string):Promise<string>{
 if(!text.trim() || text.length>10000)throw new Error('请输入 1–10000 字的消息');
 const id=await sessions.create();
 await sessions.open?.(id);
 const send=async(session:NonNullable<ReturnType<CreationSessions['binding']>>['session'])=>{
  const result=await session.prompt([{type:'text',text}], 'queue');
  if(!result.ok)throw new Error(result.error?.message ?? '消息发送失败');
 };
 const binding=sessions.binding(id);
 if(binding?.session.prompt)await send(binding.session);
 else if(sessions.using)await sessions.using(id,{source:'controllerOperation'},async ref=>{await ref.ready;await send(ref.binding.session);});
 else throw new Error('新会话尚未就绪，请在 DSH 中打开后重试');
 return id;
}
