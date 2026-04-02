/**
 * ABC Mirror preprocessor.
 * Resolves %%MIRROR directives by extracting bars/voices from referenced ABC files
 * and splicing them into the target composition.
 *
 * Syntax:
 *   %%MIRROR file "source.abc"       — set source file
 *   %%MIRROR voice N                 — extract from voice N (default: 1)
 *   %%MIRROR bars S-E                — extract bars S through E (1-indexed)
 *   %%MIRROR transpose N             — transpose by N semitones
 *   %%MIRROR timescale F             — scale durations by factor F
 *   %%MIRROR velocity F              — scale velocities by factor F
 *   %%MIRROR offset N                — insert at bar N of current piece
 *   %%MIRROR self bars S-E           — quote from current file
 *
 * @module abc-mirror
 */

import fs from 'fs';
import path from 'path';

/**
 * Extract voice sections from raw ABC text.
 * Returns a map of voiceId → array of bar strings.
 * @param {string} abc - ABC notation text
 * @returns {Map<string, string[]>} voiceId → bars
 */
function extractVoiceBars(abc) {
  const lines = abc.split('\n');
  const voices = new Map();
  let currentVoice = '1'; // default voice

  for (const line of lines) {
    const trimmed = line.trim();

    // Voice switch: [V:N] or V:N
    const vMatch = trimmed.match(/^\[?V:(\S+?)[\]\s]/);
    if (vMatch) {
      currentVoice = vMatch[1];
      if (!voices.has(currentVoice)) voices.set(currentVoice, []);
      continue;
    }

    // Skip headers, directives, comments
    if (!trimmed) continue;
    if (/^[XTMLQKCZW]:/.test(trimmed)) continue;
    if (trimmed.startsWith('%%')) continue;
    if (trimmed.startsWith('%')) continue;
    if (trimmed.startsWith('V:')) continue;

    // This is note content — split into bars
    if (!voices.has(currentVoice)) voices.set(currentVoice, []);
    const bars = trimmed.split('|').filter(b => b.trim());
    for (const bar of bars) {
      voices.get(currentVoice).push(bar.trim());
    }
  }

  return voices;
}

/**
 * Extract the header block from an ABC file (everything up to and including K:).
 * @param {string} abc
 * @returns {string}
 */
function extractHeader(abc) {
  const lines = abc.split('\n');
  const headerLines = [];
  for (const line of lines) {
    headerLines.push(line);
    if (line.trim().startsWith('K:')) break;
  }
  return headerLines.join('\n');
}

/**
 * Apply semitone transposition to ABC note content.
 * Uses a simple pitch mapping approach.
 * @param {string} abc - Bar content
 * @param {number} semitones - Transposition amount
 * @returns {string}
 */
function transposeAbc(abc, semitones) {
  if (semitones === 0) return abc;

  const noteMap = ['C', '^C', 'D', '^D', 'E', 'F', '^F', 'G', '^G', 'A', '^A', 'B'];
  const flatMap = ['C', '_D', 'D', '_E', 'E', 'F', '_G', 'G', '_A', 'A', '_B', 'B'];

  // Match ABC notes: optional accidental + letter + optional octave marks
  return abc.replace(/([=^_]*)([A-Ga-g])([,']*)(\d*\/?\d*)/g, (match, accidental, letter, octave, duration) => {
    // Determine base pitch
    const isLower = letter === letter.toLowerCase();
    const upperLetter = letter.toUpperCase();

    let pitchIndex = 'CDEFGAB'.indexOf(upperLetter);
    if (pitchIndex === -1) return match;

    // Convert to semitone
    const semitoneMap = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };
    let semitone = semitoneMap[upperLetter];

    // Apply accidentals
    if (accidental.includes('^')) semitone += accidental.split('^').length - 1;
    if (accidental.includes('_')) semitone -= accidental.split('_').length - 1;
    if (accidental.includes('=')) { /* natural — no change */ }

    // Transpose
    semitone += semitones;

    // Normalize to 0-11 range with octave adjustment
    let octaveShift = Math.floor(semitone / 12);
    semitone = ((semitone % 12) + 12) % 12;

    // Pick the new note name (prefer sharps for upward transposition, flats for downward)
    const newNoteName = semitones >= 0 ? noteMap[semitone] : flatMap[semitone];

    // Reconstruct
    let newAccidental = '';
    let newLetter = newNoteName;
    if (newNoteName.startsWith('^') || newNoteName.startsWith('_')) {
      newAccidental = newNoteName[0];
      newLetter = newNoteName.slice(1);
    }

    // Handle case (upper/lower)
    if (isLower) {
      newLetter = newLetter.toLowerCase();
      octaveShift--; // lowercase is already one octave up
    }

    // Reconstruct octave marks
    let newOctave = octave;
    if (octaveShift > 0) {
      newOctave = "'".repeat(octaveShift) + octave;
    } else if (octaveShift < 0) {
      newOctave = ",".repeat(-octaveShift) + octave;
    }

    return newAccidental + newLetter + newOctave + duration;
  });
}

