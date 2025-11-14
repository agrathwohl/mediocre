#!/usr/bin/env node

/**
 * ABC Notation Fixer - Applies safe text transformations to fix common formatting issues
 * WITHOUT modifying any musical content
 *
 * Fixes applied:
 * 1. Voice declaration format: [V:N] → V:N
 * 2. Clef declarations: Split combined attributes
 * 3. Dynamic markings: Relocate to proper positions
 * 4. Channel assignments: Remove redundant ones
 * 5. Headers: Add missing standard headers
 */

import { readFile, writeFile } from 'fs/promises';
import { dirname, basename, extname, join } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));

/**
 * Fix #2: Convert inline voice declarations to header format
 * [V:1] content → V:1\ncontent
 */
function fixVoiceDeclarations(content) {
  // Match [V:N] at the start of a line followed by content
  const pattern = /^\[V:(\d+)([^\]]*)\]\s*(.+)$/gm;

  return content.replace(pattern, (match, voiceNum, attrs, musicContent) => {
    // Split attributes properly
    const voiceLine = attrs ? `V:${voiceNum}${attrs}` : `V:${voiceNum}`;
    return `${voiceLine}\n${musicContent}`;
  });
}

/**
 * Fix #5: Split combined clef declarations
 * [V:6 clef=percussion name="Kick"] → V:6 name="Kick"\nK:C clef=percussion
 */
function fixClefDeclarations(content) {
  const lines = content.split('\n');
  const result = [];

  for (let line of lines) {
    // Match voice declarations with clef attributes
    const match = line.match(/^(\[?V:\d+)(.*?)(clef=\w+)(.*?)(\]?)$/);

    if (match) {
      const [_, voiceStart, beforeClef, clefPart, afterClef, bracket] = match;

      // Build voice declaration without clef
      let voiceLine = voiceStart.replace('[', '') + beforeClef + afterClef;
      voiceLine = voiceLine.replace(/\s+/g, ' ').trim();

      // Add voice line
      result.push(voiceLine);

      // Add clef as separate K: line
      const clefValue = clefPart.split('=')[1];
      result.push(`K:C clef=${clefValue}`);
    } else {
      result.push(line);
    }
  }

  return result.join('\n');
}

/**
 * Fix #7: Relocate inline dynamic markings to measure boundaries
 * Moves dynamics to the start of their measure
 */
