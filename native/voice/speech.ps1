param([ValidateSet('voices','synthesize')][string]$Mode='voices')
$ErrorActionPreference='Stop'
[Console]::InputEncoding=New-Object System.Text.UTF8Encoding($false)
[Console]::OutputEncoding=New-Object System.Text.UTF8Encoding($false)
$petSynth=$null
$petWave=$null
try {
 Add-Type -AssemblyName System.Speech
 $petSynth=New-Object System.Speech.Synthesis.SpeechSynthesizer
 $petVoices=@($petSynth.GetInstalledVoices() | Where-Object { $_.Enabled })
 if($Mode -eq 'voices'){
  $petNames=@($petVoices | ForEach-Object { @{name=$_.VoiceInfo.Name;language=$_.VoiceInfo.Culture.Name} })
  [Console]::Write((ConvertTo-Json -InputObject $petNames -Compress))
 }else{
  $petRequest=ConvertFrom-Json ([Console]::In.ReadToEnd())
  if(-not ($petRequest.text -is [string]) -or $petRequest.text.Length -gt 500 -or -not $petRequest.text.Trim()){throw 'Invalid speech text'}
  if($petRequest.voice){
   if(-not ($petVoices | Where-Object { $_.VoiceInfo.Name -eq $petRequest.voice })){throw 'Selected system voice is unavailable'}
   $petSynth.SelectVoice([string]$petRequest.voice)
  }else{
   $petPreferred=$petVoices | Where-Object { $_.VoiceInfo.Culture.Name.StartsWith([string]$petRequest.language) } | Select-Object -First 1
   if($petPreferred){$petSynth.SelectVoice($petPreferred.VoiceInfo.Name)}
  }
  $petRate=[int]$petRequest.rate
  if($petRate -lt -5 -or $petRate -gt 5){throw 'Invalid speech rate'}
  $petSynth.Rate=$petRate
  $petWave=New-Object System.IO.MemoryStream
  $petSynth.SetOutputToWaveStream($petWave)
  $petSynth.Speak([string]$petRequest.text)
  [Console]::Write([Convert]::ToBase64String($petWave.ToArray()))
 }
}catch{
 # Never echo the input text, recognition transcript, or application data.
 [Console]::Error.Write('Windows system speech failed')
 exit 1
}finally{
 if($petSynth){$petSynth.Dispose()}
 if($petWave){$petWave.Dispose()}
}
