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
// Make dependencies optional for pkg bundling compatibility
let AdmZip, cliProgress;

try {
  AdmZip = require("adm-zip");
} catch (e) {
  AdmZip = null;
}

try {
  cliProgress = require("cli-progress");
} catch (e) {
  cliProgress = null;
}

// Make ora optional for compatibility - with proper fallback
let oraModule;
try {
  oraModule = require("ora");
} catch (error) {
  oraModule = null;
}

// Safe ora wrapper that always works
const ora = function(text) {
  // Return an object that mimics ora's spinner interface
  const spinnerObj = {
    succeed: (msg) => {
      console.log(msg || '✅');
      return spinnerObj;
    },
    fail: (msg) => {
      console.log(msg || '❌');
      return spinnerObj;
    },
    start: function(msg) {
      console.log(msg || text || 'Starting...');
      return spinnerObj;
    },
    stop: () => {},
    update: () => {}
  };

  // Try to use real ora if available
  if (oraModule) {
    try {
      const oraFunction = oraModule.default || oraModule;
      if (typeof oraFunction === 'function') {
        const realSpinner = oraFunction(text);
        if (realSpinner && typeof realSpinner.start === 'function') {
          return realSpinner;
        }
      }
    } catch (error) {
      // Fall through to console-based spinner
    }
  }

  // Return console-based spinner
  console.log(text || 'Loading...');
  return spinnerObj;
};

class FilePacker {
  constructor(config = {}) {
    this.config = {
      outputDir: "./dist",
      version: "1.0.0",
      appName: "MyPackage",
      includeVersion: true,
      silentMode: false,
      defaultExtractPath: null,
      // Universal installer messages (can be customized)
      messages: {
        title: "File Extractor",
        selectDirectory: "Please select the folder where you want to extract the files.",
        directoryPlaceholder: "Enter the full path to your installation directory...",
        commonDirectories: "Common installation directories:",
        desktopWarning: "Using Desktop is not recommended. Files should be extracted to the correct application directory.",
        extractionComplete: "Extraction completed!",
        extractionFailed: "Extraction failed!",
        ...config.messages
      },
      ...config,
    };
  }

