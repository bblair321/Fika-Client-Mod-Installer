// This file contains the GUI installer template that will be embedded in the extractor
// It creates a modern browser-based installer interface

const GUI_TEMPLATE = `
// Hide console window IMMEDIATELY on Windows (must be first thing that runs)
(function() {
  if (typeof process !== 'undefined' && process.platform === 'win32') {
    try {
      const { execSync } = require('child_process');
      const os = require('os');
      const path = require('path');
      const fs = require('fs');
      
      // Hide console using Windows API via PowerShell
      const hideScript = `
Add-Type -TypeDefinition @"
using System;
using System.Runtime.InteropServices;
public class Win32 {
  [DllImport("kernel32.dll")]
  public static extern IntPtr GetConsoleWindow();
  [DllImport("user32.dll")]
  public static extern bool ShowWindow(IntPtr hWnd, int nCmdShow);
  public static void Hide() {
    ShowWindow(GetConsoleWindow(), 0);
  }
}
"@
[Win32]::Hide()
      `.trim();
      
      const tempPs = path.join(os.tmpdir(), `hide-console-${process.pid}-${Date.now()}.ps1`);
      fs.writeFileSync(tempPs, hideScript, 'utf8');
      
      // Execute immediately and synchronously
      try {
        execSync(`powershell -NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -Command "& { $ErrorActionPreference='Stop'; & '${tempPs}' }"`, {
          stdio: 'ignore',
          timeout: 1000,
          windowsHide: true
        });
      } catch (e) {
        // Fallback: try with -File instead
        try {
          execSync(`powershell -NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File "${tempPs}"`, {
            stdio: 'ignore',
            timeout: 1000,
            windowsHide: true
          });
        } catch (e2) {
          // Ignore - console hiding is optional
        }
      }
      
      // Clean up temp file
      setTimeout(() => {
        try { if (fs.existsSync(tempPs)) fs.unlinkSync(tempPs); } catch (e) {}
      }, 2000);
    } catch (e) {
      // Ignore errors - console hiding is optional
    }
  }
})();

// Global error handler - catch errors before anything else
(function() {
  try {
    const errorLogPath = require('path').join(require('os').tmpdir(), 'installer-error.txt');
    
    function logError(message, error) {
      try {
        const fs = require('fs');
        const timestamp = new Date().toISOString();
        const errorMsg = '[' + timestamp + '] ' + message + String.fromCharCode(10);
        const stackMsg = error && error.stack ? 'Stack: ' + error.stack + String.fromCharCode(10) : '';
        fs.appendFileSync(errorLogPath, errorMsg + stackMsg + String.fromCharCode(10));
      } catch (e) {
        // Silently ignore - error already logged to file
      }
    }
    
    // Log startup immediately
    logError('Installer starting...');
    
    // Catch uncaught exceptions
    process.on('uncaughtException', function(error) {
      logError('UNCAUGHT EXCEPTION: ' + error.message, error);
      setTimeout(() => process.exit(1), 10000);
    });
    
    // Catch unhandled rejections
    process.on('unhandledRejection', function(reason, promise) {
      logError('UNHANDLED REJECTION: ' + (reason && reason.message || String(reason)), reason);
      setTimeout(() => process.exit(1), 10000);
    });
  } catch (initError) {
    // Even if error handler fails, try to write to file
    try {
      const fs = require('fs');
      const path = require('path');
      const os = require('os');
      fs.writeFileSync(path.join(os.tmpdir(), 'installer-error.txt'), 'Failed to initialize error handler: ' + initError.message);
    } catch (e) {}
  }
})();

const { execSync, spawn } = require('child_process');
const fs = require('fs');
const path = require('path');
const os = require('os');

// Embedded archive data
const embeddedArchiveBase64 = '{{ARCHIVE_BASE64}}';
const embeddedArchiveSize = {{ARCHIVE_SIZE}};
const appName = '{{APP_NAME}}';

let selectedPath = null;
let extractionComplete = false;

function formatBytes(bytes) {
  if (bytes === 0) return '0 Bytes';
  const k = 1024;
  const sizes = ['Bytes', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

function showMessageBox(title, message, buttons) {
  if (process.platform !== 'win32') {
    // Non-Windows: use file-based logging instead of console
    try {
      const fs = require('fs');
      const path = require('path');
      const os = require('os');
      fs.appendFileSync(path.join(os.tmpdir(), 'installer-log.txt'), `[${title}] ${message}\n`);
    } catch (e) {}
    return 'OK';
  }
  try {
    // Use VBScript MsgBox - build message with proper newlines using vbCrLf
    const buttonCode = buttons === 'YesNo' ? '4' : '0'; // 4 = Yes/No, 0 = OK only
    const iconCode = '64'; // 64 = Information icon
    
    // Split message by newlines and join with vbCrLf
    const msgLines = message.replace(/\r\n/g, '\n').replace(/\r/g, '\n').split('\n');
    const msgParts = [];
    for (let i = 0; i < msgLines.length; i++) {
      if (i > 0) {
        msgParts.push(' & vbCrLf & ');
      }
      msgParts.push('"' + msgLines[i].replace(/"/g, '""') + '"');
    }
    const msgText = msgParts.join('');
    const titleText = title.replace(/"/g, '""');
    
    const vbsScript = 'result = MsgBox(' + msgText + ', ' + buttonCode + ' + ' + iconCode + ', "' + titleText + '")\nWScript.Echo result';
    
    const tempFile = path.join(os.tmpdir(), 'msgbox-' + Date.now() + '.vbs');
    fs.writeFileSync(tempFile, vbsScript, 'utf8');
    const result = execSync('cscript //nologo "' + tempFile + '"', { 
      encoding: 'utf8', 
      timeout: 300000
    }).trim();
    fs.unlinkSync(tempFile);
    
    // VBScript MsgBox returns: 1=OK, 2=Cancel, 4=Yes, 6=No
    if (buttons === 'YesNo') {
      return result === '6' ? 'No' : (result === '4' ? 'Yes' : 'OK');
    }
    return 'OK';
  } catch (e) {
    // Fallback: log to file instead of console
    try {
      const fs = require('fs');
      const path = require('path');
      const os = require('os');
      fs.appendFileSync(path.join(os.tmpdir(), 'installer-log.txt'), `[${title}] ${message}\n`);
    } catch (e2) {}
    return 'OK';
  }
}

function showErrorBox(title, message) {
  if (process.platform !== 'win32') {
    // Non-Windows: use file-based logging instead of console
    try {
      const fs = require('fs');
      const path = require('path');
      const os = require('os');
      fs.appendFileSync(path.join(os.tmpdir(), 'installer-error.txt'), `[${title}] ${message}\n`);
    } catch (e) {}
    return;
  }
  try {
    // Use VBScript MsgBox with error icon - build message with proper newlines
    const msgLines = message.replace(/\r\n/g, '\n').replace(/\r/g, '\n').split('\n');
    const msgParts = [];
    for (let i = 0; i < msgLines.length; i++) {
      if (i > 0) {
        msgParts.push(' & vbCrLf & ');
      }
      msgParts.push('"' + msgLines[i].replace(/"/g, '""') + '"');
    }
    const msgText = msgParts.join('');
    const titleText = title.replace(/"/g, '""');
    const vbsScript = 'MsgBox ' + msgText + ', 0 + 16, "' + titleText + '"';
    
    const tempFile = path.join(os.tmpdir(), 'errorbox-' + Date.now() + '.vbs');
    fs.writeFileSync(tempFile, vbsScript, 'utf8');
    execSync('cscript //nologo "' + tempFile + '"', { 
      encoding: 'utf8', 
      timeout: 300000
    });
    fs.unlinkSync(tempFile);
  } catch (e) {
    // Fallback: log to file instead of console
    try {
      const fs = require('fs');
      const path = require('path');
      const os = require('os');
      fs.appendFileSync(path.join(os.tmpdir(), 'installer-error.txt'), `[${title}] ${message}\n`);
    } catch (e2) {}
  }
}

function selectFolderNative() {
  if (process.platform !== 'win32') {
    return null;
  }
  const vbsScript = 'Set objShell = CreateObject("Shell.Application")' + String.fromCharCode(10) +
    'Set objFolder = objShell.BrowseForFolder(0, "Select installation directory:", 0)' + String.fromCharCode(10) +
    'If objFolder Is Nothing Then' + String.fromCharCode(10) +
    '    WScript.Echo ""' + String.fromCharCode(10) +
    'Else' + String.fromCharCode(10) +
    '    WScript.Echo objFolder.Self.Path' + String.fromCharCode(10) +
    'End If';
  
  try {
    const tempFile = path.join(os.tmpdir(), 'folder-' + Date.now() + '.vbs');
    fs.writeFileSync(tempFile, vbsScript);
    const result = execSync('cscript //nologo "' + tempFile + '"', { encoding: 'utf8', timeout: 60000 }).trim();
    fs.unlinkSync(tempFile);
    return result || null;
  } catch (e) {
    return null;
  }
}

// Removed - using generateGUIHTML directly in main flow

async function extractFiles(extractDir) {
  try {
    if (!fs.existsSync(extractDir)) {
      fs.mkdirSync(extractDir, { recursive: true });
    }
    
    // Check if archive data is valid - it should be base64, not the placeholder string
    // The placeholder would be exactly '{{ARCHIVE_BASE64}}', so check for that specific pattern
    const isPlaceholder = embeddedArchiveBase64 && (
      embeddedArchiveBase64 === '{{ARCHIVE_BASE64}}' ||
      (embeddedArchiveBase64.indexOf('{{') !== -1 && embeddedArchiveBase64.indexOf('ARCHIVE_BASE64}}') !== -1)
    );
    
    // Also check if it's a valid base64 string (should start with base64 characters, not placeholder text)
    const isValidBase64 = embeddedArchiveBase64 && embeddedArchiveBase64.length > 20 && 
      /^[A-Za-z0-9+\/]/.test(embeddedArchiveBase64);
    
    if (!embeddedArchiveBase64 || (isPlaceholder && !isValidBase64)) {
      // Log to file instead of console
      try {
        fs.writeFileSync(path.join(os.tmpdir(), 'installer-error.txt'), 'ERROR: Archive data not embedded in installer!');
      } catch (e) {}
      return { success: false, error: 'Archive data not embedded in installer. The archive placeholder was not replaced during packaging.' };
    }
    
    const archiveBuffer = Buffer.from(embeddedArchiveBase64, 'base64');
    
    const tempArchive = path.join(os.tmpdir(), 'extract-' + Date.now() + '.zip');
    fs.writeFileSync(tempArchive, archiveBuffer);
    
    // Use PowerShell to extract
    const psPath = tempArchive.replace(/\\/g, '/');
    const psDest = extractDir.replace(/\\/g, '/');
    
    execSync('powershell -Command "Expand-Archive -Path \'' + psPath + '\' -DestinationPath \'' + psDest + '\' -Force"', { 
      timeout: 60000,
      stdio: 'ignore'
    });
    
    fs.unlinkSync(tempArchive);
    extractionComplete = true;
    
    return { success: true, extractionPath: extractDir };
  } catch (error) {
    return { success: false, error: error.message };
  }
}

// Generate HTML for GUI window using mshta.exe
function generateGUIHTML() {
  // Local helper function to format bytes
  function formatBytes(bytes) {
    // Safety check for undefined, null, or invalid values
    if (!bytes || bytes === 0 || isNaN(bytes)) return '0 Bytes';
    if (bytes < 0) bytes = 0;
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  }
  
  // HTA-safe HTML escaping (no regex to avoid corruption)
  function escapeHtml(value) {
    let s = String(value);
    s = s.split('&').join('&amp;');
    s = s.split('<').join('&lt;');
    s = s.split('>').join('&gt;');
    s = s.split('"').join('&quot;');
    s = s.split("'").join('&#39;');
    return s;
  }
  
  // Calculate formatted size before generating HTML
  // Use a safe fallback if embeddedArchiveSize is undefined
  const archiveSize = (typeof embeddedArchiveSize !== 'undefined' && embeddedArchiveSize != null) ? embeddedArchiveSize : 0;
  const formattedSize = formatBytes(archiveSize);
  
  return '<!DOCTYPE html>' + String.fromCharCode(10) +
'<html>' + String.fromCharCode(10) +
'<head>' + String.fromCharCode(10) +
'<meta charset="UTF-8">' + String.fromCharCode(10) +
'<meta http-equiv="X-UA-Compatible" content="IE=10">' + String.fromCharCode(10) +
'<title>' + appName + ' - Installer</title>' + String.fromCharCode(10) +
'<HTA:APPLICATION ID="Installer" APPLICATIONNAME="' + (appName || "Installer").replace(/"/g, "&quot;") + ' Installer" BORDER="thin" BORDERSTYLE="fixed" CAPTION="yes" ICON="" MAXIMIZEBUTTON="no" MINIMIZEBUTTON="yes" SHOWINTASKBAR="yes" SINGLEINSTANCE="yes" SYSMENU="yes" VERSION="1.0" WINDOWSTATE="normal" SCROLL="no" ERROR="no" WIDTH="900" HEIGHT="700" />' + String.fromCharCode(10) +
'<style>' + String.fromCharCode(10) +
'html, body { width: 100%; height: 100%; margin: 0; padding: 0; overflow: hidden; scrollbar-width: none; -ms-overflow-style: none; }' + String.fromCharCode(10) +
'*::-webkit-scrollbar { display: none; }' + String.fromCharCode(10) +
'* { margin: 0; padding: 0; box-sizing: border-box; }' + String.fromCharCode(10) +
'body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif; margin: 0; padding: 0; display: block; overflow: hidden; width: 900px; height: 700px; background: #6B73D9 !important; }' + String.fromCharCode(10) +
'.container { background: #6B73D9 !important; -webkit-border-radius: 16px; -moz-border-radius: 16px; -ms-border-radius: 16px; border-radius: 16px; box-shadow: 0 10px 40px rgba(0,0,0,0.3); width: 900px !important; height: 700px !important; overflow: hidden; animation: slideIn 0.3s ease-out; border: none; display: flex; flex-direction: column; position: relative; margin: 0; padding: 0; }' + String.fromCharCode(10) +
'@keyframes slideIn { from { opacity: 0; transform: translateY(10px); } to { opacity: 1; transform: translateY(0); } }' + String.fromCharCode(10) +
'.header { background: transparent; color: white; padding: 30px; padding-top: 50px; text-align: center; height: auto; flex-shrink: 0; position: relative; -webkit-border-radius: 16px 16px 0 0; -moz-border-radius: 16px 16px 0 0; -ms-border-radius: 16px 16px 0 0; border-radius: 16px 16px 0 0; }' + String.fromCharCode(10) +
'.header h1 { font-size: 2.5em; margin-bottom: 10px; font-weight: 700; color: white; }' + String.fromCharCode(10) +
'.subtitle { font-size: 1.1em; opacity: 0.9; color: white; font-weight: 400; }' + String.fromCharCode(10) +
'.content { padding: 40px; background: white; flex: 1; overflow-y: auto; overflow-x: hidden; min-height: 0; margin: 0 0 0 0; -webkit-border-radius: 0 0 16px 16px; -moz-border-radius: 0 0 16px 16px; -ms-border-radius: 0 0 16px 16px; border-radius: 0 0 16px 16px; }' + String.fromCharCode(10) +
'.step { display: none; animation: fadeIn 0.4s cubic-bezier(0.16, 1, 0.3, 1); }' + String.fromCharCode(10) +
'@keyframes fadeIn { from { opacity: 0; transform: translateX(20px); } to { opacity: 1; transform: translateX(0); } }' + String.fromCharCode(10) +
'.step.active { display: block; }' + String.fromCharCode(10) +
'.step { margin-bottom: 40px; animation: fadeIn 0.3s ease-out; }' + String.fromCharCode(10) +
'@keyframes fadeIn { from { opacity: 0; transform: translateY(10px); } to { opacity: 1; transform: translateY(0); } }' + String.fromCharCode(10) +
'.step h2 { font-size: 1.5em; margin-bottom: 20px; color: #333; border-bottom: 2px solid #667eea; padding-bottom: 10px; font-weight: 600; border-radius: 4px; }' + String.fromCharCode(10) +
'.step p { margin-bottom: 20px; color: #666; line-height: 1.6; font-size: 1em; }' + String.fromCharCode(10) +
'.info-box { background: #f8f9fa; border: 1px solid #e0e0e0; padding: 20px; -webkit-border-radius: 12px; -moz-border-radius: 12px; -ms-border-radius: 12px; border-radius: 12px; margin: 20px 0; }' + String.fromCharCode(10) +
'.info-box strong { color: #555; display: block; margin-bottom: 8px; font-size: 0.95em; font-weight: 600; }' + String.fromCharCode(10) +
'.info-box span { color: #333; font-weight: 600; }' + String.fromCharCode(10) +
'.input-group { display: flex; gap: 10px; margin: 20px 0; }' + String.fromCharCode(10) +
'.path-input { flex: 1; padding: 12px 16px; border: 2px solid #e0e0e0; -webkit-border-radius: 12px; -moz-border-radius: 12px; -ms-border-radius: 12px; border-radius: 12px; font-size: 1em; background: white; color: #333; transition: border-color 0.3s; font-family: "Segoe UI", sans-serif; }' + String.fromCharCode(10) +
'.path-input:focus { outline: none; border-color: #667eea; }' + String.fromCharCode(10) +
'.path-input[readonly] { background-color: #f5f5f5; cursor: pointer; }' + String.fromCharCode(10) +
'.btn { padding: 12px 24px; border: none; -webkit-border-radius: 20px; -moz-border-radius: 20px; -ms-border-radius: 20px; border-radius: 20px; font-size: 1em; font-weight: 600; cursor: pointer; transition: all 0.3s; white-space: nowrap; }' + String.fromCharCode(10) +
'.btn-primary { background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; }' + String.fromCharCode(10) +
'.btn-primary:hover:not(:disabled) { transform: translateY(-2px); box-shadow: 0 5px 15px rgba(102, 126, 234, 0.4); }' + String.fromCharCode(10) +
'.btn-primary:disabled { opacity: 0.5; cursor: not-allowed; transform: none; }' + String.fromCharCode(10) +
'button.btn-primary { opacity: 1 !important; cursor: pointer !important; }' + String.fromCharCode(10) +
'.btn-secondary { background: #6c757d; color: white; }' + String.fromCharCode(10) +
'.btn-secondary:hover { background: #5a6268; }' + String.fromCharCode(10) +
'.btn-success { background: #28a745; color: white; }' + String.fromCharCode(10) +
'.btn-success:hover { background: #218838; }' + String.fromCharCode(10) +
'.button-group { display: flex; gap: 12px; margin-top: 20px; justify-content: space-between; }' + String.fromCharCode(10) +
'.progress-container { margin: 20px 0; }' + String.fromCharCode(10) +
'.progress-bar { width: 100%; height: 30px; background: #e0e0e0; border-radius: 15px; overflow: hidden; margin-bottom: 10px; }' + String.fromCharCode(10) +
'.progress-fill { height: 100%; background: linear-gradient(90deg, #667eea 0%, #764ba2 100%); width: 0%; transition: width 0.3s; border-radius: 15px; }' + String.fromCharCode(10) +
'.progress-text { text-align: center; color: #666; font-size: 0.95em; }' + String.fromCharCode(10) +
'.success-icon { font-size: 4em; text-align: center; margin: 20px 0; color: #28a745; font-weight: 300; }' + String.fromCharCode(10) +
'.error-icon { font-size: 4em; text-align: center; margin: 20px 0; color: #dc3545; font-weight: 300; }' + String.fromCharCode(10) +
'.install-path { background: #f8f9fa; padding: 15px; -webkit-border-radius: 12px; -moz-border-radius: 12px; -ms-border-radius: 12px; border-radius: 12px; font-family: "Consolas", "Monaco", "Courier New", monospace; word-break: break-all; margin: 20px 0; border: 1px solid #e0e0e0; color: #333; font-size: 0.9em; }' + String.fromCharCode(10) +
'.step-indicator { display: flex; justify-content: center; gap: 10px; margin-bottom: 30px; align-items: center; }' + String.fromCharCode(10) +
'.step-dot { width: 10px; height: 10px; border-radius: 50%; background: #e0e0e0; transition: all 0.3s; position: relative; }' + String.fromCharCode(10) +
'.step-dot.active { background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); width: 30px; border-radius: 5px; }' + String.fromCharCode(10) +
'.step-dot.completed { background: #28a745; }' + String.fromCharCode(10) +
'.step-dot.completed::after { content: "✓"; position: absolute; top: 50%; left: 50%; transform: translate(-50%, -50%); color: white; font-size: 8px; font-weight: bold; }' + String.fromCharCode(10) +
'</style>' + String.fromCharCode(10) +
'</head>' + String.fromCharCode(10) +
'<body style="background: #6B73D9; margin: 0; padding: 0; width: 900px; height: 700px;">' + String.fromCharCode(10) +
'<div class="container" style="background: #6B73D9 !important; width: 900px !important; height: 700px !important; margin: 0 !important; padding: 0 !important; position: absolute !important; top: 0 !important; left: 0 !important; -webkit-border-radius: 16px !important; -moz-border-radius: 16px !important; -ms-border-radius: 16px !important; border-radius: 16px !important;">' + String.fromCharCode(10) +
'<div class="header"><h1>' + escapeHtml(appName || "Package") + '</h1><p class="subtitle">Installation Wizard</p></div>' + String.fromCharCode(10) +
'<div class="content">' + String.fromCharCode(10) +
'<div class="step-indicator"><div class="step-dot active" id="dot0"></div><div class="step-dot" id="dot1"></div><div class="step-dot" id="dot2"></div><div class="step-dot" id="dot3"></div></div>' + String.fromCharCode(10) +
'<div id="welcome-step" class="step active"><h2>Welcome</h2><p>Thank you for choosing ' + escapeHtml(appName || "this package") + '. This wizard will guide you through the installation process.</p><div class="info-box" style="-webkit-border-radius: 12px; -moz-border-radius: 12px; -ms-border-radius: 12px; border-radius: 12px;"><strong>Application:</strong> ' + escapeHtml(appName || "Package") + '<br><strong>Package Size:</strong> <span id="packageSize">' + formattedSize + '</span></div><div style="text-align: center; margin-top: 30px;"><button class="btn btn-primary" id="welcomeNextBtn" onclick="nextStep()" style="cursor: pointer; opacity: 1; min-width: 150px; -webkit-border-radius: 20px; -moz-border-radius: 20px; -ms-border-radius: 20px; border-radius: 20px;">Continue</button></div></div>' + String.fromCharCode(10) +
'<div id="directory-step" class="step"><h2>Choose Installation Location</h2><p>Please select the destination folder where you would like to install the files.</p><div class="input-group"><input type="text" id="installPath" class="path-input" placeholder="Click Browse to select a folder..." readonly style="-webkit-border-radius: 12px; -moz-border-radius: 12px; -ms-border-radius: 12px; border-radius: 12px;"><button class="btn btn-primary" id="browseBtn" onclick="selectFolder()" style="-webkit-border-radius: 20px; -moz-border-radius: 20px; -ms-border-radius: 20px; border-radius: 20px;">Browse</button></div><div class="button-group"><button class="btn btn-secondary" id="dirBackBtn" onclick="prevStep()" style="-webkit-border-radius: 20px; -moz-border-radius: 20px; -ms-border-radius: 20px; border-radius: 20px;">Back</button><button class="btn btn-primary" id="nextBtn" onclick="nextStep()" disabled style="-webkit-border-radius: 20px; -moz-border-radius: 20px; -ms-border-radius: 20px; border-radius: 20px;">Install</button></div></div>' + String.fromCharCode(10) +
'<div id="installing-step" class="step"><h2>Installing</h2><p style="margin-bottom: 20px;">Please wait while the files are being extracted.</p><div class="progress-container"><div class="progress-bar"><div id="progressFill" class="progress-fill"></div></div><p id="progressText" class="progress-text">Initializing...</p></div><p style="text-align: center; color: #666; margin-top: 16px; font-size: 0.9em; font-style: italic;">This may take a few moments depending on file size.</p></div>' + String.fromCharCode(10) +
'<div id="complete-step" class="step"><h2>Installation Complete</h2><div class="success-icon">✓</div><p style="text-align: center; margin-bottom: 20px; font-size: 1em; color: #333;">All files have been successfully installed to:</p><p class="install-path" id="finalPath" style="-webkit-border-radius: 12px; -moz-border-radius: 12px; -ms-border-radius: 12px; border-radius: 12px;"></p><div class="button-group" style="justify-content: center; margin-top: 30px;"><button class="btn btn-success" onclick="openFolder()" style="-webkit-border-radius: 20px; -moz-border-radius: 20px; -ms-border-radius: 20px; border-radius: 20px;">Open Folder</button><button class="btn btn-primary" onclick="closeInstaller()" style="-webkit-border-radius: 20px; -moz-border-radius: 20px; -ms-border-radius: 20px; border-radius: 20px;">Finish</button></div></div>' + String.fromCharCode(10) +
'<div id="error-step" class="step"><h2>Installation Failed</h2><div class="error-icon">✗</div><p id="errorMessage" style="text-align: center; color: #721c24; font-weight: 400; margin: 20px 0; padding: 15px; background: #f8d7da; -webkit-border-radius: 12px; -moz-border-radius: 12px; -ms-border-radius: 12px; border-radius: 12px; border: 1px solid #f5c6cb; font-size: 0.9em;"></p><div style="text-align: center; margin-top: 30px;"><button class="btn btn-primary" onclick="showStep(1)" style="-webkit-border-radius: 20px; -moz-border-radius: 20px; -ms-border-radius: 20px; border-radius: 20px;">Try Again</button></div></div>' + String.fromCharCode(10) +
'</div></div></div>' + String.fromCharCode(10) +
'<script>' + String.fromCharCode(10) +
'(function () {' + String.fromCharCode(10) +
'  function log(msg) {' + String.fromCharCode(10) +
'    try {' + String.fromCharCode(10) +
'      var fso = new ActiveXObject("Scripting.FileSystemObject");' + String.fromCharCode(10) +
'      var shell = new ActiveXObject("WScript.Shell");' + String.fromCharCode(10) +
'      var temp = shell.ExpandEnvironmentStrings("%TEMP%");' + String.fromCharCode(10) +
'      var path = temp + "\\\\installer-debug.txt";' + String.fromCharCode(10) +
'      var file;' + String.fromCharCode(10) +
'      if (fso.FileExists(path)) {' + String.fromCharCode(10) +
'        file = fso.OpenTextFile(path, 8);' + String.fromCharCode(10) +
'      } else {' + String.fromCharCode(10) +
'        file = fso.CreateTextFile(path, true);' + String.fromCharCode(10) +
'      }' + String.fromCharCode(10) +
'      file.WriteLine(new Date().toISOString() + " | " + msg);' + String.fromCharCode(10) +
'      file.Close();' + String.fromCharCode(10) +
'    } catch (e) {' + String.fromCharCode(10) +
'    }' + String.fromCharCode(10) +
'  }' + String.fromCharCode(10) +
'  window.__log = log;' + String.fromCharCode(10) +
'  window.onerror = function (msg, url, line) {' + String.fromCharCode(10) +
'    log("JS ERROR: " + msg + " @ line " + line);' + String.fromCharCode(10) +
'    return false;' + String.fromCharCode(10) +
'  };' + String.fromCharCode(10) +
'  log("HTA script started");' + String.fromCharCode(10) +
'})();' + String.fromCharCode(10) +
'// Immediately resize window on load to prevent auto-sizing' + String.fromCharCode(10) +
'(function() {' + String.fromCharCode(10) +
'  try {' + String.fromCharCode(10) +
'    window.resizeTo(900, 700);' + String.fromCharCode(10) +
'    var centerX = (screen.availWidth / 2) - 450;' + String.fromCharCode(10) +
'    var centerY = (screen.availHeight / 2) - 350;' + String.fromCharCode(10) +
'    window.moveTo(centerX, centerY);' + String.fromCharCode(10) +
'    document.body.style.backgroundColor = "transparent";' + String.fromCharCode(10) +
'  } catch (e) {}' + String.fromCharCode(10) +
'})();' + String.fromCharCode(10) +
'// Window dragging works with native title bar' + String.fromCharCode(10) +
'window.onload = function() {' + String.fromCharCode(10) +
'  try {' + String.fromCharCode(10) +
'    window.resizeTo(900, 700);' + String.fromCharCode(10) +
'    var centerX = (screen.availWidth / 2) - 450;' + String.fromCharCode(10) +
'    var centerY = (screen.availHeight / 2) - 350;' + String.fromCharCode(10) +
'    window.moveTo(centerX, centerY);' + String.fromCharCode(10) +
'    document.body.style.background = "#6B73D9";' + String.fromCharCode(10) +
'    var container = document.querySelector(".container");' + String.fromCharCode(10) +
'    if (container) container.style.background = "#6B73D9";' + String.fromCharCode(10) +
'  } catch (e) {}' + String.fromCharCode(10) +
'};' + String.fromCharCode(10) +
'function escapeHtml(value) {' + String.fromCharCode(10) +
'  var s = String(value);' + String.fromCharCode(10) +
'  s = s.split("&").join("&amp;");' + String.fromCharCode(10) +
'  s = s.split("<").join("&lt;");' + String.fromCharCode(10) +
'  s = s.split(">").join("&gt;");' + String.fromCharCode(10) +
'  s = s.split(\'"\').join("&quot;");' + String.fromCharCode(10) +
'  s = s.split("\'").join("&#39;");' + String.fromCharCode(10) +
'  return s;' + String.fromCharCode(10) +
'}' + String.fromCharCode(10) +
'function el(tag, className, text) {' + String.fromCharCode(10) +
'  var e = document.createElement(tag);' + String.fromCharCode(10) +
'  if (className) e.className = className;' + String.fromCharCode(10) +
'  if (text !== undefined) e.innerText = text;' + String.fromCharCode(10) +
'  return e;' + String.fromCharCode(10) +
'}' + String.fromCharCode(10) +
'function clear(node) {' + String.fromCharCode(10) +
'  while (node.firstChild) node.removeChild(node.firstChild);' + String.fromCharCode(10) +
'}' + String.fromCharCode(10) +
'function showError(message) {' + String.fromCharCode(10) +
'  __log("UI ERROR: " + message);' + String.fromCharCode(10) +
'  var box = document.getElementById("errorMessage");' + String.fromCharCode(10) +
'  if (box) {' + String.fromCharCode(10) +
'    box.innerText = message;' + String.fromCharCode(10) +
'    box.style.display = "block";' + String.fromCharCode(10) +
'  }' + String.fromCharCode(10) +
'}' + String.fromCharCode(10) +
'var currentStep = 0;' + String.fromCharCode(10) +
'var selectedPath = null;' + String.fromCharCode(10) +
'var finalExtractionPath = null;' + String.fromCharCode(10) +
'var archiveSize = parseInt("{{ARCHIVE_SIZE}}", 10) || 0;' + String.fromCharCode(10) +
'var commFile = (function() {' + String.fromCharCode(10) +
'  try {' + String.fromCharCode(10) +
'    var fso = new ActiveXObject("Scripting.FileSystemObject");' + String.fromCharCode(10) +
'    var shell = new ActiveXObject("WScript.Shell");' + String.fromCharCode(10) +
'    var tmp = shell.ExpandEnvironmentStrings("%TEMP%");' + String.fromCharCode(10) +
'    if (!tmp || tmp === "%TEMP%") {' + String.fromCharCode(10) +
'      tmp = fso.GetSpecialFolder(2);' + String.fromCharCode(10) +
'    }' + String.fromCharCode(10) +
'    if (!tmp) {' + String.fromCharCode(10) +
'      tmp = "C:\\\\Windows\\\\Temp";' + String.fromCharCode(10) +
'    }' + String.fromCharCode(10) +
'    var bs = String.fromCharCode(92);' + String.fromCharCode(10) +
'    var result;' + String.fromCharCode(10) +
'    if (tmp.charAt(tmp.length - 1) === bs) {' + String.fromCharCode(10) +
'      result = tmp + "installer-comm.json";' + String.fromCharCode(10) +
'    } else {' + String.fromCharCode(10) +
'      result = tmp + bs + "installer-comm.json";' + String.fromCharCode(10) +
'    }' + String.fromCharCode(10) +
'    return result;' + String.fromCharCode(10) +
'  } catch (e) {' + String.fromCharCode(10) +
'    return "C:\\\\Windows\\\\Temp\\\\installer-comm.json";' + String.fromCharCode(10) +
'  }' + String.fromCharCode(10) +
'})();' + String.fromCharCode(10) +
'function formatBytes(bytes) {' + String.fromCharCode(10) +
'  if (bytes === 0) return "0 Bytes";' + String.fromCharCode(10) +
'  var k = 1024;' + String.fromCharCode(10) +
'  var sizes = ["Bytes", "KB", "MB", "GB"];' + String.fromCharCode(10) +
'  var i = Math.floor(Math.log(bytes) / Math.log(k));' + String.fromCharCode(10) +
'  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + " " + sizes[i];' + String.fromCharCode(10) +
'}' + String.fromCharCode(10) +
'function showStep(stepIndex) {' + String.fromCharCode(10) +
'  try {' + String.fromCharCode(10) +
'    var steps = ["welcome-step", "directory-step", "installing-step", "complete-step", "error-step"];' + String.fromCharCode(10) +
'    for (var i = 0; i < steps.length; i++) {' + String.fromCharCode(10) +
'      var el = document.getElementById(steps[i]);' + String.fromCharCode(10) +
'      if (el) {' + String.fromCharCode(10) +
'        if (i === stepIndex) {' + String.fromCharCode(10) +
'          el.className = "step active";' + String.fromCharCode(10) +
'          el.style.display = "block";' + String.fromCharCode(10) +
'        } else {' + String.fromCharCode(10) +
'          el.className = "step";' + String.fromCharCode(10) +
'          el.style.display = "none";' + String.fromCharCode(10) +
'        }' + String.fromCharCode(10) +
'      }' + String.fromCharCode(10) +
'    }' + String.fromCharCode(10) +
'    currentStep = stepIndex;' + String.fromCharCode(10) +
'  } catch (e) {' + String.fromCharCode(10) +
'    alert("Error showing step: " + e.message);' + String.fromCharCode(10) +
'  }' + String.fromCharCode(10) +
'}' + String.fromCharCode(10) +
'function nextStep() {' + String.fromCharCode(10) +
'  try {' + String.fromCharCode(10) +
'    if (currentStep === 0) {' + String.fromCharCode(10) +
'      showStep(1);' + String.fromCharCode(10) +
'    } else if (currentStep === 1) {' + String.fromCharCode(10) +
'      if (!selectedPath) {' + String.fromCharCode(10) +
'        alert("Please select an installation directory first.");' + String.fromCharCode(10) +
'        return;' + String.fromCharCode(10) +
'      }' + String.fromCharCode(10) +
'      startExtraction();' + String.fromCharCode(10) +
'    } else {' + String.fromCharCode(10) +
'      showStep(currentStep + 1);' + String.fromCharCode(10) +
'    }' + String.fromCharCode(10) +
'  } catch (e) {' + String.fromCharCode(10) +
'    alert("Error in nextStep: " + e.message + "\\nStack: " + (e.stack || "no stack"));' + String.fromCharCode(10) +
'  }' + String.fromCharCode(10) +
'}' + String.fromCharCode(10) +
'function prevStep() {' + String.fromCharCode(10) +
'  if (currentStep > 0) showStep(currentStep - 1);' + String.fromCharCode(10) +
'}' + String.fromCharCode(10) +
'function selectFolder() {' + String.fromCharCode(10) +
'  var shell = new ActiveXObject("Shell.Application");' + String.fromCharCode(10) +
'  var folder = shell.BrowseForFolder(0, "Select installation directory:", 0);' + String.fromCharCode(10) +
'  if (folder) {' + String.fromCharCode(10) +
'    selectedPath = folder.Self.Path;' + String.fromCharCode(10) +
'    var pathEl = document.getElementById("installPath");' + String.fromCharCode(10) +
'    var btnEl = document.getElementById("nextBtn");' + String.fromCharCode(10) +
'    if (pathEl) pathEl.value = selectedPath;' + String.fromCharCode(10) +
'    if (btnEl) btnEl.disabled = false;' + String.fromCharCode(10) +
'  }' + String.fromCharCode(10) +
'}' + String.fromCharCode(10) +
'function startExtraction() {' + String.fromCharCode(10) +
'  try {' + String.fromCharCode(10) +
'    if (!selectedPath) {' + String.fromCharCode(10) +
'      alert("Please select an installation folder first.");' + String.fromCharCode(10) +
'      return;' + String.fromCharCode(10) +
'    }' + String.fromCharCode(10) +
'    if (!commFile || commFile === "undefined") {' + String.fromCharCode(10) +
'      alert("An error occurred. Please try again.");' + String.fromCharCode(10) +
'      return;' + String.fromCharCode(10) +
'    }' + String.fromCharCode(10) +
'    showStep(2);' + String.fromCharCode(10) +
'    updateProgress(15, "Preparing extraction...");' + String.fromCharCode(10) +
'    var fso = new ActiveXObject("Scripting.FileSystemObject");' + String.fromCharCode(10) +
'    var data = "EXTRACT|" + selectedPath;' + String.fromCharCode(10) +
'    var folder = fso.GetParentFolderName(commFile);' + String.fromCharCode(10) +
'    if (!fso.FolderExists(folder)) {' + String.fromCharCode(10) +
'      fso.CreateFolder(folder);' + String.fromCharCode(10) +
'    }' + String.fromCharCode(10) +
'    var file = fso.CreateTextFile(commFile, true);' + String.fromCharCode(10) +
'    file.Write(data);' + String.fromCharCode(10) +
'    file.Close();' + String.fromCharCode(10) +
'    updateProgress(25, "Extracting files...");' + String.fromCharCode(10) +
'  } catch (e) {' + String.fromCharCode(10) +
'    alert("An error occurred: " + e.message);' + String.fromCharCode(10) +
'    updateProgress(0, "Error: " + e.message);' + String.fromCharCode(10) +
'  }' + String.fromCharCode(10) +
'}' + String.fromCharCode(10) +
'function updateProgress(percentage, text) {' + String.fromCharCode(10) +
'  var fillEl = document.getElementById("progressFill");' + String.fromCharCode(10) +
'  var textEl = document.getElementById("progressText");' + String.fromCharCode(10) +
'  if (fillEl) {' + String.fromCharCode(10) +
'    fillEl.style.width = percentage + "%";' + String.fromCharCode(10) +
'    if (percentage >= 100) {' + String.fromCharCode(10) +
'      fillEl.style.background = "#5A5A5A";' + String.fromCharCode(10) +
'    }' + String.fromCharCode(10) +
'  }' + String.fromCharCode(10) +
'  if (textEl) textEl.textContent = text;' + String.fromCharCode(10) +
'}' + String.fromCharCode(10) +
'function checkExtractionStatus() {' + String.fromCharCode(10) +
'  try {' + String.fromCharCode(10) +
'    var fso = new ActiveXObject("Scripting.FileSystemObject");' + String.fromCharCode(10) +
'    if (fso.FileExists(commFile)) {' + String.fromCharCode(10) +
'      var file = fso.OpenTextFile(commFile, 1);' + String.fromCharCode(10) +
'      var content = file.ReadAll();' + String.fromCharCode(10) +
'      file.Close();' + String.fromCharCode(10) +
'      if (content.indexOf("EXTRACT|") === 0) {' + String.fromCharCode(10) +
'        updateProgress(30, "Extraction in progress...");' + String.fromCharCode(10) +
'        return;' + String.fromCharCode(10) +
'      }' + String.fromCharCode(10) +
'      if (content.indexOf("EXTRACT|") === 0) {' + String.fromCharCode(10) +
'        updateProgress(40, "Extracting files...");' + String.fromCharCode(10) +
'        return;' + String.fromCharCode(10) +
'      }' + String.fromCharCode(10) +
'      if (content.indexOf("COMPLETE|") === 0) {' + String.fromCharCode(10) +
'        var parts = content.split("|");' + String.fromCharCode(10) +
'        if (parts.length >= 3 && parts[2] === "SUCCESS") {' + String.fromCharCode(10) +
'          updateProgress(100, "Installation complete!");' + String.fromCharCode(10) +
'          finalExtractionPath = parts[1];' + String.fromCharCode(10) +
'          setTimeout(function() {' + String.fromCharCode(10) +
'            var pathEl = document.getElementById("finalPath");' + String.fromCharCode(10) +
'            if (pathEl) pathEl.textContent = finalExtractionPath;' + String.fromCharCode(10) +
'            showStep(3);' + String.fromCharCode(10) +
'          }, 800);' + String.fromCharCode(10) +
'        } else {' + String.fromCharCode(10) +
'          var errorEl = document.getElementById("errorMessage");' + String.fromCharCode(10) +
'          if (errorEl) errorEl.textContent = parts.length > 3 ? parts[3] : "An unknown error occurred during installation.";' + String.fromCharCode(10) +
'          showStep(4);' + String.fromCharCode(10) +
'        }' + String.fromCharCode(10) +
'      } else if (content.indexOf("CLOSE") === 0) {' + String.fromCharCode(10) +
'        window.close();' + String.fromCharCode(10) +
'      }' + String.fromCharCode(10) +
'  }' + String.fromCharCode(10) +
'  } catch (e) {' + String.fromCharCode(10) +
'    // Silently handle errors' + String.fromCharCode(10) +
'  }' + String.fromCharCode(10) +
'}' + String.fromCharCode(10) +
'function openFolder() {' + String.fromCharCode(10) +
'  if (finalExtractionPath) {' + String.fromCharCode(10) +
'    var shell = new ActiveXObject("WScript.Shell");' + String.fromCharCode(10) +
'    shell.Run("explorer " + finalExtractionPath);' + String.fromCharCode(10) +
'  }' + String.fromCharCode(10) +
'}' + String.fromCharCode(10) +
'function closeInstaller() {' + String.fromCharCode(10) +
'  var fso = new ActiveXObject("Scripting.FileSystemObject");' + String.fromCharCode(10) +
'  var file = fso.CreateTextFile(commFile, true);' + String.fromCharCode(10) +
'  file.Write("CLOSE");' + String.fromCharCode(10) +
'  file.Close();' + String.fromCharCode(10) +
'  window.close();' + String.fromCharCode(10) +
'}' + String.fromCharCode(10) +
'function initGUI() {' + String.fromCharCode(10) +
'  try {' + String.fromCharCode(10) +
'    showStep(0);' + String.fromCharCode(10) +
'    setInterval(checkExtractionStatus, 500);' + String.fromCharCode(10) +
'    // Resize window to fit content properly' + String.fromCharCode(10) +
'    try {' + String.fromCharCode(10) +
'      window.resizeTo(900, 700);' + String.fromCharCode(10) +
'      window.moveTo((screen.width / 2) - 450, (screen.height / 2) - 350);' + String.fromCharCode(10) +
'    } catch (resizeError) {' + String.fromCharCode(10) +
'      // Ignore resize errors' + String.fromCharCode(10) +
'    }' + String.fromCharCode(10) +
'  } catch (e) {' + String.fromCharCode(10) +
'    // Silently handle errors' + String.fromCharCode(10) +
'  }' + String.fromCharCode(10) +
'}' + String.fromCharCode(10) +
'setTimeout(function() {' + String.fromCharCode(10) +
'  try {' + String.fromCharCode(10) +
'    initGUI();' + String.fromCharCode(10) +
'  } catch (e) {' + String.fromCharCode(10) +
'    // Silently handle errors' + String.fromCharCode(10) +
'  }' + String.fromCharCode(10) +
'}, 100);' + String.fromCharCode(10) +
'</script>' + String.fromCharCode(10) +
'</body></html>';
}

// Validate critical data exists before starting
// Note: We check if the archive data looks valid (starts with base64 characters) instead of checking for placeholder
// This avoids pkg including the original template file due to string matching
try {
  const isEmpty = !embeddedArchiveBase64 || embeddedArchiveBase64.length === 0;
  // Check if archive data looks like base64 (starts with valid base64 chars, not placeholder text)
  const looksLikePlaceholder = embeddedArchiveBase64 && (
    embeddedArchiveBase64.indexOf('ARCHIVE_BASE64') !== -1 ||
    embeddedArchiveBase64.indexOf('{{') !== -1 ||
    embeddedArchiveBase64.length < 10
  );
  
  if (looksLikePlaceholder && embeddedArchiveSize > 0) {
    const errorMsg = 'ERROR: Archive data placeholder was not replaced during packaging!';
    try {
      fs.writeFileSync(path.join(os.tmpdir(), 'installer-error.txt'), errorMsg + String.fromCharCode(10) + 'This is a packaging error - the archive was not embedded.');
    } catch (e) {}
    // Don't use console.error - it creates console window
    // Don't exit - allow GUI to show so user can see the issue
  } else if (isEmpty && embeddedArchiveSize > 0) {
    // Archive size > 0 but base64 is empty - this is an error
    const errorMsg = 'ERROR: Archive data is missing even though archive size is ' + embeddedArchiveSize + ' bytes!';
    try {
      fs.writeFileSync(path.join(os.tmpdir(), 'installer-error.txt'), errorMsg);
    } catch (e) {}
    // Don't use console.error - it creates console window
  } else if (isEmpty && embeddedArchiveSize === 0) {
    // Both are 0 - archive is intentionally empty
    // Don't use console.log - it creates console window
  }
} catch (validationError) {
  // Don't use console.warn - it creates console window
  // Log to file if needed
  try {
    fs.writeFileSync(path.join(os.tmpdir(), 'installer-warning.txt'), 'Validation warning: ' + validationError.message);
  } catch (e) {}
  // Don't exit on validation warning - let GUI show
}

// Hide console window on Windows immediately
if (typeof process !== 'undefined' && process.platform === 'win32') {
  try {
    const { execSync } = require('child_process');
    const os = require('os');
    // Hide console window using PowerShell and Windows API
    const hideScript = `$code = '[DllImport("user32.dll")]public static extern bool ShowWindow(IntPtr hWnd,int nCmdShow);[DllImport("kernel32.dll")]public static extern IntPtr GetConsoleWindow();';$type = Add-Type -MemberDefinition $code -Name Win32ShowWindow -Namespace Console -PassThru;$type::ShowWindow($type::GetConsoleWindow(),0)`;
    const tempPs = path.join(os.tmpdir(), `hide-console-${process.pid}.ps1`);
    fs.writeFileSync(tempPs, hideScript, 'utf8');
    execSync(`powershell -NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File "${tempPs}"`, {
      stdio: 'ignore',
      timeout: 2000,
      windowsHide: true
    });
    // Clean up temp file after a short delay
    setTimeout(() => {
      try { if (fs.existsSync(tempPs)) fs.unlinkSync(tempPs); } catch (e) {}
    }, 500);
  } catch (e) {
    // Ignore errors - console hiding is optional
  }
}

// Start the installer with native GUI window (mshta.exe)
(async () => {
  try {
    if (process.platform !== 'win32') {
      // Non-Windows: use file-based logging instead of console
      try {
        fs.writeFileSync(path.join(os.tmpdir(), 'installer-log.txt'), 'Native GUI is only supported on Windows. Using console interface.\n');
      } catch (e) {}
      // Fallback to console on non-Windows
      const extractPath = selectFolderNative();
      if (extractPath) {
        const result = await extractFiles(extractPath);
        if (result.success) {
          try {
            fs.writeFileSync(path.join(os.tmpdir(), 'installer-log.txt'), 'Installation complete! Files extracted to: ' + result.extractionPath + '\n');
          } catch (e) {}
        } else {
          try {
            fs.writeFileSync(path.join(os.tmpdir(), 'installer-error.txt'), 'Installation failed: ' + result.error + '\n');
          } catch (e) {}
          process.exit(1);
        }
      }
      process.exit(0);
    }
    
    // Create GUI window using mshta.exe (Windows HTML Application)
    // mshta.exe creates a native window (not a browser) that displays HTML/HTA content
    const htmlContent = generateGUIHTML();
    const tempHtmlFile = path.join(os.tmpdir(), 'installer-gui-' + Date.now() + '.hta');
    // Write with BOM to ensure proper encoding for HTA
    const BOM = '\uFEFF';
    fs.writeFileSync(tempHtmlFile, BOM + htmlContent, 'utf8');
    
    // Use mshta.exe to display HTA in a native window
    // Note: .hta extension is more appropriate for HTA applications
    const mshtaProcess = spawn('mshta.exe', [tempHtmlFile], {
      detached: true,
      stdio: 'ignore',
      windowsVerbatimArguments: false
    });
    
    // Unref the process so Node.js can exit when GUI closes
    mshtaProcess.unref();
    
    // Clean up HTML file when process exits
    mshtaProcess.on('exit', () => {
      try {
        if (fs.existsSync(tempHtmlFile)) {
          fs.unlinkSync(tempHtmlFile);
        }
      } catch (e) {
        // Ignore cleanup errors
      }
      process.exit(0);
    });
    
    // Set up file-based communication for extraction
    const commFile = path.join(os.tmpdir(), 'installer-comm.json');
    
    // Ensure the file doesn't exist initially
    try {
      if (fs.existsSync(commFile)) {
        fs.unlinkSync(commFile);
      }
    } catch (e) {
      // Ignore
    }
    
    // Poll for extraction request from GUI (console output removed for cleaner UI)
    let pollCount = 0;
    const checkInterval = setInterval(() => {
      pollCount++;
      try {
        if (fs.existsSync(commFile)) {
          const content = fs.readFileSync(commFile, 'utf8').trim();
          
          if (content.indexOf('EXTRACT|') === 0) {
            const parts = content.split('|');
            if (parts.length >= 2) {
              clearInterval(checkInterval);
              const extractPath = parts[1];
              
              extractFiles(extractPath).then(result => {
                if (result.success) {
                  fs.writeFileSync(commFile, 'COMPLETE|' + result.extractionPath + '|SUCCESS', 'utf8');
                } else {
                  fs.writeFileSync(commFile, 'COMPLETE||FAIL|' + result.error, 'utf8');
                  setTimeout(() => process.exit(1), 2000);
                }
              }).catch(err => {
                fs.writeFileSync(commFile, 'COMPLETE||FAIL|' + err.message, 'utf8');
                setTimeout(() => process.exit(1), 2000);
              });
            }
          } else if (content === 'CLOSE') {
            clearInterval(checkInterval);
            try { fs.unlinkSync(commFile); } catch (e) {}
            try { fs.unlinkSync(tempHtmlFile); } catch (e) {}
            process.exit(0);
          }
        }
      } catch (e) {
        // Ignore read errors
      }
    }, 500);
    
    // Timeout after 10 minutes
    setTimeout(() => {
      clearInterval(checkInterval);
      try { fs.unlinkSync(commFile); } catch (e) {}
      try { fs.unlinkSync(tempHtmlFile); } catch (e) {}
      process.exit(0);
    }, 600000);
    
  } catch (error) {
    // Log to file instead of console to avoid creating console window
    try {
      fs.writeFileSync(path.join(os.tmpdir(), 'installer-error.txt'), 
        'Failed to start installer:\nError: ' + error.message + '\nStack: ' + (error.stack || 'no stack') + '\n');
    } catch (e) {}
    
    showErrorBox('Installer Error', 'An error occurred:' + String.fromCharCode(10) + String.fromCharCode(10) + error.message);
    
    setTimeout(() => {
      process.exit(1);
    }, 2000);
  }
})();
`;

module.exports = GUI_TEMPLATE;

