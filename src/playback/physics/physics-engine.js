/**
 * Physics Engine Module
 * 
 * Manages physics simulation including mass, friction, and elasticity (PHASE 3).
 * Handles velocity decay, boundary bouncing, and audio-reactive motion.
 * 
 * @module playback/physics/physics-engine
 * 
 * @example
 * import { PhysicsEngine } from './physics-engine.js';
 * import { DEFAULT_PHYSICS } from '../core/object-pool.js';
 * 
 * const physics = new PhysicsEngine(DEFAULT_PHYSICS);
 * 
 * // Apply friction to slow down objects
 * physics.applyFriction(obj, deltaTime);
 * 
 * // Update positions based on velocity
 * physics.updatePositions(objects, deltaTime, velocity);
 * 
 * // Handle boundary bouncing
 * physics.handleBoundaries(obj, screenWidth, screenHeight);
 */

import { DEFAULT_PHYSICS } from '../core/object-pool.js';

/**
 * Default motion threshold
 * Objects only move when audio velocity exceeds this value
 * @type {number}
 */
export const DEFAULT_MOTION_THRESHOLD = 0.15;

/**
 * Default rotation threshold
 * Objects only rotate when audio velocity exceeds this value  
 * @type {number}
 */
export const DEFAULT_ROTATION_THRESHOLD = 0.2;

/**
 * Terminal aspect ratio for Y-axis movement
 * Characters are approximately 2x taller than wide
 * @type {number}
 */
export const TERMINAL_ASPECT_RATIO = 0.5;

/**
 * PhysicsEngine class for managing physics simulation
 */
export class PhysicsEngine {
  /**
   * Creates a new PhysicsEngine instance
   * @param {Object} [defaultPhysics=DEFAULT_PHYSICS] - Default physics configuration
   * @param {Object} [options={}] - Additional options
   * @param {number} [options.motionThreshold=0.15] - Motion threshold
   * @param {number} [options.rotationThreshold=0.2] - Rotation threshold
   */
  constructor(defaultPhysics = DEFAULT_PHYSICS, options = {}) {
    /** @type {Object} Default physics configuration */
    this.defaultPhysics = defaultPhysics;
    
    /** @type {number} Motion threshold - velocity must exceed this for movement */
    this.motionThreshold = options.motionThreshold ?? DEFAULT_MOTION_THRESHOLD;
    
    /** @type {number} Rotation threshold - velocity must exceed this for rotation */
    this.rotationThreshold = options.rotationThreshold ?? DEFAULT_ROTATION_THRESHOLD;
    
    /** @type {number} Terminal aspect ratio */
    this.terminalAspectRatio = TERMINAL_ASPECT_RATIO;
  }

  /**
   * Applies friction to decay velocity
   * Higher friction = faster velocity decay
   * 
   * @param {Object} obj - Object to apply friction to
   * @param {number} deltaTime - Time elapsed since last update
   * @returns {Object} Updated velocities { velocityX, velocityY }
   */
  applyFriction(obj, deltaTime) {
    const friction = obj.physics?.friction ?? this.defaultPhysics.friction;
    
    // Friction decays velocity exponentially
    const frictionDecay = Math.pow(1 - friction, deltaTime);
    
    obj.velocityX *= frictionDecay;
    obj.velocityY *= frictionDecay;
    
    return { velocityX: obj.velocityX, velocityY: obj.velocityY };
  }

  /**
   * Calculates mass multiplier for acceleration
   * Heavier objects accelerate slower from forces
   * 
   * @param {Object} obj - Object to get mass multiplier for
   * @returns {number} Mass multiplier (inverse square root of mass)
   */
  getMassMultiplier(obj) {
    const mass = obj.physics?.mass ?? this.defaultPhysics.mass;
    return 1 / Math.sqrt(mass);
  }

  /**
   * Calculates motion multiplier based on audio velocity
   * Returns 0 if velocity is below threshold
   * 
   * @param {number} velocity - Audio velocity (0.0 to 1.0)
   * @returns {number} Motion multiplier
   */
  getMotionMultiplier(velocity) {
    if (velocity <= this.motionThreshold) {
      return 0;
    }
    return (velocity - this.motionThreshold) * 3;
  }

