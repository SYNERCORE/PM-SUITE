/**
 * Unit tests for the Files facade — strips legacy base64 blobs and
 * detects whether a document carries an attachment reference.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const src = readFileSync(path.join(__dirname, '..', '..', 'src', 'js', 'lib', 'files.js'), 'utf8');
const Files = new Function(src + '; return Files;')();

test('Files.hasBlob detects legacy base64 fileData', () => {
  assert.equal(Files.hasBlob({ fileData: 'data:image/png;base64,AAA' }), true);
  assert.equal(Files.hasBlob({ fileData: '' }), false);
  assert.equal(Files.hasBlob({}), false);
  assert.equal(Files.hasBlob(null), false);
});

test('Files.hasAttachment recognizes SP + legacy references', () => {
  assert.equal(Files.hasAttachment({ spDriveId: 'd', spItemId: 'i' }), true);
  assert.equal(Files.hasAttachment({ fileUrl: 'http://x' }), true);
  assert.equal(Files.hasAttachment({ fileWebUrl: 'http://x' }), true);
  assert.equal(Files.hasAttachment({ fileData: 'AAA' }), true);
  assert.equal(Files.hasAttachment({ name: 'nothing' }), false);
});

test('Files.strip removes fileData without mutating input', () => {
  const doc = { id: 'D1', name: 'a', fileData: 'AAA', spDriveId: 'd' };
  const stripped = Files.strip(doc);
  assert.equal(stripped.fileData, undefined);
  assert.equal(stripped.spDriveId, 'd');
  assert.equal(doc.fileData, 'AAA'); // original untouched
});

test('Files.strip returns the same object when no blob is present', () => {
  const doc = { id: 'D1', spDriveId: 'd' };
  assert.equal(Files.strip(doc), doc);
});

test('Files.stripMany maps over an array', () => {
  const docs = [
    { id: 'D1', fileData: 'AAA' },
    { id: 'D2', spDriveId: 'd' },
  ];
  const out = Files.stripMany(docs);
  assert.equal(out[0].fileData, undefined);
  assert.equal(out[1].spDriveId, 'd');
});

test('Files.stripMany passes through non-array input', () => {
  assert.equal(Files.stripMany(null), null);
  assert.equal(Files.stripMany(undefined), undefined);
});
