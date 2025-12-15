/**
 * @fileoverview ABC notation voice/track parsing utilities
 * @module abc-voice-parser
 */

/**
 * Extract voice/track information from ABC notation
 * @param {string} abcContent - ABC notation content
 * @returns {Array<{voice: string, name: string}>} Array of track objects
 */
export function extractAbcVoices(abcContent) {
  const voices = [];
  const voicesSet = new Set(); // Track unique voice IDs

  // Split content into header and body
  const headerEndMatch = abcContent.match(/^K:.+$/m);
  if (!headerEndMatch) {
    // If no key signature found, return default voice
    return [{
      voice: '1',
      name: 'Default Voice'
    }];
  }

  const headerEndPos = headerEndMatch.index + headerEndMatch[0].length;
  const header = abcContent.substring(0, headerEndPos + 1);

  // Match voice definitions in header section only (both V:1 and [V:1] formats)
  // V:id [name=...] [clef=...] etc.
  const voiceRegex = /^\[?V:\s*([^\s\]]+)(?:\s+(.+?))?$/gm;
  let match;

  while ((match = voiceRegex.exec(header)) !== null) {
    const voiceId = match[1];

    // Skip if we've already seen this voice ID
    if (voicesSet.has(voiceId)) continue;
    voicesSet.add(voiceId);

    // Parse voice attributes from the rest of the line
    let voiceName = `Voice ${voiceId}`;
    if (match[2]) {
      // Look for name="..." or name=...
      const nameMatch = match[2].match(/name=["']?([^"'\s]+)["']?/);
      if (nameMatch) {
        voiceName = nameMatch[1];
      } else {
        // Use the whole remaining text as name if no specific name attribute
        voiceName = match[2].trim();
      }
    }

    voices.push({
      voice: voiceId,
      name: voiceName
    });
  }

  // If no explicit voices found, create a default one
  if (voices.length === 0) {
    voices.push({
      voice: '1',
      name: 'Default Voice'
    });
  }

  return voices;
}

/**
 * Create a single-voice ABC file from a multi-voice ABC file
 * @param {string} originalContent - Original ABC notation content
 * @param {string} voiceId - Voice ID to extract
 * @returns {string} ABC notation with only the specified voice
 * @throws {Error} If voice ID not found or ABC format invalid
 */
export function createSingleVoiceAbc(originalContent, voiceId) {
  // Split the content into header and body sections
  const headerEndMatch = originalContent.match(/^K:.+$/m);
  if (!headerEndMatch) {
    throw new Error('Invalid ABC format: No key signature (K:) found');
  }

  const headerEndPos = headerEndMatch.index + headerEndMatch[0].length;
  const header = originalContent.substring(0, headerEndPos + 1);
  const body = originalContent.substring(headerEndPos + 1);

  // Extract all voice definitions for reference
  const allVoices = extractAbcVoices(originalContent);
  const targetVoice = allVoices.find(v => v.voice === voiceId);

  if (!targetVoice) {
    throw new Error(`Voice ${voiceId} not found in ABC content`);
  }

  // Keep the header and filter the body to only include the target voice
  let filteredContent = header;

  // Add the target voice definition if it exists (both V:1 and [V:1] formats)
  const voiceDefRegex = new RegExp(`^\\[?V:\\s*${voiceId}(?:\\s+.+)?$`, 'm');
  const voiceDefMatch = originalContent.match(voiceDefRegex);
  if (voiceDefMatch) {
    filteredContent += '\n' + voiceDefMatch[0];
  }

  // Process the body line by line
  const lines = body.split('\n');
  let currentVoice = null;
  let includeSection = allVoices.length === 1; // If only one voice, include all content

  for (const line of lines) {
    // Check for voice change (both V:1 and [V:1] formats)
    const voiceMatch = line.match(/^\[?V:\s*(\S+)/);
    if (voiceMatch) {
      currentVoice = voiceMatch[1];
      includeSection = (currentVoice === voiceId);

      // Don't add voice change lines in single-voice output
      continue;
    }

    // Add line if it belongs to our target voice or is a structural element
    if (includeSection || line.match(/^[:%|]/)) {
      filteredContent += '\n' + line;
    }
  }

  return filteredContent;
}