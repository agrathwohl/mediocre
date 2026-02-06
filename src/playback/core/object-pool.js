/**
 * Object Pool Module
 * 
 * Manages the lifecycle of visual objects on screen.
 * Provides methods for adding, removing, and querying objects with
 * support for templates, physics properties, and automatic cleanup.
 * 
 * @module playback/core/object-pool
 * 
 * @example
 * import { ObjectPool } from './object-pool.js';
 * 
 * const pool = new ObjectPool(50);
 * 
 * // Add an object
 * const id = pool.addObject({
 *   art: "ASCII art",
 *   x: 40,
 *   y: 12,
 *   scale: 1.0,
 *   template: { defaultColor: "#ff0000", physics: { mass: 1.5 } }
 * });
 * 
 * // Get all objects
 * const objects = pool.getAllObjects();
 * 
 * // Remove an object
 * pool.removeObject(id);
 */

/**
 * Default physics configuration for objects
 * @type {Object}
 * @property {number} mass - Object mass (affects acceleration) (default: 1)
 * @property {number} friction - Friction coefficient (0-1) (default: 0.8)
 * @property {number} elasticity - Bounciness (0-1) (default: 0.3)
 */
export const DEFAULT_PHYSICS = Object.freeze({
  mass: 1,
  friction: 0.8,
  elasticity: 0.3
});

/**
 * Default object configuration
 * @type {Object}
 */
export const DEFAULT_OBJECT_CONFIG = {
  x: 0,
  y: 0,
  scale: 1.0,
  rotation: 0,
  velocityX: 0,
  velocityY: 0,
  rotationSpeed: 0,
  lifetime: 0,
  maxLifetime: 3,
  color: null,
  bounds: null,
  physics: { ...DEFAULT_PHYSICS },
  transformation: null,
  transformProgress: 0,
  originalArt: null,
  inverted: false,
  exploding: false,
  melting: false,
  glitching: false,
  morphing: false,
  shattered: false,
  pixelated: false,
  rainbow: false,
  collisionCooldown: 0,
  isMultipliedCopy: false
};

/**
 * ObjectPool class for managing visual objects
 */
export class ObjectPool {
  /**
   * Creates a new ObjectPool instance
   * @param {number} [maxObjects=50] - Maximum number of objects allowed
   * @param {number} [multiplyLimit=8] - Maximum objects from multiplication
   * @param {number} [maxScale=8] - Maximum scale multiplier
   * @param {number} [minScale=0.1] - Minimum scale before removal
   */
  constructor(maxObjects = 50, multiplyLimit = 8, maxScale = 8, minScale = 0.1) {
    /** @type {Array<Object>} Array of active objects */
    this.objects = [];
    
    /** @type {number} Hard limit on total objects */
    this.MAX_OBJECTS = maxObjects;
    
    /** @type {number} Maximum objects created by multiplication */
    this.MULTIPLY_LIMIT = multiplyLimit;
    
    /** @type {number} Maximum scale multiplier */
    this.MAX_SCALE = maxScale;
    
    /** @type {number} Minimum scale before auto-removal */
    this.MIN_SCALE = minScale;
    
    /** @type {number} Object ID counter */
    this.nextId = 0;
    
    /** @type {number} Terminal aspect ratio for height calculations */
    this.TERMINAL_ASPECT_RATIO = 0.5;
  }

  /**
   * Adds a new object to the pool
   * @param {Object} config - Object configuration
   * @param {string} config.art - ASCII art string
   * @param {number} [config.x=0] - X position
   * @param {number} [config.y=0] - Y position
   * @param {number} [config.scale=1] - Scale factor
   * @param {number} [config.rotation=0] - Rotation in radians
   * @param {number} [config.amplitude=0] - Audio amplitude (affects velocity)
   * @param {number} [config.velocity=0] - Audio velocity (affects motion)
   * @param {Object} [config.template=null] - Template with defaultColor, bounds, physics
   * @returns {number} Object ID
   * 
   * @example
   * const id = pool.addObject({
   *   art: "★",
   *   x: 40,
   *   y: 12,
   *   template: {
   *     defaultColor: "#ffff00",
   *     bounds: { width: 5, height: 3 },
   *     physics: { mass: 1.5, friction: 0.9 }
   *   }
   * });
   */
  addObject(config) {
    // Remove oldest object if at capacity
    if (this.objects.length >= this.MAX_OBJECTS) {
      this.objects.shift();
    }

    const id = this.nextId++;
    const { art, x = 0, y = 0, scale = 1, rotation = 0, amplitude = 0, velocity = 0, template = null } = config;

    const obj = {
      id,
      art,
      x,
      y,
      scale,
      rotation,
      // PHASE 1: Template properties
      color: template?.defaultColor || null,
      bounds: template?.bounds || null,
      physics: template?.physics ? { ...DEFAULT_PHYSICS, ...template.physics } : { ...DEFAULT_PHYSICS },
      // Motion based on velocity
      velocityX: (Math.random() - 0.5) * (velocity * 6),
      velocityY: (Math.random() - 0.5) * (velocity * 3),
      rotationSpeed: (Math.random() - 0.5) * 0.03 * velocity,
      pulsePhase: Math.random() * Math.PI * 2,
      lifetime: 0,
      maxLifetime: 3 + velocity * 7 + amplitude * 3,
      // Transformation state
      transformation: null,
      transformProgress: 0,
      originalArt: art,
      inverted: false,
      exploding: false,
      melting: false,
      glitching: false,
      morphing: false,
      shattered: false,
      pixelated: false,
      rainbow: false,
      collisionCooldown: 0,
      isMultipliedCopy: false,
      createdAt: Date.now()
    };

    this.objects.push(obj);
    return id;
  }

