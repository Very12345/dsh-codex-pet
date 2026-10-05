const VIEWPORT_WIDTH=768,PANEL_WIDTH=330;
function clamp(value,min,max){return Math.max(min,Math.min(max,value));}
function constrainPet(anchor,area){
 const size=anchor.size,height=size*208/192;
 return {...anchor,x:clamp(anchor.x,area.x,area.x+Math.max(0,area.width-size)),y:clamp(anchor.y,area.y,area.y+Math.max(0,area.height-height-48))};
}
function petPlacement(config,area){
 const size=Math.max(64,Math.min(224,config?.size||120)),position=config?.desktopPosition;
 const x=area.x+(position?.x??.96)*Math.max(0,area.width-size);
 const requestedY=area.y+(position?.y??.96)*Math.max(0,area.height-size*208/192);
 const anchor=constrainPet({x,y:requestedY,size},area);
 return {...anchor,above:anchor.y+size*208/192/2>area.y+area.height/2};
}
function overlayBounds(anchor,geometry,area){
 // The transparent draw window may cross the display edge; only the pet is
 // constrained. Readable panels have their own inward offset.
 return {x:Math.round(anchor.x-(VIEWPORT_WIDTH-anchor.size)/2),y:Math.round(anchor.y-geometry.petTop),width:VIEWPORT_WIDTH,height:Math.max(1,Math.ceil(geometry.height))};
}
function panelOffset(anchor,area){
 const center=anchor.x+anchor.size/2,desired=center-PANEL_WIDTH/2;
 return Math.round(clamp(desired,area.x+12,area.x+area.width-PANEL_WIDTH-12)-desired);
}
function toolbarOffset(anchor,area,width){
 // Position the full action row inside its readable composer frame. The
 // compact grip shrinks around that same center, rather than the pet center.
 const frameWidth=Math.min(PANEL_WIDTH,Math.max(0,area.width-32));
 const center=anchor.x+anchor.size/2;
 const frameLeft=clamp(center-frameWidth/2,area.x+16,area.x+area.width-16-frameWidth);
 const rowLeft=clamp(center-width/2,frameLeft,frameLeft+frameWidth-width);
 return rowLeft+width/2-center;
}
module.exports={petPlacement,overlayBounds,constrainPet,panelOffset,toolbarOffset,VIEWPORT_WIDTH,PANEL_WIDTH};
