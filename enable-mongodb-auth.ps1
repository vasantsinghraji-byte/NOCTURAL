# MongoDB Authentication Enabler Script
# Run this with Administrator privileges:
# Right-click PowerShell -> Run as Administrator
# Then run: Set-ExecutionPolicy Bypass -Scope Process; .\enable-mongodb-auth.ps1

Write-Host "=== MongoDB Authentication Enabler ===" -ForegroundColor Cyan
Write-Host ""

# Check if running as administrator
$isAdmin = ([Security.Principal.WindowsPrincipal] [Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)

if (-not $isAdmin) {
    Write-Host "ERROR: This script must be run as Administrator" -ForegroundColor Red
    Write-Host ""
    Write-Host "To run as Administrator:" -ForegroundColor Yellow
    Write-Host "1. Right-click PowerShell" -ForegroundColor Yellow
    Write-Host "2. Select 'Run as Administrator'" -ForegroundColor Yellow
    Write-Host "3. Run: Set-ExecutionPolicy Bypass -Scope Process" -ForegroundColor Yellow
    Write-Host "4. Run: .\enable-mongodb-auth.ps1" -ForegroundColor Yellow
    Write-Host ""
    pause
    exit 1
}

$configPath = "C:\Program Files\MongoDB\Server\8.2\bin\mongod.cfg"
$backupPath = "C:\Program Files\MongoDB\Server\8.2\bin\mongod.cfg.backup"

Write-Host "Step 1: Creating backup of mongod.cfg..." -ForegroundColor Yellow
try {
    Copy-Item $configPath $backupPath -Force
    Write-Host "✓ Backup created: $backupPath" -ForegroundColor Green
} catch {
    Write-Host "✗ Failed to create backup: $_" -ForegroundColor Red
    pause
    exit 1
}

Write-Host ""
Write-Host "Step 2: Reading current configuration..." -ForegroundColor Yellow
$content = Get-Content $configPath -Raw

Write-Host ""
Write-Host "Step 3: Enabling authentication..." -ForegroundColor Yellow

# Replace the commented security section with enabled authentication
$newContent = $content -replace '#security:', "security:`n  authorization: enabled"

Write-Host ""
Write-Host "Step 4: Writing new configuration..." -ForegroundColor Yellow
try {
    Set-Content $configPath $newContent -Force
    Write-Host "✓ Configuration updated successfully" -ForegroundColor Green
} catch {
    Write-Host "✗ Failed to update configuration: $_" -ForegroundColor Red
    Write-Host "Restoring backup..." -ForegroundColor Yellow
    Copy-Item $backupPath $configPath -Force
    pause
    exit 1
}

Write-Host ""
Write-Host "Step 5: Restarting MongoDB service..." -ForegroundColor Yellow
try {
    Write-Host "Stopping MongoDB..." -ForegroundColor Yellow
    Stop-Service -Name "MongoDB" -Force
    Start-Sleep -Seconds 2

    Write-Host "Starting MongoDB..." -ForegroundColor Yellow
    Start-Service -Name "MongoDB"
    Start-Sleep -Seconds 3

    $service = Get-Service -Name "MongoDB"
    if ($service.Status -eq "Running") {
        Write-Host "✓ MongoDB service restarted successfully" -ForegroundColor Green
    } else {
        Write-Host "⚠ MongoDB service status: $($service.Status)" -ForegroundColor Yellow
    }
} catch {
    Write-Host "✗ Failed to restart MongoDB service: $_" -ForegroundColor Red
    Write-Host ""
    Write-Host "Please restart manually:" -ForegroundColor Yellow
    Write-Host "  net stop MongoDB" -ForegroundColor Yellow
    Write-Host "  net start MongoDB" -ForegroundColor Yellow
}

Write-Host ""
Write-Host "=== Configuration Complete ===" -ForegroundColor Cyan
Write-Host ""
Write-Host "MongoDB authentication is now ENABLED" -ForegroundColor Green
Write-Host ""
Write-Host "User credentials created:" -ForegroundColor White
Write-Host "─────────────────────────────────────" -ForegroundColor Gray
Write-Host "Development:" -ForegroundColor Yellow
Write-Host "  User: nocturnaldev" -ForegroundColor White
Write-Host "  Pass: DevPass2025!ChangeMe" -ForegroundColor White
Write-Host "  DB:   nocturnal_dev" -ForegroundColor White
Write-Host ""
Write-Host "Production:" -ForegroundColor Yellow
Write-Host "  User: nocturnalprod" -ForegroundColor White
Write-Host "  Pass: ProdPass2025!VeryStrong" -ForegroundColor White
Write-Host "  DB:   nocturnal_prod" -ForegroundColor White
Write-Host "─────────────────────────────────────" -ForegroundColor Gray
Write-Host ""
Write-Host "Next steps:" -ForegroundColor Cyan
Write-Host "1. Update .env files with these passwords" -ForegroundColor White
Write-Host "2. Test the connection: node test-mongo-connection.js" -ForegroundColor White
Write-Host "3. Start your application: npm start" -ForegroundColor White
Write-Host ""
Write-Host "⚠ IMPORTANT: Change these default passwords!" -ForegroundColor Red
Write-Host ""
pause
