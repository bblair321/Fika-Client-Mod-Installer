#!/usr/bin/env node

/**
 * C++ Compiler Detection and Compilation Utilities
 * Supports MSVC and MinGW compilers
 */

const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const os = require('os');

class CppCompiler {
  constructor() {
    this.compilerType = null;
    this.compilerPath = null;
  }

  /**
   * Detect available C++ compiler
   */
  detectCompiler(preferred = 'auto') {
    if (preferred === 'msvc') {
      return this.detectMSVC();
    } else if (preferred === 'mingw') {
      return this.detectMinGW();
    } else {
      // Auto-detect: try MSVC first, then MinGW
      const msvc = this.detectMSVC();
      if (msvc) return msvc;
      
      const mingw = this.detectMinGW();
      if (mingw) return mingw;
      
      return null;
    }
  }

  /**
   * Detect MSVC compiler
   */
  detectMSVC() {
    try {
      // Try to find cl.exe in PATH
      try {
        execSync('cl.exe /?', { stdio: 'ignore', timeout: 2000 });
        this.compilerType = 'msvc';
        this.compilerPath = 'cl.exe';
        return { type: 'msvc', path: 'cl.exe' };
      } catch (e) {
        // Not in PATH, try common Visual Studio locations
        const vsPaths = [
          'C:\\Program Files\\Microsoft Visual Studio\\2022\\Community\\VC\\Tools\\MSVC',
          'C:\\Program Files\\Microsoft Visual Studio\\2022\\Professional\\VC\\Tools\\MSVC',
          'C:\\Program Files\\Microsoft Visual Studio\\2022\\Enterprise\\VC\\Tools\\MSVC',
          'C:\\Program Files (x86)\\Microsoft Visual Studio\\2019\\Community\\VC\\Tools\\MSVC',
          'C:\\Program Files (x86)\\Microsoft Visual Studio\\2019\\Professional\\VC\\Tools\\MSVC',
          'C:\\Program Files (x86)\\Microsoft Visual Studio\\2019\\Enterprise\\VC\\Tools\\MSVC',
        ];

        for (const vsPath of vsPaths) {
          if (fs.existsSync(vsPath)) {
            // Find latest version
            const versions = fs.readdirSync(vsPath)
              .filter(f => fs.statSync(path.join(vsPath, f)).isDirectory())
              .sort()
              .reverse();
            
            if (versions.length > 0) {
              const clPath = path.join(vsPath, versions[0], 'bin', 'Hostx64', 'x64', 'cl.exe');
              if (fs.existsSync(clPath)) {
                this.compilerType = 'msvc';
                this.compilerPath = clPath;
                return { type: 'msvc', path: clPath };
              }
            }
          }
        }
      }
    } catch (e) {
      // MSVC not found
    }
    
    return null;
  }

  /**
   * Detect MinGW compiler
   */
  detectMinGW() {
    try {
      // Try to find g++.exe in PATH
      try {
        execSync('g++.exe --version', { stdio: 'ignore', timeout: 2000 });
        this.compilerType = 'mingw';
        this.compilerPath = 'g++.exe';
        return { type: 'mingw', path: 'g++.exe' };
      } catch (e) {
        // Not in PATH, try common MinGW locations (including MSYS2)
        const mingwPaths = [
          'C:\\msys64\\ucrt64\\bin\\g++.exe',  // MSYS2 UCRT64 (most common)
          'C:\\msys64\\mingw64\\bin\\g++.exe', // MSYS2 MinGW64
          'C:\\msys64\\clang64\\bin\\g++.exe', // MSYS2 Clang64
          'C:\\MinGW\\bin\\g++.exe',
          'C:\\MinGW64\\bin\\g++.exe',
          'C:\\Program Files\\MinGW\\bin\\g++.exe',
          'C:\\Program Files (x86)\\MinGW\\bin\\g++.exe',
          path.join(os.homedir(), 'MinGW', 'bin', 'g++.exe'),
        ];

        for (const mingwPath of mingwPaths) {
          if (fs.existsSync(mingwPath)) {
            this.compilerType = 'mingw';
            this.compilerPath = mingwPath;
            console.log('✅ Found MinGW at:', mingwPath);
            return { type: 'mingw', path: mingwPath };
          }
        }
      }
    } catch (e) {
      // MinGW not found
    }
    
    return null;
  }

