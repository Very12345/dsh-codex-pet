const {app,BrowserWindow,ipcMain,screen,dialog}=require('electron');
const {join}=require('node:path');const readline=require('node:readline');const {createConnection}=require('node:net');
const {execFile}=require('node:child_process');
const {petPlacement,overlayBounds,constrainPet,panelOffset,VIEWPORT_WIDTH}=require('./layout.cjs');
const parent=Number(process.argv.find(value=>value.startsWith('--parent-pid='))?.split('=')[1]);
app.setAppUserModelId('org.very12345.dsh-floating-pet');
let win,snapshot,zones=[],drag,closed=false,currentImage='',fixture=process.env.DSH_PET_NATIVE_TEST==='1',choosingFiles=false;
let pipeReady=false,pageReady=false;
let hostFocusRequests=0;
let anchor,petTop=12,layoutAbove=false,lastHover=false;
let leftPressed=false;
const pipe=createConnection({host:'127.0.0.1',port:Number(process.env.DSH_FLOATING_PET_BRIDGE_PORT)});
pipe.on('error',quit);pipe.on('close',quit);pipe.on('connect',()=>{pipe.write(JSON.stringify({token:process.env.DSH_FLOATING_PET_BRIDGE_TOKEN,pid:process.pid})+'\n');pipeReady=true;ready();});
function ready(){if(pipeReady&&pageReady)emit({type:'ready',pid:process.pid});}
function emit(value){if(closed)return;try{process.stdout.write(JSON.stringify(value)+'\n');}catch{quit();}}
function quit(){if(closed)return;closed=true;app.quit();}
process.stdout.on('error',quit);process.stderr.on('error',quit);
function owner(event){return win && event.sender===win.webContents && event.senderFrame===win.webContents.mainFrame;}
function nativeArea(display){return {...display.workArea,height:display.bounds.y+display.bounds.height-display.workArea.y};}
function anchorDisplay(){return anchor?screen.getDisplayNearestPoint({x:Math.round(anchor.x+anchor.size/2),y:Math.round(anchor.y+anchor.size*208/192/2)}):screen.getPrimaryDisplay();}
function publishLayout(){if(win&&anchor&&!closed)win.webContents.send('pet:message',{type:'layout',above:layoutAbove,panelOffsetX:panelOffset(anchor,nativeArea(anchorDisplay()))});}
function placement(height){
 const displays=screen.getAllDisplays(),position=snapshot?.config?.desktopPosition;
 const display=displays.find(display=>'display:'+display.id===position?.screen)||screen.getPrimaryDisplay();const area=nativeArea(display);
 anchor=petPlacement(snapshot?.config,area);layoutAbove=anchor.above;
 return overlayBounds(anchor,{height,petTop},area);
}
function updateSize(value){if(!win||closed||!anchor)return;const geometry=typeof value==='number'?{height:value,petTop}:value;if(!geometry||!Number.isFinite(geometry.height)||!Number.isFinite(geometry.petTop))return;petTop=geometry.petTop;const area=nativeArea(anchorDisplay());const next=overlayBounds(anchor,geometry,area),previous=win.getBounds();if(['x','y','width','height'].some(key=>previous[key]!==next[key]))win.setBounds(next,false);publishLayout();}
function validZones(value){return Array.isArray(value)?value.slice(0,100).filter(rect=>['x','y','width','height'].every(key=>Number.isFinite(rect[key]))&&rect.width>=0&&rect.height>=0):[];}
function endDrag(id){
 if(typeof id==='string'&&drag?.id!==id)return;
 leftPressed=false;const completed=drag;drag=undefined;
 if(!win||closed)return;if(completed)win.webContents.send('pet:message',{type:'drag-ended',id:completed.id});
 if(!completed?.moved)return;
 const bounds=win.getBounds(),display=anchorDisplay(),area=nativeArea(display),petWidth=snapshot?.config?.size||120;
 emit({type:'config',value:{desktopPosition:{screen:'display:'+display.id,x:Math.max(0,Math.min(1,(bounds.x+(bounds.width-petWidth)/2-area.x)/Math.max(1,area.width-petWidth))),y:Math.max(0,Math.min(1,(bounds.y+petTop-area.y)/Math.max(1,area.height-petWidth*208/192)))}}});
}
function beginDrag(id){
 if(!leftPressed){win.webContents.send('pet:message',{type:'drag-ended',id});return;}
 if(!drag){win.setIgnoreMouseEvents(false);drag={id,cursor:screen.getCursorScreenPoint(),bounds:win.getBounds(),started:Date.now(),fixture,anchor:{...anchor}};}
}
app.whenReady().then(()=>{
 win=new BrowserWindow({width:VIEWPORT_WIDTH,height:500,x:0,y:0,show:false,frame:false,transparent:true,backgroundColor:'#00000000',alwaysOnTop:true,skipTaskbar:true,resizable:false,hasShadow:false,title:'DSH Floating Pet',webPreferences:{preload:join(__dirname,'preload.cjs'),contextIsolation:true,nodeIntegration:false,sandbox:true,backgroundThrottling:false}});
 win.setAlwaysOnTop(true,'normal');win.setIgnoreMouseEvents(true,{forward:true});
 win.webContents.setWindowOpenHandler(()=>({action:'deny'}));win.webContents.on('will-navigate',event=>event.preventDefault());
 win.webContents.session.setPermissionRequestHandler((_contents,_permission,callback)=>callback(false));
 ipcMain.on('pet:focus',event=>{if(owner(event)){win.setIgnoreMouseEvents(false);win.focus();}});
 ipcMain.handle('pet:focus-host',async event=>{
  if(!owner(event))return {ok:false,error:'Desktop connection unavailable'};
  if(fixture){hostFocusRequests++;return {ok:true};}
  if(!Number.isInteger(parent)||parent<=0)return {ok:false,error:'DSH owner unavailable'};
  return await new Promise(resolve=>execFile(join(process.env.SystemRoot||'C:/Windows','System32/WindowsPowerShell/v1.0/powershell.exe'),['-NoProfile','-NonInteractive','-ExecutionPolicy','Bypass','-File',join(__dirname,'activate-host.ps1'),'-OwnerProcessId',String(parent)],{windowsHide:true,timeout:8000,maxBuffer:16384,encoding:'utf8'},(error,stdout)=>{
   if(error){resolve({ok:false,error:'会话已切换，但未能将 DSH 窗口带到前台。'});return;}
   try{resolve(JSON.parse(stdout));}catch{resolve({ok:false,error:'DSH 窗口状态无法确认。'});}
  }));
 });
 ipcMain.handle('pet:files',async event=>{if(!owner(event))return [];choosingFiles=true;try{const result=await dialog.showOpenDialog(win,{properties:['openFile','multiSelections']});return result.canceled?[]:result.filePaths;}finally{choosingFiles=false;if(!closed)win.focus();}});
 win.on('blur',()=>{endDrag();if(!choosingFiles&&!closed)win.webContents.send('pet:message',{type:'window-blur'});});
 win.on('hide',endDrag);
 win.webContents.on('before-mouse-event',(_event,mouse)=>{if(mouse.type==='mouseDown'&&mouse.button==='left')leftPressed=true;else if(mouse.type==='mouseUp'&&mouse.button==='left')endDrag();else if(drag&&mouse.type==='mouseMove'&&Array.isArray(mouse.modifiers)&&!mouse.modifiers.includes('leftButtonDown'))endDrag();});
 win.webContents.on('before-input-event',(_event,input)=>{if(input.type==='keyDown'&&input.key==='Escape')endDrag();});
 if(process.platform==='win32'){
  win.hookWindowMessage(0x0201,()=>{leftPressed=true;}); // WM_LBUTTONDOWN
  for(const message of [0x0202,0x00a2])win.hookWindowMessage(message,endDrag); // mouse release
  for(const message of [0x0215,0x001f])win.hookWindowMessage(message,()=>{if(drag)endDrag();}); // capture change/cancel after drag admission
  win.hookWindowMessage(0x0200,wParam=>{if(drag&&!(wParam.readUInt32LE(0)&1))endDrag();}); // WM_MOUSEMOVE without MK_LBUTTON
 }
 ipcMain.on('pet:zones',(event,value)=>{if(owner(event))zones=validZones(value);});
 ipcMain.on('pet:height',(event,value)=>{if(owner(event))updateSize(value);});
 ipcMain.on('pet:drag',(event,value)=>{
  if(!owner(event)||!value||typeof value.id!=='string'||!/^[a-f0-9-]{36}$/.test(value.id))return;
  if(value.active===true)beginDrag(value.id);else endDrag(value.id);
 });
 ipcMain.on('pet:event',(event,value)=>{if(!owner(event)||!value||typeof value!=='object')return;if(['shown','command','settings','config','native-error'].includes(value.type))emit(value);});
 win.webContents.on('did-finish-load',()=>{pageReady=true;ready();});
 const lines=readline.createInterface({input:pipe});lines.on('close',quit);lines.on('line',async line=>{
  let value;try{value=JSON.parse(line);}catch{return;}
  if(value.type==='close'){quit();return;}
  if(value.type==='snapshot'){
   const first=!snapshot,previous=snapshot?.config?.desktopPosition,previousSize=snapshot?.config?.size;snapshot=value;if(value.image)currentImage=value.image;value={...value,image:currentImage};
   if(first||previousSize!==value.config?.size||JSON.stringify(previous)!==JSON.stringify(value.config?.desktopPosition))win.setBounds(placement(win.getBounds().height),false);
   win.webContents.send('pet:message',value);publishLayout();if(value.config?.visible!==false){if(!win.isVisible()){win.showInactive();win.setAlwaysOnTop(true,'normal');}}else win.hide();
  }else if(value.type==='inspect'){
   try{const state=await win.webContents.executeJavaScript('window.__petInspect()');const screenshot=await win.webContents.capturePage();emit({type:'inspection',id:value.id,pid:process.pid,hostFocusRequests,nativeDragging:!!drag,visible:win.isVisible(),focused:win.isFocused(),topmost:win.isAlwaysOnTop(),bounds:win.getBounds(),workArea:nativeArea(anchorDisplay()),scale:anchorDisplay().scaleFactor,image:screenshot.toPNG().toString('base64'),...state});}catch(error){emit({type:'native-error',error:error.message});}
  }else if(value.type==='fixture-ui'&&fixture){
   if(value.action==='blur'){const focusSink=new BrowserWindow({width:180,height:80,show:true,frame:false,skipTaskbar:true,title:'Pet test focus fixture',webPreferences:{sandbox:true}});focusSink.focus();setTimeout(()=>focusSink.destroy(),250);}
   else if(value.action==='drag-start'){win.focus();win.setIgnoreMouseEvents(false);const state=await win.webContents.executeJavaScript('window.__petInspect()');const rect=state.petBounds;win.webContents.sendInputEvent({type:'mouseDown',button:'left',x:Math.round(rect.x+rect.width/2),y:Math.round(rect.y+rect.height/2),clickCount:1});}
   else if(value.action==='drag-native-up')win.webContents.emit('before-mouse-event',{}, {type:'mouseUp',button:'left'});
   else if(value.action==='drag-stale'){const old='00000000-0000-0000-0000-000000000000';endDrag(old);win.webContents.send('pet:message',{type:'drag-ended',id:old});}
   else if(value.action==='drag-left'||value.action==='drag-right')win.webContents.send('pet:message',{type:'drag-motion',dx:value.action==='drag-left'?-8:8});
   else if(value.action==='reply-hover'){const rect=await win.webContents.executeJavaScript('document.querySelector(".notice-actions .round").getBoundingClientRect().toJSON()');win.webContents.sendInputEvent({type:'mouseMove',x:Math.round(rect.x+rect.width/2),y:Math.round(rect.y+rect.height/2)});}
   else if(value.action==='drag-reset'){win.webContents.sendInputEvent({type:'mouseUp',button:'left',x:0,y:0,clickCount:1});win.webContents.sendInputEvent({type:'mouseMove',x:0,y:0});}
   else if(value.action==='drag-escape')win.webContents.sendInputEvent({type:'keyDown',keyCode:'Escape'});
   else win.webContents.send('pet:message',value);
  }
  else if(['result','composer','call-state'].includes(value.type))win.webContents.send('pet:message',value);
 });
 const pointer=setInterval(()=>{
  if(closed||!win)return;const cursor=screen.getCursorScreenPoint(),bounds=win.getBounds();
  if(drag){if(Date.now()-drag.started>30000){endDrag();return;}if(drag.fixture)return;const dx=cursor.x-drag.cursor.x,dy=cursor.y-drag.cursor.y;if(!drag.moved&&Math.abs(dx)<4&&Math.abs(dy)<4)return;drag.moved=true;const area=nativeArea(screen.getDisplayNearestPoint(cursor));anchor=constrainPet({...drag.anchor,x:drag.anchor.x+dx,y:drag.anchor.y+dy},area);layoutAbove=anchor.y+anchor.size*208/192/2>area.y+area.height/2;win.setBounds(overlayBounds(anchor,{height:bounds.height,petTop},area),false);publishLayout();win.webContents.send('pet:message',{type:'drag-motion',dx});return;}
  const x=cursor.x-bounds.x,y=cursor.y-bounds.y;
  const within=rect=>x>=rect.x&&y>=rect.y&&x<rect.x+rect.width&&y<rect.y+rect.height;
  const hover=zones.some(rect=>rect.hover&&Math.hypot(Math.max(rect.x-x,0,x-rect.x-rect.width),Math.max(rect.y-y,0,y-rect.y-rect.height))<=(lastHover?56:40));if(hover!==lastHover){lastHover=hover;win.webContents.send('pet:message',{type:'hover-region',hover});}
  const hit=zones.some(rect=>{if(rect.hover||!within(rect))return false;if(!rect.mask)return true;const px=Math.floor((x-rect.x)/rect.width*192),py=Math.floor((y-rect.y)/rect.height*208),i=py*192+px,mask=Buffer.from(rect.mask,'base64');return !!(mask[i>>3]&(1<<(i&7)));});
  win.setIgnoreMouseEvents(!hit,{forward:true});
 },40);
 const watch=setInterval(()=>{if(parent>0)try{process.kill(parent,0);}catch(error){if(error.code==='ESRCH')quit();}},1000);
 win.on('closed',()=>{clearInterval(pointer);clearInterval(watch);quit();});
 void win.loadFile(join(__dirname,'index.html'));
});
app.on('window-all-closed',quit);
