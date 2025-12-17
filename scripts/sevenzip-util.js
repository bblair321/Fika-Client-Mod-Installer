const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const os = require('os');

/**
 * 7-Zip utility for creating and extracting 7z archives
 * Provides better compression than ZIP (5-10% improvement)
 */
class SevenZipUtil {
  constructor() {
    this.sevenZipPath = null;
  }

  /**
   * Get compression preset profiles
   * @returns {Object} Preset compression options
   */
  static getPresets() {
    return {
      // Default: Balanced compression and speed
      default: {
        method: 'lzma2',
        dictionarySize: 32,
        solid: true
      },
      // Maximum: Best compression, slower
      maximum: {
        method: 'lzma2',
        dictionarySize: 64,
        solid: true,
        wordSize: 273,
        fastBytes: 128,
        passes: 15
      },
      // Ultra: Extreme compression, very slow
      ultra: {
        method: 'lzma2',
        dictionarySize: 128,
        solid: true,
        wordSize: 273,
        fastBytes: 273,
        passes: 15
      },
      // Fast: Faster compression, slightly larger
      fast: {
        method: 'lzma2',
        dictionarySize: 16,
        solid: true,
        fastBytes: 32
      },
      // PPMd: Good for text files
      ppmd: {
        method: 'ppmd',
        dictionarySize: 32,
        solid: true
      },
      // LZMA: Original algorithm, sometimes better than LZMA2
      lzma: {
        method: 'lzma',
        dictionarySize: 64,
        solid: true,
        wordSize: 273,
        passes: 15
      }
    };
  }

  /**
   * Detect 7-Zip installation (7z.exe)
   */
  detect7z() {
    // Check if already detected
    if (this.sevenZipPath && fs.existsSync(this.sevenZipPath)) {
      return { path: this.sevenZipPath, type: 'detected' };
    }

    // Try to find 7z.exe in PATH
    try {
      execSync('7z.exe', { stdio: 'ignore', timeout: 2000 });
      this.sevenZipPath = '7z.exe';
      return { path: '7z.exe', type: 'path' };
    } catch (e) {
      // Not in PATH, try common locations
    }

    // Check common 7-Zip installation locations
    const sevenZipPaths = [
      'C:\\Program Files\\7-Zip\\7z.exe',
      'C:\\Program Files (x86)\\7-Zip\\7z.exe',
      path.join(os.homedir(), 'AppData', 'Local', 'Programs', '7-Zip', '7z.exe'),
    ];

    for (const zipPath of sevenZipPaths) {
      if (fs.existsSync(zipPath)) {
        this.sevenZipPath = zipPath;
        return { path: zipPath, type: 'installed' };
      }
    }

    return null;
  }

