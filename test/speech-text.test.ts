import test from 'node:test';import assert from 'node:assert/strict';import {spokenText} from '../src/speech-text.ts';

test('speech removes emoji sequences and decorative shortcodes without losing facts or ordinary Unicode',()=>{
 assert.equal(spokenText('✅ 已完成 2 项，余额 $10，温度 23°C，版本 0.3.1。👩🏽‍💻 👍🏽 🇨🇳 1️⃣ ❤️ ©️ :smile:'),'已完成 2 项，余额 $10，温度 23°C，版本 0.3.1。');
 assert.equal(spokenText('你好，café 和 München；3 + 2 = 5，价格 ¥20。'),'你好，café 和 München；3 + 2 = 5，价格 ¥20。');
 assert.equal(spokenText('价格 $10 与 $20，公式 $2x+1$。'),'价格 $10 与 $20，公式 公式请查看对话。 。');
 assert.equal(spokenText('👨‍👩‍👧‍👦 ✅ :thumbsup: ---'),'');
});
test('speech reads prose instead of backslashes, source paths, markup and raw tables',()=>{
 assert.equal(spokenText('# 结果\n- [x] **已经完成** \\*测试\\*。\n路径 `C:\\Users\\ernes\\a.txt`。'),'结果 已经完成 测试。 路径 本地路径。');
 assert.equal(spokenText('说明\n~~~powershell\nWrite-Output "x"\n~~~\n下一步 [查看结果](https://example.com)。'),'说明 代码内容请查看对话。 下一步 查看结果。');
 assert.equal(spokenText('项目 | 数量\n--- | ---\n测试 | 2\n\n已通过 2 项。'),'表格内容请查看对话。 已通过 2 项。');
 assert.equal(spokenText('<b>已完成</b>，![图片](https://example.com/a.png) &amp; 更多。'),'已完成 ， 图片请查看对话。 和 更多。');
 assert.equal(spokenText('公式 \\(\\frac{1}{2}\\) 见对话。'),'公式 公式请查看对话。 见对话。');
 assert.equal(spokenText('普通 `file_name` 与 **word**，数量 123。'),'普通 file_name 与 word，数量 123。');
});
test('speech filtering is idempotent, bounded and does not change the supplied reply',()=>{
 const text='✅ **完成**，路径 C:\\test\\a.txt。',filtered=spokenText(text);assert.equal(spokenText(filtered),filtered);assert.ok(text.includes('✅'));
 assert.equal(Array.from(spokenText('好'.repeat(500))).length,240);
});
