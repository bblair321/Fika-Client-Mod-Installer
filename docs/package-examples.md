# Executable Packaging Script Examples

This script provides a universal way to package different types of applications into executables with bundled files.

## Supported Package Types

### 1. Node.js Applications (using pkg)

Package Node.js applications into standalone executables.

```bash
# Basic Node.js packaging
node package-exe.js node --entry-point ./app.js --output-name myapp

# With configuration file
node package-exe.js node --config ./package-config.json

# With assets and multiple targets
node package-exe.js node \
  --entry-point ./server.js \
  --output-name myserver \
  --assets "./config/**/*" \
  --assets "./public/**/*" \
  --targets "node18-win-x64" \
  --targets "node18-linux-x64"
```

### 2. Electron Applications (using electron-builder)

Package Electron applications with all dependencies.

```bash
# Basic Electron packaging
node package-exe.js electron --package-json ./package.json

# With custom output name
node package-exe.js electron \
  --package-json ./package.json \
  --output-name MyElectronApp
```

### 3. Python Applications (using PyInstaller)

Package Python applications into executables.

```bash
# Single file executable
node package-exe.js python \
  --entry-point ./main.py \
  --output-name mypythonapp \
  --one-file

# Directory distribution
node package-exe.js python \
  --entry-point ./main.py \
  --output-name mypythonapp \
  --add-data "./data;data" \
  --add-data "./config;config"
```

### 4. Web Applications (using Tauri)

Package web applications as desktop apps (requires Tauri setup).

```bash
# Web app packaging (requires Tauri)
node package-exe.js web \
  --build-dir ./dist \
  --output-name mywebapp
```

## Configuration File Usage

Create a `package-config.json` file with your settings:

```json
{
  "appName": "MyApplication",
  "version": "1.0.0",
  "outputDir": "./dist",
  "includeVersion": true,
  "node": {
    "entryPoint": "./index.js",
    "outputName": "myapp",
    "assets": ["./config/**/*", "./public/**/*"]
  }
}
```

Then run:

```bash
node package-exe.js node --config ./package-config.json
```

## Examples for Your Projects

### SCUM Server Manager Backend

```bash
node package-exe.js node \
  --entry-point ./backend/index.js \
  --output-name scum-server-manager \
  --assets "./backend/config/**/*" \
  --assets "./backend/build/**/*"
```

### SPT Launcher Electron

```bash
node package-exe.js electron \
  --package-json ./spt-launcher-electron/package.json \
  --output-name spt-launcher
```

### Python Scripts

```bash
node package-exe.js python \
  --entry-point ./script.py \
  --output-name mytool \
  --one-file \
  --add-data "./data;data"
```

## Advanced Options

### Node.js Advanced Options

- `--entry-point`: Main JavaScript file
- `--output-name`: Name of the output executable
- `--assets`: Files/folders to include (can specify multiple)
- `--targets`: Target platforms (node18-win-x64, node18-linux-x64, etc.)

### Electron Advanced Options

- `--package-json`: Path to package.json file
- `--output-name`: Name of the output executable
- Custom build configuration in package.json

### Python Advanced Options

- `--entry-point`: Main Python file
- `--output-name`: Name of the output executable
- `--one-file`: Create single file executable
- `--add-data`: Add data files (format: "source;destination")
- `--hidden-imports`: Import modules that PyInstaller can't detect

## Output

All executables will be created in the `./dist` directory (or specified output directory) with version numbers included in the filename as per your preference [[memory:6561931]].

## Requirements

The script will automatically install required tools:

- `pkg` for Node.js packaging
- `electron-builder` for Electron packaging
- `PyInstaller` for Python packaging

Make sure you have Node.js, Python (for Python apps), and appropriate build tools installed.
