# PowerShell script to run TMS fixes
# Usage examples:
#   .\run-fixes.ps1 sync-routes
#   .\run-fixes.ps1 enable-booking route-123 2024-07-06
#   .\run-fixes.ps1 check-booking route-123 2024-07-06
#   .\run-fixes.ps1 enable-all 2024-07-06 2024-07-08

param(
    [string]$Action,
    [string]$RouteId,
    [string]$Date,
    [string]$EndDate
)

Write-Host "🚀 TMS Fix Runner" -ForegroundColor Cyan

switch ($Action) {
    "sync-routes" {
        Write-Host "🔄 Syncing route allocations..." -ForegroundColor Yellow
        node fix-valarmathi-route-allocation.js
    }
    "test-dates" {
        Write-Host "🧪 Testing date timezone handling..." -ForegroundColor Yellow
        node fix-date-timezone-issue.js
    }
    "verify-date-fix" {
        Write-Host "✅ Verifying date timezone fix..." -ForegroundColor Green
        node verify-date-fix.js
    }
    "test-sql-fix" {
        Write-Host "🔍 Testing SQL-based date fix..." -ForegroundColor Cyan
        node test-sql-date-fix.js
    }
    "test-admin-fix" {
        Write-Host "🔧 Testing admin date fix..." -ForegroundColor Magenta
        node test-admin-date-fix.js
    }
    "enable-booking" {
        Write-Host "🔧 Enabling booking for Route: $RouteId, Date: $Date" -ForegroundColor Yellow
        if ($EndDate) {
            node enable-booking-for-route.js enable $RouteId $Date $EndDate
        } else {
            node enable-booking-for-route.js enable $RouteId $Date
        }
    }
    "check-booking" {
        Write-Host "🔍 Checking booking status for Route: $RouteId, Date: $Date" -ForegroundColor Yellow
        node enable-booking-for-route.js check $RouteId $Date
    }
    "enable-all" {
        Write-Host "🚀 Enabling booking for all routes, Date: $Date" -ForegroundColor Yellow
        if ($EndDate) {
            node enable-booking-for-route.js enable-all $Date $EndDate
        } else {
            node enable-booking-for-route.js enable-all $Date
        }
    }
    default {
        Write-Host "📖 Usage:" -ForegroundColor Yellow
        Write-Host "  .\run-fixes.ps1 sync-routes"
        Write-Host "  .\run-fixes.ps1 test-dates"
        Write-Host "  .\run-fixes.ps1 verify-date-fix"
        Write-Host "  .\run-fixes.ps1 test-sql-fix"
        Write-Host "  .\run-fixes.ps1 test-admin-fix"
        Write-Host "  .\run-fixes.ps1 enable-booking route-123 2024-07-06"
        Write-Host "  .\run-fixes.ps1 check-booking route-123 2024-07-06"
        Write-Host "  .\run-fixes.ps1 enable-all 2024-07-06 2024-07-08"
    }
}