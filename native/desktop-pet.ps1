param([int]$ParentProcessId)
$ErrorActionPreference = 'Stop'
$source = [IO.File]::ReadAllText((Join-Path $PSScriptRoot 'desktop-pet.cs'), [Text.Encoding]::UTF8)
Add-Type -ReferencedAssemblies System.Windows.Forms,System.Drawing,System.Web.Extensions,System,System.Core -TypeDefinition $source
[DshDesktopPet]::Run($ParentProcessId)
