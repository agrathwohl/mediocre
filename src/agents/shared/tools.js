/**
 * Shared tools for AI SDK v6 agents
 * Common tools used across multiple agents
 */

import { tool } from 'ai';
import { z } from 'zod';
import { validateAbcNotation } from '../../utils/claude.js';
import fs from 'fs/promises';

// Cache the soundfont index
let soundfontIndex = null;
const SOUNDFONT_INDEX_PATH = '/home/gwohl/code/mediocre/soundfonts/soundfont_index.json';

/**
 * Instrument synonym map for fuzzy matching.
 * When the agent searches for "piano", we also match "steinway", "grand", "keys", etc.
 * Keys are canonical terms, values are arrays of synonyms/related terms.
 */
const INSTRUMENT_SYNONYMS = {
  piano: ['steinway', 'grand', 'upright', 'keys', 'keyboard', 'concert', 'rhodes', 'wurlitzer', 'epiano', 'e.piano', 'electric piano', 'pianoforte', 'bright acoustic', 'honky'],
  guitar: ['strat', 'stratocaster', 'telecaster', 'tele', 'les paul', 'nylon', 'steel string', 'acoustic guitar', 'electric guitar', 'classical guitar', 'jazz guitar', 'clean guitar', 'overdriven', 'distortion guitar'],
  bass: ['electric bass', 'bass guitar', 'upright bass', 'double bass', 'fretless', 'slap bass', 'synth bass', 'sub bass', 'fingered bass', 'picked bass', 'acoustic bass'],
  strings: ['violin', 'viola', 'cello', 'contrabass', 'string ensemble', 'orchestral strings', 'chamber strings', 'pizzicato', 'tremolo strings'],
  brass: ['trumpet', 'trombone', 'french horn', 'tuba', 'flugelhorn', 'cornet', 'brass ensemble', 'brass section', 'muted trumpet', 'horn'],
  woodwind: ['flute', 'clarinet', 'oboe', 'bassoon', 'piccolo', 'english horn', 'recorder', 'fife', 'pan flute'],
  saxophone: ['sax', 'alto sax', 'tenor sax', 'soprano sax', 'baritone sax', 'bari sax'],
  synth: ['synthesizer', 'analog', 'moog', 'prophet', 'juno', 'oberheim', 'minimoog', 'polysix', 'analog synth', 'digital synth', 'square wave', 'sawtooth', 'saw'],
  drums: ['drum kit', 'percussion', 'kick', 'snare', 'hi-hat', 'hihat', 'cymbal', 'tom', 'drum machine', 'drumset', 'kit'],
  organ: ['hammond', 'b3', 'pipe organ', 'church organ', 'drawbar', 'leslie', 'farfisa', 'vox organ', 'reed organ', 'rock organ', 'percussive organ'],
  pad: ['atmosphere', 'ambient', 'texture', 'drone', 'soundscape', 'ethereal', 'warm pad', 'sweep', 'string pad', 'new age', 'halo'],
  harpsichord: ['cembalo', 'clavecin', 'virginal', 'spinet', 'clavi'],
  choir: ['vocal', 'voice', 'chorus', 'aah', 'ooh', 'aahs', 'oohs', 'soprano', 'alto', 'baritone'],
  harp: ['celtic harp', 'concert harp', 'pedal harp', 'orchestral harp'],
  marimba: ['xylophone', 'vibraphone', 'vibes', 'glockenspiel', 'bells', 'tubular bells', 'mallet', 'celesta', 'music box'],
  accordion: ['concertina', 'bandoneon', 'squeezebox', 'harmonica', 'melodica', 'tango accordion'],
  sitar: ['tanpura', 'sarangi', 'veena', 'sarod', 'tambura'],
  lead: ['lead synth', 'square wave', 'saw wave', 'sawtooth', 'mono lead', 'charang', 'calliope', 'chiff'],
  fm: ['dx7', 'fm synthesis', 'frequency modulation', 'yamaha dx', 'fm electric piano', 'dx'],
  '808': ['tr-808', 'roland 808', '808 bass', '808 kick', '808 hat', 'eight oh eight'],
  '909': ['tr-909', 'roland 909', '909 kick', '909 hat'],
  ethnic: ['world', 'folk', 'traditional', 'shamisen', 'koto', 'kalimba', 'bagpipe', 'fiddle', 'shanai', 'banjo'],
  orchestral: ['orchestra', 'symphonic', 'symphony', 'philharmonic', 'concert'],
  retro: ['vintage', '8bit', '16bit', 'chip', 'nes', 'snes', 'chiptune', 'game', 'lo-fi', 'lofi'],
};

