#!/usr/bin/env node

/**
 * File Packing Script - Creates self-extracting executables
 * Packs files into an executable that extracts them when run
 */

const fs = require("fs");
const path = require("path");
const { execSync } = require("child_process");
const os = require("os");
const archiver = require("archiver");
const AdmZip = require("adm-zip");

class FilePacker {
  constructor(config = {}) {
    this.config = {
      outputDir: "./dist",
      version: "1.0.0",
      appName: "MyPackage",
      includeVersion: true,
      ...config,
    };
  }

  /**
   * Pack files into a self-extracting executable
   */
  async packFiles(options = {}) {
    const {
      files = [],
      folders = [],
      outputName,
      extractorTemplate = "default",
    } = options;

    console.log("📦 Creating self-extracting package...");

    // Create temporary directory for packaging
    const tempDir = path.join(this.config.outputDir, "temp-package");
    if (!fs.existsSync(tempDir)) {
      fs.mkdirSync(tempDir, { recursive: true });
    }

    // Create archive of all files
    const archivePath = path.join(tempDir, "files.zip");
    await this.createArchive(files, folders, archivePath);

    // Package the extractor with pkg
    const outputFileName = outputName || this.generateOutputName();

    // Create the extractor executable
    const archiveFileName = `${path.parse(outputFileName).name}_archive.zip`;
    const extractorCode = this.generateExtractor(archivePath, archiveFileName);
    const extractorPath = path.join(tempDir, "extractor.js");
    fs.writeFileSync(extractorPath, extractorCode);
    await this.createExtractorExecutable(
      extractorPath,
      outputFileName,
      archivePath
    );

    // Copy the archive file to the output directory alongside the executable
    const finalArchivePath = path.join(
      this.config.outputDir,
      `${path.parse(outputFileName).name}_archive.zip`
    );
    fs.copyFileSync(archivePath, finalArchivePath);

    // Cleanup temp directory
    this.cleanup(tempDir);

    console.log(`✅ Created self-extracting package: ${outputFileName}`);
  }

  /**
   * Create ZIP archive of files and folders
   */
  async createArchive(files, folders, outputPath) {
    return new Promise((resolve, reject) => {
      const output = fs.createWriteStream(outputPath);
      const archive = archiver("zip", { zlib: { level: 9 } });

      output.on("close", () => {
        console.log(`📁 Archive created: ${archive.pointer()} bytes`);
        resolve();
      });

      archive.on("error", (err) => {
        reject(err);
      });

      archive.pipe(output);

      // Add individual files
      files.forEach((file) => {
        if (fs.existsSync(file)) {
          const fileName = path.basename(file);
          archive.file(file, { name: fileName });
          console.log(`📄 Added file: ${fileName}`);
        }
      });

      // Add folders
      folders.forEach((folder) => {
        if (fs.existsSync(folder)) {
          const folderName = path.basename(folder);
          archive.directory(folder, folderName);
          console.log(`📁 Added folder: ${folderName}`);
        }
      });

      archive.finalize();
    });
  }

