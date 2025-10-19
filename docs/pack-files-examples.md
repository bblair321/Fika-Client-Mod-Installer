# File Packing Script - Self-Extracting Executables

This script creates self-extracting executables that act like installers. When users run the `.exe` file, they can choose where to extract the packed files.

## 🎯 How It Works

1. **Pack**: You specify files/folders to include
2. **Create**: Script creates a ZIP archive and embeds it in an executable
3. **Extract**: Users run the `.exe`, choose a directory, and files are extracted there

## 📋 Usage Examples

### PowerShell Usage (Recommended)

```powershell
# Pack specific files
.\pack-files.ps1 -Files "config.json" -Files "readme.txt" -OutputName "MyPackage"

# Pack folders
.\pack-files.ps1 -Folders "assets" -Folders "data" -OutputName "GameFiles"

# Pack both files and folders
.\pack-files.ps1 -Files "config.json" -Folders "assets" -OutputName "MyApp"

# Use configuration file
.\pack-files.ps1 -Config "pack-config.json"

# Custom app name and version
.\pack-files.ps1 -Files "config.json" -AppName "MyApp" -Version "2.0.0" -OutputName "MyApp"
```

### Direct Node.js Usage

```bash
# Pack specific files
node pack-files.js --files "./config.json" --files "./readme.txt" --output-name "MyPackage"

# Pack folders
node pack-files.js --folders "./assets" --folders "./data" --output-name "GameFiles"

# Use configuration file
node pack-files.js --config ./pack-config.json
```

## 🔧 Configuration File

Create a `pack-config.json` file:

```json
{
  "appName": "MyFilePackage",
  "version": "1.0.0",
  "outputDir": "./dist",
  "includeVersion": true,
  "files": [
    "./config.json",
    "./readme.txt",
    "./license.txt"
  ],
  "folders": [
    "./assets",
    "./data",
    "./templates"
  ]
}
```

## 🎮 Real-World Examples

### Game Mod Package
```powershell
.\pack-files.ps1 -Folders "mods" -Folders "textures" -Files "install.txt" -AppName "GameMod" -OutputName "GameMod-v1.2"
```

### Configuration Package
```powershell
.\pack-files.ps1 -Files "config.ini" -Files "settings.json" -AppName "AppConfig" -OutputName "AppConfig"
```

### Complete Application Package
```powershell
.\pack-files.ps1 -Folders "bin" -Folders "lib" -Folders "config" -Files "README.md" -AppName "MyApp" -Version "1.0.0"
```

## 📦 What Users Experience

1. **Download** your `.exe` file
2. **Run** the executable
3. **Choose** where to extract files (folder picker dialog)
4. **Files are extracted** to their chosen location
5. **Done!** All files are now in their desired directory

## 🔍 Output

The script creates:
- **Self-extracting executable** in `./dist/` folder
- **Version number** included in filename (e.g., `MyApp-1.0.0.exe`)
- **Embedded ZIP archive** containing all your files
- **User-friendly extraction** interface

## 💡 Perfect For

- **Game mods** - Package textures, scripts, configs
- **Software distributions** - Include docs, configs, assets
- **Configuration packages** - Settings, templates, examples
- **Asset packages** - Images, sounds, data files
- **Documentation bundles** - PDFs, guides, examples

## 🚀 For Your Projects

### SCUM Server Manager
```powershell
.\pack-files.ps1 -Folders "config" -Files "README.md" -AppName "SCUMConfig" -OutputName "SCUM-Server-Config"
```

### FiveM Resources
```powershell
.\pack-files.ps1 -Folders "client" -Folders "server" -Folders "html" -Files "fxmanifest.lua" -AppName "FiveMResource"
```

### Tarkov Day Trader Assets
```powershell
.\pack-files.ps1 -Folders "assets" -Files "README.md" -AppName "TarkovAssets" -OutputName "Tarkov-Day-Trader-Assets"
```

The generated executable will be completely self-contained - users don't need any additional software to extract your files!