/**
 * Expand keyword list with synonyms for fuzzy matching.
 * Returns an object with directTerms and synonymTerms for differential scoring.
 */
function expandWithSynonyms(keywords) {
  const direct = new Set(keywords.map(k => k.toLowerCase()));
  const synonyms = new Set();

  for (const keyword of keywords) {
    const kLower = keyword.toLowerCase();

    // If keyword is a canonical key, add all its synonyms
    if (INSTRUMENT_SYNONYMS[kLower]) {
      INSTRUMENT_SYNONYMS[kLower].forEach(syn => synonyms.add(syn));
    }

    // If keyword appears in any synonym list, add the canonical term + siblings
    for (const [canonical, syns] of Object.entries(INSTRUMENT_SYNONYMS)) {
      if (syns.some(syn => syn.includes(kLower) || kLower.includes(syn))) {
        if (!direct.has(canonical)) synonyms.add(canonical);
        syns.forEach(syn => {
          if (!direct.has(syn)) synonyms.add(syn);
        });
      }
    }
  }

  // Remove any direct terms from synonyms to avoid double-counting
  for (const d of direct) {
    synonyms.delete(d);
  }

  return {
    directTerms: Array.from(direct),
    synonymTerms: Array.from(synonyms),
    allTerms: [...Array.from(direct), ...Array.from(synonyms)],
  };
}

/**
 * General MIDI Program Names (0-127)
 */
const GM_PROGRAM_NAMES = {
  0: 'Acoustic Grand Piano', 1: 'Bright Acoustic Piano', 2: 'Electric Grand Piano',
  3: 'Honky-tonk Piano', 4: 'Electric Piano 1 (Rhodes)', 5: 'Electric Piano 2 (DX)',
  6: 'Harpsichord', 7: 'Clavi', 8: 'Celesta', 9: 'Glockenspiel',
  10: 'Music Box', 11: 'Vibraphone', 12: 'Marimba', 13: 'Xylophone',
  14: 'Tubular Bells', 15: 'Dulcimer', 16: 'Drawbar Organ', 17: 'Percussive Organ',
  18: 'Rock Organ', 19: 'Church Organ', 20: 'Reed Organ', 21: 'Accordion',
  22: 'Harmonica', 23: 'Tango Accordion', 24: 'Acoustic Guitar (nylon)',
  25: 'Acoustic Guitar (steel)', 26: 'Electric Guitar (jazz)', 27: 'Electric Guitar (clean)',
  28: 'Electric Guitar (muted)', 29: 'Overdriven Guitar', 30: 'Distortion Guitar',
  31: 'Guitar Harmonics', 32: 'Acoustic Bass', 33: 'Electric Bass (finger)',
  34: 'Electric Bass (pick)', 35: 'Fretless Bass', 36: 'Slap Bass 1',
  37: 'Slap Bass 2', 38: 'Synth Bass 1', 39: 'Synth Bass 2',
  40: 'Violin', 41: 'Viola', 42: 'Cello', 43: 'Contrabass',
  44: 'Tremolo Strings', 45: 'Pizzicato Strings', 46: 'Orchestral Harp',
  47: 'Timpani', 48: 'String Ensemble 1', 49: 'String Ensemble 2',
  50: 'Synth Strings 1', 51: 'Synth Strings 2', 52: 'Choir Aahs',
  53: 'Voice Oohs', 54: 'Synth Voice', 55: 'Orchestra Hit',
  56: 'Trumpet', 57: 'Trombone', 58: 'Tuba', 59: 'Muted Trumpet',
  60: 'French Horn', 61: 'Brass Section', 62: 'Synth Brass 1',
  63: 'Synth Brass 2', 64: 'Soprano Sax', 65: 'Alto Sax',
  66: 'Tenor Sax', 67: 'Baritone Sax', 68: 'Oboe', 69: 'English Horn',
  70: 'Bassoon', 71: 'Clarinet', 72: 'Piccolo', 73: 'Flute',
  74: 'Recorder', 75: 'Pan Flute', 76: 'Blown Bottle', 77: 'Shakuhachi',
  78: 'Whistle', 79: 'Ocarina', 80: 'Lead 1 (square)', 81: 'Lead 2 (sawtooth)',
  82: 'Lead 3 (calliope)', 83: 'Lead 4 (chiff)', 84: 'Lead 5 (charang)',
  85: 'Lead 6 (voice)', 86: 'Lead 7 (fifths)', 87: 'Lead 8 (bass+lead)',
  88: 'Pad 1 (new age)', 89: 'Pad 2 (warm)', 90: 'Pad 3 (polysynth)',
  91: 'Pad 4 (choir)', 92: 'Pad 5 (bowed)', 93: 'Pad 6 (metallic)',
  94: 'Pad 7 (halo)', 95: 'Pad 8 (sweep)', 96: 'FX 1 (rain)',
  97: 'FX 2 (soundtrack)', 98: 'FX 3 (crystal)', 99: 'FX 4 (atmosphere)',
  100: 'FX 5 (brightness)', 101: 'FX 6 (goblins)', 102: 'FX 7 (echoes)',
  103: 'FX 8 (sci-fi)', 104: 'Sitar', 105: 'Banjo', 106: 'Shamisen',
  107: 'Koto', 108: 'Kalimba', 109: 'Bagpipe', 110: 'Fiddle',
  111: 'Shanai', 112: 'Tinkle Bell', 113: 'Agogo', 114: 'Steel Drums',
  115: 'Woodblock', 116: 'Taiko Drum', 117: 'Melodic Tom',
  118: 'Synth Drum', 119: 'Reverse Cymbal', 120: 'Guitar Fret Noise',
  121: 'Breath Noise', 122: 'Seashore', 123: 'Bird Tweet',
  124: 'Telephone Ring', 125: 'Helicopter', 126: 'Applause', 127: 'Gunshot',
};

