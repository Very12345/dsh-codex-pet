import {Marked,type Token} from 'marked';

const markdown=new Marked({gfm:true});
const entities:Record<string,string>={amp:'&',lt:'<',gt:'>',quot:'"',apos:"'",nbsp:' '};
function decode(text:string){
 return text.replace(/&(#x[\da-f]+|#\d+|amp|lt|gt|quot|apos|nbsp);/gi,(raw,key:string)=>{
  if(key[0]!=='#')return entities[key.toLowerCase()]??raw;
  const value=parseInt(key.slice(/^#x/i.test(key)?2:1),/^#x/i.test(key)?16:10);
  return value>0&&value<=0x10ffff&&!(value>=0xd800&&value<=0xdfff)?String.fromCodePoint(value):raw;
 });
}
function htmlText(text:string){return decode(text.replace(/<(script|style)\b[^>]*>[\s\S]*?(?:<\/\1\s*>|$)/gi,' ').replace(/<!--[\s\S]*?(?:-->|$)/g,' ').replace(/<[^>]*>/g,' '));}
function tokensText(tokens:readonly Token[]):string{
 return tokens.map(token=>{
  switch(token.type){
   case 'space':case 'br':case 'hr':return ' ';
   case 'code':return token.text+' ';
   case 'codespan':return token.text;
   case 'html':return htmlText(token.text);
   case 'image':return decode(token.text);
   case 'list':return token.items.map((item:{tokens:Token[]})=>tokensText(item.tokens)).join(' ');
   case 'table':return [token.header,...token.rows].map((row:{tokens:Token[]}[])=>row.map(cell=>tokensText(cell.tokens)).join(' ')).join(' ');
   default:
    if('tokens' in token&&Array.isArray(token.tokens))return tokensText(token.tokens)+(token.type==='paragraph'||token.type==='heading'||token.type==='blockquote'?' ':'');
    // Opening streaming markers have no closing token yet. Preserve ordinary
    // arithmetic and filenames, removing only formatting runs at word starts.
    return 'text' in token&&typeof token.text==='string'?decode(token.text).replace(/(^|[\s([{，。:：;；])(?:\*\*|__|~~)(?=\S|$)/g,'$1'):'';
  }
 }).join('');
}
/** A bounded text projection. No HTML rendering, links, scripts or fetches. */
export function noticeText(source:string,limit=500){
 const text=tokensText(markdown.lexer(source.slice(0,12000)));
 return Array.from(text.replace(/[\u0000-\u001f\u007f]/g,' ').replace(/\s+/g,' ').trim()).slice(0,limit).join('');
}
