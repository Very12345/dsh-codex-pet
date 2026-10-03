/** Verify Win32 activation on owned windows, never users' DSH sessions. */
import {mkdtemp,writeFile,readFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';import {join} from 'node:path';
import {execFileSync,spawn} from 'node:child_process';import assert from 'node:assert/strict';
if(process.platform!=='win32'){console.log('Host focus smoke requires Windows');process.exit(0);}
const directory=await mkdtemp(join(tmpdir(),'dsh-pet-host-focus-'));
const powershell=join(process.env.SystemRoot,'System32/WindowsPowerShell/v1.0/powershell.exe');
const fixture=join(directory,'DeepSeek Harness.exe'),source=join(directory,'fixture.cs'),compile=join(directory,'compile.ps1');
const focus=new URL('../native/electron/activate-host.ps1',import.meta.url);
try{
 await writeFile(source,`using System;using System.IO;using System.Windows.Forms;
public static class OwnedHost { [STAThread] public static void Main(string[] args){
 Application.EnableVisualStyles();var form=new Form {Text="Owned pet host focus fixture",Width=320,Height=100};
 form.Shown+=(s,e)=>{if(args[0]=="minimized")form.WindowState=FormWindowState.Minimized;File.WriteAllText(args[1],"ready");};Application.Run(form);
}}`);
 await writeFile(compile,"param([string]$Source,[string]$Target)\n$ErrorActionPreference='Stop'\nAdd-Type -TypeDefinition (Get-Content -Raw -LiteralPath $Source) -ReferencedAssemblies System.Windows.Forms,System.Drawing -OutputAssembly $Target -OutputType WindowsApplication\n");
 execFileSync(powershell,['-NoProfile','-NonInteractive','-File',compile,'-Source',source,'-Target',fixture],{windowsHide:true,timeout:15000,stdio:'pipe'});
 for(const mode of ['normal','minimized']){
  const ready=join(directory,mode+'.ready'),child=spawn(fixture,[mode,ready],{windowsHide:false,stdio:'ignore'});
  try{
   const deadline=Date.now()+5000;while(await readFile(ready,'utf8').catch(()=>null)!=='ready'){if(Date.now()>deadline)throw new Error('Owned host fixture did not start');await new Promise(resolve=>setTimeout(resolve,40));}
   const result=JSON.parse(execFileSync(powershell,['-NoProfile','-NonInteractive','-ExecutionPolicy','Bypass','-File',focus.pathname.replace(/^\/([A-Z]:)/,'$1'),'-OwnerProcessId',String(child.pid)],{encoding:'utf8',windowsHide:true,timeout:10000}));
   assert.equal(result.ok,true,'Owned '+mode+' host becomes foreground: '+JSON.stringify(result));
  }finally{child.kill();await new Promise(resolve=>child.exitCode!==null?resolve():child.once('exit',resolve));}
 }
 const absent=JSON.parse(execFileSync(powershell,['-NoProfile','-NonInteractive','-File',focus.pathname.replace(/^\/([A-Z]:)/,'$1'),'-OwnerProcessId','2147483647'],{encoding:'utf8',windowsHide:true,timeout:10000}));assert.equal(absent.ok,false,'Missing owner never falls back to another DSH window');
 console.log('Owned normal/minimized host focus, foreground verification and missing-owner refusal PASS');
}finally{await rm(directory,{recursive:true,force:true});}
