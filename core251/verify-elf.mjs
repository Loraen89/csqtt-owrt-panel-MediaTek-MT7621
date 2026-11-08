import fs from 'node:fs';

const data = fs.readFileSync(process.argv[2]);
const check = (condition, message) => {
  if (!condition) throw new Error(message);
};

check(data.length > 52, 'ELF file is too small');
check(data.subarray(0, 6).equals(Buffer.from([0x7f, 0x45, 0x4c, 0x46, 1, 1])), 'Expected ELF32 little-endian');
check(data.readUInt16LE(16) === 2, 'Expected executable ELF');
check(data.readUInt16LE(18) === 8, 'Expected EM_MIPS');

const flags = data.readUInt32LE(36);
check((flags & 0xf0000000) === 0x70000000, 'Expected MIPS32r2');
check((flags & 0x0000f000) === 0x00001000, 'Expected o32 ABI');

const phoff = data.readUInt32LE(28);
const phentsize = data.readUInt16LE(42);
const phnum = data.readUInt16LE(44);
check(phoff + phnum * phentsize <= data.length, 'Corrupt program headers');
for (let index = 0; index < phnum; index++) {
  const offset = phoff + index * phentsize;
  const type = data.readUInt32LE(offset);
  check(type !== 3, 'Dynamic interpreter detected; expected static musl');
  if (type === 0x70000003) {
    const abiOffset = data.readUInt32LE(offset + 4);
    check(abiOffset + 24 <= data.length, 'Invalid MIPS ABI flags');
    check(data[abiOffset + 7] === 3, 'Expected soft-float ABI');
  }
}

console.log('Validated: static ELF32 MIPS32r2 little-endian o32 soft-float');
