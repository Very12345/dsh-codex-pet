const {app,BrowserWindow,ipcMain,screen,dialog}=require('electron');
const {join}=require('node:path');const readline=require('node:readline');const {createConnection}=require('node:net');
const parent=Number(process.argv.find(value=>value.startsWith('--parent-pid='))?.split('=')[1]);
app.setAppUserModelId('org.very12345.dsh-floating-pet');
let win,snapshot,zones=[],drag,closed=false,currentImage='',fixture=process.env.DSH_PET_NATIVE_TEST==='1',choosingFiles=false;
let pipeReady=false,pageReady=false;
const pipe=createConnection({host:'127.0.0.1',port:Number(process.env.DSH_FLOATING_PET_BRIDGE_PORT)});
pipe.on('error',quit);pipe.on('close',quit);pipe.on('connect',()=>{pipe.write(JSON.stringify({token:process.env.DSH_FLOATING_PET_BRIDGE_TOKEN,pid:process.pid})+'\n');pipeReady=true;ready();});
function ready(){if(pipeReady&&pageReady)emit({type:'ready',pid:process.pid});}
function emit(value){if(closed)return;try{process.stdout.write(JSON.stringify(value)+'\n');}catch{quit();}}
function quit(){if(closed)return;closed=true;app.quit();}
process.stdout.on('error',quit);process.stderr.on('error',quit);
function owner(event){return win && event.sender===win.webContents && event.senderFrame===win.webContents.mainFrame;}
function placement(height){
 const displays=screen.getAllDisplays(),position=snapshot?.config?.desktopPosition;
 const display=displays.find(display=>'display:'+display.id===position?.screen)||screen.getPrimaryDisplay();const area=display.workArea;
 const petWidth=Math.max(64,Math.min(224,snapshot?.config?.size||120)),width=360;
 const x=area.x+(position?.x??.96)*Math.max(0,area.width-petWidth)-(width-petWidth)/2;
 const y=area.y+(position?.y??.96)*Math.max(0,area.height-petWidth*208/192);
 return {x:Math.round(Math.max(area.x,Math.min(area.x+area.width-width,x))),y:Math.round(Math.max(area.y,Math.min(area.y+area.height-height,y))),width,height};
}
function updateSize(height){if(!win || closed)return;const size=Math.min(screen.getDisplayMatching(win.getBounds()).workArea.height,Math.max(160,Math.ceil(height)));const bounds=win.getBounds();win.setBounds({...bounds,height:size,y:Math.min(bounds.y,screen.getDisplayMatching(bounds).workArea.y+screen.getDisplayMatching(bounds).workArea.height-size)},false);}
function validZones(value){return Array.isArray(value)?value.slice(0,100).filter(rect=>['x','y','width','height'].every(key=>Number.isFinite(rect[key]))&&rect.width>=0&&rect.height>=0):[];}
app.whenReady().then(()=>{
 win=new BrowserWindow({width:360,height:500,x:0,y:0,show:false,frame:false,transparent:true,backgroundColor:'#00000000',alwaysOnTop:true,skipTaskbar:true,resizable:false,hasShadow:false,title:'DSH Floating Pet',webPreferences:{preload:join(__dirname,'preload.cjs'),contextIsolation:true,nodeIntegration:false,sandbox:true,backgroundThrottling:false}});
 win.setAlwaysOnTop(true,'floating');win.setIgnoreMouseEvents(true,{forward:true});
 win.webContents.setWindowOpenHandler(()=>({action:'deny'}));win.webContents.on('will-navigate',event=>event.preventDefault());
 win.webContents.session.setPermissionRequestHandler((_contents,_permission,callback)=>callback(false));
 ipcMain.on('pet:focus',event=>{if(owner(event)){win.setIgnoreMouseEvents(false);win.focus();}});
 ipcMain.handle('pet:files',async event=>{if(!owner(event))return [];choosingFiles=true;try{const result=await dialog.showOpenDialog(win,{properties:['openFile','multiSelections']});return result.canceled?[]:result.filePaths;}finally{choosingFiles=false;if(!closed)win.focus();}});
 win.on('blur',()=>{if(!choosingFiles&&!closed)win.webContents.send('pet:message',{type:'window-blur'});});
 ipcMain.on('pet:zones',(event,value)=>{if(owner(event))zones=validZones(value);});
 ipcMain.on('pet:height',(event,value)=>{if(owner(event)&&Number.isFinite(value))updateSize(value);});
 ipcMain.on('pet:drag',(event,active)=>{
  if(!owner(event))return;
  if(active){drag={cursor:screen.getCursorScreenPoint(),bounds:win.getBounds()};return;}
  if(!drag)return;
  drag=undefined;
  const bounds=win.getBounds(),display=screen.getDisplayMatching(bounds),area=display.workArea,petWidth=snapshot?.config?.size||120;
  emit({type:'config',value:{desktopPosition:{screen:'display:'+display.id,
   x:Math.max(0,Math.min(1,(bounds.x+(bounds.width-petWidth)/2-area.x)/Math.max(1,area.width-petWidth))),
   y:Math.max(0,Math.min(1,(bounds.y-area.y)/Math.max(1,area.height-petWidth*208/192)))
  }}});
 });
 ipcMain.on('pet:event',(event,value)=>{if(!owner(event)||!value||typeof value!=='object')return;if(['shown','command','settings','config','native-error'].includes(value.type))emit(value);});
 win.webContents.on('did-finish-load',()=>{pageReady=true;ready();});
 const lines=readline.createInterface({input:pipe});lines.on('close',quit);lines.on('line',async line=>{
  let value;try{value=JSON.parse(line);}catch{return;}
  if(value.type==='close'){quit();return;}
  if(value.type==='snapshot'){
   const first=!snapshot,previous=snapshot?.config?.desktopPosition;snapshot=value;if(value.image)currentImage=value.image;value={...value,image:currentImage};
   if(first||JSON.stringify(previous)!==JSON.stringify(value.config?.desktopPosition))win.setBounds(placement(win.getBounds().height),false);
   win.webContents.send('pet:message',value);if(value.config?.visible!==false){if(!win.isVisible())win.showInactive();}else win.hide();
  }else if(value.type==='inspect'){
   try{const state=await win.webContents.executeJavaScript('window.__petInspect()');const screenshot=await win.webContents.capturePage();emit({type:'inspection',id:value.id,pid:process.pid,visible:win.isVisible(),focused:win.isFocused(),topmost:win.isAlwaysOnTop(),bounds:win.getBounds(),workArea:screen.getDisplayMatching(win.getBounds()).workArea,scale:screen.getDisplayMatching(win.getBounds()).scaleFactor,image:screenshot.toPNG().toString('base64'),...state});}catch(error){emit({type:'native-error',error:error.message});}
  }else if(value.type==='fixture-ui'&&fixture){
   if(value.action==='blur'){const focusSink=new BrowserWindow({width:180,height:80,show:true,frame:false,skipTaskbar:true,title:'Pet test focus fixture',webPreferences:{sandbox:true}});focusSink.focus();setTimeout(()=>focusSink.destroy(),250);}
   else win.webContents.send('pet:message',value);
  }
  else if(['result','composer'].includes(value.type))win.webContents.send('pet:message',value);
 });
 const pointer=setInterval(()=>{
  if(closed||!win)return;const cursor=screen.getCursorScreenPoint(),bounds=win.getBounds();
  if(drag){const dx=cursor.x-drag.cursor.x,dy=cursor.y-drag.cursor.y;if(!drag.moved&&Math.abs(dx)<4&&Math.abs(dy)<4)return;drag.moved=true;const area=screen.getDisplayNearestPoint(cursor).workArea;win.setPosition(Math.round(Math.max(area.x,Math.min(area.x+area.width-bounds.width,drag.bounds.x+dx))),Math.round(Math.max(area.y,Math.min(area.y+area.height-bounds.height,drag.bounds.y+dy))),false);win.webContents.send('pet:message',{type:'drag-motion',dx});return;}
  const x=cursor.x-bounds.x,y=cursor.y-bounds.y;
  const hit=zones.some(rect=>{if(x<rect.x||y<rect.y||x>=rect.x+rect.width||y>=rect.y+rect.height)return false;if(!rect.mask)return true;const px=Math.floor((x-rect.x)/rect.width*192),py=Math.floor((y-rect.y)/rect.height*208),i=py*192+px,mask=Buffer.from(rect.mask,'base64');return !!(mask[i>>3]&(1<<(i&7)));});
  win.setIgnoreMouseEvents(!hit,{forward:true});
 },40);
 const watch=setInterval(()=>{if(parent>0)try{process.kill(parent,0);}catch(error){if(error.code==='ESRCH')quit();}},1000);
 win.on('closed',()=>{clearInterval(pointer);clearInterval(watch);quit();});
 void win.loadFile(join(__dirname,'index.html'));
});
app.on('window-all-closed',quit);
