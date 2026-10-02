import {existsSync} from 'node:fs';
import {join} from 'node:path';
import {homedir} from 'node:os';
export function electronPath(){
 const home=process.env.DSH_HOME ?? join(homedir(),'.dsh');
 for(const path of [process.env.DSH_FLOATING_PET_ELECTRON,join(home,'electron','electron.exe'),join(home,'codex-pet','electron','electron.exe')])if(path && existsSync(path))return path;
 throw new Error('桌面悬浮需要 Electron 运行时；可通过 DSH_FLOATING_PET_ELECTRON 指定 electron.exe，或使用 ~/.dsh/electron 中已有的共享运行时。');
}
