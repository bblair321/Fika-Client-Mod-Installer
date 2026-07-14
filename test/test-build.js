// Golden path: pack a tiny folder into a real installer executable.
// Slow (~10-20s, runs pkg). Skip with SKIP_BUILD=1.
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const os = require('os');
const FilePacker = require('../scripts/pack-files.js');

if (process.env.SKIP_BUILD === '1') {
  console.log('SKIP: build test (SKIP_BUILD=1)');
  process.exit(0);
}

if (process.platform !== 'win32') {
  console.log('SKIP: build test requires Windows');
  process.exit(0);
}

async function main() {
  const base = fs.mkdtempSync(path.join(os.tmpdir(), 'build-test-'));
  const payload = path.join(base, 'payload');
  const outputDir = path.join(base, 'out');
  fs.mkdirSync(payload, { recursive: true });
  fs.mkdirSync(outputDir, { recursive: true });
  fs.writeFileSync(path.join(payload, 'hello.txt'), 'golden path test');

  const progressUpdates = [];
  const packer = new FilePacker({
    outputDir,
    appName: 'GoldenPath',
    version: '0.0.1',
    includeVersion: false,
    backupOverwritten: true,
    defaultExtractPath: 'C:\\Temp\\GoldenPath',
    extractorType: 'nodejs',
    onProgress: (message, percentage) => progressUpdates.push({ message, percentage }),
  });

  try {
    await packer.packFiles({
      files: [],
      folders: [payload],
      outputName: 'GoldenPath',
    });

    const exePath = path.join(outputDir, 'GoldenPath.exe');
    assert.ok(fs.existsSync(exePath), 'installer exe should exist: ' + exePath);

    const size = fs.statSync(exePath).size;
    assert.ok(
      size > 10 * 1024 * 1024,
      'exe should be a real pkg binary (>10MB), got ' + size + ' bytes'
    );

    assert.ok(progressUpdates.length >= 3, 'progress callback should fire');
    assert.strictEqual(
      progressUpdates[progressUpdates.length - 1].percentage,
      100,
      'final progress should be 100'
    );
  } finally {
    fs.rmSync(base, { recursive: true, force: true });
  }

  console.log('PASS: golden-path build produces installer exe');
}

main().catch((e) => {
  console.error('FAIL:', e.message);
  process.exit(1);
});
