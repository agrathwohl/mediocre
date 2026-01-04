/**
 * section-extractor.js
 *
 * Extracts section markers from ABC notation files and calculates
 * their timecodes based on tempo, meter, and measure counts.
 *
 * Section format in ABC: % SECTION [ROMAN]: [Title]
 * Example: % SECTION III: Deep Drone Evolution - Extended Sunn O))) section
 */

/**
 * Roman numeral to integer conversion
 */
const ROMAN_VALUES = {
  I: 1, V: 5, X: 10, L: 50, C: 100, D: 500, M: 1000
};

function romanToInt(roman) {
  let result = 0;
  for (let i = 0; i < roman.length; i++) {
    const current = ROMAN_VALUES[roman[i]] || 0;
    const next = ROMAN_VALUES[roman[i + 1]] || 0;
    if (current < next) {
      result -= current;
    } else {
      result += current;
    }
  }
  return result;
}

/**
 * Parse tempo from ABC Q: field
 * Formats: Q:1/4=120, Q:120, Q:"Allegro" 1/4=120
 * Returns beats per minute (quarter note basis)
 */
function parseTempo(tempoStr) {
  if (!tempoStr) return 120; // default

  // Match "1/4=120" or just "=120"
  const match = tempoStr.match(/(?:(\d+)\/(\d+)\s*=\s*)?(\d+)/);
  if (!match) return 120;

  const bpm = parseInt(match[3], 10);
  const noteNum = match[1] ? parseInt(match[1], 10) : 1;
  const noteDen = match[2] ? parseInt(match[2], 10) : 4;

  // Normalize to quarter note
  const quarterRatio = (4 / noteDen) * noteNum;
  return bpm * quarterRatio;
}

/**
 * Parse meter from ABC M: field
 * Returns { num, den } or null for free time
 */
function parseMeter(meterStr) {
  if (!meterStr || meterStr === 'none' || meterStr === 'free') {
    return null;
  }

  // Handle common shortcuts
  if (meterStr === 'C') return { num: 4, den: 4 };
  if (meterStr === 'C|') return { num: 2, den: 2 };

  const match = meterStr.match(/(\d+)\/(\d+)/);
  if (!match) return { num: 4, den: 4 };

  return {
    num: parseInt(match[1], 10),
    den: parseInt(match[2], 10)
  };
}

/**
 * Parse note length from ABC L: field
 * Returns fraction as decimal (e.g., 1/8 = 0.125)
 */
function parseNoteLength(lengthStr) {
  if (!lengthStr) return 1 / 8; // default

  const match = lengthStr.match(/(\d+)\/(\d+)/);
  if (!match) return 1 / 8;

  return parseInt(match[1], 10) / parseInt(match[2], 10);
}

/**
 * Calculate measure duration in seconds
 * @param {number} bpm - Beats per minute (quarter note basis)
 * @param {{ num: number, den: number }} meter - Time signature
 * @returns {number} Duration of one measure in seconds
 */
function calculateMeasureDuration(bpm, meter) {
  if (!meter) return 4 * (60 / bpm); // Assume 4/4 for free time

  // Beats per measure = numerator * (4 / denominator)
  // This normalizes to quarter note beats
  const quarterNotesPerMeasure = meter.num * (4 / meter.den);
  const secondsPerQuarter = 60 / bpm;

  return quarterNotesPerMeasure * secondsPerQuarter;
}

/**
 * Count measures in an ABC line (Voice content only)
 * Measures are separated by | or |]
 */
function countMeasuresInLine(line) {
  // Skip header lines, comments, voice declarations, MIDI directives
  if (/^[A-Z]:|^%%|^V:|^%/.test(line.trim())) {
    return 0;
  }

  // Count bar lines
  const bars = (line.match(/\|(?!\|)/g) || []).length;
  return bars;
}

/**
 * Extract sections from ABC content
 * @param {string} abcContent - Full ABC notation content
 * @returns {Array<{ numeral: string, title: string, startTime: number, measureStart: number }>}
 */
