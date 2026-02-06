/**
 * Collision Detector Module
 * 
 * Implements AABB (Axis-Aligned Bounding Box) collision detection (PHASE 2).
 * Handles collision detection between objects and calculates collision responses
 * with physics support (PHASE 3).
 * 
 * @module playback/physics/collision-detector
 * 
 * @example
 * import { CollisionDetector } from './collision-detector.js';
 * import { DEFAULT_PHYSICS } from '../core/object-pool.js';
 * 
 * const detector = new CollisionDetector(DEFAULT_PHYSICS);
 * 
 * // Check collision between two objects
 * const collision = detector.detectAABB(obj1, obj2);
 * if (collision.collided) {
 *   console.log(`Overlap: ${collision.overlapX}, ${collision.overlapY}`);
 * }
 */

import { DEFAULT_PHYSICS } from '../core/object-pool.js';

/**
 * Terminal aspect ratio for height calculations
 * Characters are approximately 2x taller than wide
 * @type {number}
 */
export const TERMINAL_ASPECT_RATIO = 0.5;

/**
 * Default collision cooldown in seconds
 * Prevents immediate re-collision
 * @type {number}
 */
export const DEFAULT_COLLISION_COOLDOWN = 5.0;

/**
 * Default collision force multiplier
 * @type {number}
 */
export const DEFAULT_COLLISION_FORCE = 3;

/**
 * CollisionDetector class for AABB collision detection
 */
export class CollisionDetector {
  /**
   * Creates a new CollisionDetector instance
   * @param {Object} [defaultPhysics=DEFAULT_PHYSICS] - Default physics configuration
   * @param {number} [collisionCooldown=5.0] - Collision cooldown in seconds
   */
  constructor(defaultPhysics = DEFAULT_PHYSICS, collisionCooldown = DEFAULT_COLLISION_COOLDOWN) {
    /** @type {Object} Default physics configuration */
    this.defaultPhysics = defaultPhysics;
    
    /** @type {number} Collision cooldown duration */
    this.collisionCooldown = collisionCooldown;
    
    /** @type {number} Terminal aspect ratio for bounds calculations */
    this.terminalAspectRatio = TERMINAL_ASPECT_RATIO;
  }

  /**
   * Gets the bounding box for an object
   * Uses template bounds if available, otherwise estimates from art
   * 
   * @param {Object} obj - Object to get bounds for
   * @returns {Object} Bounds with width and height
   * @property {number} width - Bounding box width
   * @property {number} height - Bounding box height
   */
  getObjectBounds(obj) {
    // Validate template bounds before using (prevents NaN crashes)
    if (obj.bounds?.width > 0 && obj.bounds?.height > 0) {
      // Use template-provided bounds, scaled by object scale
      return {
        width: obj.bounds.width * obj.scale,
        height: obj.bounds.height * obj.scale
      };
    } else {
      // Fallback: estimate from ASCII art dimensions
      const artLines = obj.art.split('\n');
      const width = Math.max(...artLines.map(line => line.length));
      const height = artLines.length;
      return {
        width: width * obj.scale,
        height: height * obj.scale * this.terminalAspectRatio
      };
    }
  }

  /**
   * Detects AABB collision between two objects
   * 
   * @param {Object} obj1 - First object
   * @param {Object} obj2 - Second object
   * @returns {Object} Collision result
   * @property {boolean} collided - True if objects are colliding
   * @property {number} overlapX - Horizontal overlap amount
   * @property {number} overlapY - Vertical overlap amount
   * @property {number} dx - Horizontal distance between centers
   * @property {number} dy - Vertical distance between centers
   * 
   * @example
   * const result = detector.detectAABB(obj1, obj2);
   * if (result.collided) {
   *   // Handle collision
   * }
   */
  detectAABB(obj1, obj2) {
    const bounds1 = this.getObjectBounds(obj1);
    const bounds2 = this.getObjectBounds(obj2);

    // Calculate distance between centers
    const dx = Math.abs(obj1.x - obj2.x);
    const dy = Math.abs(obj1.y - obj2.y);
    
    // Calculate minimum distance for collision
    const minDistX = (bounds1.width + bounds2.width) / 2;
    const minDistY = (bounds1.height + bounds2.height) / 2;

    // Check for collision
    const collided = dx < minDistX && dy < minDistY;

    if (collided) {
      return {
        collided: true,
        overlapX: minDistX - dx,
        overlapY: minDistY - dy,
        dx,
        dy
      };
    }

    return { collided: false };
  }

  /**
   * Checks if two objects can collide (not on cooldown)
   * 
   * @param {Object} obj1 - First object
   * @param {Object} obj2 - Second object
   * @returns {boolean} True if objects can collide
   */
  canCollide(obj1, obj2) {
    return obj1.collisionCooldown <= 0 && obj2.collisionCooldown <= 0;
  }

