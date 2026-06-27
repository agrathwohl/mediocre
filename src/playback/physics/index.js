/**
 * Physics Module Barrel Export
 * 
 * Exports all physics-related modules for easy importing.
 * 
 * @module playback/physics
 * 
 * @example
 * import { 
 *   CollisionDetector, 
 *   PhysicsEngine, 
 *   MotionController 
 * } from './physics/index.js';
 */

export { 
  CollisionDetector, 
  TERMINAL_ASPECT_RATIO as COLLISION_TERMINAL_ASPECT_RATIO,
  DEFAULT_COLLISION_COOLDOWN,
  DEFAULT_COLLISION_FORCE 
} from './collision-detector.js';

export { 
  PhysicsEngine,
  DEFAULT_MOTION_THRESHOLD,
  DEFAULT_ROTATION_THRESHOLD,
  TERMINAL_ASPECT_RATIO as PHYSICS_TERMINAL_ASPECT_RATIO
} from './physics-engine.js';

export { 
  MotionController,
  TERMINAL_ASPECT_RATIO as MOTION_TERMINAL_ASPECT_RATIO
} from './motion-controller.js';
