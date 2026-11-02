# Cai Chua Online tren Windows / Windows Server VPS.
# Chay bang: chuot phai install.bat -> Run as administrator
$ErrorActionPreference = 'Stop'
[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12
$ProgressPreference = 'SilentlyContinue'

$isAdmin = ([Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
if (-not $isAdmin) { throw 'Hay chay install.bat bang quyen Administrator (chuot phai -> Run as administrator).' }

$Root = (Resolve-Path (Join-Path $PSScriptRoot '..\..')).Path
Set-Location $Root
Write-Host "Thu muc du an: $Root"

Write-Host '==> Bat dich vu am thanh Windows (Windows Server tat san)'
foreach ($svc in 'AudioEndpointBuilder', 'Audiosrv') {
  try { Set-Service -Name $svc -StartupType Automatic; Start-Service -Name $svc } catch { Write-Warning "Khong bat duoc $svc : $_" }
}

function Get-NodeMajor {
  try { return [int]((& node -v).TrimStart('v').Split('.')[0]) } catch { return 0 }
}
if ((Get-NodeMajor) -lt 22) {
  Write-Host '==> Cai Node.js 22 LTS'
  $rel = (Invoke-RestMethod 'https://nodejs.org/dist/index.json') | Where-Object { $_.lts -and $_.version -like 'v22.*' } | Select-Object -First 1
  $msi = "node-$($rel.version)-x64.msi"
  $dst = Join-Path $env:TEMP $msi
  Invoke-WebRequest "https://nodejs.org/dist/$($rel.version)/$msi" -OutFile $dst
  Start-Process msiexec.exe -ArgumentList "/i `"$dst`" /qn" -Wait
  $env:Path = [Environment]::GetEnvironmentVariable('Path', 'Machine') + ';' + [Environment]::GetEnvironmentVariable('Path', 'User')
}
Write-Host "Node $(& node -v)"

Write-Host '==> Cai thu vien (npm ci)'
& npm.cmd ci --omit=dev
if ($LASTEXITCODE -ne 0) { throw 'npm ci that bai' }

if (-not (Test-Path (Join-Path $Root '.env'))) {
  Copy-Item (Join-Path $Root '.env.example') (Join-Path $Root '.env')
  Write-Host 'Da tao file .env - mo bang Notepad de dien TIKTOK_USERNAME va ADMIN_TOKEN.'
}

Write-Host '==> Tu chay server khi dang nhap Windows'
$bat = Join-Path $Root 'deploy\windows\start-chua.bat'
$action = New-ScheduledTaskAction -Execute 'cmd.exe' -Argument "/c `"$bat`""
$trigger = New-ScheduledTaskTrigger -AtLogOn -User "$env:USERDOMAIN\$env:USERNAME"
$settings = New-ScheduledTaskSettingsSet -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -ExecutionTimeLimit ([TimeSpan]::Zero)
Register-ScheduledTask -TaskName 'ChuaOnline' -Action $action -Trigger $trigger -Settings $settings -RunLevel Highest -Force | Out-Null

Write-Host ''
Write-Host 'XONG. Buoc tiep theo:'
Write-Host "  1) notepad `"$Root\.env`"   (dien TIKTOK_USERNAME, ADMIN_TOKEN)"
Write-Host '  2) Chay deploy\windows\start-chua.bat'
Write-Host '  3) Mo http://localhost:8686/admin trong Chrome de ket noi TikTok'
