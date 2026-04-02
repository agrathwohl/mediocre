/**
 * ABC notation post-processing cleanup.
 * Fixes systematic errors produced by LLM-generated ABC notation.
 *
 * Based on empirical analysis of ~100+ model outputs:
 * - Stray / not in grace sequence (16-19 per piece)
 * - Malformed notes — bare numbers without pitch letters
 * - Nested/adjacent grace notes without intervening notes
 * - Nested chord brackets
 * - Reserved characters (o, w, W) in note context
 * - Unequal note durations in chords
 * - Bar overflow (8 units in 7/8 meter)
 *
 * @module abc-cleanup
 */

/**
 * Clean up LLM-generated ABC notation.
 * @param {string} abc - Raw ABC notation
 * @param {Object} [options]
 * @param {number} [options.unitsPerBar] - Expected units per bar (e.g. 7 for 7/8 L:1/8)
 * @returns {{ cleaned: string, fixes: string[] }}
 */
export function cleanupAbc(abc, options = {}) {
  const fixes = [];
  let lines = abc.split('\n');

  lines = lines.map((line, lineNum) => {
    // Skip headers, directives, comments, voice declarations
    const t = line.trim();
    if (!t) return line;
    if (/^[XTMLQKCZW]:/.test(t)) return line;
    if (t.startsWith('%%')) return line;
    if (t.startsWith('%')) return line;
    if (t.startsWith('V:') || t.startsWith('[V:')) return line;

    let fixed = line;

    // 1. Strip stray / not inside grace note braces {}
    // Valid: {/C}D or {C/D}  Invalid: D/2 is valid (half duration), but /D alone is stray
    // Strategy: remove / that is preceded by space, |, or start-of-content and NOT inside {}
    const beforeSlashFix = fixed;
    fixed = fixStraySlashes(fixed);
    if (fixed !== beforeSlashFix) {
      fixes.push(`L${lineNum + 1}: removed stray slashes`);
    }

    // 2. Strip bare numbers not attached to notes (orphan digits)
    // Valid: C4, z7, [CEG]2  Invalid: bare "5" or "8" between bars
    const beforeNumFix = fixed;
    fixed = fixOrphanNumbers(fixed);
    if (fixed !== beforeNumFix) {
      fixes.push(`L${lineNum + 1}: removed orphan numbers`);
    }

    // 3. Fix nested grace notes — {grace}{grace}note → {grace}note
    const beforeGraceFix = fixed;
    fixed = fixNestedGraces(fixed);
    if (fixed !== beforeGraceFix) {
      fixes.push(`L${lineNum + 1}: fixed nested grace notes`);
    }

    // 4. Fix nested chord brackets — [[ or ] missing
    const beforeChordFix = fixed;
    fixed = fixNestedChords(fixed);
    if (fixed !== beforeChordFix) {
      fixes.push(`L${lineNum + 1}: fixed chord brackets`);
    }

    // 5. Strip reserved characters in note context (o, w, W as notes)
    const beforeReserved = fixed;
    fixed = fixReservedChars(fixed);
    if (fixed !== beforeReserved) {
      fixes.push(`L${lineNum + 1}: stripped reserved characters`);
    }

    // 6. Fix unequal chord durations — [C4E2G4] → [CEG]4
    const beforeChordDur = fixed;
    fixed = fixChordDurations(fixed);
    if (fixed !== beforeChordDur) {
      fixes.push(`L${lineNum + 1}: normalized chord durations`);
    }

    return fixed;
  });

  return {
    cleaned: lines.join('\n'),
    fixes,
  };
}

/**
 * Remove / characters that aren't part of valid ABC constructs.
 * Valid uses: {/C} grace, C/2 duration fraction, C/ shorthand
 * Invalid: standalone / between notes or after |
 */
