function petPlacement(config,area){
 const size=Math.max(64,Math.min(224,config?.size||120)),position=config?.desktopPosition;
 const x=area.x+(position?.x??.96)*Math.max(0,area.width-size);
 const requestedY=area.y+(position?.y??.96)*Math.max(0,area.height-size*208/192);
 // Reserve the standard composer below the mascot so hover/input expansion
 // does not repeatedly push a bottom-edge pet upward.
 const y=Math.max(area.y+12,Math.min(area.y+area.height-size*208/192-96,requestedY));
 return {x,y,above:y+size*208/192/2>area.y+area.height/2,size};
}
function overlayBounds(anchor,geometry,area){
 const width=360,height=Math.min(area.height,Math.max(1,Math.ceil(geometry.height)));
 return {x:Math.round(Math.max(area.x,Math.min(area.x+area.width-width,anchor.x-(width-anchor.size)/2))),y:Math.round(Math.max(area.y,Math.min(area.y+area.height-height,anchor.y-geometry.petTop))),width,height};
}
module.exports={petPlacement,overlayBounds};