/**
 * Load soundfont index (cached)
 */
async function loadSoundfontIndex() {
  if (!soundfontIndex) {
    const data = await fs.readFile(SOUNDFONT_INDEX_PATH, 'utf-8');
    soundfontIndex = JSON.parse(data);
  }
  return soundfontIndex;
}

/**
 * Validate ABC notation syntax and structure
 * Used by: Composition Agent, QA Agent, Ornamentation Agent, MIDI Extensions Agent
 */
export const validateAbcTool = tool({
  description: 'Validate ABC notation syntax, structure, and playability. Pass either abcNotation (inline text) or filePath (path to .abc file on disk). Call this ONLY after you have generated a complete composition draft — never before generating music.',
  inputSchema: z.object({
    abcNotation: z.string().optional().describe('The ABC notation text to validate (use this when you have the notation in memory)'),
    filePath: z.string().optional().describe('Path to an .abc file on disk to validate (preferred — avoids duplicating large notation in context)'),
  }),
  execute: async ({ abcNotation, filePath }) => {
    let notation = abcNotation;
    if (filePath && !notation) {
      notation = await fs.readFile(filePath, 'utf-8');
    }
    if (!notation) {
      return { isValid: false, issues: ['No notation provided — pass abcNotation or filePath'], issueCount: 1, warnings: [], warningCount: 0, recommendations: 'Provide abcNotation or filePath' };
    }

    const validation = await validateAbcNotation(notation);
    const hasWarnings = validation.warnings?.length > 0;
    const hasIssues = validation.issues.length > 0;

    return {
      isValid: validation.isValid,
      issues: validation.issues,
      issueCount: validation.issues.length,
      warnings: validation.warnings || [],
      warningCount: validation.warnings?.length || 0,
      recommendations: hasIssues
        ? `Fix ${validation.issues.length} error(s): ${validation.issues.join('; ')}`
        : hasWarnings
          ? `No errors, but ${validation.warnings.length} timing warning(s) — fix bar note lengths so each bar sums to the correct duration. Sample: ${validation.warnings.slice(0, 5).join('; ')}`
          : 'Notation is valid and ready',
    };
  },
});

/**
 * Read an ABC file from disk
 * Used by: QA Agent (to read composition content without embedding it in prompt)
 */
