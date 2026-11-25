# KCZ Client modunu desteklenen her Minecraft surumu icin derler ve
# istemci-mod\cikti\kcz-client-<surum>.jar olarak koyar (launcher bunlari icine gomer).
# Hata olursa launcher yine derlenir; sadece oyun ici KCZ menusu o surumde olmaz.
$ErrorActionPreference = 'Continue'
Set-Location $PSScriptRoot
$Surumler = @(
  @{ mc = '26.2'; fapi = '0.161.0+26.2' },
  @{ mc = '26.3'; fapi = '0.161.0+26.3' }
)
$Kayit = Join-Path (Split-Path $PSScriptRoot -Parent) 'mod-derleme-kaydi.txt'
'' | Set-Content -Path $Kayit -Encoding UTF8

# Java 25 gelistirme paketi (JDK) bul, yoksa kur
function Jdk-Bul {
  # GitHub sunucusunda ya da elle ayarlandiysa: JAVA_HOME (Java 25+)
  if ($env:JAVA_HOME -and (Test-Path (Join-Path $env:JAVA_HOME 'bin\javac.exe'))) {
    $v = & (Join-Path $env:JAVA_HOME 'bin\java.exe') -version 2>&1 | Out-String
    if ($v -match 'version "(\d+)') { if ([int]$Matches[1] -ge 25) { return $env:JAVA_HOME } }
  }
  $adaylar = @()
  foreach ($kok in @("$env:ProgramFiles\Eclipse Adoptium", "$env:ProgramFiles\Java", "$env:ProgramFiles\Microsoft")) {
    if (Test-Path $kok) { $adaylar += Get-ChildItem $kok -Directory -ErrorAction SilentlyContinue | Where-Object { $_.Name -match '^jdk-?2[5-9]' } }
  }
  foreach ($a in $adaylar | Sort-Object Name -Descending) {
    if (Test-Path (Join-Path $a.FullName 'bin\javac.exe')) { return $a.FullName }
  }
  return $null
}
$jdk = Jdk-Bul
if (-not $jdk) {
  Write-Host '       Java 25 JDK kuruluyor (bir kere)...'
  winget install --id EclipseAdoptium.Temurin.25.JDK -e --accept-source-agreements --accept-package-agreements | Out-Null
  $jdk = Jdk-Bul
}
if (-not $jdk) {
  "Java 25 JDK bulunamadi/kurulamadi." | Add-Content -Path $Kayit -Encoding UTF8
  Write-Host '  [!] Java 25 JDK kurulamadi: oyun ici KCZ menusu bu derlemede olmayacak.'
  exit 0
}
$env:JAVA_HOME = $jdk
$env:PATH = "$jdk\bin;$env:PATH"

New-Item -ItemType Directory -Force -Path 'cikti' | Out-Null
$basarili = 0
foreach ($s in $Surumler) {
  Write-Host "       KCZ Client $($s.mc) derleniyor..."
  "===== $($s.mc) =====" | Add-Content -Path $Kayit -Encoding UTF8
  & .\gradlew.bat build --no-daemon "-Pmc=$($s.mc)" "-Pfapi=$($s.fapi)" 2>&1 | Add-Content -Path $Kayit -Encoding UTF8
  $jar = Get-ChildItem 'build\libs' -Filter "kcz-client-*+$($s.mc).jar" -ErrorAction SilentlyContinue |
    Where-Object { $_.Name -notmatch 'sources' } | Select-Object -First 1
  if ($LASTEXITCODE -eq 0 -and $jar) {
    Copy-Item $jar.FullName (Join-Path 'cikti' "kcz-client-$($s.mc).jar") -Force
    $basarili++
  } else {
    Write-Host "  [!] KCZ Client $($s.mc) derlenemedi (mod-derleme-kaydi.txt)."
  }
}
Write-Host "       KCZ Client: $basarili/$($Surumler.Count) surum hazir."
exit 0