  /**
   * Removes an object by ID
   * @param {number} id - Object ID to remove
   * @returns {boolean} True if object was found and removed
   */
  removeObject(id) {
    const index = this.objects.findIndex(obj => obj.id === id);
    if (index !== -1) {
      this.objects.splice(index, 1);
      return true;
    }
    return false;
  }

  /**
   * Removes multiple objects by IDs
   * @param {number[]} ids - Array of object IDs to remove
   * @returns {number} Number of objects removed
   */
  removeObjects(ids) {
    let removed = 0;
    ids.forEach(id => {
      if (this.removeObject(id)) removed++;
    });
    return removed;
  }

  /**
   * Gets an object by ID
   * @param {number} id - Object ID
   * @returns {Object|undefined} Object or undefined if not found
   */
  getObject(id) {
    return this.objects.find(obj => obj.id === id);
  }

  /**
   * Gets all objects in the pool
   * @returns {Array<Object>} Array of all objects
   */
  getAllObjects() {
    return this.objects;
  }

  /**
   * Gets count of objects in pool
   * @returns {number} Number of objects
   */
  getObjectCount() {
    return this.objects.length;
  }

  /**
   * Checks if pool is at capacity
   * @returns {boolean} True if pool is full
   */
  isFull() {
    return this.objects.length >= this.MAX_OBJECTS;
  }

  /**
   * Checks if pool is empty
   * @returns {boolean} True if pool is empty
   */
  isEmpty() {
    return this.objects.length === 0;
  }

  /**
   * Gets available space in pool
   * @returns {number} Number of slots available
   */
  getAvailableSpace() {
    return this.MAX_OBJECTS - this.objects.length;
  }

  /**
   * Clears all objects from pool
   */
  clear() {
    this.objects = [];
  }

  /**
   * Cleans up old objects when pool is over capacity threshold
   * Removes oldest objects first (FIFO)
   * @param {number} [thresholdPercent=0.75] - Capacity threshold to trigger cleanup (0-1)
   * @param {number} [targetPercent=0.6] - Target capacity after cleanup (0-1)
   * @returns {number} Number of objects removed
   */
  cleanup(thresholdPercent = 0.75, targetPercent = 0.6) {
    const threshold = Math.floor(this.MAX_OBJECTS * thresholdPercent);
    
    if (this.objects.length > threshold) {
      const targetCount = Math.floor(this.MAX_OBJECTS * targetPercent);
      const toRemove = this.objects.length - targetCount;
      
      // Remove oldest objects from front of array
      this.objects.splice(0, toRemove);
      return toRemove;
    }
    
    return 0;
  }

  /**
   * Removes objects that have exceeded their maxLifetime
   * @param {number} currentTime - Current elapsed time
   * @returns {number} Number of objects removed
   */
  removeExpired(currentTime) {
    const expiredIds = this.objects
      .filter(obj => obj.lifetime >= obj.maxLifetime)
      .map(obj => obj.id);
    
    return this.removeObjects(expiredIds);
  }

  /**
   * Removes objects that have scaled below minimum
   * @returns {number} Number of objects removed
   */
  removeTooSmall() {
    const smallIds = this.objects
      .filter(obj => obj.scale < this.MIN_SCALE)
      .map(obj => obj.id);
    
    return this.removeObjects(smallIds);
  }

  /**
   * Updates object lifetimes
   * @param {number} deltaTime - Time elapsed since last update
   */
  updateLifetimes(deltaTime) {
    this.objects.forEach(obj => {
      obj.lifetime += deltaTime;
    });
  }

  /**
   * Resets collision cooldowns for all objects
   */
  resetCollisionCooldowns() {
    this.objects.forEach(obj => {
      obj.collisionCooldown = 0;
    });
  }

  /**
   * Updates collision cooldowns
   * @param {number} deltaTime - Time elapsed since last update
   */
  updateCollisionCooldowns(deltaTime) {
    this.objects.forEach(obj => {
      if (obj.collisionCooldown > 0) {
        obj.collisionCooldown -= deltaTime;
        if (obj.collisionCooldown < 0) obj.collisionCooldown = 0;
      }
    });
  }

