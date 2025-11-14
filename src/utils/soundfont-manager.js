/**
 * Soundfont Manager - Intelligent soundfont selection and management
 * @module utils/soundfont-manager
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/**
 * @typedef {Object} SoundfontProfile
 * @property {string} path - Relative path to the soundfont file
 * @property {string} description - Human-readable description
 * @property {string[]} genres - List of genres this soundfont excels at
 * @property {number} quality - Quality rating from 1-10
 * @property {number} sizeInMB - File size in megabytes
 * @property {Object} [timidityArgs] - Additional timidity arguments
 */

/**
 * Predefined soundfont profiles for different use cases
 * @type {Object<string, SoundfontProfile>}
 */
export const SOUNDFONT_PROFILES = {
  // Quick & Good - For rapid prototyping
  fast: {
    path: 'soundfonts/500-soundfonts-full-gm-sets/GeneralUser GS v1.471.sf2',
    description: 'Fast rendering, good quality',
    genres: ['all', 'general', 'prototype'],
    quality: 7,
    sizeInMB: 30,
    timidityArgs: {
      sampleRate: '44100'
    }
  },

  // Balanced - Industry standard
  standard: {
    path: 'soundfonts/500-soundfonts-full-gm-sets/FluidR3 GM.sf2',
    description: 'Industry standard, excellent balance',
    genres: ['classical', 'jazz', 'acoustic', 'orchestral', 'general'],
    quality: 8.5,
    sizeInMB: 142,
    timidityArgs: {
      sampleRate: '48000',
      antialiasing: true
    }
  },

  // Modern/Electronic focused
  electronic: {
    path: 'soundfonts/500-soundfonts-full-gm-sets/Arachno SoundFont - Version 1.0.sf2',
    description: 'High quality, modern electronic sounds',
    genres: ['electronic', 'pop', 'modern', 'edm', 'techno', 'synth'],
    quality: 9,
    sizeInMB: 149,
    timidityArgs: {
      sampleRate: '48000',
      antialiasing: true,
      chorus: 1,
      reverb: 1
    }
  },

  // Maximum Quality - For final production
  ultra: {
    path: 'soundfonts/500-soundfonts-full-gm-sets/CrisisGeneralMidi3.01.sf2',
    description: 'Highest quality samples, production-ready',
    genres: ['orchestral', 'cinematic', 'production', 'classical', 'film'],
    quality: 10,
    sizeInMB: 1600,
    timidityArgs: {
      sampleRate: '48000',
      antialiasing: true,
      chorus: 2,
      reverb: 2,
      output24bit: true
    }
  },

  // Rock/Metal optimized
  rock: {
    path: 'soundfonts/500-soundfonts-full-gm-sets/4RockMix.sf2',
    description: 'Optimized for rock and metal music',
    genres: ['rock', 'metal', 'punk', 'grunge', 'alternative'],
    quality: 8,
    sizeInMB: 100,  // Estimated
    timidityArgs: {
      sampleRate: '48000',
      antialiasing: true,
      amplification: 90
    }
  },

  // Electronic/Synth focused
  synth: {
    path: 'soundfonts/500-soundfonts-full-gm-sets/FatBoy-v0.786.sf2',
    description: 'Electronic and synthesized sounds',
    genres: ['techno', 'edm', 'electronic', 'trance', 'house', 'ambient'],
    quality: 8.5,
    sizeInMB: 316,
    timidityArgs: {
      sampleRate: '48000',
      antialiasing: true,
      chorus: 2,
      reverb: 1
    }
  },

  // Contemporary sounds
  contemporary: {
    path: 'soundfonts/500-soundfonts-full-gm-sets/Edirol_SD-20_Contemporary.sf2',
    description: 'Contemporary and modern instrument sounds',
    genres: ['contemporary', 'modern', 'pop', 'rnb', 'hip-hop'],
    quality: 8.5,
    sizeInMB: 543,
    timidityArgs: {
      sampleRate: '48000',
      antialiasing: true,
      chorus: 1,
      reverb: 1
    }
  },

  // Balanced high-quality alternative
  hq: {
    path: 'soundfonts/500-soundfonts-full-gm-sets/Compifont_13082016.sf2',
    description: 'High-quality compilation, great all-around',
    genres: ['all', 'mixed', 'fusion', 'general'],
    quality: 9.5,
    sizeInMB: 975,
    timidityArgs: {
      sampleRate: '48000',
      antialiasing: true,
      chorus: 1,
      reverb: 1
    }
  },

  // ULTIMATE - Uses custom config file with multiple soundfonts
  ultimate: {
    path: 'USE_CONFIG_FILE',
    configFile: 'timidity-ultimate-simple.cfg',
    description: 'Ultimate quality - combines 10 best soundfonts',
    genres: ['all', 'maximum', 'production', 'professional'],
    quality: 10,
    sizeInMB: 5000,  // Combined size ~5GB
    timidityArgs: {
      useConfigFile: true,
      sampleRate: '48000',
      antialiasing: true,
      chorus: 1,
      reverb: 1,
      output24bit: true
    }
  },

  // OVERKILL - Maximum possible quality
  overkill: {
    path: 'USE_CONFIG_FILE',
    configFile: 'timidity-maximum-overkill.cfg',
    description: 'MAXIMUM OVERKILL - 30+ soundfonts, 15GB RAM usage',
    genres: ['all', 'maximum', 'insane', 'production'],
    quality: 11,  // This one goes to 11
    sizeInMB: 15000,  // Combined size ~15GB
    timidityArgs: {
      useConfigFile: true,
      sampleRate: '96000',
      antialiasing: true,
      chorus: 2,
      reverb: 2,
      output24bit: true
    }
  }
};

