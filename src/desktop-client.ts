/** Push snapshots and receive actions over SSE even when DSH is minimized. */
import {BASE} from './model.ts';
import type {CompanionApi,CompanionSnapshot} from './companion-api.ts';

export function connectDesktop(api:CompanionApi, refresh:()=>Promise<void>, failed:(error:string)=>void,
  options:{fetch?:typeof fetch; eventSource?:typeof EventSource; owner?:string}={}){
  const fetcher=options.fetch ?? fetch, Events=options.eventSource ?? EventSource;
  let active=true,token:string|undefined,stream:EventSource|undefined,release:(()=>void)|undefined;
  let connected=false,ended=false;
  let spriteKey='',spriteImage='',paintedKey='';
  let pending:CompanionSnapshot|null=null,sending=false;
  const request=async(path:string,data:unknown)=>{
    const response=await fetcher(`${BASE}/api/desktop/${path}`,{method:'POST',headers:{'content-type':'application/json','x-dsh-pet':'1'},body:JSON.stringify(data),signal:AbortSignal.timeout(20000)});
    const result=await response.json();if(!response.ok)throw new Error(result.error ?? 'Desktop pet connection failed');return result;
  };
  const imageFor=async(snapshot:CompanionSnapshot)=>{
    const url=snapshot.pet?.url;if(!url)return {};
    if(!url.startsWith(`${BASE}/asset/`))throw new Error('Desktop sprite must belong to the local pet library');
    if(spriteKey!==url){
      spriteImage=await new Promise<string>((resolve,reject)=>{
        const image=new Image();
        const timer=setTimeout(()=>{image.src='';reject(new Error('Desktop sprite decoding timed out'));},10000);
        image.onerror=()=>{clearTimeout(timer);reject(new Error('Desktop sprite could not be decoded'));};
        image.onload=()=>{
          clearTimeout(timer);
          try{
            if(image.naturalWidth!==1536 || ![1872,2288].includes(image.naturalHeight))throw new Error('Invalid desktop sprite dimensions');
            const canvas=document.createElement('canvas');canvas.width=image.naturalWidth;canvas.height=image.naturalHeight;
            const context=canvas.getContext('2d');if(!context)throw new Error('Canvas is unavailable');
            context.drawImage(image,0,0);resolve(canvas.toDataURL('image/png').split(',')[1]);
          }catch(error){reject(error);}
        };image.src=url;
      });
      spriteKey=url;
    }
    return spriteKey===paintedKey?{spriteKey}:{spriteKey,image:spriteImage};
  };
  const flush=async()=>{
    if(!active || ended || !token || sending || !pending)return;
    const snapshot=pending;pending=null;sending=true;
    try{
      const sprite=await imageFor(snapshot);
      if(!active || ended)return;
      await request('snapshot',{token,snapshot:{...snapshot,...sprite}});
      paintedKey=snapshot.pet?.url ?? '';
      if(active && connected && !ended){release ??= api.acquireDisplay();failed('');}
    }catch(error){if(active){release?.();release=undefined;failed(String(error));}}
    finally{sending=false;if(pending && active)void flush();}
  };
  const off=api.subscribe(snapshot=>{pending=snapshot;void flush();});
  const ready=(async()=>{
    const result=await request('begin',{owner:options.owner ?? crypto.randomUUID()});token=result.token;
    if(!active){await request('end',{token}).catch(()=>{});return;}
    stream=new Events(`${BASE}/api/desktop/events?token=${encodeURIComponent(token!)}`);
    stream.addEventListener('command',event=>{
      const value=JSON.parse((event as MessageEvent).data);
      void (async()=>{
        let error:string|undefined;
        try{if(value.command.type==='settings')api.openSettings();else await api.command(value.command);}
        catch(cause){error=cause instanceof Error?cause.message:String(cause);}
        if(active)await request('ack',{token,id:value.id,error}).catch(()=>{});
      })();
    });
    stream.addEventListener('config',()=>{void refresh().catch(()=>{});});
    stream.addEventListener('stopped',event=>{
      ended=true;connected=false;
      release?.();release=undefined;stream?.close();
      const value=JSON.parse((event as MessageEvent).data);failed(value.error ?? '');
    });
    stream.addEventListener('error',()=>{connected=false;release?.();release=undefined;});
    stream.addEventListener('open',()=>{connected=true;pending=api.getSnapshot();void flush();});
    pending=api.getSnapshot();await flush();
  })().catch(error=>{if(active)failed(error instanceof Error?error.message:String(error));});
  return {ready,dispose(){if(!active)return;active=false;off();stream?.close();release?.();release=undefined;if(token)void request('end',{token}).catch(()=>{});}};
}
