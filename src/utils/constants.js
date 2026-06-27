/**
 * Application Constants
 * 
 * Centralized constants to eliminate magic numbers and ensure consistency.
 * 
 * @module utils/constants
 */

/**
 * Screen resolution for coordinate scaling (choreography reference resolution)
 */
export const SCREEN_RESOLUTION = {
  width: 1920,
  height: 1080
};

/**
 * Default terminal dimensions
 */
export const TERMINAL_DEFAULTS = {
  columns: 80,
  rows: 24
};

/**
 * Animation and timing constants
 */
export const ANIMATION = {
  fps: 30,
  sampleRate: 30, // For audio analysis
  maxObjects: 50
};

/**
 * Audio analysis constants
 */
export const AUDIO = {
  defaultBpm: 120,
  beatsPerMeasure: 4,
  onsetThreshold: 0.2,
  velocityThreshold: 1.3
};

/**
 * File paths and extensions
 */
export const FILE_EXTENSIONS = {
  audio: ['.wav', '.mp3', '.ogg'],
  choreography: ['.json'],
  abc: ['.abc'],
  midi: ['.mid', '.midi']
};

/**
 * Object physics defaults
 */
export const PHYSICS = {
  mass: 1.0,
  friction: 0.98,
  elasticity: 0.7,
  maxVelocity: 20
};

/**
 * Choreography schema version
 */
export const CHOREOGRAPHY_VERSION = '1.1';

/**
 * Retry and timeout constants
 */
export const RETRY = {
  maxAttempts: 5,
  delayMs: 1000
};

/**
 * Color constants for terminal output
 */
export const COLORS = {
  border: { h: 0, s: 0, l: 100 },
  interior: { h: 200, s: 80, l: 60 }
};