/**
 * Genre to soundfont mapping with priorities
 * @type {Object<string, string[]>}
 */
const GENRE_MAPPING = {
  // Classical family
  baroque: ['standard', 'ultra', 'hq'],
  classical: ['standard', 'ultra', 'hq'],
  romantic: ['ultra', 'standard', 'hq'],
  orchestral: ['ultra', 'standard', 'hq'],
  chamber: ['standard', 'ultra'],

  // Electronic family
  electronic: ['electronic', 'synth', 'contemporary'],
  techno: ['electronic', 'synth', 'contemporary'],
  edm: ['electronic', 'synth', 'contemporary'],
  house: ['synth', 'electronic', 'contemporary'],
  trance: ['synth', 'electronic'],
  ambient: ['synth', 'electronic', 'standard'],
  dubstep: ['synth', 'electronic'],
  'drum_n_bass': ['electronic', 'synth'],

  // Rock family
  rock: ['rock', 'contemporary', 'standard'],
  metal: ['rock', 'contemporary'],
  punk: ['rock', 'fast'],
  indie: ['contemporary', 'standard'],
  alternative: ['rock', 'contemporary'],

  // Jazz family
  jazz: ['standard', 'contemporary', 'hq'],
  fusion: ['contemporary', 'hq', 'standard'],
  bebop: ['standard', 'contemporary'],
  swing: ['standard', 'hq'],

  // Popular music
  pop: ['contemporary', 'electronic', 'standard'],
  rnb: ['contemporary', 'standard'],
  hip_hop: ['contemporary', 'electronic'],
  soul: ['contemporary', 'standard'],
  funk: ['contemporary', 'standard'],

  // World/Folk
  folk: ['standard', 'fast'],
  world: ['standard', 'hq'],
  ethnic: ['standard', 'hq'],

  // Experimental
  experimental: ['electronic', 'synth', 'hq'],
  minimalist: ['standard', 'electronic'],
  noise: ['synth', 'electronic']
};

/**
 * Select the best soundfont for a given genre
 * @param {string} genre - The musical genre
 * @param {string} [quality='standard'] - Quality preference: 'fast', 'standard', 'high', 'ultra'
 * @returns {string} The selected soundfont profile name
 */
