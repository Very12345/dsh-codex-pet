import type {CreationSessions} from './creation.ts';
export async function sendCompanionChat(sessions:CreationSessions,text:string,files:readonly string[]=[]):Promise<string>{
 if(!text.trim() || text.length>10000)throw new Error('请输入 1–10000 字的消息');
 if(files.length>20 || files.some(file=>typeof file!=='string'||file.length>2048))throw new Error('文件引用过多或无效');
 const message=files.length?text+'\n\n用户选择的文件引用（使用 DSH 文件工具读取）：\n'+files.map(file=>'- '+file).join('\n'):text;
 const id=await sessions.create();
 await sessions.open?.(id);
 const send=async(session:NonNullable<ReturnType<CreationSessions['binding']>>['session'])=>{
  const result=await session.prompt([{type:'text',text:message}], 'queue');
  if(!result.ok)throw new Error(result.error?.message ?? '消息发送失败');
 };
 const binding=sessions.binding(id);
 if(binding?.session.prompt)await send(binding.session);
 else if(sessions.using)await sessions.using(id,{source:'controllerOperation'},async ref=>{await ref.ready;await send(ref.binding.session);});
 else throw new Error('新会话尚未就绪，请在 DSH 中打开后重试');
 return id;
}
