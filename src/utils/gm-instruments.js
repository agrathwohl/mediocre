/**
 * General MIDI (GM) Instruments Reference
 * Standard GM program numbers (1-128) mapped to instrument names
 *
 * This is the official General MIDI Level 1 instrument list.
 * Program numbers are 1-based in MIDI, but this array is 0-indexed.
 * Use: gmInstruments[programNumber - 1] to get the instrument name.
 */

/**
 * General MIDI instrument names array (128 instruments)
 * Index 0 = Program 1 (Acoustic Grand Piano)
 * Index 127 = Program 128 (Gunshot)
 * @type {string[]}
 */
export const GM_INSTRUMENTS = [
  // Piano (1-8)
  'Acoustic Grand Piano',
  'Bright Acoustic Piano',
  'Electric Grand Piano',
  'Honky-tonk Piano',
  'Electric Piano 1',
  'Electric Piano 2',
  'Harpsichord',
  'Clavi',

  // Chromatic Percussion (9-16)
  'Celesta',
  'Glockenspiel',
  'Music Box',
  'Vibraphone',
  'Marimba',
  'Xylophone',
  'Tubular Bells',
  'Dulcimer',

  // Organ (17-24)
  'Drawbar Organ',
  'Percussive Organ',
  'Rock Organ',
  'Church Organ',
  'Reed Organ',
  'Accordion',
  'Harmonica',
  'Tango Accordion',

  // Guitar (25-32)
  'Acoustic Guitar (nylon)',
  'Acoustic Guitar (steel)',
  'Electric Guitar (jazz)',
  'Electric Guitar (clean)',
  'Electric Guitar (muted)',
  'Overdriven Guitar',
  'Distortion Guitar',
  'Guitar harmonics',

  // Bass (33-40)
  'Acoustic Bass',
  'Electric Bass (finger)',
  'Electric Bass (pick)',
  'Fretless Bass',
  'Slap Bass 1',
  'Slap Bass 2',
  'Synth Bass 1',
  'Synth Bass 2',

  // Strings (41-48)
  'Violin',
  'Viola',
  'Cello',
  'Contrabass',
  'Tremolo Strings',
  'Pizzicato Strings',
  'Orchestral Harp',
  'Timpani',

  // Ensemble (49-56)
  'String Ensemble 1',
  'String Ensemble 2',
  'Synth Strings 1',
  'Synth Strings 2',
  'Choir Aahs',
  'Voice Oohs',
  'Synth Voice',
  'Orchestra Hit',

  // Brass (57-64)
  'Trumpet',
  'Trombone',
  'Tuba',
  'Muted Trumpet',
  'French Horn',
  'Brass Section',
  'Synth Brass 1',
  'Synth Brass 2',

  // Reed (65-72)
  'Soprano Sax',
  'Alto Sax',
  'Tenor Sax',
  'Baritone Sax',
  'Oboe',
  'English Horn',
  'Bassoon',
  'Clarinet',

  // Pipe (73-80)
  'Piccolo',
  'Flute',
  'Recorder',
  'Pan Flute',
  'Blown Bottle',
  'Shakuhachi',
  'Whistle',
  'Ocarina',

  // Synth Lead (81-88)
  'Lead 1 (square)',
  'Lead 2 (sawtooth)',
  'Lead 3 (calliope)',
  'Lead 4 (chiff)',
  'Lead 5 (charang)',
  'Lead 6 (voice)',
  'Lead 7 (fifths)',
  'Lead 8 (bass + lead)',

  // Synth Pad (89-96)
  'Pad 1 (new age)',
  'Pad 2 (warm)',
  'Pad 3 (polysynth)',
  'Pad 4 (choir)',
  'Pad 5 (bowed)',
  'Pad 6 (metallic)',
  'Pad 7 (halo)',
  'Pad 8 (sweep)',

  // Synth Effects (97-104)
  'FX 1 (rain)',
  'FX 2 (soundtrack)',
  'FX 3 (crystal)',
  'FX 4 (atmosphere)',
  'FX 5 (brightness)',
  'FX 6 (goblins)',
  'FX 7 (echoes)',
  'FX 8 (sci-fi)',

  // Ethnic (105-112)
  'Sitar',
  'Banjo',
  'Shamisen',
  'Koto',
  'Kalimba',
  'Bag pipe',
  'Fiddle',
  'Shanai',

  // Percussive (113-120)
  'Tinkle Bell',
  'Agogo',
  'Steel Drums',
  'Woodblock',
  'Taiko Drum',
  'Melodic Tom',
  'Synth Drum',
  'Reverse Cymbal',

  // Sound Effects (121-128)
  'Guitar Fret Noise',
  'Breath Noise',
  'Seashore',
  'Bird Tweet',
  'Telephone Ring',
  'Helicopter',
  'Applause',
  'Gunshot'
];

