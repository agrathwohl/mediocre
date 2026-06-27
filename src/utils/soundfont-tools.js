import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Cache the soundfont index to avoid repeated file reads
let cachedIndex = null;

const SOUNDFONT_INDEX_PATH = '/home/gwohl/code/mediocre/soundfonts/soundfont_index.json';
const SOUNDFONT_DIR = '/home/gwohl/code/mediocre/soundfonts/500-soundfonts-full-gm-sets';

/**
 * BLACKLISTED SOUNDFONTS - These crash TiMidity with segfaults
 * DO NOT USE THESE UNDER ANY CIRCUMSTANCES
 */
export const BANNED_SOUNDFONTS = [
  'ColomboGMGS2.sf2',                        // CRASHES TIMIDITY - vlist[32] overflow
  'DSoundFont Gaming Edition (3.51).sf2',    // 1.4 GB - causes OOM segfault
  'The Fairy Tale Bank 2.sf2',               // 1.1 GB - causes OOM segfault
];

/**
 * Genre-to-soundfont mapping for intelligent recommendations
 * Maps genre keywords to soundfont characteristics that work well
 */
const GENRE_SOUNDFONT_MAPPING = {
  // Classical genres
  baroque: ['harpsichord', 'organ', 'strings', 'chamber', 'orchestral', 'flute', 'recorder'],
  classical: ['piano', 'orchestral', 'strings', 'woodwind', 'brass', 'timpani'],
  romantic: ['piano', 'orchestral', 'strings', 'harp', 'brass', 'woodwind', 'choir'],
  impressionist: ['piano', 'harp', 'woodwind', 'strings', 'celesta', 'flute'],
  minimalist: ['piano', 'strings', 'marimba', 'vibraphone', 'bells'],
  contemporary: ['orchestral', 'percussion', 'piano', 'strings', 'experimental'],
  opera: ['choir', 'orchestral', 'strings', 'brass', 'woodwind', 'harp'],
  chamber: ['strings', 'piano', 'woodwind', 'harpsichord'],
  symphony: ['orchestral', 'brass', 'strings', 'woodwind', 'timpani', 'percussion'],

  // Modern/Electronic genres
  electronic: ['synth', 'fm', 'pad', 'lead', 'bass', 'analog', 'digital', 'arpeggio'],
  synthwave: ['synth', 'analog', 'fm', 'retro', 'pad', 'lead', '80s', 'bass'],
  ambient: ['pad', 'atmosphere', 'drone', 'strings', 'synth', 'ethereal'],
  techno: ['synth', 'bass', 'kick', 'electronic', '808', '909', 'industrial'],
  house: ['piano', 'organ', 'bass', 'synth', 'strings', 'brass'],
  trance: ['synth', 'lead', 'pad', 'arpeggio', 'strings', 'choir'],
  dubstep: ['bass', 'wobble', 'synth', 'growl', 'reese'],
  idm: ['glitch', 'synth', 'experimental', 'fm', 'granular'],
  vaporwave: ['fm', '80s', 'retro', 'synth', 'pad', 'sax', 'jazz'],
  chiptune: ['8bit', '16bit', 'chip', 'nes', 'snes', 'game', 'retro'],

  // Rock/Metal genres
  rock: ['guitar', 'electric', 'bass', 'drums', 'organ'],
  metal: ['guitar', 'distortion', 'bass', 'drums', 'heavy'],
  punk: ['guitar', 'bass', 'drums', 'raw'],
  grunge: ['guitar', 'bass', 'drums', 'distortion'],
  progressive: ['synth', 'guitar', 'bass', 'orchestral', 'piano', 'mellotron'],

  // Jazz/Blues genres
  jazz: ['piano', 'bass', 'saxophone', 'trumpet', 'drums', 'vibraphone', 'guitar'],
  bebop: ['piano', 'bass', 'saxophone', 'trumpet', 'drums'],
  fusion: ['guitar', 'bass', 'synth', 'saxophone', 'drums', 'piano'],
  blues: ['guitar', 'harmonica', 'piano', 'bass', 'organ'],
  swing: ['brass', 'saxophone', 'piano', 'bass', 'clarinet'],
  bigband: ['brass', 'saxophone', 'piano', 'bass', 'drums', 'clarinet'],

  // World/Folk genres
  folk: ['acoustic', 'guitar', 'fiddle', 'banjo', 'mandolin', 'harmonica'],
  celtic: ['fiddle', 'harp', 'flute', 'tin whistle', 'bagpipe', 'bodhran'],
  latin: ['guitar', 'percussion', 'brass', 'maracas', 'congas', 'timbales'],
  african: ['percussion', 'drums', 'kalimba', 'marimba', 'djembe'],
  asian: ['koto', 'shamisen', 'erhu', 'shakuhachi', 'gamelan', 'sitar'],
  indian: ['sitar', 'tabla', 'tanpura', 'sarangi'],
  middle_eastern: ['oud', 'darbuka', 'kanun', 'ney'],

  // Hip-hop/Urban genres
  hiphop: ['bass', '808', 'synth', 'piano', 'strings', 'brass'],
  trap: ['808', 'hi-hat', 'bass', 'synth', 'bells'],
  lofi: ['piano', 'vinyl', 'jazz', 'Rhodes', 'bass'],
  rnb: ['piano', 'Rhodes', 'bass', 'strings', 'synth'],
  soul: ['organ', 'piano', 'brass', 'strings', 'bass'],
  funk: ['bass', 'guitar', 'organ', 'brass', 'clavinet'],
  disco: ['strings', 'bass', 'brass', 'synth', 'piano'],

  // Other genres
  country: ['guitar', 'steel', 'fiddle', 'banjo', 'bass', 'harmonica'],
  reggae: ['bass', 'guitar', 'organ', 'drums', 'brass'],
  ska: ['brass', 'guitar', 'organ', 'bass'],
  cinematic: ['orchestral', 'strings', 'brass', 'percussion', 'choir', 'piano'],
  soundtrack: ['orchestral', 'strings', 'brass', 'woodwind', 'synth', 'choir'],
  newage: ['piano', 'synth', 'pad', 'harp', 'flute', 'strings'],
  gospel: ['organ', 'piano', 'choir', 'bass', 'drums'],

  // Era-based
  '80s': ['fm', 'synth', 'dx7', 'linn', 'slap bass', 'gated'],
  '90s': ['synth', 'piano', 'strings', 'guitar', 'bass'],
  retro: ['analog', 'vintage', 'tape', 'warm', 'lo-fi'],
  modern: ['hybrid', 'cinematic', 'epic', 'trailer'],
};

