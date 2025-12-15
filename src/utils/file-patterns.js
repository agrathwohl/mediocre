/**
 * @fileoverview Centralized file pattern configuration
 * Standard patterns for finding associated files (WAV, MIDI, PDF) for ABC files
 */

/**
 * Get audio file search patterns for an ABC file
 * @param {string} basePath - Base path without extension (e.g., "/path/to/file" from "/path/to/file.abc")
 * @returns {string[]} Array of possible audio file paths to check
 */
export function getAudioFilePatterns(basePath) {
  return [
    // Direct WAV
    `${basePath}.wav`,
    // Converted from MIDI
    `${basePath}.mid.wav`,
    `${basePath}.abc.mid.wav`,
    // Numbered variations (from multiple ABC outputs)
    `${basePath}1.mid.wav`,
    // FLAC variations
    `${basePath}.mid.flac`,
    `${basePath}.abc.mid.flac`,
    `${basePath}1.mid.flac`
  ];
}

/**
 * Get MIDI file patterns for an ABC file
 * @param {string} basePath - Base path without extension
 * @returns {string[]} Array of possible MIDI file paths
 */
export function getMidiFilePatterns(basePath) {
  return [
    `${basePath}.mid`,
    `${basePath}.abc.mid`,
    `${basePath}1.mid`
  ];
}

/**
 * Get PDF score patterns for an ABC file
 * @param {string} basePath - Base path without extension
 * @returns {string[]} Array of possible PDF file paths
 */
export function getPdfFilePatterns(basePath) {
  return [
    `${basePath}.pdf`,
    `${basePath}.abc.pdf`,
    `${basePath}1.pdf`
  ];
}