  /**
   * Pack files into a self-extracting executable (for launcher integration)
   */
  async packFilesSilent(files, folders, outputName, extractPath = null) {
    const config = {
      ...this.config,
      silentMode: true,
      defaultExtractPath: extractPath,
    };

    return await this.packFiles({
      files,
      folders,
      outputName,
      config,
    });
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
    console.log("📦 Creating archive...");
    console.log("Files:", files.length);
    console.log("Folders:", folders.length);
    await this.createArchive(files, folders, archivePath);

    // Verify archive was created and has content
    if (!fs.existsSync(archivePath)) {
      throw new Error('Archive file was not created!');
    }
    const archiveStats = fs.statSync(archivePath);
    console.log("📦 Archive created, size:", archiveStats.size, "bytes");
    
    if (archiveStats.size === 0) {
      console.warn("⚠️  WARNING: Archive is empty! No files were added.");
    }

    // Package the extractor with pkg
    const outputFileName = outputName || this.generateOutputName();

    // Read and base64 encode the archive to embed it
    console.log("🔐 Encoding archive for embedding...");
    const archiveBuffer = fs.readFileSync(archivePath);
    const archiveSize = archiveBuffer.length;
    
    // Check archive size before base64 encoding
    // JavaScript has a maximum string length of ~1GB, and base64 increases size by ~33%
    // So we limit to ~700MB to be safe
    const MAX_ARCHIVE_SIZE = 700 * 1024 * 1024; // 700MB
    if (archiveSize > MAX_ARCHIVE_SIZE) {
      const sizeMB = (archiveSize / (1024 * 1024)).toFixed(2);
      const maxMB = (MAX_ARCHIVE_SIZE / (1024 * 1024)).toFixed(0);
      throw new Error(
        `Archive is too large (${sizeMB} MB). Maximum supported size is ${maxMB} MB.\n` +
        `Please reduce the size of your files or split them into multiple installers.`
      );
    }
    
    let archiveBase64;
    try {
      archiveBase64 = archiveBuffer.toString("base64");
    } catch (error) {
      if (error.message && error.message.includes("Invalid string length")) {
        const sizeMB = (archiveSize / (1024 * 1024)).toFixed(2);
        throw new Error(
          `Archive is too large (${sizeMB} MB) to embed in the installer.\n` +
          `JavaScript cannot handle strings this large. Please reduce the size of your files or split them into multiple installers.`
        );
      }
      throw error;
    }
    
    console.log("📦 Archive encoded, base64 length:", archiveBase64.length);
    console.log("📦 Archive size:", archiveSize, "bytes");

    // Create the extractor executable with embedded archive
    const extractorCode = this.generateExtractor(archiveBase64, archiveSize);
    const extractorPath = path.join(tempDir, "extractor.js");
    
    // Verify the replacement worked before writing
    if (extractorCode.includes('{{ARCHIVE_BASE64}}')) {
      console.error('❌ CRITICAL ERROR: Archive placeholder still in extractor code!');
      console.error('This means the replacement failed. Cannot create installer.');
      throw new Error('Archive placeholder replacement failed in extractor code');
    }
    
    // Verify archive data is actually in the code (check first 50 chars of base64)
    if (archiveBase64 && archiveBase64.length > 0) {
      const archivePrefix = archiveBase64.substring(0, 50);
      if (!extractorCode.includes(archivePrefix)) {
        console.error('❌ CRITICAL ERROR: Archive data not found in extractor code!');
        console.error('Archive prefix:', archivePrefix);
        throw new Error('Archive data not embedded in extractor code');
      } else {
        console.log('✅ Verified: Archive data is present in extractor code');
      }
    }
    
    fs.writeFileSync(extractorPath, extractorCode);
    
    // Report extractor code size before packaging
    const extractorCodeStats = fs.statSync(extractorPath);
    const extractorCodeSizeMB = (extractorCodeStats.size / (1024 * 1024)).toFixed(2);
    const extractorCodeSizeKB = (extractorCodeStats.size / 1024).toFixed(0);
    console.log(`\n📄 Extractor code size: ${extractorCodeSizeMB} MB (${extractorCodeSizeKB} KB)`);
    console.log(`   - Archive (base64): ~${((archiveBase64.length) / (1024 * 1024)).toFixed(2)} MB`);
    console.log(`   - Archive (original): ${(archiveSize / (1024 * 1024)).toFixed(2)} MB`);
    console.log(`   - Base64 overhead: ~${((archiveBase64.length - archiveSize) / (1024 * 1024)).toFixed(2)} MB`);
    console.log(`   - Extractor template: ~${((extractorCodeStats.size - archiveBase64.length) / (1024 * 1024)).toFixed(2)} MB`);
    
    console.log('✅ Extractor code written to:', extractorPath);
    
    // Double-check the written file to ensure replacement persisted
    const writtenContent = fs.readFileSync(extractorPath, 'utf8');
    const placeholderPos = writtenContent.indexOf('{{ARCHIVE_BASE64}}');
    if (placeholderPos !== -1) {
      console.error('❌ CRITICAL: Placeholder still in written file at position:', placeholderPos);
      console.error('Context around placeholder:', writtenContent.substring(Math.max(0, placeholderPos - 100), placeholderPos + 150));
      throw new Error('Placeholder replacement did not persist in extractor.js file');
    }
    if (archiveBase64 && archiveBase64.length > 0) {
      const archivePrefix = archiveBase64.substring(0, 50);
      const archivePos = writtenContent.indexOf(archivePrefix);
      if (archivePos === -1) {
        console.error('❌ CRITICAL: Archive data not found in written file!');
        console.error('Looking for:', archivePrefix);
        console.error('First 200 chars of file:', writtenContent.substring(0, 200));
        throw new Error('Archive data not found in extractor.js file');
      } else {
        console.log('✅ Verified: Archive data found in written file at position:', archivePos);
      }
    }
    console.log('✅ Verified: Written file contains replaced archive data');
    
    // Create package.json in temp directory to ensure console window is shown
    const packageJsonPath = path.join(tempDir, "package.json");
    fs.writeFileSync(packageJsonPath, JSON.stringify({
      name: "installer",
      version: "1.0.0",
      main: "extractor.js",
      bin: "extractor.js",
      pkg: {
        scripts: [],
        assets: [],
        outputPath: path.resolve(this.config.outputDir, outputName),
        // Explicitly exclude the template file to prevent pkg from bundling it
        // Only bundle extractor.js, nothing else
        targets: ["node18-win-x64"]
      }
    }, null, 2));
    await this.createExtractorExecutable(
      extractorPath,
      outputFileName,
      archiveSize
    );

    // Cleanup temp directory (with retry logic for locked files)
    await this.cleanup(tempDir);

    console.log(`✅ Created single-file installer: ${outputFileName}.exe`);
    console.log(`📦 Archive embedded: ${(archiveSize / 1024 / 1024).toFixed(2)} MB`);
  }