  /**
   * Detects all collisions in a set of objects
   * Returns array of collision pairs
   * 
   * @param {Array<Object>} objects - Array of objects to check
   * @returns {Array<Object>} Array of collision pairs
   * @property {Object} obj1 - First colliding object
   * @property {Object} obj2 - Second colliding object
   * @property {Object} collision - Collision details from detectAABB
   * 
   * @example
   * const collisions = detector.detectCollisions(objects);
   * collisions.forEach(({ obj1, obj2, collision }) => {
   *   handleCollision(obj1, obj2, collision);
   * });
   */
  detectCollisions(objects) {
    const collisions = [];

    for (let i = 0; i < objects.length; i++) {
      for (let j = i + 1; j < objects.length; j++) {
        const obj1 = objects[i];
        const obj2 = objects[j];

        // Skip if either is on cooldown
        if (!this.canCollide(obj1, obj2)) continue;

        const collision = this.detectAABB(obj1, obj2);
        
        if (collision.collided) {
          collisions.push({ obj1, obj2, collision });
        }
      }
    }

    return collisions;
  }

  /**
   * Calculates collision response velocities
   * Implements physics-based collision response with mass and elasticity
   * 
   * @param {Object} obj1 - First object
   * @param {Object} obj2 - Second object
   * @param {number} [velocity=0] - Audio velocity (affects collision force)
   * @returns {Object} Velocity changes
   * @property {number} vx1 - X velocity change for obj1
   * @property {number} vy1 - Y velocity change for obj1
   * @property {number} vx2 - X velocity change for obj2
   * @property {number} vy2 - Y velocity change for obj2
   */
  calculateCollisionResponse(obj1, obj2, velocity = 0) {
    // Calculate angle between objects
    const angle = Math.atan2(obj2.y - obj1.y, obj2.x - obj1.x);

    // Get masses
    const mass1 = obj1.physics?.mass ?? this.defaultPhysics.mass;
    const mass2 = obj2.physics?.mass ?? this.defaultPhysics.mass;
    const totalMass = mass1 + mass2;

    // Get elasticities
    const elasticity1 = obj1.physics?.elasticity ?? this.defaultPhysics.elasticity;
    const elasticity2 = obj2.physics?.elasticity ?? this.defaultPhysics.elasticity;
    const avgElasticity = (elasticity1 + elasticity2) / 2;

    // Calculate collision force
    const baseForce = DEFAULT_COLLISION_FORCE + velocity * 5;
    const collisionForce = baseForce * (1 + avgElasticity);

    // Forces proportional to mass ratio (lighter object gets pushed more)
    const force1 = collisionForce * (mass2 / totalMass);
    const force2 = collisionForce * (mass1 / totalMass);

    return {
      vx1: -Math.cos(angle) * force1,
      vy1: -Math.sin(angle) * force1,
      vx2: Math.cos(angle) * force2,
      vy2: Math.sin(angle) * force2
    };
  }

  /**
   * Applies collision response to objects
   * Updates velocities and sets collision cooldowns
   * 
   * @param {Object} obj1 - First object
   * @param {Object} obj2 - Second object
   * @param {number} [velocity=0] - Audio velocity
   * @returns {Object} Applied velocity changes
   */
  applyCollisionResponse(obj1, obj2, velocity = 0) {
    const response = this.calculateCollisionResponse(obj1, obj2, velocity);

    // Apply velocities
    obj1.velocityX += response.vx1;
    obj1.velocityY += response.vy1;
    obj2.velocityX += response.vx2;
    obj2.velocityY += response.vy2;

    // Set cooldowns
    obj1.collisionCooldown = this.collisionCooldown;
    obj2.collisionCooldown = this.collisionCooldown;

    return response;
  }

  /**
   * Handles a complete collision (detection + response)
   * 
   * @param {Object} obj1 - First object
   * @param {Object} obj2 - Second object
   * @param {number} [amplitude=0] - Audio amplitude
   * @param {number} [velocity=0] - Audio velocity
   * @returns {Object|null} Collision result or null if no collision
   * @property {boolean} collided - True if collision occurred
   * @property {Object} response - Velocity changes applied
   */
  handleCollision(obj1, obj2, amplitude = 0, velocity = 0) {
    // Check if can collide
    if (!this.canCollide(obj1, obj2)) {
      return null;
    }

    // Detect collision
    const collision = this.detectAABB(obj1, obj2);
    
    if (!collision.collided) {
      return null;
    }

    // Apply response
    const response = this.applyCollisionResponse(obj1, obj2, velocity);

    return {
      collided: true,
      collision,
      response
    };
  }

