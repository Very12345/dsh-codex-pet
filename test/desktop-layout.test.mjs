import test from 'node:test';import assert from 'node:assert/strict';import {createRequire} from 'node:module';
const {petPlacement,overlayBounds,panelOffset,PANEL_WIDTH}=createRequire(import.meta.url)('../native/electron/layout.cjs');
const area={x:-1600,y:0,width:1600,height:1000};
test('messages go above a bottom pet and below a top pet',()=>{
 assert.equal(petPlacement({desktopPosition:{x:.8,y:.9}},area).above,true);
 assert.equal(petPlacement({desktopPosition:{x:.8,y:.1}},area).above,false);
});
test('changing message height preserves pet position without constraining the transparent viewport',()=>{
 const anchor=petPlacement({desktopPosition:{x:.8,y:.5}},area);
 const first=overlayBounds(anchor,{height:250,petTop:12},area),second=overlayBounds(anchor,{height:380,petTop:142},area);
 assert.equal(first.y+12,second.y+142);assert.equal(first.x,second.x);
 const anchorAtEdge=petPlacement({desktopPosition:{x:1,y:1}},area),bottom=overlayBounds(anchorAtEdge,{height:400,petTop:200},area);
 assert.equal(bottom.x+(bottom.width-anchorAtEdge.size)/2+anchorAtEdge.size,area.x+area.width);
 assert.ok(bottom.x+bottom.width>area.x+area.width,'transparent viewport may extend beyond display');
 assert.equal(anchorAtEdge.y+anchorAtEdge.size*208/192,area.height-40);
});
test('pet reaches both horizontal edges while panels retain a twelve-pixel readable inset',()=>{
 for(const x of [0,1]){
  const anchor=petPlacement({desktopPosition:{x,y:0}},area);
  assert.equal(anchor.x,x?area.x+area.width-anchor.size:area.x);assert.equal(anchor.y,area.y);
  const panelX=anchor.x+anchor.size/2-PANEL_WIDTH/2+panelOffset(anchor,area);
  assert.ok(panelX>=area.x+12&&panelX+PANEL_WIDTH<=area.x+area.width-12);
 }
});
