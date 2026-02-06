/**
 * Choreography Module - Barrel Export
 * 
 * Exports all choreography-related modules for convenient importing.
 * 
 * @module playback/choreography
 * 
 * @example
 * // Import all choreography modules
 * import {
 *   ChoreographyManager,
 *   TemplateResolver,
 *   TriggerEvaluator,
 *   TimelineProcessor,
 *   ActionExecutor
 * } from './choreography/index.js';
 * 
 * // Or import individually
 * import { ChoreographyManager } from './choreography/choreography-manager.js';
 */

// Main coordinator
export { ChoreographyManager, DEFAULT_MAX_OBJECTS } from './choreography-manager.js';

// Template and position resolution
export {
  TemplateResolver,
  DEFAULT_TEMPLATE,
  SCREEN_RESOLUTION,
  SHAPE_MAP
} from './template-resolver.js';

// Trigger evaluation
export {
  TriggerEvaluator,
  DEFAULT_BPM,
  BEATS_PER_MEASURE,
  TRIGGER_TYPES,
  AUDIO_OPERATORS
} from './trigger-evaluator.js';

// Timeline processing
export { TimelineProcessor } from './timeline-processor.js';

// Action execution
export { ActionExecutor } from './action-executors.js';
