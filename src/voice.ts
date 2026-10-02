/** Bounded microphone capture for the host's configured speech recognizer. */
export function encodeWave(parts:readonly Float32Array[],sampleRate:number):Uint8Array {
 const count=parts.reduce((n,part)=>n+part.length,0);
 if(!Number.isFinite(sampleRate)||sampleRate<8000||sampleRate>48000||count>sampleRate*120)throw new Error('Invalid or oversized recording');
 const bytes=new Uint8Array(44+count*2),view=new DataView(bytes.buffer);
 const word=(offset:number,text:string)=>{for(let i=0;i<text.length;i++)bytes[offset+i]=text.charCodeAt(i);};
 word(0,'RIFF');view.setUint32(4,bytes.length-8,true);word(8,'WAVE');word(12,'fmt ');view.setUint32(16,16,true);view.setUint16(20,1,true);view.setUint16(22,1,true);view.setUint32(24,sampleRate,true);view.setUint32(28,sampleRate*2,true);view.setUint16(32,2,true);view.setUint16(34,16,true);word(36,'data');view.setUint32(40,count*2,true);
 let offset=44;for(const part of parts)for(const value of part){const sample=Math.max(-1,Math.min(1,value));view.setInt16(offset,sample<0?sample*32768:sample*32767,true);offset+=2;}
 return bytes;
}
export class VoiceCapture {
 private stream?:MediaStream;
 private audio?:AudioContext;
 private processor?:ScriptProcessorNode;
 private input?:MediaStreamAudioSourceNode;
 private parts:Float32Array[]=[];
 private epoch=0;
 private samples=0;
 get recording(){return !!this.audio;}
 async start(){
  if(!navigator.mediaDevices?.getUserMedia)throw new Error('当前环境不支持麦克风录音');
  const epoch=++this.epoch;
  const stream=await navigator.mediaDevices.getUserMedia({audio:{channelCount:1,sampleRate:16000,echoCancellation:true},video:false});
  if(epoch!==this.epoch){stream.getTracks().forEach(track=>track.stop());throw new Error('录音已取消');}
  this.stream=stream;
  try{
   const audio=new AudioContext({sampleRate:16000});this.audio=audio;
   this.parts=[];this.samples=0;this.input=audio.createMediaStreamSource(stream);this.processor=audio.createScriptProcessor(4096,1,1);
   this.processor.onaudioprocess=event=>{if(this.samples>=audio.sampleRate*120)return;const part=event.inputBuffer.getChannelData(0).slice(0,Math.max(0,audio.sampleRate*120-this.samples));this.parts.push(part);this.samples+=part.length;};
   this.input.connect(this.processor);this.processor.connect(audio.destination);await audio.resume();
  }catch(error){this.cancel();throw error;}
 }
 stop(){
  if(!this.audio)throw new Error('没有正在进行的录音');
  const result=encodeWave(this.parts,this.audio.sampleRate);this.cancel();return result;
 }
 cancel(){
  ++this.epoch;this.processor?.disconnect();this.input?.disconnect();this.stream?.getTracks().forEach(track=>track.stop());
  if(this.audio)void this.audio.close().catch(()=>{});this.audio=undefined;this.stream=undefined;this.input=undefined;this.processor=undefined;this.parts=[];
 }
}
export function waveBase64(bytes:Uint8Array){let text='';for(let i=0;i<bytes.length;i+=8192)text+=String.fromCharCode(...bytes.subarray(i,i+8192));return btoa(text);}