  /**
   * Compile C++ source to executable
   */
  async compile(sourceFile, outputFile, options = {}) {
    console.log('🔍 Detecting compiler with preferred:', options.preferredCompiler || 'auto');
    const compiler = this.detectCompiler(options.preferredCompiler || 'auto');
    
    if (!compiler) {
      // Try to get PATH for debugging
      const currentPath = process.env.PATH || '';
      console.error('❌ Compiler detection failed. Current PATH:', currentPath.substring(0, 300));
      throw new Error(
        'No C++ compiler found. Please install:\n' +
        '  - Microsoft Visual Studio (with C++ tools)\n' +
        '  - MinGW-w64\n' +
        '\nOr ensure cl.exe or g++.exe is in your PATH.\n' +
        'Current PATH: ' + (currentPath.includes('msys64') ? 'Contains msys64' : 'Does not contain msys64')
      );
    }
    
    console.log('✅ Compiler detected:', compiler.type, 'at', compiler.path);

    const sourcePath = path.resolve(sourceFile);
    const outputPath = path.resolve(outputFile);
    const outputDir = path.dirname(outputPath);
    const outputName = path.basename(outputPath, path.extname(outputPath));

    // Ensure output directory exists
    if (!fs.existsSync(outputDir)) {
      fs.mkdirSync(outputDir, { recursive: true });
    }

    if (compiler.type === 'msvc') {
      return this.compileMSVC(sourcePath, outputPath, compiler.path, options);
    } else if (compiler.type === 'mingw') {
      return this.compileMinGW(sourcePath, outputPath, compiler.path, options);
    } else {
      throw new Error('Unknown compiler type');
    }
  }

  /**
   * Compile with MSVC
   */
  compileMSVC(sourcePath, outputPath, clPath, options = {}) {
    const outputDir = path.dirname(outputPath);
    const outputName = path.basename(outputPath, '.exe');
    
    // MSVC command: cl.exe /EHsc /O2 /MT source.cpp /link /SUBSYSTEM:WINDOWS /OUT:output.exe
    const clCommand = [
      `"${clPath}"`,
      '/EHsc',           // Exception handling
      '/O2',             // Optimize for speed
      '/MT',             // Multi-threaded static runtime
      '/W3',             // Warning level 3
      `"${sourcePath}"`,
      '/link',
      '/SUBSYSTEM:WINDOWS',  // Windows subsystem (no console)
      `/OUT:"${outputPath}"`,
      '/NOLOGO'          // Suppress copyright banner
    ].join(' ');

    try {
      // For MSVC, we may need to set up the environment
      // Try to find vcvarsall.bat
      const vsPaths = [
        'C:\\Program Files\\Microsoft Visual Studio\\2022\\Community\\VC\\Auxiliary\\Build\\vcvarsall.bat',
        'C:\\Program Files\\Microsoft Visual Studio\\2022\\Professional\\VC\\Auxiliary\\Build\\vcvarsall.bat',
        'C:\\Program Files\\Microsoft Visual Studio\\2022\\Enterprise\\VC\\Auxiliary\\Build\\vcvarsall.bat',
        'C:\\Program Files (x86)\\Microsoft Visual Studio\\2019\\Community\\VC\\Auxiliary\\Build\\vcvarsall.bat',
        'C:\\Program Files (x86)\\Microsoft Visual Studio\\2019\\Professional\\VC\\Auxiliary\\Build\\vcvarsall.bat',
        'C:\\Program Files (x86)\\Microsoft Visual Studio\\2019\\Enterprise\\VC\\Auxiliary\\Build\\vcvarsall.bat',
      ];

      let vcvarsPath = null;
      for (const vsPath of vsPaths) {
        if (fs.existsSync(vsPath)) {
          vcvarsPath = vsPath;
          break;
        }
      }

      if (vcvarsPath) {
        // Use vcvarsall to set up environment, then compile
        const fullCommand = `"${vcvarsPath}" x64 && ${clCommand}`;
        execSync(fullCommand, { 
          stdio: 'inherit',
          shell: true,
          cwd: outputDir
        });
      } else {
        // Try direct compilation (may work if environment is already set)
        execSync(clCommand, { 
          stdio: 'inherit',
          shell: true,
          cwd: outputDir
        });
      }

      // Clean up object files
      const objFile = path.join(outputDir, path.basename(sourcePath, '.cpp') + '.obj');
      if (fs.existsSync(objFile)) {
        try { fs.unlinkSync(objFile); } catch (e) {}
      }

      return outputPath;
    } catch (error) {
      throw new Error(`MSVC compilation failed: ${error.message}`);
    }
  }

