// Backup-on-overwrite logic (mirrors backupExistingFiles in installer-gui-template.js)
// Windows-only: uses PowerShell exactly like the generated installer does.
const assert = require('assert');
const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const os = require('os');
const archiver = require('archiver');

if (process.platform !== 'win32') {
  console.log('SKIP: backup test requires Windows');
  process.exit(0);
}

function backupExistingFiles(tempArchive, extractDir) {
  const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
  const backupDir = path.join(extractDir, 'backup-' + stamp);
  const psSrc = tempArchive.replace(/'/g, "''");
  const psDest = extractDir.replace(/'/g, "''");
  const psBackup = backupDir.replace(/'/g, "''");
  const script = [
    "$ErrorActionPreference = 'Stop'",
    "Add-Type -AssemblyName System.IO.Compression.FileSystem",
    "$zip = [System.IO.Compression.ZipFile]::OpenRead('" + psSrc + "')",
    "$count = 0",
    "try {",
    "  foreach ($entry in $zip.Entries) {",
    "    if ([string]::IsNullOrEmpty($entry.Name)) { continue }",
    "    $target = Join-Path '" + psDest + "' $entry.FullName",
    "    if (Test-Path -LiteralPath $target -PathType Leaf) {",
    "      $dest = Join-Path '" + psBackup + "' $entry.FullName",
    "      $destDir = Split-Path -Parent $dest",
    "      if (-not (Test-Path -LiteralPath $destDir)) { New-Item -ItemType Directory -Path $destDir -Force | Out-Null }",
    "      Copy-Item -LiteralPath $target -Destination $dest -Force",
    "      $count++",
    "    }",
    "  }",
    "} finally { $zip.Dispose() }",
    "Write-Output $count"
  ].join('\n');

  const scriptPath = path.join(os.tmpdir(), 'installer-backup-' + Date.now() + '.ps1');
  try {
    fs.writeFileSync(scriptPath, script, 'utf8');
    const output = execSync(
      'powershell -NoProfile -ExecutionPolicy Bypass -File "' + scriptPath + '"',
      { timeout: 120000, encoding: 'utf8', windowsHide: true }
    );
    const count = parseInt(String(output).trim(), 10) || 0;
    if (count > 0) {
      return { backupPath: backupDir, count: count };
    }
    return null;
  } finally {
    try { fs.unlinkSync(scriptPath); } catch (e) {}
  }
}

async function main() {
  const base = path.join(os.tmpdir(), 'backup-test-' + Date.now());
  const srcDir = path.join(base, 'src', 'payload');
  const extractDir = path.join(base, 'target');
  fs.mkdirSync(srcDir, { recursive: true });
  fs.mkdirSync(path.join(extractDir, 'payload'), { recursive: true });

  fs.writeFileSync(path.join(srcDir, 'mod.txt'), 'NEW CONTENT v2');
  fs.writeFileSync(path.join(srcDir, 'extra.txt'), 'brand new file');
  fs.writeFileSync(path.join(extractDir, 'payload', 'mod.txt'), 'OLD CONTENT v1');

  const zipPath = path.join(base, 'files.zip');
  await new Promise((resolve, reject) => {
    const output = fs.createWriteStream(zipPath);
    const archive = archiver('zip');
    output.on('close', resolve);
    archive.on('error', reject);
    archive.pipe(output);
    archive.directory(srcDir, 'payload');
    archive.finalize();
  });

  try {
    // Conflicting file is backed up with original content
    const info = backupExistingFiles(zipPath, extractDir);
    assert.ok(info, 'expected backup info for conflicting file');
    assert.strictEqual(info.count, 1, 'expected exactly 1 backed up file');
    const backedUp = path.join(info.backupPath, 'payload', 'mod.txt');
    assert.strictEqual(
      fs.readFileSync(backedUp, 'utf8'),
      'OLD CONTENT v1',
      'backup should preserve original content'
    );

    // Extraction overwrites and adds files (same command the installer runs)
    const psPath = zipPath.replace(/\\/g, '/');
    const psDest = extractDir.replace(/\\/g, '/');
    execSync(
      'powershell -Command "Expand-Archive -Path \'' + psPath + '\' -DestinationPath \'' + psDest + '\' -Force"',
      { timeout: 60000, stdio: 'ignore' }
    );
    assert.strictEqual(
      fs.readFileSync(path.join(extractDir, 'payload', 'mod.txt'), 'utf8').trim(),
      'NEW CONTENT v2',
      'file should be overwritten after extraction'
    );
    assert.ok(
      fs.existsSync(path.join(extractDir, 'payload', 'extra.txt')),
      'new file should exist after extraction'
    );

    // No conflicts -> no backup folder
    const emptyTarget = path.join(base, 'empty-target');
    fs.mkdirSync(emptyTarget, { recursive: true });
    assert.strictEqual(
      backupExistingFiles(zipPath, emptyTarget),
      null,
      'no-conflict case should return null'
    );
  } finally {
    fs.rmSync(base, { recursive: true, force: true });
  }

  console.log('PASS: backup-on-overwrite logic');
}

main().catch((e) => {
  console.error('FAIL:', e.message);
  process.exit(1);
});
