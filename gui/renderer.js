// Renderer process - UI logic

const folderList = document.getElementById('folderList');
const folderListEmpty = document.getElementById('folderListEmpty');
const browseBtn = document.getElementById('browseBtn');
const clearFoldersBtn = document.getElementById('clearFoldersBtn');
const appNameInput = document.getElementById('appName');
const outputNameInput = document.getElementById('outputName');
const versionInput = document.getElementById('version');
const outputDirInput = document.getElementById('outputDir');
const browseOutputBtn = document.getElementById('browseOutputBtn');
const defaultInstallPathInput = document.getElementById('defaultInstallPath');
const browseInstallPathBtn = document.getElementById('browseInstallPathBtn');
const pathSuggest = document.getElementById('pathSuggest');
const iconPathInput = document.getElementById('iconPath');
const browseIconBtn = document.getElementById('browseIconBtn');
const clearIconBtn = document.getElementById('clearIconBtn');
const includeVersionCheckbox = document.getElementById('includeVersion');
const backupOverwrittenCheckbox = document.getElementById('backupOverwritten');
const backupOverwrittenLabel = document.getElementById('backupOverwrittenLabel');
const backupUnavailableNote = document.getElementById('backupUnavailableNote');
const useCppExtractorCheckbox = document.getElementById('useCppExtractor');
const compressWithUPXCheckbox = document.getElementById('compressWithUPX');
const upxCompressLabel = document.getElementById('upxCompressLabel');
const filenamePreview = document.getElementById('filenamePreview');
const createBtn = document.getElementById('createBtn');
const progressContainer = document.getElementById('progressContainer');
const progressFill = document.getElementById('progressFill');
const progressText = document.getElementById('progressText');
const resultContainer = document.getElementById('resultContainer');
const resultMessage = document.getElementById('resultMessage');
const resultMeta = document.getElementById('resultMeta');
const openFolderBtn = document.getElementById('openFolderBtn');
const saveConfigBtn = document.getElementById('saveConfigBtn');
const loadConfigBtn = document.getElementById('loadConfigBtn');
const minimizeBtn = document.getElementById('minimizeBtn');
const maximizeBtn = document.getElementById('maximizeBtn');
const closeBtn = document.getElementById('closeBtn');

let selectedFolders = [];
let outputDirectory = './dist';
let iconPath = '';

function normalizeFolderPath(folderPath) {
  return folderPath.replace(/\\/g, '/').toLowerCase();
}

