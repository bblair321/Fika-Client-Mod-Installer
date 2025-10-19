# PowerShell script for packing files into self-extracting executables
# Usage: .\pack-files.ps1 [options]

param(
    [Parameter(Position = 0)]
    [string[]]$Files,
    
    [Parameter(Position = 1)]
    [string[]]$Folders,
    
    [string]$OutputName,
    [string]$AppName,
    [string]$Version,
    [string]$Config
)

function Show-Help {
    Write-Host "File Packing Script - Self-Extracting Executables" -ForegroundColor Cyan
    Write-Host ""
    Write-Host "Usage: .\pack-files.ps1 [options]" -ForegroundColor Yellow
    Write-Host ""
    Write-Host "Options:" -ForegroundColor Green
    Write-Host "  -Files <pattern>     - Files to include (can specify multiple)" -ForegroundColor White
    Write-Host "  -Folders <pattern>   - Folders to include (can specify multiple)" -ForegroundColor White
    Write-Host "  -OutputName <name>   - Name of the output executable" -ForegroundColor White
    Write-Host "  -AppName <name>      - Application name" -ForegroundColor White
    Write-Host "  -Version <version>   - Version number" -ForegroundColor White
    Write-Host "  -Config <file>       - Use configuration file (JSON)" -ForegroundColor White
    Write-Host ""
    Write-Host "Examples:" -ForegroundColor Green
    Write-Host "  .\pack-files.ps1 -Files 'config.json' -Files 'readme.txt' -OutputName 'MyPackage'" -ForegroundColor White
    Write-Host "  .\pack-files.ps1 -Folders 'assets' -Folders 'data' -OutputName 'GameFiles'" -ForegroundColor White
    Write-Host "  .\pack-files.ps1 -Config 'pack-config.json'" -ForegroundColor White
    Write-Host ""
    Write-Host "Advanced Examples:" -ForegroundColor Green
    Write-Host "  .\pack-files.ps1 -Files 'config.json' -Folders 'assets' -AppName 'MyApp' -Version '2.0.0'" -ForegroundColor White
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
if (-not $Files -and -not $Folders -and -not $Config) {
    Show-Help
    exit 0
}

Write-Host "Starting file packing process..." -ForegroundColor Cyan
Write-Host ""

# Build the command arguments
$commandArgs = @()

if ($Files) {
    foreach ($file in $Files) {
        $commandArgs += "--files"
        $commandArgs += $file
    }
}

if ($Folders) {
    foreach ($folder in $Folders) {
        $commandArgs += "--folders"
        $commandArgs += $folder
    }
}

if ($OutputName) {
    $commandArgs += "--output-name"
    $commandArgs += $OutputName
}

if ($AppName) {
    $commandArgs += "--app-name"
    $commandArgs += $AppName
}

if ($Version) {
    $commandArgs += "--version"
    $commandArgs += $Version
}

if ($Config) {
    $commandArgs += "--config"
    $commandArgs += $Config
}

# Execute the packing script
try {
    & node scripts\pack-files.js @commandArgs
    
    if ($LASTEXITCODE -eq 0) {
        Write-Host ""
        Write-Host "File packing completed successfully!" -ForegroundColor Green
        Write-Host "Check the dist folder for your self-extracting executable." -ForegroundColor Cyan
        
        # Show the output directory contents
        if (Test-Path ".\dist") {
            Write-Host ""
            Write-Host "Generated files:" -ForegroundColor Yellow
            Get-ChildItem ".\dist" -File | ForEach-Object {
                $sizeInMB = [math]::Round($_.Length / 1MB, 2)
                Write-Host "  $($_.Name) ($sizeInMB MB)" -ForegroundColor White
            }
        }
        
        Write-Host ""
        Write-Host "How to use the generated executable:" -ForegroundColor Yellow
        Write-Host "1. Run the .exe file" -ForegroundColor White
        Write-Host "2. Choose where to extract the files" -ForegroundColor White
        Write-Host "3. Files will be extracted to your chosen directory" -ForegroundColor White
    }
    else {
        Write-Host ""
        Write-Host "File packing failed with error code $LASTEXITCODE" -ForegroundColor Red
        exit $LASTEXITCODE
    }
}
catch {
    Write-Host ""
    Write-Host "Error executing packing script: $($_.Exception.Message)" -ForegroundColor Red
    exit 1
}
