# Check MongoDB Service Configuration

Write-Host "=== MongoDB Service Diagnostics ===" -ForegroundColor Cyan
Write-Host ""

# Get service details
$service = Get-WmiObject Win32_Service | Where-Object {$_.Name -eq 'MongoDB'}

if ($service) {
    Write-Host "Service found!" -ForegroundColor Green
    Write-Host "Name: $($service.Name)"
    Write-Host "Status: $($service.Status)"
    Write-Host "Start Mode: $($service.StartMode)"
    Write-Host ""
    Write-Host "Service Command Line:" -ForegroundColor Yellow
    Write-Host $service.PathName
    Write-Host ""

    # Check if config file is specified
    if ($service.PathName -like "*--config*") {
        Write-Host "[OK] Service is using a config file" -ForegroundColor Green
    } elseif ($service.PathName -like "*mongod.cfg*") {
        Write-Host "[OK] Service is using mongod.cfg" -ForegroundColor Green
    } else {
        Write-Host "[WARNING] Service may not be using mongod.cfg!" -ForegroundColor Red
        Write-Host "This could explain why authentication isn't working" -ForegroundColor Red
    }
} else {
    Write-Host "[ERROR] MongoDB service not found!" -ForegroundColor Red
}

Write-Host ""
pause
