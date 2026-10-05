import type {Notice} from './notifications.ts';
import {noticeText} from './notice-text.ts';
type Text=[string,string];
const tools:Record<string,Text>={
 web_search:['正在搜索网页','Searching the web'],qianwen_search:['正在搜索网页','Searching the web'],
 web_fetch:['正在读取网页','Reading a web page'],read_file:['正在查看文件','Reading files'],
 glob:['正在查找文件','Finding files'],grep:['正在搜索内容','Searching files'],list_directory:['正在查看文件夹','Listing folders'],
 edit_file:['正在修改文件','Editing files'],write_file:['正在写入文件','Writing files'],apply_patch:['正在修改文件','Editing files'],
 bash:['正在运行命令','Running a command'],pwsh:['正在运行命令','Running a command'],run_code:['正在运行代码','Running code'],
 qianwen_image:['正在生成图片','Generating an image'],qianwen_voice:['正在转写音频','Transcribing audio'],
};
/** One presentation policy for the page pet and native companion. */
export function noticeCopy(item:Pick<Notice,'pose'|'phase'|'tool'|'preview'|'request'>,t:(zh:string,en:string)=>string){
 if(item.pose==='waiting')return {text:t('需要输入','Needs input'),busy:false};
 if(item.pose==='failed')return {text:t('已拦截','Blocked'),busy:false};
 if(item.pose==='review')return {text:noticeText(item.preview||'')||t('就绪','Ready'),busy:false};
 if(item.phase==='compacting')return {text:t('正在整理上下文','Compacting context'),busy:true};
 if(item.phase==='preparing-tool')return {text:t('正在准备工具调用','Preparing a tool call'),busy:true};
 if(item.phase==='tool'||item.tool){
  const name=item.tool||'',copy=tools[name]??(name.startsWith('computer_')?['正在操作电脑','Using the computer']:undefined);
  return {text:copy?t(copy[0],copy[1]):t('正在使用工具','Using a tool'),busy:true};
 }
 if(item.phase==='responding')return {text:noticeText(item.preview||'')||t('正在生成回复','Writing a reply'),busy:true};
 return {text:t('正在思考','Thinking'),busy:true};
}
