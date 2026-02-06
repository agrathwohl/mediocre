/**
 * Playback Module - Root Barrel Export
 * 
 * Exports all playback-related modules for convenient importing.
 * This is the main entry point for the playback system.
 * 
 * @module playback
 * 
 * @example
 * // Import everything
 * import * as Playback from './playback/index.js';
 * 
 * // Import specific modules
 * import { 
 *   ChoreographyManager,
 *   ObjectPool,
 *   ColorSystem,
 *   RenderManager 
 * } from './playback/index.js';
 */

// Core modules
export { ColorSystem } from './core/color-system.js';
export { 
  ObjectPool, 
  DEFAULT_PHYSICS, 
  DEFAULT_OBJECT_CONFIG 
} from './core/object-pool.js';

// Physics modules
export { CollisionDetector } from './physics/collision-detector.js';
export { PhysicsEngine } from './physics/physics-engine.js';
export { MotionController } from './physics/motion-controller.js';

// Transformation modules
export * from './transformations/index.js';

// Rendering modules
export { RenderManager } from './rendering/render-manager.js';
export { PatternRenderer } from './rendering/pattern-renderer.js';
export { StatusRenderer } from './rendering/status-renderer.js';
export { ObjectRenderer } from './rendering/object-renderer.js';

// Choreography modules
export {
  ChoreographyManager,
  TemplateResolver,
  TriggerEvaluator,
  TimelineProcessor,
  ActionExecutor,
  DEFAULT_TEMPLATE,
  SCREEN_RESOLUTION,
  SHAPE_MAP,
  DEFAULT_BPM,
  BEATS_PER_MEASURE,
  TRIGGER_TYPES,
  AUDIO_OPERATORS
} from './choreography/index.js';

// Playlist modules
export { PlaylistController } from './playlist/index.js';

// Data modules
export { 
  asciiFrames, 
  getFramesByType, 
  getRandomFrame,
  getFrameByIndex,
  getFrameCount,
  getFrameCountByType,
  getFrameForIntensity,
  getAnyRandomFrame,
  FRAME_TYPES,
  FRAME_TYPE_DESCRIPTIONS
} from './data/ascii-frames.js';

// Version
export const VERSION = '1.1.0';
