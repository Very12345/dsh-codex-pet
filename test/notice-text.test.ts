import test from 'node:test';import assert from 'node:assert/strict';
import {noticeText} from '../src/notice-text.ts';
import {noticeCopy} from '../src/notice-copy.ts';
import {noticePreview} from '../src/notice-preview.ts';

test('card text drops Markdown formatting while retaining nested labels and readable blocks',()=>{
 const source='# **结果**\n\n> 已保存 *修改*，~~旧方案~~\n\n- [文档 **说明**](https://example.test/a_(b))\n- [x] 查看 `file_name.ts`\n\n![示意图](https://example.test/image.png)';
 assert.equal(noticeText(source),'结果 已保存 修改，旧方案 文档 说明 查看 file_name.ts 示意图');
 assert.equal(noticeText('| 项目 | 状态 |\n| --- | --- |\n| **检查** | 完成 |'),'项目 状态 检查 完成');
 assert.equal(noticeText('```ts\nconst value = 2 * 3;\n```\n\n后文'),'const value = 2 * 3; 后文');
});
test('literal text, code, escaped punctuation and entities keep their meaning',()=>{
 assert.equal(noticeText('foo_bar 2 * 3 C:\\Work\\file_name.ts $20'),'foo_bar 2 * 3 C:\\Work\\file_name.ts $20');
 assert.equal(noticeText('`**literal**` `__init__`'), '**literal** __init__');
 assert.equal(noticeText('\\*literal\\* &amp; &#x4F60; &#22909;'), '*literal* & 你 好');
 assert.equal(noticeText('<p>文字 <b>加粗</b><script>private_code()</script></p>'),'文字 加粗');
 assert.equal(noticeText('😀'.repeat(10),5),'😀'.repeat(5));
});
test('streaming preview preserves raw block boundaries and handles incomplete markers without changing source',()=>{
 const entries:any[]=[{type:'event',event:{type:'assistant/live-chunk',data:{attemptId:'one',chunk:{type:'text-delta',index:0,text:'## **已'}}}}];
 let preview=noticePreview(entries);assert.equal(noticeCopy({pose:'running',phase:'responding',preview:preview.text},zh=>zh).text,'已');
 preview=noticePreview([{type:'event',event:{type:'assistant/live-chunk',data:{attemptId:'one',chunk:{type:'text-delta',index:0,text:'保存**\n- 检查完成'}}}}],preview);
 assert.equal(noticeCopy({pose:'review',preview:preview.text},zh=>zh).text,'已保存 检查完成');
 assert.match(preview.blocks!['0'],/\*\*已保存\*\*/);assert.equal(entries[0].event.data.chunk.text,'## **已');
});