export const readAbcFileTool = tool({
  description: 'Read the contents of an ABC notation file from disk. Use this to load a composition for musical review.',
  inputSchema: z.object({
    filePath: z.string().describe('Path to the .abc file to read'),
  }),
  execute: async ({ filePath }) => {
    const content = await fs.readFile(filePath, 'utf-8');
    return { content, byteLength: Buffer.byteLength(content, 'utf-8') };
  },
});

/**
 * Extract instruments from ABC notation
 * Used by: Composition Agent, Soundfont Agent, MIDI Extensions Agent
 */
export const extractInstrumentsTool = tool({
  description: 'Extract MIDI instruments and program numbers from ABC notation. Returns list of instruments used.',
  inputSchema: z.object({
    abcNotation: z.string().describe('The ABC notation to analyze'),
  }),
  execute: async ({ abcNotation }) => {
    const { extractInstruments } = await import('../../commands/generate-abc.js');
    const instruments = extractInstruments(abcNotation);

    return {
      instruments,
      count: instruments.length,
      instrumentList: instruments.join(', '),
      hasMultipleInstruments: instruments.length > 1,
    };
  },
});

/**
 * Check if a title already exists in compositions.json
 * Used by: Title Agent, Composition Agent
 */
export const checkTitleExistsTool = tool({
  description: 'Check if a composition title is already in use. Returns existence status and recommendation.',
  inputSchema: z.object({
    title: z.string().describe('The title to check for uniqueness'),
  }),
  execute: async ({ title }) => {
    // Import titleExists function from claude.js
    const fsSync = await import('fs');
    const { default: path } = await import('path');

    // Check if title exists in compositions.json
    const possiblePaths = [
      path.join(process.cwd(), 'docs/data/compositions.json'),
      path.join(process.cwd(), '../../docs/data/compositions.json'),
    ];

    let titleExists = false;
    for (const compositionsPath of possiblePaths) {
      try {
        await fsSync.default.promises.access(compositionsPath);
        const content = await fsSync.default.promises.readFile(compositionsPath, 'utf8');
        const compositions = JSON.parse(content);
        if (Array.isArray(compositions)) {
          titleExists = compositions.some(
            c => c.title && c.title.toLowerCase().trim() === title.toLowerCase().trim()
          );
          if (titleExists) break;
        }
      } catch (error) {
        // Continue to next path
      }
    }

    return {
      exists: titleExists,
      message: titleExists
        ? 'Title already exists - generate a different, unique title'
        : 'Title is unique and available',
      recommendation: titleExists
        ? 'Try adding a unique modifier or creative variation'
        : 'Title can be used',
    };
  },
});

/**
 * Search soundfont catalog by keywords with fuzzy synonym matching.
 * Returns matching soundfonts WITH their matching presets (program/bank numbers)
 * so the agent can see exactly what instruments each soundfont provides.
 * Used by: Soundfont Agent
 */
