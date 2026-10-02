import {spawn} from 'node:child_process';
import {createInterface} from 'node:readline';
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import assert from 'node:assert/strict';
import sharp from 'sharp';
import {ANIMATIONS,DEFAULT_CONFIG} from '../src/model.ts';
if(process.platform!=='win32'){console.log('Desktop smoke requires Windows');process.exit(0);}
await mkdir('.preview',{recursive:true});
const helper=spawn('powershell.exe',['-NoProfile','-NonInteractive','-STA','-ExecutionPolicy','Bypass','-File','native/desktop-pet.ps1','-ParentProcessId',String(process.pid)],{windowsHide:true,stdio:['pipe','pipe','pipe'],env:{...process.env,DSH_PET_NATIVE_TEST:'1'}});
const lines=createInterface({input:helper.stdout}),messages=[],waiters=[];let errors='';
helper.stderr.on('data',value=>{errors+=value;});
lines.on('line',line=>{try{const message=JSON.parse(line);messages.push(message);for(const waiter of [...waiters])if(waiter.type===message.type && (!waiter.id || waiter.id===message.id)){waiters.splice(waiters.indexOf(waiter),1);clearTimeout(waiter.timer);waiter.resolve(message);}}catch{}});
const wait=(type,id)=>new Promise((resolve,reject)=>{const timer=setTimeout(()=>reject(new Error('timeout '+type+' '+errors)),15000);waiters.push({type,id,resolve,reject,timer});});
const send=value=>helper.stdin.write(JSON.stringify(value)+'\n');
let code;
try{
 await wait('ready');
 const image=(await sharp(await readFile('assets/codex/codex/spritesheet.webp')).png().toBuffer()).toString('base64');
 const notifications={activity:{pose:'running'},items:[{id:'test',token:'1',pose:'running',title:'Desktop companion test',text:'Working'}],hidden:0};
 let shown=wait('shown','first');send({type:'snapshot',id:'first',image,version:2,config:DEFAULT_CONFIG,animations:ANIMATIONS,language:'en',notifications});await shown;
 let checked=wait('inspection','check');send({type:'inspect',id:'check'});const state=await checked;
 assert.equal(state.visible,true);assert.equal(state.topmost,true);assert.equal(state.noticesVisible,true);assert.notEqual(state.foreground,state.handle);
 assert.ok(state.styles & 0x08000000);assert.ok(state.styles & 0x00080000);assert.ok(state.styles & 0x00000080);
 assert.ok(state.bounds.x>=state.workArea.x);assert.ok(state.bounds.y>=state.workArea.y);
 const png=Buffer.from(state.image,'base64');await writeFile('.preview/native-pet.png',png);const raw=await sharp(png).ensureAlpha().raw().toBuffer();assert.equal(raw[3],0);assert.ok(raw.some((value,index)=>index%4===3 && value>0));
 const bubble=Buffer.from(state.noticeImage,'base64');await writeFile('.preview/native-notice.png',bubble);
 assert.ok(state.toolbarBounds.y>=state.bounds.y+state.bounds.height);
 assert.ok(state.noticeBounds.y>=state.toolbarBounds.y+state.toolbarBounds.height);
 assert.ok(Math.abs((state.bounds.x+state.bounds.width/2)-(state.noticeBounds.x+state.noticeBounds.width/2))<=1);
 const noticePixels=await sharp(bubble).ensureAlpha().raw().toBuffer();assert.equal(noticePixels[3],0);
 const tool=Buffer.from(state.toolbarImage,'base64');
 const left=Math.min(state.bounds.x,state.noticeBounds.x),top=Math.min(state.bounds.y,state.noticeBounds.y),right=Math.max(state.bounds.x+state.bounds.width,state.noticeBounds.x+state.noticeBounds.width),bottom=Math.max(state.bounds.y+state.bounds.height,state.noticeBounds.y+state.noticeBounds.height);
 await sharp({create:{width:right-left,height:bottom-top,channels:4,background:{r:246,g:248,b:251,alpha:1}}}).composite([{input:bubble,left:state.noticeBounds.x-left,top:state.noticeBounds.y-top},{input:tool,left:state.toolbarBounds.x-left,top:state.toolbarBounds.y-top},{input:png,left:state.bounds.x-left,top:state.bounds.y-top}]).png().toFile('.preview/native-composition.png');
 send({type:'fixture-ui',action:'new'});checked=wait('inspection','draft');send({type:'inspect',id:'draft'});assert.equal((await checked).composerVisible,true);
 send({type:'composer',state:'idle',text:'模拟语音识别文本'});checked=wait('inspection','transcript');send({type:'inspect',id:'transcript'});assert.equal((await checked).composerText,'模拟语音识别文本');
 const sent=wait('command');send({type:'fixture-ui',action:'send'});assert.equal((await sent).command.type,'send-message');
 send({type:'fixture-ui',action:'collapse'});checked=wait('inspection','folded');send({type:'inspect',id:'folded'});const folded=await checked;assert.equal(folded.collapsed,true);assert.equal(folded.composerVisible,false);assert.equal(folded.noticesVisible,false);
 await writeFile('.preview/native-toolbar-collapsed.png',Buffer.from(folded.toolbarImage,'base64'));
 shown=wait('shown','hide');send({type:'snapshot',id:'hide',version:2,config:{...DEFAULT_CONFIG,visible:false},animations:ANIMATIONS,language:'en',notifications});await shown;
 checked=wait('inspection','hidden');send({type:'inspect',id:'hidden'});assert.equal((await checked).visible,false);
 console.log('native layered window, transparency, no activation, topmost, notifications, DPI and hide PASS');
 console.log(JSON.stringify({scale:state.scale,bounds:state.bounds,workArea:state.workArea}));
}finally{
 for(const waiter of waiters)clearTimeout(waiter.timer);
 const exited=new Promise(resolve=>helper.once('exit',resolve));send({type:'close'});helper.stdin.end();
 const timeout=setTimeout(()=>helper.kill(),5000);code=await exited;clearTimeout(timeout);lines.close();
 console.log('owned helper exit='+code);
 if(errors)console.log(errors.slice(-5000));
}
