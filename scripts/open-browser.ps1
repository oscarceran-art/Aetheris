# Waits for the Aetheris dev server to answer, then opens it in Google Chrome
# (falling back to the default browser if Chrome isn't found).
# Launched in the background by "Start Aetheris.bat" — no need to run it by hand.

$url = "http://localhost:5173"
$deadline = (Get-Date).AddMinutes(5)
$ready = $false
$ProgressPreference = "SilentlyContinue"

# Poll over HTTP rather than raw TCP: it waits until the app actually answers,
# and it uses the same "localhost" resolution the browser will use (Vite binds
# the IPv6 loopback, which a plain IPv4 TcpClient can never reach).
while ((Get-Date) -lt $deadline) {
  try {
    $r = Invoke-WebRequest -Uri $url -UseBasicParsing -TimeoutSec 3
    if ($r.StatusCode -lt 500) { $ready = $true; break }
  } catch {
    if ($_.Exception.Response) { $ready = $true; break } # answered, just not with 200
  }
  Start-Sleep -Milliseconds 400
}

if (-not $ready) { exit 1 }

function Find-Chrome {
  $paths = @(
    "HKLM:\SOFTWARE\Microsoft\Windows\CurrentVersion\App Paths\chrome.exe",
    "HKCU:\SOFTWARE\Microsoft\Windows\CurrentVersion\App Paths\chrome.exe"
  )
  foreach ($p in $paths) {
    if (Test-Path $p) {
      $exe = (Get-ItemProperty -Path $p -ErrorAction SilentlyContinue).'(default)'
      if ($exe -and (Test-Path $exe)) { return $exe }
    }
  }
  $candidates = @(
    "$env:ProgramFiles\Google\Chrome\Application\chrome.exe",
    "${env:ProgramFiles(x86)}\Google\Chrome\Application\chrome.exe",
    "$env:LOCALAPPDATA\Google\Chrome\Application\chrome.exe"
  )
  foreach ($c in $candidates) { if (Test-Path $c) { return $c } }
  return $null
}

$chrome = Find-Chrome
if ($chrome) {
  Start-Process -FilePath $chrome -ArgumentList $url
} else {
  Start-Process $url   # default browser
}
