// generateOutputName: version handling and filename sanitization
const assert = require('assert');
const FilePacker = require('../scripts/pack-files.js');

function name(config) {
  return new FilePacker(config).generateOutputName();
}

assert.strictEqual(
  name({ appName: 'MyMod', version: '1.2.3', includeVersion: true }),
  'MyMod-1.2.3.exe'
);

assert.strictEqual(
  name({ appName: 'MyMod', version: '1.2.3', includeVersion: false }),
  'MyMod.exe'
);

// Spaces become underscores, invalid filename characters are stripped
assert.strictEqual(
  name({ appName: 'My Mod: The "Best" <One>', version: '2.0', includeVersion: true }),
  'My_Mod_The_Best_One-2.0.exe'
);

// Apostrophes removed
assert.strictEqual(
  name({ appName: "Bob's Pack", version: '1.0', includeVersion: false }),
  'Bobs_Pack.exe'
);

console.log('PASS: output name generation');
