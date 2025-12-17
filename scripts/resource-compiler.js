const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const os = require('os');

/**
 * Windows Resource Compiler utility
 * Detects and uses rc.exe to compile .rc files to .res files
 */
class ResourceCompiler {
  constructor() {
    this.rcPath = null;
  }

  /**
   * Detect Windows Resource Compiler (rc.exe)
   */
  detectRC() {
    // Check if already detected
    if (this.rcPath && fs.existsSync(this.rcPath)) {
      return { path: this.rcPath, type: 'detected' };
    }

    // Try to find rc.exe in PATH
    try {
      execSync('rc.exe /?', { stdio: 'ignore', timeout: 2000 });
      this.rcPath = 'rc.exe';
      return { path: 'rc.exe', type: 'path' };
    } catch (e) {
      // Not in PATH, try common locations
    }

    // Check Windows SDK locations
    const programFiles = process.env['ProgramFiles(x86)'] || process.env.ProgramFiles || 'C:\\Program Files (x86)';
    const windowsKitsPath = path.join(programFiles, 'Windows Kits', '10', 'bin');
    
    if (fs.existsSync(windowsKitsPath)) {
      // Find latest version
      const versions = fs.readdirSync(windowsKitsPath)
        .filter(dir => /^\d+\.\d+/.test(dir))
        .sort((a, b) => {
          const aParts = a.split('.').map(Number);
          const bParts = b.split('.').map(Number);
          for (let i = 0; i < Math.max(aParts.length, bParts.length); i++) {
            const aVal = aParts[i] || 0;
            const bVal = bParts[i] || 0;
            if (aVal !== bVal) return bVal - aVal;
          }
          return 0;
        });

      for (const version of versions) {
        const rcPath = path.join(windowsKitsPath, version, 'x64', 'rc.exe');
        if (fs.existsSync(rcPath)) {
          this.rcPath = rcPath;
          return { path: rcPath, type: 'windows-sdk' };
        }
      }
    }

    // Check Visual Studio locations
    const vsPath = path.join(programFiles, 'Microsoft Visual Studio');
    if (fs.existsSync(vsPath)) {
      const vsVersions = fs.readdirSync(vsPath)
        .filter(dir => /^\d{4}/.test(dir))
        .sort()
        .reverse();

      for (const vsVersion of vsVersions) {
        const vcPath = path.join(vsPath, vsVersion, 'VC', 'Tools', 'MSVC');
        if (fs.existsSync(vcPath)) {
          const msvcVersions = fs.readdirSync(vcPath)
            .sort()
            .reverse();

          for (const msvcVersion of msvcVersions) {
            const rcPath = path.join(vcPath, msvcVersion, 'bin', 'Hostx64', 'x64', 'rc.exe');
            if (fs.existsSync(rcPath)) {
              this.rcPath = rcPath;
              return { path: rcPath, type: 'visual-studio' };
            }
          }
        }
      }
    }

    return null;
  }

  /**
   * Detect MinGW windres (resource compiler for MinGW)
   */
  detectWindres() {
    try {
      // Try to find windres.exe in PATH
      try {
        execSync('windres.exe --version', { stdio: 'ignore', timeout: 2000 });
        return { path: 'windres.exe', type: 'path' };
      } catch (e) {
        // Not in PATH, try common MinGW locations
        const mingwPaths = [
          'C:\\msys64\\ucrt64\\bin\\windres.exe',
          'C:\\msys64\\mingw64\\bin\\windres.exe',
          'C:\\msys64\\clang64\\bin\\windres.exe',
          'C:\\MinGW\\bin\\windres.exe',
          'C:\\MinGW64\\bin\\windres.exe',
        ];

        for (const mingwPath of mingwPaths) {
          if (fs.existsSync(mingwPath)) {
            return { path: mingwPath, type: 'mingw' };
          }
        }
      }
    } catch (e) {
      // windres not found
    }
    
    return null;
  }

