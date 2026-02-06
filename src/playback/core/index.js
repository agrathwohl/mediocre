/**
 * Core Module Barrel Export
 * 
 * Exports all core playback modules for easy importing.
 * 
 * @module playback/core
 * 
 * @example
 * import { ColorSystem, ObjectPool, DEFAULT_PHYSICS } from './core/index.js';
 * // or
 * import * as Core from './core/index.js';
 */

export { ColorSystem, clamp, lerp, lerpHSL, rgbToHsl, RESET_COLOR, BASIC_COLORS } from './color-system.js';
export { ObjectPool, DEFAULT_PHYSICS, DEFAULT_OBJECT_CONFIG } from './object-pool.js';
