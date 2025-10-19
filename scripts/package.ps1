# PowerShell script for easy executable packaging
# Usage: .\package.ps1 [type] [options]

param(
    [Parameter(Position = 0)]
    [string]$Type,
    
    [Parameter(Position = 1)]
    [string[]]$Options
)

function Show-Help {
    Write-Host "Universal Executable Packager for Windows" -ForegroundColor Cyan
    Write-Host ""
    Write-Host "Usage: .\package.ps1 [type] [options]" -ForegroundColor Yellow
    Write-Host ""
    Write-Host "Types:" -ForegroundColor Green
    Write-Host "  node      - Package Node.js application using pkg" -ForegroundColor White
    Write-Host "  electron  - Package Electron application using electron-builder" -ForegroundColor White
    Write-Host "  python    - Package Python application using PyInstaller" -ForegroundColor White
    Write-Host "  web       - Package web application (requires Tauri)" -ForegroundColor White
    Write-Host ""
    Write-Host "Examples:" -ForegroundColor Green
    Write-Host "  .\package.ps1 node --entry-point app.js --output-name myapp" -ForegroundColor White
    Write-Host "  .\package.ps1 electron --package-json package.json" -ForegroundColor White
    Write-Host "  .\package.ps1 python --entry-point main.py --one-file" -ForegroundColor White
    Write-Host ""
    Write-Host "Advanced Examples:" -ForegroundColor Green
    Write-Host "  .\package.ps1 node --config package-config.json" -ForegroundColor White
    Write-Host "  .\package.ps1 python --entry-point main.py --one-file --add-data './data;data'" -ForegroundColor White
}

# Check if Node.js is available
try {
    $nodeVersion = node --version 2>$null
    if (-not $nodeVersion) {
        throw "Node.js not found"
    }
}
catch {
    Write-Host "Node.js is required but not found. Please install Node.js first." -ForegroundColor Red
    exit 1
}

# Show help if no arguments provided
if (-not $Type) {
    Show-Help
    exit 0
}

# Show help for help command
if ($Type -eq "help") {
    node package-exe.js --help
    exit 0
}

Write-Host "Starting packaging process..." -ForegroundColor Cyan
Write-Host ""

# Build the command arguments
$args = @($Type)
if ($Options) {
    $args += $Options
}

# Execute the packaging script
try {
    & node package-exe.js @args
    
    if ($LASTEXITCODE -eq 0) {
        Write-Host ""
        Write-Host "Packaging completed successfully!" -ForegroundColor Green
        Write-Host "Check the dist folder for your executable." -ForegroundColor Cyan
        
        # Show the output directory contents
        if (Test-Path ".\dist") {
            Write-Host ""
            Write-Host "Generated files:" -ForegroundColor Yellow
            Get-ChildItem ".\dist" -File | ForEach-Object {
                $sizeInMB = [math]::Round($_.Length / 1MB, 2)
                Write-Host "  $($_.Name) ($sizeInMB MB)" -ForegroundColor White
            }
        }
    }
    else {
        Write-Host ""
        Write-Host "Packaging failed with error code $LASTEXITCODE" -ForegroundColor Red
        exit $LASTEXITCODE
    }
}
catch {
    Write-Host ""
    Write-Host "Error executing packaging script: $($_.Exception.Message)" -ForegroundColor Red
    exit 1
}