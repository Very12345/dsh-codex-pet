import test from 'node:test';import assert from 'node:assert/strict';import {WindowsSpeech} from '../src/local-speech.ts';
test('Windows local synthesis produces a valid WAV without playing it or using a cloud API',{skip:process.platform!=='win32'},async t=>{
 const speech=new WindowsSpeech();t.after(()=>speech.dispose());const voices=await speech.voices();assert.ok(voices.some(voice=>voice.language.startsWith('zh')));const wav=await speech.synthesize('你好，这是本地语音验证。',voices.find(voice=>voice.language.startsWith('zh'))!.name,0,'zh',new AbortController().signal);assert.equal(wav.toString('ascii',0,4),'RIFF');assert.equal(wav.toString('ascii',8,12),'WAVE');assert.ok(wav.length>1000);await assert.rejects(speech.synthesize('x'.repeat(501),'',0,'zh',new AbortController().signal),/参数/);
});