export function selectSoundfontForGenre(genre, quality = 'standard') {
  // Handle hybrid genres (e.g., "Baroque_x_Techno")
  let primaryGenre = genre.toLowerCase();
  let secondaryGenre = null;

  if (genre.includes('_x_')) {
    const parts = genre.toLowerCase().split('_x_').filter(p => p.length > 0);
    if (parts.length >= 2) {
      primaryGenre = parts[0].trim();
      secondaryGenre = parts[1].trim();
    } else if (parts.length === 1) {
      primaryGenre = parts[0].trim();
    }
  }

  // Get soundfont recommendations for the genre
  const recommendations = GENRE_MAPPING[primaryGenre] || ['standard'];

  // If we have a hybrid genre, consider the secondary genre too
  if (secondaryGenre && GENRE_MAPPING[secondaryGenre]) {
    const secondaryRecs = GENRE_MAPPING[secondaryGenre];
    // Find common recommendations or use primary
    const common = recommendations.filter(r => secondaryRecs.includes(r));
    if (common.length > 0) {
      return common[0]; // Return the profile name, not the object
    }
  }

  // Quality-based selection
  switch (quality) {
    case 'fast':
      return 'fast'; // Return the profile name
    case 'high':
      // Pick the highest quality from recommendations
      for (const rec of ['ultra', 'hq', ...recommendations]) {
        if (SOUNDFONT_PROFILES[rec]) {
          return rec; // Return the profile name
        }
      }
      break;
    case 'ultra':
      return 'ultra'; // Return the profile name
    default:
      // Use the first recommendation
      return recommendations[0] || 'standard'; // Return the profile name
  }

  return 'standard'; // Return the profile name
}

/**
 * Get the absolute path to a soundfont
 * @param {string} profile - The soundfont profile name
 * @returns {string} Absolute path to the soundfont file
 */
export function getSoundfontPath(profile = 'standard') {
  const config = SOUNDFONT_PROFILES[profile];
  if (!config) {
    if (profile === 'standard') {
      throw new Error('Critical error: standard soundfont profile is missing from configuration');
    }
    console.warn(`Unknown soundfont profile: ${profile}, using standard`);
    return getSoundfontPath('standard');
  }

  // Handle config file profiles
  if (config.path === 'USE_CONFIG_FILE' && config.configFile) {
    const configPath = path.resolve(__dirname, '../..', config.configFile);
    if (!fs.existsSync(configPath)) {
      console.warn(`Config file not found: ${configPath}, falling back to standard soundfont`);
      return getSoundfontPath('standard');
    }
    return configPath;
  }

  return path.resolve(__dirname, '../..', config.path);
}

/**
 * Check if a soundfont file exists
 * @param {string} profile - The soundfont profile name
 * @returns {boolean} True if the soundfont file exists
 */
export function soundfontExists(profile) {
  const config = SOUNDFONT_PROFILES[profile];
  if (!config) return false;

  // For config file profiles, check if the config file exists
  if (config.path === 'USE_CONFIG_FILE' && config.configFile) {
    const configPath = path.resolve(__dirname, '../..', config.configFile);
    return fs.existsSync(configPath);
  }

  // For regular soundfonts, check the soundfont file
  const soundfontPath = getSoundfontPath(profile);
  return fs.existsSync(soundfontPath);
}

/**
 * Get timidity command arguments for a soundfont profile
 * @param {string} profile - The soundfont profile name
 * @param {Object} [overrides={}] - Override default arguments
 * @param {string} [overrides.sampleRate] - Sample rate
 * @param {boolean} [overrides.antialiasing] - Anti-aliasing flag
 * @param {number} [overrides.chorus] - Chorus level
 * @param {number} [overrides.reverb] - Reverb level
 * @param {boolean} [overrides.output24bit] - 24-bit output flag
 * @param {number} [overrides.amplification] - Amplification level
 * @returns {string[]} Array of timidity command arguments
 */