  /**
   * Calculates rotation multiplier based on audio velocity
   * 
   * @param {number} velocity - Audio velocity (0.0 to 1.0)
   * @returns {number} Rotation multiplier
   */
  getRotationMultiplier(velocity) {
    if (velocity <= this.rotationThreshold) {
      return 0;
    }
    return (velocity - this.rotationThreshold) * 2;
  }

  /**
   * Updates object position based on velocity
   * Applies mass and audio-velocity multipliers
   * 
   * @param {Object} obj - Object to update
   * @param {number} deltaTime - Time elapsed since last update
   * @param {number} [audioVelocity=0] - Audio velocity for motion multiplier
   */
  updatePosition(obj, deltaTime, audioVelocity = 0) {
    const motionMultiplier = this.getMotionMultiplier(audioVelocity);
    
    // Skip if no motion
    if (motionMultiplier === 0) return;
    
    const massMultiplier = this.getMassMultiplier(obj);
    
    // Apply velocity to position with multipliers
    // X movement is faster than Y due to terminal aspect ratio
    obj.x += obj.velocityX * deltaTime * 5 * motionMultiplier * massMultiplier;
    obj.y += obj.velocityY * deltaTime * 3 * motionMultiplier * massMultiplier;
  }

  /**
   * Updates object rotation based on rotation speed
   * 
   * @param {Object} obj - Object to update
   * @param {number} deltaTime - Time elapsed since last update
   * @param {number} [audioVelocity=0] - Audio velocity for rotation multiplier
   */
  updateRotation(obj, deltaTime, audioVelocity = 0) {
    const rotationMultiplier = this.getRotationMultiplier(audioVelocity);
    
    // Skip if no rotation
    if (rotationMultiplier === 0) return;
    
    obj.rotation += obj.rotationSpeed * rotationMultiplier;
  }

  /**
   * Handles boundary collision with elasticity
   * Bounces objects off screen edges with energy loss
   * 
   * @param {Object} obj - Object to handle boundaries for
   * @param {number} screenWidth - Screen width
   * @param {number} screenHeight - Screen height
   * @param {number} [padding=10] - Padding from edge
   * @returns {Object} Boundary collision info { hitLeft, hitRight, hitTop, hitBottom }
   */
  handleBoundaries(obj, screenWidth, screenHeight, padding = 10) {
    const elasticity = obj.physics?.elasticity ?? this.defaultPhysics.elasticity;
    const result = { hitLeft: false, hitRight: false, hitTop: false, hitBottom: false };

    // Left boundary
    if (obj.x < padding) {
      obj.x = padding;
      obj.velocityX = Math.abs(obj.velocityX) * elasticity;
      result.hitLeft = true;
    }
    
    // Right boundary
    if (obj.x > screenWidth - padding) {
      obj.x = screenWidth - padding;
      obj.velocityX = -Math.abs(obj.velocityX) * elasticity;
      result.hitRight = true;
    }
    
    // Top boundary
    if (obj.y < padding) {
      obj.y = padding;
      obj.velocityY = Math.abs(obj.velocityY) * elasticity;
      result.hitTop = true;
    }
    
    // Bottom boundary
    if (obj.y > screenHeight - padding) {
      obj.y = screenHeight - padding;
      obj.velocityY = -Math.abs(obj.velocityY) * elasticity;
      result.hitBottom = true;
    }

    return result;
  }

  /**
   * Applies a force to an object
   * Force is divided by mass (F = ma)
   * 
   * @param {Object} obj - Object to apply force to
   * @param {number} forceX - X component of force
   * @param {number} forceY - Y component of force
   * @param {number} [deltaTime=1] - Time over which force is applied
   */
  applyForce(obj, forceX, forceY, deltaTime = 1) {
    const mass = obj.physics?.mass ?? this.defaultPhysics.mass;
    const massMultiplier = 1 / mass;
    
    obj.velocityX += forceX * massMultiplier * deltaTime;
    obj.velocityY += forceY * massMultiplier * deltaTime;
  }

