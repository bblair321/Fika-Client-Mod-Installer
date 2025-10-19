#!/usr/bin/env node

/**
 * Universal Executable Packaging Script
 * Supports multiple packaging methods for different types of applications
 */

const fs = require("fs");
const path = require("path");
const { execSync, spawn } = require("child_process");
const os = require("os");

class ExecutablePackager {
  constructor(config = {}) {
    this.config = {
      // Default configuration
      outputDir: "./dist",
      version: "1.0.0",
      platform: os.platform(),
      arch: os.arch(),
      includeVersion: true,
      ...config,
    };

    this.packageTypes = {
      node: this.packageNodeApp.bind(this),
      electron: this.packageElectronApp.bind(this),
      python: this.packagePythonApp.bind(this),
      web: this.packageWebApp.bind(this),
    };
  }

  /**
   * Main packaging method
   */
  async package(type, options = {}) {
    console.log(`🚀 Starting ${type} packaging process...`);

    const packageMethod = this.packageTypes[type];
    if (!packageMethod) {
      throw new Error(`Unsupported package type: ${type}`);
    }

    try {
      await packageMethod(options);
      console.log(`✅ Successfully packaged ${type} application!`);
    } catch (error) {
      console.error(`❌ Packaging failed: ${error.message}`);
      throw error;
    }
  }

  /**
   * Package Node.js application using pkg
   */
  async packageNodeApp(options = {}) {
    const {
      entryPoint = "./index.js",
      outputName,
      assets = [],
      targets = ["node18-win-x64"],
      ...otherOptions
    } = options;

    console.log("📦 Installing pkg if not available...");
    try {
      execSync("pkg --version", { stdio: "ignore" });
    } catch {
      console.log("Installing pkg globally...");
      execSync("npm install -g pkg", { stdio: "inherit" });
    }

    const outputFileName = outputName || this.generateOutputName("node");
    const pkgCommand = [
      "pkg",
      entryPoint,
      "--out-path",
      this.config.outputDir,
      "--output",
      path.join(this.config.outputDir, outputFileName),
    ];

    // Add targets
    targets.forEach((target) => {
      pkgCommand.push("--target", target);
    });

    // Add assets
    assets.forEach((asset) => {
      pkgCommand.push("--assets", asset);
    });

    console.log(`📦 Running: ${pkgCommand.join(" ")}`);
    execSync(pkgCommand.join(" "), { stdio: "inherit" });

    // Create package.json for pkg if it doesn't exist
    this.createPkgConfig(assets);
  }

  /**
   * Package Electron application using electron-builder
   */
  async packageElectronApp(options = {}) {
    const {
      packageJson = "./package.json",
      outputName,
      ...otherOptions
    } = options;

    console.log("📦 Installing electron-builder if not available...");
    try {
      execSync("electron-builder --version", { stdio: "ignore" });
    } catch {
      console.log("Installing electron-builder...");
      execSync("npm install --save-dev electron-builder", { stdio: "inherit" });
    }

    // Read package.json and update build config
    const pkg = JSON.parse(fs.readFileSync(packageJson, "utf8"));
    const outputFileName = outputName || this.generateOutputName("electron");

    // Update package.json with build configuration
    pkg.build = {
      ...pkg.build,
      artifactName: `${outputFileName}-${this.config.version}.${
        this.config.platform === "win32" ? "exe" : "dmg"
      }`,
      win: {
        target: "nsis",
        arch: [this.config.arch === "x64" ? "x64" : "ia32"],
      },
      mac: {
        target: "dmg",
      },
      linux: {
        target: "AppImage",
      },
      ...otherOptions,
    };

    fs.writeFileSync(packageJson, JSON.stringify(pkg, null, 2));

    // Build the application
    console.log("📦 Building Electron application...");
    execSync("npm run build", { stdio: "inherit" });

    console.log("📦 Packaging Electron application...");
    execSync("electron-builder", { stdio: "inherit" });
  }

