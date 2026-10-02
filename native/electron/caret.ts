/** A hidden layout mirror measures wrapped textarea carets without reading the desktop. */
const layouts=new WeakMap<HTMLTextAreaElement,{key:string;x:number;y:number;line:number}>();
export function editorCaret(editor:HTMLInputElement|HTMLTextAreaElement,measure:CanvasRenderingContext2D,mirror:HTMLDivElement){
 const box=editor.getBoundingClientRect(),style=getComputedStyle(editor),selection=editor.selectionStart??editor.value.length,before=editor.value.slice(0,selection);
 if(editor instanceof HTMLInputElement){measure.font=style.font;return {x:box.left+Math.max(0,Math.min(box.width,measure.measureText(before).width-editor.scrollLeft)),y:box.top+box.height/2};}
 const properties=['font','lineHeight','letterSpacing','paddingTop','paddingBottom','paddingLeft','paddingRight','borderTopWidth','borderLeftWidth','boxSizing','wordBreak','tabSize'] as const;
 const suffix=editor.value.slice(selection,selection+1)||'\u200b',key=[box.width,...properties.map(property=>style[property]),before,suffix].join('\u0000');let layout=layouts.get(editor);
 if(layout?.key!==key){
  mirror.style.cssText='position:fixed;left:0;top:0;visibility:hidden;pointer-events:none;height:auto;white-space:pre-wrap;overflow-wrap:break-word;';
  for(const property of properties)mirror.style[property]=style[property];
  mirror.style.width=box.width+'px';mirror.textContent=before;
  const marker=document.createElement('span');marker.textContent=suffix;mirror.append(marker);
  const point=marker.getBoundingClientRect();layout={key,x:point.left,y:point.top,line:parseFloat(style.lineHeight)||16};layouts.set(editor,layout);
 }
 return {x:box.left+Math.max(0,Math.min(box.width,layout.x-editor.scrollLeft)),y:box.top+Math.max(layout.line/2,Math.min(box.height,layout.y+layout.line/2-editor.scrollTop))};
}