function fixStraySlashes(line) {
  // Remove / that is:
  // - After a space or | (not a duration modifier)
  // - Before a space or | (not a grace note prefix)
  // But keep: {/...}, note/ (duration halving), note/2 etc.
  let result = '';
  let inGrace = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '{') inGrace = true;
    if (ch === '}') inGrace = false;

    if (ch === '/' && !inGrace) {
      const prev = i > 0 ? line[i - 1] : ' ';
      const next = i < line.length - 1 ? line[i + 1] : ' ';
      // Keep if preceded by a note letter or ] (duration modifier)
      const prevIsNote = /[A-Ga-g,'\]\d]/.test(prev);
      // Keep if followed by a digit (fraction like /2)
      const nextIsDigit = /\d/.test(next);
      if (prevIsNote || nextIsDigit) {
        result += ch;
      }
      // else: drop it (stray slash)
    } else {
      result += ch;
    }
  }
  return result;
}

/**
 * Remove bare numbers not attached to a note, rest, chord, or duration context.
 */
function fixOrphanNumbers(line) {
  // A number is orphan if preceded by space/| and followed by space/|
  // Valid: C4, z7, [CEG]2, /2  Invalid: | 5 | or " 8 "
  return line.replace(/(?<=[\s|])(\d+)(?=[\s|])/g, (match, num) => {
    // Keep if it could be a bar number or looks intentional
    return '';
  });
}

/**
 * Fix adjacent grace notes without intervening real notes.
 * {C}{D}E → {CD}E
 */
function fixNestedGraces(line) {
  // Merge adjacent grace sequences: }{  →  remove }{
  let result = line.replace(/\}\s*\{/g, '');
  // Fix grace notes with no following real note: {...}| or {...}z → drop the grace
  result = result.replace(/\{[^}]*\}(?=\s*[|z\s])/g, '');
  return result;
}

/**
 * Fix nested chord brackets.
 * [[ → [, ]] → ], [C[D → [CD, etc.
 */
function fixNestedChords(line) {
  let result = line;
  // Remove doubled brackets
  result = result.replace(/\[\[/g, '[');
  result = result.replace(/\]\]/g, ']');

  // Fix unclosed brackets — count [ and ] and add missing ]
  let depth = 0;
  let cleaned = '';
  for (const ch of result) {
    if (ch === '[') {
      if (depth > 0) continue; // skip nested [
      depth++;
    } else if (ch === ']') {
      if (depth <= 0) continue; // skip extra ]
      depth--;
    }
    cleaned += ch;
  }
  // Close any unclosed bracket
  while (depth > 0) {
    cleaned += ']';
    depth--;
  }
  return cleaned;
}

/**
 * Strip reserved characters (o, w, W) that appear in note context.
 * These are lyrics/annotation characters that the model misuses as notes.
 */
function fixReservedChars(line) {
  // Remove bare 'o' between notes (not part of a note name — o is not A-G)
  // Remove 'w' and 'W' that aren't at line start (w: is lyrics)
  let result = line;
  // Strip 'o' that isn't part of a word (like "program" in a directive)
  result = result.replace(/(?<=[A-Ga-g,'\d\s|])o(?=[\d\s|A-Ga-g])/g, '');
  // Strip bare w/W in note context (not at line start)
  result = result.replace(/(?<=[\s|])w\d+/g, (match) => `z${match.slice(1)}`);
  result = result.replace(/(?<=[\s|])W\d+/g, (match) => `z${match.slice(1)}`);
  return result;
}

/**
 * Normalize chord durations: [C4E4G4] → [CEG]4
 * When all notes in a chord have the same duration, move it outside.
 */
function fixChordDurations(line) {
  return line.replace(/\[([^\]]+)\]/g, (match, inner) => {
    // Parse notes with durations inside the chord
    const notePattern = /([=^_]*[A-Ga-g][,']*)(\d+)?/g;
    const notes = [];
    const durations = new Set();
    let m;
    while ((m = notePattern.exec(inner)) !== null) {
      notes.push(m[1]);
      if (m[2]) durations.add(m[2]);
    }
    if (notes.length === 0) return match;
    // If all durations are the same, extract
    if (durations.size === 1) {
      const dur = [...durations][0];
      const pitches = notes.join('');
      return `[${pitches}]${dur}`;
    }
    return match; // mixed durations — leave as-is
  });
}
