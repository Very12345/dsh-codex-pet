import test from 'node:test';import assert from 'node:assert/strict';
import {noticeCopy} from '../src/notice-copy.ts';
test('running card copy prioritizes the live phase over older assistant prose and uses friendly tool labels',()=>{
 const zh=(zh:string,_en:string)=>zh,en=(_zh:string,en:string)=>en;
 assert.equal(noticeCopy({pose:'running',phase:'thinking',preview:'Old text'},zh).text,'正在思考');
 assert.equal(noticeCopy({pose:'running',phase:'responding',preview:'Checking the files'},en).text,'Checking the files');
 assert.equal(noticeCopy({pose:'running',phase:'tool',tool:'bash',preview:'Old text'},zh).text,'正在运行命令');
 assert.equal(noticeCopy({pose:'running',phase:'tool',tool:'computer_scroll'},en).text,'Using the computer');
 assert.equal(noticeCopy({pose:'running',phase:'compacting'},zh).text,'正在整理上下文');
 assert.equal(noticeCopy({pose:'running',phase:'preparing-tool'},zh).text,'正在准备工具调用');
});
test('settled and waiting notices override stale tool feedback and have no progress animation',()=>{
 const en=(_zh:string,en:string)=>en;
 assert.deepEqual(noticeCopy({pose:'waiting',tool:'bash',preview:'Old plan'},en),{text:'Needs input',busy:false});
 assert.deepEqual(noticeCopy({pose:'failed',tool:'bash'},en),{text:'Blocked',busy:false});
 assert.deepEqual(noticeCopy({pose:'review',tool:'bash'},en),{text:'Ready',busy:false});
 assert.deepEqual(noticeCopy({pose:'review',preview:'Saved the changes'},en),{text:'Saved the changes',busy:false});
});
