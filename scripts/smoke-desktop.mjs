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
 assert.ok(state.cell.row<9,'ordinary cursor positions must not replace the idle/status animation with a gaze frame');
 await writeFile('.preview/electron-expanded.png',Buffer.from(state.image,'base64'));
 console.log(JSON.stringify({bounds:state.bounds,cell:state.cell,scale:state.scale}));
 host.desktop['send']({type:'fixture-ui',action:'new'});await new Promise(resolve=>setTimeout(resolve,200));
 const draft=await host.desktop.inspect();assert.equal(draft.composerVisible,true);await writeFile('.preview/electron-composer.png',Buffer.from(draft.image,'base64'));
 assert.equal(draft.toolbarBounds,undefined);assert.ok(draft.petBounds);
 host.desktop['send']({type:'fixture-ui',action:'text',text:'未发送的测试草稿'});await new Promise(resolve=>setTimeout(resolve,100));
 host.desktop['send']({type:'fixture-ui',action:'outside'});await new Promise(resolve=>setTimeout(resolve,150));
 const outside=await host.desktop.inspect();assert.equal(outside.composerVisible,false);assert.equal(outside.composerText,'未发送的测试草稿');assert.ok(outside.toolbarBounds);assert.ok(outside.cell.row<9);
 host.desktop['send']({type:'fixture-ui',action:'new'});await new Promise(resolve=>setTimeout(resolve,150));
 const reopened=await host.desktop.inspect();assert.equal(reopened.composerVisible,true);assert.equal(reopened.composerText,'未发送的测试草稿');assert.equal(reopened.focused,true);assert.ok(reopened.cell.row>=9,'active editor caret supplies the directional target');
 host.desktop['send']({type:'fixture-ui',action:'blur'});await new Promise(resolve=>setTimeout(resolve,400));
 const blurred=await host.desktop.inspect();assert.equal(blurred.composerVisible,false);assert.equal(blurred.composerText,'未发送的测试草稿');assert.ok(blurred.toolbarBounds);
 host.desktop['send']({type:'fixture-ui',action:'collapse'});await new Promise(resolve=>setTimeout(resolve,100));const folded=await host.desktop.inspect();assert.equal(folded.collapsed,true);assert.equal(folded.composerVisible,false);
 console.log('actual Electron overlay, normal idle/status without global mouse gaze, outside-click/native blur dismissal, draft preservation and collapse PASS');
}finally{host.dispose();await rm(directory,{recursive:true,force:true});}
