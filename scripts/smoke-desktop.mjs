import {createHost} from '../lib/index.js';import {mkdtemp,writeFile,rm} from 'node:fs/promises';import {tmpdir} from 'node:os';import {join} from 'node:path';import sharp from 'sharp';import assert from 'node:assert/strict';
import {PassThrough} from 'node:stream';
if(process.platform!=='win32'){console.log('Desktop smoke requires Windows');process.exit(0);}
const directory=await mkdtemp(join(tmpdir(),'pet-electron-'));const host=await createHost({dataRoot:directory,fixture:true});
try{
 const {token}=await host.desktop.begin('electron-check');
 const commands=[];const stream=new PassThrough();stream.writeHead=()=>{};stream.on('data',chunk=>{const match=String(chunk).match(/^event: command\ndata: (.+)\n\n$/);if(match){const message=JSON.parse(match[1]);commands.push(message.command);setImmediate(()=>{try{host.desktop.acknowledge(token,message.id,undefined);}catch{}});}});host.desktop.attach(token,stream);
 const pet=host.library.pets.find(pet=>pet.id===host.library.config.selected);
 const image=(await sharp(await host.library.asset(pet.id)).png().toBuffer()).toString('base64');
 await host.desktop.publish(token,{image,spriteKey:pet.url,language:'zh-CN',theme:'light',notifications:{activity:{pose:'running'},items:[{id:'fixture',token:'1',title:'阅读科研项目内容',pose:'running',text:'正在思考'}],hidden:0}});
 await new Promise(resolve=>setTimeout(resolve,400));
 let state=await host.desktop.inspect();const paintedDeadline=Date.now()+4000;while((!state.visible||!state.topmost||!state.noticesVisible)&&Date.now()<paintedDeadline){await new Promise(resolve=>setTimeout(resolve,100));state=await host.desktop.inspect();}assert.equal(state.visible,true,'visible');assert.equal(state.topmost,true,'topmost');assert.equal(state.noticesVisible,true,'notices');
 assert.equal(state.above,true);assert.ok(state.noticeBounds.y<state.petBounds.y,'bottom pet displays notifications above');
 assert.equal(state.noticeSubtitle,'正在思考');assert.ok(state.noticeSubtitleBounds.y>=state.noticeTitleBounds.y+state.noticeTitleBounds.height,'progress is below the task title');assert.equal(state.noticeProgress,true);
 host.desktop['send']({type:'fixture-ui',action:'hover-region',hover:false});await new Promise(resolve=>setTimeout(resolve,450));state=await host.desktop.inspect();assert.equal(state.noticesVisible,true);assert.equal(state.toolbarExpanded,true);assert.equal(state.toolbarButtonCount,3);
 await writeFile('.preview/electron-thinking.png',Buffer.from(state.image,'base64'));
 for(const [phase,tool,preview,expected] of [['responding',undefined,'我先检查设置和相关文件。','我先检查设置和相关文件。'],['tool','read_file',undefined,'正在查看文件'],['thinking',undefined,'previous commentary','正在思考'],['preparing-tool',undefined,undefined,'正在准备工具调用'],['compacting',undefined,undefined,'正在整理上下文']]){
  await host.desktop.publish(token,{spriteKey:pet.url,language:'zh-CN',theme:'light',notifications:{activity:{pose:'running'},items:[{id:'fixture',token:'1',title:'阅读科研项目内容',pose:'running',phase,tool,preview}],hidden:0}});await new Promise(resolve=>setTimeout(resolve,80));
  const progress=await host.desktop.inspect();assert.equal(progress.noticeSubtitle,expected);assert.ok(progress.noticeSubtitleBounds.y>=progress.noticeTitleBounds.y+progress.noticeTitleBounds.height);assert.equal(progress.noticeProgress,true);
  await writeFile('.preview/electron-progress-'+phase+'.png',Buffer.from(progress.image,'base64'));
 }
 await host.desktop.publish(token,{spriteKey:pet.url,language:'zh-CN',theme:'light',notifications:{activity:{pose:'running'},items:[{id:'fixture',token:'1',title:'阅读科研项目内容',pose:'running',phase:'thinking'}],hidden:0}});await new Promise(resolve=>setTimeout(resolve,80));state=await host.desktop.inspect();
 for(const pose of ['running','review']){await host.desktop.publish(token,{spriteKey:pet.url,language:'zh-CN',theme:'light',notifications:{activity:{pose},items:[{id:'fixture',token:'1',title:'**格式标题**',pose,phase:'responding',preview:"## **结果**\n- 已保存 `file_name.ts`\n[文档](https://example.test/a)"}],hidden:0}});await new Promise(resolve=>setTimeout(resolve,100));const plain=await host.desktop.inspect();assert.equal(plain.noticeSubtitle,'结果 已保存 file_name.ts 文档');assert.ok(plain.noticePreview.includes('格式标题'));assert.ok(!plain.noticePreview.includes('**'));await writeFile('.preview/electron-markdown-'+pose+'.png',Buffer.from(plain.image,'base64'));}
 await host.desktop.publish(token,{spriteKey:pet.url,language:'zh-CN',theme:'light',notifications:{activity:{pose:'running'},items:[{id:'fixture',token:'1',title:'阅读科研项目内容',pose:'running',phase:'thinking'}],hidden:0}});await new Promise(resolve=>setTimeout(resolve,100));
 const petScreenY=state.bounds.y+state.petBounds.y;
 for(const action of ['drag-loss','drag-cancel','drag-native-up','drag-escape','blur']){
  host.desktop['send']({type:'fixture-ui',action:'drag-start'});await new Promise(resolve=>setTimeout(resolve,80));
  let active=await host.desktop.inspect();const dragDeadline=Date.now()+1500;while((!active.nativeDragging||!active.rendererDragging)&&Date.now()<dragDeadline){await new Promise(resolve=>setTimeout(resolve,40));active=await host.desktop.inspect();}assert.equal(active.nativeDragging,true,'native drag should start before '+action);assert.equal(active.rendererDragging,true);
  if(action==='drag-loss'){host.desktop['send']({type:'fixture-ui',action:'drag-stale'});await new Promise(resolve=>setTimeout(resolve,80));const retained=await host.desktop.inspect();assert.equal(retained.nativeDragging,true);assert.equal(retained.rendererDragging,true,'old drag acknowledgements must not cancel a newer drag');for(const direction of ['left','right']){host.desktop['send']({type:'fixture-ui',action:'drag-'+direction});await new Promise(resolve=>setTimeout(resolve,80));assert.equal((await host.desktop.inspect()).pose,'running-'+direction);}}
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
 host.desktop.composer(token,{state:'idle',error:'previous fixture voice error'});await new Promise(resolve=>setTimeout(resolve,100));assert.equal((await host.desktop.inspect()).composerError,'previous fixture voice error');host.desktop.composer(token,{state:'recording'});await new Promise(resolve=>setTimeout(resolve,100));assert.equal((await host.desktop.inspect()).composerError,'','a successful voice retry clears old feedback');host.desktop.composer(token,{state:'idle'});
 assert.ok(Math.abs(draft.bounds.y+draft.petBounds.y-petScreenY)<=1,'expanding the composer preserves pet position');
 host.desktop['send']({type:'fixture-ui',action:'text',text:'未发送的测试草稿'});await new Promise(resolve=>setTimeout(resolve,100));
 host.desktop['send']({type:'fixture-ui',action:'outside'});await new Promise(resolve=>setTimeout(resolve,150));
 const outside=await host.desktop.inspect();assert.equal(outside.composerVisible,false);assert.equal(outside.composerText,'未发送的测试草稿');assert.ok(outside.toolbarBounds);assert.ok(outside.cell.row<9);
 host.desktop['send']({type:'fixture-ui',action:'new'});await new Promise(resolve=>setTimeout(resolve,150));
 const reopened=await host.desktop.inspect();assert.equal(reopened.composerVisible,true);assert.equal(reopened.composerText,'未发送的测试草稿');assert.equal(reopened.focused,true);assert.ok(reopened.cell.row>=9,'active editor caret supplies the directional target');
 host.desktop['send']({type:'fixture-ui',action:'blur'});await new Promise(resolve=>setTimeout(resolve,400));
 const blurred=await host.desktop.inspect();assert.equal(blurred.composerVisible,false);assert.equal(blurred.composerText,'未发送的测试草稿');assert.ok(blurred.toolbarBounds);
 host.desktop['send']({type:'fixture-ui',action:'collapse'});await new Promise(resolve=>setTimeout(resolve,100));const folded=await host.desktop.inspect();assert.equal(folded.collapsed,true);assert.equal(folded.composerVisible,false);host.desktop['send']({type:'fixture-ui',action:'hover-region',hover:false});await new Promise(resolve=>setTimeout(resolve,450));const foldedControls=await host.desktop.inspect();assert.equal(foldedControls.toolbarExpanded,false);assert.equal(foldedControls.toolbarButtonCount,0);
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
 host.desktop['send']({type:'fixture-ui',action:'hover',hover:false});await new Promise(resolve=>setTimeout(resolve,300));const compact=await host.desktop.inspect();assert.equal(compact.toolbarButtonCount,0);assert.deepEqual(compact.toolbarAppearance,{width:23.5,height:6});assert.equal(compact.compactGripColor,'rgba(255, 255, 255, 0.96)');await writeFile('.preview/electron-idle-compact.png',Buffer.from(compact.image,'base64'));
 for(const x of [0,1]){
  await host.library.update({desktopPosition:{screen:'display:fixture',x,y:0}});
  await host.desktop.publish(token,{spriteKey:pet.url,language:'zh-CN',theme:'light',notifications:{activity:{pose:'review'},items:[notice],hidden:0}});await new Promise(resolve=>setTimeout(resolve,150));
  const edge=await host.desktop.inspect(),petX=edge.bounds.x+edge.petBounds.x,noticeX=edge.bounds.x+edge.noticeBounds.x;
  assert.ok(Math.abs(petX-(x?edge.workArea.x+edge.workArea.width-edge.petBounds.width:edge.workArea.x))<=1);assert.equal(edge.bounds.y+edge.petBounds.y,edge.workArea.y);
  assert.ok(noticeX>=edge.workArea.x+11&&noticeX+edge.noticeBounds.width<=edge.workArea.x+edge.workArea.width-11,'notification remains readable at either pet edge');
  await writeFile('.preview/electron-edge-'+(x?'right':'left')+'.png',Buffer.from(edge.image,'base64'));
 }
 // Exercise real native rendering for both row widths, three pet sizes and
 // both edges; fold around the same center and click the shifted actions.
 for(const size of [64,120,224])for(const x of [0,1])for(const count of [0,1]){
  await host.library.update({size,desktopPosition:{screen:'display:fixture',x,y:.15}});
  await host.desktop.publish(token,{spriteKey:pet.url,language:'zh-CN',theme:'light',notifications:{activity:{pose:count?'review':'idle'},items:count?[notice]:[],hidden:0}});
  host.desktop['send']({type:'fixture-ui',action:'hover-region',hover:true});await new Promise(resolve=>setTimeout(resolve,260));
  const row=await host.desktop.inspect(),width=count?120:80,petCenter=row.bounds.x+row.petBounds.x+size/2,center=row.bounds.x+row.toolbarBounds.x+row.toolbarBounds.width/2;
  assert.equal(row.toolbarButtonCount,count?3:2);assert.equal(row.toolbarBounds.width,width);
  const contains=(rect,px,py)=>px>=rect.x&&px<=rect.x+rect.width&&py>=rect.y&&py<=rect.y+rect.height;
  const rowCenter=row.toolbarBounds.x+width/2;
  for(const px of [row.toolbarBounds.x+10,row.toolbarBounds.right-10])assert.ok(row.hitZones.some(rect=>rect.hover&&contains(rect,px,row.toolbarBounds.y+20)),'hover envelope covers shifted outer actions');
  assert.ok(row.hitZones.some(rect=>!rect.hover&&contains(rect,rowCenter,row.toolbarBounds.y+20)),'native hit geometry follows the shifted toolbar');
  assert.ok(row.bounds.x+row.toolbarBounds.x>=row.workArea.x+15.5);
  assert.ok(row.bounds.x+row.toolbarBounds.right<=row.workArea.x+row.workArea.width-15.5);
  assert.ok(Math.abs(center-petCenter-row.toolbarOffsetX)<=.5);
  assert.ok(Math.abs(row.toolbarBounds.y-row.petBounds.bottom-4)<=.5,'controls sit four pixels below the frame');
  host.desktop['send']({type:'fixture-ui',action:'toolbar-click',index:0});await new Promise(resolve=>setTimeout(resolve,100));
  assert.equal((await host.desktop.inspect()).composerVisible,true,'shifted new-chat button is clickable');
  host.desktop['send']({type:'fixture-ui',action:'outside'});await new Promise(resolve=>setTimeout(resolve,100));
  host.desktop['send']({type:'fixture-ui',action:'hover-region',hover:true});await new Promise(resolve=>setTimeout(resolve,240));
  const calls=commands.filter(command=>command?.type==='call-toggle').length;
  host.desktop['send']({type:'fixture-ui',action:'toolbar-click',index:1});await new Promise(resolve=>setTimeout(resolve,100));
  assert.equal(commands.filter(command=>command?.type==='call-toggle').length,calls+1,'shifted voice action reaches the fixture host without recording');
  if(count){host.desktop['send']({type:'fixture-ui',action:'toolbar-click',index:2});await new Promise(resolve=>setTimeout(resolve,100));assert.equal((await host.desktop.inspect()).collapsed,true,'shifted fold action hides cards');}
  host.desktop['send']({type:'fixture-ui',action:'hover-region',hover:false});await new Promise(resolve=>setTimeout(resolve,550));
  const grip=await host.desktop.inspect();assert.equal(grip.toolbarExpanded,false);assert.deepEqual(grip.toolbarAppearance,{width:23.5,height:6});
  assert.ok(Math.abs(grip.bounds.x+grip.toolbarBounds.x+grip.toolbarBounds.width/2-center)<=.5,'fold keeps the inset action-row center');
  assert.ok(Math.abs(grip.toolbarBounds.y-grip.petBounds.bottom-4)<=.5,'fold keeps the same top anchor');
  const gripCenter=grip.toolbarBounds.x+23.5/2;
  for(const px of [gripCenter-width/2,gripCenter+width/2])assert.ok(grip.hitZones.some(rect=>rect.hover&&contains(rect,px,grip.toolbarBounds.y+20)),'compact hover envelope reserves the expanded row');
  await writeFile('.preview/electron-controls-'+size+'-'+(x?'right':'left')+'-'+(count?'tasks':'idle')+'.png',Buffer.from(grip.image,'base64'));
  if(count){host.desktop['send']({type:'fixture-ui',action:'hover-region',hover:true});await new Promise(resolve=>setTimeout(resolve,260));host.desktop['send']({type:'fixture-ui',action:'toolbar-click',index:2});await new Promise(resolve=>setTimeout(resolve,100));assert.equal((await host.desktop.inspect()).collapsed,false);}
 }
 for(const y of [0,1])for(const x of [0,1]){
  await host.library.update({size:120,desktopPosition:{screen:'display:fixture',x,y}});
  await host.desktop.publish(token,{spriteKey:pet.url,language:'zh-CN',theme:'light',notifications:{activity:{pose:'review'},items:[notice],hidden:0}});
  host.desktop['send']({type:'fixture-ui',action:'hover-region',hover:true});await new Promise(resolve=>setTimeout(resolve,260));
  const corner=await host.desktop.inspect();assert.equal(corner.toolbarExpanded,true);assert.equal(corner.petBounds.width,120);assert.equal(corner.above,!!y);
  assert.ok(Math.abs(corner.bounds.x+corner.petBounds.x-(x?corner.workArea.x+corner.workArea.width-120:corner.workArea.x))<=.5);
  assert.ok(Math.abs(corner.bounds.y+corner.petBounds.y-(y?corner.workArea.y+corner.workArea.height-130-48:corner.workArea.y))<=.5);
  assert.ok(corner.bounds.y+corner.toolbarBounds.y>=corner.workArea.y);
  assert.ok(corner.bounds.y+corner.toolbarBounds.bottom<=corner.workArea.y+corner.workArea.height-3.5,'full toolbar is inside the bottom edge');
  await writeFile('.preview/electron-controls-corner-'+x+'-'+y+'.png',Buffer.from(corner.image,'base64'));
  host.desktop['send']({type:'fixture-ui',action:'toolbar-click',index:2});await new Promise(resolve=>setTimeout(resolve,100));host.desktop['send']({type:'fixture-ui',action:'hover-region',hover:false});await new Promise(resolve=>setTimeout(resolve,550));
  const foldedCorner=await host.desktop.inspect();assert.equal(foldedCorner.toolbarExpanded,false);
  assert.equal(foldedCorner.bounds.y+foldedCorner.petBounds.y,corner.bounds.y+corner.petBounds.y);
  assert.ok(Math.abs(foldedCorner.bounds.y+foldedCorner.toolbarBounds.y-corner.bounds.y-corner.toolbarBounds.y)<=.5);
  host.desktop['send']({type:'fixture-ui',action:'hover-region',hover:true});await new Promise(resolve=>setTimeout(resolve,260));host.desktop['send']({type:'fixture-ui',action:'toolbar-click',index:2});await new Promise(resolve=>setTimeout(resolve,100));
 }
 console.log('native inset controls: 64/120/224px pets, both edges, 2/3 actions, 23.5×6 grip, stable collapse center and actual button clicks PASS');
 await host.library.update({size:120,desktopPosition:{screen:'display:fixture',x:.25,y:.25}});
 const publishAudit=async(pose,request)=>{await host.desktop.publish(token,{spriteKey:pet.url,language:'zh-CN',theme:'light',notifications:{activity:{pose},items:pose==='idle'?[]:[{id:'audit',token:'audit-round',title:'Isolated state audit',pose,request}],hidden:0}});await new Promise(resolve=>setTimeout(resolve,100));};
 host.desktop['send']({type:'fixture-ui',action:'pet-hover',hover:false});host.desktop['send']({type:'fixture-ui',action:'reduced',enabled:true});
 for(const [pose,row] of Object.entries({idle:0,running:7,review:8,waiting:6,failed:5})){
  await publishAudit(pose);const displayed=await host.desktop.inspect();assert.equal(displayed.pose,pose);assert.equal(displayed.cell.row,row);assert.equal(displayed.cell.column,0);await new Promise(resolve=>setTimeout(resolve,120));assert.equal((await host.desktop.inspect()).cell.column,0);
 }
 host.desktop['send']({type:'fixture-ui',action:'double-click'});await new Promise(resolve=>setTimeout(resolve,100));assert.equal((await host.desktop.inspect()).pose,'failed','double-click must not add a forced jumping override');
 host.desktop['send']({type:'fixture-ui',action:'pet-hover',hover:true});await new Promise(resolve=>setTimeout(resolve,100));assert.equal((await host.desktop.inspect()).pose,'jumping');host.desktop['send']({type:'fixture-ui',action:'pet-hover',hover:false});await new Promise(resolve=>setTimeout(resolve,100));assert.equal((await host.desktop.inspect()).pose,'failed');
 const pendingRequest={kind:'approval',key:'audit-request',toolName:'fixture_only_tool'};
 await publishAudit('waiting',pendingRequest);host.desktop['send']({type:'fixture-ui',action:'request',id:'audit'});await new Promise(resolve=>setTimeout(resolve,100));assert.equal((await host.desktop.inspect()).requestVisible,true);
 await publishAudit('running');assert.equal((await host.desktop.inspect()).requestVisible,false,'resolved request must disappear');
 await publishAudit('waiting',pendingRequest);host.desktop['send']({type:'fixture-ui',action:'request',id:'audit'});await new Promise(resolve=>setTimeout(resolve,100));host.desktop['send']({type:'fixture-ui',action:'collapse'});await new Promise(resolve=>setTimeout(resolve,100));assert.equal((await host.desktop.inspect()).requestVisible,false,'fold must close the request panel');host.desktop['send']({type:'fixture-ui',action:'collapse'});
 host.desktop['send']({type:'fixture-ui',action:'reduced',enabled:false});await publishAudit('running');host.desktop['send']({type:'fixture-ui',action:'reply',id:'audit'});await new Promise(resolve=>setTimeout(resolve,120));assert.ok((await host.desktop.inspect()).cell.row>=9,'follow-up caret must supply gaze while running');
 console.log('native state matrix, reduced motion, hover/drag priority, double-click, resolved/folded requests and follow-up caret gaze PASS');
 console.log('actual Electron hover controls (2/3 actions), compact idle, top/bottom placement, stable pet anchor, reply preview/editor, outside-click/native blur and retained drafts PASS');
}finally{host.dispose();await rm(directory,{recursive:true,force:true});}
