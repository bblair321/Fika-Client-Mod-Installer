#!/usr/bin/env node

/**
 * Interactive File Packager Script
 * Prompts user for file/folder information and creates self-extracting archives
 */

const readline = require("readline");
const { execSync, spawn } = require("child_process");
const fs = require("fs");
const path = require("path");

class InteractiveFilePackager {
  constructor() {
    this.rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout,
    });

    this.config = {
      appName: "",
      version: "1.0.0",
      outputDir: "./dist",
      includeVersion: true,
      files: [],
      folders: [],
      outputName: "",
    };
  }

  async run() {
    console.log("📦 Interactive File Packager");
    console.log("============================");
    console.log("Create self-extracting archives from loose files and folders");
    console.log("");

    try {
      await this.getBasicInfo();
      await this.getFilesAndFolders();
      await this.confirmAndPackage();
    } catch (error) {
      console.error("❌ Error:", error.message);
    } finally {
      this.rl.close();
    }
  }

  async getBasicInfo() {
    console.log("📋 Basic Information");
    console.log("===================");

    this.config.appName = await this.question("Package name: ", "MyPackage");
    this.config.version = await this.question(
      "Version (default: 1.0.0): ",
      "1.0.0"
    );
    this.config.outputDir = await this.question(
      "Output directory (default: ./dist): ",
      "./dist"
    );

    const includeVersion = await this.question(
      "Include version in filename? (y/n, default: y): ",
      "y"
    );
    this.config.includeVersion = includeVersion.toLowerCase().startsWith("y");

    this.config.outputName = await this.question(
      "Output executable name: ",
      this.config.appName
    );

    console.log("");
  }

  async getFilesAndFolders() {
    console.log("📁 Files and Folders to Include");
    console.log("===============================");
    console.log("");
    console.log("You can include individual files, entire folders, or both.");
    console.log("Examples:");
    console.log("  Files: config.json, readme.txt, license.txt");
    console.log("  Folders: assets, data, templates, config");
    console.log("");

    // Get individual files
    console.log("🗂️  Individual Files");
    console.log(
      "Enter individual files to include (one per line, press Enter twice when done):"
    );
    console.log("Examples: ./config.json, ./readme.txt, ./license.txt");

    const files = [];
    let input;

    do {
      input = await this.question("File path (or press Enter to finish): ");
      if (input.trim()) {
        // Check if file exists
        if (fs.existsSync(input.trim())) {
          files.push(input.trim());
          console.log(`✅ Added file: ${input.trim()}`);
        } else {
          console.log(
            `⚠️  File not found: ${input.trim()} (will be added anyway)`
          );
          files.push(input.trim());
        }
      }
    } while (input.trim());

    this.config.files = files;

    // Get folders
    console.log("");
    console.log("📂 Folders");
    console.log(
      "Enter folders to include (one per line, press Enter twice when done):"
    );
    console.log("Examples: ./assets, ./data, ./templates");

    const folders = [];

    do {
      input = await this.question("Folder path (or press Enter to finish): ");
      if (input.trim()) {
        // Check if folder exists
        if (
          fs.existsSync(input.trim()) &&
          fs.statSync(input.trim()).isDirectory()
        ) {
          folders.push(input.trim());
          console.log(`✅ Added folder: ${input.trim()}`);
        } else {
          console.log(
            `⚠️  Folder not found: ${input.trim()} (will be added anyway)`
          );
          folders.push(input.trim());
        }
      }
    } while (input.trim());

    this.config.folders = folders;

    // Validate that we have something to package
    if (files.length === 0 && folders.length === 0) {
      throw new Error("No files or folders specified. Nothing to package.");
    }

    console.log("");
  }

  async confirmAndPackage() {
    console.log("📋 Packaging Summary");
    console.log("===================");
    console.log(`Package Name: ${this.config.appName}`);
    console.log(`Version: ${this.config.version}`);
    console.log(`Output Directory: ${this.config.outputDir}`);
    console.log(
      `Include Version: ${this.config.includeVersion ? "Yes" : "No"}`
    );
    console.log(`Output Name: ${this.config.outputName}`);
    console.log("");

    if (this.config.files.length > 0) {
      console.log("Files to include:");
      this.config.files.forEach((file) => {
        console.log(`  📄 ${file}`);
      });
      console.log("");
    }

    if (this.config.folders.length > 0) {
      console.log("Folders to include:");
      this.config.folders.forEach((folder) => {
        console.log(`  📁 ${folder}`);
      });
      console.log("");
    }

    const confirm = await this.question("Proceed with packaging? (y/n): ");

    if (!confirm.toLowerCase().startsWith("y")) {
      console.log("❌ Packaging cancelled.");
      return;
    }

    console.log("");
    console.log("🚀 Starting file packaging process...");
    console.log("");

    await this.executePackaging();
  }

  async executePackaging() {
    try {
      // Create the command arguments for pack-files.js
      const commandArgs = [];

      // Add files
      this.config.files.forEach((file) => {
        commandArgs.push("--files");
        commandArgs.push(file);
      });

      // Add folders
      this.config.folders.forEach((folder) => {
        commandArgs.push("--folders");
        commandArgs.push(folder);
      });

      // Add other options
      if (this.config.outputName) {
        commandArgs.push("--output-name");
        commandArgs.push(this.config.outputName);
      }

      commandArgs.push("--app-name");
      commandArgs.push(this.config.appName);

      commandArgs.push("--version");
      commandArgs.push(this.config.version);

      // Create a temporary config file
      const configFile = path.join(__dirname, "temp-file-config.json");
      const configData = {
        appName: this.config.appName,
        version: this.config.version,
        outputDir: this.config.outputDir,
        includeVersion: this.config.includeVersion,
        files: this.config.files,
        folders: this.config.folders,
      };

      fs.writeFileSync(configFile, JSON.stringify(configData, null, 2));
      commandArgs.push("--config");
      commandArgs.push(configFile);

      console.log(`Running: node pack-files.js ${commandArgs.join(" ")}`);
      console.log("");

      // Execute the file packaging script
      const packFilesPath = path.join(__dirname, "pack-files.js");

      if (!fs.existsSync(packFilesPath)) {
        throw new Error(`pack-files.js not found at ${packFilesPath}`);
      }

      const result = spawn("node", [packFilesPath, ...commandArgs], {
        stdio: "inherit",
        cwd: __dirname,
      });

      result.on("close", (code) => {
        // Cleanup temp config file
        if (fs.existsSync(configFile)) {
          fs.unlinkSync(configFile);
        }

        if (code === 0) {
          console.log("");
          console.log("✅ File packaging completed successfully!");
          console.log(
            `📁 Check the ${this.config.outputDir} folder for your self-extracting executable.`
          );
          console.log("");
          console.log("🎯 How users will use it:");
          console.log("1. Run the .exe file");
          console.log("2. Choose where to extract the files");
          console.log(
            "3. All files will be extracted to their chosen directory"
          );
        } else {
          console.log("");
          console.log(`❌ File packaging failed with exit code ${code}`);
        }
      });
    } catch (error) {
      console.error("❌ Error during file packaging:", error.message);
    }
  }

  question(prompt, defaultValue = "") {
    return new Promise((resolve) => {
      const fullPrompt = defaultValue ? `${prompt}[${defaultValue}] ` : prompt;
      this.rl.question(fullPrompt, (answer) => {
        resolve(answer.trim() || defaultValue);
      });
    });
  }
}

// Run the interactive file packager
if (require.main === module) {
  const packager = new InteractiveFilePackager();
  packager.run().catch(console.error);
}

module.exports = InteractiveFilePackager;
