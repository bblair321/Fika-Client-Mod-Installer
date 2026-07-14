// Extractor template generation: all placeholders replaced, config values embedded
const assert = require('assert');
const FilePacker = require('../scripts/pack-files.js');

const sampleArchive = 'QUJDREVGRw=='; // "ABCDEFG"

// Full config: backup on, default path set
{
  const packer = new FilePacker({
    appName: 'PlaceholderTest',
    backupOverwritten: true,
    defaultExtractPath: 'C:\\Games\\Test',
    extractorType: 'nodejs',
  });
  const code = packer.generateExtractor(sampleArchive, 8, null, 'zip');

  assert.ok(
    code.includes("backupOverwritten = 'true' === 'true'"),
    'backup flag should be true'
  );
  assert.ok(
    code.includes('C:\\\\Games\\\\Test'),
    'default extract path should be embedded (escaped)'
  );
  assert.ok(
    !code.includes('{{BACKUP_OVERWRITTEN}}'),
    'no leftover BACKUP_OVERWRITTEN placeholder'
  );
  assert.ok(
    !code.includes('var defaultExtractPath = "{{DEFAULT_EXTRACT_PATH}}"'),
    'no leftover DEFAULT_EXTRACT_PATH assignment'
  );
  assert.ok(code.includes(sampleArchive), 'archive data embedded');
  assert.ok(code.includes('PlaceholderTest'), 'app name embedded');
}

// Defaults: backup off, no default path
{
  const packer = new FilePacker({ appName: 'X', extractorType: 'nodejs' });
  const code = packer.generateExtractor(sampleArchive, 8, null, 'zip');

  assert.ok(
    code.includes("backupOverwritten = 'false' === 'true'"),
    'backup flag should default to false'
  );
  assert.ok(
    code.includes('var defaultExtractPath = "";') ||
      code.includes("var defaultExtractPath = '';"),
    'default path should be empty string'
  );
}

console.log('PASS: extractor placeholder replacement');
