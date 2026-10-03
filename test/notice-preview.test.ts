import test from 'node:test';import assert from 'node:assert/strict';
import {noticePreview} from '../src/notice-preview.ts';
test('preview includes visible assistant text only and clears on a new turn',()=>{
 const visible=noticePreview([{type:'event',event:{type:'assistant/message',data:{message:{content:[{type:'reasoning',text:'private reasoning'},{type:'text',text:'Visible answer'}]}}}}]);assert.equal(visible.text,'Visible answer');assert.equal(visible.phase,'responding');assert.equal(visible.tool,undefined);assert.ok(!JSON.stringify(visible).includes('private reasoning'));
 assert.equal(noticePreview([{type:'event',event:{type:'assistant/message',data:{message:{content:[{type:'text',text:'Old'}]}}}},{type:'event',event:{type:'turn/start'}}]).text,'');
});
test('live phases follow real chunks and step boundaries without exposing reasoning or prepared arguments',()=>{
 const feed=(type:string,data?:any)=>[{type:'event',event:{type,data}}];
 let state=noticePreview(feed('turn/start'));assert.equal(state.phase,'thinking');
 state=noticePreview(feed('assistant/live-chunk',{attemptId:'one',chunk:{type:'reasoning-delta',text:'secret reasoning'}}),state);assert.equal(state.phase,'thinking');
 state=noticePreview(feed('assistant/live-chunk',{attemptId:'one',chunk:{type:'text-delta',index:0,text:'I will check '}}),state);
 state=noticePreview(feed('assistant/live-chunk',{attemptId:'one',chunk:{type:'text-delta',index:0,text:'the files.'}}),state);assert.equal(state.text,'I will check the files.');assert.equal(state.phase,'responding');
 state=noticePreview(feed('assistant/live-chunk',{attemptId:'one',chunk:{type:'block-end',index:0,block:{type:'text',text:'I will check the files.'}}}),state);assert.equal(state.text,'I will check the files.');
 state=noticePreview(feed('assistant/live-chunk',{attemptId:'one',chunk:{type:'tool-call-delta',name:'bash',argumentsDelta:'secret command'}}),state);assert.equal(state.phase,'preparing-tool');assert.equal(state.tool,undefined);assert.doesNotMatch(JSON.stringify(state),/secret/);
 state=noticePreview(feed('step/start'),state);assert.equal(state.phase,'thinking');assert.equal(state.text,'');
 state=noticePreview(feed('compaction/start'),state);assert.equal(state.phase,'compacting');state=noticePreview(feed('compaction/end'),state);assert.equal(state.phase,'thinking');
});
test('parallel tool completion clears only its own activity and returns to thinking after the final result',()=>{
 let state=noticePreview([{type:'event',event:{type:'tool/call',data:{callId:'a',name:'web_search'}}},{type:'event',event:{type:'tool/call',data:{callId:'b',name:'read_file'}}}]);
 assert.equal(state.phase,'tool');assert.equal(state.tool,'read_file');
 state=noticePreview([{type:'event',event:{type:'tool/result',data:{message:{callId:'b',content:[{type:'text',text:'private file contents'}]}}}}],state);assert.equal(state.tool,'web_search');
 state=noticePreview([{type:'event',event:{type:'tool/result',data:{message:{callId:'a'}}}}],state);assert.equal(state.phase,'thinking');assert.equal(state.tool,undefined);assert.ok(!JSON.stringify(state).includes('private file contents'));
});
test('streamed visible chunks settle into durable answer without duplicate text; tool preview excludes arguments',()=>{
 const entries:any[]=[{type:'transient',event:{type:'assistant/live-chunk',data:{attemptId:'a',chunk:{type:'text-delta',text:'Hello '}}}},{type:'transient',event:{type:'assistant/live-chunk',data:{attemptId:'a',chunk:{type:'reasoning-delta',text:'secret'}}}},{type:'transient',event:{type:'assistant/live-chunk',data:{attemptId:'a',chunk:{type:'text-delta',text:'world'}}}}];
 assert.equal(noticePreview(entries).text,'Hello world');
 entries.push({type:'event',event:{type:'assistant/message',data:{message:{content:[{type:'text',text:'Hello world'}]}}}});assert.equal(noticePreview(entries).text,'Hello world');
 entries.push({type:'event',event:{type:'tool/call',data:{name:'web_search',arguments:'private'}}});assert.equal(noticePreview(entries).tool,'web_search');
});
