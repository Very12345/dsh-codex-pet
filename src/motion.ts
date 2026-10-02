/** Independently implemented playback using measured Codex 26.930 sprite facts. */
import {ANIMATIONS,type Pose} from './model.ts';
export interface SpriteFrame {row:number;column:number;duration:number}
export function motionFrames(pose:Pose,reduced=false,continuous=false){
 const animation=ANIMATIONS[pose];
 const frames=animation.durations.map((duration,column)=>({row:animation.row,column,duration}));
 if(reduced)return {frames:[frames[0]],loop:0};
 const idle=ANIMATIONS.idle.durations.map((duration,column)=>({row:0,column,duration:duration*6}));
 if(pose==='idle')return {frames:idle,loop:0};
 if(continuous)return {frames,loop:0};
 const burst=[...frames,...frames,...frames];return {frames:[...burst,...idle],loop:burst.length};
}
export function motionFrameAt(pose:Pose,elapsed:number,reduced=false,continuous=false):SpriteFrame{
 const plan=motionFrames(pose,reduced,continuous),total=plan.frames.reduce((n,frame)=>n+(frame?.duration??0),0);
 let time=Math.max(0,elapsed);
 if(time>=total){const lead=plan.frames.slice(0,plan.loop).reduce((n,frame)=>n+(frame?.duration??0),0);const loopTime=total-lead;time=lead+(time-lead)%Math.max(1,loopTime);}
 for(const frame of plan.frames){if(!frame)continue;if(time<frame.duration)return frame;time-=frame.duration;}
 return plan.frames[0]!;
}
export function gazeCell(dx:number,dy:number){
 if(Math.hypot(dx,dy)<=1)return null;
 const direction=Math.round(((Math.atan2(dx,-dy)+Math.PI*2)%(Math.PI*2))/(Math.PI/8))%16;
 return {row:9+Math.floor(direction/8),column:direction%8};
}
/** Mirrors the reference player's restart when a look frame is removed. */
export class MotionClock {
 private pose?:Pose;private looking=false;private reduced=false;private started=0;
 sample(pose:Pose,now:number,look:{row:number;column:number}|null=null,reduced=false){
  const looking=look!==null;
  if(this.pose!==pose||this.looking!==looking||this.reduced!==reduced){this.started=now;this.pose=pose;this.looking=looking;this.reduced=reduced;}
  return look?{...look,duration:0}:motionFrameAt(pose,now-this.started,reduced);
 }
}