/**
 * Scale durations in ABC note content.
 * @param {string} abc - Bar content
 * @param {number} factor - Duration multiplier
 * @returns {string}
 */
function timescaleAbc(abc, factor) {
  if (factor === 1.0) return abc;

  // Match note durations: note followed by number or fraction
  return abc.replace(/([A-Ga-gz])(\d+)(\/\d+)?/g, (match, note, num, frac) => {
    let duration = parseInt(num);
    if (frac) {
      const denom = parseInt(frac.slice(1));
      duration = duration / denom;
    }
    duration *= factor;

    // Round to nearest integer or simple fraction
    const rounded = Math.round(duration);
    if (rounded < 1) return note + '/' + Math.round(1 / duration);
    return note + rounded;
  });
}

/**
 * Parse a %%MIRROR directive block into a mirror operation.
 * Collects consecutive %%MIRROR lines into one operation.
 * @param {string[]} lines - Array of %%MIRROR lines
 * @returns {Object} Mirror operation descriptor
 */
function parseMirrorDirectives(lines) {
  const op = {
    file: null,
    voice: '1',
    startBar: 1,
    endBar: null, // null = all bars
    transpose: 0,
    timescale: 1.0,
    velocity: 1.0,
    offset: 0,
    self: false,
  };

  for (const line of lines) {
    const trimmed = line.replace(/^%%MIRROR\s+/, '').trim();

    const fileMatch = trimmed.match(/^file\s+"([^"]+)"/);
    if (fileMatch) { op.file = fileMatch[1]; continue; }

    const voiceMatch = trimmed.match(/^voice\s+(\S+)/);
    if (voiceMatch) { op.voice = voiceMatch[1]; continue; }

    const barsMatch = trimmed.match(/^bars\s+(\d+)-(\d+)/);
    if (barsMatch) {
      op.startBar = parseInt(barsMatch[1]);
      op.endBar = parseInt(barsMatch[2]);
      continue;
    }

    const transposeMatch = trimmed.match(/^transpose\s+(-?\d+)/);
    if (transposeMatch) { op.transpose = parseInt(transposeMatch[1]); continue; }

    const timescaleMatch = trimmed.match(/^timescale\s+([\d.]+)/);
    if (timescaleMatch) { op.timescale = parseFloat(timescaleMatch[1]); continue; }

    const velocityMatch = trimmed.match(/^velocity\s+([\d.]+)/);
    if (velocityMatch) { op.velocity = parseFloat(velocityMatch[1]); continue; }

    const offsetMatch = trimmed.match(/^offset\s+(\d+)/);
    if (offsetMatch) { op.offset = parseInt(offsetMatch[1]); continue; }

    const selfMatch = trimmed.match(/^self\s+bars\s+(\d+)-(\d+)/);
    if (selfMatch) {
      op.self = true;
      op.startBar = parseInt(selfMatch[1]);
      op.endBar = parseInt(selfMatch[2]);
      continue;
    }
  }

  return op;
}

/**
 * Resolve all %%MIRROR directives in an ABC file.
 * @param {string} abc - ABC notation with %%MIRROR directives
 * @param {string} baseDir - Base directory for resolving relative file paths
 * @returns {{ resolved: string, operations: Object[], errors: string[] }}
 */