/**
 * MIDI program number to instrument category mapping
 */
const MIDI_PROGRAM_CATEGORIES = {
  piano: [0, 1, 2, 3, 4, 5, 6, 7],
  chromatic: [8, 9, 10, 11, 12, 13, 14, 15],
  organ: [16, 17, 18, 19, 20, 21, 22, 23],
  guitar: [24, 25, 26, 27, 28, 29, 30, 31],
  bass: [32, 33, 34, 35, 36, 37, 38, 39],
  strings: [40, 41, 42, 43, 44, 45, 46, 47],
  ensemble: [48, 49, 50, 51, 52, 53, 54, 55],
  brass: [56, 57, 58, 59, 60, 61, 62, 63],
  reed: [64, 65, 66, 67, 68, 69, 70, 71],
  pipe: [72, 73, 74, 75, 76, 77, 78, 79],
  synth_lead: [80, 81, 82, 83, 84, 85, 86, 87],
  synth_pad: [88, 89, 90, 91, 92, 93, 94, 95],
  synth_fx: [96, 97, 98, 99, 100, 101, 102, 103],
  ethnic: [104, 105, 106, 107, 108, 109, 110, 111],
  percussion: [112, 113, 114, 115, 116, 117, 118, 119],
  sfx: [120, 121, 122, 123, 124, 125, 126, 127],
};

/**
 * Load the soundfont index from disk
 * @returns {Object} The soundfont index
 */
export async function loadSoundFontIndex() {
  if (cachedIndex) {
    return cachedIndex;
  }

  try {
    const indexContent = await fs.readFile(SOUNDFONT_INDEX_PATH, 'utf8');
    const raw = JSON.parse(indexContent);
    // Strip soundfonts > 200 MB — TiMidity OOM-segfaults when total loaded
    // data is too high; individual files over this threshold are primary culprits.
    const MAX_SIZE = 200 * 1024 * 1024;
    raw.soundfonts = raw.soundfonts.filter(sf => sf.size <= MAX_SIZE);
    cachedIndex = raw;
    return cachedIndex;
  } catch (error) {
    if (error.code === 'ENOENT') {
      throw new Error(`Soundfont index not found at ${SOUNDFONT_INDEX_PATH}`);
    }
    throw error;
  }
}

