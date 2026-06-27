/**
 * ABC Notation Parser
 * Pure functions for extracting structured metadata from ABC notation text.
 * No side effects, fully testable.
 */

/**
 * GM MIDI instrument names (0-indexed, program 0-127)
 */
const GM_INSTRUMENTS = [
  'Acoustic Grand Piano', 'Bright Acoustic Piano', 'Electric Grand Piano', 'Honky-tonk Piano',
  'Electric Piano 1', 'Electric Piano 2', 'Harpsichord', 'Clavi',
  'Celesta', 'Glockenspiel', 'Music Box', 'Vibraphone',
  'Marimba', 'Xylophone', 'Tubular Bells', 'Dulcimer',
  'Drawbar Organ', 'Percussive Organ', 'Rock Organ', 'Church Organ',
  'Reed Organ', 'Accordion', 'Harmonica', 'Tango Accordion',
  'Acoustic Guitar (nylon)', 'Acoustic Guitar (steel)', 'Electric Guitar (jazz)', 'Electric Guitar (clean)',
  'Electric Guitar (muted)', 'Overdriven Guitar', 'Distortion Guitar', 'Guitar Harmonics',
  'Acoustic Bass', 'Electric Bass (finger)', 'Electric Bass (pick)', 'Fretless Bass',
  'Slap Bass 1', 'Slap Bass 2', 'Synth Bass 1', 'Synth Bass 2',
  'Violin', 'Viola', 'Cello', 'Contrabass',
  'Tremolo Strings', 'Pizzicato Strings', 'Orchestral Harp', 'Timpani',
  'String Ensemble 1', 'String Ensemble 2', 'Synth Strings 1', 'Synth Strings 2',
  'Choir Aahs', 'Voice Oohs', 'Synth Voice', 'Orchestra Hit',
  'Trumpet', 'Trombone', 'Tuba', 'Muted Trumpet',
  'French Horn', 'Brass Section', 'Synth Brass 1', 'Synth Brass 2',
  'Soprano Sax', 'Alto Sax', 'Tenor Sax', 'Baritone Sax',
  'Oboe', 'English Horn', 'Bassoon', 'Clarinet',
  'Piccolo', 'Flute', 'Recorder', 'Pan Flute',
  'Blown Bottle', 'Shakuhachi', 'Whistle', 'Ocarina',
  'Lead 1 (square)', 'Lead 2 (sawtooth)', 'Lead 3 (calliope)', 'Lead 4 (chiff)',
  'Lead 5 (charang)', 'Lead 6 (voice)', 'Lead 7 (fifths)', 'Lead 8 (bass + lead)',
  'Pad 1 (new age)', 'Pad 2 (warm)', 'Pad 3 (polysynth)', 'Pad 4 (choir)',
  'Pad 5 (bowed)', 'Pad 6 (metallic)', 'Pad 7 (halo)', 'Pad 8 (sweep)',
  'FX 1 (rain)', 'FX 2 (soundtrack)', 'FX 3 (crystal)', 'FX 4 (atmosphere)',
  'FX 5 (brightness)', 'FX 6 (goblins)', 'FX 7 (echoes)', 'FX 8 (sci-fi)',
  'Sitar', 'Banjo', 'Shamisen', 'Koto',
  'Kalimba', 'Bag pipe', 'Fiddle', 'Shanai',
  'Tinkle Bell', 'Agogo', 'Steel Drums', 'Woodblock',
  'Taiko Drum', 'Melodic Tom', 'Synth Drum', 'Reverse Cymbal',
  'Guitar Fret Noise', 'Breath Noise', 'Seashore', 'Bird Tweet',
  'Telephone Ring', 'Helicopter', 'Applause', 'Gunshot',
];

/**
 * Extract a single ABC header value by field letter
 * @param {string} abcText - ABC notation text
 * @param {string} field - Single-letter field code (e.g., 'T', 'M', 'K')
 * @returns {string|null} Header value or null if not found
 */
export function extractHeader(abcText, field) {
  const regex = new RegExp(`^${field}:\\s*(.+)$`, 'm');
  const match = abcText.match(regex);
  return match ? match[1].trim() : null;
}

/**
 * Extract the title from ABC notation
 * @param {string} abcText
 * @returns {string|null}
 */
export function extractTitle(abcText) {
  return extractHeader(abcText, 'T');
}

/**
 * Extract the composer from ABC notation
 * @param {string} abcText
 * @returns {string|null}
 */
