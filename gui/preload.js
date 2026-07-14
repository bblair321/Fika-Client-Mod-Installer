const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  selectFolders: () => ipcRenderer.invoke('select-folders'),
  selectOutputFolder: () => ipcRenderer.invoke('select-output-folder'),
  selectInstallPath: () => ipcRenderer.invoke('select-install-path'),
  selectIconFile: () => ipcRenderer.invoke('select-icon-file'),
  createInstaller: (options) => ipcRenderer.invoke('create-installer', options),
  openFolder: (folderPath) => ipcRenderer.invoke('open-folder', folderPath),
  getSuggestedPaths: () => ipcRenderer.invoke('get-suggested-paths'),
  saveConfig: (config) => ipcRenderer.invoke('save-config', config),
  loadConfig: () => ipcRenderer.invoke('load-config'),
  saveLastConfig: (config) => ipcRenderer.invoke('save-last-config', config),
  loadLastConfig: () => ipcRenderer.invoke('load-last-config'),
  windowMinimize: () => ipcRenderer.invoke('window-minimize'),
  windowMaximize: () => ipcRenderer.invoke('window-maximize'),
  windowClose: () => ipcRenderer.invoke('window-close'),
  windowIsMaximized: () => ipcRenderer.invoke('window-is-maximized'),
  onPackagingProgress: (callback) => {
    ipcRenderer.on('packaging-progress', (event, progress) => callback(progress));
  },
  removeProgressListener: () => {
    ipcRenderer.removeAllListeners('packaging-progress');
  },
});
