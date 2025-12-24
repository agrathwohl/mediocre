import fs from 'fs';
import path from 'path';
import pkg from 'soundfont2';
const { SoundFont2 } = pkg;

/**
 * Analyze a single SF2 file and extract bank/preset information
 * @param {string} sf2Path - Path to the SF2 file
 * @returns {Promise<Object|null>} Parsed soundfont data or null on error
 */
export async function analyzeSoundFont(sf2Path) {
  try {
    const buffer = fs.readFileSync(sf2Path);
    const soundFont = SoundFont2.from(buffer);

    const presets = [];

    // Extract preset information - soundfont2 nests data under preset.header
    if (soundFont.presets) {
      for (const preset of soundFont.presets) {
        const header = preset.header || preset; // Handle both nested and flat structures
        presets.push({
          name: (header.name || preset.name)?.trim() || 'Unknown',
          bank: header.bank ?? preset.bank ?? 0,
          program: header.preset ?? preset.preset ?? 0,
          // Get instrument names from zones if available
          instruments: preset.zones?.map(z => z.instrument?.header?.name?.trim()).filter(Boolean) || []
        });
      }
    }

    // Sort by bank then program number
    presets.sort((a, b) => {
      if (a.bank !== b.bank) return a.bank - b.bank;
      return a.program - b.program;
    });

    return {
      filename: path.basename(sf2Path),
      path: sf2Path,
      size: fs.statSync(sf2Path).size,
      metadata: {
        name: soundFont.metaData?.name?.trim() || path.basename(sf2Path, '.sf2'),
        author: soundFont.metaData?.engineer?.trim() || soundFont.metaData?.copyright?.trim() || '',
        comment: soundFont.metaData?.comments?.trim() || '',
        creationDate: soundFont.metaData?.creationDate?.trim() || '',
        product: soundFont.metaData?.product?.trim() || ''
      },
      presetCount: presets.length,
      presets: presets
    };
  } catch (error) {
    console.error(`Error parsing ${sf2Path}: ${error.message}`);
    return null;
  }
}

/**
 * Analyze all SF2 files in a directory
 * @param {string} directory - Directory containing SF2 files
 * @param {Function} [progressCallback] - Optional callback for progress updates
 * @returns {Promise<Array>} Array of analyzed soundfonts
 */
export async function analyzeDirectory(directory, progressCallback) {
  const sf2Files = fs.readdirSync(directory)
    .filter(f => f.toLowerCase().endsWith('.sf2'))
    .map(f => path.join(directory, f));

  const results = [];
  let processed = 0;

  for (const sf2Path of sf2Files) {
    const result = await analyzeSoundFont(sf2Path);
    if (result) {
      results.push(result);
    }
    processed++;
    if (progressCallback) {
      progressCallback(processed, sf2Files.length, path.basename(sf2Path));
    }
  }

  return results;
}

/**
 * Build and save a complete soundfont index
 * @param {string} directory - Directory containing SF2 files
 * @param {string} outputPath - Where to save the JSON index
 * @returns {Promise<Object>} The complete index
 */
export async function buildSoundFontIndex(directory, outputPath) {
  console.log(`Scanning ${directory} for SF2 files...`);

  const soundfonts = await analyzeDirectory(directory, (current, total, filename) => {
    const pct = Math.round((current / total) * 100);
    process.stdout.write(`\r[${pct}%] ${current}/${total} - ${filename.substring(0, 40).padEnd(40)}`);
  });

  console.log('\n');

  const index = {
    generated: new Date().toISOString(),
    sourceDirectory: directory,
    totalSoundfonts: soundfonts.length,
    totalPresets: soundfonts.reduce((sum, sf) => sum + sf.presetCount, 0),
    soundfonts: soundfonts
  };

  // Save the index
  fs.writeFileSync(outputPath, JSON.stringify(index, null, 2));
  console.log(`Index saved to ${outputPath}`);
  console.log(`Total soundfonts: ${index.totalSoundfonts}`);
  console.log(`Total presets: ${index.totalPresets}`);

  return index;
}

/**
 * Load a pre-computed soundfont index
 * @param {string} indexPath - Path to the JSON index file
 * @returns {Object} The loaded index
 */
export function loadSoundFontIndex(indexPath) {
  return JSON.parse(fs.readFileSync(indexPath, 'utf8'));
}