export const searchSoundfontCatalogTool = tool({
  description: 'Search the soundfont catalog (500 soundfonts, 81k+ presets) by keywords with fuzzy synonym matching. Returns matching soundfonts WITH their matching presets (MIDI program and bank numbers) so you can see exactly what instruments each soundfont provides. Synonyms are expanded automatically — searching "piano" also matches "steinway", "grand", "keys", "rhodes", etc.',
  inputSchema: z.object({
    keywords: z.array(z.string()).describe('Keywords to search for (e.g., ["piano", "synth", "orchestral"]). Synonyms are expanded automatically.'),
    limit: z.number().optional().describe('Maximum soundfont results to return (default 20)'),
    presetsPerResult: z.number().optional().describe('Maximum matching presets to show per soundfont (default 5)'),
  }),
  execute: async ({ keywords, limit = 20, presetsPerResult = 5 }) => {
    const index = await loadSoundfontIndex();
    const { directTerms, synonymTerms } = expandWithSynonyms(keywords);

    const results = index.soundfonts
      .map(sf => {
        const filename = sf.filename.toLowerCase();
        const metadata = [
          sf.metadata?.name || '',
          sf.metadata?.author || '',
          sf.metadata?.comment || '',
          sf.metadata?.product || '',
        ].join(' ').toLowerCase();
        const searchText = `${filename} ${metadata}`;

        let score = 0;
        const matchedKeywords = [];
        const matchedPresets = [];

        // Direct keyword matches (high score)
        for (const term of directTerms) {
          if (searchText.includes(term)) {
            score += 10;
            matchedKeywords.push(term);
          }
        }

        // Synonym matches (lower score)
        for (const term of synonymTerms) {
          if (searchText.includes(term)) {
            score += 3;
            matchedKeywords.push(`~${term}`);
          }
        }

        // Search presets — return actual program/bank numbers
        if (sf.presets) {
          for (const preset of sf.presets) {
            const presetLower = preset.name.toLowerCase();
            let presetMatched = false;

            for (const term of directTerms) {
              if (presetLower.includes(term)) {
                score += 2;
                presetMatched = true;
              }
            }
            for (const term of synonymTerms) {
              if (presetLower.includes(term)) {
                score += 1;
                presetMatched = true;
              }
            }

            if (presetMatched && matchedPresets.length < presetsPerResult) {
              matchedPresets.push({
                name: preset.name,
                bank: preset.bank,
                program: preset.program,
                gmName: preset.bank === 0 ? (GM_PROGRAM_NAMES[preset.program] || '') : '',
              });
            }
          }
        }

        return {
          soundfont: sf.filename,
          score,
          matchedKeywords: [...new Set(matchedKeywords)],
          matchedPresets,
          presetCount: sf.presetCount,
          metadata: sf.metadata,
          size: sf.size,
        };
      })
      .filter(r => r.score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, limit);

    return {
      totalMatches: results.length,
      searchedKeywords: directTerms,
      synonymsExpanded: synonymTerms.length > 0 ? synonymTerms.slice(0, 15) : [],
      results: results.map(r => ({
        filename: r.soundfont,
        score: r.score,
        matchedKeywords: r.matchedKeywords,
        presetCount: r.presetCount,
        author: r.metadata?.author || 'Unknown',
        comment: r.metadata?.comment || '',
        matchedPresets: r.matchedPresets,
      })),
      message: results.length > 0
        ? `Found ${results.length} soundfonts matching: ${directTerms.join(', ')}${synonymTerms.length > 0 ? ` (+ ${synonymTerms.length} synonym expansions)` : ''}`
        : 'No soundfonts found matching criteria',
    };
  },
});

/**
 * Get detailed information about a specific soundfont.
 * Returns full preset list with MIDI program and bank numbers.
 * Used by: Soundfont Agent
 */
export const getSoundfontDetailsTool = tool({
  description: 'Get detailed information about a specific soundfont, including its full preset list with MIDI program and bank numbers. Use this to inspect exactly what instruments a soundfont provides before selecting it.',
  inputSchema: z.object({
    filename: z.string().describe('Soundfont filename (e.g., "GeneralUser GS v1.471.sf2")'),
    programFilter: z.array(z.number()).optional().describe('Only return presets matching these MIDI program numbers (0-127). Omit to get all presets.'),
    bankFilter: z.number().optional().describe('Only return presets in this bank number. 0 = melodic instruments, 128 = percussion/drums.'),
  }),
  execute: async ({ filename, programFilter, bankFilter }) => {
    const index = await loadSoundfontIndex();
    const sf = index.soundfonts.find(s =>
      s.filename === filename || s.filename.toLowerCase() === filename.toLowerCase()
    );

    if (!sf) {
      return {
        found: false,
        message: `Soundfont "${filename}" not found in catalog. Use search_soundfont_catalog to find soundfonts by keyword.`,
      };
    }

    let presets = sf.presets || [];

    // Apply filters
    if (programFilter && programFilter.length > 0) {
      presets = presets.filter(p => programFilter.includes(p.program));
    }
    if (bankFilter !== undefined && bankFilter !== null) {
      presets = presets.filter(p => p.bank === bankFilter);
    }

    // Group presets by bank for clarity
    const presetsByBank = {};
    for (const preset of presets) {
      const bankKey = preset.bank === 0 ? 'melodic (bank 0)' : preset.bank === 128 ? 'percussion (bank 128)' : `bank ${preset.bank}`;
      if (!presetsByBank[bankKey]) presetsByBank[bankKey] = [];
      presetsByBank[bankKey].push({
        program: preset.program,
        name: preset.name,
        gmName: preset.bank === 0 ? (GM_PROGRAM_NAMES[preset.program] || '') : '',
      });
    }

    // Sort within each bank by program number
    for (const bank of Object.values(presetsByBank)) {
      bank.sort((a, b) => a.program - b.program);
    }

    // Also provide a flat list (capped at 60 for context efficiency)
    const flatPresets = presets.slice(0, 60).map(p => ({
      bank: p.bank,
      program: p.program,
      name: p.name,
      gmName: p.bank === 0 ? (GM_PROGRAM_NAMES[p.program] || '') : '',
    }));

    return {
      found: true,
      filename: sf.filename,
      metadata: {
        name: sf.metadata?.name || sf.filename,
        author: sf.metadata?.author || 'Unknown',
        comment: sf.metadata?.comment || '',
        creationDate: sf.metadata?.creationDate || '',
        product: sf.metadata?.product || '',
      },
      size: sf.size,
      totalPresets: sf.presetCount,
      returnedPresets: presets.length,
      filtered: !!(programFilter || bankFilter !== undefined),
      presetsByBank,
      presets: flatPresets,
      hasMore: presets.length > 60,
    };
  },
});

