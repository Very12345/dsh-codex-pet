import {createHost} from '../lib/index.js';import {mkdtemp,writeFile,rm} from 'node:fs/promises';import {tmpdir} from 'node:os';import {join} from 'node:path';import sharp from 'sharp';import assert from 'node:assert/strict';
if(process.platform!=='win32'){console.log('Desktop smoke requires Windows');process.exit(0);}
const directory=await mkdtemp(join(tmpdir(),'pet-electron-'));const host=await createHost({dataRoot:directory,fixture:true});
try{
 const {token}=await host.desktop.begin('electron-check');
 const pet=host.library.pets.find(pet=>pet.id===host.library.config.selected);
 const image=(await sharp(await host.library.asset(pet.id)).png().toBuffer()).toString('base64');
 await host.desktop.publish(token,{image,spriteKey:pet.url,language:'zh-CN',theme:'light',notifications:{activity:{pose:'running'},items:[{id:'fixture',token:'1',title:'阅读科研项目内容',pose:'running',text:'正在思考'}],hidden:0}});
 await new Promise(resolve=>setTimeout(resolve,400));
 const state=await host.desktop.inspect();assert.equal(state.visible,true);assert.equal(state.topmost,true);assert.equal(state.noticesVisible,true);
 assert.equal(state.above,true);assert.ok(state.noticeBounds.y<state.petBounds.y,'bottom pet displays notifications above');
 const petScreenY=state.bounds.y+state.petBounds.y;
 for(const action of ['drag-loss','drag-cancel','drag-native-up','drag-escape','blur']){
  host.desktop['send']({type:'fixture-ui',action:'drag-start'});await new Promise(resolve=>setTimeout(resolve,80));
  let active=await host.desktop.inspect();const dragDeadline=Date.now()+1500;while((!active.nativeDragging||!active.rendererDragging)&&Date.now()<dragDeadline){await new Promise(resolve=>setTimeout(resolve,40));active=await host.desktop.inspect();}assert.equal(active.nativeDragging,true,'native drag should start before '+action);assert.equal(active.rendererDragging,true);
  if(action==='drag-loss'){host.desktop['send']({type:'fixture-ui',action:'drag-stale'});await new Promise(resolve=>setTimeout(resolve,80));const retained=await host.desktop.inspect();assert.equal(retained.nativeDragging,true);assert.equal(retained.rendererDragging,true,'old drag acknowledgements must not cancel a newer drag');}
  host.desktop['send']({type:'fixture-ui',action});await new Promise(resolve=>setTimeout(resolve,action==='blur'?300:100));
  const stopped=await host.desktop.inspect();assert.equal(stopped.nativeDragging,false,action+' clears native drag');assert.equal(stopped.rendererDragging,false,action+' clears renderer capture');
  await new Promise(resolve=>setTimeout(resolve,120));assert.deepEqual((await host.desktop.inspect()).bounds,stopped.bounds,action+' leaves position stable');
  host.desktop['send']({type:'fixture-ui',action:'drag-reset'});await new Promise(resolve=>setTimeout(resolve,80));
 }
 console.log('capture loss, pointer cancel, native mouse-up without DOM release, Escape and focus loss end drag in both processes PASS');
 host.desktop['send']({type:'fixture-ui',action:'hover',hover:true});await new Promise(resolve=>setTimeout(resolve,120));
 const hovered=await host.desktop.inspect();assert.equal(hovered.toolbarButtonCount,3);
 assert.ok(state.cell.row<9,'ordinary cursor positions must not replace the idle/status animation with a gaze frame');
 await writeFile('.preview/electron-expanded.png',Buffer.from(state.image,'base64'));
 console.log(JSON.stringify({bounds:state.bounds,cell:state.cell,scale:state.scale}));
 host.desktop['send']({type:'fixture-ui',action:'new'});await new Promise(resolve=>setTimeout(resolve,200));
 const draft=await host.desktop.inspect();assert.equal(draft.composerVisible,true);await writeFile('.preview/electron-composer.png',Buffer.from(draft.image,'base64'));
 assert.equal(draft.toolbarBounds,undefined);assert.ok(draft.petBounds);
 assert.ok(Math.abs(draft.bounds.y+draft.petBounds.y-petScreenY)<=1,'expanding the composer preserves pet position');
 host.desktop['send']({type:'fixture-ui',action:'text',text:'未发送的测试草稿'});await new Promise(resolve=>setTimeout(resolve,100));
 host.desktop['send']({type:'fixture-ui',action:'outside'});await new Promise(resolve=>setTimeout(resolve,150));
 const outside=await host.desktop.inspect();assert.equal(outside.composerVisible,false);assert.equal(outside.composerText,'未发送的测试草稿');assert.ok(outside.toolbarBounds);assert.ok(outside.cell.row<9);
 host.desktop['send']({type:'fixture-ui',action:'new'});await new Promise(resolve=>setTimeout(resolve,150));
 const reopened=await host.desktop.inspect();assert.equal(reopened.composerVisible,true);assert.equal(reopened.composerText,'未发送的测试草稿');assert.equal(reopened.focused,true);assert.ok(reopened.cell.row>=9,'active editor caret supplies the directional target');
 host.desktop['send']({type:'fixture-ui',action:'blur'});await new Promise(resolve=>setTimeout(resolve,400));
 const blurred=await host.desktop.inspect();assert.equal(blurred.composerVisible,false);assert.equal(blurred.composerText,'未发送的测试草稿');assert.ok(blurred.toolbarBounds);
 host.desktop['send']({type:'fixture-ui',action:'collapse'});await new Promise(resolve=>setTimeout(resolve,100));const folded=await host.desktop.inspect();assert.equal(folded.collapsed,true);assert.equal(folded.composerVisible,false);
 await host.library.update({desktopPosition:{screen:'display:fixture',x:.8,y:.1}});
 const notice={id:'fixture',token:'2',title:'Respond to greeting',pose:'review',preview:'你是指“红温”这个网络用语吗？它通常形容一个人气到脸红、情绪上头。'};
 await host.desktop.publish(token,{spriteKey:pet.url,language:'zh-CN',theme:'light',notifications:{activity:{pose:'review'},items:[notice],hidden:0}});
 host.desktop['send']({type:'fixture-ui',action:'new'});await new Promise(resolve=>setTimeout(resolve,120));host.desktop['send']({type:'fixture-ui',action:'outside'});await new Promise(resolve=>setTimeout(resolve,120));
 const top=await host.desktop.inspect();assert.equal(top.above,false);assert.ok(top.noticeBounds.y>top.petBounds.y);assert.ok(top.noticePreview.includes('它通常形容'));
 await writeFile('.preview/electron-top-notice.png',Buffer.from(top.image,'base64'));
 host.desktop['send']({type:'fixture-ui',action:'reply',id:'fixture'});await new Promise(resolve=>setTimeout(resolve,120));const reply=await host.desktop.inspect();assert.equal(reply.replyVisible,true);assert.equal(reply.replyStyle.iconWidth,20);assert.equal(reply.replyStyle.color,'rgb(159, 159, 159)');assert.equal(reply.replyStyle.background,'rgb(232, 232, 232)');await writeFile('.preview/electron-follow-up.png',Buffer.from(reply.image,'base64'));
 host.desktop['send']({type:'fixture-ui',action:'reply-hover'});await new Promise(resolve=>setTimeout(resolve,150));const hoverReply=await host.desktop.inspect();assert.equal(hoverReply.replyStyle.color,'rgb(255, 255, 255)');assert.equal(hoverReply.replyStyle.background,'rgb(175, 175, 175)');await writeFile('.preview/electron-reply-hover.png',Buffer.from(hoverReply.image,'base64'));
 await host.desktop.publish(token,{spriteKey:pet.url,language:'zh-CN',theme:'light',notifications:{activity:{pose:'idle'},items:[],hidden:0}});
 host.desktop['send']({type:'fixture-ui',action:'hover',hover:true});await new Promise(resolve=>setTimeout(resolve,120));assert.equal((await host.desktop.inspect()).toolbarButtonCount,2);
 host.desktop['send']({type:'fixture-ui',action:'hover',hover:false});await new Promise(resolve=>setTimeout(resolve,300));const compact=await host.desktop.inspect();assert.equal(compact.toolbarButtonCount,0);assert.deepEqual(compact.toolbarAppearance,{width:17,height:6});await writeFile('.preview/electron-idle-compact.png',Buffer.from(compact.image,'base64'));
 for(const x of [0,1]){
  await host.library.update({desktopPosition:{screen:'display:fixture',x,y:0}});
  await host.desktop.publish(token,{spriteKey:pet.url,language:'zh-CN',theme:'light',notifications:{activity:{pose:'review'},items:[notice],hidden:0}});await new Promise(resolve=>setTimeout(resolve,150));
  const edge=await host.desktop.inspect(),petX=edge.bounds.x+edge.petBounds.x,noticeX=edge.bounds.x+edge.noticeBounds.x;
  assert.ok(Math.abs(petX-(x?edge.workArea.x+edge.workArea.width-edge.petBounds.width:edge.workArea.x))<=1);assert.equal(edge.bounds.y+edge.petBounds.y,edge.workArea.y);
  assert.ok(noticeX>=edge.workArea.x+11&&noticeX+edge.noticeBounds.width<=edge.workArea.x+edge.workArea.width-11,'notification remains readable at either pet edge');
  await writeFile('.preview/electron-edge-'+(x?'right':'left')+'.png',Buffer.from(edge.image,'base64'));
 }
 console.log('actual Electron hover controls (2/3 actions), compact idle, top/bottom placement, stable pet anchor, reply preview/editor, outside-click/native blur and retained drafts PASS');
}finally{host.dispose();await rm(directory,{recursive:true,force:true});}
