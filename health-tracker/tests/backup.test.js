'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const backup = require('../js/backup.js');

// Clearly fictional sample data.
function sample() {
  return {
    profile: { name: 'Demo Patient (fictional)', sex: 'f', dob: '1970-01-01' },
    settings: { pin: { salt: 'x', hash: 'y' }, lastBackup: '2026-01-01', targets: { hb: { lo: 10, hi: 11.5 } } },
    labs: [{ id: 'a1', date: '2026-01-05', values: { hb: 9.8, creatinine: 3.1 } }],
    vitals: [{ id: 'v1', datetime: '2026-01-06T08:00', sys: 140, dia: 85 }],
    meds: [{ id: 'm1', name: 'Demo tablet', timing: '1-0-1', start: '2025-12-01' }],
    injections: [], visits: [{ id: 'd1', date: '2026-01-10', advice: 'हिंदी टेक्स्ट ✓' }], dialysis: []
  };
}

test('plain backup round trip, PIN not included', async () => {
  const text = await backup.createBackup(sample());
  const obj = JSON.parse(text);
  assert.equal(obj.app, 'kidney-health-tracker');
  assert.equal(obj.encrypted, false);
  assert.equal(obj.data.settings.pin, undefined);
  const data = await backup.readBackup(text);
  assert.deepEqual(data.labs, sample().labs);
  assert.equal(data.visits[0].advice, 'हिंदी टेक्स्ट ✓');
  assert.deepEqual(data.settings.targets, sample().settings.targets);
  assert.equal(data.settings.pin, undefined);
});

test('encrypted backup round trip', async () => {
  const text = await backup.createBackup(sample(), 'correct horse');
  const obj = JSON.parse(text);
  assert.equal(obj.encrypted, true);
  assert.equal(obj.cipher.name, 'AES-GCM');
  assert.equal(obj.kdf.name, 'PBKDF2');
  assert.ok(!text.includes('Demo Patient'), 'no plaintext in file');
  assert.equal(backup.inspectBackup(text).encrypted, true);
  const data = await backup.readBackup(text, 'correct horse');
  assert.equal(data.profile.name, 'Demo Patient (fictional)');
  assert.deepEqual(data.meds, sample().meds);
});

test('encrypted backup rejects wrong or missing password', async () => {
  const text = await backup.createBackup(sample(), 'secret');
  await assert.rejects(backup.readBackup(text, 'wrong'), /BAD_PASSWORD/);
  await assert.rejects(backup.readBackup(text), /NEED_PASSWORD/);
});

test('restore rejects foreign or broken files', async () => {
  await assert.rejects(backup.readBackup('not json'), /NOT_JSON/);
  await assert.rejects(backup.readBackup('{"app":"other"}'), /NOT_BACKUP/);
  await assert.rejects(backup.readBackup(JSON.stringify({ app: 'kidney-health-tracker', version: 99 })), /TOO_NEW/);
});

test('restore drops rows without ids and fills missing stores', async () => {
  const text = JSON.stringify({ app: 'kidney-health-tracker', version: 1, encrypted: false,
    data: { profile: {}, labs: [{ id: 'x', date: '2026-01-01' }, { date: 'no id' }, null] } });
  const data = await backup.readBackup(text);
  assert.equal(data.labs.length, 1);
  assert.deepEqual(data.vitals, []);
});

test('restore preview counts and date span', () => {
  const p = backup.previewData(sample());
  assert.equal(p.name, 'Demo Patient (fictional)');
  assert.equal(p.counts.labs, 1);
  assert.equal(p.counts.vitals, 1);
  assert.equal(p.from, '2025-12-01');
  assert.equal(p.to, '2026-01-10');
});

test('PIN hash check', async () => {
  const h = await backup.hashPin('1234');
  assert.equal(await backup.checkPin('1234', h), true);
  assert.equal(await backup.checkPin('4321', h), false);
});
