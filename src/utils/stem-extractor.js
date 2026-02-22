import fs from 'fs';
import path from 'path';
import { execa } from 'execa';
import abcjs from 'abcjs';

/**
 * Extracts individual voice stems from ABC notation and creates separate MIDI files
 * All stems will have equal length with padding rests where voices don't play
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

    // Parse ABC to extract headers, voices, and measure structure
    const { headers, voices, measureTimeline } = parseAbcVoicesWithTimeline(abcContent);

    if (voices.length === 0) {
      return { success: false, stems: [], error: 'No voices found in ABC notation' };
    }

    console.log(`  📂 Creating ${voices.length} stem(s) in ${path.basename(stemsDir)}/`);
    console.log(`  📏 Full composition: ${measureTimeline.totalMeasures} measures`);

    const stems = [];

    for (const voice of voices) {
      // Create ABC file for this voice spanning full composition with padding rests
      const voiceAbc = createFullLengthVoiceAbc(headers, voice, measureTimeline);
      const voiceAbcPath = path.join(stemsDir, `${voice.id}.abc`);
      const voiceMidiPath = path.join(stemsDir, `${voice.id}.mid`);

      fs.writeFileSync(voiceAbcPath, voiceAbc);

      try {
        const result = await execa('abc2midi', [voiceAbcPath, '-o', voiceMidiPath], {
          timeout: 30000,
          reject: false,
        });

        if (fs.existsSync(voiceMidiPath)) {
          stems.push(voiceMidiPath);
          console.log(`    ✅ ${voice.id}.mid (${voice.name || 'unnamed'}) [${measureTimeline.totalMeasures} measures]`);
        }
      } catch (midiError) {
        console.warn(`    ⚠️ Failed to create ${voice.id}.mid: ${midiError.message}`);
      }

    }

    return { success: true, stems, stemsDir };
  } catch (error) {
    return { success: false, stems: [], error: error.message };
  }
}

/**
 * Get rest notation for a given time signature
 * @param {string} timeSignature - Time signature (e.g., "4/4", "5/4", "7/8")
 * @param {string} defaultLength - Default note length (e.g., "1/8")
 * @returns {string} Rest notation for one measure
 */
function getRestForTimeSignature(timeSignature, defaultLength = '1/8') {
  const [beats, noteValue] = timeSignature.split('/').map(Number);

  // Calculate total eighth notes in the measure based on L: field (default L:1/8)
  // If L:1/8, then each beat in the time signature equals noteValue/8 eighth notes
  const eighthsPerBeat = 8 / noteValue;
  const totalEighths = beats * eighthsPerBeat;

  return `z${Math.round(totalEighths)}`;
}

/**
 * Parse ABC notation using abcjs to get accurate measure count
 * @param {string} abcContent - Full ABC notation
 * @returns {{headers: string[], voices: Array<{id: string, name: string, content: string[], midiProgram: string}>, measureTimeline: {totalMeasures: number, defaultTimeSignature: string}}}
 */
function parseAbcVoicesWithTimeline(abcContent) {
  // Parse with abcjs
  const parsed = abcjs.parseOnly(abcContent);
  if (!parsed || parsed.length === 0) {
    throw new Error('Failed to parse ABC notation');
  }

  const tune = parsed[0];

  // Extract headers manually
  const lines = abcContent.split('\n');
  const headers = [];
  const headerFields = ['X:', 'T:', 'C:', 'M:', 'L:', 'Q:', 'K:'];
  let defaultTimeSignature = '4/4';

  for (const line of lines) {
    const trimmed = line.trim();
    if (headerFields.some(h => trimmed.startsWith(h))) {
      headers.push(trimmed);
      if (trimmed.startsWith('M:')) {
        const match = trimmed.match(/M:\s*(\d+\/\d+)/);
        if (match) defaultTimeSignature = match[1];
      }
      if (trimmed.startsWith('K:')) break;
    }
    if (trimmed.startsWith('%%MIDI') && !trimmed.includes('V:')) {
      headers.push(trimmed);
    }
  }

  // Count total measures by summing across ALL lines/sections
  let totalMeasures = 0;
  for (const line of tune.lines) {
    if (line.staff && line.staff.length > 0) {
      // Count measures in first staff (all staffs in a section have same measure count)
      const staff = line.staff[0];
      if (staff && staff.voices && staff.voices.length > 0) {
        const voice = staff.voices[0];
        const barCount = voice.filter(el => el.el_type === 'bar').length;
        totalMeasures += barCount;
      }
    }
  }

  // Extract voice content from raw ABC
  const voiceMap = new Map();
  let currentVoice = null;

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || headerFields.some(h => trimmed.startsWith(h))) continue;

    const voiceMatch = trimmed.match(/^\[?V:\s*(\S+)(?:\s+(.*))?]?/);
    if (voiceMatch) {
      const voiceId = voiceMatch[1];
      const voiceAttrs = voiceMatch[2] || '';
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
    } else if (currentVoice) {
      currentVoice.content.push(trimmed);

      const midiMatch = trimmed.match(/^%%MIDI\s+program/);
      if (midiMatch) {
        currentVoice.midiProgram = trimmed;
      }
    }
  }

  return {
    headers,
    voices: Array.from(voiceMap.values()),
    measureTimeline: {
      totalMeasures,
      defaultTimeSignature,
    },
  };
}

/**
 * Create ABC notation for a single voice with trailing rests to match total measures
 * @param {string[]} headers - Common header lines
 * @param {{id: string, name: string, content: string[]}} voice - Voice data
 * @param {{totalMeasures: number, defaultLength: string, defaultTimeSignature: string}} measureTimeline - Measure timeline
 * @returns {string} ABC notation for full-length voice
 */
function createFullLengthVoiceAbc(headers, voice, measureTimeline) {
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

  // Count bars in this voice's content
  const voiceContent = voice.content.join('\n');
  const barCount = (voiceContent.match(/\|/g) || []).length;

  // Add trailing rests to match total measures
  const { totalMeasures, defaultTimeSignature } = measureTimeline;
  if (barCount < totalMeasures) {
    const missingMeasures = totalMeasures - barCount;
    const restNotation = getRestForTimeSignature(defaultTimeSignature);

    // Add rest measures with bar lines
    for (let i = 0; i < missingMeasures; i++) {
      lines.push(restNotation + '|');
    }
  }

  return lines.join('\n') + '\n';
}
