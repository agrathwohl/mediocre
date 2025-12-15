/**
 * Shared ABC validation and fixing functions
 * Consolidates duplicate logic from claude.js and critic.js
 */

// Constants for magic numbers
const MAX_SAFE_VELOCITY = 115;
const DEFAULT_SAFE_VELOCITY = 110;
const MAX_PATTERN_LENGTH = 64;
const MAX_DYNAMICS_CHARS = 3;

/**
 * ABC Validator - Shared fixing functions for ABC notation
 */
export class AbcValidator {
  /**
   * Fix uppercase letters with apostrophes (invalid octave notation)
   * ABC standard: only lowercase letters can have apostrophes
   * @param {string} abc - ABC notation to fix
   * @returns {string} Fixed ABC notation
   */
  static fixUppercaseApostrophes(abc) {
    return abc.replace(/([A-G])('+)/g, (match, note, apostrophes) => {
      return note.toLowerCase() + apostrophes;
    });
  }

  /**
   * Fix invalid dynamics (more than 3 f's or p's)
   * @param {string} abc - ABC notation to fix
   * @returns {string} Fixed ABC notation
   */
  static fixInvalidDynamics(abc) {
    let fixed = abc
      // Fix bracketed dynamics
      .replace(/!f{4,}!/g, '!fff!')
      .replace(/!p{4,}!/g, '!ppp!')
      // Fix standalone dynamics
      .replace(/\bf{4,}\b/g, 'fff')
      .replace(/\bp{4,}\b/g, 'ppp');

    return fixed;
  }

  /**
   * Fix high MIDI velocities that could cause clipping
   * Reduces velocities above MAX_SAFE_VELOCITY to DEFAULT_SAFE_VELOCITY
   * @param {string} abc - ABC notation to fix
   * @returns {string} Fixed ABC notation
   */
  static fixHighVelocities(abc) {
    return abc.replace(/%%MIDI drum (\S+) (\d+) (\d+)/g, (match, pattern, note, velocity) => {
      const vel = parseInt(velocity);
      if (vel > MAX_SAFE_VELOCITY) {
        return `%%MIDI drum ${pattern} ${note} ${DEFAULT_SAFE_VELOCITY}`;
      }
      return match;
    });
  }

  /**
   * Remove orphaned MIDI program declarations
   * If %%MIDI program N exists but V:N doesn't, remove it
   * @param {string} abc - ABC notation to fix
   * @returns {string} Fixed ABC notation
   */
  static fixOrphanedMidiDeclarations(abc) {
    const lines = abc.split('\n');
    const voiceNumbers = new Set();

    // Find all voice declarations (both V:1 and [V:1] formats)
    for (const line of lines) {
      const voiceMatch = line.match(/^\[?V:(\d+)/);
      if (voiceMatch) {
        voiceNumbers.add(parseInt(voiceMatch[1]));
      }
    }

    // Filter out MIDI declarations for non-existent voices
    const filtered = lines.filter(line => {
      const midiMatch = line.match(/%%MIDI program (\d+)/);
      if (midiMatch) {
        const voiceNum = parseInt(midiMatch[1]);
        return voiceNumbers.has(voiceNum);
      }
      return true;
    });

    return filtered.join('\n');
  }

  /**
   * Fix MIDI directive placement - MUST be in header only!
   * MIDI directives inside voice sections cause abc2midi to segfault
   * @param {string} abc - ABC notation to fix
   * @returns {string} Fixed ABC notation
   */
  static fixMidiDirectivePlacement(abc) {
    const lines = abc.split('\n');
    const headerLines = [];
    const bodyLines = [];
    const midiDirectivesToMove = [];

    let inHeader = true;
    let currentVoice = null;

    for (const line of lines) {
      // Check if we've hit a voice declaration (both V:1 and [V:1] formats)
      if (line.match(/^\[?V:\d+/)) {
        inHeader = false;
        currentVoice = line;
        bodyLines.push(line);
        continue;
      }

      // If we're in a voice section and find a MIDI directive
      if (!inHeader && line.startsWith('%%MIDI')) {
        // Move ALL MIDI directives from voice sections to header
        // (abc2midi can't handle ANY MIDI directives inside voice sections)
        midiDirectivesToMove.push(line);
        // Don't add to body - remove it from voice section
        continue;
      }

      // Normal processing - keep everything in its section
      if (inHeader) {
        headerLines.push(line);
      } else {
        bodyLines.push(line);
      }
    }

    // If we found MIDI directives to move, add them to the header
    if (midiDirectivesToMove.length > 0) {
      console.warn(`⚠️ Moving ${midiDirectivesToMove.length} MIDI directive(s) from voice sections to header`);

      // Rebuild the ABC with moved MIDI directives in the proper location
      const result = [];

      // Add header lines and insert moved directives after K: line
      for (const line of headerLines) {
        result.push(line);
        // Add extracted MIDI directives after the K: line (key signature)
        if (line.match(/^K:/)) {
          for (const midiLine of midiDirectivesToMove) {
            result.push(midiLine);
          }
        }
      }

      // Add body lines
      for (const line of bodyLines) {
        result.push(line);
      }

      return result.join('\n');
    }

    // No changes needed - return original
    return abc;
  }

  /**
   * Limit excessive octave markers (more than 2 causes abc2midi to crash)
   * ABC notation standard supports max 2 octave markers in each direction
   * @param {string} abc - ABC notation to fix
   * @returns {string} Fixed ABC notation
   */
  static limitOctaveMarkers(abc) {
    // Fix upper octave markers (apostrophes) - match 3 or more, limit to 2
    let fixed = abc.replace(/([A-Ga-g])('{3,})/g, (match, note, octaves) => {
      console.warn(`⚠️ Excessive octave markers on ${note} (${octaves.length} apostrophes) - limiting to 2`);
      return note + "''";  // Always return exactly 2 apostrophes
    });

    // Fix lower octave markers (commas) - match 3 or more, limit to 2
    fixed = fixed.replace(/([A-Ga-g])(,{3,})/g, (match, note, octaves) => {
      console.warn(`⚠️ Excessive octave markers on ${note} (${octaves.length} commas) - limiting to 2`);
      return note + ",,";  // Always return exactly 2 commas
    });

    return fixed;
  }

  /**
   * Fix drum pattern syntax issues
   * @param {string} pattern - Drum pattern string
   * @returns {string} Fixed pattern
   */
  static fixDrumPattern(pattern) {
    // Limit pattern length to prevent buffer overflows
    if (pattern.length > MAX_PATTERN_LENGTH) {
      console.warn(`⚠️ Drum pattern too long (${pattern.length} chars) - truncating to ${MAX_PATTERN_LENGTH}`);
      return pattern.substring(0, MAX_PATTERN_LENGTH);
    }
    return pattern;
  }
}

// Export constants for use in other modules
export { MAX_SAFE_VELOCITY, DEFAULT_SAFE_VELOCITY, MAX_PATTERN_LENGTH, MAX_DYNAMICS_CHARS };