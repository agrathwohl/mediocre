/**
 * Motion Controller Module
 * 
 * Handles complex motion patterns including circular motion, path animation,
 * and audio-reactive positioning. Works with choreography events to create
 * dynamic object movements.
 * 
 * @module playback/physics/motion-controller
 * 
 * @example
 * import { MotionController } from './motion-controller.js';
 * 
 * const motion = new MotionController();
 * 
 * // Apply circular orbit
 * motion.applyCircularMotion(obj, deltaTime, centerX, centerY);
 * 
 * // Follow a path
 * motion.applyPathAnimation(obj, deltaTime);
 */

/**
 * Terminal aspect ratio for Y-axis calculations
 * Characters are approximately 2x taller than wide
 * @type {number}
 */
export const TERMINAL_ASPECT_RATIO = 0.5;

/**
 * MotionController class for handling complex motion patterns
 */
export class MotionController {
  /**
   * Creates a new MotionController instance
   * @param {Object} [options={}] - Configuration options
   * @param {number} [options.terminalAspectRatio=0.5] - Terminal aspect ratio
   */
  constructor(options = {}) {
    /** @type {number} Terminal aspect ratio for Y-axis calculations */
    this.terminalAspectRatio = options.terminalAspectRatio ?? TERMINAL_ASPECT_RATIO;
  }

  /**
   * Applies circular motion to an object
   * Object orbits around a center point
   * 
   * @param {Object} obj - Object to move
   * @param {number} deltaTime - Time elapsed since last update
   * @param {number} [centerX] - Center X coordinate (defaults to screen center)
   * @param {number} [centerY] - Center Y coordinate (defaults to screen center)
   * @param {number} [screenWidth=80] - Screen width for default center
   * @param {number} [screenHeight=24] - Screen height for default center
   * @returns {Object} New position { x, y }
   * 
   * @example
   * // Setup circular motion
   * obj.circularMotion = {
   *   centerX: 40,
   *   centerY: 12,
   *   radius: 10,
   *   speed: 2,
   *   angle: 0
   * };
   * 
   * // Apply each frame
   * motion.applyCircularMotion(obj, deltaTime);
   */
  applyCircularMotion(obj, deltaTime, centerX, centerY, screenWidth = 80, screenHeight = 24) {
    if (!obj.circularMotion) return { x: obj.x, y: obj.y };

    // Update angle
    obj.circularMotion.angle += obj.circularMotion.speed * deltaTime;

    // Calculate center point
    const cx = centerX ?? obj.circularMotion.centerX ?? screenWidth / 2;
    const cy = centerY ?? obj.circularMotion.centerY ?? screenHeight / 2;

    // Calculate new position
    obj.x = cx + Math.cos(obj.circularMotion.angle) * obj.circularMotion.radius;
    obj.y = cy + Math.sin(obj.circularMotion.angle) * obj.circularMotion.radius * this.terminalAspectRatio;

    return { x: obj.x, y: obj.y };
  }

  /**
   * Sets up circular motion for an object
   * 
   * @param {Object} obj - Object to setup
   * @param {number} centerX - Center X coordinate
   * @param {number} centerY - Center Y coordinate
   * @param {number} radius - Orbit radius
   * @param {number} speed - Angular speed (radians per second)
   * @param {number} [initialAngle=0] - Initial angle
   */
  setupCircularMotion(obj, centerX, centerY, radius, speed, initialAngle = 0) {
    obj.circularMotion = {
      centerX,
      centerY,
      radius,
      speed,
      angle: initialAngle
    };
  }

  /**
   * Removes circular motion from an object
   * 
   * @param {Object} obj - Object to modify
   */
  removeCircularMotion(obj) {
    delete obj.circularMotion;
  }

