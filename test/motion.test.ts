import test from 'node:test';import assert from 'node:assert/strict';
import {motionFrames,motionFrameAt,gazeCell,MotionClock} from '../src/motion.ts';
import type {Pose} from '../src/model.ts';
test('measured idle cadence is six times the base durations',()=>{
 assert.equal(motionFrames('idle').frames[0]?.duration,1680);
 assert.equal(motionFrameAt('idle',1679).column,0);assert.equal(motionFrameAt('idle',1680).column,1);
});
test('status actions perform three cycles then settle into idle without endlessly repeating work gestures',()=>{
 const plan=motionFrames('running');assert.equal(plan.loop,18);
 assert.equal(motionFrameAt('running',2459).row,7);assert.equal(motionFrameAt('running',2460).row,0);
 assert.equal(motionFrameAt('running',4140).column,1);
 assert.equal(motionFrames('running',false,true).frames.length,6);
});
test('reduced motion uses a single frame and gaze retains the sixteen direction grid',()=>{
 assert.equal(motionFrames('jumping',true).frames.length,1);
 assert.equal(gazeCell(1,0),null);assert.deepEqual(gazeCell(100,0),{row:9,column:4});
 assert.deepEqual(gazeCell(-100,0),{row:10,column:4});
});
test('all task and interaction states have bounded bursts, with a stable first frame under reduced motion',()=>{
 for(const pose of ['running-right','running-left','waving','jumping','failed','waiting','running','review'] as Pose[]){
  assert.notEqual(motionFrameAt(pose,0).row,0);assert.equal(motionFrameAt(pose,100000).row,0,pose+' settles into idle');
  assert.deepEqual(motionFrameAt(pose,0,true),motionFrameAt(pose,100000,true),pose+' honors reduced motion');
 }
});
test('leaving caret gaze restarts the current pose, instead of burning its burst while the static gaze frame was displayed',()=>{
 const clock=new MotionClock();assert.equal(clock.sample('running',0).row,7);
 assert.equal(clock.sample('running',4000).row,0);
 assert.equal(clock.sample('running',4100,{row:9,column:2}).row,9);
 assert.equal(clock.sample('running',9000,{row:9,column:3}).row,9);
 assert.deepEqual(clock.sample('running',10000),{row:7,column:0,duration:120});
 assert.equal(clock.sample('running',10120).column,1);
 assert.equal(clock.sample('waiting',11000).column,0);
});