  /**
   * Applies an impulse (instantaneous force) to an object
   * 
   * @param {Object} obj - Object to apply impulse to
   * @param {number} impulseX - X component of impulse
   * @param {number} impulseY - Y component of impulse
   */
  applyImpulse(obj, impulseX, impulseY) {
    const mass = obj.physics?.mass ?? this.defaultPhysics.mass;
    const massMultiplier = 1 / mass;
    
    obj.velocityX += impulseX * massMultiplier;
    obj.velocityY += impulseY * massMultiplier;
  }

  /**
   * Updates scale with audio-reactive pulsing
   * 
   * @param {Object} obj - Object to update
   * @param {number} amplitude - Audio amplitude (0.0 to 1.0)
   * @param {number} [velocity=0] - Audio velocity for extra boost
   * @param {number} [maxScale=8] - Maximum scale
   * @param {number} [minScale=0.1] - Minimum scale
   * @returns {number} New scale value
   */
  updateScale(obj, amplitude, velocity = 0, maxScale = 8, minScale = 0.1) {
    // Base scale with audio reactivity
    let newScale = 0.8 + amplitude * 0.6 + velocity * 0.2;
    
    // Add gentle pulsing
    newScale += Math.sin(obj.pulsePhase + obj.lifetime * 2) * 0.05;
    
    // Clamp to limits
    newScale = Math.max(minScale, Math.min(newScale, maxScale));
    
    obj.scale = newScale;
    return newScale;
  }

  /**
   * Handles explosion motion
   * Increases velocity and decreases scale
   * 
   * @param {Object} obj - Object to apply explosion to
   * @param {number} [deltaTime=1] - Time elapsed
   * @param {number} [velocityMultiplier=1.05] - Velocity increase per frame
   * @param {number} [scaleDecay=0.95] - Scale decay per frame
   */
  applyExplosion(obj, deltaTime = 1, velocityMultiplier = 1.05, scaleDecay = 0.95) {
    obj.velocityX *= Math.pow(velocityMultiplier, deltaTime);
    obj.velocityY *= Math.pow(velocityMultiplier, deltaTime);
    obj.scale *= Math.pow(scaleDecay, deltaTime);
  }

  /**
   * Handles melting motion
   * Increases downward velocity and decreases scale
   * 
   * @param {Object} obj - Object to apply melting to
   * @param {number} [deltaTime=1] - Time elapsed
   * @param {number} [gravity=2] - Downward acceleration
   * @param {number} [scaleDecay=0.3] - Scale decrease per second
   * @param {number} [minScale=0.1] - Minimum scale
   */
  applyMelting(obj, deltaTime = 1, gravity = 2, scaleDecay = 0.3, minScale = 0.1) {
    obj.velocityY += gravity * deltaTime;
    obj.scale = Math.max(minScale, obj.scale - deltaTime * scaleDecay);
  }

  /**
   * Handles shattered/vibration motion
   * Random jitter around position
   * 
   * @param {Object} obj - Object to apply shatter to
   * @param {number} [jitterAmount=2] - Maximum jitter distance
   */
  applyShatterJitter(obj, jitterAmount = 2) {
    obj.x += (Math.random() - 0.5) * jitterAmount;
    obj.y += (Math.random() - 0.5) * jitterAmount;
  }

  /**
   * Updates lifetime
   * 
   * @param {Object} obj - Object to update
   * @param {number} deltaTime - Time elapsed
   * @returns {number} New lifetime value
   */
  updateLifetime(obj, deltaTime) {
    obj.lifetime += deltaTime;
    return obj.lifetime;
  }

  /**
   * Checks if object has exceeded max lifetime
   * 
   * @param {Object} obj - Object to check
   * @returns {boolean} True if object should be removed
   */
  isExpired(obj) {
    return obj.lifetime > obj.maxLifetime;
  }