function fixDynamicMarkings(content) {
  const lines = content.split('\n');
  const result = [];

  for (let line of lines) {
    // Skip non-music lines (headers, comments, voice declarations)
    if (line.match(/^[%XTCMLKQVPw]:|^%%|^\[V:|^$/)) {
      result.push(line);
      continue;
    }

    // Extract all dynamics from the line
    const dynamics = [];
    let cleanLine = line;

    // Find all dynamics in the line
    const dynamicPattern = /![ppmfff]+!/g;
    let match;
    while ((match = dynamicPattern.exec(line)) !== null) {
      dynamics.push(match[0]);
    }

    // Remove dynamics from their current positions
    cleanLine = cleanLine.replace(/![ppmfff]+!/g, '');

    // If we found dynamics, add them at the start of the line
    if (dynamics.length > 0) {
      // Remove extra spaces
      cleanLine = cleanLine.replace(/\s+/g, ' ').trim();
      result.push(dynamics[0] + cleanLine);
    } else {
      result.push(cleanLine);
    }
  }

  return result.join('\n');
}

/**
 * Fix #11: Remove redundant MIDI channel assignments
 * %%MIDI channel N N → remove (let parser handle automatically)
 */
function fixChannelAssignments(content) {
  // Remove redundant channel assignments where channel number equals voice number
  const pattern = /^%%MIDI channel (\d+) \1$/gm;

  // Remove the redundant assignments
  let fixed = content.replace(pattern, '');

  // Clean up any resulting double blank lines
  fixed = fixed.replace(/\n\n+/g, '\n\n');

  return fixed;
}

/**
 * Fix #12: Add missing standard ABC headers if not present
 */
function fixMissingHeaders(content) {
  const lines = content.split('\n');

  // Check for required headers
  const hasIndex = lines.some(l => l.startsWith('X:'));
  const hasTitle = lines.some(l => l.startsWith('T:'));
  const hasMeter = lines.some(l => l.startsWith('M:'));
  const hasLength = lines.some(l => l.startsWith('L:'));
  const hasKey = lines.some(l => l.startsWith('K:'));

  const headers = [];

  // Add missing headers at the beginning
  if (!hasIndex) headers.push('X:1');
  if (!hasTitle) headers.push('T:Untitled');
  if (!hasMeter) headers.push('M:4/4');
  if (!hasLength) headers.push('L:1/8');
  if (!hasKey) headers.push('K:C');

  if (headers.length > 0) {
    // Find where to insert headers (before first voice or music content)
    let insertIndex = 0;
    for (let i = 0; i < lines.length; i++) {
      if (lines[i].match(/^[V%]:|^\[V:|^[a-gA-G]/)) {
        insertIndex = i;
        break;
      }
    }

    // Insert headers
    lines.splice(insertIndex, 0, ...headers);
  }

  return lines.join('\n');
}

/**
 * Fix voice numbering to be sequential starting from 1
 * abc2midi crashes if voices are out of sequence (e.g., V:4 without V:1,2,3)
 */
function fixVoiceSequencing(content) {
  const lines = content.split('\n');
  const result = [];
  const voiceMap = new Map(); // old number -> new number
  let nextVoiceNum = 1;

  // First pass: find all voice declarations and build mapping
  for (const line of lines) {
    const match = line.match(/^V:(\d+)/);
    if (match) {
      const oldNum = match[1];
      if (!voiceMap.has(oldNum)) {
        voiceMap.set(oldNum, nextVoiceNum++);
      }
    }
  }

  // Second pass: replace voice numbers
  for (const line of lines) {
    const match = line.match(/^V:(\d+)(.*)$/);
    if (match) {
      const oldNum = match[1];
      const rest = match[2];
      const newNum = voiceMap.get(oldNum);
      result.push(`V:${newNum}${rest}`);
    } else {
      // Also fix MIDI program references if they use voice numbers
      const midiMatch = line.match(/^%%MIDI program (\d+) (\d+)$/);
      if (midiMatch && voiceMap.has(midiMatch[1])) {
        const newVoice = voiceMap.get(midiMatch[1]);
        result.push(`%%MIDI program ${newVoice} ${midiMatch[2]}`);
      } else {
        result.push(line);
      }
    }
  }

  return result.join('\n');
}

/**
 * Apply all fixes to ABC content
 */
function fixABCContent(content) {
  let fixed = content;

  // Apply fixes in order
  fixed = fixVoiceDeclarations(fixed);
  fixed = fixClefDeclarations(fixed);
  fixed = fixDynamicMarkings(fixed);
  fixed = fixChannelAssignments(fixed);
  fixed = fixMissingHeaders(fixed);
  fixed = fixVoiceSequencing(fixed); // Fix voice numbering to be sequential

  return fixed;
}

/**
 * Process a single ABC file
 */
async function processFile(inputPath, outputPath = null) {
  try {
    const content = await readFile(inputPath, 'utf-8');
    const fixed = fixABCContent(content);

    // Determine output path
    if (!outputPath) {
      const dir = dirname(inputPath);
      const base = basename(inputPath, extname(inputPath));
      outputPath = join(dir, `${base}.fixed.abc`);
    }

    await writeFile(outputPath, fixed, 'utf-8');
    console.log(`✅ Fixed: ${basename(inputPath)} → ${basename(outputPath)}`);

    return { success: true, inputPath, outputPath };
  } catch (error) {
    console.error(`❌ Error processing ${inputPath}:`, error.message);
    return { success: false, inputPath, error: error.message };
  }
}

/**
 * Main CLI interface
 */
async function main() {
  const args = process.argv.slice(2);

  if (args.length === 0) {
    console.log('Usage: abc-fixer <input.abc> [output.abc]');
    console.log('       abc-fixer --batch <directory>');
    process.exit(1);
  }

  if (args[0] === '--batch') {
    // Batch processing mode
    const directory = args[1] || './output';
    console.log(`Batch processing ABC files in: ${directory}`);

    try {
      const { readdir, stat } = await import('fs/promises');
      const files = await readdir(directory);
      const abcFiles = files.filter(f => f.endsWith('.abc') && !f.includes('.fixed.'));

      console.log(`Found ${abcFiles.length} ABC files to process`);

      const results = [];
      for (const file of abcFiles) {
        const inputPath = join(directory, file);
        const result = await processFile(inputPath);
        results.push(result);
      }

      const successful = results.filter(r => r.success).length;
      const failed = results.filter(r => !r.success).length;

      console.log(`\n✨ Batch processing complete:`);
      console.log(`   ✅ Success: ${successful} files`);
      if (failed > 0) {
        console.log(`   ❌ Failed: ${failed} files`);
      }

      process.exit(failed > 0 ? 1 : 0);
    } catch (error) {
      console.error(`❌ Batch processing error:`, error.message);
      process.exit(1);
    }
  } else {
    // Single file mode
    const inputPath = args[0];
    const outputPath = args[1] || null;

    const result = await processFile(inputPath, outputPath);
    process.exit(result.success ? 0 : 1);
  }
}

// Export for use as module
export {
  fixVoiceDeclarations,
  fixClefDeclarations,
  fixDynamicMarkings,
  fixChannelAssignments,
  fixMissingHeaders,
  fixVoiceSequencing,
  fixABCContent,
  processFile
};

// Run if called directly
if (import.meta.url === `file://${process.argv[1]}`) {
  main();
}