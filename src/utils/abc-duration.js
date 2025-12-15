/**
 * ABC Duration Calculator
 * Calculates the duration in seconds of an ABC notation piece
 * without needing to render it to audio
 */

/**
 * Parse ABC notation to calculate duration in seconds
 * @param {string} abcContent - The ABC notation content
 * @returns {number} Duration in seconds (or null if unable to calculate)
 */
export function calculateAbcDuration(abcContent) {
  try {
    // Extract key ABC headers
    const headers = parseAbcHeaders(abcContent);

    if (!headers.tempo || !headers.defaultNoteLength || !headers.meter) {
      console.warn('Missing required ABC headers for duration calculation');
      return null;
    }

    // Count the total note values in the piece
    const totalBeats = countTotalBeats(abcContent, headers);

    // Calculate duration based on tempo and total beats
    const duration = calculateDurationFromBeats(totalBeats, headers.tempo, headers.meter);

    return duration;
  } catch (error) {
    console.error('Error calculating ABC duration:', error.message);
    return null;
  }
}

/**
 * Parse ABC headers for timing information
 * @param {string} abcContent - The ABC notation content
 * @returns {Object} Parsed headers
 */
function parseAbcHeaders(abcContent) {
  const headers = {
    tempo: null,
    defaultNoteLength: null,
    meter: null,
    key: null
  };

  const lines = abcContent.split('\n');

  for (const line of lines) {
    // Stop at first non-header line (music content starts)
    if (line.match(/^\[?[A-Ga-g]/)) break;

    // Parse tempo (Q:1/4=120 or Q:120 or Q:"Allegro" 1/4=120)
    if (line.startsWith('Q:')) {
      const tempoMatch = line.match(/Q:.*?(\d+\/\d+)\s*=\s*(\d+)/) ||
                         line.match(/Q:\s*(\d+)/);
      if (tempoMatch) {
        if (tempoMatch[2]) {
          // Format: Q:1/4=120
          headers.tempo = {
            noteValue: tempoMatch[1],
            bpm: parseInt(tempoMatch[2])
          };
        } else {
          // Format: Q:120 (assumes quarter note)
          headers.tempo = {
            noteValue: '1/4',
            bpm: parseInt(tempoMatch[1])
          };
        }
      }
    }

    // Parse default note length (L:1/8)
    if (line.startsWith('L:')) {
      const lengthMatch = line.match(/L:\s*(\d+\/\d+)/);
      if (lengthMatch) {
        headers.defaultNoteLength = lengthMatch[1];
      }
    }

    // Parse meter/time signature (M:4/4 or M:C)
    if (line.startsWith('M:')) {
      const meterMatch = line.match(/M:\s*([^\s]+)/);
      if (meterMatch) {
        const meter = meterMatch[1];
        if (meter === 'C') {
          headers.meter = '4/4';
        } else if (meter === 'C|') {
          headers.meter = '2/2';
        } else {
          headers.meter = meter;
        }
      }
    }

    // Parse key signature
    if (line.startsWith('K:')) {
      const keyMatch = line.match(/K:\s*([^\s]+)/);
      if (keyMatch) {
        headers.key = keyMatch[1];
      }
    }
  }

  // Set defaults if not specified
  if (!headers.tempo) {
    headers.tempo = { noteValue: '1/4', bpm: 120 }; // Default 120 BPM quarter notes
  }
  if (!headers.defaultNoteLength) {
    headers.defaultNoteLength = '1/8'; // Default eighth note
  }
  if (!headers.meter) {
    headers.meter = '4/4'; // Default 4/4 time
  }

  return headers;
}

/**
 * Count total beats in the ABC notation
 * @param {string} abcContent - The ABC notation content
 * @param {Object} headers - Parsed ABC headers
 * @returns {number} Total beats
 */
function countTotalBeats(abcContent, headers) {
  let totalBeats = 0;
  const defaultLength = parseFraction(headers.defaultNoteLength);

  // Extract just the music content (skip headers and comments)
  const musicLines = [];
  let inMusic = false;

  for (const line of abcContent.split('\n')) {
    // Skip empty lines and comments
    if (!line.trim() || line.startsWith('%')) continue;

    // Start counting after headers
    if (line.match(/^\[?[A-Ga-g]/) || line.match(/^\[?[Vv]:/)) {
      inMusic = true;
    }

    if (inMusic) {
      musicLines.push(line);
    }
  }

  const musicContent = musicLines.join(' ');

  // Remove comments, chord symbols, and other non-note elements
  let cleanMusic = musicContent
    .replace(/%.*$/gm, '') // Remove comments
    .replace(/"[^"]*"/g, '') // Remove chord symbols
    .replace(/![^!]*!/g, '') // Remove decorations
    .replace(/\[[^\]]*\]/g, (match) => {
      // Handle chords - count as single note duration
      if (match.match(/[A-Ga-g]/)) {
        return 'C'; // Replace chord with single note for counting
      }
      return '';
    });

  // Count note durations
  // Note pattern: [A-Ga-gz][\d]*[/]?[\d]*
  const notePattern = /([A-Ga-gz])(\d*)(\/)?([\d]*)/g;
  let match;

  while ((match = notePattern.exec(cleanMusic)) !== null) {
    const note = match[1];
    const multiplier = match[2] || '1';
    const divider = match[4] || '1';

    if (note === 'z') {
      // Rest
      const duration = (parseInt(multiplier) / parseInt(divider)) * defaultLength;
      totalBeats += duration;
    } else if (note.match(/[A-Ga-g]/)) {
      // Note
      let duration = defaultLength;

      if (match[2] || match[3]) {
        // Has explicit duration
        if (match[3]) {
          // Fractional duration (e.g., C/2)
          duration = defaultLength * (parseInt(multiplier) / parseInt(divider));
        } else {
          // Multiplied duration (e.g., C2)
          duration = defaultLength * parseInt(multiplier);
        }
      }

      totalBeats += duration;
    }
  }

  // Handle repeat sections
  const repeatStarts = (cleanMusic.match(/\|:/g) || []).length;
  const repeatEnds = (cleanMusic.match(/:\|/g) || []).length;

  // Simple repeat handling - if we have repeat markers, multiply affected sections by 2
  // This is a simplification; real ABC can have complex repeat structures
  if (repeatStarts > 0 || repeatEnds > 0) {
    // Estimate that about half the piece is repeated
    totalBeats *= 1.5;
  }

  return totalBeats;
}

/**
 * Parse a fraction string (e.g., "1/8") into a number
 * @param {string} fraction - Fraction string
 * @returns {number} Decimal value
 */
function parseFraction(fraction) {
  if (!fraction) return 1;

  const parts = fraction.split('/');
  if (parts.length === 2) {
    return parseInt(parts[0]) / parseInt(parts[1]);
  }
  return parseInt(fraction) || 1;
}

/**
 * Calculate duration in seconds from total beats and tempo
 * @param {number} totalBeats - Total beat count
 * @param {Object} tempo - Tempo information
 * @param {string} meter - Time signature
 * @returns {number} Duration in seconds
 */
function calculateDurationFromBeats(totalBeats, tempo, meter) {
  // Parse the tempo note value (e.g., "1/4" for quarter note)
  const tempoNoteValue = parseFraction(tempo.noteValue);

  // Calculate how many seconds per tempo note
  const secondsPerTempoNote = 60 / tempo.bpm;

  // Calculate seconds per beat unit
  const secondsPerBeat = secondsPerTempoNote / tempoNoteValue;

  // Total duration
  const duration = totalBeats * secondsPerBeat;

  return duration;
}

/**
 * Get duration from ABC file
 * @param {string} filePath - Path to ABC file
 * @returns {Promise<number>} Duration in seconds
 */
export async function getAbcFileDuration(filePath) {
  const fs = await import('fs/promises');

  try {
    const content = await fs.readFile(filePath, 'utf-8');
    return calculateAbcDuration(content);
  } catch (error) {
    console.error(`Error reading ABC file ${filePath}:`, error.message);
    return null;
  }
}