  /**
   * Applies path-based animation to an object
   * Object follows a series of waypoints
   * 
   * @param {Object} obj - Object to move
   * @param {number} deltaTime - Time elapsed (used for time-based calculation)
   * @returns {boolean} True if path is still active, false if complete
   * 
   * @example
   * // Setup path animation
   * obj.pathAnimation = {
   *   points: [
   *     { x: 10, y: 10, time: 0 },
   *     { x: 40, y: 12, time: 2 },
   *     { x: 70, y: 10, time: 4 }
   *   ],
   *   startTime: Date.now(),
   *   totalDuration: 4
   * };
   * 
   * // Apply each frame
   * const active = motion.applyPathAnimation(obj, deltaTime);
   */
  applyPathAnimation(obj, deltaTime) {
    if (!obj.pathAnimation) return false;

    const elapsed = (Date.now() - obj.pathAnimation.startTime) / 1000;
    const progress = elapsed / obj.pathAnimation.totalDuration;

    if (progress >= 1) {
      // Path complete
      delete obj.pathAnimation;
      return false;
    }

    const points = obj.pathAnimation.points;
    if (points.length < 2) {
      delete obj.pathAnimation;
      return false;
    }

    // Find current segment
    let targetIndex = 0;
    for (let i = 0; i < points.length; i++) {
      if (elapsed >= points[i].time) {
        targetIndex = i;
      }
    }

    if (targetIndex >= points.length - 1) {
      // At last point
      obj.x = points[points.length - 1].x;
      obj.y = points[points.length - 1].y;
      return true;
    }

    // Interpolate between points
    const p1 = points[targetIndex];
    const p2 = points[targetIndex + 1];
    const segmentDuration = p2.time - p1.time;
    const segmentProgress = (elapsed - p1.time) / segmentDuration;

    // Linear interpolation
    obj.x = p1.x + (p2.x - p1.x) * segmentProgress;
    obj.y = p1.y + (p2.y - p1.y) * segmentProgress;

    return true;
  }

  /**
   * Sets up path animation for an object
   * 
   * @param {Object} obj - Object to setup
   * @param {Array<Object>} points - Array of waypoints { x, y, time }
   * @param {number} [startTime] - Start time (defaults to Date.now())
   */
  setupPathAnimation(obj, points, startTime) {
    if (points.length < 2) return;

    const lastPoint = points[points.length - 1];
    
    obj.pathAnimation = {
      points: [...points],
      startTime: startTime ?? Date.now(),
      totalDuration: lastPoint.time
    };
  }

  /**
   * Removes path animation from an object
   * 
   * @param {Object} obj - Object to modify
   */
  removePathAnimation(obj) {
    delete obj.pathAnimation;
  }

  /**
   * Applies linear movement toward a target position
   * 
   * @param {Object} obj - Object to move
   * @param {number} targetX - Target X coordinate
   * @param {number} targetY - Target Y coordinate
   * @param {number} speed - Movement speed (units per second)
   * @param {number} deltaTime - Time elapsed
   * @returns {boolean} True if still moving, false if reached target
   */
  moveToward(obj, targetX, targetY, speed, deltaTime) {
    const dx = targetX - obj.x;
    const dy = targetY - obj.y;
    const distance = Math.sqrt(dx * dx + dy * dy);

    if (distance < 0.5) {
      // Reached target
      obj.x = targetX;
      obj.y = targetY;
      return false;
    }

    // Move toward target
    const moveDistance = speed * deltaTime;
    const ratio = Math.min(moveDistance / distance, 1);

    obj.x += dx * ratio;
    obj.y += dy * ratio;

    return true;
  }

  /**
   * Applies velocity-based movement with optional audio reactivity
   * 
   * @param {Object} obj - Object to move
   * @param {number} deltaTime - Time elapsed
   * @param {number} [audioVelocity=0] - Audio velocity for motion multiplier
   * @param {number} [motionThreshold=0.15] - Minimum velocity for motion
   * @param {number} [mass=1] - Object mass (affects acceleration)
   */
  applyVelocity(obj, deltaTime, audioVelocity = 0, motionThreshold = 0.15, mass = 1) {
    // Check motion threshold
    if (audioVelocity <= motionThreshold) return;

    const motionMultiplier = (audioVelocity - motionThreshold) * 3;
    const massMultiplier = 1 / Math.sqrt(mass);

    // Apply velocity to position
    obj.x += obj.velocityX * deltaTime * 5 * motionMultiplier * massMultiplier;
    obj.y += obj.velocityY * deltaTime * 3 * motionMultiplier * massMultiplier;
  }

  /**
   * Applies acceleration to velocity
   * 
   * @param {Object} obj - Object to accelerate
   * @param {number} accelX - X acceleration
   * @param {number} accelY - Y acceleration
   * @param {number} deltaTime - Time elapsed
   * @param {number} [maxSpeed] - Maximum speed (optional)
   */
  applyAcceleration(obj, accelX, accelY, deltaTime, maxSpeed) {
    obj.velocityX += accelX * deltaTime;
    obj.velocityY += accelY * deltaTime;

    // Clamp to max speed if specified
    if (maxSpeed !== undefined) {
      const speed = Math.sqrt(obj.velocityX ** 2 + obj.velocityY ** 2);
      if (speed > maxSpeed) {
        const ratio = maxSpeed / speed;
        obj.velocityX *= ratio;
        obj.velocityY *= ratio;
      }
    }
  }

  /**
   * Applies random jitter to object position
   * 
   * @param {Object} obj - Object to jitter
   * @param {number} amount - Maximum jitter distance
   */
  applyJitter(obj, amount) {
    obj.x += (Math.random() - 0.5) * amount;
    obj.y += (Math.random() - 0.5) * amount;
  }