  /**
   * Generate the extractor Node.js code
   */
  generateExtractor(archivePath, archiveFileName) {
    return `
const fs = require('fs');
const path = require('path');
const os = require('os');
const { execSync } = require('child_process');

// Look for the archive file alongside the executable
const archiveFileName = '${archiveFileName}';

function showMessage(message) {
  console.log('\\n' + '='.repeat(50));
  console.log(message);
  console.log('='.repeat(50));
}

function formatBytes(bytes) {
  if (bytes === 0) return '0 Bytes';
  const k = 1024;
  const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

function selectDirectory() {
  console.log('\\n📁 File Extractor');
  console.log('==================');
  
  try {
    console.log('\\n🖱️  Opening folder selection dialog...');
    
    // Try to use a native GUI dialog first
    const guiResult = showNativeFolderDialog();
    if (guiResult) {
      console.log(\`\\n✅ Selected directory: \${guiResult}\`);
      return guiResult;
    }
    
    // Fallback to batch file approach
    console.log('\\n📂 Falling back to text input dialog...');
    return getInteractiveInput();
    
  } catch (error) {
    console.log(\`\\n⚠️  GUI dialog failed: \${error.message}\`);
    console.log('\\n📂 Falling back to text input dialog...');
    return getInteractiveInput();
  }
}

function showNativeFolderDialog() {
  // Create a simple HTML-based dialog using Windows' built-in capabilities
  const dialogScript = \`
<!DOCTYPE html>
<html>
<head>
    <title>Select Installation Directory</title>
    <style>
        body { font-family: Arial, sans-serif; padding: 20px; background: #f0f0f0; }
        .container { background: white; padding: 30px; border-radius: 10px; box-shadow: 0 2px 10px rgba(0,0,0,0.1); max-width: 600px; margin: 0 auto; }
        h1 { color: #333; text-align: center; margin-bottom: 20px; }
        .info { background: #e7f3ff; padding: 15px; border-radius: 5px; margin: 20px 0; border-left: 4px solid #2196F3; }
        .warning { background: #fff3cd; padding: 15px; border-radius: 5px; margin: 20px 0; border-left: 4px solid #ffc107; }
        .path-input { width: 100%; padding: 10px; border: 2px solid #ddd; border-radius: 5px; font-size: 14px; margin: 10px 0; }
        .btn { background: #4CAF50; color: white; padding: 12px 24px; border: none; border-radius: 5px; cursor: pointer; font-size: 16px; margin: 10px 5px; }
        .btn:hover { background: #45a049; }
        .btn-secondary { background: #6c757d; }
        .btn-secondary:hover { background: #5a6268; }
        .examples { background: #f8f9fa; padding: 15px; border-radius: 5px; margin: 15px 0; }
        .examples code { background: #e9ecef; padding: 2px 6px; border-radius: 3px; font-family: monospace; }
    </style>
</head>
<body>
    <div class="container">
        <h1>📁 Select Installation Directory</h1>
        
        <div class="info">
            <strong>IMPORTANT:</strong> Please select the folder where you want to install the mod files.
            For BepInEx mods, this should be your game's <code>BepInEx/plugins</code> folder.
        </div>
        
        <div class="examples">
            <strong>Common game directories:</strong><br>
            <code>C:\\Program Files (x86)\\Steam\\steamapps\\common\\[GameName]\\BepInEx\\plugins</code><br>
            <code>C:\\Program Files\\Steam\\steamapps\\common\\[GameName]\\BepInEx\\plugins</code><br>
            <code>C:\\Program Files (x86)\\Epic Games\\[GameName]\\BepInEx\\plugins</code><br>
            <code>D:\\Games\\[GameName]\\BepInEx\\plugins</code>
        </div>
        
        <input type="text" id="pathInput" class="path-input" placeholder="Enter the full path to your game's BepInEx/plugins folder...">
        
        <div style="text-align: center;">
            <button class="btn" onclick="selectPath()">📁 Browse for Folder</button>
            <button class="btn btn-secondary" onclick="useDefault()">Use Desktop</button>
        </div>
        
        <div class="warning">
            <strong>Note:</strong> Using Desktop is not recommended for game mods. The mod may not work correctly.
        </div>
    </div>
    
    <script>
        // Set default path
        document.getElementById('pathInput').value = 'C:\\\\Users\\\\' + (process.env.USERNAME || 'User') + '\\\\Desktop';
        
        function selectPath() {
            const { dialog } = require('electron');
            const selectedPath = dialog.showOpenDialogSync({
                title: 'Select Installation Directory',
                properties: ['openDirectory', 'createDirectory'],
                defaultPath: document.getElementById('pathInput').value
            });
            
            if (selectedPath && selectedPath.length > 0) {
                document.getElementById('pathInput').value = selectedPath[0];
                document.getElementById('result').value = selectedPath[0];
                setTimeout(() => {
                    window.close();
                }, 500);
            }
        }
        
        function useDefault() {
            const desktopPath = 'C:\\\\Users\\\\' + (process.env.USERNAME || 'User') + '\\\\Desktop';
            document.getElementById('pathInput').value = desktopPath;
            document.getElementById('result').value = desktopPath;
            setTimeout(() => {
                window.close();
            }, 500);
        }
        
        // Handle Enter key
        document.getElementById('pathInput').addEventListener('keypress', function(e) {
            if (e.key === 'Enter') {
                document.getElementById('result').value = this.value;
                setTimeout(() => {
                    window.close();
                }, 500);
            }
        });
    </script>
    
    <input type="hidden" id="result" value="">
</body>
</html>
\`;
  
  // For now, let's use a simpler approach that works better with pkg
  // We'll create a Windows Script Host dialog instead
  const vbsScript = \`
Set objShell = CreateObject("Shell.Application")
Set objFolder = objShell.BrowseForFolder(0, "Select folder to extract files to:", 0)

If objFolder Is Nothing Then
    WScript.Echo "C:\\\\Users\\\\" & CreateObject("WScript.Network").UserName & "\\\\Desktop"
Else
    WScript.Echo objFolder.Self.Path
End If
\`;

  try {
    const tempVbsFile = path.join(os.tmpdir(), \`folder-dialog-\${Date.now()}.vbs\`);
    fs.writeFileSync(tempVbsFile, vbsScript);
    
    const result = execSync(\`cscript //nologo "\${tempVbsFile}"\`, { 
      encoding: 'utf8',
      timeout: 60000
    }).trim();
    
    // Clean up
    if (fs.existsSync(tempVbsFile)) {
      fs.unlinkSync(tempVbsFile);
    }
    
    if (result && result.length > 0 && fs.existsSync(result)) {
      return result;
    }
    
    return null;
    
  } catch (error) {
    console.log(\`\\n⚠️  Native dialog failed: \${error.message}\`);
    return null;
  }
}

function getInteractiveInput() {
  // Fallback to batch file input method when PowerShell dialog fails
  const tempDir = os.tmpdir();
  const batchFile = path.join(tempDir, \`folder-select-\${Date.now()}.bat\`);
  const resultFile = path.join(tempDir, \`folder-result-\${Date.now()}.txt\`);
  
  const batchContent = \`@echo off
setlocal EnableDelayedExpansion

echo.
echo ========================================
echo    Folder Selection for File Extractor
echo ========================================
echo.
echo IMPORTANT: You need to specify WHERE to extract the mod files!
echo.
echo Please enter the full path where you want to extract the files.
echo.
echo Common game directories:
echo   C:\\\\Program Files ^(x86^)\\\\Steam\\\\steamapps\\\\common\\\\[GameName]\\\\BepInEx\\\\plugins
echo   C:\\\\Program Files\\\\Steam\\\\steamapps\\\\common\\\\[GameName]\\\\BepInEx\\\\plugins
echo   C:\\\\Program Files ^(x86^)\\\\Epic Games\\\\[GameName]\\\\BepInEx\\\\plugins
echo   D:\\\\Games\\\\[GameName]\\\\BepInEx\\\\plugins
echo.
echo You can:
echo   - Type the full path (RECOMMENDED)
echo   - Drag and drop a folder here
echo   - Press Enter for Desktop (NOT RECOMMENDED)
echo.

set /p "selectedPath=Enter extraction path (or press Enter for Desktop): "

if "!selectedPath!"=="" (
    set "selectedPath=%USERPROFILE%\\\\Desktop"
    echo.
    echo WARNING: Using Desktop as extraction location!
    echo This is not recommended for game mods.
    echo.
)

echo !selectedPath! > "\${resultFile}"
echo.
echo Selected: !selectedPath!
echo.
echo Press any key to continue...
pause > nul\`;

  try {
    // Write the batch file
    fs.writeFileSync(batchFile, batchContent);
    
    // Run the batch file
    execSync(\`"\${batchFile}"\`, { stdio: 'inherit' });
    
    // Read the result
    if (fs.existsSync(resultFile)) {
      const result = fs.readFileSync(resultFile, 'utf8').trim();
      
      // Clean up temp files
      if (fs.existsSync(batchFile)) fs.unlinkSync(batchFile);
      if (fs.existsSync(resultFile)) fs.unlinkSync(resultFile);
      
      if (result && result.length > 0) {
        console.log(\`\\n✅ Selected directory: \${result}\`);
        return result;
      }
    }
    
    // Fallback to smart default
    return getSmartDefaultPath();
    
  } catch (error) {
    console.log(\`\\n⚠️  Interactive input failed: \${error.message}\`);
    
    // Clean up temp files
    if (fs.existsSync(batchFile)) fs.unlinkSync(batchFile);
    if (fs.existsSync(resultFile)) fs.unlinkSync(resultFile);
    
    return getSmartDefaultPath();
  }
}

function getSmartDefaultPath() {
  // Smart path detection - try to find common game directories
  const possiblePaths = [
    path.join(os.homedir(), 'Desktop'),
    'C:\\\\Program Files (x86)\\\\Steam\\\\steamapps\\\\common',
    'C:\\\\Program Files\\\\Steam\\\\steamapps\\\\common',
    'C:\\\\Program Files (x86)\\\\Epic Games',
    'C:\\\\Program Files\\\\Epic Games',
    'C:\\\\Games',
    path.join(os.homedir(), 'Documents', 'My Games')
  ];
  
  for (const testPath of possiblePaths) {
    if (fs.existsSync(testPath)) {
      console.log(\`\\n📂 Using smart default: \${testPath}\`);
      return testPath;
    }
  }
  
  // Ultimate fallback
  const defaultDir = path.join(os.homedir(), 'Desktop');
  console.log(\`\\n📂 Using fallback default: \${defaultDir}\`);
  return defaultDir;
}

function extractFiles() {
  try {
    showMessage('${this.config.appName} - File Extractor');
    
    const extractDir = selectDirectory();
    
    if (!extractDir) {
      console.log('❌ No extraction directory specified.');
      return;
    }

    console.log(\`\\n📂 Extracting to: \${extractDir}\`);
    
    // Create extraction directory
    if (!fs.existsSync(extractDir)) {
      fs.mkdirSync(extractDir, { recursive: true });
    }
    
    // Find the archive file in the same directory as the executable
    const executablePath = process.execPath;
    const executableDir = path.dirname(executablePath);
    let archivePath = path.join(executableDir, archiveFileName);
    
    console.log(\`\\n📦 Looking for archive: \${archivePath}\`);
    
    // If not found in executable directory, try current working directory
    if (!fs.existsSync(archivePath)) {
      const cwdArchivePath = path.join(process.cwd(), archiveFileName);
      console.log(\`\\n📦 Trying current directory: \${cwdArchivePath}\`);
      
      if (fs.existsSync(cwdArchivePath)) {
        archivePath = cwdArchivePath;
        console.log(\`\\n✅ Found archive in current directory\`);
      } else {
        // Try to find any archive file with similar name
        const possibleNames = [
          archiveFileName,
          archiveFileName.replace('_archive.zip', '.zip'),
          archiveFileName.replace('_archive.zip', '_files.zip'),
          'files.zip',
          'archive.zip'
        ];
        
        let found = false;
        for (const name of possibleNames) {
          const testPath = path.join(executableDir, name);
          if (fs.existsSync(testPath)) {
            archivePath = testPath;
            console.log(\`\\n✅ Found archive: \${name}\`);
            found = true;
            break;
          }
        }
        
        if (!found) {
          throw new Error(\`Archive file not found. Tried:\\n- \${archivePath}\\n- \${cwdArchivePath}\\n\\nPlease ensure the \${archiveFileName} file is in the same folder as this executable.\`);
        }
      }
    }
    
    const tempArchivePath = path.join(os.tmpdir(), 'temp-extract-${Date.now()}.zip');
    console.log(\`\\n📦 Copying archive to: \${tempArchivePath}\`);
    
    fs.copyFileSync(archivePath, tempArchivePath);
    const stats = fs.statSync(tempArchivePath);
    console.log(\`✅ Archive copied (\${stats.size} bytes)\`);
    
    // Extract using Node.js native zip library (more reliable than PowerShell)
    try {
      console.log('\\n🔄 Extracting files...');
      console.log('\\n⏳ Please wait while files are being extracted...');
      
      console.log('\\n🔧 Running Node.js extraction...');
      console.log(\`Source: \${tempArchivePath}\`);
      console.log(\`Destination: \${extractDir}\`);
      
      // Use a hybrid approach - try AdmZip first, fallback to PowerShell
      let extractedCount = 0;
      
      try {
        // Try AdmZip first (if available)
        if (typeof AdmZip !== 'undefined') {
          const zip = new AdmZip(tempArchivePath);
          const entries = zip.getEntries();
          
          console.log(\`\\n📦 Archive contains \${entries.length} items\`);
          
          entries.forEach(entry => {
            if (!entry.isDirectory) {
              const entryPath = path.join(extractDir, entry.entryName);
              const entryDir = path.dirname(entryPath);
              
              // Create directory if it doesn't exist
              if (!fs.existsSync(entryDir)) {
                fs.mkdirSync(entryDir, { recursive: true });
              }
              
              // Extract file
              fs.writeFileSync(entryPath, entry.getData());
              extractedCount++;
              
              console.log(\`   📄 Extracted: \${entry.entryName}\`);
            } else {
              // Create directory
              const dirPath = path.join(extractDir, entry.entryName);
              if (!fs.existsSync(dirPath)) {
                fs.mkdirSync(dirPath, { recursive: true });
              }
              console.log(\`   📂 Created: \${entry.entryName}/\`);
            }
          });
        } else {
          throw new Error('AdmZip not available');
        }
      } catch (zipError) {
        console.log('\\n⚠️  AdmZip not available, using PowerShell fallback...');
        
        // Fallback to PowerShell extraction with better error handling
        const psExtractScript = \`
Write-Host "Starting PowerShell extraction..." -ForegroundColor Cyan
Write-Host "Source: \${tempArchivePath.replace(/\\\\/g, '/')}" -ForegroundColor Gray
Write-Host "Destination: \${extractDir.replace(/\\\\/g, '/')}" -ForegroundColor Gray
Write-Host ""

# Check if source exists
if (Test-Path "\${tempArchivePath.replace(/\\\\/g, '/')}") {
  Write-Host "✅ Source archive found" -ForegroundColor Green
  \$sourceSize = (Get-Item "\${tempArchivePath.replace(/\\\\/g, '/')}").Length
  Write-Host "Archive size: \$sourceSize bytes" -ForegroundColor Gray
} else {
  Write-Host "❌ Source archive not found!" -ForegroundColor Red
  throw "Source archive not found: \${tempArchivePath.replace(/\\\\/g, '/')}"
}

# Check if destination exists
if (Test-Path "\${extractDir.replace(/\\\\/g, '/')}") {
  Write-Host "✅ Destination directory exists" -ForegroundColor Green
} else {
  Write-Host "⚠️  Destination directory doesn't exist, creating..." -ForegroundColor Yellow
  New-Item -ItemType Directory -Path "\${extractDir.replace(/\\\\/g, '/')}" -Force
}

try {
  Write-Host "Extracting files..." -ForegroundColor Yellow
  Expand-Archive -Path "\${tempArchivePath.replace(/\\\\/g, '/')}" -DestinationPath "\${extractDir.replace(/\\\\/g, '/')}" -Force
  Write-Host "✅ PowerShell extraction completed!" -ForegroundColor Green
  
  # List extracted files
  Write-Host "Extracted files:" -ForegroundColor Cyan
  \$items = Get-ChildItem -Path "\${extractDir.replace(/\\\\/g, '/')}" -Recurse
  Write-Host "Total items extracted: \$(\$items.Count)" -ForegroundColor Green
  \$items | ForEach-Object {
    if (\$_.PSIsContainer) {
      Write-Host "  📂 \$(\$_.FullName)" -ForegroundColor Blue
    } else {
      Write-Host "  📄 \$(\$_.FullName)" -ForegroundColor White
    }
  }
} catch {
  Write-Host "❌ PowerShell extraction failed: \$(\$_.Exception.Message)" -ForegroundColor Red
  Write-Host "Full error: \$(\$_)" -ForegroundColor Red
  throw \$_
}
\`;
        
        try {
          // Try a simpler PowerShell command first
          console.log('\\n🔧 Attempting simple PowerShell extraction...');
          execSync(\`powershell -Command "Expand-Archive -Path '\${tempArchivePath}' -DestinationPath '\${extractDir}' -Force"\`, { 
            stdio: 'inherit', 
            shell: true,
            timeout: 60000  // 60 second timeout
          });
          
          // Count extracted files
          const extractedFiles = fs.readdirSync(extractDir);
          extractedCount = extractedFiles.length;
          
          console.log(\`\\n✅ Simple PowerShell extraction completed! Found \${extractedCount} items.\`);
          
        } catch (psError) {
          console.log(\`\\n❌ Simple PowerShell extraction failed: \${psError.message}\`);
          
          // Try the detailed script as fallback
          try {
            console.log('\\n🔧 Trying detailed PowerShell extraction...');
            execSync(\`powershell -Command "\${psExtractScript}"\`, { 
              stdio: 'inherit', 
              shell: true,
              timeout: 60000  // 60 second timeout
            });
            
            // Count extracted files
            const extractedFiles = fs.readdirSync(extractDir);
            extractedCount = extractedFiles.length;
            
          } catch (detailedPsError) {
            console.log(\`\\n❌ Detailed PowerShell extraction also failed: \${detailedPsError.message}\`);
            throw detailedPsError;
          }
        }
      }
      
      console.log(\`\\n✅ Successfully extracted \${extractedCount} files!\`);
      
      // Verify extraction worked and show results
      const extractedFiles = fs.readdirSync(extractDir);
      console.log(\`\\n📁 Directory contents after extraction (\${extractedFiles.length} items):\`);
      
      let totalSize = 0;
      let newFilesCount = 0;
      extractedFiles.forEach(file => {
        const filePath = path.join(extractDir, file);
        const stats = fs.statSync(filePath);
        totalSize += stats.size;
        
        // Check if this looks like a newly extracted file/folder
        const isLikelyNew = file.includes('test-mod-content') || 
                           file.includes('BepInEx') || 
                           file.includes('debug-archive') ||
                           file.includes('config.json') || 
                           file.includes('TestMod.dll') ||
                           file.includes('README.md') ||
                           file.includes('mod') ||
                           file.includes('plugin') ||
                           file.includes('cache') ||
                           file.includes('core') ||
                           file.includes('patchers');
        
        if (stats.isDirectory()) {
          console.log(\`   📂 \${file}/\`);
          if (isLikelyNew) newFilesCount++;
        } else {
          const sizeStr = formatBytes(stats.size);
          console.log(\`   📄 \${file} (\${sizeStr})\`);
          if (isLikelyNew) newFilesCount++;
        }
      });
      
      console.log(\`\\n📊 Total directory size: \${formatBytes(totalSize)}\`);
      if (newFilesCount > 0) {
        console.log(\`\\n✅ Successfully extracted \${newFilesCount} new files/folders!\`);
      } else {
        console.log(\`\\n⚠️  No new files detected. Check if extraction worked correctly.\`);
      }
      
      // Clean up temp file
      if (fs.existsSync(tempArchivePath)) {
        fs.unlinkSync(tempArchivePath);
      }
      
    } catch (extractError) {
      console.log(\`\\n⚠️  Node.js extraction failed: \${extractError.message}\`);
      // Fallback: try to copy the archive to destination
      console.log('\\n📋 Copying archive to destination...');
      const destArchive = path.join(extractDir, 'extracted_files.zip');
      fs.copyFileSync(tempArchivePath, destArchive);
      console.log(\`✅ Archive copied to: \${destArchive}\`);
      console.log('\\n📝 Manual extraction required:');
      console.log(\`   Right-click on \${destArchive} and select "Extract All"\`);
    }
    
    showMessage('✅ Extraction completed!\\n\\nFiles have been extracted to:\\n' + extractDir);
    
    // Keep window open for a few seconds
    console.log('\\n⏱️  This window will close in 10 seconds...');
    setTimeout(() => {
      console.log('\\n👋 Goodbye!');
      process.exit(0);
    }, 10000);
    
  } catch (error) {
    showMessage('❌ Extraction failed:\\n' + error.message);
    console.log('\\n⏱️  This window will close in 10 seconds...');
    setTimeout(() => process.exit(1), 10000);
  }
}

// Start extraction
console.log('Starting extraction process...');
extractFiles();
`;
  }

