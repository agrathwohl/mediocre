/**
 * @fileoverview Shared file validation utilities
 */

import fs from 'fs';
import path from 'path';

/**
 * Validate that a file exists
 * @param {string} filePath - Path to the file
 * @param {string} [fileType='File'] - Type description for error messages
 * @throws {Error} If file does not exist
 */
export function validateFileExists(filePath, fileType = 'File') {
  if (!fs.existsSync(filePath)) {
    throw new Error(`${fileType} not found: ${filePath}`);
  }
}

/**
 * Validate that a file exists and has an allowed extension
 * @param {string} filePath - Path to the file
 * @param {string[]} extensions - Allowed extensions (with dots, e.g., ['.wav', '.mp3'])
 * @param {string} [fileType='File'] - Type description for error messages
 * @throws {Error} If file does not exist or has wrong extension
 */
export function validateFileWithExtension(filePath, extensions, fileType = 'File') {
  validateFileExists(filePath, fileType);

  const ext = path.extname(filePath).toLowerCase();
  if (!extensions.includes(ext)) {
    throw new Error(`Unsupported file type: ${ext}. Supported: ${extensions.join(', ')}`);
  }
}

/**
 * Validate that a directory exists
 * @param {string} dirPath - Path to the directory
 * @param {string} [dirType='Directory'] - Type description for error messages
 * @throws {Error} If directory does not exist
 */
export function validateDirectoryExists(dirPath, dirType = 'Directory') {
  if (!fs.existsSync(dirPath)) {
    throw new Error(`${dirType} not found: ${dirPath}`);
  }

  const stats = fs.statSync(dirPath);
  if (!stats.isDirectory()) {
    throw new Error(`${dirType} is not a directory: ${dirPath}`);
  }
}

/**
 * Common audio file extensions
 */
export const AUDIO_EXTENSIONS = ['.wav', '.mp3', '.flac', '.ogg', '.aac', '.m4a'];

/**
 * Common MIDI file extensions
 */
export const MIDI_EXTENSIONS = ['.mid', '.midi'];

/**
 * Common ABC notation file extensions
 */
export const ABC_EXTENSIONS = ['.abc'];

/**
 * All supported music file extensions
 */
export const MUSIC_EXTENSIONS = [...AUDIO_EXTENSIONS, ...MIDI_EXTENSIONS, ...ABC_EXTENSIONS];

/**
 * Validate an audio file
 * @param {string} filePath - Path to the audio file
 * @throws {Error} If file does not exist or is not an audio file
 */
export function validateAudioFile(filePath) {
  validateFileWithExtension(filePath, AUDIO_EXTENSIONS, 'Audio file');
}

/**
 * Validate a MIDI file
 * @param {string} filePath - Path to the MIDI file
 * @throws {Error} If file does not exist or is not a MIDI file
 */
export function validateMidiFile(filePath) {
  validateFileWithExtension(filePath, MIDI_EXTENSIONS, 'MIDI file');
}

/**
 * Clean a track filename for display
 * @param {string} filePath - Path to the file
 * @returns {string} Cleaned display name
 */
export function cleanTrackName(filePath) {
  return path.basename(filePath)
    .replace(/\.mid\.(wav|mp3|flac|ogg)$/i, '')
    .replace(/\.(wav|mp3|flac|ogg)$/i, '')
    .replace(/-score\d+-\d+/, '')
    .replace(/-combined-\d+/, '');
}

export default {
  validateFileExists,
  validateFileWithExtension,
  validateDirectoryExists,
  validateAudioFile,
  validateMidiFile,
  cleanTrackName,
  AUDIO_EXTENSIONS,
  MIDI_EXTENSIONS,
  ABC_EXTENSIONS,
  MUSIC_EXTENSIONS
};
