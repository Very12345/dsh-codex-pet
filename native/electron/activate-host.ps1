param([Parameter(Mandatory=$true)][ValidateRange(1,2147483647)][int]$OwnerProcessId)
$ErrorActionPreference='Stop'
[Console]::OutputEncoding=New-Object System.Text.UTF8Encoding($false)
$petStage='compile'
try {
 Add-Type -TypeDefinition @'
using System;
using System.Runtime.InteropServices;
public static class PetHostWindow {
 public delegate bool EnumCallback(IntPtr hwnd,IntPtr arg);
 [DllImport("user32.dll")] public static extern bool EnumWindows(EnumCallback callback,IntPtr arg);
 [DllImport("user32.dll")] public static extern uint GetWindowThreadProcessId(IntPtr hwnd,out uint process);
 [DllImport("user32.dll")] public static extern bool IsWindowVisible(IntPtr hwnd);
 [DllImport("user32.dll")] public static extern bool IsIconic(IntPtr hwnd);
 [DllImport("user32.dll")] public static extern IntPtr GetWindow(IntPtr hwnd,uint command);
 [DllImport("user32.dll")] public static extern IntPtr GetForegroundWindow();
 [DllImport("user32.dll")] public static extern bool ShowWindowAsync(IntPtr hwnd,int command);
 [DllImport("user32.dll")] public static extern bool SetForegroundWindow(IntPtr hwnd);
 [DllImport("user32.dll")] public static extern bool AttachThreadInput(uint from,uint to,bool attach);
 [DllImport("kernel32.dll")] public static extern uint GetCurrentThreadId();
 public static IntPtr Find(uint process) {
  IntPtr result=IntPtr.Zero;
  EnumWindows((hwnd,arg)=>{uint actual;GetWindowThreadProcessId(hwnd,out actual);
   if(actual==process && GetWindow(hwnd,4)==IntPtr.Zero && IsWindowVisible(hwnd)){result=hwnd;return false;}return true;
  },IntPtr.Zero);return result;
 }
 public static void Activate(IntPtr hwnd) {
  if(IsIconic(hwnd))ShowWindowAsync(hwnd,9);
  uint unused,own=GetCurrentThreadId(),foreground=GetWindowThreadProcessId(GetForegroundWindow(),out unused),target=GetWindowThreadProcessId(hwnd,out unused);
  bool attachForeground=foreground!=0 && foreground!=own && AttachThreadInput(own,foreground,true);
  bool attachTarget=target!=own && target!=foreground && AttachThreadInput(own,target,true);
  try {SetForegroundWindow(hwnd);} finally {
   if(attachTarget)AttachThreadInput(own,target,false);
   if(attachForeground)AttachThreadInput(own,foreground,false);
  }
 }
}
'@
 # Only walk the authenticated plugin owner's ancestry. Never select another DSH by title.
 $petStage='owner'
 $petCurrentId=$OwnerProcessId;$petTarget=$null;$petWindow=[IntPtr]::Zero
 for($petDepth=0;$petDepth -lt 16 -and $petCurrentId -gt 0;$petDepth++){
  $petProcess=Get-CimInstance Win32_Process -Filter "ProcessId=$petCurrentId" -ErrorAction Stop
  if($null -eq $petProcess){break}
  if($petProcess.Name -eq 'DeepSeek Harness.exe'){
   $petCandidate=Get-Process -Id $petCurrentId -ErrorAction Stop
   $petWindow=[PetHostWindow]::Find([uint32]$petCurrentId)
   if($petWindow -ne [IntPtr]::Zero){$petTarget=$petCandidate;break}
  }
  $petNext=[int]$petProcess.ParentProcessId;if($petNext -eq $petCurrentId){break};$petCurrentId=$petNext
 }
 if($null -eq $petTarget){throw 'Owner window unavailable'}
 $petStage='identity'
 $petStarted=$petTarget.StartTime.ToUniversalTime().Ticks
 $petCheck=Get-Process -Id $petTarget.Id -ErrorAction Stop
 $petActual=[uint32]0;[void][PetHostWindow]::GetWindowThreadProcessId($petWindow,[ref]$petActual)
 if($petCheck.ProcessName -ne 'DeepSeek Harness' -or $petCheck.StartTime.ToUniversalTime().Ticks -ne $petStarted -or $petActual -ne $petTarget.Id){throw 'Owner window changed'}
 $petStage='foreground';[PetHostWindow]::Activate($petWindow);Start-Sleep -Milliseconds 100
 if([PetHostWindow]::GetForegroundWindow() -ne $petWindow){throw 'Foreground activation refused'}
 [Console]::Write('{"ok":true}')
}catch{
 [Console]::Write((ConvertTo-Json -Compress @{ok=$false;error='DSH window activation unavailable';stage=$petStage;failure=$_.Exception.GetType().Name}))
}