/**
 * Find soundfonts that have a specific GM program number
 * @param {Object} index - The soundfont index
 * @param {number} program - MIDI program number (0-127)
 * @param {number} [bank=0] - Bank number (default 0 for GM)
 * @returns {Array} Soundfonts with matching presets
 */
export function findSoundfontsForProgram(index, program, bank = 0) {
  return index.soundfonts
    .filter(sf => sf.presets.some(p => p.program === program && p.bank === bank))
    .map(sf => ({
      filename: sf.filename,
      preset: sf.presets.find(p => p.program === program && p.bank === bank)
    }));
}

/**
 * Get a summary of instruments available for common GM programs
 * @param {Object} index - The soundfont index
 * @param {Array<string>} soundfontNames - List of soundfont filenames to check
 * @returns {Object} Summary of available instruments by program
 */
export function getInstrumentSummary(index, soundfontNames) {
  const gmPrograms = {
    0: 'Acoustic Grand Piano',
    4: 'Electric Piano',
    24: 'Acoustic Guitar (nylon)',
    25: 'Acoustic Guitar (steel)',
    26: 'Electric Guitar (jazz)',
    27: 'Electric Guitar (clean)',
    28: 'Electric Guitar (muted)',
    29: 'Overdriven Guitar',
    30: 'Distortion Guitar',
    32: 'Acoustic Bass',
    33: 'Electric Bass (finger)',
    34: 'Electric Bass (pick)',
    35: 'Fretless Bass',
    40: 'Violin',
    41: 'Viola',
    42: 'Cello',
    43: 'Contrabass',
    48: 'String Ensemble 1',
    56: 'Trumpet',
    57: 'Trombone',
    60: 'French Horn',
    61: 'Brass Section',
    68: 'Oboe',
    71: 'Clarinet',
    73: 'Flute',
    80: 'Lead 1 (square)',
    81: 'Lead 2 (sawtooth)',
    88: 'Pad 1 (new age)',
    89: 'Pad 2 (warm)',
    // Drums are on bank 128 or channel 10
  };

  const summary = {};

  // Filter to only specified soundfonts
  const selectedSoundfonts = index.soundfonts.filter(sf =>
    soundfontNames.some(name => sf.filename.toLowerCase().includes(name.toLowerCase()))
  );

  for (const [program, gmName] of Object.entries(gmPrograms)) {
    const progNum = parseInt(program);
    const available = selectedSoundfonts
      .map(sf => {
        const preset = sf.presets.find(p => p.program === progNum && p.bank === 0);
        return preset ? { soundfont: sf.filename, preset: preset.name } : null;
      })
      .filter(Boolean);

    if (available.length > 0) {
      summary[gmName] = available;
    }
  }

  return summary;
}

/**
 * Generate LLM-friendly context about available instruments
 * @param {Object} index - The soundfont index
 * @param {Array<string>} soundfontNames - List of soundfont filenames in use
 * @returns {string} Formatted string for LLM context
 */
export function generateLLMContext(index, soundfontNames) {
  const summary = getInstrumentSummary(index, soundfontNames);

  let context = `AVAILABLE INSTRUMENTS (from loaded soundfonts):\n\n`;

  for (const [instrument, sources] of Object.entries(summary)) {
    const sourceList = sources.slice(0, 3).map(s => `"${s.preset}" (${s.soundfont})`).join(', ');
    context += `- ${instrument}: ${sourceList}\n`;
  }

  context += `\nUse standard GM program numbers. These soundfonts provide high-quality samples for the instruments listed above.\n`;

  return context;
}

// CLI entry point
if (import.meta.url === `file://${process.argv[1]}`) {
  const args = process.argv.slice(2);

  if (args[0] === 'build' && args[1]) {
    const directory = args[1];
    const outputPath = args[2] || path.join(directory, 'soundfont_index.json');

    buildSoundFontIndex(directory, outputPath)
      .then(() => process.exit(0))
      .catch(err => {
        console.error(err);
        process.exit(1);
      });
  } else if (args[0] === 'query' && args[1] && args[2]) {
    const indexPath = args[1];
    const program = parseInt(args[2]);
    const index = loadSoundFontIndex(indexPath);
    const results = findSoundfontsForProgram(index, program);
    console.log(JSON.stringify(results, null, 2));
  } else {
    console.log(`Usage:
  node soundfont-analyzer.js build <directory> [output.json]
    Build index from SF2 directory

  node soundfont-analyzer.js query <index.json> <program>
    Find soundfonts with specific GM program number
`);
  }
}