  /**
   * Processes all collisions and applies responses
   * 
   * @param {Array<Object>} objects - Array of objects
   * @param {number} [amplitude=0] - Audio amplitude
   * @param {number} [velocity=0] - Audio velocity
   * @returns {number} Number of collisions handled
   */
  processCollisions(objects, amplitude = 0, velocity = 0) {
    const collisions = this.detectCollisions(objects);
    
    collisions.forEach(({ obj1, obj2 }) => {
      this.applyCollisionResponse(obj1, obj2, velocity);
    });

    return collisions.length;
  }

  /**
   * Gets collision statistics
   * 
   * @param {Array<Object>} objects - Array of objects
   * @returns {Object} Collision statistics
   * @property {number} totalPairs - Total possible collision pairs
   * @property {number} activeCollisions - Current collision count
   * @property {number} cooldownObjects - Objects currently on cooldown
   */
  getCollisionStats(objects) {
    const totalPairs = (objects.length * (objects.length - 1)) / 2;
    const collisions = this.detectCollisions(objects);
    const cooldownObjects = objects.filter(obj => obj.collisionCooldown > 0).length;

    return {
      totalPairs,
      activeCollisions: collisions.length,
      cooldownObjects
    };
  }

  /**
   * Resets collision cooldowns for all objects
   * 
   * @param {Array<Object>} objects - Array of objects
   */
  resetCooldowns(objects) {
    objects.forEach(obj => {
      obj.collisionCooldown = 0;
    });
  }

  /**
   * Updates collision cooldowns
   * 
   * @param {Array<Object>} objects - Array of objects
   * @param {number} deltaTime - Time elapsed since last update
   */
  updateCooldowns(objects, deltaTime) {
    objects.forEach(obj => {
      if (obj.collisionCooldown > 0) {
        obj.collisionCooldown -= deltaTime;
        if (obj.collisionCooldown < 0) {
          obj.collisionCooldown = 0;
        }
      }
    });
  }

  /**
   * Separates two overlapping objects
   * Moves objects apart based on overlap amounts
   * 
   * @param {Object} obj1 - First object
   * @param {Object} obj2 - Second object
   * @param {Object} collision - Collision data from detectAABB
   */
  separateObjects(obj1, obj2, collision) {
    const { overlapX, overlapY, dx, dy } = collision;

    // Determine separation direction
    const moveX = dx > 0 ? overlapX / 2 : -overlapX / 2;
    const moveY = dy > 0 ? overlapY / 2 : -overlapY / 2;

    // Move objects apart
    obj1.x -= moveX;
    obj1.y -= moveY;
    obj2.x += moveX;
    obj2.y += moveY;
  }

  /**
   * Checks if a point is inside an object's bounds
   * 
   * @param {Object} obj - Object to check
   * @param {number} x - Point X coordinate
   * @param {number} y - Point Y coordinate
   * @returns {boolean} True if point is inside object bounds
   */
  pointInObject(obj, x, y) {
    const bounds = this.getObjectBounds(obj);
    const halfWidth = bounds.width / 2;
    const halfHeight = bounds.height / 2;

    return (
      x >= obj.x - halfWidth &&
      x <= obj.x + halfWidth &&
      y >= obj.y - halfHeight &&
      y <= obj.y + halfHeight
    );
  }

  /**
   * Finds all objects at a given point
   * 
   * @param {Array<Object>} objects - Array of objects to check
   * @param {number} x - Point X coordinate
   * @param {number} y - Point Y coordinate
   * @returns {Array<Object>} Objects at the point
   */
  getObjectsAtPoint(objects, x, y) {
    return objects.filter(obj => this.pointInObject(obj, x, y));
  }

  /**
   * Checks if an object is colliding with any other object
   * 
   * @param {Object} obj - Object to check
   * @param {Array<Object>} objects - Array of other objects
   * @returns {boolean} True if object is colliding with anything
   */
  isColliding(obj, objects) {
    return objects.some(other => {
      if (obj === other) return false;
      return this.detectAABB(obj, other).collided;
    });
  }

  /**
   * Gets all objects colliding with a specific object
   * 
   * @param {Object} obj - Object to check
   * @param {Array<Object>} objects - Array of other objects
   * @returns {Array<Object>} Objects colliding with obj
   */
  getCollidingObjects(obj, objects) {
    return objects.filter(other => {
      if (obj === other) return false;
      return this.detectAABB(obj, other).collided;
    });
  }
}

export default {
  CollisionDetector,
  TERMINAL_ASPECT_RATIO,
  DEFAULT_COLLISION_COOLDOWN,
  DEFAULT_COLLISION_FORCE
};