  /**
   * Compile with MinGW
   */
  compileMinGW(sourcePath, outputPath, gppPath, options = {}) {
    const outputDir = path.dirname(outputPath);
    
    // MinGW command: g++.exe -O2 -static -mwindows source.cpp -o output.exe
    const gppCommand = [
      `"${gppPath}"`,
      '-O2',             // Optimize for speed
      '-static',         // Static linking
      '-mwindows',       // Windows subsystem (no console)
      `"${sourcePath}"`,
      '-o',
      `"${outputPath}"`,
      '-s'               // Strip symbols
    ].join(' ');

    try {
      // Capture full error output
      let errorOutput = '';
      try {
        execSync(gppCommand, { 
          stdio: ['ignore', 'pipe', 'pipe'],
          shell: true,
          cwd: outputDir,
          encoding: 'utf8'
        });
      } catch (compileError) {
        errorOutput = compileError.stdout || '';
        if (compileError.stderr) {
          errorOutput += '\n' + compileError.stderr;
        }
        // Also try to get the error message
        if (compileError.message) {
          errorOutput += '\n' + compileError.message;
        }
        // Show first 2000 chars of error for debugging
        console.error('❌ Compilation error (first 2000 chars):');
        console.error(errorOutput.substring(0, 2000));
        throw new Error(`MinGW compilation failed: ${errorOutput.substring(0, 500)}`);
      }

      // Optionally compress with UPX if available
      if (options.compressWithUPX) {
        try {
          this.compressWithUPX(outputPath);
        } catch (upxError) {
          console.warn('⚠️  UPX compression failed (optional):', upxError.message);
          console.warn('   Continuing without compression...');
        }
      }

      return outputPath;
    } catch (error) {
      throw new Error(`MinGW compilation failed: ${error.message}`);
    }
  }

  /**
   * Compress executable with UPX (Ultimate Packer for eXecutables)
   * Can reduce file size by 30-50%, but may trigger antivirus warnings
   */
  compressWithUPX(exePath) {
    try {
      // Check if UPX is available - try PATH first, then common locations
      let upxPath = 'upx';
      let upxFound = false;
      
      try {
        execSync('upx --version', { stdio: 'ignore', timeout: 2000 });
        upxFound = true;
      } catch (e) {
        // Try common installation locations
        const upxPaths = [
          path.join(os.homedir(), 'Tools', 'upx', 'upx.exe'),
          'C:\\Tools\\upx\\upx.exe',
          'C:\\Program Files\\upx\\upx.exe',
          path.join(process.cwd(), 'tools', 'upx', 'upx.exe')
        ];
        
        for (const testPath of upxPaths) {
          if (fs.existsSync(testPath)) {
            upxPath = testPath;
            upxFound = true;
            console.log('✅ Found UPX at:', testPath);
            break;
          }
        }
      }
      
      if (!upxFound) {
        throw new Error('UPX not found in PATH or common locations. Install from https://upx.github.io/');
      }

      console.log('📦 Compressing executable with UPX...');
      const upxCommand = `"${upxPath}" --best --lzma "${exePath}"`;
      
      execSync(upxCommand, { 
        stdio: 'inherit',
        shell: true
      });

      const stats = fs.statSync(exePath);
      const sizeMB = (stats.size / (1024 * 1024)).toFixed(2);
      console.log(`✅ UPX compression complete. Size: ${sizeMB} MB`);
    } catch (error) {
      throw new Error(`UPX compression failed: ${error.message}`);
    }
  }
}

module.exports = CppCompiler;