export function resolveMirrors(abc, baseDir = '.') {
  const lines = abc.split('\n');
  const operations = [];
  const errors = [];
  const resolvedLines = [];

  // Self-reference: extract bars from current file
  const selfBars = extractVoiceBars(abc);

  let i = 0;
  while (i < lines.length) {
    const line = lines[i].trim();

    if (line.startsWith('%%MIRROR')) {
      // Collect consecutive %%MIRROR lines into one operation
      const mirrorLines = [];
      while (i < lines.length && lines[i].trim().startsWith('%%MIRROR')) {
        mirrorLines.push(lines[i].trim());
        i++;
      }

      const op = parseMirrorDirectives(mirrorLines);
      operations.push(op);

      try {
        let sourceBars;

        if (op.self) {
          // Self-reference — extract from current file, stripping %%MIRROR lines first
          const cleanedAbc = abc.split('\n').filter(l => !l.trim().startsWith('%%MIRROR')).join('\n');
          const selfBarsClean = extractVoiceBars(cleanedAbc);
          const voiceBars = selfBarsClean.get(op.voice) || selfBarsClean.get('1') || [];
          sourceBars = voiceBars;
        } else if (op.file) {
          // External file reference
          const filePath = path.resolve(baseDir, op.file);
          if (!fs.existsSync(filePath)) {
            errors.push(`MIRROR: file not found: ${filePath}`);
            resolvedLines.push(`% MIRROR ERROR: file not found: ${op.file}`);
            continue;
          }
          const sourceAbc = fs.readFileSync(filePath, 'utf8');
          const sourceVoices = extractVoiceBars(sourceAbc);
          sourceBars = sourceVoices.get(op.voice) || sourceVoices.get('1') || [];
        } else {
          errors.push('MIRROR: no file or self reference specified');
          resolvedLines.push('% MIRROR ERROR: no source specified');
          continue;
        }

        // Extract bar range (1-indexed)
        const start = op.startBar - 1;
        const end = op.endBar ? op.endBar : sourceBars.length;
        const extracted = sourceBars.slice(start, end);

        if (extracted.length === 0) {
          errors.push(`MIRROR: no bars found (voice ${op.voice}, bars ${op.startBar}-${op.endBar || 'end'})`);
          resolvedLines.push('% MIRROR ERROR: no bars extracted');
          continue;
        }

        // Apply transforms
        let result = extracted.map(bar => {
          let b = bar;
          if (op.transpose !== 0) b = transposeAbc(b, op.transpose);
          if (op.timescale !== 1.0) b = timescaleAbc(b, op.timescale);
          return b;
        });

        // Add offset (prepend rest bars)
        if (op.offset > 0) {
          // Compute rest bar from source file's meter
          let restBar = 'z7';
          const mMatch = abc.match(/^M:\s*(\d+)\/(\d+)/m);
          const lMatch = abc.match(/^L:\s*1\/(\d+)/m);
          if (mMatch && lMatch) {
            const units = parseInt(mMatch[1]) * (parseInt(lMatch[1]) / parseInt(mMatch[2]));
            restBar = `z${units}`;
          }
          const padding = Array(op.offset).fill(restBar);
          result = [...padding, ...result];
        }

        // Emit as ABC
        const sourceDesc = op.self
          ? `self bars ${op.startBar}-${op.endBar}`
          : `${op.file} V:${op.voice} bars ${op.startBar}-${op.endBar || 'end'}`;
        resolvedLines.push(`% MIRROR RESOLVED: ${sourceDesc}` +
          (op.transpose ? ` transpose ${op.transpose}` : '') +
          (op.timescale !== 1.0 ? ` timescale ${op.timescale}` : ''));
        resolvedLines.push(result.join(' | ') + ' |');

      } catch (err) {
        errors.push(`MIRROR: ${err.message}`);
        resolvedLines.push(`% MIRROR ERROR: ${err.message}`);
      }
    } else {
      resolvedLines.push(lines[i]);
      i++;
    }
  }

  return {
    resolved: resolvedLines.join('\n'),
    operations,
    errors,
  };
}

/**
 * Resolve mirrors in an ABC file on disk.
 * @param {string} filePath - Path to ABC file
 * @param {string} [outputPath] - Output path (default: overwrite in place)
 * @returns {Promise<{ operations: number, errors: string[] }>}
 */
export async function resolveMirrorFile(filePath, outputPath = null) {
  const abc = await fs.promises.readFile(filePath, 'utf8');
  const baseDir = path.dirname(filePath);

  // Check if there are any MIRROR directives
  if (!abc.includes('%%MIRROR')) {
    return { operations: 0, errors: [] };
  }

  const { resolved, operations, errors } = resolveMirrors(abc, baseDir);

  const outPath = outputPath || filePath;
  await fs.promises.writeFile(outPath, resolved);

  return { operations: operations.length, errors };
}
