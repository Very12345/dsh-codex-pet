const {contextBridge,ipcRenderer}=require('electron');
contextBridge.exposeInMainWorld('petDesktop',Object.freeze({
 subscribe(callback){const listener=(_event,message)=>callback(message);ipcRenderer.on('pet:message',listener);return()=>ipcRenderer.removeListener('pet:message',listener);},
 emit(value){ipcRenderer.send('pet:event',value);},
 focus(){ipcRenderer.send('pet:focus');},
 hitZones(value){ipcRenderer.send('pet:zones',value);},
 drag(active,id){ipcRenderer.send('pet:drag',{active,id});},
 resize(height){ipcRenderer.send('pet:height',height);},
 chooseFiles(){return ipcRenderer.invoke('pet:files');}
}));
