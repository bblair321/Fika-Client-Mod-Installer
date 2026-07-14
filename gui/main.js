const { app, BrowserWindow, dialog, ipcMain, shell } = require('electron');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const os = require('os');

// Hide console window on Windows
if (process.platform === 'win32') {
  try {
    const { execSync } = require('child_process');
    const hideScript = `$code = '[DllImport("user32.dll")]public static extern bool ShowWindow(IntPtr hWnd,int nCmdShow);[DllImport("kernel32.dll")]public static extern IntPtr GetConsoleWindow();';$type = Add-Type -MemberDefinition $code -Name Win32ShowWindow -Namespace Console -PassThru;$type::ShowWindow($type::GetConsoleWindow(),0)`;
    const tempPs = path.join(os.tmpdir(), `hide-console-${process.pid}.ps1`);
    fs.writeFileSync(tempPs, hideScript, 'utf8');
    execSync(`powershell -NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File "${tempPs}"`, {
      stdio: 'ignore',
      timeout: 2000,
      windowsHide: true,
    });
    setTimeout(() => {
      try {
        if (fs.existsSync(tempPs)) fs.unlinkSync(tempPs);
      } catch (e) {}
    }, 500);
  } catch (e) {
    // Optional
  }
}

let mainWindow;

function getAppRoot() {
  return path.join(__dirname, '..');
}

function getConfigDir() {
  const dir = path.join(app.getPath('userData'), 'profiles');
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  return dir;
}

function getLastConfigPath() {
  return path.join(getConfigDir(), 'last-config.json');
}

function expandEnvPath(raw) {
  if (!raw || typeof raw !== 'string') return raw;
  return raw.replace(/%([^%]+)%/g, (_, name) => {
    const value = process.env[name] || process.env[name.toUpperCase()] || process.env[name.toLowerCase()];
    return value != null ? value : `%${name}%`;
  });
}

function formatBytes(bytes) {
  if (!bytes || bytes <= 0) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB'];
  const i = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
  const value = bytes / Math.pow(1024, i);
  return `${value.toFixed(i === 0 ? 0 : 2)} ${units[i]}`;
}

function sha256File(filePath) {
  const hash = crypto.createHash('sha256');
  hash.update(fs.readFileSync(filePath));
  return hash.digest('hex');
}

function loadSuggestedPaths() {
  const suggestions = [];
  const seen = new Set();

  const add = (label, rawPath) => {
    const resolved = expandEnvPath(rawPath);
    if (!resolved || seen.has(resolved.toLowerCase())) return;
    // Only suggest locations that actually exist on this machine
    try {
      if (!fs.existsSync(resolved)) return;
    } catch (e) {
      return;
    }
    seen.add(resolved.toLowerCase());
    suggestions.push({ label, path: resolved });
  };

  try {
    const configPath = path.join(getAppRoot(), 'configs', 'game-paths.json');
    if (fs.existsSync(configPath)) {
      const data = JSON.parse(fs.readFileSync(configPath, 'utf8'));

      for (const [platform, section] of Object.entries(data)) {
        if (!section || typeof section !== 'object') continue;
        if (platform === 'description' || platform === 'commonLocations') continue;

        if (section.commonPath) {
          add(`${platform.toUpperCase()} games folder`, section.commonPath);
        }
        if (section.commonPathAlt) {
          add(`${platform.toUpperCase()} games folder (alt)`, section.commonPathAlt);
        }
        if (section.games) {
          for (const [game, gamePath] of Object.entries(section.games)) {
            add(`${game} (${platform})`, gamePath);
          }
        }
      }

      if (Array.isArray(data.commonLocations)) {
        data.commonLocations.forEach((loc, i) => {
          add(`Common location ${i + 1}`, loc);
        });
      }
    }
  } catch (e) {
    console.warn('Could not load game-paths.json:', e.message);
  }

  add('Desktop', path.join(os.homedir(), 'Desktop'));
  add('Documents', path.join(os.homedir(), 'Documents'));

  return suggestions;
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 920,
    height: 780,
    minWidth: 820,
    minHeight: 640,
    frame: false,
    transparent: false,
    autoHideMenuBar: true,
    icon: path.join(__dirname, 'assets', 'icon.png'),
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, 'preload.js'),
    },
    show: false,
  });

  mainWindow.loadFile(path.join(__dirname, 'index.html'));

  mainWindow.once('ready-to-show', () => {
    mainWindow.show();
  });

  if (process.env.NODE_ENV === 'development') {
    mainWindow.webContents.openDevTools();
  }

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

