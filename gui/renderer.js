// Renderer process - UI logic

// DOM elements
const folderPathInput = document.getElementById('folderPath');
const browseBtn = document.getElementById('browseBtn');
const appNameInput = document.getElementById('appName');
const outputNameInput = document.getElementById('outputName');
const versionInput = document.getElementById('version');
const outputDirInput = document.getElementById('outputDir');
const browseOutputBtn = document.getElementById('browseOutputBtn');
const includeVersionCheckbox = document.getElementById('includeVersion');
const useCppExtractorCheckbox = document.getElementById('useCppExtractor');
const compressWithUPXCheckbox = document.getElementById('compressWithUPX');
const upxCompressLabel = document.getElementById('upxCompressLabel');
const createBtn = document.getElementById('createBtn');
const progressContainer = document.getElementById('progressContainer');
const progressFill = document.getElementById('progressFill');
const progressText = document.getElementById('progressText');
const resultContainer = document.getElementById('resultContainer');
const resultMessage = document.getElementById('resultMessage');
const openFolderBtn = document.getElementById('openFolderBtn');
const minimizeBtn = document.getElementById('minimizeBtn');
const maximizeBtn = document.getElementById('maximizeBtn');
const closeBtn = document.getElementById('closeBtn');

let selectedFolder = null;
let outputDirectory = './dist';

// Browse for folder
browseBtn.addEventListener('click', async () => {
  try {
    const folder = await window.electronAPI.selectFolder();
    if (folder) {
      selectedFolder = folder;
      folderPathInput.value = folder;
      updateCreateButton();
    }
  } catch (error) {
    showError('Failed to select folder: ' + error.message);
  }
});

// Browse for output directory
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

// Update create button state
function updateCreateButton() {
  createBtn.disabled = !selectedFolder || !appNameInput.value.trim();
}

// Show/hide UPX compression option based on C++ extractor selection
if (useCppExtractorCheckbox) {
  useCppExtractorCheckbox.addEventListener('change', () => {
    if (upxCompressLabel) {
      upxCompressLabel.style.display = useCppExtractorCheckbox.checked ? 'block' : 'none';
      if (!useCppExtractorCheckbox.checked && compressWithUPXCheckbox) {
        compressWithUPXCheckbox.checked = false;
      }
    }
  });
}

// Listen to input changes
folderPathInput.addEventListener('input', updateCreateButton);
appNameInput.addEventListener('input', updateCreateButton);
outputNameInput.addEventListener('input', () => {
  if (!outputNameInput.value.trim() && appNameInput.value.trim()) {
    // Auto-suggest output name from app name
    outputNameInput.placeholder = appNameInput.value.trim();
  }
});

// Create installer
createBtn.addEventListener('click', async () => {
  if (!selectedFolder) {
    showError('Please select a folder to package');
    return;
  }

  // Hide previous results
  resultContainer.style.display = 'none';
  
  // Show progress
  progressContainer.style.display = 'block';
  progressFill.style.width = '0%';
  progressText.textContent = 'Starting...';
  
  // Disable button
  createBtn.disabled = true;
  createBtn.textContent = 'Creating...';
  document.body.classList.add('loading');

  try {
    const options = {
      folders: [selectedFolder],
      appName: appNameInput.value.trim() || 'MyPackage',
      outputName: outputNameInput.value.trim() || appNameInput.value.trim() || 'MyPackage',
      version: versionInput.value.trim() || '1.0.0',
      outputDir: outputDirectory,
      includeVersion: includeVersionCheckbox.checked,
      extractorType: useCppExtractorCheckbox && useCppExtractorCheckbox.checked ? 'cpp' : 'nodejs',
      cppCompiler: 'auto',
      compressWithUPX: compressWithUPXCheckbox && compressWithUPXCheckbox.checked
    };

    // Update progress
    updateProgress(10, 'Creating archive...');

    const result = await window.electronAPI.createInstaller(options);

    updateProgress(100, 'Complete!');

    // Show result
    setTimeout(() => {
      progressContainer.style.display = 'none';
      resultContainer.style.display = 'block';
      
      if (result.success) {
        showSuccess(`Installer created successfully!<br><br><strong>Location:</strong> ${result.outputPath}`);
        openFolderBtn.style.display = 'inline-block';
        openFolderBtn.onclick = async () => {
          // Extract directory from full path
          // Handle both Windows (\) and Unix (/) paths
          const normalizedPath = result.outputPath.replace(/\\/g, '/');
          const pathParts = normalizedPath.split('/');
          pathParts.pop(); // Remove filename
          const outputDir = pathParts.join('/');
          
          const result_open = await window.electronAPI.openFolder(outputDir);
          if (!result_open.success) {
            showError('Failed to open folder: ' + (result_open.error || 'Unknown error'));
          }
        };
      } else {
        showError(`Failed to create installer: ${result.error || result.message}`);
      }

      // Re-enable button
      createBtn.disabled = false;
      createBtn.textContent = 'Create Installer';
      document.body.classList.remove('loading');
    }, 500);

  } catch (error) {
    progressContainer.style.display = 'none';
    showError('Error: ' + error.message);
    createBtn.disabled = false;
    createBtn.textContent = 'Create Installer';
    document.body.classList.remove('loading');
  }
});

// Progress updates
function updateProgress(percentage, text) {
  progressFill.style.width = percentage + '%';
  progressText.textContent = text;
}

// Listen to packaging progress
window.electronAPI.onPackagingProgress((progress) => {
  if (progress.percentage) {
    updateProgress(progress.percentage, progress.message || 'Processing...');
  }
});

// Show success message
function showSuccess(message) {
  resultMessage.className = 'result-message success';
  resultMessage.innerHTML = '✅ ' + message;
}

// Show error message
function showError(message) {
  resultMessage.className = 'result-message error';
  resultMessage.innerHTML = '❌ ' + message;
  resultContainer.style.display = 'block';
}

// Window controls
minimizeBtn.addEventListener('click', () => {
  window.electronAPI.windowMinimize();
});

maximizeBtn.addEventListener('click', () => {
  window.electronAPI.windowMaximize().then(() => {
    // Update button icon based on window state
    window.electronAPI.windowIsMaximized().then(isMaximized => {
      maximizeBtn.textContent = isMaximized ? '❐' : '□';
    });
  });
});

closeBtn.addEventListener('click', () => {
  window.electronAPI.windowClose();
});

// Update maximize button icon on window resize
window.addEventListener('resize', () => {
  window.electronAPI.windowIsMaximized().then(isMaximized => {
    maximizeBtn.textContent = isMaximized ? '❐' : '□';
  });
});

// Initialize
updateCreateButton();