  /**
   * Package Python application using PyInstaller
   */
  async packagePythonApp(options = {}) {
    const {
      entryPoint = "./main.py",
      outputName,
      oneFile = true,
      addData = [],
      hiddenImports = [],
      ...otherOptions
    } = options;

    console.log("📦 Installing PyInstaller if not available...");
    try {
      execSync("pyinstaller --version", { stdio: "ignore" });
    } catch {
      console.log("Installing PyInstaller...");
      execSync("pip install pyinstaller", { stdio: "inherit" });
    }

    const outputFileName = outputName || this.generateOutputName("python");
    const pyinstallerCommand = ["pyinstaller"];

    // One file or directory
    if (oneFile) {
      pyinstallerCommand.push("--onefile");
    } else {
      pyinstallerCommand.push("--onedir");
    }

    // Output directory and name
    pyinstallerCommand.push("--distpath", this.config.outputDir);
    pyinstallerCommand.push("--name", outputFileName);

    // Add data files
    addData.forEach((data) => {
      const [src, dest] = data.split(";");
      pyinstallerCommand.push("--add-data", `${src};${dest}`);
    });

    // Add hidden imports
    hiddenImports.forEach((imp) => {
      pyinstallerCommand.push("--hidden-import", imp);
    });

    // Add entry point
    pyinstallerCommand.push(entryPoint);

    console.log(`📦 Running: ${pyinstallerCommand.join(" ")}`);
    execSync(pyinstallerCommand.join(" "), { stdio: "inherit" });
  }

  /**
   * Package web application as executable using Tauri or similar
   */
  async packageWebApp(options = {}) {
    const { buildDir = "./dist", outputName, ...otherOptions } = options;

    console.log("📦 Web app packaging requires Tauri or similar framework");
    console.log("This is a placeholder implementation");

    // This would require Tauri setup
    throw new Error("Web app packaging requires Tauri framework setup");
  }

  /**
   * Generate output filename with version
   */
  generateOutputName(type) {
    const baseName = this.config.appName || "app";
    const version = this.config.includeVersion ? `-${this.config.version}` : "";
    const extension = this.config.platform === "win32" ? ".exe" : "";

    return `${baseName}-${type}${version}${extension}`;
  }

  /**
   * Create pkg configuration in package.json
   */
  createPkgConfig(assets = []) {
    const pkgJsonPath = "./package.json";

    if (fs.existsSync(pkgJsonPath)) {
      const pkg = JSON.parse(fs.readFileSync(pkgJsonPath, "utf8"));
      pkg.pkg = {
        assets: assets,
        targets: ["node18-win-x64"],
      };
      fs.writeFileSync(pkgJsonPath, JSON.stringify(pkg, null, 2));
    }
  }

  /**
   * Create output directory if it doesn't exist
   */
  ensureOutputDir() {
    if (!fs.existsSync(this.config.outputDir)) {
      fs.mkdirSync(this.config.outputDir, { recursive: true });
    }
  }

  /**
   * Validate configuration
   */
  validateConfig() {
    if (!this.config.appName) {
      throw new Error("appName is required in configuration");
    }
    if (!this.config.version) {
      throw new Error("version is required in configuration");
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
📦 Universal Executable Packager

Usage: node package-exe.js <type> [options]

Types:
  node      - Package Node.js application using pkg
  electron  - Package Electron application using electron-builder
  python    - Package Python application using PyInstaller
  web       - Package web application (requires Tauri)

Options:
  --config <file>  - Use configuration file (JSON)
  --help          - Show this help message

Examples:
  node package-exe.js node --entry-point ./app.js --output-name myapp
  node package-exe.js electron --package-json ./package.json
  node package-exe.js python --entry-point ./main.py --one-file

Configuration file format:
{
  "appName": "MyApp",
  "version": "1.0.0",
  "outputDir": "./dist",
  "includeVersion": true,
  "platform": "win32",
  "arch": "x64"
}
    `);
    return;
  }

  const type = args[0];
  const options = {};

  // Parse command line options
  for (let i = 1; i < args.length; i += 2) {
    const key = args[i].replace("--", "");
    const value = args[i + 1];
    options[key] = value;
  }

  // Load configuration file if specified
  let config = {};
  if (options.config) {
    try {
      config = JSON.parse(fs.readFileSync(options.config, "utf8"));
    } catch (error) {
      console.error(`Failed to load config file: ${error.message}`);
      process.exit(1);
    }
  }

  // Create packager and run
  const packager = new ExecutablePackager(config);

  packager.validateConfig();
  packager.ensureOutputDir();

  packager.package(type, options).catch((error) => {
    console.error("Packaging failed:", error.message);
    process.exit(1);
  });
}

// Run if called directly
if (require.main === module) {
  main();
}

module.exports = ExecutablePackager;