  /**
   * Gets objects that are ready for collision detection
   * (collisionCooldown <= 0)
   * @returns {Array<Object>} Objects ready for collision
   */
  getCollisionReadyObjects() {
    return this.objects.filter(obj => obj.collisionCooldown <= 0);
  }

  /**
   * Gets objects created by multiplication
   * @returns {Array<Object>} Multiplied objects
   */
  getMultipliedObjects() {
    return this.objects.filter(obj => obj.isMultipliedCopy);
  }

  /**
   * Gets count of multiplied objects
   * @returns {number} Count of multiplied objects
   */
  getMultipliedCount() {
    return this.objects.filter(obj => obj.isMultipliedCopy).length;
  }

  /**
   * Checks if multiplication limit has been reached
   * @returns {boolean} True if at multiply limit
   */
  isAtMultiplyLimit() {
    return this.getMultipliedCount() >= this.MULTIPLY_LIMIT;
  }

  /**
   * Marks an object as a multiplied copy
   * @param {number} id - Object ID
   * @returns {boolean} True if successful
   */
  markAsMultiplied(id) {
    const obj = this.getObject(id);
    if (obj) {
      obj.isMultipliedCopy = true;
      return true;
    }
    return false;
  }

  /**
   * Iterates over all objects with a callback
   * @param {Function} callback - Function called for each object (obj, index)
   */
  forEach(callback) {
    this.objects.forEach(callback);
  }

  /**
   * Maps over all objects
   * @param {Function} callback - Function called for each object (obj, index)
   * @returns {Array} Array of return values
   */
  map(callback) {
    return this.objects.map(callback);
  }

  /**
   * Filters objects based on predicate
   * @param {Function} predicate - Function returning boolean (obj, index)
   * @returns {Array<Object>} Filtered objects
   */
  filter(predicate) {
    return this.objects.filter(predicate);
  }

  /**
   * Finds first object matching predicate
   * @param {Function} predicate - Function returning boolean (obj, index)
   * @returns {Object|undefined} First matching object or undefined
   */
  find(predicate) {
    return this.objects.find(predicate);
  }

  /**
   * Gets statistics about the pool
   * @returns {Object} Pool statistics
   * @property {number} count - Total object count
   * @property {number} max - Maximum capacity
   * @property {number} available - Available slots
   * @property {number} multiplied - Count of multiplied objects
   * @property {number} oldestId - ID of oldest object
   * @property {number} newestId - ID of newest object
   */
  getStats() {
    return {
      count: this.objects.length,
      max: this.MAX_OBJECTS,
      available: this.getAvailableSpace(),
      multiplied: this.getMultipliedCount(),
      oldestId: this.objects.length > 0 ? this.objects[0].id : null,
      newestId: this.objects.length > 0 ? this.objects[this.objects.length - 1].id : null
    };
  }

  /**
   * Creates a copy of an object
   * @param {number} id - Object ID to copy
   * @param {Object} [overrides={}] - Properties to override in copy
   * @returns {number|null} ID of new object or null if original not found
   */
  copyObject(id, overrides = {}) {
    const obj = this.getObject(id);
    if (!obj) return null;

    const config = {
      art: obj.originalArt || obj.art,
      x: obj.x,
      y: obj.y,
      scale: obj.scale,
      rotation: obj.rotation,
      template: {
        defaultColor: obj.color,
        bounds: obj.bounds,
        physics: { ...obj.physics }
      },
      ...overrides
    };

    const newId = this.addObject(config);
    const newObj = this.getObject(newId);
    
    if (newObj) {
      newObj.isMultipliedCopy = true;
    }

    return newId;
  }

  /**
   * Multiplies an object (creates copies with variations)
   * @param {number} id - Object ID to multiply
   * @param {number} count - Number of copies to create
   * @param {Object} [options={}] - Multiplication options
   * @param {boolean} [options.randomPosition=true] - Randomize positions
   * @param {boolean} [options.randomVelocity=true] - Randomize velocities
   * @returns {number[]} Array of new object IDs
   */
  multiplyObject(id, count, options = {}) {
    const { randomPosition = true, randomVelocity = true } = options;
    const obj = this.getObject(id);
    if (!obj) return [];

    const newIds = [];
    const actualCount = Math.min(count, this.MULTIPLY_LIMIT - this.getMultipliedCount());

    for (let i = 0; i < actualCount; i++) {
      const overrides = {
        x: randomPosition ? obj.x + (Math.random() - 0.5) * 10 : obj.x,
        y: randomPosition ? obj.y + (Math.random() - 0.5) * 5 : obj.y,
        velocity: randomVelocity ? Math.random() : 0.5
      };

      const newId = this.copyObject(id, overrides);
      if (newId !== null) {
        newIds.push(newId);
      }
    }

    return newIds;
  }
}

export default {
  ObjectPool,
  DEFAULT_PHYSICS,
  DEFAULT_OBJECT_CONFIG
};
