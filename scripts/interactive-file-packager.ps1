# Interactive PowerShell wrapper for the file packager
# This creates self-extracting archives from loose files and folders

Write-Host "Interactive File Packager" -ForegroundColor Cyan
Write-Host "=========================" -ForegroundColor Cyan
Write-Host "Create self-extracting archives from loose files and folders"
Write-Host ""

# Check if Node.js is available
try {
    $nodeVersion = node --version 2>$null
    if (-not $nodeVersion) {
        throw "Node.js not found"
    }
}
catch {
    Write-Host "Node.js is required but not found. Please install Node.js first." -ForegroundColor Red
    Write-Host "Download from: https://nodejs.org/" -ForegroundColor Yellow
    Read-Host "Press Enter to exit"
    exit 1
}

Write-Host "Starting interactive file packager..." -ForegroundColor Green
Write-Host ""

# Run the interactive file packager
try {
    node .\scripts\interactive-file-packager.js
}
catch {
    Write-Host ""
    Write-Host "Error running interactive file packager: $($_.Exception.Message)" -ForegroundColor Red
    Read-Host "Press Enter to exit"
    exit 1
}

Write-Host ""
Read-Host "Press Enter to exit"
