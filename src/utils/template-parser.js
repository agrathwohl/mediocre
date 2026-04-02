/**
 * Template parser for pipeline composition.
 * Reads template ABC files and extracts content slots, headers, and voice structure.
 * @module template-parser
 */

import fs from 'fs';

/**
 * Parse a template ABC file and extract its structure.
 * @param {string} filePath - Path to the template ABC file
 * @returns {Object} Parsed template structure
 */
export async function parseTemplate(filePath) {
  const content = await fs.promises.readFile(filePath, 'utf8');
  return parseTemplateContent(content);
}

/**
 * Parse template ABC content string.
 * @param {string} content - ABC notation string
 * @returns {Object} Parsed template structure
 */
export function parseTemplateContent(content) {
  const lines = content.split('\n');

  const headers = {};
  const voices = [];
  const slots = [];
  const prewritten = [];
  let currentVoice = null;

  // Pass 1: Extract headers and voice declarations
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();

    // Headers
    if (/^X:\s*/.test(line)) headers.X = line.slice(2).trim();
    if (/^T:\s*/.test(line)) headers.T = line.slice(2).trim();
    if (/^M:\s*/.test(line)) headers.M = line.slice(2).trim();
    if (/^L:\s*/.test(line)) headers.L = line.slice(2).trim();
    if (/^Q:\s*/.test(line)) headers.Q = line.slice(2).trim();
    if (/^K:\s*/.test(line)) headers.K = line.slice(2).trim();

    // Voice declarations (top-level, before any content)
    const vMatch = line.match(/^V:(\S+)\s+name="([^"]+)"/);
    if (vMatch) {
      const voiceId = vMatch[1];
      const voiceName = vMatch[2];
      // Check next line for MIDI program
      let program = null;
      let channel = null;
      for (let j = i + 1; j < Math.min(i + 5, lines.length); j++) {
        const next = lines[j].trim();
        const progMatch = next.match(/%%MIDI\s+program\s+(\d+)/);
        if (progMatch) program = parseInt(progMatch[1]);
        const chanMatch = next.match(/%%MIDI\s+channel\s+(\d+)/);
        if (chanMatch) channel = parseInt(chanMatch[1]);
        if (!next.startsWith('%%')) break;
      }
      voices.push({ id: voiceId, name: voiceName, program, channel });
    }
  }

  // Pass 2: Extract content slots and pre-written sections
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();

    // Track current voice context
    const vSwitch = line.match(/^\[V:(\S+)\]/);
    if (vSwitch) {
      currentVoice = vSwitch[1];
      continue;
    }

    // Content slot
    if (line.startsWith('% CONTENT SLOT:')) {
      const instruction = line.slice('% CONTENT SLOT:'.length).trim();

      // Find the rest bars on the next non-comment, non-empty line
      let restLine = null;
      let restLineNum = null;
      for (let j = i + 1; j < lines.length; j++) {
        const next = lines[j].trim();
        if (!next || next.startsWith('%')) continue;
        if (next.includes('z')) {
          restLine = j;
          restLineNum = j;
          break;
        }
        break;
      }

      // Count rest bars
      let barCount = 0;
      if (restLine !== null) {
        const restContent = lines[restLine];
        const bars = restContent.split('|').filter(b => b.trim());
        barCount = bars.length;
      }

      slots.push({
        index: slots.length,
        voice: currentVoice,
        instruction,
        lineNumber: i,
        restLineNumber: restLineNum,
        barCount,
      });
      continue;
    }

    // Pre-written section
    if (line.startsWith('% PRE-WRITTEN:')) {
      prewritten.push({
        voice: currentVoice,
        description: line.slice('% PRE-WRITTEN:'.length).trim(),
        lineNumber: i,
      });
      continue;
    }
  }

  // Pass 2.5: Extract instruments and directives
  let instruments = null;
  const directives = []; // %%PNEUMA, %%ENSEMBLE, %%BREATH, %%GRAVITY
  for (const line of lines) {
    const t = line.trim();
    if (t.startsWith('% INSTRUMENTS:')) {
      instruments = t.slice('% INSTRUMENTS:'.length).trim();
    }
    if (t.startsWith('%%PNEUMA') || t.startsWith('%%ENSEMBLE') || t.startsWith('%%BREATH') || t.startsWith('%%GRAVITY')) {
      directives.push(t);
    }
  }

  // Pass 3: Extract filled content per voice (non-rest, non-comment, non-directive lines)
  const filledContent = new Map();
  currentVoice = null;
  for (const line of lines) {
    const trimmed = line.trim();
    const vSwitch = trimmed.match(/^\[V:(\S+)\]/);
    if (vSwitch) {
      currentVoice = vSwitch[1];
      continue;
    }
    if (!currentVoice) continue;
    if (!trimmed || trimmed.startsWith('%') || trimmed.startsWith('%%')) continue;
    // Check if this line has actual notes (not just rests)
    const hasNotes = /[A-Ga-g]/.test(trimmed) && !/^z\d/.test(trimmed.replace(/\s*\|\s*/g, '').replace(/z\d+/g, ''));
    if (hasNotes) {
      const existing = filledContent.get(currentVoice) || '';
      filledContent.set(currentVoice, existing + (existing ? '\n' : '') + trimmed);
    }
  }

  // Compute units per bar from headers
  let unitsPerBar = 7; // default for 7/8 L:1/8
  if (headers.M && headers.L) {
    const [mNum, mDen] = headers.M.split('/').map(Number);
    const lDen = parseInt(headers.L.split('/')[1]);
    if (mNum && mDen && lDen) {
      unitsPerBar = mNum * (lDen / mDen);
    }
  }

  return {
    headers,
    voices,
    slots,
    prewritten,
    filledContent,
    instruments,
    directives,
    unitsPerBar,
    rawLines: lines,
    rawContent: content,
  };
}