/**
 * Search soundfonts by keyword
 * @param {string} query - Search query (searches filename, metadata, preset names)
 * @param {Object} options - Search options
 * @param {number} [options.limit=20] - Maximum results to return
 * @param {boolean} [options.includePresets=false] - Include matching preset details
 * @returns {Array} Matching soundfonts with relevance scores
 */
export async function searchSoundFonts(query, options = {}) {
  const { limit = 20, includePresets = false } = options;
  const index = await loadSoundFontIndex();
  const queryLower = query.toLowerCase();
  const queryTerms = queryLower.split(/\s+/).filter(t => t.length > 1);

  const results = [];

  for (const sf of index.soundfonts) {
    let score = 0;
    const matchedPresets = [];

    // Search in filename
    const filenameLower = sf.filename.toLowerCase();
    for (const term of queryTerms) {
      if (filenameLower.includes(term)) {
        score += 10;
      }
    }

    // Search in metadata
    if (sf.metadata) {
      const metaText = [
        sf.metadata.name || '',
        sf.metadata.author || '',
        sf.metadata.comment || '',
        sf.metadata.product || ''
      ].join(' ').toLowerCase();

      for (const term of queryTerms) {
        if (metaText.includes(term)) {
          score += 5;
        }
      }
    }

    // Search in preset names
    if (sf.presets && sf.presets.length > 0) {
      for (const preset of sf.presets) {
        const presetNameLower = preset.name.toLowerCase();
        for (const term of queryTerms) {
          if (presetNameLower.includes(term)) {
            score += 2;
            if (includePresets) {
              matchedPresets.push(preset);
            }
          }
        }
      }
    }

    if (score > 0) {
      results.push({
        filename: sf.filename,
        name: sf.metadata?.name || sf.filename,
        presetCount: sf.presetCount,
        score,
        comment: sf.metadata?.comment || '',
        matchedPresets: includePresets ? matchedPresets.slice(0, 10) : undefined
      });
    }
  }

  // Sort by score descending
  results.sort((a, b) => b.score - a.score);
  return results.slice(0, limit);
}

/**
 * Get soundfont recommendations for a genre hybrid
 * @param {string} genreHybrid - The genre hybrid (e.g., "baroque_x_synthwave")
 * @returns {Object} Recommended soundfonts categorized by priority
 */
