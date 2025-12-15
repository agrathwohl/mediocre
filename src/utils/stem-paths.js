/**
 * @fileoverview Utilities for managing stem file paths and directories
 * @module stem-paths
 */

import path from 'path';
import fs from 'fs';

/**
 * Get stem directory paths for a given output file
 * @param {string} outputPath - Base output file path
 * @param {string} extension - File extension (e.g., 'mid', 'wav')
 * @returns {{stemDir: string, fileSpecificStemDir: string, baseFileName: string}} Directory paths
 */
export function getStemDirectories(outputPath, extension) {
  const baseFileName = path.basename(outputPath, `.${extension}`);
  const stemDir = path.join(path.dirname(outputPath), 'stems');
  const fileSpecificStemDir = path.join(stemDir, baseFileName);

  return { stemDir, fileSpecificStemDir, baseFileName };
}

/**
 * Ensure stem directories exist
 * @param {string} stemDir - Root stems directory
 * @param {string} fileSpecificStemDir - File-specific stem directory
 */
export function ensureStemDirectories(stemDir, fileSpecificStemDir) {
  if (!fs.existsSync(stemDir)) {
    fs.mkdirSync(stemDir, { recursive: true });
  }
  if (!fs.existsSync(fileSpecificStemDir)) {
    fs.mkdirSync(fileSpecificStemDir, { recursive: true });
  }
}

/**
 * Check if MIDI stems exist for a given MIDI file path
 * @param {string} midiFilePath - Path to MIDI file
 * @returns {{exists: boolean, stemDir: string, stemFiles: string[]}} Stem directory info
 */
export function checkMidiStemsExist(midiFilePath) {
  const inputDir = path.dirname(midiFilePath);
  const baseFileName = path.basename(midiFilePath, '.mid');
  const midiStemDir = path.join(inputDir, 'stems', baseFileName);

  let stemFiles = [];
  if (fs.existsSync(midiStemDir)) {
    stemFiles = fs.readdirSync(midiStemDir).filter(f => f.endsWith('.mid'));
  }

  return {
    exists: fs.existsSync(midiStemDir) && stemFiles.length > 0,
    stemDir: midiStemDir,
    stemFiles
  };
}

/**
 * Sanitize a name for safe use in file systems
 * @param {string} name - Name to sanitize
 * @returns {string} Sanitized file-safe name
 */
export function sanitizeFileName(name) {
  return name
    .replace(/[^\w\s-]/g, '')  // Remove non-alphanumeric except space/dash
    .replace(/\s+/g, '_')      // Replace spaces with underscores
    .toLowerCase();
}

/**
 * Create a stem filename from base name, voice/track info
 * @param {string} baseName - Base filename without extension
 * @param {string} instrumentName - Instrument or voice name
 * @param {string} voiceOrTrackId - Voice or track identifier
 * @param {string} extension - File extension (without dot)
 * @returns {string} Complete stem filename
 */
export function createStemFileName(baseName, instrumentName, voiceOrTrackId, extension) {
  const sanitized = sanitizeFileName(instrumentName);
  return `${baseName}_${sanitized}_voice${voiceOrTrackId}.${extension}`;
}