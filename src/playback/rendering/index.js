/**
 * Rendering Module Barrel Export
 * 
 * Exports all rendering-related modules for easy importing.
 * 
 * @module playback/rendering
 * 
 * @example
 * import { 
 *   RenderManager,
 *   ObjectRenderer,
 *   PatternRenderer,
 *   StatusRenderer
 * } from './rendering/index.js';
 */

export {
  PatternRenderer,
  PATTERN_TYPES,
  PATTERN_DENSITY,
  PATTERN_CHARS,
  GRID_CELL
} from './pattern-renderer.js';

export {
  StatusRenderer,
  DEFAULT_STATUS_CONFIG,
  BOX_CHARS
} from './status-renderer.js';

export {
  ObjectRenderer,
  COLOR_EFFECTS
} from './object-renderer.js';

export {
  RenderManager,
  DEFAULT_RENDER_CONFIG,
  ANSI_CODES
} from './render-manager.js';