export async function getSoundFontsForGenre(genreHybrid) {
  const index = await loadSoundFontIndex();

  // Parse the genre hybrid
  const genres = genreHybrid.toLowerCase().split('_x_');
  const allKeywords = new Set();

  // Collect keywords from all matching genres
  for (const genre of genres) {
    // Direct match
    if (GENRE_SOUNDFONT_MAPPING[genre]) {
      GENRE_SOUNDFONT_MAPPING[genre].forEach(k => allKeywords.add(k));
    }
    // Partial match (e.g., "synthwave" matches "synth")
    for (const [genreKey, keywords] of Object.entries(GENRE_SOUNDFONT_MAPPING)) {
      if (genre.includes(genreKey) || genreKey.includes(genre)) {
        keywords.forEach(k => allKeywords.add(k));
      }
    }
  }

  if (allKeywords.size === 0) {
    // Default to general orchestral + synth for unknown genres
    ['orchestral', 'piano', 'strings', 'synth', 'bass', 'drums'].forEach(k => allKeywords.add(k));
  }

  const keywordArray = Array.from(allKeywords);

  // Score each soundfont
  const scoredSoundfonts = [];

  for (const sf of index.soundfonts) {
    let score = 0;
    const matchedKeywords = [];

    // Check filename
    const filenameLower = sf.filename.toLowerCase();
    for (const keyword of keywordArray) {
      if (filenameLower.includes(keyword)) {
        score += 10;
        matchedKeywords.push(keyword);
      }
    }

    // Check metadata
    if (sf.metadata) {
      const metaText = [
        sf.metadata.name || '',
        sf.metadata.comment || ''
      ].join(' ').toLowerCase();

      for (const keyword of keywordArray) {
        if (metaText.includes(keyword) && !matchedKeywords.includes(keyword)) {
          score += 5;
          matchedKeywords.push(keyword);
        }
      }
    }

    // Check preset names (sample for efficiency)
    if (sf.presets) {
      const presetSample = sf.presets.slice(0, 50);
      for (const preset of presetSample) {
        const presetLower = preset.name.toLowerCase();
        for (const keyword of keywordArray) {
          if (presetLower.includes(keyword) && !matchedKeywords.includes(keyword)) {
            score += 2;
            matchedKeywords.push(keyword);
          }
        }
      }
    }

    if (score > 0) {
      scoredSoundfonts.push({
        filename: sf.filename,
        name: sf.metadata?.name || sf.filename,
        presetCount: sf.presetCount,
        score,
        matchedKeywords: [...new Set(matchedKeywords)],
        comment: sf.metadata?.comment || ''
      });
    }
  }

  // Sort by score
  scoredSoundfonts.sort((a, b) => b.score - a.score);

  // Categorize by priority
  return {
    genreHybrid,
    searchedKeywords: keywordArray,
    primary: scoredSoundfonts.slice(0, 5),       // Top 5 best matches
    secondary: scoredSoundfonts.slice(5, 15),    // Next 10 good matches
    additional: scoredSoundfonts.slice(15, 30),  // 15 more options
    totalMatches: scoredSoundfonts.length
  };
}

/**
 * Get soundfonts by instrument category
 * @param {string} category - Instrument category (piano, brass, strings, etc.)
 * @param {Object} options - Options
 * @param {number} [options.limit=10] - Maximum results
 * @returns {Array} Soundfonts strong in this category
 */
export async function getSoundFontsByCategory(category, options = {}) {
  const { limit = 10 } = options;
  const index = await loadSoundFontIndex();
  const categoryLower = category.toLowerCase();

  // Get MIDI program range for this category if it exists
  const programRange = MIDI_PROGRAM_CATEGORIES[categoryLower] || [];

  const results = [];

  for (const sf of index.soundfonts) {
    let score = 0;
    let categoryPresetCount = 0;

    // Check filename for category
    if (sf.filename.toLowerCase().includes(categoryLower)) {
      score += 20;
    }

    // Check metadata
    if (sf.metadata) {
      const metaText = (sf.metadata.name || '') + ' ' + (sf.metadata.comment || '');
      if (metaText.toLowerCase().includes(categoryLower)) {
        score += 10;
      }
    }

    // Count presets in this category's MIDI program range
    if (sf.presets && programRange.length > 0) {
      for (const preset of sf.presets) {
        if (preset.bank === 0 && programRange.includes(preset.program)) {
          categoryPresetCount++;
          score += 1;
        }
      }
    }

    // Also check preset names for category keyword
    if (sf.presets) {
      for (const preset of sf.presets) {
        if (preset.name.toLowerCase().includes(categoryLower)) {
          score += 2;
        }
      }
    }

    if (score > 0) {
      results.push({
        filename: sf.filename,
        name: sf.metadata?.name || sf.filename,
        presetCount: sf.presetCount,
        categoryPresetCount,
        score,
        comment: sf.metadata?.comment || ''
      });
    }
  }

  results.sort((a, b) => b.score - a.score);
  return results.slice(0, limit);
}

/**
 * Get a summary of available soundfont categories and their coverage
 * @returns {Object} Summary of soundfont collection
 */
