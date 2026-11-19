import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { parsePartitions, dumpCommand, transfer, verifyImage } from './backup-router.mjs';

test('MTD inventory preserves names and rejects malformed or duplicate devices', () => {
  assert.deepEqual(parsePartitions('mtd0|nor|65536|Bootloader\nmtd1|nand|131072|firmware backup\n'), [
    { device: 'mtd0', type: 'nor', size: 65536, name: 'Bootloader' },
    { device: 'mtd1', type: 'nand', size: 131072, name: 'firmware backup' }
  ]);
  for (const value of ['', 'mtd0|nor|0|empty', 'mtd0;reboot|nor|1|x', 'mtd0|nor|1|a\nmtd0|nor|1|b']) {
    assert.throws(() => parsePartitions(value));
  }
});

test('NAND requires bad-block padding and omits OOB; unsupported devices fail', () => {
  assert.equal(dumpCommand({ device: 'mtd2', type: 'nand', size: 131072 }),
    'nanddump --bb=padbad --omitoob --length=131072 /dev/mtd2');
  assert.throws(() => dumpCommand({ device: 'mtd0', type: 'rom', size: 1 }));
  assert.throws(() => dumpCommand({ device: 'mtd0;reboot', type: 'nor', size: 1 }));
});

test('image verification rejects truncation and changed flash', () => {
  const digest = 'a'.repeat(64);
  verifyImage({ size: 16, sha256: digest }, { device: 'mtd0', size: 16 }, digest);
  assert.throws(() => verifyImage({ size: 15, sha256: digest }, { device: 'mtd0', size: 16 }, digest));
  assert.throws(() => verifyImage({ size: 16, sha256: digest }, { device: 'mtd0', size: 16 }, 'b'.repeat(64)));
});

test('binary stream remains byte-exact and is hashed', async t => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'csqtt-backup-test-'));
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
  const destination = path.join(directory, 'flash.bin');
  const expected = Buffer.from(Array.from({ length: 65536 }, (_, i) => i % 256));
  const result = await transfer(process.execPath, ['-e', 'process.stdout.write(Buffer.from(Array.from({length:65536},(_,i)=>i%256)))'], destination);
  assert.deepEqual(fs.readFileSync(destination), expected);
  assert.deepEqual(result, { size: expected.length, sha256: createHash('sha256').update(expected).digest('hex') });
  assert.equal(fs.existsSync(`${destination}.partial`), false);
});

test('failed command cannot produce a completed backup file', async t => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'csqtt-backup-test-'));
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
  const destination = path.join(directory, 'flash.bin');
  await assert.rejects(transfer(process.execPath, ['-e', 'process.stdout.write("partial");process.exitCode=1'], destination), /exited 1/);
  assert.equal(fs.existsSync(destination), false);
});

test('stalled command times out and leaves no completed file', async t => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'csqtt-backup-test-'));
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
  const destination = path.join(directory, 'flash.bin');
  await assert.rejects(transfer(process.execPath, ['-e', 'setInterval(()=>{},1000)'], destination, 200), /timed out/);
  assert.equal(fs.existsSync(destination), false);
});
