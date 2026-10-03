/** A speech-only view of a reply. Never rewrite its displayed text or session history. */
export function spokenText(text:string){
 let value=text
  .replace(/(`{3,}|~{3,})[^\n]*\n[\s\S]*?(?:\n\1[^\n]*(?=\n|$)|$)/g,' 代码内容请查看对话。 ')
  .replace(/```[\s\S]*?(?:```|$)/g,' 代码内容请查看对话。 ')
  .replace(/!\[([^\]]*)\]\([^)]*\)/g,' 图片请查看对话。 ')
  .replace(/\[([^\]]+)\]\([^)]*\)/g,'$1')
  .replace(/<https?:\/\/[^>]+>|https?:\/\/[^\s<>]+/g,'链接')
  .replace(/\$\$[\s\S]*?(?:\$\$|$)|\\\[[\s\S]*?\\\]|\\\([^\n]*?\\\)|\$(?!\d+(?:[.,]\d+)?(?:\s|[，。；！？,.!?]|$))[^$\n]+\$/g,' 公式请查看对话。 ')
  // Keep ordinary digits, currency, accented letters and CJK characters.
  // Remove whole emoji sequences rather than their Unicode spoken names.
  .replace(/[0-9#*]\uFE0F?\u20E3|\p{Regional_Indicator}{2}|[\p{Extended_Pictographic}\p{Emoji_Presentation}](?:[\uFE0E\uFE0F\p{Emoji_Modifier}]|\u200D[\p{Extended_Pictographic}\p{Emoji_Presentation}]|[\u{E0020}-\u{E007F}])*/gu,'')
  .replace(/:[a-z][a-z0-9_+-]*:/gi,'')
  .replace(/\b[A-Za-z]:[\\/][^\s<>"`，。；！？）)]+|\\\\[\w.-]+\\[^\s<>"`，。；！？）)]+/g,'本地路径')
  .replace(/\\[nrt](?=\s|$)/g,' ')
  .replace(/\\(?=[\\`*_{}\[\]()#+.!<>|~-])/g,'')
  .replace(/\\/g,' ')
  .replace(/<(?:\/?[a-z][^>]*|!--[\s\S]*?--)>/gi,' ')
  .replace(/&(?:amp|lt|gt|quot|apos|nbsp);/gi,entity=>({'&amp;':'和','&lt;':'小于','&gt;':'大于','&quot;':'"','&apos;':"'",'&nbsp;':' '}[entity.toLowerCase()]??' '));
 const lines=value.split(/\r?\n/),prose:string[]=[];
 for(let i=0;i<lines.length;i++){
  if(lines[i].includes('|')&&i+1<lines.length&&/^\s*\|?\s*:?-{3,}:?\s*(?:\|\s*:?-{3,}:?\s*)+\|?\s*$/.test(lines[i+1])){
   prose.push('表格内容请查看对话。');i++;while(i+1<lines.length&&lines[i+1].includes('|'))i++;continue;
  }
  prose.push(lines[i].replace(/^\s*(?:#{1,6}\s+|>\s*|[-+*]\s+(?:\[[ xX]\]\s*)?)/,'').replace(/^\s*(?:[-*_]\s*){3,}$/,''));
 }
 value=prose.join(' ').replace(/(`+)(.*?)\1/g,'$2').replace(/\*\*(.*?)\*\*|__(.*?)__|~~(.*?)~~/g,(_match,a,b,c)=>a??b??c)
  .replace(/(^|\s)\*([^*]+)\*(?=\s|[，。！？,.!?]|$)/g,'$1$2')
  .replace(/(^|\s)_([^_]+)_(?=\s|[，。！？,.!?]|$)/g,'$1$2')
  .replace(/[\u0000-\u001f\u007f\u200b-\u200f\u202a-\u202e\u2060\u2066-\u2069\uFE0E\uFE0F]/g,' ')
  .replace(/\s+/g,' ').trim();
 // Pure decoration is silent, rather than calling TTS with an empty payload.
 if(!/[\p{L}\p{N}]/u.test(value))return '';
 return Array.from(value).slice(0,240).join('');
}