/**
 * Check which soundfonts provide coverage for specific MIDI program numbers.
 * Essential for ensuring a soundfont stack covers all instruments in a composition.
 * Used by: Soundfont Agent, TiMidity Config Agent
 */
export const checkProgramCoverageTool = tool({
  description: 'Check which soundfonts provide coverage for specific MIDI program numbers. Use this to verify your selected soundfont stack covers all instruments the composition needs, and to find gaps in coverage.',
  inputSchema: z.object({
    programs: z.array(z.number()).describe('MIDI program numbers to check coverage for (0-127). Example: [0, 6, 32, 48, 80] for piano, harpsichord, acoustic bass, strings, square lead'),
    soundfonts: z.array(z.string()).optional().describe('Only check these specific soundfonts (your selected stack). Omit to search the entire 500-soundfont catalog.'),
    maxPerProgram: z.number().optional().describe('Maximum soundfonts to return per program (default 5)'),
  }),
  execute: async ({ programs, soundfonts: sfFilter, maxPerProgram = 5 }) => {
    const index = await loadSoundfontIndex();

    let candidates = index.soundfonts;
    if (sfFilter && sfFilter.length > 0) {
      const filterLower = sfFilter.map(f => f.toLowerCase());
      candidates = candidates.filter(sf =>
        filterLower.includes(sf.filename.toLowerCase())
      );
    }

    const coverage = {};
    const gaps = [];
    const covered = [];

    for (const program of programs) {
      const providers = [];

      for (const sf of candidates) {
        if (!sf.presets) continue;
        const matchingPresets = sf.presets.filter(p => p.program === program && p.bank === 0);

        if (matchingPresets.length > 0) {
          providers.push({
            filename: sf.filename,
            presetName: matchingPresets[0].name,
            bankCount: matchingPresets.length,
          });
        }
      }

      // Sort by bank count (more = likely more complete coverage)
      providers.sort((a, b) => b.bankCount - a.bankCount);

      const gmName = GM_PROGRAM_NAMES[program] || `Program ${program}`;
      coverage[program] = {
        programNumber: program,
        gmName,
        coveredBy: providers.slice(0, maxPerProgram),
        totalProviders: providers.length,
        isCovered: providers.length > 0,
      };

      if (providers.length > 0) {
        covered.push({ program, gmName });
      } else {
        gaps.push({ program, gmName });
      }
    }

    return {
      totalRequested: programs.length,
      totalCovered: covered.length,
      totalGaps: gaps.length,
      gaps,
      covered: covered.map(c => `${c.program}: ${c.gmName}`),
      coverage,
      searchScope: sfFilter
        ? `${candidates.length} specified soundfonts`
        : `All ${index.soundfonts.length} soundfonts in catalog`,
    };
  },
});

/**
 * All shared tools registry
 * Export as object for easy access
 */
export const sharedTools = {
  validateAbc: validateAbcTool,
  extractInstruments: extractInstrumentsTool,
  checkTitleExists: checkTitleExistsTool,
  searchSoundfontCatalog: searchSoundfontCatalogTool,
  getSoundfontDetails: getSoundfontDetailsTool,
  checkProgramCoverage: checkProgramCoverageTool,
};
