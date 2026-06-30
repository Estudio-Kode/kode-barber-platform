$ErrorActionPreference = "SilentlyContinue"
$proj = "C:\Users\Mistc\OneDrive\Desktop\PROJETO_ZIAH"
$cf = Get-ChildItem "$env:LOCALAPPDATA\Microsoft\WinGet\Packages\Cloudflare.cloudflared_*\cloudflared.exe" | Select-Object -First 1
$log = Join-Path $proj "tunnel.log"

Write-Host "============================================" -ForegroundColor Cyan
Write-Host "   Subindo o site da Ziah Cortes..." -ForegroundColor Cyan
Write-Host "============================================" -ForegroundColor Cyan

# 1) Servidor Python
Start-Process -FilePath "python" -ArgumentList "server.py" -WorkingDirectory $proj -WindowStyle Hidden
Start-Sleep -Seconds 3
Write-Host "[1/2] Servidor local iniciado (http://localhost:8000)" -ForegroundColor Green

# 2) Tunel Cloudflare
if (Test-Path $log) { Remove-Item $log -Force }
Start-Process -FilePath $cf.FullName -ArgumentList "tunnel","--url","http://127.0.0.1:8000","--logfile",$log -WindowStyle Hidden

$url = $null
for ($i=0; $i -lt 25; $i++) {
    Start-Sleep -Seconds 2
    if (Test-Path $log) {
        $m = Select-String -Path $log -Pattern "https://[a-z0-9-]+\.trycloudflare\.com" | Select-Object -First 1
        if ($m) { $url = $m.Matches[0].Value; break }
    }
}

Write-Host ""
if ($url) {
    Write-Host "[2/2] Tunel no ar!" -ForegroundColor Green
    Write-Host ""
    Write-Host "  >>> LINK PARA A REUNIAO <<<" -ForegroundColor Yellow
    Write-Host "  $url" -ForegroundColor White -BackgroundColor DarkBlue
    Write-Host ""
    Set-Clipboard -Value $url
    Write-Host "  (o link ja foi copiado para a area de transferencia)" -ForegroundColor DarkGray
} else {
    Write-Host "Nao consegui gerar o link. Verifique a internet e tente de novo." -ForegroundColor Red
}

Write-Host ""
Write-Host "IMPORTANTE: deixe esta janela ABERTA e o PC LIGADO durante a reuniao." -ForegroundColor Magenta
Write-Host "Para encerrar tudo depois, feche esta janela e rode: encerrar_site.bat" -ForegroundColor DarkGray
Write-Host ""
Read-Host "Pressione ENTER para fechar esta janela (isso NAO derruba o site)"
