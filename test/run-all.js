// Minimal test runner: executes each test file in a child process.
// Usage: node test/run-all.js          (all tests)
//        node test/run-all.js --fast   (skip the slow build test)
const { spawnSync } = require('child_process');
const path = require('path');

const fast = process.argv.includes('--fast');
if (fast) {
  process.env.SKIP_BUILD = '1';
}

const tests = [
  'test-output-name.js',
  'test-placeholders.js',
  'test-backup.js',
  'test-build.js',
];

let failed = 0;

for (const test of tests) {
  const file = path.join(__dirname, test);
  console.log(`\n=== ${test} ===`);
  const result = spawnSync(process.execPath, [file], {
    stdio: 'inherit',
    env: process.env,
  });
  if (result.status !== 0) {
    failed++;
    console.error(`>>> ${test} FAILED (exit ${result.status})`);
  }
}

console.log(`\n${tests.length - failed}/${tests.length} test files passed`);
process.exit(failed > 0 ? 1 : 0);