  /**
   * Checks if object scale is outside valid range
   * 
   * @param {Object} obj - Object to check
   * @param {number} [maxScale=8] - Maximum scale
   * @param {number} [minScale=0.1] - Minimum scale
   * @returns {boolean} True if scale is invalid
   */
  isInvalidScale(obj, maxScale = 8, minScale = 0.1) {
    return obj.scale < minScale || obj.scale > maxScale * 2;
  }

  /**
   * Updates physics for a single object
   * Applies friction, updates position/rotation, handles boundaries
   * 
   * @param {Object} obj - Object to update
   * @param {number} deltaTime - Time elapsed
   * @param {number} screenWidth - Screen width
   * @param {number} screenHeight - Screen height
   * @param {number} [audioVelocity=0] - Audio velocity
   * @returns {Object} Update result
   */
  updateObject(obj, deltaTime, screenWidth, screenHeight, audioVelocity = 0) {
    // Apply friction
    this.applyFriction(obj, deltaTime);
    
    // Update position
    this.updatePosition(obj, deltaTime, audioVelocity);
    
    // Update rotation
    this.updateRotation(obj, deltaTime, audioVelocity);
    
    // Handle boundaries
    const boundaryHits = this.handleBoundaries(obj, screenWidth, screenHeight);
    
    // Update lifetime
    this.updateLifetime(obj, deltaTime);
    
    return {
      boundaryHits,
      expired: this.isExpired(obj),
      invalidScale: this.isInvalidScale(obj)
    };
  }

  /**
   * Updates physics for all objects
   * 
   * @param {Array<Object>} objects - Array of objects
   * @param {number} deltaTime - Time elapsed
   * @param {number} screenWidth - Screen width
   * @param {number} screenHeight - Screen height
   * @param {number} [audioVelocity=0] - Audio velocity
   * @returns {Object} Update statistics
   */
  updateObjects(objects, deltaTime, screenWidth, screenHeight, audioVelocity = 0) {
    let expiredCount = 0;
    let boundaryHits = 0;
    
    // Update in reverse order for safe removal
    for (let i = objects.length - 1; i >= 0; i--) {
      const obj = objects[i];
      const result = this.updateObject(obj, deltaTime, screenWidth, screenHeight, audioVelocity);
      
      if (result.expired || result.invalidScale) {
        expiredCount++;
      }
      
      if (result.boundaryHits.hitLeft || result.boundaryHits.hitRight || 
          result.boundaryHits.hitTop || result.boundaryHits.hitBottom) {
        boundaryHits++;
      }
    }
    
    return {
      expiredCount,
      boundaryHits,
      totalUpdated: objects.length
    };
  }

  /**
   * Gets physics statistics
   * 
   * @param {Array<Object>} objects - Array of objects
   * @returns {Object} Physics statistics
   */
  getStats(objects) {
    if (objects.length === 0) {
      return {
        averageVelocity: 0,
        averageMass: this.defaultPhysics.mass,
        averageFriction: this.defaultPhysics.friction,
        averageElasticity: this.defaultPhysics.elasticity,
        expiredCount: 0
      };
    }
    
    let totalVelocity = 0;
    let totalMass = 0;
    let totalFriction = 0;
    let totalElasticity = 0;
    let expiredCount = 0;
    
    objects.forEach(obj => {
      const velocity = Math.sqrt(obj.velocityX ** 2 + obj.velocityY ** 2);
      totalVelocity += velocity;
      totalMass += obj.physics?.mass ?? this.defaultPhysics.mass;
      totalFriction += obj.physics?.friction ?? this.defaultPhysics.friction;
      totalElasticity += obj.physics?.elasticity ?? this.defaultPhysics.elasticity;
      
      if (this.isExpired(obj)) {
        expiredCount++;
      }
    });
    
    const count = objects.length;
    
    return {
      averageVelocity: totalVelocity / count,
      averageMass: totalMass / count,
      averageFriction: totalFriction / count,
      averageElasticity: totalElasticity / count,
      expiredCount
    };
  }
}

export default {
  PhysicsEngine,
  DEFAULT_MOTION_THRESHOLD,
  DEFAULT_ROTATION_THRESHOLD,
  TERMINAL_ASPECT_RATIO
};
