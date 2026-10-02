import test from 'node:test';import assert from 'node:assert/strict';import {createRequire} from 'node:module';
const {petPlacement,overlayBounds}=createRequire(import.meta.url)('../native/electron/layout.cjs');
const area={x:-1600,y:0,width:1600,height:1000};
test('messages go above a bottom pet and below a top pet',()=>{
 assert.equal(petPlacement({desktopPosition:{x:.8,y:.9}},area).above,true);
 assert.equal(petPlacement({desktopPosition:{x:.8,y:.1}},area).above,false);
});
test('changing message height preserves the pet screen position; bounds stay on the monitor',()=>{
 const anchor=petPlacement({desktopPosition:{x:.8,y:.5}},area);
 const first=overlayBounds(anchor,{height:250,petTop:12},area),second=overlayBounds(anchor,{height:380,petTop:142},area);
 assert.equal(first.y+12,second.y+142);assert.equal(first.x,second.x);
 const bottom=overlayBounds(petPlacement({desktopPosition:{x:1,y:1}},area),{height:400,petTop:200},area);assert.ok(bottom.y>=area.y&&bottom.y+bottom.height<=area.height);
});