  /**
   * Create ZIP archive of files and folders
   */
  async createArchive(files, folders, outputPath) {
    return new Promise((resolve, reject) => {
      const output = fs.createWriteStream(outputPath);
      const archive = archiver("zip", { zlib: { level: 9 } });

      // Count total files for progress tracking
      let totalFiles = 0;
      files.forEach((file) => {
        if (fs.existsSync(file)) totalFiles++;
      });
      folders.forEach((folder) => {
        if (fs.existsSync(folder)) {
          totalFiles += this.countFilesInDirectory(folder);
        }
      });

      // Create progress bar (with fallback if cliProgress not available)
      let progressBar = null;
      if (cliProgress) {
        progressBar = new cliProgress.SingleBar({
          format:
            "📦 Archiving |{bar}| {percentage}% | {value}/{total} files | ETA: {eta}s",
          barCompleteChar: "█",
          barIncompleteChar: "░",
          hideCursor: true,
          clearOnComplete: false,
        });
      }

      let processedFiles = 0;

      // Start progress bar
      if (totalFiles > 0 && progressBar) {
        progressBar.start(totalFiles, 0);
      }

      output.on("close", () => {
        if (totalFiles > 0 && progressBar) {
          progressBar.stop();
        }
        const bytes = archive.pointer();
        const sizeStr =
          bytes === 0
            ? "0 Bytes"
            : bytes < 1024
            ? bytes + " Bytes"
            : bytes < 1024 * 1024
            ? (bytes / 1024).toFixed(2) + " KB"
            : bytes < 1024 * 1024 * 1024
            ? (bytes / (1024 * 1024)).toFixed(2) + " MB"
            : (bytes / (1024 * 1024 * 1024)).toFixed(2) + " GB";
        console.log(`\n📁 Archive created: ${sizeStr}`);
        resolve();
      });

      archive.on("error", (err) => {
        if (totalFiles > 0 && progressBar) {
          progressBar.stop();
        }
        reject(err);
      });

      archive.on("entry", (entry) => {
        processedFiles++;
        if (totalFiles > 0 && progressBar) {
          progressBar.update(processedFiles);
        }
      });

      archive.pipe(output);

      // Add individual files
      files.forEach((file) => {
        if (fs.existsSync(file)) {
          const fileName = path.basename(file);
          archive.file(file, { name: fileName });
        }
      });

      // Add folders
      folders.forEach((folder) => {
        if (fs.existsSync(folder)) {
          const folderName = path.basename(folder);
          console.log('Adding folder to archive:', folder, 'as', folderName);
          archive.directory(folder, folderName);
        } else {
          console.warn('Folder does not exist:', folder);
        }
      });

      archive.finalize();
    });
  }

  countFilesInDirectory(dirPath) {
    let count = 0;
    try {
      const items = fs.readdirSync(dirPath);
      for (const item of items) {
        const fullPath = path.join(dirPath, item);
        const stat = fs.statSync(fullPath);
        if (stat.isDirectory()) {
          count += this.countFilesInDirectory(fullPath);
        } else {
          count++;
        }
      }
    } catch (error) {
      // Ignore errors when counting files
    }
    return count;
  }

  /**
   * Generate the extractor Node.js code with embedded archive
   */
  generateExtractor(archiveBase64, archiveSize) {
    // Use GUI installer by default
    return this.generateGUIExtractor(archiveBase64, archiveSize);
  }