export function getTimidityArgs(profile = 'standard', overrides = {}) {
  const config = SOUNDFONT_PROFILES[profile] || SOUNDFONT_PROFILES.standard;

  const args = [];

  // Check if this profile uses a config file instead of a single soundfont
  if (config.timidityArgs?.useConfigFile && config.configFile) {
    // Use the config file
    args.push('-c', path.resolve(__dirname, '../..', config.configFile));
  } else {
    // Use single soundfont
    const soundfontPath = getSoundfontPath(profile);
    // Soundfont specification (using config-string for maximum compatibility)
    args.push('--config-string', `soundfont "${soundfontPath}"`);
  }

  // Sample rate
  const sampleRate = overrides.sampleRate || config.timidityArgs?.sampleRate || '48000';
  args.push('-s', sampleRate);

  // Anti-aliasing
  if (overrides.antialiasing !== false && config.timidityArgs?.antialiasing) {
    args.push('-a');
  }

  // Chorus effect
  const chorus = overrides.chorus ?? config.timidityArgs?.chorus;
  if (chorus) {
    args.push(`-EFchorus=${chorus}`);
  }

  // Reverb effect
  const reverb = overrides.reverb ?? config.timidityArgs?.reverb;
  if (reverb) {
    args.push(`-EFreverb=${reverb}`);
  }

  // 24-bit output
  if (overrides.output24bit || config.timidityArgs?.output24bit) {
    args.push('--output-24bit');
  }

  // Amplification
  const amplification = overrides.amplification || config.timidityArgs?.amplification;
  if (amplification) {
    args.push('-A', amplification.toString());
  }

  return args;
}

/**
 * List all available soundfonts with their profiles
 * @returns {Array<{profile: string, exists: boolean, size: number, quality: number}>}
 */
export function listAvailableSoundfonts() {
  const available = [];

  for (const [profile, config] of Object.entries(SOUNDFONT_PROFILES)) {
    available.push({
      profile,
      exists: soundfontExists(profile),
      size: config.sizeInMB,
      quality: config.quality,
      description: config.description,
      genres: config.genres
    });
  }

  return available.sort((a, b) => b.quality - a.quality);
}

/**
 * Get recommended soundfonts for a dataset creation strategy
 * @param {string} genre - The musical genre
 * @returns {Object} Recommended soundfonts for different purposes
 */
export function getDatasetStrategy(genre) {
  const genreProfileName = selectSoundfontForGenre(genre);
  const genreProfile = SOUNDFONT_PROFILES[genreProfileName];
  const highQualityProfileName = selectSoundfontForGenre(genre, 'high');
  const highQualityProfile = SOUNDFONT_PROFILES[highQualityProfileName];

  return {
    development: SOUNDFONT_PROFILES.fast,
    standard: genreProfile,
    highQuality: highQualityProfile,
    premium: SOUNDFONT_PROFILES.ultra,
    recommended: [
      { purpose: 'Quick iteration', profile: 'fast' },
      { purpose: 'Genre authentic', profile: genreProfileName },
      { purpose: 'High quality', profile: 'hq' },
      { purpose: 'Maximum quality', profile: 'ultra' }
    ]
  };
}

/**
 * Create a timidity configuration file
 * @param {string} configPath - Path to write the configuration
 * @param {string} [defaultSoundfont='standard'] - Default soundfont profile
 */
export function createTimidityConfig(configPath, defaultSoundfont = 'standard') {
  const soundfontPath = getSoundfontPath(defaultSoundfont);
  const config = SOUNDFONT_PROFILES[defaultSoundfont];

  const configContent = `# Timidity++ Configuration
# Generated by mediocre soundfont-manager

# Soundfont directory
dir ${path.dirname(soundfontPath)}

# Default soundfont
soundfont "${path.basename(soundfontPath)}"

# Quality settings
opt -s ${config.timidityArgs?.sampleRate || '48000'}
${config.timidityArgs?.antialiasing ? 'opt -a' : ''}
${config.timidityArgs?.chorus ? `opt -EFchorus=${config.timidityArgs.chorus}` : ''}
${config.timidityArgs?.reverb ? `opt -EFreverb=${config.timidityArgs.reverb}` : ''}
`;

  fs.writeFileSync(configPath, configContent, 'utf-8');
  console.log(`Timidity configuration written to ${configPath}`);
}