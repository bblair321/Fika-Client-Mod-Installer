# OneFile Installer

Create a **single Windows `.exe` installer** from one or more folders — built for mods, game files, and simple app distributions.

No Inno Setup. No teaching end users how to unzip. Point at folders, set a name, get one executable.

## What it does

- Packages folders into one self-extracting installer
- Gives the end user a small wizard to pick (or confirm) the install location
- Optional default / suggested path (Steam, Epic, Desktop, custom)
- Optional `.ico` + product metadata on the output exe
- Shows size + SHA-256 after a successful build
- Advanced: native C++ extractor, optional UPX (off by default — AV-noisy)

> Windows-first. This is an installer creator, not a general Node/Python app bundler.

## Quick start (GUI)

```powershell
npm install
npm run gui
```

1. Add the folders to package  
2. Set display name, version, and optional default install path  
3. Click **Create installer**

Profiles can be saved/loaded from the header. The last successful settings are restored on next launch.

## CLI

```powershell
# Simple folder pack
node scripts/pack-files.js --folder "my-mod" --app-name "MyMod" --version "1.0.0"

# With a default extract path
node scripts/pack-files.js --folder "my-mod" --app-name "MyMod" --extract-path "C:\Games\MyGame\Mods"
```

Or:

```powershell
.\scripts\pack-files.ps1 -Folder "my-mod" -AppName "MyMod" -Version "1.0.0"
```

## Trust notes

- Prefer a clean, uncompressed build over UPX when distributing widely
- Share the SHA-256 printed after packaging so users can verify the file
- Antivirus may still flag unsigned self-extractors — code signing (bring your own cert) is the long-term fix

## Tests

```powershell
npm test          # all tests, including a real installer build (~15s)
npm run test:fast # skips the slow build test
```

## Build the GUI app

```powershell
npm run build:gui:win
```

Output lands in `dist-gui/`.

## License

MIT