function sanitizeOutputBase(name) {
  return name
    .replace(/[<>:"/\\|?*]/g, '')
    .replace(/'/g, '')
    .replace(/\s+/g, '_')
    .trim() || 'Installer';
}

function updateFilenamePreview() {
  const base =
    outputNameInput.value.trim() ||
    appNameInput.value.trim() ||
    'MyPackage';
  const sanitized = sanitizeOutputBase(base);
  const version = versionInput.value.trim() || '1.0.0';
  const withVersion = includeVersionCheckbox.checked
    ? `${sanitized}-${version}`
    : sanitized;
  filenamePreview.innerHTML = `Will create: <strong>${withVersion}.exe</strong>`;
}

function renderFolderList() {
  folderList.querySelectorAll('.folder-list-item').forEach((item) => item.remove());

  if (selectedFolders.length === 0) {
    folderListEmpty.style.display = 'block';
    clearFoldersBtn.disabled = true;
    return;
  }

  folderListEmpty.style.display = 'none';
  clearFoldersBtn.disabled = false;

  selectedFolders.forEach((folderPath) => {
    const item = document.createElement('li');
    item.className = 'folder-list-item';

    const pathSpan = document.createElement('span');
    pathSpan.className = 'folder-list-path';
    pathSpan.textContent = folderPath;
    pathSpan.title = folderPath;

    const removeBtn = document.createElement('button');
    removeBtn.type = 'button';
    removeBtn.className = 'btn-remove-folder';
    removeBtn.textContent = 'Remove';
    removeBtn.addEventListener('click', () => {
      selectedFolders = selectedFolders.filter((f) => f !== folderPath);
      renderFolderList();
      updateCreateButton();
    });

    item.appendChild(pathSpan);
    item.appendChild(removeBtn);
    folderList.appendChild(item);
  });
}

function addFolders(folders) {
  const existing = new Set(selectedFolders.map(normalizeFolderPath));

  folders.forEach((folder) => {
    const normalized = normalizeFolderPath(folder);
    if (!existing.has(normalized)) {
      existing.add(normalized);
      selectedFolders.push(folder);
    }
  });

  renderFolderList();
  updateCreateButton();
}

function updateCreateButton() {
  createBtn.disabled = selectedFolders.length === 0 || !appNameInput.value.trim();
}

function updateUpxVisibility() {
  const cpp = useCppExtractorCheckbox.checked;
  upxCompressLabel.hidden = !cpp;
  if (!cpp) {
    compressWithUPXCheckbox.checked = false;
  }

  // Backup on overwrite is implemented in the Node.js extractor only
  backupOverwrittenCheckbox.disabled = cpp;
  backupOverwrittenLabel.classList.toggle('disabled', cpp);
  backupUnavailableNote.hidden = !cpp;
}

function collectConfig() {
  return {
    folders: [...selectedFolders],
    appName: appNameInput.value.trim() || 'MyPackage',
    outputName: outputNameInput.value.trim(),
    version: versionInput.value.trim() || '1.0.0',
    outputDir: outputDirectory,
    defaultInstallPath: defaultInstallPathInput.value.trim(),
    iconPath: iconPath || '',
    includeVersion: includeVersionCheckbox.checked,
    backupOverwritten: backupOverwrittenCheckbox.checked,
    extractorType: useCppExtractorCheckbox.checked ? 'cpp' : 'nodejs',
    compressWithUPX: compressWithUPXCheckbox.checked,
  };
}

function applyConfig(config) {
  if (!config || typeof config !== 'object') return;

  selectedFolders = Array.isArray(config.folders) ? [...config.folders] : [];
  appNameInput.value = config.appName || 'MyPackage';
  outputNameInput.value = config.outputName || '';
  versionInput.value = config.version || '1.0.0';
  outputDirectory = config.outputDir || './dist';
  outputDirInput.value = outputDirectory;
  defaultInstallPathInput.value = config.defaultInstallPath || '';
  iconPath = config.iconPath || '';
  iconPathInput.value = iconPath;
  includeVersionCheckbox.checked = config.includeVersion !== false;
  backupOverwrittenCheckbox.checked = config.backupOverwritten !== false;
  useCppExtractorCheckbox.checked = config.extractorType === 'cpp';
  compressWithUPXCheckbox.checked = !!config.compressWithUPX;
  updateUpxVisibility();
  renderFolderList();
  updateCreateButton();
  updateFilenamePreview();

  // Sync suggest dropdown if path matches
  const match = [...pathSuggest.options].find(
    (opt) => opt.value && opt.value === defaultInstallPathInput.value
  );
  pathSuggest.value = match ? match.value : '';
}

browseBtn.addEventListener('click', async () => {
  try {
    const folders = await window.electronAPI.selectFolders();
    if (folders.length > 0) addFolders(folders);
  } catch (error) {
    showError('Failed to select folders: ' + error.message);
  }
});

clearFoldersBtn.addEventListener('click', () => {
  selectedFolders = [];
  renderFolderList();
  updateCreateButton();
});

browseOutputBtn.addEventListener('click', async () => {
  try {
    const folder = await window.electronAPI.selectOutputFolder();
    if (folder) {
      outputDirectory = folder;
      outputDirInput.value = folder;
    }
  } catch (error) {
    showError('Failed to select output folder: ' + error.message);
  }
});

browseInstallPathBtn.addEventListener('click', async () => {
  try {
    const folder = await window.electronAPI.selectInstallPath();
    if (folder) {
      defaultInstallPathInput.value = folder;
      pathSuggest.value = '';
    }
  } catch (error) {
    showError('Failed to select install path: ' + error.message);
  }
});

pathSuggest.addEventListener('change', () => {
  if (pathSuggest.value) {
    defaultInstallPathInput.value = pathSuggest.value;
  }
});

browseIconBtn.addEventListener('click', async () => {
  try {
    const file = await window.electronAPI.selectIconFile();
    if (file) {
      iconPath = file;
      iconPathInput.value = file;
    }
  } catch (error) {
    showError('Failed to select icon: ' + error.message);
  }
});

clearIconBtn.addEventListener('click', () => {
  iconPath = '';
  iconPathInput.value = '';
});

useCppExtractorCheckbox.addEventListener('change', updateUpxVisibility);

[appNameInput, outputNameInput, versionInput].forEach((el) => {
  el.addEventListener('input', () => {
    updateCreateButton();
    updateFilenamePreview();
  });
});
includeVersionCheckbox.addEventListener('change', updateFilenamePreview);

saveConfigBtn.addEventListener('click', async () => {
  try {
    const result = await window.electronAPI.saveConfig(collectConfig());
    if (result.success) {
      showTransientSuccess(`Profile saved to ${result.path}`);
    } else {
      showError(result.error || 'Could not save profile');
    }
  } catch (error) {
    showError('Failed to save profile: ' + error.message);
  }
});

loadConfigBtn.addEventListener('click', async () => {
  try {
    const result = await window.electronAPI.loadConfig();
    if (result.canceled) return;
    if (result.success) {
      applyConfig(result.config);
      showTransientSuccess('Profile loaded');
    } else {
      showError(result.error || 'Could not load profile');
    }
  } catch (error) {
    showError('Failed to load profile: ' + error.message);
  }
});

createBtn.addEventListener('click', async () => {
  if (selectedFolders.length === 0) {
    showError('Please select at least one folder to package');
    return;
  }

  resultContainer.hidden = true;
  resultMeta.hidden = true;
  openFolderBtn.hidden = true;
  progressContainer.hidden = false;
  progressFill.style.width = '0%';
  progressText.textContent = 'Starting...';

  createBtn.disabled = true;
  createBtn.textContent = 'Creating...';
  document.body.classList.add('loading');

  try {
    const config = collectConfig();
    const outputBase = sanitizeOutputBase(
      config.outputName || config.appName || 'MyPackage'
    );
    const finalOutputName = config.includeVersion
      ? `${outputBase}-${config.version}`
      : outputBase;

    const options = {
      folders: config.folders,
      appName: config.appName,
      outputName: finalOutputName,
      version: config.version,
      outputDir: config.outputDir,
      includeVersion: false, // version already baked into outputName
      extractPath: config.defaultInstallPath || null,
      iconPath: config.iconPath || null,
      backupOverwritten:
        config.extractorType === 'nodejs' && config.backupOverwritten,
      extractorType: config.extractorType,
      cppCompiler: 'auto',
      compressWithUPX: config.compressWithUPX,
    };

    const result = await window.electronAPI.createInstaller(options);

    progressContainer.hidden = true;
    resultContainer.hidden = false;

    if (result.success) {
      showSuccess(`Installer created successfully.<br><strong>Location:</strong> ${result.outputPath}`);
      if (result.sizeLabel || result.sha256) {
        resultMeta.hidden = false;
        const lines = [];
        if (result.sizeLabel) lines.push(`Size: ${result.sizeLabel}`);
        if (result.sha256) lines.push(`SHA-256: ${result.sha256}`);
        resultMeta.textContent = lines.join('\n');
      }
      openFolderBtn.hidden = false;
      openFolderBtn.onclick = async () => {
        const normalizedPath = result.outputPath.replace(/\\/g, '/');
        const parts = normalizedPath.split('/');
        parts.pop();
        const dir = parts.join('/');
        const openResult = await window.electronAPI.openFolder(dir);
        if (!openResult.success) {
          showError('Failed to open folder: ' + (openResult.error || 'Unknown error'));
        }
      };
      await window.electronAPI.saveLastConfig(collectConfig());
    } else {
      showError(`Failed to create installer: ${result.error || result.message}`);
    }
  } catch (error) {
    progressContainer.hidden = true;
    showError('Error: ' + error.message);
  } finally {
    createBtn.disabled = false;
    createBtn.textContent = 'Create installer';
    document.body.classList.remove('loading');
    updateCreateButton();
  }
});

function updateProgress(percentage, text) {
  progressFill.style.width = Math.max(0, Math.min(100, percentage)) + '%';
  progressText.textContent = text;
}

window.electronAPI.onPackagingProgress((progress) => {
  if (progress && typeof progress.percentage === 'number') {
    updateProgress(progress.percentage, progress.message || 'Processing...');
  }
});

function showSuccess(message) {
  resultMessage.className = 'result-message success';
  resultMessage.innerHTML = message;
  resultContainer.hidden = false;
}

function showError(message) {
  resultMessage.className = 'result-message error';
  resultMessage.innerHTML = message;
  resultMeta.hidden = true;
  openFolderBtn.hidden = true;
  resultContainer.hidden = false;
}

function showTransientSuccess(message) {
  resultContainer.hidden = false;
  resultMeta.hidden = true;
  openFolderBtn.hidden = true;
  resultMessage.className = 'result-message success';
  resultMessage.textContent = message;
  setTimeout(() => {
    if (resultMessage.textContent === message) {
      resultContainer.hidden = true;
    }
  }, 2500);
}

minimizeBtn.addEventListener('click', () => window.electronAPI.windowMinimize());
maximizeBtn.addEventListener('click', async () => {
  await window.electronAPI.windowMaximize();
  const isMaximized = await window.electronAPI.windowIsMaximized();
  maximizeBtn.textContent = isMaximized ? '❐' : '□';
});
closeBtn.addEventListener('click', () => window.electronAPI.windowClose());

window.addEventListener('resize', async () => {
  const isMaximized = await window.electronAPI.windowIsMaximized();
  maximizeBtn.textContent = isMaximized ? '❐' : '□';
});

async function loadSuggestedPaths() {
  try {
    const suggestions = await window.electronAPI.getSuggestedPaths();
    suggestions.forEach((item) => {
      const opt = document.createElement('option');
      opt.value = item.path;
      opt.textContent = item.label;
      pathSuggest.appendChild(opt);
    });
  } catch (e) {
    // Optional feature — ignore failures
  }
}

async function init() {
  renderFolderList();
  updateCreateButton();
  updateFilenamePreview();
  updateUpxVisibility();
  await loadSuggestedPaths();

  try {
    const last = await window.electronAPI.loadLastConfig();
    if (last && last.success && last.config) {
      applyConfig(last.config);
    }
  } catch (e) {
    // No last config is fine
  }
}

init();
