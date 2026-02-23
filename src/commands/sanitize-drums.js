import fs from 'fs';
import path from 'path';
import { glob } from 'glob';
import { generateText } from 'ai';
import { getAnthropic, cleanAbcNotation } from '../utils/claude.js';

// Banned drum notes that sound terrible and must be replaced
const BANNED_DRUM_NOTES = new Set([71, 72, 73, 74, 78, 79]);

// Banned drum PROGRAMS (kit selections on channel 10) that sound terrible
const BANNED_DRUM_PROGRAMS = new Set([25, 28]);

// Valid drum program replacements
const DRUM_PROGRAM_REPLACEMENT = 0; // Standard Kit

// Human-readable names for banned notes
const BANNED_NOTE_NAMES = {
  71: 'Short Whistle (B4)',
  72: 'Long Whistle (C5)',
  73: 'Short Guiro (C#5)',
  74: 'Long Guiro (D5)',
  78: 'Mute Cuica (F#5)',
  79: 'Open Cuica (G5)',
};

// ABC note to MIDI - maps note letters to their MIDI offset from the banned range
// We need to detect notes that will play as banned MIDI numbers on channel 10
const ABC_NOTE_TO_MIDI = {
  'C': 48, 'D': 50, 'E': 52, 'F': 53, 'G': 55, 'A': 57, 'B': 59,
  'c': 60, 'd': 62, 'e': 64, 'f': 65, 'g': 67, 'a': 69, 'b': 71
};

// Replacement map - what to replace banned notes with
const REPLACEMENT_MAP = {
  71: 42, // Short Whistle -> Closed Hi-Hat
  72: 46, // Long Whistle -> Open Hi-Hat
  73: 37, // Short Guiro -> Side Stick
  74: 56, // Long Guiro -> Cowbell
  78: 38, // Mute Cuica -> Acoustic Snare
  79: 40, // Open Cuica -> Electric Snare
};

// ABC notes that map to banned MIDI numbers (for replacement in drum voices)
// WARNING: This mapping ONLY works for Standard Kit (program 0)!
// Different drum programs map the SAME ABC notes to DIFFERENT sounds.
// Use --llm mode for files with non-standard drum programs (%%MIDI program 10 N where N != 0)
// Must match REPLACEMENT_MAP: 71->42, 72->46, 73->37, 74->56, 78->38, 79->40
// ABC note to MIDI: ^F,=42, ^A,=46, ^C,=37, ^G=56, D,=38, E,=40
const BANNED_ABC_NOTES = {
  'b': { midi: 71, replacement: '^F,' },     // Short Whistle (71) -> Closed Hi-Hat (42)
  "c'": { midi: 72, replacement: '^A,' },    // Long Whistle (72) -> Open Hi-Hat (46)
  "^c'": { midi: 73, replacement: '^C,' },   // Short Guiro (73) -> Side Stick (37)
  "d'": { midi: 74, replacement: '^G' },     // Long Guiro (74) -> Cowbell (56)
  "^f'": { midi: 78, replacement: 'D,' },    // Mute Cuica (78) -> Acoustic Snare (38)
  "g'": { midi: 79, replacement: 'E,' },     // Open Cuica (79) -> Electric Snare (40)
};

/**
 * Check if a line indicates start of a drum voice
 * @param {string} line - Trimmed line to check
 * @returns {boolean}
 */
