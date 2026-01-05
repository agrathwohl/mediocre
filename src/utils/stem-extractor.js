import fs from 'fs';
import path from 'path';
import { execSync } from 'child_process';

/**
 * Extracts individual voice stems from ABC notation and creates separate MIDI files
 * @param {string} abcFilePath - Path to the ABC file
 * @param {string} outputDir - Directory to place stem files (defaults to basename of abc file)
 * @returns {Promise<{success: boolean, stems: string[], error?: string}>}
 */
export async function extractMidiStems(abcFilePath, outputDir = null) {
  try {
    const abcContent = fs.readFileSync(abcFilePath, 'utf8');
    const basename = path.basename(abcFilePath, '.abc');
    const abcDir = path.dirname(abcFilePath);

    // Create stems directory
    const stemsDir = outputDir || path.join(abcDir, `${basename}_stems`);
    if (!fs.existsSync(stemsDir)) {
      fs.mkdirSync(stemsDir, { recursive: true });
    }

    // Parse ABC to extract headers and voices
    const { headers, voices } = parseAbcVoices(abcContent);

    if (voices.length === 0) {
      return { success: false, stems: [], error: 'No voices found in ABC notation' };
    }

    console.log(`  📂 Creating ${voices.length} stem(s) in ${path.basename(stemsDir)}/`);

    const stems = [];

    for (const voice of voices) {
      // Create ABC file for this voice only
      const voiceAbc = createSingleVoiceAbc(headers, voice);
      const voiceAbcPath = path.join(stemsDir, `${voice.id}.abc`);
      const voiceMidiPath = path.join(stemsDir, `${voice.id}.mid`);

      fs.writeFileSync(voiceAbcPath, voiceAbc);

      try {
        execSync(`abc2midi "${voiceAbcPath}" -o "${voiceMidiPath}" 2>&1`, {
          timeout: 30000,
          encoding: 'utf8',
        });

        if (fs.existsSync(voiceMidiPath)) {
          stems.push(voiceMidiPath);
          console.log(`    ✅ ${voice.id}.mid (${voice.name || 'unnamed'})`);
        }
      } catch (midiError) {
        console.warn(`    ⚠️ Failed to create ${voice.id}.mid: ${midiError.message}`);
      }

      // Clean up temporary ABC file
      fs.unlinkSync(voiceAbcPath);
    }

    return { success: true, stems, stemsDir };
  } catch (error) {
    return { success: false, stems: [], error: error.message };
  }
}

/**
 * Parse ABC notation to extract headers and voice content
 * @param {string} abcContent - Full ABC notation
 * @returns {{headers: string[], voices: Array<{id: string, name: string, content: string[], midiProgram: string}>}}
 */
function parseAbcVoices(abcContent) {
  const lines = abcContent.split('\n');
  const headers = [];
  const voiceMap = new Map();

  let currentVoice = null;
  let inHeader = true;
  let globalMidiDirectives = [];

  // Header fields that should be preserved
  const headerFields = ['X:', 'T:', 'C:', 'M:', 'L:', 'Q:', 'K:'];

  for (const line of lines) {
    const trimmed = line.trim();

    // Skip empty lines
    if (!trimmed) continue;

    // Check for voice declaration
    const voiceMatch = trimmed.match(/^\[?V:\s*(\S+)(?:\s+(.*))?]?/);
    if (voiceMatch) {
      inHeader = false;
      const voiceId = voiceMatch[1];
      const voiceAttrs = voiceMatch[2] || '';

      // Extract name from voice attributes if present
      const nameMatch = voiceAttrs.match(/name="([^"]+)"/);
      const voiceName = nameMatch ? nameMatch[1] : voiceId;

      if (!voiceMap.has(voiceId)) {
        voiceMap.set(voiceId, {
          id: voiceId,
          name: voiceName,
          declaration: trimmed,
          content: [],
          midiProgram: null,
        });
      }
      currentVoice = voiceMap.get(voiceId);
      currentVoice.content.push(trimmed);
      continue;
    }

    // Check for MIDI program directive
    const midiMatch = trimmed.match(/^%%MIDI\s+program\s+(\d+)\s+(\d+)/);
    if (midiMatch && currentVoice) {
      currentVoice.midiProgram = trimmed;
      currentVoice.content.push(trimmed);
      continue;
    }

    // Global MIDI directives (before any voice)
    if (trimmed.startsWith('%%MIDI') && !currentVoice) {
      globalMidiDirectives.push(trimmed);
      continue;
    }

    // Header fields
    if (inHeader && headerFields.some(h => trimmed.startsWith(h))) {
      headers.push(trimmed);
      // K: marks end of header
      if (trimmed.startsWith('K:')) {
        inHeader = false;
      }
      continue;
    }

    // Content for current voice
    if (currentVoice) {
      currentVoice.content.push(trimmed);
    }
  }

  // Add global MIDI directives to headers
  headers.push(...globalMidiDirectives);

  return {
    headers,
    voices: Array.from(voiceMap.values()),
  };
}

/**
 * Create ABC notation for a single voice
 * @param {string[]} headers - Common header lines
 * @param {{id: string, name: string, content: string[], midiProgram: string}} voice - Voice data
 * @returns {string} ABC notation for single voice
 */
function createSingleVoiceAbc(headers, voice) {
  const lines = [];

  // Add headers, modifying title to include voice name
  for (const header of headers) {
    if (header.startsWith('T:')) {
      lines.push(`${header} - ${voice.name || voice.id}`);
    } else {
      lines.push(header);
    }
  }

  // Add voice content
  lines.push(...voice.content);

  return lines.join('\n') + '\n';
}
