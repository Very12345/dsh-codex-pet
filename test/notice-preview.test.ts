import test from 'node:test';import assert from 'node:assert/strict';
import {noticePreview} from '../src/notice-preview.ts';
test('preview includes visible assistant text only and clears on a new turn',()=>{
 assert.deepEqual(noticePreview([{type:'event',event:{type:'assistant/message',data:{message:{content:[{type:'reasoning',text:'private reasoning'},{type:'text',text:'Visible answer'}]}}}}]),{text:'Visible answer',tool:undefined});
 assert.equal(noticePreview([{type:'event',event:{type:'assistant/message',data:{message:{content:[{type:'text',text:'Old'}]}}}},{type:'event',event:{type:'turn/start'}}]).text,'');
});
test('streamed visible chunks settle into durable answer without duplicate text; tool preview excludes arguments',()=>{
 const entries:any[]=[{type:'transient',event:{type:'assistant/live-chunk',data:{attemptId:'a',chunk:{type:'text-delta',text:'Hello '}}}},{type:'transient',event:{type:'assistant/live-chunk',data:{attemptId:'a',chunk:{type:'reasoning-delta',text:'secret'}}}},{type:'transient',event:{type:'assistant/live-chunk',data:{attemptId:'a',chunk:{type:'text-delta',text:'world'}}}}];
 assert.equal(noticePreview(entries).text,'Hello world');
 entries.push({type:'event',event:{type:'assistant/message',data:{message:{content:[{type:'text',text:'Hello world'}]}}}});assert.equal(noticePreview(entries).text,'Hello world');
 entries.push({type:'event',event:{type:'tool/call',data:{name:'web_search',arguments:'private'}}});assert.equal(noticePreview(entries).tool,'web_search');
});