  generateGUIExtractor(archiveBase64, archiveSize) {
    // Load the GUI template and substitute values
    const templatePath = path.resolve(__dirname, '..', 'installer-gui-template.js');
    let template;
    
    try {
      // Read the template file and extract the template string
      const templateFileContent = fs.readFileSync(templatePath, 'utf8');
      // Extract the template string between the backticks (multiline match)
      // The template starts after "const GUI_TEMPLATE = `" and ends before "`;\n\nmodule.exports"
      // Extract template: find content between "const GUI_TEMPLATE = `" and closing "`;"
      const startMarker = 'const GUI_TEMPLATE = `';
      const startIdx = templateFileContent.indexOf(startMarker);
      
      if (startIdx !== -1) {
        // Find the closing backtick before module.exports
        const afterStart = templateFileContent.substring(startIdx + startMarker.length);
        // Look for the pattern: backtick, semicolon, newline(s), module.exports
        const endPattern = /`;\s*module\.exports = GUI_TEMPLATE;/;
        const endMatch = afterStart.match(endPattern);
        
        if (endMatch) {
          template = afterStart.substring(0, endMatch.index);
        } else {
          throw new Error('Could not find end of template in file');
        }
    } else {
        throw new Error('Could not find start of template in file');
      }
  } catch (error) {
      throw new Error(`Failed to load GUI template: ${error.message}. Make sure installer-gui-template.js exists.`);
    }
    
    // Replace placeholders with actual values (escape backticks and dollar signs in archive data)
    if (!archiveBase64 || archiveBase64.length === 0) {
      console.warn('⚠️  Warning: Archive base64 is empty! Archive may be empty.');
    }
    
    const escapedArchive = (archiveBase64 || '').replace(/\\/g, '\\\\').replace(/`/g, '\\`').replace(/\$/g, '\\$');
    const appNameSafe = (this.config.appName || 'MyPackage').replace(/'/g, "\\'");
    
    console.log('Replacing placeholders...');
    console.log('Archive size:', archiveSize, 'bytes');
    console.log('Archive base64 length:', escapedArchive.length);
    console.log('App name:', appNameSafe);
    
    // Count how many times each placeholder appears in template
    const archivePlaceholderCount = (template.match(/\{\{ARCHIVE_BASE64\}\}/g) || []).length;
    const sizePlaceholderCount = (template.match(/\{\{ARCHIVE_SIZE\}\}/g) || []).length;
    const appNamePlaceholderCount = (template.match(/\{\{APP_NAME\}\}/g) || []).length;
    
    console.log('Placeholders found in template:');
    console.log('  {{ARCHIVE_BASE64}}:', archivePlaceholderCount);
    console.log('  {{ARCHIVE_SIZE}}:', sizePlaceholderCount);
    console.log('  {{APP_NAME}}:', appNamePlaceholderCount);
    
    // Perform replacement with explicit checks
    let guiCode = template;
    
    // Replace ARCHIVE_BASE64 - must happen first
    const archivePlaceholderRegex = /\{\{ARCHIVE_BASE64\}\}/g;
    const archiveMatches = guiCode.match(archivePlaceholderRegex);
    if (archiveMatches) {
      console.log('Found', archiveMatches.length, 'instances of {{ARCHIVE_BASE64}} to replace');
      guiCode = guiCode.replace(archivePlaceholderRegex, escapedArchive);
      // Verify replacement
      if (guiCode.includes('{{ARCHIVE_BASE64}}')) {
        throw new Error('Failed to replace all {{ARCHIVE_BASE64}} placeholders!');
      }
      console.log('✅ All {{ARCHIVE_BASE64}} placeholders replaced');
    }
    
    // Replace ARCHIVE_SIZE
    guiCode = guiCode.replace(/\{\{ARCHIVE_SIZE\}\}/g, String(archiveSize));
    
    // Replace APP_NAME
    guiCode = guiCode.replace(/\{\{APP_NAME\}\}/g, appNameSafe);
    
    // Validate that all placeholders were replaced
    const hasArchivePlaceholder = guiCode.includes('{{ARCHIVE_BASE64}}');
    const hasSizePlaceholder = guiCode.includes('{{ARCHIVE_SIZE}}');
    const hasAppNamePlaceholder = guiCode.includes('{{APP_NAME}}');
    
    if (hasArchivePlaceholder || hasSizePlaceholder || hasAppNamePlaceholder) {
      console.error('❌ ERROR: Some placeholders were not replaced!');
      if (hasArchivePlaceholder) {
        const pos = guiCode.indexOf('{{ARCHIVE_BASE64}}');
        console.error('  - {{ARCHIVE_BASE64}} still present at position:', pos);
        console.error('  - Context:', guiCode.substring(Math.max(0, pos - 50), pos + 100));
      }
      if (hasSizePlaceholder) {
        console.error('  - {{ARCHIVE_SIZE}} still present');
      }
      if (hasAppNamePlaceholder) {
        console.error('  - {{APP_NAME}} still present');
      }
      throw new Error('Placeholder replacement failed! Cannot create installer.');
      } else {
      console.log('✅ All placeholders replaced successfully');
      // Verify archive data is actually in the code
      if (escapedArchive.length > 0) {
        const archiveInCode = guiCode.includes(escapedArchive.substring(0, 20));
        console.log('✅ Archive data verified in generated code:', archiveInCode);
      }
    }
    
    return guiCode;
  }

  /**
   * Create the final executable using pkg
   */
  async createExtractorExecutable(extractorPath, outputName, archiveSize = 0) {
    console.log("📦 Installing required packages...");

    // Install required packages with spinner
    const installSpinner = ora("📦 Installing required packages...").start();
    try {
      execSync("npm install -g pkg", { stdio: "inherit" });
      installSpinner.succeed("✅ Packages installed successfully");
  } catch (error) {
      installSpinner.fail("⚠️  pkg already installed or failed to install");
    }

    // Sanitize the output name for the file system
    const sanitizedOutputName = outputName
      .replace(/[<>:"/\\|?*]/g, "") // Remove invalid filename characters
      .replace(/'/g, "") // Remove apostrophes
      .replace(/\s+/g, "_") // Replace spaces with underscores
      .trim();

    const outputPath = path.join(this.config.outputDir, sanitizedOutputName);
    const absoluteOutputPath = path.resolve(process.cwd(), outputPath);
    
    // Check if output path is a UNC path (network drive)
    // pkg cannot write directly to UNC paths, so we need to write to a local temp location first
    const isUncPath = absoluteOutputPath.startsWith('\\\\') || absoluteOutputPath.startsWith('//');
    let tempOutputPath = absoluteOutputPath;
    let finalOutputPath = absoluteOutputPath;
    
    if (isUncPath) {
      // Use local temp directory for pkg to write to
      const tempFileName = `${sanitizedOutputName}-${Date.now()}.exe`;
      tempOutputPath = path.join(os.tmpdir(), tempFileName);
      console.log('📡 Network drive detected. Writing to local temp location first...');
      console.log(`   Temp location: ${tempOutputPath}`);
      console.log(`   Final location: ${finalOutputPath}`);
    }

    // Build pkg command with enhanced options
    // Note: Using package.json in tempDir to ensure proper configuration
    const tempDir = path.dirname(extractorPath);
    const extractorFileName = path.basename(extractorPath);
    const originalCwd = process.cwd();
    
    // Use absolute path for output, but relative path for extractor (pkg will run from tempDir)
    const pkgCommand = [
      "pkg",
      extractorFileName,  // Use just filename since we'll run from tempDir
      "--output",
      tempOutputPath,  // Use temp path (local) for pkg to write to
      "--target",
      "node18-win-x64",
      "--compress",
      "Brotli",
      "--options",
      "max_old_space_size=4096",
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

    // Package the extractor with pkg
    const pkgSpinner = ora("📦 Creating executable...").start();
    let localPkgTempDir = null; // Declare outside try block for cleanup in finally
    try {
      // Create a .pkgignore file to prevent pkg from including the original template file
      // This ensures pkg only bundles extractor.js and doesn't include any external files
      const pkgIgnorePath = path.join(tempDir, '.pkgignore');
      const templateAbsPath = path.resolve(originalCwd, 'installer-gui-template.js');
      const templateRelPath = path.relative(tempDir, templateAbsPath);
      // Write ignore patterns - exclude unnecessary dependencies and files
      // This reduces executable size by preventing pkg from bundling unused modules
      // The extractor only uses Node.js built-in modules (fs, path, os, child_process)
      // so we can exclude all npm dependencies
      const ignorePatterns = [
        'installer-gui-template.js',
        '**/installer-gui-template.js',
        templateRelPath.replace(/\\/g, '/'), // Normalize path separators
        templateAbsPath.replace(/\\/g, '/'),
        // Exclude all npm dependencies - extractor uses only built-in Node.js modules
        '**/node_modules/**',
        // Exclude test files and documentation
        '**/*.test.js',
        '**/*.spec.js',
        '**/test/**',
        '**/tests/**',
        '**/__tests__/**',
        '**/*.md',
        '**/README*',
        '**/CHANGELOG*',
        '**/LICENSE*',
        '**/*.d.ts',
        '**/.git/**',
        '**/.github/**',
      ].filter(p => p && !p.startsWith('..')); // Filter out invalid relative paths
      fs.writeFileSync(pkgIgnorePath, ignorePatterns.join('\n') + '\n');
      console.log('Created .pkgignore to exclude unnecessary files and reduce size');
      
      // Verify extractor file exists
      if (!fs.existsSync(extractorPath)) {
        throw new Error(`Extractor file not found: ${extractorPath}`);
      }
      console.log(`✅ Extractor file verified: ${extractorPath}`);
      
      // Check if pkg is available
      try {
        const pkgVersion = execSync("pkg --version", { 
          stdio: "pipe",
          encoding: "utf8"
        }).trim();
        console.log(`✅ pkg version: ${pkgVersion}`);
      } catch (pkgCheckError) {
        throw new Error(
          "pkg is not installed or not found in PATH. " +
          "Please install it with: npm install -g pkg"
        );
      }
      
      // Check if tempDir is on a network drive - if so, copy files to local temp and run from there
      const isTempDirUnc = tempDir.startsWith('\\\\') || tempDir.startsWith('//');
      let pkgWorkingDir = tempDir;
      
      if (isTempDirUnc) {
        // Create a local temp directory for pkg to work from
        localPkgTempDir = path.join(os.tmpdir(), `pkg-work-${Date.now()}`);
        fs.mkdirSync(localPkgTempDir, { recursive: true });
        console.log(`📡 Network drive detected for working directory. Using local temp: ${localPkgTempDir}`);
        
        // Copy necessary files to local temp directory
        const filesToCopy = [
          { src: extractorPath, dest: path.join(localPkgTempDir, extractorFileName) },
          { src: path.join(tempDir, 'package.json'), dest: path.join(localPkgTempDir, 'package.json') },
          { src: path.join(tempDir, '.pkgignore'), dest: path.join(localPkgTempDir, '.pkgignore') }
        ];
        
        for (const file of filesToCopy) {
          if (fs.existsSync(file.src)) {
            fs.copyFileSync(file.src, file.dest);
            console.log(`   Copied: ${path.basename(file.src)}`);
          }
        }
        
        pkgWorkingDir = localPkgTempDir;
      }
      
      console.log(`\n🔧 Running pkg from: ${pkgWorkingDir}`);
      console.log(`   Extractor: ${extractorFileName}`);
      console.log(`   Output: ${tempOutputPath}`);
      
      // Run pkg from working directory
      const originalCwdForPkg = process.cwd();
      process.chdir(pkgWorkingDir);
      try {
        // Build command using relative path from pkgWorkingDir
        // Quote paths that might contain spaces
        const quotePath = (p) => {
          if (p.includes(' ') || p.includes('"')) {
            return `"${p.replace(/"/g, '\\"')}"`;
          }
          return p;
        };
        
        const pkgCmdParts = [
          "pkg",
          extractorFileName,  // Relative to pkgWorkingDir
          "--output",
          quotePath(tempOutputPath),  // Use temp path (local) for pkg
          "--target",
          "node18-win-x64",
          "--compress",
          "Brotli",
          "--options",
          "max_old_space_size=4096",
        ];
        
        const pkgCmd = pkgCmdParts.join(' ');
        
        try {
          // Capture output to get better error messages
          let pkgOutput = '';
          let pkgError = '';
          try {
            pkgOutput = execSync(pkgCmd, { 
              stdio: "pipe",
              cwd: pkgWorkingDir,
              env: process.env,
              encoding: 'utf8'
            });
            // If successful, output might be empty, so show it anyway
            if (pkgOutput) {
              console.log(pkgOutput);
            }
          } catch (pkgExecError) {
            pkgError = pkgExecError.stderr ? pkgExecError.stderr.toString() : '';
            pkgOutput = pkgExecError.stdout ? pkgExecError.stdout.toString() : '';
            
            // Show the error output
            if (pkgError) {
              console.error('pkg stderr:', pkgError);
            }
            if (pkgOutput) {
              console.log('pkg stdout:', pkgOutput);
            }
            
            const errorMsg = pkgExecError.message || String(pkgExecError);
            let detailedError = `pkg command failed:\n  Command: ${pkgCmd}\n`;
            if (pkgError) detailedError += `  Error: ${pkgError}\n`;
            if (pkgOutput) detailedError += `  Output: ${pkgOutput}\n`;
            detailedError += `  Message: ${errorMsg}\n`;
            detailedError += `  Working directory: ${pkgWorkingDir}\n`;
            detailedError += `  Extractor file exists: ${fs.existsSync(path.join(pkgWorkingDir, extractorFileName))}`;
            
            throw new Error(detailedError);
          }
        } catch (pkgError) {
          // Re-throw with context
          throw pkgError;
        }
        
        // Small delay to ensure file is fully written and not locked
        await new Promise(resolve => setTimeout(resolve, 1000));
        
        // Determine the executable path (pkg adds .exe extension automatically)
        let executablePath = tempOutputPath;
        if (!executablePath.endsWith('.exe')) {
          executablePath += '.exe';
        }
        
        // Convert executable from console to windowed application (hide console window)
        // Use rcedit to change subsystem from CONSOLE to WINDOWS
        if (process.platform === 'win32') {
          
          console.log('Looking for executable at:', executablePath);
          console.log('File exists:', fs.existsSync(executablePath));
          
          if (!fs.existsSync(executablePath)) {
            console.warn('⚠️  Warning: Executable not found at:', executablePath);
            console.warn('Trying alternative paths...');
            // Try without .exe extension
            const altPath = executablePath.replace(/\.exe$/, '');
            if (fs.existsSync(altPath)) {
              executablePath = altPath;
              console.log('Found executable at:', executablePath);
} else {
              console.warn('Cannot modify subsystem. Console window will appear.');
              console.warn('Searched paths:', [executablePath, altPath]);
            }
          }
          
          if (fs.existsSync(executablePath)) {
            pkgSpinner.text = '🔧 Converting to windowed application...';
            let subsystemChanged = false;
            
            console.log('Modifying executable subsystem:', executablePath);
            console.log('File size:', fs.statSync(executablePath).size, 'bytes');
            
            // Method 1: Try PowerShell PE header modification (most reliable)
            try {
              console.log('Using PowerShell to modify PE header...');
                const psScript = `
$filePath = "${executablePath.replace(/\\/g, '\\\\')}"
try {
  $bytes = [System.IO.File]::ReadAllBytes($filePath)
  $peOffset = [BitConverter]::ToInt32($bytes, 60)
  if ($peOffset -lt $bytes.Length - 100) {
    $subsystemOffset = $peOffset + 92
    if ($subsystemOffset -lt $bytes.Length) {
      $currentSubsystem = $bytes[$subsystemOffset]
      if ($currentSubsystem -eq 3) {
        $bytes[$subsystemOffset] = 2
        [System.IO.File]::WriteAllBytes($filePath, $bytes)
        Write-Output "SUCCESS: Changed subsystem from 3 (CONSOLE) to 2 (WINDOWS)"
    } else {
        Write-Output "INFO: Subsystem is already $currentSubsystem (not CONSOLE)"
      }
    }
  }
} catch {
  Write-Error "Failed: $_"
  exit 1
}
                `.trim();
                const tempPs = path.join(os.tmpdir(), `set-subsystem-${Date.now()}.ps1`);
                fs.writeFileSync(tempPs, psScript, 'utf8');
                const result = execSync(`powershell -NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File "${tempPs}"`, {
                  encoding: 'utf8',
                  timeout: 5000,
                  windowsHide: true
                });
                console.log('PowerShell result:', result.trim());
                subsystemChanged = true;
                setTimeout(() => {
                  try { if (fs.existsSync(tempPs)) fs.unlinkSync(tempPs); } catch (e) {}
                }, 1000);
        } catch (psError) {
                console.error('❌ PowerShell method failed!');
                console.error('PowerShell error:', psError.message);
                if (psError.stdout) console.error('stdout:', psError.stdout);
                if (psError.stderr) console.error('stderr:', psError.stderr);
                
                // Fallback: Try rcedit module
                console.log('Trying rcedit as fallback...');
                try {
                  const rcedit = require('rcedit');
                  await rcedit(executablePath, {
                    'set-subsystem': 'windows'
                  });
                  subsystemChanged = true;
                  console.log('✅ Converted executable to windowed application using rcedit (fallback)');
                } catch (rceditError) {
                  console.error('❌ Both PowerShell and rcedit methods failed!');
                  console.error('rcedit error:', rceditError.message);
                  console.error('The executable will show a console window.');
                }
              }
            
            // Verify the change worked
            if (subsystemChanged) {
              // Wait a bit for file system to sync
              await new Promise(resolve => setTimeout(resolve, 200));
              try {
                const verifyScript = `
$filePath = "${executablePath.replace(/\\/g, '\\\\')}"
$bytes = [System.IO.File]::ReadAllBytes($filePath)
$peOffset = [BitConverter]::ToInt32($bytes, 60)
$subsystemOffset = $peOffset + 92
$subsystem = $bytes[$subsystemOffset]
if ($subsystem -eq 2) {
  Write-Output "VERIFIED: Subsystem is WINDOWS (2)"
        } else {
  Write-Output "WARNING: Subsystem is $subsystem (expected 2 for WINDOWS)"
}
                `.trim();
                const verifyPs = path.join(os.tmpdir(), `verify-subsystem-${Date.now()}.ps1`);
                fs.writeFileSync(verifyPs, verifyScript, 'utf8');
                const verifyResult = execSync(`powershell -NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File "${verifyPs}"`, {
                  encoding: 'utf8',
                  timeout: 2000,
                  windowsHide: true
                });
                console.log('Verification:', verifyResult.trim());
  setTimeout(() => {
                  try { if (fs.existsSync(verifyPs)) fs.unlinkSync(verifyPs); } catch (e) {}
                }, 1000);
              } catch (verifyError) {
                // Ignore verification errors
              }
      } else {
              console.warn('⚠️  Warning: Subsystem modification was not successful. Console window will appear.');
            }
          }
        }
        
        // If we wrote to a temp location (UNC path), copy to final network location
        if (isUncPath && fs.existsSync(executablePath)) {
          pkgSpinner.text = '📡 Copying to network location...';
          console.log(`\n📡 Copying executable to network location...`);
          console.log(`   From: ${executablePath}`);
          
          // Ensure final output path has .exe extension
          if (!finalOutputPath.endsWith('.exe')) {
            finalOutputPath += '.exe';
          }
          
          console.log(`   To: ${finalOutputPath}`);
          
          // Ensure the destination directory exists
          const finalDir = path.dirname(finalOutputPath);
          if (!fs.existsSync(finalDir)) {
            fs.mkdirSync(finalDir, { recursive: true });
          }
          
          // Copy the file
          fs.copyFileSync(executablePath, finalOutputPath);
          console.log('✅ Successfully copied to network location');
          
          // Clean up temp file
          try {
            fs.unlinkSync(executablePath);
            console.log('🧹 Cleaned up temp file');
          } catch (cleanupError) {
            console.warn('⚠️  Warning: Could not delete temp file:', cleanupError.message);
          }
          
          // Update executablePath for branding/return value
          executablePath = finalOutputPath;
        }
      } finally {
        // Restore original working directory
        process.chdir(originalCwd);
        
        // Clean up local temp directory if we created one
        if (localPkgTempDir && fs.existsSync(localPkgTempDir)) {
          try {
            fs.rmSync(localPkgTempDir, { recursive: true, force: true });
            console.log('🧹 Cleaned up local pkg temp directory');
          } catch (cleanupError) {
            console.warn('⚠️  Warning: Could not delete local pkg temp directory:', cleanupError.message);
          }
        }
      }
      
      pkgSpinner.succeed("✅ Executable created successfully");
    } catch (error) {
      pkgSpinner.fail("❌ Executable creation failed");
      throw error;
    }

    // Post-process the executable if needed
    if (this.config.branding) {
      const brandingPath = isUncPath ? finalOutputPath : outputPath;
      await this.applyBranding(brandingPath);
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
   * Cleanup temporary files with retry logic for locked files
   */
  async cleanup(tempDir) {
    if (!fs.existsSync(tempDir)) {
      return;
    }
    
    // Retry cleanup with exponential backoff
    const maxRetries = 5;
    const baseDelay = 500; // Start with 500ms delay
    
    for (let attempt = 0; attempt < maxRetries; attempt++) {
      try {
        // Try to remove files individually first (more reliable on Windows)
        try {
          const files = fs.readdirSync(tempDir);
          for (const file of files) {
            const filePath = path.join(tempDir, file);
            try {
              const stat = fs.statSync(filePath);
              if (stat.isDirectory()) {
                fs.rmSync(filePath, { recursive: true, force: true });
              } else {
                fs.unlinkSync(filePath);
              }
            } catch (fileError) {
              // Ignore individual file errors, try to continue
              console.warn(`⚠️  Could not delete ${file}: ${fileError.message}`);
            }
          }
        } catch (readError) {
          // If we can't read the directory, try to remove it anyway
        }
        
        // Now try to remove the directory itself
      fs.rmSync(tempDir, { recursive: true, force: true });
        return; // Success!
      } catch (error) {
        const isLastAttempt = attempt === maxRetries - 1;
        
        if (error.code === 'EBUSY' || error.code === 'ENOTEMPTY' || error.code === 'EPERM') {
          if (isLastAttempt) {
            // On final attempt, just warn and continue
            console.warn(`⚠️  Warning: Could not fully clean up temp directory: ${tempDir}`);
            console.warn(`   Error: ${error.message}`);
            console.warn(`   You may need to manually delete: ${tempDir}`);
            return;
          }
          
          // Wait before retrying (exponential backoff)
          const delay = baseDelay * Math.pow(2, attempt);
          console.log(`⏳ Temp directory locked, retrying in ${delay}ms... (attempt ${attempt + 1}/${maxRetries})`);
          await new Promise(resolve => setTimeout(resolve, delay));
        } else {
          // For other errors, don't retry
          console.warn(`⚠️  Warning: Could not clean up temp directory: ${error.message}`);
          return;
        }
      }
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
  --folder <path>       - Mod folder to package (simplified option, recommended)
  --files <pattern>     - Files to include (can specify multiple, advanced)
  --folders <pattern>   - Folders to include (can specify multiple, advanced)
  --output-name <name>  - Name of the output executable
  --app-name <name>     - Application name
  --version <version>   - Version number
  --config <file>       - Use configuration file (JSON)
  --silent-mode         - Create silent installer (no user prompts)
  --extract-path <path> - Default extraction path for silent mode

Examples:
  node pack-files.js --folder "./my-mod" --output-name "MyMod"
  node pack-files.js --folder "./mods/my-mod" --app-name "MyMod" --version "1.0.0"
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
  for (let i = 0; i < args.length; i++) {
    const key = args[i].replace("--", "");

    if (key === "silent-mode") {
      options[key] = true;
    } else if (key === "folder") {
      // Simplified option: single folder
      options.folders = [args[i + 1]];
      options.files = [];
      i++; // Skip the value
    } else if (key === "files" || key === "folders") {
      if (!options[key]) options[key] = [];
      options[key].push(args[i + 1]);
      i++; // Skip the value
    } else if (i + 1 < args.length && !args[i + 1].startsWith("--")) {
      options[key] = args[i + 1];
      i++; // Skip the value
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
  const packerConfig = {
    ...finalConfig,
    silentMode: options["silent-mode"] || false,
    defaultExtractPath: options["extract-path"] || null,
  };
  const packer = new FilePacker(packerConfig);

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
