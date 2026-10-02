import React,{useEffect,useLayoutEffect,useRef,useState} from 'react';
import {createRoot} from 'react-dom/client';
import {motionFrameAt,gazeCell} from '../../src/motion.ts';
import {ANIMATIONS,type Pose} from '../../src/model.ts';
import {RequestForm} from '../../src/notification-tray.tsx';
type Bridge={subscribe(fn:(value:any)=>void):()=>void;emit(value:unknown):void;focus():void;hitZones(value:unknown):void;drag(active:boolean):void;resize(height:number):void};
const bridge=(window as any).petDesktop as Bridge;
window.addEventListener('error',()=>bridge.emit({type:'native-error',error:'Floating pet renderer failed'}));
let latest:any=null;const subscribers=new Set<(value:any)=>void>();
bridge.subscribe(value=>{if(value.type==='snapshot')latest=value;for(const fn of subscribers)fn(value);});
const paths:Record<string,React.ReactNode>={new:<><path d="M12 4H6a3 3 0 0 0-3 3v11a3 3 0 0 0 3 3h11a3 3 0 0 0 3-3v-6"/><path d="m19 3 2 2-10 10-4 1 1-4Z"/></>,voice:<><path d="M5 10v4M9 6v12M13 8v8M17 10v4"/></>,down:<path d="m6 9 6 6 6-6"/>,bell:<><path d="M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9M10 21h4"/></>,plus:<path d="M12 5v14M5 12h14"/>,send:<path d="M12 19V5m-6 6 6-6 6 6"/>,close:<path d="m6 6 12 12M18 6 6 18"/>,reply:<><path d="m8 6-5 5 5 5"/><path d="M3 11h11a6 6 0 0 0 6-6"/></>,stop:<rect x="6" y="6" width="12" height="12" rx="2" fill="currentColor" stroke="none"/>,question:<><circle cx="12" cy="12" r="9"/><path d="M9 8a3 3 0 1 1 4 3c-1 1-1 2-1 3M12 17h.01"/></>};
function Icon({name}:{name:string}){return <svg viewBox="0 0 24 24" aria-hidden="true">{paths[name]}</svg>;}
function App(){
 const [state,setState]=useState<any>(latest),[collapsed,setCollapsed]=useState(false),[compose,setCompose]=useState(false),[draft,setDraft]=useState(''),[files,setFiles]=useState<string[]>([]),[error,setError]=useState(''),[voice,setVoice]=useState('idle'),[busy,setBusy]=useState(false),[menu,setMenu]=useState(false),[request,setRequest]=useState<any>(null),[transient,setTransient]=useState<Pose|null>(null),[hover,setHover]=useState(false),[cell,setCell]=useState({row:0,column:0,duration:1});
 const shell=useRef<HTMLDivElement>(null),pet=useRef<HTMLDivElement>(null),input=useRef<HTMLInputElement>(null),started=useRef(performance.now()),lastPose=useRef(''),dragging=useRef(false),pending=useRef(''),pixels=useRef<Uint8ClampedArray|null>(null),replies=useRef(new Map<string,{resolve:()=>void;reject:(cause:Error)=>void;timer:ReturnType<typeof setTimeout>}>());
 const size=state?.config?.size||120,items=state?.notifications?.items||[],requestedPose=transient ?? (hover?'jumping':state?.notifications?.activity?.pose||'idle'),pose=(requestedPose in ANIMATIONS?requestedPose:'idle') as Pose;
 const chinese=!String(state?.language||'zh').startsWith('en'),t=(zh:string,en:string)=>chinese?zh:en;
 const action=(command:any)=>{const id=crypto.randomUUID();bridge.emit({type:'command',id,command});return id;};
 const answered=(command:any)=>new Promise<void>((resolve,reject)=>{const id=action(command),timer=setTimeout(()=>{replies.current.delete(id);reject(new Error(t('提交超时','Request timed out')));},30000);replies.current.set(id,{resolve,reject,timer});});
 const dismissComposer=()=>{setCompose(false);setMenu(false);setVoice('idle');action({type:'voice-cancel'});};
 const dismissRef=useRef(dismissComposer);dismissRef.current=dismissComposer;
 useEffect(()=>{const listener=(value:any)=>{
  if(value.type==='snapshot')setState(value);
  else if(value.type==='window-blur')dismissRef.current();
  else if(value.type==='drag-motion'){if(value.dx>=4)setTransient('running-right');else if(value.dx<=-4)setTransient('running-left');}
  else if(value.type==='composer'){setVoice(value.state||'idle');if(value.text)setDraft(old=>old+value.text);if(value.error)setError(value.error);}
  else if(value.type==='result'){
    const reply=replies.current.get(value.id);if(reply){clearTimeout(reply.timer);replies.current.delete(value.id);if(value.ok)reply.resolve();else reply.reject(new Error(value.error||''));}
    if(value.id===pending.current){setBusy(false);if(value.ok){setDraft('');setFiles([]);setCompose(false);}else setError(value.error||'');}
  }
  else if(value.type==='fixture-ui'){if(value.action==='new'){setCompose(true);setCollapsed(false);bridge.focus();}else if(value.action==='text')setDraft(value.text||'');else if(value.action==='outside')pet.current?.dispatchEvent(new PointerEvent('pointerdown',{bubbles:true,button:2}));else if(value.action==='collapse'){setCollapsed(true);setCompose(false);}}
 };subscribers.add(listener);if(latest)setState(latest);return()=>{subscribers.delete(listener);};},[]);
 useEffect(()=>{if(!state?.image)return;const image=new Image();image.onload=()=>{const canvas=document.createElement('canvas');canvas.width=image.width;canvas.height=image.height;const context=canvas.getContext('2d')!;context.drawImage(image,0,0);pixels.current=context.getImageData(0,0,canvas.width,canvas.height).data;};image.src='data:image/png;base64,'+state.image;},[state?.image]);
 useEffect(()=>{if(lastPose.current!==pose){started.current=performance.now();lastPose.current=pose;}let timer:number;const measure=document.createElement('canvas').getContext('2d');const tick=()=>{
  const reduced=matchMedia('(prefers-reduced-motion:reduce)').matches;
  const frame=motionFrameAt(pose,performance.now()-started.current,reduced);
  const rect=pet.current?.getBoundingClientRect(),editor=input.current;let gaze=null;
  // Directional rows follow an active editor caret, not the user's desktop mouse.
  if(!reduced&&state?.version===2&&['idle','running','waving'].includes(pose)&&!transient&&rect&&editor&&document.hasFocus()&&document.activeElement===editor&&measure){
   const box=editor.getBoundingClientRect(),style=getComputedStyle(editor);measure.font=style.font;
   const caretX=Math.max(0,Math.min(box.width,measure.measureText(editor.value.slice(0,editor.selectionStart??editor.value.length)).width-editor.scrollLeft));
   gaze=gazeCell(box.left+caretX-(rect.left+rect.width/2),box.top+box.height/2-(rect.top+rect.height/2));
  }
  setCell(old=>{const next=gaze?{...frame,...gaze}:frame;return old.row===next.row&&old.column===next.column?old:next;});timer=requestAnimationFrame(tick);
 };timer=requestAnimationFrame(tick);return()=>cancelAnimationFrame(timer);},[pose,state?.version,transient]);
 useLayoutEffect(()=>{
  if(!shell.current)return;
  const report=()=>{const rectangles=Array.from(shell.current!.querySelectorAll<HTMLElement>('[data-hit]')).filter(element=>element.offsetWidth&&element.offsetHeight).map(element=>{const rect=element.getBoundingClientRect();const result:any={x:rect.x,y:rect.y,width:rect.width,height:rect.height};if(element===pet.current && pixels.current){const bytes=new Uint8Array(192*208/8),data=pixels.current;for(let y=0;y<208;y++)for(let x=0;x<192;x++){const i=y*192+x,alpha=data[((cell.row*208+y)*1536+cell.column*192+x)*4+3];if(alpha>8)bytes[i>>3]|=1<<(i&7);}result.mask=btoa(String.fromCharCode(...bytes));}return result;});bridge.hitZones(rectangles);bridge.resize(shell.current!.getBoundingClientRect().height);};
  const observer=new ResizeObserver(report);observer.observe(shell.current);report();return()=>observer.disconnect();
 },[state,cell,compose,collapsed,menu,request]);
 useEffect(()=>{if(!state?.id)return;const ready=()=>requestAnimationFrame(()=>bridge.emit({type:'shown',id:state.id}));if(!state.image){ready();return;}const image=new Image();image.onload=ready;image.onerror=()=>bridge.emit({type:'shown',id:state.id});image.src='data:image/png;base64,'+state.image;},[state?.id]);
 useEffect(()=>{if(compose){requestAnimationFrame(()=>input.current?.focus());}},[compose]);
 useEffect(()=>{if(!compose)return;const outside=(event:PointerEvent)=>{if(!(event.target instanceof Element)||!event.target.closest('.composer,.attachments,.status,.composer-error'))dismissRef.current();};document.addEventListener('pointerdown',outside,true);return()=>document.removeEventListener('pointerdown',outside,true);},[compose]);
 useEffect(()=>{(window as any).__petInspect=()=>({pose,cell,collapsed,composerVisible:compose&&!collapsed,composerText:draft,noticesVisible:!collapsed&&items.length>0,petBounds:pet.current?.getBoundingClientRect().toJSON(),toolbarBounds:document.querySelector('.toolbar')?.getBoundingClientRect().toJSON(),noticeBounds:document.querySelector('.notice')?.getBoundingClientRect().toJSON()});},[pose,cell,collapsed,compose,draft,items.length]);
 const openComposer=()=>{setCompose(true);setCollapsed(false);setError('');bridge.focus();};
 const fold=()=>{if(!collapsed){action({type:'voice-cancel'});setVoice('idle');}setCollapsed(!collapsed);setMenu(false);};
 const send=()=>{if(!draft.trim() || busy)return;setBusy(true);setError('');pending.current=action({type:'send-message',text:draft,files});};
 if(!state)return <div className="shell" ref={shell}/>;
 return <div className={'shell '+(state.theme==='dark'?'dark':'')} ref={shell}>
  <div ref={pet} data-hit className="pet" aria-label={t('悬浮宠物','Floating pet')} style={{width:size,height:size*208/192,backgroundImage:'url(data:image/png;base64,'+state.image+')',backgroundSize:`${size*8}px ${size*208/192*(state.version===2?11:9)}px`,backgroundPosition:`${-cell.column*size}px ${-cell.row*size*208/192}px`}} onPointerEnter={()=>setHover(true)} onPointerLeave={()=>setHover(false)} onPointerDown={event=>{if(event.button!==0)return;dragging.current=true;event.currentTarget.setPointerCapture(event.pointerId);bridge.drag(true);}} onPointerUp={event=>{dragging.current=false;setTransient(null);event.currentTarget.releasePointerCapture(event.pointerId);bridge.drag(false);}} onDoubleClick={()=>{setTransient('jumping');setTimeout(()=>setTransient(null),2100);}} onContextMenu={event=>{event.preventDefault();setMenu(!menu);}}/>
  {!compose || collapsed?<div className="toolbar" data-hit><button title={t('新对话','New conversation')} onClick={openComposer}><Icon name="new"/></button><button title={t('语音输入','Voice input')} className={voice==='recording'?'recording':''} onClick={()=>{setCompose(true);setCollapsed(false);bridge.focus();action({type:'voice-toggle'});}}><Icon name="voice"/></button><button title={t('折叠/展开对话','Collapse/expand conversations')} onClick={fold}><Icon name={collapsed?'bell':'down'}/>{collapsed&&items.length>0?<span className="badge">{items.length}</span>:null}</button></div>:null}
  {menu?<div className="menu" data-hit><button onClick={()=>{bridge.emit({type:'settings'});setMenu(false);}}>{t('宠物设置','Pet settings')}</button><button onClick={()=>bridge.emit({type:'config',value:{desktop:false}})}>{t('返回页内显示','Show inside DSH')}</button><button onClick={()=>bridge.emit({type:'config',value:{visible:false}})}>{t('收起宠物','Hide pet')}</button></div>:null}
  {!collapsed&&compose?<><form className="composer" data-hit onSubmit={event=>{event.preventDefault();send();}}><button type="button" className="round" title={t('添加文件引用','Add file references')} onClick={async()=>setFiles(await (bridge as any).chooseFiles())}><Icon name="plus"/></button><input ref={input} value={draft} maxLength={10000} placeholder={t('开始新聊天','Start a new chat')} aria-label={t('消息','Message')} onFocus={()=>bridge.focus()} onChange={event=>setDraft(event.target.value)} onKeyDown={event=>{if(event.key==='Escape'){setCompose(false);action({type:'voice-cancel'});}}}/><button type="submit" className="round send" disabled={!draft.trim()||busy} title={t('发送','Send')}><Icon name="send"/></button></form>{files.length?<div className="attachments">{files.map(file=><span className="attachment" key={file}>{file.split(/[\\/]/).pop()}</span>)}</div>:null}{error?<div className="composer-error">{error}</div>:null}{voice!=='idle'?<div className="status" data-hit><button onClick={()=>action({type:'voice-toggle'})}>{voice==='recording'?t('正在录音 · 点击结束','Recording · click to finish'):t('正在转写…','Transcribing…')}</button></div>:null}</>:null}
  {!collapsed&&items.length?<div className="stack">{items.slice(0,4).map((item:any)=><div key={item.id} className="notice" data-hit><button className="dismiss" title={t('关闭提醒','Dismiss')} onClick={()=>action({type:'dismiss',id:item.id,token:item.token})}><Icon name="close"/></button><button className="notice-copy" onClick={()=>action({type:'open',id:item.id,token:item.token})}><strong>{item.title}</strong><small>{item.pose==='running'?t('正在思考','Thinking'):item.pose==='review'?t('已完成','Completed'):item.pose==='waiting'?t('等待你处理','Needs your input'):t('任务出错','Blocked')}</small></button><button className="round" title={t('查看对话','Open conversation')} onClick={()=>item.request?setRequest(item):action({type:'open',id:item.id,token:item.token})}><Icon name={item.request?'question':'reply'}/></button>{item.pose==='running'?<button className="round" title={t('停止','Stop')} onClick={()=>action({type:'stop',id:item.id,token:item.token})}><Icon name="stop"/></button>:null}</div>)}</div>:null}
  {request?<div className="request" data-hit><RequestForm item={request} language={state.language} command={async command=>{await answered(command);setRequest(null);}}/><button onClick={()=>setRequest(null)}>{t('关闭','Close')}</button></div>:null}
 </div>;
}
createRoot(document.getElementById('root')!).render(<App/>);
