import fs from 'fs';
import path from 'path';

/**
 * Lightweight SF2 parser for giant soundfont files (>500MB)
 * Only reads INFO and pdta chunks, completely skips sdta (sample data)
 * This allows parsing multi-GB soundfonts without memory issues
 */

/**
 * Read a 4-byte chunk ID from buffer
 */
function readChunkId(buffer, offset) {
  return buffer.toString('ascii', offset, offset + 4);
}

/**
 * Read a 32-bit little-endian unsigned integer
 */
function readUint32LE(buffer, offset) {
  return buffer.readUInt32LE(offset);
}

/**
 * Read a 16-bit little-endian unsigned integer
 */
function readUint16LE(buffer, offset) {
  return buffer.readUInt16LE(offset);
}

/**
 * Read a null-terminated string of fixed length
 */
function readFixedString(buffer, offset, length) {
  let str = '';
  for (let i = 0; i < length; i++) {
    const char = buffer[offset + i];
    if (char === 0) break;
    str += String.fromCharCode(char);
  }
  return str.trim();
}

/**
 * Parse the INFO chunk for metadata
 */
function parseInfoChunk(buffer, offset, size) {
  const metadata = {};
  let pos = offset;
  const endPos = offset + size;

  while (pos < endPos - 8) {
    const chunkId = readChunkId(buffer, pos);
    const chunkSize = readUint32LE(buffer, pos + 4);
    const dataStart = pos + 8;

    switch (chunkId) {
      case 'ifil': // SoundFont version
        metadata.versionMajor = readUint16LE(buffer, dataStart);
        metadata.versionMinor = readUint16LE(buffer, dataStart + 2);
        break;
      case 'isng': // Sound engine
        metadata.soundEngine = readFixedString(buffer, dataStart, chunkSize);
        break;
      case 'INAM': // Name
        metadata.name = readFixedString(buffer, dataStart, chunkSize);
        break;
      case 'irom': // ROM name
        metadata.rom = readFixedString(buffer, dataStart, chunkSize);
        break;
      case 'ICRD': // Creation date
        metadata.creationDate = readFixedString(buffer, dataStart, chunkSize);
        break;
      case 'IENG': // Engineer/Author
        metadata.engineer = readFixedString(buffer, dataStart, chunkSize);
        break;
      case 'IPRD': // Product
        metadata.product = readFixedString(buffer, dataStart, chunkSize);
        break;
      case 'ICOP': // Copyright
        metadata.copyright = readFixedString(buffer, dataStart, chunkSize);
        break;
      case 'ICMT': // Comments
        metadata.comments = readFixedString(buffer, dataStart, chunkSize);
        break;
      case 'ISFT': // Software used
        metadata.software = readFixedString(buffer, dataStart, chunkSize);
        break;
    }

    // Move to next chunk (account for padding to even boundary)
    pos = dataStart + chunkSize + (chunkSize % 2);
  }

  return metadata;
}

/**
 * Parse preset headers from PHDR sub-chunk
 * Each preset header is 38 bytes
 */
function parsePresetHeaders(buffer, offset, size) {
  const presets = [];
  const PRESET_SIZE = 38;
  const numPresets = Math.floor(size / PRESET_SIZE);

  for (let i = 0; i < numPresets - 1; i++) { // -1 because last is terminal
    const pos = offset + (i * PRESET_SIZE);

    const preset = {
      name: readFixedString(buffer, pos, 20),
      program: readUint16LE(buffer, pos + 20), // preset number (program)
      bank: readUint16LE(buffer, pos + 22),
      presetBagIndex: readUint16LE(buffer, pos + 24),
      library: readUint32LE(buffer, pos + 26),
      genre: readUint32LE(buffer, pos + 30),
      morphology: readUint32LE(buffer, pos + 34)
    };

    // Skip the EOP (End of Presets) terminal record
    if (preset.name !== 'EOP' && preset.name !== '') {
      presets.push({
        name: preset.name || 'Unknown',
        bank: preset.bank,
        program: preset.program,
        instruments: [] // We'd need to parse more chunks to get these
      });
    }
  }

  return presets;
}

/**
 * Parse the pdta (preset data) chunk
 */
function parsePdtaChunk(buffer, offset, size) {
  let presets = [];
  let pos = offset;
  const endPos = offset + size;

  while (pos < endPos - 8) {
    const chunkId = readChunkId(buffer, pos);
    const chunkSize = readUint32LE(buffer, pos + 4);
    const dataStart = pos + 8;

    if (chunkId === 'phdr') {
      presets = parsePresetHeaders(buffer, dataStart, chunkSize);
    }
    // We could also parse pbag, pmod, pgen, inst, ibag, imod, igen, shdr
    // but for basic preset listing, phdr is sufficient

    pos = dataStart + chunkSize + (chunkSize % 2);
  }

  return presets;
}

/**
 * Parse a large SF2 file by streaming only the chunks we need
 * Skips the sdta (sample data) chunk entirely
 * @param {string} sf2Path - Path to SF2 file
 * @returns {Promise<Object|null>} Parsed soundfont data or null on error
 */
