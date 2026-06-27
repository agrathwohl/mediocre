/**
 * Fragment Map utilities for lossless evolutionary selection.
 * Applies abc2midi's random fragment decisions to source ABC notation
 * without the lossy MIDI→ABC round-trip.
 *
 * @module fragmap
 */

import fs from 'fs';

/**
 * Read a fragment map JSON file produced by abc2midi -fragmap.
 * @param {string} filePath - Path to the fragmap JSON
 * @returns {Object} Parsed fragment map
 */
export async function readFragmap(filePath) {
  const content = await fs.promises.readFile(filePath, 'utf8');
  return JSON.parse(content);
}

/**
 * Apply a fragment map to source ABC notation.
 * Replaces dropped notes with equivalent-duration rests in the specified bar range.
 *
 * @param {string} sourceAbc - The original ABC notation (pristine)
 * @param {Object} fragmap - Fragment map from abc2midi -fragmap
 * @param {number} [startBar] - First bar to apply (1-indexed, inclusive). Default: all bars.
 * @param {number} [endBar] - Last bar to apply (1-indexed, inclusive). Default: all bars.
 * @returns {string} Modified ABC with dropped notes replaced by rests
 */
export function applyFragmentMap(sourceAbc, fragmap, startBar = null, endBar = null) {
  if (!fragmap.voices) return sourceAbc;

  const lines = sourceAbc.split('\n');
  const result = [];
  let currentVoice = null;
  let barCounter = 0; // per-voice bar counter

  // Build a lookup: voice → bar → noteIndex → survived
  const dropMap = new Map(); // "voice:bar:noteIndex" → boolean
  for (const [vid, voiceData] of Object.entries(fragmap.voices)) {
    const decisions = voiceData.transform_fragment?.decisions || [];
    for (const d of decisions) {
      dropMap.set(`${vid}:${d.bar}:${d.noteIndex}`, d.survived);
    }
  }

  if (dropMap.size === 0) return sourceAbc; // no fragment decisions to apply

  for (const line of lines) {
    const t = line.trim();

    // Track voice switches
    const vm = t.match(/^\[?V:(\S+?)[\]\s]/) || t.match(/^V:(\S+)/);
    if (vm) {
      currentVoice = vm[1];
      barCounter = 0;
      result.push(line);
      continue;
    }

    // Non-music lines pass through
    if (!currentVoice || !t || /^[XTMLQKCZW]:/.test(t) || t.startsWith('%%') || t.startsWith('%')) {
      result.push(line);
      continue;
    }

    // This is a music line — process bar by bar
    const bars = line.split('|');
    const processedBars = [];

    for (const bar of bars) {
      const trimmedBar = bar.trim();
      if (!trimmedBar) {
        processedBars.push(bar);
        continue;
      }

      barCounter++;

      // Check if this bar is in the target range
      if (startBar !== null && barCounter < startBar) {
        processedBars.push(bar);
        continue;
      }
      if (endBar !== null && barCounter > endBar) {
        processedBars.push(bar);
        continue;
      }

      // Check if this voice has fragment decisions
      let hasDecisions = false;
      for (const key of dropMap.keys()) {
        if (key.startsWith(`${currentVoice}:${barCounter}:`)) {
          hasDecisions = true;
          break;
        }
      }

      if (!hasDecisions) {
        processedBars.push(bar);
        continue;
      }

      // Apply fragment decisions to this bar
      // Walk through note tokens, replace dropped notes with rests
      let noteIndex = 0;
      const processed = bar.replace(
        /([=^_]*[A-Ga-g][,']*\d*\/?\d*)/g,
        (match) => {
          const key = `${currentVoice}:${barCounter}:${noteIndex}`;
          noteIndex++;

          const survived = dropMap.get(key);
          if (survived === false) {
            // Replace note with rest of same duration
            const durMatch = match.match(/(\d+\/?\d*)/);
            const dur = durMatch ? durMatch[1] : '';
            return `z${dur}`;
          }
          return match; // survived or no decision — keep original
        }
      );

      processedBars.push(processed);
    }

    result.push(processedBars.join('|'));
  }

  return result.join('\n');
}

/**
 * Apply fragment maps from multiple seeds to produce per-seed ABC variants.
 * Each variant is the source ABC with one seed's fragment decisions applied.
 *
 * @param {string} sourceAbc - Original ABC notation
 * @param {Map<number, Object>} fragmaps - Map of seed → fragmap object
 * @returns {Map<number, string>} Map of seed → modified ABC
 */
export function applyAllFragmaps(sourceAbc, fragmaps) {
  const variants = new Map();
  for (const [seed, fragmap] of fragmaps) {
    variants.set(seed, applyFragmentMap(sourceAbc, fragmap));
  }
  return variants;
}

/**
 * Apply a fragment map to a specific segment range only.
 * Used by evolve to splice the winning seed's fragment pattern into a specific segment.
 *
 * @param {string} sourceAbc - Original ABC notation
 * @param {Object} fragmap - Fragment map for the winning seed
 * @param {number} segmentStart - First bar of the segment (1-indexed)
 * @param {number} segmentEnd - Last bar of the segment (1-indexed)
 * @returns {string} Source ABC with fragment decisions applied only in the segment range
 */
export function applyFragmentToSegment(sourceAbc, fragmap, segmentStart, segmentEnd) {
  return applyFragmentMap(sourceAbc, fragmap, segmentStart, segmentEnd);
}

/**
 * Assemble an evolved piece from source ABC + per-segment fragmap selections.
 * This is the lossless replacement for the MIDI→ABC round-trip approach.
 *
 * @param {string} sourceAbc - Original ABC notation (pristine)
 * @param {Array<{segStart: number, segEnd: number, seed: number, score: number}>} selections
 * @param {Map<number, Object>} fragmaps - Map of seed → fragmap
 * @returns {string} Evolved ABC — source notation with winning fragment patterns applied per segment
 */
export function assembleFromFragmaps(sourceAbc, selections, fragmaps) {
  let result = sourceAbc;

  // Apply each winning segment's fragmap in order
  // Since applyFragmentMap only modifies the specified bar range,
  // applying them sequentially is safe (they don't overlap)
  for (const sel of selections) {
    const fragmap = fragmaps.get(sel.seed);
    if (fragmap && sel.seed !== 1) {
      // Seed 1 = default (no fragment changes needed)
      result = applyFragmentToSegment(result, fragmap, sel.segStart, sel.segEnd);
    }
  }

  // Inject provenance
  const provenance = [
    `% EVOLVED (lossless): fragment maps from ${fragmaps.size} seeds`,
    ...selections.map(s => `%   Bars ${s.segStart}-${s.segEnd}: seed ${s.seed} (score ${s.score})`),
  ].join('\n');
  result = result.replace(/^(K:.*\n)/m, `$1${provenance}\n`);

  return result;
}
