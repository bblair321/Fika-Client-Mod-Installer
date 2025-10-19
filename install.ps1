# Installation script for exe-packager
# This script installs the required dependencies

Write-Host "EXE Packager Installation" -ForegroundColor Cyan
Write-Host "=========================" -ForegroundColor Cyan
Write-Host ""

# Check if Node.js is installed
Write-Host "Checking Node.js installation..." -ForegroundColor Yellow
try {
    $nodeVersion = node --version 2>$null
    if ($nodeVersion) {
        Write-Host "✅ Node.js found: $nodeVersion" -ForegroundColor Green
    }
    else {
        throw "Node.js not found"
    }
}
catch {
    Write-Host "❌ Node.js is required but not found." -ForegroundColor Red
    Write-Host "Please install Node.js from https://nodejs.org/" -ForegroundColor Yellow
    Write-Host "Then run this installation script again." -ForegroundColor Yellow
    exit 1
}

# Check if npm is available
Write-Host "Checking npm..." -ForegroundColor Yellow
try {
    $npmVersion = npm --version 2>$null
    if ($npmVersion) {
        Write-Host "✅ npm found: $npmVersion" -ForegroundColor Green
    }
    else {
        throw "npm not found"
    }
}
catch {
    Write-Host "❌ npm is required but not found." -ForegroundColor Red
    exit 1
}

# Install local dependencies
Write-Host ""
Write-Host "Installing local dependencies..." -ForegroundColor Yellow
try {
    npm install
    Write-Host "✅ Local dependencies installed successfully" -ForegroundColor Green
}
catch {
    Write-Host "❌ Failed to install local dependencies" -ForegroundColor Red
    Write-Host "Error: $_" -ForegroundColor Red
    exit 1
}

# Install global tools (optional)
Write-Host ""
Write-Host "Installing global packaging tools..." -ForegroundColor Yellow
Write-Host "This will install pkg and electron-builder globally (optional)" -ForegroundColor Gray

$response = Read-Host "Install global tools? (y/n)"
if ($response -eq "y" -or $response -eq "Y") {
    try {
        Write-Host "Installing pkg..." -ForegroundColor Gray
        npm install -g pkg
        
        Write-Host "Installing electron-builder..." -ForegroundColor Gray
        npm install -g electron-builder
        
        Write-Host "✅ Global tools installed successfully" -ForegroundColor Green
    }
    catch {
        Write-Host "⚠️  Some global tools failed to install, but the packager will install them as needed" -ForegroundColor Yellow
    }
}
else {
    Write-Host "Skipping global tools installation. The packager will install them as needed." -ForegroundColor Yellow
}

# Check Python (for PyInstaller)
Write-Host ""
Write-Host "Checking Python installation (for Python app packaging)..." -ForegroundColor Yellow
try {
    $pythonVersion = python --version 2>$null
    if ($pythonVersion) {
        Write-Host "✅ Python found: $pythonVersion" -ForegroundColor Green
    }
    else {
        Write-Host "⚠️  Python not found. Python app packaging will require manual PyInstaller installation." -ForegroundColor Yellow
    }
}
catch {
    Write-Host "⚠️  Python not found. Python app packaging will require manual PyInstaller installation." -ForegroundColor Yellow
}

Write-Host ""
Write-Host "🎉 Installation completed!" -ForegroundColor Green
Write-Host ""
Write-Host "Usage:" -ForegroundColor Yellow
Write-Host "  .\scripts\package.ps1 [type] [options]     # Package applications" -ForegroundColor White
Write-Host "  .\scripts\pack-files.ps1 [options]        # Package files into self-extracting archives" -ForegroundColor White
Write-Host "  .\examples\demo.ps1                       # Run demo examples" -ForegroundColor White
Write-Host ""
Write-Host "Documentation:" -ForegroundColor Yellow
Write-Host "  README.md                                 # Main documentation" -ForegroundColor White
Write-Host "  docs\                                     # Detailed guides" -ForegroundColor White
Write-Host "  examples\                                 # Example projects" -ForegroundColor White
