# EXE Packager - Complete Solution

A comprehensive tool for creating self-extracting executables and application packages.

## 🎯 **What This Tool Does**

### **1. Self-Extracting Archives (File Packager)**

- Package loose files and folders into self-extracting executables
- Users get a UI dialog to choose installation directory

### **2. Application Packaging (App Packager)**

- Package Node.js, Electron, and Python applications into executables
- Create standalone applications that don't require runtime installation

## 🚀 **Quick Start**

### **For Loose Files (Self-Extracting Archives):**

```powershell
# Interactive mode
.\scripts\interactive-file-packager.ps1

# Command line mode
.\scripts\pack-files.ps1 -Folders "mods" -AppName "MyModPack"
```

### **For Applications:**

```powershell
# Interactive mode
.\scripts\interactive-packager.ps1

# Command line mode
.\scripts\package.ps1 node --entry-point ./app.js --output-name myapp
```

## ✅ **Features**

- **User-Friendly UI** - Interactive dialogs for directory selection
- **Professional Output** - Clean, branded executables
- **Cross-Platform** - Works on Windows, macOS, Linux
- **Large File Support** - Handles multi-GB archives without issues
- **Smart Fallbacks** - Always works, even with user errors
- **Version Support** - Automatic versioning in filenames

## 🛠️ **Installation**

```powershell
# Install Node.js dependencies
.\install.ps1

# Or manually
npm install
```