/**
 * Get instrument name from MIDI program number
 * @param {number} programNumber - MIDI program number (1-128)
 * @returns {string|null} Instrument name or null if invalid
 */
export function getInstrumentName(programNumber) {
  if (programNumber >= 1 && programNumber <= 128) {
    return GM_INSTRUMENTS[programNumber - 1];
  }
  return null;
}

/**
 * Get MIDI program number from instrument name (case-insensitive partial match)
 * @param {string} name - Instrument name to search for
 * @returns {number|null} MIDI program number (1-128) or null if not found
 */
export function getInstrumentProgram(name) {
  const lowerName = name.toLowerCase();
  const index = GM_INSTRUMENTS.findIndex(inst =>
    inst.toLowerCase().includes(lowerName)
  );
  return index >= 0 ? index + 1 : null;
}

/**
 * Extract instruments from ABC notation
 * @param {string} abcNotation - ABC notation string
 * @returns {string[]} Array of unique instrument names found
 */
export function extractInstrumentsFromAbc(abcNotation) {
  const instruments = [];
  const programRegex = /%%MIDI\s+program\s+(?:\d+\s+)?(\d+)/g;
  let match;

  // Check for gchord and drum settings
  if (abcNotation.includes('%%MIDI gchord')) {
    instruments.push('Guitar Chords');
  }

  if (abcNotation.includes('%%MIDI drum')) {
    instruments.push('Percussion');
  }

  // Extract MIDI program numbers
  while ((match = programRegex.exec(abcNotation)) !== null) {
    const programNumber = parseInt(match[1], 10);
    const instrumentName = getInstrumentName(programNumber);
    if (instrumentName) {
      instruments.push(instrumentName);
    }
  }

  return [...new Set(instruments)]; // Remove duplicates
}

/**
 * Instrument categories for grouping
 * @type {Object<string, {start: number, end: number}>}
 */
export const INSTRUMENT_CATEGORIES = {
  'Piano': { start: 1, end: 8 },
  'Chromatic Percussion': { start: 9, end: 16 },
  'Organ': { start: 17, end: 24 },
  'Guitar': { start: 25, end: 32 },
  'Bass': { start: 33, end: 40 },
  'Strings': { start: 41, end: 48 },
  'Ensemble': { start: 49, end: 56 },
  'Brass': { start: 57, end: 64 },
  'Reed': { start: 65, end: 72 },
  'Pipe': { start: 73, end: 80 },
  'Synth Lead': { start: 81, end: 88 },
  'Synth Pad': { start: 89, end: 96 },
  'Synth Effects': { start: 97, end: 104 },
  'Ethnic': { start: 105, end: 112 },
  'Percussive': { start: 113, end: 120 },
  'Sound Effects': { start: 121, end: 128 }
};

/**
 * Get the category for a MIDI program number
 * @param {number} programNumber - MIDI program number (1-128)
 * @returns {string|null} Category name or null if invalid
 */
export function getInstrumentCategory(programNumber) {
  for (const [category, range] of Object.entries(INSTRUMENT_CATEGORIES)) {
    if (programNumber >= range.start && programNumber <= range.end) {
      return category;
    }
  }
  return null;
}