  /**
   * Teleports object to a random position within bounds
   * 
   * @param {Object} obj - Object to teleport
   * @param {number} minX - Minimum X coordinate
   * @param {number} maxX - Maximum X coordinate
   * @param {number} minY - Minimum Y coordinate
   * @param {number} maxY - Maximum Y coordinate
   */
  teleportRandom(obj, minX, maxX, minY, maxY) {
    obj.x = minX + Math.random() * (maxX - minX);
    obj.y = minY + Math.random() * (maxY - minY);
  }

  /**
   * Applies gravitational pull toward a point
   * 
   * @param {Object} obj - Object to pull
   * @param {number} centerX - Gravity center X
   * @param {number} centerY - Gravity center Y
   * @param {number} strength - Gravity strength
   * @param {number} deltaTime - Time elapsed
   */
  applyGravity(obj, centerX, centerY, strength, deltaTime) {
    const dx = centerX - obj.x;
    const dy = centerY - obj.y;
    const distance = Math.sqrt(dx * dx + dy * dy);

    if (distance > 0) {
      const force = strength / (distance * 0.5); // Inverse relationship
      obj.velocityX += (dx / distance) * force * deltaTime;
      obj.velocityY += (dy / distance) * force * deltaTime;
    }
  }

  /**
   * Applies repulsion from a point
   * 
   * @param {Object} obj - Object to repel
   * @param {number} centerX - Repulsion center X
   * @param {number} centerY - Repulsion center Y
   * @param {number} strength - Repulsion strength
   * @param {number} deltaTime - Time elapsed
   */
  applyRepulsion(obj, centerX, centerY, strength, deltaTime) {
    const dx = obj.x - centerX;
    const dy = obj.y - centerY;
    const distance = Math.sqrt(dx * dx + dy * dy);

    if (distance > 0) {
      const force = strength / (distance * 0.5);
      obj.velocityX += (dx / distance) * force * deltaTime;
      obj.velocityY += (dy / distance) * force * deltaTime;
    }
  }

  /**
   * Applies wave motion (sinusoidal oscillation)
   * 
   * @param {Object} obj - Object to move
   * @param {number} time - Current time
   * @param {number} amplitude - Wave amplitude
   * @param {number} frequency - Wave frequency (cycles per second)
   * @param {number} [axis='x'] - Axis to oscillate ('x' or 'y')
   */
  applyWaveMotion(obj, time, amplitude, frequency, axis = 'x') {
    const offset = Math.sin(time * frequency * Math.PI * 2) * amplitude;
    
    if (axis === 'x') {
      obj.x += offset;
    } else {
      obj.y += offset;
    }
  }

  /**
   * Checks if object is moving
   * 
   * @param {Object} obj - Object to check
   * @param {number} [threshold=0.01] - Minimum velocity to consider moving
   * @returns {boolean} True if object is moving
   */
  isMoving(obj, threshold = 0.01) {
    const speed = Math.sqrt(obj.velocityX ** 2 + obj.velocityY ** 2);
    return speed > threshold;
  }

  /**
   * Gets object speed
   * 
   * @param {Object} obj - Object to check
   * @returns {number} Speed magnitude
   */
  getSpeed(obj) {
    return Math.sqrt(obj.velocityX ** 2 + obj.velocityY ** 2);
  }

  /**
   * Stops object movement
   * 
   * @param {Object} obj - Object to stop
   */
  stop(obj) {
    obj.velocityX = 0;
    obj.velocityY = 0;
  }

  /**
   * Limits object speed
   * 
   * @param {Object} obj - Object to limit
   * @param {number} maxSpeed - Maximum allowed speed
   */
  limitSpeed(obj, maxSpeed) {
    const speed = this.getSpeed(obj);
    if (speed > maxSpeed) {
      const ratio = maxSpeed / speed;
      obj.velocityX *= ratio;
      obj.velocityY *= ratio;
    }
  }

  /**
   * Calculates distance between two objects
   * 
   * @param {Object} obj1 - First object
   * @param {Object} obj2 - Second object
   * @returns {number} Distance between objects
   */
  distanceBetween(obj1, obj2) {
    const dx = obj2.x - obj1.x;
    const dy = obj2.y - obj1.y;
    return Math.sqrt(dx * dx + dy * dy);
  }

  /**
   * Calculates angle between two objects
   * 
   * @param {Object} from - Source object
   * @param {Object} to - Target object
   * @returns {number} Angle in radians
   */
  angleBetween(from, to) {
    return Math.atan2(to.y - from.y, to.x - from.x);
  }
}

export default {
  MotionController,
  TERMINAL_ASPECT_RATIO
};