export async function getSoundFontSummary() {
  const index = await loadSoundFontIndex();

  // Categorize soundfonts by detected type
  const categories = {
    'General MIDI': [],
    'Orchestral': [],
    'Piano': [],
    'Guitar': [],
    'Bass': [],
    'Drums': [],
    'Synth/Electronic': [],
    'Ethnic/World': [],
    'Chiptune/Retro': [],
    'Hardware Emulation': [],
    'Specialty': []
  };

  for (const sf of index.soundfonts) {
    const name = (sf.filename + ' ' + (sf.metadata?.name || '') + ' ' + (sf.metadata?.comment || '')).toLowerCase();

    if (name.includes('gm') || name.includes('general') || name.includes('gs') || name.includes('xg')) {
      categories['General MIDI'].push(sf.filename);
    }
    if (name.includes('orchestr') || name.includes('symphon') || name.includes('strings') || name.includes('brass') || name.includes('woodwind')) {
      categories['Orchestral'].push(sf.filename);
    }
    if (name.includes('piano') || name.includes('grand') || name.includes('steinway') || name.includes('yamaha c')) {
      categories['Piano'].push(sf.filename);
    }
    if (name.includes('guitar') || name.includes('strat') || name.includes('tele') || name.includes('les paul')) {
      categories['Guitar'].push(sf.filename);
    }
    if (name.includes('bass') && !name.includes('double bass')) {
      categories['Bass'].push(sf.filename);
    }
    if (name.includes('drum') || name.includes('kit') || name.includes('percussion') || name.includes('808') || name.includes('909')) {
      categories['Drums'].push(sf.filename);
    }
    if (name.includes('synth') || name.includes('analog') || name.includes('fm') || name.includes('pad') || name.includes('lead')) {
      categories['Synth/Electronic'].push(sf.filename);
    }
    if (name.includes('ethnic') || name.includes('world') || name.includes('asia') || name.includes('africa') || name.includes('latin') || name.includes('india')) {
      categories['Ethnic/World'].push(sf.filename);
    }
    if (name.includes('chip') || name.includes('8bit') || name.includes('16bit') || name.includes('nes') || name.includes('snes') || name.includes('retro') || name.includes('game')) {
      categories['Chiptune/Retro'].push(sf.filename);
    }
    if (name.includes('roland') || name.includes('yamaha') || name.includes('korg') || name.includes('sc-') || name.includes('jv-') || name.includes('dx7')) {
      categories['Hardware Emulation'].push(sf.filename);
    }
  }

  // Remove duplicates and count
  const summary = {};
  for (const [cat, files] of Object.entries(categories)) {
    const unique = [...new Set(files)];
    summary[cat] = {
      count: unique.length,
      examples: unique.slice(0, 5)
    };
  }

  return {
    totalSoundfonts: index.totalSoundfonts,
    totalPresets: index.totalPresets,
    categories: summary
  };
}

/**
 * Generate a TiMidity configuration file for selected soundfonts
 * @param {Array<string>} soundfonts - Array of soundfont filenames to include
 * @param {Object} options - Configuration options
 * @param {string} [options.title] - Composition title for comment
 * @param {string} [options.genre] - Genre for comment
 * @param {Object} [options.overrides] - Bank/program overrides
 * @returns {string} TiMidity configuration content
 */
export function generateTimidityConfig(soundfonts, options = {}) {
  const { title = 'Custom Composition', genre = '', overrides = {} } = options;

  let config = `# ================================================================================
# CUSTOM TIMIDITY CONFIG
# Generated for: ${title}
# Genre: ${genre}
# Generated: ${new Date().toISOString()}
# ================================================================================

dir ${SOUNDFONT_DIR}

`;

  // Add soundfonts in order (later ones override earlier for same bank/program)
  for (const sf of soundfonts) {
    config += `soundfont "${sf}"\n`;
  }

  // Add any bank/program overrides
  if (Object.keys(overrides).length > 0) {
    config += `
# ================================================================================
# INSTRUMENT OVERRIDES
# ================================================================================
`;
    if (overrides.bank0) {
      config += `\nbank 0\n`;
      for (const [program, override] of Object.entries(overrides.bank0)) {
        config += `  ${program} %font "${override.soundfont}" ${override.bank || 0} ${override.program || program}\n`;
      }
    }

    if (overrides.drumsets) {
      for (const [drumset, mappings] of Object.entries(overrides.drumsets)) {
        config += `\ndrumset ${drumset}\n`;
        for (const [note, override] of Object.entries(mappings)) {
          config += `  ${note} %font "${override.soundfont}" 128 ${override.drumset || 0} ${override.note || note}\n`;
        }
      }
    }
  }


  // Always silence annoying GM percussion whistle sounds
  config += `
# ================================================================================
# PERCUSSION FIXES - Silence annoying whistle sounds
# GM Drum Map: 71 = Short Whistle, 72 = Long Whistle
# ================================================================================
drumset 0
  71 amp=0  # Short Whistle - silenced
  72 amp=0  # Long Whistle - silenced
`;

  // Add quality settings
  config += `# ================================================================================
# QUALITY SETTINGS
# ================================================================================
opt -s 48000
opt -a
opt -EFchorus=2
opt -EFreverb=2
opt -EFresamp=g
opt -p 512
opt -C 90
opt -k 0
`;

  return config;
}