export function extractComposer(abcText) {
  return extractHeader(abcText, 'C');
}

/**
 * Extract the key signature from ABC notation
 * @param {string} abcText
 * @returns {string|null} e.g., "C", "Dm", "G major", "Amin"
 */
export function extractKey(abcText) {
  return extractHeader(abcText, 'K');
}

/**
 * Parse key signature into key name and mode
 * @param {string} keyStr - Key string from K: header
 * @returns {{ key: string, mode: string }} e.g., { key: "D", mode: "minor" }
 */
export function parseKey(keyStr) {
  if (!keyStr) return { key: null, mode: null };

  const cleaned = keyStr.trim();

  // Handle explicit mode names: "D minor", "G major", "C dorian"
  const modeMatch = cleaned.match(/^([A-Ga-g][#b]?)\s*(major|minor|dorian|mixolydian|lydian|phrygian|locrian|aeolian|ionian)/i);
  if (modeMatch) {
    return { key: modeMatch[1], mode: modeMatch[2].toLowerCase() };
  }

  // Handle shorthand: "Dm", "Am", "Gmin", "Cmaj"
  const shortMatch = cleaned.match(/^([A-Ga-g][#b]?)(m|min|maj)?$/i);
  if (shortMatch) {
    const key = shortMatch[1];
    const suffix = (shortMatch[2] || '').toLowerCase();
    const mode = (suffix === 'm' || suffix === 'min') ? 'minor' : 'major';
    return { key, mode };
  }

  // Fallback: just the key letter
  return { key: cleaned, mode: 'major' };
}

/**
 * Extract the time signature (meter) from ABC notation
 * @param {string} abcText
 * @returns {string|null} e.g., "4/4", "3/4", "6/8"
 */
export function extractMeter(abcText) {
  return extractHeader(abcText, 'M');
}

/**
 * Extract the default note length from ABC notation
 * @param {string} abcText
 * @returns {string|null} e.g., "1/8", "1/4"
 */
export function extractDefaultNoteLength(abcText) {
  return extractHeader(abcText, 'L');
}

/**
 * Extract tempo from Q: header and parse to BPM
 * @param {string} abcText
 * @returns {number|null} BPM or null if not found
 */
export function extractTempo(abcText) {
  const tempoStr = extractHeader(abcText, 'Q');
  if (!tempoStr) return null;

  // Format: "1/4=120" or "120" or "1/8=160"
  const tempoMatch = tempoStr.match(/(?:(\d+)\/(\d+)\s*=\s*)?(\d+)/);
  if (!tempoMatch) return null;

  const bpm = parseInt(tempoMatch[3], 10);

  // If note value specified, normalize to quarter note BPM
  if (tempoMatch[1] && tempoMatch[2]) {
    const noteNumerator = parseInt(tempoMatch[1], 10);
    const noteDenominator = parseInt(tempoMatch[2], 10);
    const noteValue = noteNumerator / noteDenominator;
    // Quarter note = 0.25, so scale accordingly
    return Math.round(bpm * (noteValue / 0.25));
  }

  return bpm;
}

/**
 * Count unique voices in ABC notation
 * Counts V: declarations and [V:...] markers
 * @param {string} abcText
 * @returns {number}
 */
export function countVoices(abcText) {
  const voiceIds = new Set();

  // Match V: declarations (e.g., "V:1 clef=treble")
  const vDeclarations = abcText.matchAll(/^V:\s*(\S+)/gm);
  for (const match of vDeclarations) {
    voiceIds.add(match[1].split(/\s/)[0]);
  }

  // Match [V:...] body markers
  const vMarkers = abcText.matchAll(/\[V:\s*(\S+?)[\s\]]/g);
  for (const match of vMarkers) {
    voiceIds.add(match[1]);
  }

  return voiceIds.size || 1; // At least 1 voice
}

/**
 * Count measures (barlines) in the longest voice
 * @param {string} abcText
 * @returns {number}
 */
export function countMeasures(abcText) {
  // Split into voice sections
  const voiceSections = abcText.split(/\[V:\s*\S+\]/);

  let maxBars = 0;
  for (const section of voiceSections) {
    // Count barlines (| but not || or |: or :|)
    // Simple approach: count all | characters that aren't part of special barlines
    const bars = (section.match(/\|/g) || []).length;
    if (bars > maxBars) maxBars = bars;
  }

  return maxBars;
}

/**
 * Extract MIDI program assignments and map to instrument names
 * @param {string} abcText
 * @returns {Array<{ channel: number|null, program: number, name: string }>}
 */
export function extractMidiPrograms(abcText) {
  const programs = [];
  const seen = new Set();

  const matches = abcText.matchAll(/%%MIDI\s+program\s+(?:(\d+)\s+)?(\d+)/g);
  for (const match of matches) {
    const channel = match[1] ? parseInt(match[1], 10) : null;
    const program = parseInt(match[2], 10);
    const key = `${channel}-${program}`;

    if (!seen.has(key)) {
      seen.add(key);
      programs.push({
        channel,
        program,
        name: program >= 0 && program < 128 ? GM_INSTRUMENTS[program] : `Program ${program}`,
      });
    }
  }

  return programs;
}

/**
 * Extract instrument names from MIDI programs
 * @param {string} abcText
 * @returns {string[]} Array of unique instrument names
 */
export function extractInstruments(abcText) {
  const programs = extractMidiPrograms(abcText);
  const instruments = programs.map(p => p.name);

  // Check for drum patterns
  if (abcText.includes('%%MIDI drum') || abcText.includes('%%MIDI drumon') || abcText.includes('%%MIDI drummap')) {
    instruments.push('Drums');
  }

  // Check for guitar chords
  if (abcText.includes('%%MIDI gchord')) {
    instruments.push('Guitar Chords');
  }

  return [...new Set(instruments)];
}

/**
 * Check if composition has drums
 * @param {string} abcText
 * @returns {boolean}
 */
export function hasDrums(abcText) {
  return /%%MIDI\s+(drum|drumon|drummap)/m.test(abcText) ||
    /clef\s*=\s*perc/i.test(abcText);
}

/**
 * Check if composition has bass voice
 * @param {string} abcText
 * @returns {boolean}
 */
export function hasBass(abcText) {
  return /clef\s*=\s*bass/i.test(abcText) ||
    /bass/i.test(abcText);
}

/**
 * Extract dynamics markings
 * @param {string} abcText
 * @returns {string[]} Array of unique dynamics
 */
export function extractDynamics(abcText) {
  const dynamics = new Set();
  const matches = abcText.matchAll(/!(fff|ff|f|mf|mp|p|pp|ppp)!/g);
  for (const match of matches) {
    dynamics.add(match[1]);
  }
  return Array.from(dynamics);
}

/**
 * Estimate duration in seconds based on tempo, meter, and measure count
 * @param {string} abcText
 * @returns {number|null} Estimated seconds or null if can't compute
 */
export function estimateDuration(abcText) {
  const bpm = extractTempo(abcText);
  const meter = extractMeter(abcText);
  const measures = countMeasures(abcText);

  if (!bpm || !meter || !measures) return null;

  // Parse meter (e.g., "4/4" → 4 beats per measure, quarter note beat)
  const meterMatch = meter.match(/(\d+)\/(\d+)/);
  if (!meterMatch) return null;

  const beatsPerMeasure = parseInt(meterMatch[1], 10);
  const beatUnit = parseInt(meterMatch[2], 10);

  // Convert to quarter-note beats
  const quarterBeatsPerMeasure = beatsPerMeasure * (4 / beatUnit);

  // Duration in seconds
  const totalQuarterBeats = quarterBeatsPerMeasure * measures;
  const secondsPerBeat = 60 / bpm;

  return Math.round(totalQuarterBeats * secondsPerBeat * 10) / 10;
}

/**
 * Parse all ABC headers into a structured metadata object
 * @param {string} abcText - Full ABC notation content
 * @returns {Object} Comprehensive metadata
 */
export function parseAbcMetadata(abcText) {
  const keyStr = extractKey(abcText);
  const { key, mode } = parseKey(keyStr);
  const bpm = extractTempo(abcText);
  const meter = extractMeter(abcText);

  return {
    title: extractTitle(abcText),
    composer: extractComposer(abcText),
    key: keyStr,
    key_root: key,
    key_mode: mode,
    tempo_bpm: bpm,
    time_signature: meter,
    default_note_length: extractDefaultNoteLength(abcText),
    voice_count: countVoices(abcText),
    measure_count: countMeasures(abcText),
    estimated_duration_seconds: estimateDuration(abcText),
    instruments: extractInstruments(abcText),
    midi_programs: extractMidiPrograms(abcText),
    has_drums: hasDrums(abcText),
    has_bass: hasBass(abcText),
    dynamics: extractDynamics(abcText),
  };
}
