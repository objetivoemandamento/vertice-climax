$ErrorActionPreference = "Stop"
Set-Location $PSScriptRoot
$envPath = Join-Path $PSScriptRoot ".env"
$script:envLines = [System.Collections.Generic.List[string]]::new()
if (Test-Path $envPath) {
  Get-Content $envPath | ForEach-Object { [void]$script:envLines.Add($_) }
}
function Set-EnvValue([string]$Key,[string]$Value) {
  $pattern = "^" + [regex]::Escape($Key) + "="
  $found = -1
  for ($i=0; $i -lt $script:envLines.Count; $i++) {
    if ($script:envLines[$i] -match $pattern) { $found = $i; break }
  }
  $line = $Key + "=" + $Value
  if ($found -ge 0) { $script:envLines[$found] = $line } else { [void]$script:envLines.Add($line) }
}
$tokenLine = $script:envLines | Where-Object { $_ -match "^VERTICE_SERVICE_TOKEN=" } | Select-Object -First 1
$token = if ($tokenLine) { ($tokenLine -split "=",2)[1] } else { "" }
if (-not $token -or $token.Length -lt 24 -or $token -match "troque-por") {
  $bytes = New-Object byte[] 48
  $rng = [System.Security.Cryptography.RandomNumberGenerator]::Create()
  $rng.GetBytes($bytes)
  $rng.Dispose()
  $token = [Convert]::ToBase64String($bytes).Replace("+","-").Replace("/","_").TrimEnd("=")
}
Set-EnvValue "PORT" "8787"
Set-EnvValue "VERTICE_SERVICE_TOKEN" $token
Set-EnvValue "FRONTEND_ORIGIN" "http://127.0.0.1:8080"
Set-EnvValue "DATA_DIR" "./data"
Set-EnvValue "MESSAGE_CACHE_LIMIT" "500"
Set-EnvValue "CHAT_CACHE_LIMIT" "1000"
Set-Content -Path $envPath -Value $script:envLines -Encoding ASCII
Write-Host ""
Write-Host "Vértice Climax - conector local" -ForegroundColor Cyan
Write-Host "Token salvo em whatsapp-service\.env; copie VERTICE_SERVICE_TOKEN para o campo Token do serviço no painel."
Write-Host "Os dados da sessão ficarão em whatsapp-service\data."
Write-Host "Não compartilhe o arquivo .env nem a pasta data."
if (-not (Test-Path (Join-Path $PSScriptRoot "node_modules"))) {
  Write-Host "Instalando dependências do WhatsApp..."
  npm install
  if ($LASTEXITCODE -ne 0) { throw "npm install falhou. Verifique Node.js 20+ e conexão com a internet." }
}
Write-Host "Iniciando o conector. Mantenha esta janela aberta." -ForegroundColor Green
npm start