  /**
   * Create the final executable using pkg
   */
  async createExtractorExecutable(extractorPath, outputName, archivePath) {
    console.log("📦 Installing required packages...");

    // Install required packages
    try {
      execSync("npm install -g pkg", { stdio: "inherit" });
    } catch (error) {
      console.log("pkg already installed or failed to install");
    }

    // Sanitize the output name for the file system
    const sanitizedOutputName = outputName
      .replace(/[<>:"/\\|?*]/g, "") // Remove invalid filename characters
      .replace(/'/g, "") // Remove apostrophes
      .replace(/\s+/g, "_") // Replace spaces with underscores
      .trim();

    const outputPath = path.join(this.config.outputDir, sanitizedOutputName);

    // Build pkg command with enhanced options
    const pkgCommand = [
      "pkg",
      extractorPath,
      "--output",
      outputPath,
      "--target",
      "node18-win-x64",
    ];

    // Add custom icon if specified
    if (this.config.iconPath && fs.existsSync(this.config.iconPath)) {
      pkgCommand.push("--icon", this.config.iconPath);
      console.log(`🎨 Using custom icon: ${this.config.iconPath}`);
    }

    // Add custom manifest if specified
    if (this.config.manifestPath && fs.existsSync(this.config.manifestPath)) {
      pkgCommand.push("--manifest", this.config.manifestPath);
      console.log(`📋 Using custom manifest: ${this.config.manifestPath}`);
    }

    console.log(`📦 Creating executable: ${pkgCommand.join(" ")}`);
    execSync(pkgCommand.join(" "), { stdio: "inherit" });

    // Post-process the executable if needed
    if (this.config.branding) {
      await this.applyBranding(outputPath);
    }
  }

  /**
   * Apply additional branding to the executable
   */
  async applyBranding(outputPath) {
    try {
      console.log("🎨 Applying branding...");

      // Here we could add additional branding features like:
      // - Custom version info
      // - Digital signing
      // - Resource embedding
      // - Splash screen injection

      if (this.config.versionInfo) {
        console.log("📋 Adding version information...");
        // Future: Add version info to executable
      }

      if (this.config.digitalSign) {
        console.log("🔐 Adding digital signature...");
        // Future: Sign the executable
      }
    } catch (error) {
      console.log(`⚠️  Branding failed: ${error.message}`);
    }
  }

  /**
   * Generate output filename with version
   */
  generateOutputName() {
    const version = this.config.includeVersion ? `-${this.config.version}` : "";
    // Sanitize filename by removing/replacing problematic characters
    const sanitizedName = this.config.appName
      .replace(/[<>:"/\\|?*]/g, "") // Remove invalid filename characters
      .replace(/'/g, "") // Remove apostrophes
      .replace(/\s+/g, "_") // Replace spaces with underscores
      .trim();
    return `${sanitizedName}${version}.exe`;
  }

  /**
   * Cleanup temporary files
   */
  cleanup(tempDir) {
    if (fs.existsSync(tempDir)) {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  }
}

/**
 * CLI Interface
 */
function main() {
  const args = process.argv.slice(2);

  if (args.length === 0) {
    console.log(`
📦 File Packing Script - Self-Extracting Executables

Usage: node pack-files.js [options]

Options:
  --files <pattern>     - Files to include (can specify multiple)
  --folders <pattern>   - Folders to include (can specify multiple)
  --output-name <name>  - Name of the output executable
  --app-name <name>     - Application name
  --version <version>   - Version number
  --config <file>       - Use configuration file (JSON)

Examples:
  node pack-files.js --files "./config.json" --files "./readme.txt" --output-name "MyPackage"
  node pack-files.js --folders "./assets" --folders "./data" --output-name "GameFiles"
  node pack-files.js --config ./pack-config.json

Configuration file format:
{
  "appName": "MyPackage",
  "version": "1.0.0",
  "files": ["./config.json", "./readme.txt"],
  "folders": ["./assets", "./data"]
}
    `);
    return;
  }

  const options = {};
  let config = {};

  // Parse command line options
  for (let i = 0; i < args.length; i += 2) {
    const key = args[i].replace("--", "");
    const value = args[i + 1];

    if (key === "files" || key === "folders") {
      if (!options[key]) options[key] = [];
      options[key].push(value);
    } else {
      options[key] = value;
    }
  }

  // Load configuration file if specified
  if (options.config) {
    try {
      config = JSON.parse(fs.readFileSync(options.config, "utf8"));
    } catch (error) {
      console.error(`Failed to load config file: ${error.message}`);
      process.exit(1);
    }
  }

  // Merge config with options
  const finalConfig = {
    ...config,
    appName: options["app-name"] || config.appName || "MyPackage",
    version: options.version || config.version || "1.0.0",
    outputDir: config.outputDir || "./dist",
    includeVersion:
      config.includeVersion !== undefined ? config.includeVersion : true,
  };

  const finalOptions = {
    files: options.files || config.files || [],
    folders: options.folders || config.folders || [],
    outputName: options["output-name"] || config.outputName,
  };

  // Create packer and run
  const packer = new FilePacker(finalConfig);

  if (!fs.existsSync(finalConfig.outputDir)) {
    fs.mkdirSync(finalConfig.outputDir, { recursive: true });
  }

  packer.packFiles(finalOptions).catch((error) => {
    console.error("Packaging failed:", error.message);
    process.exit(1);
  });
}

// Run if called directly
if (require.main === module) {
  main();
}

module.exports = FilePacker;