function isDrumVoiceStart(line) {
  return !!(
    line.match(/^V:\s*\S+.*clef\s*=\s*perc/i) ||
    line.match(/^\[V:\s*\S+.*clef\s*=\s*perc/i) ||
    line.match(/%%MIDI\s+channel\s+10/i)
  );
}

/**
 * Check if a line is a non-drum voice declaration
 * @param {string} line - Trimmed line to check
 * @returns {boolean}
 */
function isNonDrumVoice(line) {
  return !!(line.match(/^V:\s*\S+/) && !line.match(/clef\s*=\s*perc/i));
}

/**
 * Check if a line is a music content line (not directive/comment/header)
 * @param {string} line - Trimmed line to check
 * @returns {boolean}
 */
function isMusicLine(line) {
  return !(
    line.startsWith('%') ||
    line.startsWith('V:') ||
    line.startsWith('%%') ||
    line.startsWith('[V:') ||
    line.startsWith('K:') ||
    line.startsWith('[K:')
  );
}

/**
 * Convert ABC note string to MIDI number
 * @param {string} noteStr - ABC note like "^f'", "_B,", "c", etc.
 * @returns {number|null} MIDI number or null if invalid
 */
function abcNoteToMidi(noteStr) {
  let accidental = 0;
  let pos = 0;

  // Parse accidentals
  while (pos < noteStr.length) {
    if (noteStr[pos] === '^') accidental++;
    else if (noteStr[pos] === '_') accidental--;
    else if (noteStr[pos] === '=') accidental = 0;
    else break;
    pos++;
  }

  if (pos >= noteStr.length) return null;

  const noteLetter = noteStr[pos];
  if (!ABC_NOTE_TO_MIDI[noteLetter]) return null;

  let midi = ABC_NOTE_TO_MIDI[noteLetter] + accidental;
  pos++;

  // Count octave modifiers
  while (pos < noteStr.length) {
    if (noteStr[pos] === "'") midi += 12;
    else if (noteStr[pos] === ",") midi -= 12;
    else break;
    pos++;
  }

  return midi;
}

/**
 * Check if ABC content has any drum voices that need LLM analysis
 * @param {string} abcContent - ABC notation content
 * @returns {boolean} True if file has drum content requiring analysis
 */
function hasDrumContent(abcContent) {
  const lines = abcContent.split('\n');
  for (const line of lines) {
    const trimmed = line.trim();
    if (isDrumVoiceStart(trimmed)) return true;
    if (trimmed.match(/%%MIDI\s+drum\s+/i)) return true;
    if (trimmed.match(/%%MIDI\s+drummap\s+/i)) return true;
  }
  return false;
}

/**
 * Check if ABC content uses non-standard drum programs (not program 0) or banned programs
 * Regex mode ONLY works for program 0 - files with other programs MUST use --llm
 * @param {string} abcContent - ABC notation content
 * @returns {{hasNonStandard: boolean, hasBanned: boolean, programs: number[], bannedPrograms: number[]}} Detection result
 */
function hasNonStandardDrumProgram(abcContent) {
  const lines = abcContent.split('\n');
  const programs = new Set();

  for (const line of lines) {
    const trimmed = line.trim();
    // Match %%MIDI program 10 N (channel 10 = drums, N = program number)
    const match = trimmed.match(/%%MIDI\s+program\s+10\s+(\d+)/i);
    if (match) {
      programs.add(parseInt(match[1], 10));
    }
  }

  const programList = Array.from(programs);
  const hasNonStandard = programList.some(p => p !== 0);
  const bannedPrograms = programList.filter(p => BANNED_DRUM_PROGRAMS.has(p));
  const hasBanned = bannedPrograms.length > 0;

  return { hasNonStandard, hasBanned, programs: programList, bannedPrograms };
}

/**
 * Detect banned drum notes in ABC content
 * @param {string} abcContent - ABC notation content
 * @returns {Array<{note: number, name: string, line: number, context: string, type: string}>} Found banned notes
 */
function detectBannedDrumNotes(abcContent) {
  const found = [];
  const lines = abcContent.split('\n');

  let inDrumVoice = false;
  let drumVoiceId = null;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const trimmedLine = line.trim();

    // Detect drum voice start
    if (isDrumVoiceStart(trimmedLine)) {
      inDrumVoice = true;
      const voiceMatch = trimmedLine.match(/V:\s*(\S+)/);
      drumVoiceId = voiceMatch ? voiceMatch[1] : 'unknown';
    }

    // New non-drum voice ends drum context
    if (isNonDrumVoice(trimmedLine)) {
      inDrumVoice = false;
      drumVoiceId = null;
    }

    // Check %%MIDI drum directives
    const drumMatch = line.match(/%%MIDI\s+drum\s+\S+\s+([\d\s]+)/i);
    if (drumMatch) {
      const numbers = drumMatch[1].split(/\s+/).map(n => parseInt(n, 10));
      for (const num of numbers) {
        if (BANNED_DRUM_NOTES.has(num)) {
          found.push({
            note: num,
            name: BANNED_NOTE_NAMES[num],
            line: i + 1,
            context: trimmedLine,
            type: 'midi_drum',
          });
        }
      }
    }

    // Check %%MIDI drummap directives
    const drummapMatch = line.match(/%%MIDI\s+drummap\s+\S+\s+(\d+)/i);
    if (drummapMatch) {
      const num = parseInt(drummapMatch[1], 10);
      if (BANNED_DRUM_NOTES.has(num)) {
        found.push({
          note: num,
          name: BANNED_NOTE_NAMES[num],
          line: i + 1,
          context: trimmedLine,
          type: 'midi_drummap',
        });
      }
    }

    // Check for raw notes in drum voices that map to banned MIDI numbers
    if (inDrumVoice && isMusicLine(trimmedLine)) {
      // Extract note tokens from the line
      // Match notes with optional accidentals, note letter, optional octave markers
      const noteRegex = /([_^=]*[A-Ga-g][,']*)/g;
      let noteMatch;

      while ((noteMatch = noteRegex.exec(trimmedLine)) !== null) {
        const noteStr = noteMatch[1];
        const midi = abcNoteToMidi(noteStr);

        if (midi !== null && BANNED_DRUM_NOTES.has(midi)) {
          found.push({
            note: midi,
            name: BANNED_NOTE_NAMES[midi],
            line: i + 1,
            context: trimmedLine.substring(0, 80) + (trimmedLine.length > 80 ? '...' : ''),
            type: 'raw_note',
            abcNote: noteStr,
          });
        }
      }
    }
  }

  return found;
}

/**
 * Quick regex-based replacement of banned drum notes
 * ONLY replaces in voices with program 0 (or no explicit program)
 * Voices with non-standard programs are LEFT ALONE (require --llm)
 * @param {string} abcContent - ABC notation content
 * @returns {{content: string, replacements: number, skippedVoices: string[]}} Fixed content, count, and skipped voices
 */
export function quickReplaceBannedNotes(abcContent) {
  const lines = abcContent.split('\n');
  const processedLines = [];
  let replacements = 0;
  const skippedVoices = [];

  // Track current voice state
  let inDrumVoice = false;
  let currentVoiceId = null;
  let currentVoiceProgram = 0; // Default is program 0

  for (let i = 0; i < lines.length; i++) {
    let line = lines[i];
    const trimmedLine = line.trim();

    // Detect drum voice start
    if (isDrumVoiceStart(trimmedLine)) {
      inDrumVoice = true;
      currentVoiceProgram = 0; // Reset to default for new voice
      const voiceMatch = trimmedLine.match(/V:\s*(\S+)/);
      currentVoiceId = voiceMatch ? voiceMatch[1] : 'unknown';
    }

    // Check for program directive within current voice
    const programMatch = trimmedLine.match(/%%MIDI\s+program\s+10\s+(\d+)/i);
    if (programMatch && inDrumVoice) {
      const detectedProgram = parseInt(programMatch[1], 10);

      // Replace banned programs with program 0
      if (BANNED_DRUM_PROGRAMS.has(detectedProgram)) {
        line = line.replace(/%%MIDI\s+program\s+10\s+\d+/i, '%%MIDI program 10 0');
        currentVoiceProgram = 0;
        replacements++;
      } else {
        currentVoiceProgram = detectedProgram;
        if (currentVoiceProgram !== 0) {
          if (!skippedVoices.includes(currentVoiceId)) {
            skippedVoices.push(currentVoiceId);
          }
        }
      }
    }

    // New non-drum voice ends drum context
    if (isNonDrumVoice(trimmedLine)) {
      inDrumVoice = false;
      currentVoiceId = null;
      currentVoiceProgram = 0;
    }

    // Only replace in drum voices with program 0
    if (inDrumVoice && currentVoiceProgram === 0 && isMusicLine(trimmedLine)) {
      // Replace each banned ABC note with its replacement
      for (const [bannedNote, info] of Object.entries(BANNED_ABC_NOTES)) {
        const escapedNote = bannedNote.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        const noteRegex = new RegExp(`(^|[^A-Ga-g])${escapedNote}(?=[^,']|$)`, 'g');
        const newLine = line.replace(noteRegex, (match, prefix) => {
          replacements++;
          return prefix + info.replacement;
        });
        if (newLine !== line) {
          line = newLine;
        }
      }
    }

    // Also replace in %%MIDI drum/drummap directives (only if in program 0 voice or global)
    if (currentVoiceProgram === 0 || !inDrumVoice) {
      for (const [banned, replacement] of Object.entries(REPLACEMENT_MAP)) {
        // Replace in %%MIDI drum directives
        const drumRegex = new RegExp(`(%%MIDI\\s+drum\\s+\\S+\\s+[\\d\\s]*?)\\b${banned}\\b`, 'gi');
        line = line.replace(drumRegex, (match, prefix) => {
          replacements++;
          return `${prefix}${replacement}`;
        });

        // Replace in %%MIDI drummap directives
        const drummapRegex = new RegExp(`(%%MIDI\\s+drummap\\s+\\S+\\s+)${banned}\\b`, 'gi');
        line = line.replace(drummapRegex, (match, prefix) => {
          replacements++;
          return `${prefix}${replacement}`;
        });
      }
    }

    processedLines.push(line);
  }

  return { content: processedLines.join('\n'), replacements, skippedVoices };
}

/**
 * Use LLM to intelligently sanitize drum sounds in ABC files
 * @param {Array<{path: string, content: string, banned: Array}>} files - Files with banned notes
 * @returns {Promise<Array<{path: string, content: string}>>} Sanitized files
 */
async function sanitizeWithLLM(files) {
  const myAnthropic = getAnthropic();
  const model = myAnthropic('claude-3-7-sonnet-20250219');

  // Build the prompt with all files
  const fileContents = files.map((f, idx) => {
    const bannedInfo = f.banned.map(b => `  - Note ${b.note} (${b.name}) on line ${b.line}`).join('\n');
    return `=== FILE ${idx + 1}: ${path.basename(f.path)} ===
BANNED NOTES DETECTED:
${bannedInfo}

ABC CONTENT:
${f.content}
=== END FILE ${idx + 1} ===`;
  }).join('\n\n');

  const systemPrompt = `You are an ABC notation expert specializing in drum and percussion programming.

Your task is to sanitize ABC files to ensure NO BANNED SOUNDS are produced, regardless of which drum program/kit is selected.

CRITICAL UNDERSTANDING:
Different drum programs (%%MIDI program 10 N) map the SAME ABC notes to DIFFERENT sounds!
For example, note "c" on program 0 (Standard Kit) produces Hi Bongo, but on program 28 it might produce a whistle.
You MUST analyze BOTH the drum program AND the notes to determine what sounds will actually play.

BANNED DRUM PROGRAMS (must be replaced with program 0):
- Program 25
- Program 28
If you see "%%MIDI program 10 25" or "%%MIDI program 10 28", change it to "%%MIDI program 10 0"

BANNED SOUNDS (must NEVER be produced by any program+note combination):
- Whistles (Short Whistle, Long Whistle)
- Guiro (Short Guiro, Long Guiro)
- Cuica (Mute Cuica, Open Cuica)
- Any other annoying novelty percussion sounds

BANNED MIDI NOTE NUMBERS (when they appear in %%MIDI drum or %%MIDI drummap):
- 71 (Short Whistle), 72 (Long Whistle)
- 73 (Short Guiro), 74 (Long Guiro)
- 78 (Mute Cuica), 79 (Open Cuica)

SAFE REPLACEMENT SOUNDS:
- 35/36: Bass Drum, 37: Side Stick, 38/40: Snare
- 42/44/46: Hi-Hats, 47/48/50: Toms
- 49/57: Crash, 51/59: Ride, 56: Cowbell, 54: Tambourine

YOUR ANALYSIS PROCESS:
1. Identify ALL drum voices (clef=perc OR %%MIDI channel 10)
2. Check if any banned drum programs (25, 28) are used - replace with program 0
3. For each drum voice, note what %%MIDI program is selected
4. Analyze what SOUNDS each ABC note will produce with that program
5. Replace any notes that would produce banned sounds with safe alternatives
6. Also check %%MIDI drum and %%MIDI drummap directives for banned MIDI numbers

INSTRUCTIONS:
1. Replace any banned drum programs (25, 28) with program 0
2. Analyze the drum program context for each voice
3. Replace notes that produce banned sounds with the selected program
4. Replace banned MIDI numbers in %%MIDI drum and %%MIDI drummap directives
4. Preserve ALL other aspects of the ABC notation exactly
5. Output the COMPLETE sanitized ABC notation for each file

OUTPUT FORMAT:
=== SANITIZED FILE N: filename.abc ===
[complete ABC notation with banned sounds eliminated]
=== END SANITIZED FILE N ===

You must ensure NO banned sounds can possibly be produced.`;

  const userPrompt = `Sanitize these ${files.length} ABC files by replacing all banned drum notes:

${fileContents}

Replace every banned drum note with an appropriate alternative. Output the COMPLETE sanitized ABC notation for each file.`;

  console.log(`  Sending ${files.length} files to LLM for sanitization...`);

  const { text } = await generateText({
    model,
    messages: [
      {
        role: 'system',
        content: systemPrompt,
        experimental_providerMetadata: {
          anthropic: { cacheControl: { type: 'ephemeral' } },
        },
      },
      { role: 'user', content: userPrompt },
    ],
    temperature: 0.3,
    maxTokens: 64000,
  });

  // Parse the output to extract sanitized files
  const results = [];
  const fileRegex = /=== SANITIZED FILE (\d+): ([^\s]+) ===\s*([\s\S]*?)\s*=== END SANITIZED FILE \1 ===/gi;
  let match;

  while ((match = fileRegex.exec(text)) !== null) {
    const fileIndex = parseInt(match[1], 10) - 1;
    const content = cleanAbcNotation(match[3]);

    if (fileIndex >= 0 && fileIndex < files.length) {
      results.push({
        path: files[fileIndex].path,
        content,
      });
    }
  }

  return results;
}

/**
 * Sanitize ABC files matching a glob pattern
 * @param {string} pattern - Glob pattern to match ABC files
 * @param {Object} options - Options
 * @param {boolean} options.useLLM - Use LLM for intelligent replacement (default: false for quick mode)
 * @param {boolean} options.dryRun - Don't write files, just report
 * @returns {Promise<{processed: number, fixed: number, skipped: number}>}
 */
export async function sanitizeDrums(pattern, options = {}) {
  const useLLM = options.useLLM || false;
  const dryRun = options.dryRun || false;

  console.log(`\n🔍 Searching for ABC files matching: ${pattern}`);

  // Find all matching files
  const files = await glob(pattern, { absolute: true });

  if (files.length === 0) {
    console.log('No files found matching the pattern.');
    return { processed: 0, fixed: 0, skipped: 0 };
  }

  console.log(`Found ${files.length} file(s) to scan.\n`);

  // Scan all files for drum content
  const filesToFix = [];
  let skipped = 0;

  for (const filePath of files) {
    const content = await fs.promises.readFile(filePath, 'utf-8');

    if (useLLM) {
      // LLM mode: flag ALL files with drum content for intelligent analysis
      // because different drum programs map notes to different sounds
      if (hasDrumContent(content)) {
        console.log(`  🥁 ${path.basename(filePath)}: Has drum content - needs LLM analysis`);
        filesToFix.push({ path: filePath, content, banned: [] });
      } else {
        console.log(`  ✅ ${path.basename(filePath)}: No drums`);
        skipped++;
      }
    } else {
      // Regex mode: detect banned notes and programs
      const banned = detectBannedDrumNotes(content);
      const { hasNonStandard, hasBanned, programs, bannedPrograms } = hasNonStandardDrumProgram(content);

      if (banned.length > 0 || hasBanned) {
        if (hasBanned) {
          console.log(`  ❌ ${path.basename(filePath)}: Has BANNED program(s) ${bannedPrograms.join(', ')} - will replace with program 0`);
        }
        if (banned.length > 0) {
          console.log(`  ❌ ${path.basename(filePath)}: Found ${banned.length} banned drum note(s)`);
          banned.forEach(b => console.log(`     - Note ${b.note} (${b.name}) at line ${b.line}`));
        }
        if (hasNonStandard && !hasBanned) {
          console.log(`     ⚠️  Has non-standard program(s) ${programs.join(', ')} - those voices will be skipped (use --llm)`);
        }
        filesToFix.push({ path: filePath, content, banned });
      } else if (hasNonStandard) {
        // No obvious banned notes but has non-standard programs - warn user
        console.log(`  ⚠️  ${path.basename(filePath)}: Has program(s) ${programs.join(', ')} - can't detect banned sounds (use --llm)`);
        skipped++;
      } else {
        console.log(`  ✅ ${path.basename(filePath)}: Clean`);
        skipped++;
      }
    }
  }

  if (filesToFix.length === 0) {
    if (useLLM) {
      console.log('\n🎉 No files with drum content found.');
    } else {
      console.log('\n🎉 All files are clean! No banned drum notes found.');
    }
    return { processed: files.length, fixed: 0, skipped };
  }

  console.log(`\n📝 ${filesToFix.length} file(s) need sanitization.\n`);

  if (dryRun) {
    console.log('🔍 DRY RUN - No files will be modified.');
    return { processed: files.length, fixed: 0, skipped };
  }

  let fixed = 0;

  if (useLLM) {
    // Process one file at a time with LLM
    console.log(`🤖 Using LLM for intelligent sanitization...\n`);

    for (const file of filesToFix) {
      try {
        console.log(`  Processing ${path.basename(file.path)}...`);
        const sanitized = await sanitizeWithLLM([file]);

        if (sanitized.length > 0) {
          const result = sanitized[0];
          const stillBanned = detectBannedDrumNotes(result.content);

          if (stillBanned.length > 0) {
            console.warn(`  ⚠️ LLM missed ${stillBanned.length} banned note(s), retrying...`);
            const retryFile = { ...file, content: result.content, banned: stillBanned };
            const retried = await sanitizeWithLLM([retryFile]);
            if (retried.length > 0) {
              await fs.promises.writeFile(file.path, retried[0].content);
            } else {
              await fs.promises.writeFile(file.path, result.content);
            }
          } else {
            await fs.promises.writeFile(file.path, result.content);
          }
          console.log(`  ✅ ${path.basename(file.path)}: Sanitized`);
          fixed++;
        }
      } catch (error) {
        console.error(`  ❌ ${path.basename(file.path)} failed: ${error.message}`);
        console.error(`     Skipping - manual intervention required`);
      }
    }
  } else {
    // Quick regex replacement mode
    console.log('⚡ Using quick regex replacement mode (only program 0 voices)...\n');

    for (const file of filesToFix) {
      const { content, replacements, skippedVoices } = quickReplaceBannedNotes(file.content);

      if (replacements > 0 || skippedVoices.length > 0) {
        await fs.promises.writeFile(file.path, content);
        if (replacements > 0) {
          console.log(`  ✅ ${path.basename(file.path)}: Replaced ${replacements} banned note(s)`);
        }
        if (skippedVoices.length > 0) {
          console.log(`     ⚠️  Skipped voices with non-standard programs: ${skippedVoices.join(', ')} (use --llm)`);
        }
        fixed++;
      }
    }
  }

  console.log(`\n🎉 Sanitization complete!`);
  console.log(`   Processed: ${files.length} files`);
  console.log(`   Fixed: ${fixed} files`);
  console.log(`   Already clean: ${skipped} files`);

  return { processed: files.length, fixed, skipped };
}
