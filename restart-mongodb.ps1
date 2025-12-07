# Restart MongoDB Service with proper wait time
# Run as Administrator

Write-Host "Restarting MongoDB service..." -ForegroundColor Cyan
Write-Host ""

try {
    Write-Host "Stopping MongoDB..." -ForegroundColor Yellow
    Stop-Service -Name "MongoDB" -Force -ErrorAction Stop
    Write-Host "[OK] MongoDB stopped" -ForegroundColor Green

    Write-Host "Waiting 5 seconds for clean shutdown..." -ForegroundColor Yellow
    Start-Sleep -Seconds 5

    Write-Host "Starting MongoDB..." -ForegroundColor Yellow
    Start-Service -Name "MongoDB" -ErrorAction Stop

    Write-Host "Waiting 5 seconds for MongoDB to fully start..." -ForegroundColor Yellow
    Start-Sleep -Seconds 5

    $service = Get-Service -Name "MongoDB"
    Write-Host ""
    Write-Host "Service Status: $($service.Status)" -ForegroundColor $(if ($service.Status -eq "Running") { "Green" } else { "Red" })

    if ($service.Status -eq "Running") {
        Write-Host ""
        Write-Host "[SUCCESS] MongoDB restarted with authentication enabled" -ForegroundColor Green
        Write-Host ""
        Write-Host "Test the connection with:" -ForegroundColor Cyan
        Write-Host "  node verify-and-fix-auth.js" -ForegroundColor White
    }
} catch {
    Write-Host ""
    Write-Host "[ERROR] Failed to restart: $_" -ForegroundColor Red
    Write-Host ""
    Write-Host "Try manually:" -ForegroundColor Yellow
    Write-Host "  net stop MongoDB" -ForegroundColor White
    Write-Host "  (wait 5 seconds)" -ForegroundColor White
    Write-Host "  net start MongoDB" -ForegroundColor White
}

Write-Host ""
pause
