import test from 'node:test';import assert from 'node:assert/strict';
import {motionFrames,motionFrameAt,gazeCell} from '../src/motion.ts';
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