export async function parseLargeSF2(sf2Path) {
  return new Promise((resolve, reject) => {
    const fd = fs.openSync(sf2Path, 'r');
    const stats = fs.statSync(sf2Path);
    const fileSize = stats.size;

    try {
      // Read RIFF header (12 bytes)
      const riffHeader = Buffer.alloc(12);
      fs.readSync(fd, riffHeader, 0, 12, 0);

      const riffId = readChunkId(riffHeader, 0);
      const riffSize = readUint32LE(riffHeader, 4);
      const riffType = readChunkId(riffHeader, 8);

      if (riffId !== 'RIFF' || riffType !== 'sfbk') {
        fs.closeSync(fd);
        throw new Error('Not a valid SF2 file');
      }

      let metadata = {};
      let presets = [];
      let pos = 12; // After RIFF header

      // Read chunks
      while (pos < fileSize - 8) {
        const chunkHeader = Buffer.alloc(12);
        fs.readSync(fd, chunkHeader, 0, 12, pos);

        const listId = readChunkId(chunkHeader, 0);
        const listSize = readUint32LE(chunkHeader, 4);
        const listType = readChunkId(chunkHeader, 8);

        if (listId === 'LIST') {
          if (listType === 'INFO') {
            // Read INFO chunk data
            const infoData = Buffer.alloc(listSize - 4);
            fs.readSync(fd, infoData, 0, listSize - 4, pos + 12);
            metadata = parseInfoChunk(infoData, 0, listSize - 4);
          } else if (listType === 'sdta') {
            // SKIP sample data entirely - this is the huge part
            // Just move past it
          } else if (listType === 'pdta') {
            // Read preset data chunk
            const pdtaData = Buffer.alloc(listSize - 4);
            fs.readSync(fd, pdtaData, 0, listSize - 4, pos + 12);
            presets = parsePdtaChunk(pdtaData, 0, listSize - 4);
          }
        }

        // Move to next chunk
        pos += 8 + listSize + (listSize % 2);
      }

      fs.closeSync(fd);

      // Sort presets by bank then program
      presets.sort((a, b) => {
        if (a.bank !== b.bank) return a.bank - b.bank;
        return a.program - b.program;
      });

      resolve({
        filename: path.basename(sf2Path),
        path: sf2Path,
        size: fileSize,
        metadata: {
          name: metadata.name || path.basename(sf2Path, '.sf2'),
          author: metadata.engineer || metadata.copyright || '',
          comment: metadata.comments || '',
          creationDate: metadata.creationDate || '',
          product: metadata.product || '',
          software: metadata.software || '',
          version: metadata.versionMajor ? `${metadata.versionMajor}.${metadata.versionMinor}` : ''
        },
        presetCount: presets.length,
        presets: presets,
        parsedWith: 'lightweight-parser' // Flag that this was parsed with the lightweight parser
      });

    } catch (error) {
      try { fs.closeSync(fd); } catch (e) {}
      console.error(`Error parsing large SF2 ${sf2Path}: ${error.message}`);
      resolve(null);
    }
  });
}

/**
 * Get list of failed soundfonts from a directory that weren't in the index
 * @param {string} directory - Directory with SF2 files
 * @param {Object} existingIndex - The existing soundfont index
 * @returns {Array<string>} Paths to SF2 files not in the index
 */
export function findMissingSoundfonts(directory, existingIndex) {
  const allSf2Files = fs.readdirSync(directory)
    .filter(f => f.toLowerCase().endsWith('.sf2'))
    .map(f => path.join(directory, f));

  const indexedFiles = new Set(existingIndex.soundfonts.map(sf => sf.path));

  return allSf2Files.filter(f => !indexedFiles.has(f));
}

/**
 * Add missing soundfonts to an existing index using the lightweight parser
 * @param {string} indexPath - Path to existing index JSON
 * @param {string} directory - Directory containing SF2 files
 * @returns {Promise<Object>} Updated index
 */
export async function augmentIndexWithLargeFiles(indexPath, directory) {
  const existingIndex = JSON.parse(fs.readFileSync(indexPath, 'utf8'));
  const missingSf2 = findMissingSoundfonts(directory, existingIndex);

  console.log(`Found ${missingSf2.length} soundfonts not in index`);

  let added = 0;
  for (const sf2Path of missingSf2) {
    console.log(`Parsing large file: ${path.basename(sf2Path)}...`);
    const result = await parseLargeSF2(sf2Path);
    if (result) {
      existingIndex.soundfonts.push(result);
      existingIndex.totalPresets += result.presetCount;
      added++;
      console.log(`  ✓ Added: ${result.presetCount} presets`);
    } else {
      console.log(`  ✗ Failed to parse`);
    }
  }

  existingIndex.totalSoundfonts = existingIndex.soundfonts.length;
  existingIndex.generated = new Date().toISOString();

  // Save updated index
  fs.writeFileSync(indexPath, JSON.stringify(existingIndex, null, 2));
  console.log(`\nIndex updated: ${added} soundfonts added`);
  console.log(`Total soundfonts: ${existingIndex.totalSoundfonts}`);
  console.log(`Total presets: ${existingIndex.totalPresets}`);

  return existingIndex;
}

// CLI entry point
if (import.meta.url === `file://${process.argv[1]}`) {
  const args = process.argv.slice(2);

  if (args[0] === 'parse' && args[1]) {
    // Parse a single large SF2 file
    parseLargeSF2(args[1])
      .then(result => {
        if (result) {
          console.log(JSON.stringify(result, null, 2));
        } else {
          console.error('Failed to parse file');
          process.exit(1);
        }
      });
  } else if (args[0] === 'augment' && args[1] && args[2]) {
    // Augment existing index with missing files
    augmentIndexWithLargeFiles(args[1], args[2])
      .then(() => process.exit(0))
      .catch(err => {
        console.error(err);
        process.exit(1);
      });
  } else {
    console.log(`Lightweight SF2 Parser - For giant soundfont files

Usage:
  node sf2-lightweight-parser.js parse <sf2_file>
    Parse a single large SF2 file

  node sf2-lightweight-parser.js augment <index.json> <directory>
    Add missing soundfonts to existing index using lightweight parser
`);
  }
}