  /**
   * Compile .rc file to .res file (MSVC) or .o file (MinGW)
   * Returns object with { path, type: 'res' | 'o' }
   */
  async compileResource(rcFilePath, outputDir = null, compilerType = 'auto') {
    const rcPath = path.resolve(rcFilePath);
    const rcDir = path.dirname(rcPath);
    const rcName = path.basename(rcPath, '.rc');
    const resOutputDir = outputDir || rcDir;
    
    // Determine which resource compiler to use
    let useWindres = false;
    let resourceCompiler = null;
    
    if (compilerType === 'mingw' || (compilerType === 'auto' && this.detectWindres())) {
      // Use windres for MinGW
      resourceCompiler = this.detectWindres();
      if (resourceCompiler) {
        useWindres = true;
      }
    }
    
    if (!useWindres) {
      // Use rc.exe for MSVC
      resourceCompiler = this.detectRC();
      if (!resourceCompiler) {
        throw new Error(
          'Windows Resource Compiler not found.\n' +
          'Please install:\n' +
          '  - Windows SDK (includes rc.exe)\n' +
          '  - Visual Studio (with C++ tools)\n' +
          '  - MinGW-w64 (includes windres.exe)\n' +
          '\nOr ensure rc.exe or windres.exe is in your PATH.'
        );
      }
    }
    
    // Output file path (.res for MSVC, .o for MinGW)
    const outputExtension = useWindres ? '.o' : '.res';
    const resourcePath = path.join(resOutputDir, rcName + outputExtension);

    // Ensure output directory exists
    if (!fs.existsSync(resOutputDir)) {
      fs.mkdirSync(resOutputDir, { recursive: true });
    }

    let compileCommand;
    if (useWindres) {
      // MinGW windres: windres.exe -i input.rc -o output.o
      compileCommand = `"${resourceCompiler.path}" -i "${rcPath}" -o "${resourcePath}"`;
      console.log(`   Running: ${path.basename(resourceCompiler.path)} -i "${path.basename(rcPath)}" -o "${path.basename(resourcePath)}"`);
    } else {
      // MSVC rc.exe: rc.exe /fo output.res input.rc
      compileCommand = `"${resourceCompiler.path}" /fo "${resourcePath}" "${rcPath}"`;
      console.log(`   Running: ${path.basename(resourceCompiler.path)} /fo "${path.basename(resourcePath)}" "${path.basename(rcPath)}"`);
    }

    try {
      // Capture output to check for errors
      let stdout = '';
      let stderr = '';
      let errorOutput = '';
      
      try {
        const result = execSync(compileCommand, {
          stdio: ['ignore', 'pipe', 'pipe'],
          shell: true,
          cwd: rcDir,
          encoding: 'utf8'
        });
        stdout = result.toString();
      } catch (compileError) {
        stdout = compileError.stdout ? compileError.stdout.toString() : '';
        stderr = compileError.stderr ? compileError.stderr.toString() : '';
        errorOutput = stdout + (stderr ? '\n' + stderr : '');
        if (compileError.message) {
          errorOutput += '\n' + compileError.message;
        }
        
        // If there's an error, show it but check if file was still created
        if (errorOutput.trim()) {
          console.warn('   Resource compiler output:', errorOutput.substring(0, 500));
        }
      }

      // Check if resource file was created (wait a bit for file system to sync)
      let attempts = 0;
      while (!fs.existsSync(resourcePath) && attempts < 10) {
        await new Promise(resolve => setTimeout(resolve, 100));
        attempts++;
      }

      if (!fs.existsSync(resourcePath)) {
        const errorMsg = errorOutput ? `\nCompiler output: ${errorOutput.substring(0, 500)}` : '';
        throw new Error(`Resource compilation failed - ${outputExtension} file was not created at: ${resourcePath}${errorMsg}`);
      }

      const resStats = fs.statSync(resourcePath);
      console.log(`   Resource file size: ${(resStats.size / 1024 / 1024).toFixed(2)} MB`);
      
      return { path: resourcePath, type: useWindres ? 'o' : 'res' };
    } catch (error) {
      throw new Error(`Resource compilation failed: ${error.message}`);
    }
  }
}

module.exports = ResourceCompiler;

