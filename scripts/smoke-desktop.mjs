import {spawn} from 'node:child_process';
import {createInterface} from 'node:readline';
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import assert from 'node:assert/strict';
import sharp from 'sharp';
import {ANIMATIONS,DEFAULT_CONFIG} from '../src/model.ts';
if(process.platform!=='win32'){console.log('Desktop smoke requires Windows');process.exit(0);}
await mkdir('.preview',{recursive:true});
const helper=spawn('powershell.exe',['-NoProfile','-NonInteractive','-STA','-ExecutionPolicy','Bypass','-File','native/desktop-pet.ps1','-ParentProcessId',String(process.pid)],{windowsHide:true,stdio:['pipe','pipe','pipe']});
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