export function extractSections(abcContent) {
  if (!abcContent || typeof abcContent !== 'string') {
    return [];
  }

  const lines = abcContent.split('\n');
  const sections = [];

  // Parse header values
  let tempo = 120;
  let meter = { num: 4, den: 4 };
  let currentMeasure = 0;
  let currentTempo = null;
  let currentMeter = null;

  // Track tempo and meter changes
  const tempoChanges = [];
  const meterChanges = [];

  // First pass: extract header and inline tempo/meter changes
  for (const line of lines) {
    const trimmed = line.trim();

    // Header tempo
    if (trimmed.startsWith('Q:')) {
      const tempoVal = parseTempo(trimmed.substring(2).trim());
      if (currentTempo === null) {
        tempo = tempoVal;
        currentTempo = tempoVal;
      }
    }

    // Header meter
    if (trimmed.startsWith('M:')) {
      const meterVal = parseMeter(trimmed.substring(2).trim());
      if (currentMeter === null && meterVal) {
        meter = meterVal;
        currentMeter = meterVal;
      }
    }
  }

  // Second pass: count measures and extract sections
  currentMeasure = 0;

  for (const line of lines) {
    const trimmed = line.trim();

    // Section marker: % SECTION [ROMAN]: [Title]
    const sectionMatch = trimmed.match(/^%\s*SECTION\s+([IVXLCDM]+)\s*:\s*(.+)$/i);
    if (sectionMatch) {
      const numeral = sectionMatch[1].toUpperCase();
      const title = sectionMatch[2].trim();

      sections.push({
        numeral,
        title,
        measureStart: currentMeasure,
        startTime: 0 // Will calculate after
      });
      continue;
    }

    // Inline tempo change
    const inlineTempoMatch = trimmed.match(/Q:\s*(?:(\d+)\/(\d+)\s*=\s*)?(\d+)/);
    if (inlineTempoMatch && !trimmed.startsWith('Q:')) {
      // This is an inline tempo, update for subsequent calculations
      currentTempo = parseTempo(inlineTempoMatch[0].substring(2));
    }

    // Count measures in music lines
    currentMeasure += countMeasuresInLine(line);
  }

  // Calculate start times
  const measureDuration = calculateMeasureDuration(tempo, meter);

  for (const section of sections) {
    section.startTime = section.measureStart * measureDuration;
  }

  // Ensure first section starts at 0
  if (sections.length > 0 && sections[0].measureStart === 0) {
    sections[0].startTime = 0;
  }

  return sections;
}

/**
 * Extract sections and format for JSON storage
 * @param {string} abcContent - ABC notation content
 * @returns {Array<{ numeral: string, title: string, startTime: number }>}
 */
export function extractSectionsForJson(abcContent) {
  const sections = extractSections(abcContent);

  // Return simplified format without measureStart
  return sections.map(s => ({
    numeral: s.numeral,
    title: s.title,
    startTime: Math.round(s.startTime * 100) / 100 // Round to 2 decimals
  }));
}

/**
 * Get total duration estimate from ABC content
 * @param {string} abcContent - ABC notation content
 * @returns {number} Estimated duration in seconds
 */
export function estimateDuration(abcContent) {
  const lines = abcContent.split('\n');

  let tempo = 120;
  let meter = { num: 4, den: 4 };
  let totalMeasures = 0;

  for (const line of lines) {
    const trimmed = line.trim();

    if (trimmed.startsWith('Q:')) {
      tempo = parseTempo(trimmed.substring(2).trim());
    }
    if (trimmed.startsWith('M:')) {
      const m = parseMeter(trimmed.substring(2).trim());
      if (m) meter = m;
    }

    totalMeasures += countMeasuresInLine(line);
  }

  const measureDuration = calculateMeasureDuration(tempo, meter);
  return totalMeasures * measureDuration;
}

export default {
  extractSections,
  extractSectionsForJson,
  estimateDuration
};