/**
 * LLM-friendly tool: Explore soundfonts for a composition
 * This combines search and genre recommendations into a single call
 * @param {Object} params - Tool parameters
 * @param {string} params.genreHybrid - The genre hybrid title (e.g., "baroque_x_synthwave")
 * @param {Array<string>} [params.requiredInstruments] - Specific instruments needed
 * @param {string} [params.style] - Additional style keywords
 * @returns {Object} Comprehensive soundfont recommendations
 */
export async function exploreSoundFontsForComposition(params) {
  const { genreHybrid, requiredInstruments = [], style = '' } = params;
  const genreRecommendations = await getSoundFontsForGenre(genreHybrid);

  // Search for required instruments
  const instrumentResults = {};
  for (const instrument of requiredInstruments) {
    instrumentResults[instrument] = await searchSoundFonts(instrument, { limit: 5 });
  }

  // Search for style keywords if provided
  let styleResults = [];
  if (style) {
    styleResults = await searchSoundFonts(style, { limit: 10 });
  }

  // Get category-based suggestions for common needs
  const categoryResults = {
    drums: await getSoundFontsByCategory('drums', { limit: 5 }),
    bass: await getSoundFontsByCategory('bass', { limit: 5 }),
    strings: await getSoundFontsByCategory('strings', { limit: 5 }),
    synth: await getSoundFontsByCategory('synth', { limit: 5 })
  };

  return {
    genreHybrid,
    genreRecommendations: {
      primary: genreRecommendations.primary,
      secondary: genreRecommendations.secondary.slice(0, 5),
      searchedKeywords: genreRecommendations.searchedKeywords
    },
    instrumentResults,
    styleResults,
    categoryResults,
    suggestedSelection: buildSuggestedSelection(genreRecommendations, instrumentResults, styleResults)
  };
}

/**
 * Build a suggested soundfont selection from search results
 * @param {Object} genreRecs - Genre recommendations
 * @param {Object} instrumentRecs - Instrument search results
 * @param {Array} styleRecs - Style search results
 * @returns {Array<string>} Suggested soundfont filenames
 */
function buildSuggestedSelection(genreRecs, instrumentRecs, styleRecs) {
  const suggested = new Set();

  // Always include top genre matches
  for (const sf of genreRecs.primary.slice(0, 3)) {
    suggested.add(sf.filename);
  }

  // Include top instrument matches
  for (const results of Object.values(instrumentRecs)) {
    if (results.length > 0) {
      suggested.add(results[0].filename);
    }
  }

  // Include top style match if available
  if (styleRecs.length > 0) {
    suggested.add(styleRecs[0].filename);
  }

  // Always include a general GM soundfont as fallback
  suggested.add('GeneralUser GS v1.471.sf2');

  return Array.from(suggested);
}

/**
 * Get concise soundfont info for LLM context (token-efficient)
 * @param {string} genreHybrid - The genre hybrid
 * @returns {string} Compact soundfont guidance
 */
export async function getCompactSoundFontGuidance(genreHybrid) {
  const recommendations = await getSoundFontsForGenre(genreHybrid);

  let guidance = `## Soundfont Selection for ${genreHybrid}\n\n`;
  guidance += `Keywords matched: ${recommendations.searchedKeywords.join(', ')}\n\n`;
  guidance += `### Recommended Soundfonts (in priority order):\n`;

  for (const sf of recommendations.primary) {
    guidance += `- ${sf.filename} (score: ${sf.score}, presets: ${sf.presetCount})\n`;
    if (sf.comment) {
      guidance += `  ${sf.comment.substring(0, 100)}...\n`;
    }
  }

  guidance += `\n### Secondary Options:\n`;
  for (const sf of recommendations.secondary.slice(0, 5)) {
    guidance += `- ${sf.filename}\n`;
  }

  return guidance;
}