  /**
   * Create 7z archive from files and folders
   * @param {Array} files - Array of file paths
   * @param {Array} folders - Array of folder paths
   * @param {string} outputPath - Output archive path
   * @param {Object} options - Compression options
   * @param {string} options.method - Compression method: 'lzma2' (default), 'lzma', 'ppmd', 'bzip2'
   * @param {number} options.dictionarySize - Dictionary size in MB (default: 32, max: 1536)
   * @param {boolean} options.solid - Use solid archive (default: true, better compression)
   * @param {number} options.wordSize - Word size: 8-273 (default: auto)
   * @param {number} options.fastBytes - Fast bytes: 5-273 (default: 64)
   * @param {number} options.passes - Number of passes: 1-15 (default: auto)
   */
  async create7zArchive(files, folders, outputPath, options = {}) {
    const sevenZipInfo = this.detect7z();
    
    if (!sevenZipInfo) {
      throw new Error(
        '7-Zip (7z.exe) not found.\n' +
        'Please install 7-Zip from https://www.7-zip.org/\n' +
        'Or ensure 7z.exe is in your PATH.'
      );
    }

    // Create temporary file list for 7z
    const tempListFile = path.join(path.dirname(outputPath), '7z-filelist-' + Date.now() + '.txt');
    const fileList = [];

    // Add files
    files.forEach(file => {
      if (fs.existsSync(file)) {
        const absPath = path.resolve(file);
        fileList.push(absPath);
      }
    });

    // Add folders
    folders.forEach(folder => {
      if (fs.existsSync(folder)) {
        const absPath = path.resolve(folder);
        fileList.push(absPath);
      }
    });

    if (fileList.length === 0) {
      throw new Error('No files or folders to archive');
    }

    // Write file list
    fs.writeFileSync(tempListFile, fileList.join('\n'), 'utf8');

    try {
      // Default compression options
      const compressionOptions = {
        method: options.method || 'lzma2',  // lzma2, lzma, ppmd, bzip2
        dictionarySize: options.dictionarySize || 32,  // MB
        solid: options.solid !== false,  // Solid archive (better compression)
        wordSize: options.wordSize || null,  // Auto if null
        fastBytes: options.fastBytes || 64,
        passes: options.passes || null  // Auto if null
      };

      // Build 7z command with advanced compression settings
      const commandParts = [
        `"${sevenZipInfo.path}"`,
        'a',                    // Add to archive
        '-mx=9',                // Maximum compression level
        '-mmt=on',              // Multi-threading
        '-y',                   // Assume yes
      ];

      // Add compression method
      commandParts.push(`-m0=${compressionOptions.method}`);

      // Add dictionary size (in MB, converted to bytes for 7z format: 32m = 32MB)
      const dictSizeMB = Math.min(Math.max(1, compressionOptions.dictionarySize), 1536);
      commandParts.push(`-md=${dictSizeMB}m`);

      // Add solid archive option (better compression for multiple files)
      if (compressionOptions.solid) {
        commandParts.push('-ms=on');
      }

      // Add word size if specified
      if (compressionOptions.wordSize) {
        const wordSize = Math.min(Math.max(8, compressionOptions.wordSize), 273);
        commandParts.push(`-mw=${wordSize}`);
      }

      // Add fast bytes
      if (compressionOptions.fastBytes) {
        const fastBytes = Math.min(Math.max(5, compressionOptions.fastBytes), 273);
        commandParts.push(`-mfb=${fastBytes}`);
      }

      // Add passes if specified (for lzma/lzma2)
      if (compressionOptions.passes && (compressionOptions.method === 'lzma' || compressionOptions.method === 'lzma2')) {
        const passes = Math.min(Math.max(1, compressionOptions.passes), 15);
        commandParts.push(`-mpass=${passes}`);
      }

      // Output and file list
      // Note: 7z requires the file list path to be quoted when using @ prefix
      commandParts.push(`"${outputPath}"`);
      commandParts.push(`@"${tempListFile}"`);

      const sevenZipCommand = commandParts.join(' ');

      const settingsParts = [
        `method=${compressionOptions.method}`,
        `dict=${dictSizeMB}MB`,
        `solid=${compressionOptions.solid ? 'on' : 'off'}`
      ];
      if (compressionOptions.wordSize) settingsParts.push(`wordSize=${compressionOptions.wordSize}`);
      if (compressionOptions.fastBytes) settingsParts.push(`fastBytes=${compressionOptions.fastBytes}`);
      if (compressionOptions.passes) settingsParts.push(`passes=${compressionOptions.passes}`);
      console.log(`📦 7z compression settings: ${settingsParts.join(', ')}`);
      console.log(`   File list: ${tempListFile}`);
      console.log(`   Output: ${outputPath}`);
      console.log(`   Running 7z command (this may take several minutes for high compression presets)...`);
      console.log(`   Please be patient - ultra preset can take 10+ minutes to complete.`);
      
      // Log the actual command for debugging (truncated if too long)
      const cmdPreview = sevenZipCommand.length > 200 
        ? sevenZipCommand.substring(0, 200) + '...' 
        : sevenZipCommand;
      console.log(`   Command: ${cmdPreview}`);
      
      try {
        // execSync will block until 7z completes - this is intentional
        execSync(sevenZipCommand, {
          stdio: 'inherit',
          shell: true,
          cwd: path.dirname(outputPath),
          maxBuffer: 1024 * 1024 * 10 // 10MB buffer for output
        });
        console.log(`   ✅ 7z command completed`);
      } catch (error) {
        // Check if archive was created despite error (sometimes 7z returns non-zero on warnings)
        if (fs.existsSync(outputPath)) {
          const stats = fs.statSync(outputPath);
          if (stats.size > 0) {
            console.log('   ⚠️  7z completed with warnings, but archive was created successfully');
          } else {
            throw new Error(`7z command failed: ${error.message}`);
          }
        } else {
          throw new Error(`7z command failed: ${error.message}`);
        }
      }

      // Wait a moment for file system to sync
      let retries = 0;
      while (!fs.existsSync(outputPath) && retries < 10) {
        await new Promise(resolve => setTimeout(resolve, 500));
        retries++;
      }

      // Verify archive was created
      if (!fs.existsSync(outputPath)) {
        throw new Error('7z archive creation completed but file was not found. The process may still be running.');
      }

      const stats = fs.statSync(outputPath);
      if (stats.size === 0) {
        throw new Error('7z archive was created but is empty');
      }
      
      console.log(`   ✅ Archive created successfully: ${(stats.size / (1024 * 1024)).toFixed(2)} MB`);

      return outputPath;
    } finally {
      // Clean up temp file list
      try {
        if (fs.existsSync(tempListFile)) {
          fs.unlinkSync(tempListFile);
        }
      } catch (e) {
        // Ignore cleanup errors
      }
    }
  }
}

module.exports = SevenZipUtil;