app.whenReady().then(() => {
  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

ipcMain.handle('select-folders', async () => {
  const result = await dialog.showOpenDialog(mainWindow, {
    properties: ['openDirectory', 'multiSelections'],
  });
  if (!result.canceled && result.filePaths.length > 0) {
    return result.filePaths;
  }
  return [];
});

ipcMain.handle('select-output-folder', async () => {
  const result = await dialog.showOpenDialog(mainWindow, {
    properties: ['openDirectory'],
  });
  if (!result.canceled && result.filePaths.length > 0) {
    return result.filePaths[0];
  }
  return null;
});

ipcMain.handle('select-install-path', async () => {
  const result = await dialog.showOpenDialog(mainWindow, {
    properties: ['openDirectory'],
    title: 'Select default install folder',
  });
  if (!result.canceled && result.filePaths.length > 0) {
    return result.filePaths[0];
  }
  return null;
});

ipcMain.handle('select-icon-file', async () => {
  const result = await dialog.showOpenDialog(mainWindow, {
    properties: ['openFile'],
    title: 'Select installer icon',
    filters: [
      { name: 'Icon files', extensions: ['ico'] },
      { name: 'All files', extensions: ['*'] },
    ],
  });
  if (!result.canceled && result.filePaths.length > 0) {
    return result.filePaths[0];
  }
  return null;
});

ipcMain.handle('open-folder', async (event, folderPath) => {
  try {
    await shell.openPath(folderPath);
    return { success: true };
  } catch (error) {
    return { success: false, error: error.message };
  }
});

ipcMain.handle('get-suggested-paths', async () => {
  return loadSuggestedPaths();
});

ipcMain.handle('save-config', async (event, config) => {
  try {
    const result = await dialog.showSaveDialog(mainWindow, {
      title: 'Save installer profile',
      defaultPath: path.join(getConfigDir(), `${(config && config.appName) || 'profile'}.json`),
      filters: [{ name: 'JSON', extensions: ['json'] }],
    });
    if (result.canceled || !result.filePath) {
      return { success: false, canceled: true };
    }
    fs.writeFileSync(result.filePath, JSON.stringify(config, null, 2), 'utf8');
    return { success: true, path: result.filePath };
  } catch (error) {
    return { success: false, error: error.message };
  }
});

ipcMain.handle('load-config', async () => {
  try {
    const result = await dialog.showOpenDialog(mainWindow, {
      title: 'Load installer profile',
      properties: ['openFile'],
      filters: [{ name: 'JSON', extensions: ['json'] }],
      defaultPath: getConfigDir(),
    });
    if (result.canceled || !result.filePaths.length) {
      return { success: false, canceled: true };
    }
    const config = JSON.parse(fs.readFileSync(result.filePaths[0], 'utf8'));
    return { success: true, config, path: result.filePaths[0] };
  } catch (error) {
    return { success: false, error: error.message };
  }
});

ipcMain.handle('save-last-config', async (event, config) => {
  try {
    fs.writeFileSync(getLastConfigPath(), JSON.stringify(config, null, 2), 'utf8');
    return { success: true };
  } catch (error) {
    return { success: false, error: error.message };
  }
});

ipcMain.handle('load-last-config', async () => {
  try {
    const filePath = getLastConfigPath();
    if (!fs.existsSync(filePath)) {
      return { success: false };
    }
    const config = JSON.parse(fs.readFileSync(filePath, 'utf8'));
    return { success: true, config };
  } catch (error) {
    return { success: false, error: error.message };
  }
});

ipcMain.handle('window-minimize', () => {
  const window = BrowserWindow.getFocusedWindow();
  if (window) window.minimize();
});

ipcMain.handle('window-maximize', () => {
  const window = BrowserWindow.getFocusedWindow();
  if (window) {
    if (window.isMaximized()) {
      window.unmaximize();
    } else {
      window.maximize();
    }
  }
});

ipcMain.handle('window-close', () => {
  const window = BrowserWindow.getFocusedWindow();
  if (window) window.close();
});

ipcMain.handle('window-is-maximized', () => {
  const window = BrowserWindow.getFocusedWindow();
  return window ? window.isMaximized() : false;
});

ipcMain.handle('create-installer', async (event, options) => {
  try {
    const appRoot = getAppRoot();
    const FilePacker = require(path.join(appRoot, 'scripts', 'pack-files.js'));

    let outputDir = options.outputDir || './dist';
    if (!path.isAbsolute(outputDir)) {
      outputDir = path.resolve(appRoot, outputDir);
    }

    if (!fs.existsSync(outputDir)) {
      fs.mkdirSync(outputDir, { recursive: true });
    }

    const sendProgress = (message, percentage) => {
      event.sender.send('packaging-progress', { message, percentage });
    };

    const packer = new FilePacker({
      outputDir,
      appName: options.appName || 'MyPackage',
      version: options.version || '1.0.0',
      includeVersion: options.includeVersion !== false,
      silentMode: options.silentMode || false,
      defaultExtractPath: options.extractPath || null,
      iconPath: options.iconPath || null,
      backupOverwritten: options.backupOverwritten || false,
      extractorType: options.extractorType || 'nodejs',
      cppCompiler: options.cppCompiler || 'auto',
      compressWithUPX: options.compressWithUPX || false,
      onProgress: sendProgress,
    });

    sendProgress('Starting...', 2);

    await packer.packFiles({
      files: options.files || [],
      folders: options.folders || [],
      outputName: options.outputName,
    });

    const outputFileName = options.outputName || packer.generateOutputName();
    let exeFileName = outputFileName.endsWith('.exe')
      ? outputFileName
      : outputFileName + '.exe';

    // Match packer’s filename sanitization when version is included via generateOutputName
    if (!options.outputName) {
      exeFileName = packer.generateOutputName();
      if (!exeFileName.endsWith('.exe')) {
        exeFileName += '.exe';
      }
    } else if (options.includeVersion !== false && options.version) {
      // When user supplies output name, pack-files may still not append version —
      // prefer the file that exists on disk.
      const candidate = path.join(outputDir, exeFileName);
      if (!fs.existsSync(candidate)) {
        const withoutExt = exeFileName.replace(/\.exe$/i, '');
        const withVersion = `${withoutExt}-${options.version}.exe`;
        if (fs.existsSync(path.join(outputDir, withVersion))) {
          exeFileName = withVersion;
        }
      }
    }

    const outputPath = path.join(outputDir, exeFileName);

    if (!fs.existsSync(outputPath)) {
      // Fallback: find newest .exe in output dir
      const exes = fs
        .readdirSync(outputDir)
        .filter((f) => f.toLowerCase().endsWith('.exe'))
        .map((f) => {
          const full = path.join(outputDir, f);
          return { full, mtime: fs.statSync(full).mtimeMs };
        })
        .sort((a, b) => b.mtime - a.mtime);
      if (exes.length > 0) {
        const found = exes[0].full;
        const stats = fs.statSync(found);
        return {
          success: true,
          outputPath: found,
          sizeLabel: formatBytes(stats.size),
          sha256: sha256File(found),
          message: 'Installer created successfully!',
        };
      }
      return {
        success: false,
        error: `Installer was created but could not find output file at ${outputPath}`,
        message: 'Failed to locate installer',
      };
    }

    const stats = fs.statSync(outputPath);

    return {
      success: true,
      outputPath,
      sizeLabel: formatBytes(stats.size),
      sha256: sha256File(outputPath),
      message: 'Installer created successfully!',
    };
  } catch (error) {
    console.error('Error creating installer:', error);
    return {
      success: false,
      error: error.message,
      message: 'Failed to create installer',
    };
  }
});
