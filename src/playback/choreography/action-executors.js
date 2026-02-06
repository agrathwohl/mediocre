/**
 * Action Executors Module
 * 
 * Executes choreography actions for timeline events.
 * Supports spawn, move, transform, destroy, visual, formation, 
 * audio-map, and background action types.
 * 
 * @module playback/choreography/action-executors
 * 
 * @example
 * import { ActionExecutor } from './action-executors.js';
 * import { TemplateResolver } from './template-resolver.js';
 * 
 * const executor = new ActionExecutor(templateResolver, renderManager);
 * 
 * // Execute spawn action
 * executor.executeSpawn(action, objectPool, activeObjects, audioData);
 * 
 * // Execute move action
 * executor.executeMove(action, objectPool, activeObjects);
 */

import { SCREEN_RESOLUTION } from './template-resolver.js';
import chalk from 'chalk';
import fs from 'fs';

/**
 * Default screen resolution for coordinate scaling
 * @type {Object}
 */
const DEFAULT_RESOLUTION = SCREEN_RESOLUTION || { width: 1920, height: 1080 };

/**
 * Debug log file path
 */
const DEBUG_LOG_FILE = '/tmp/play-choreography-debug.log';

/**
 * ActionExecutor class for executing choreography actions
 */
export class ActionExecutor {
  /**
   * Creates a new ActionExecutor instance
   * @param {TemplateResolver} templateResolver - Template resolver for lookups
   * @param {RenderManager} [renderManager=null] - Optional render manager for background updates
   */
  constructor(templateResolver, renderManager = null) {
    this.templateResolver = templateResolver;
    this.renderManager = renderManager;
    this.debugLogged = false;
    
    // Clear debug log
    try {
      fs.writeFileSync(DEBUG_LOG_FILE, `Debug log started at ${new Date().toISOString()}\n\n`);
    } catch (e) {
      // Ignore write errors
    }
    
    // Cache terminal dimensions
    this.termCols = process.stdout.columns || 80;
    this.termRows = process.stdout.rows || 24;
  }

  /**
   * Updates cached terminal dimensions
   * Call when terminal is resized
   */
  updateTerminalDimensions() {
    this.termCols = process.stdout.columns || 80;
    this.termRows = process.stdout.rows || 24;
  }

  /**
   * Dispatches action execution based on action type
   * 
   * @param {Object} action - Action configuration
   * @param {ObjectPool} objectPool - Object pool for managing objects
   * @param {Map} activeObjects - Map of choreography ID to active objects
   * @param {Object} audioData - Audio analysis data { amplitude, velocity }
   */
  executeAction(action, objectPool, activeObjects, audioData) {
    if (!action || !action.type) {
      return;
    }

    switch (action.type) {
      case 'spawn':
        this.executeSpawn(action, objectPool, activeObjects, audioData);
        break;
      case 'move':
        this.executeMove(action, objectPool, activeObjects);
        break;
      case 'transform':
        this.executeTransform(action, objectPool, activeObjects);
        break;
      case 'destroy':
        this.executeDestroy(action, objectPool, activeObjects);
        break;
      case 'visual':
        this.executeVisual(action, objectPool, activeObjects);
        break;
      case 'formation':
        this.executeFormation(action, objectPool, activeObjects);
        break;
      case 'audio-map':
        this.executeAudioMap(action, objectPool, activeObjects, audioData);
        break;
      case 'background':
        this.executeBackground(action);
        break;
      default:
        console.warn(`Unknown action type: ${action.type}`);
    }
  }

  /**
   * Gets target objects based on target specification
   * 
   * @param {string} targetId - Target ID ('all' or choreography object ID)
   * @param {ObjectPool} objectPool - Object pool
   * @param {Map} activeObjects - Active objects map
   * @returns {Array} Array of target objects
   */
  getTargets(targetId, objectPool, activeObjects) {
    if (targetId === 'all') {
      return objectPool.getAllObjects();
    } else if (activeObjects.has(targetId)) {
      const obj = activeObjects.get(targetId);
      return obj ? [obj] : [];
    }
    return [];
  }

  /**
   * Executes a spawn action - creates a new object
   * 
   * @param {Object} action - Spawn action configuration
   * @param {ObjectPool} objectPool - Object pool
   * @param {Map} activeObjects - Active objects map
   * @param {Object} audioData - Audio analysis data
   */
  executeSpawn(action, objectPool, activeObjects, audioData) {
    if (!action.template) {
      console.warn('Spawn action missing template');
      return;
    }

    const template = this.templateResolver.getTemplate(action.template);
    const artObj = this.templateResolver.convertShapeToArt(template.shape);
    const { amplitude = 0, velocity = 0 } = audioData || {};

    // Determine position
    let x = 0, y = 0;
    if (action.position) {
      // Read terminal dimensions fresh (don't use cached values)
      const termCols = process.stdout.columns || 80;
      const termRows = process.stdout.rows || 24;
      const termCenterX = termCols / 2;
      const termCenterY = termRows / 2;

      // Handle x coordinate with scaling and centering
      if (action.position.x === 'random') {
        x = Math.random() * (termCols - 10);
      } else if (action.position.x === 'center') {
        x = termCenterX;
      } else if (typeof action.position.x === 'number') {
        // Scale from 1920-based pixel coordinate to terminal columns
        const scaledX = (action.position.x / DEFAULT_RESOLUTION.width) * termCols;
        // Calculate centroid offset to center the choreography
        const centroidScaledX = (this.templateResolver.centroid.x / DEFAULT_RESOLUTION.width) * termCols;
        const offsetX = termCenterX - centroidScaledX;
        x = scaledX + offsetX;
        
        // Debug: Log first spawn calculation to file
        if (!this.debugLogged) {
          const debugInfo = `DEBUG: position.x=${action.position.x}, scaledX=${scaledX.toFixed(2)}, centroid.x=${this.templateResolver.centroid.x}, centroidScaledX=${centroidScaledX.toFixed(2)}, termCenterX=${termCenterX}, offsetX=${offsetX.toFixed(2)}, finalX=${x.toFixed(2)}\n`;
          try {
            fs.appendFileSync(DEBUG_LOG_FILE, debugInfo);
          } catch (e) {}
          this.debugLogged = true;
        }
      } else {
        x = action.position.x;
      }

      // Handle y coordinate with scaling and centering
      if (action.position.y === 'random') {
        y = Math.random() * (termRows - 10);
      } else if (action.position.y === 'center') {
        y = termCenterY;
      } else if (typeof action.position.y === 'number') {
        // Scale from 1080-based pixel coordinate to terminal rows
        const scaledY = (action.position.y / DEFAULT_RESOLUTION.height) * termRows;
        const centroidScaledY = (this.templateResolver.centroid.y / DEFAULT_RESOLUTION.height) * termRows;
        const offsetY = termCenterY - centroidScaledY;
        y = scaledY + offsetY;
      } else {
        y = action.position.y;
      }
    }

    // Add object to pool
    const id = objectPool.addObject({
      art: artObj.art,
      x,
      y,
      scale: template.defaultScale || 1,
      rotation: 0,
      amplitude,
      velocity,
      template
    });

    // Track the spawned object
    const newObj = objectPool.getObject(id);
    if (action.objectId && newObj) {
      activeObjects.set(action.objectId, newObj);
      newObj.choreographyId = action.objectId;
    }
  }

  /**
   * Executes a move action - updates object motion
   * 
   * @param {Object} action - Move action configuration
   * @param {ObjectPool} objectPool - Object pool
   * @param {Map} activeObjects - Active objects map
   */
  executeMove(action, objectPool, activeObjects) {
    // Support objectId as alternative to target
    const targetId = action.target || action.objectId;
    const targets = this.getTargets(targetId, objectPool, activeObjects);

    if (targets.length === 0) {
      return;
    }

    // Simple "to" coordinate movement
    if (action.to) {
      const duration = (action.duration || 1) * 1000; // ms

      for (const obj of targets) {
        // Scale from 1920x1080 to terminal
        const targetX = (action.to.x / DEFAULT_RESOLUTION.width) * this.termCols;
        const targetY = (action.to.y / DEFAULT_RESOLUTION.height) * this.termRows;

        // Calculate velocity to reach target
        const deltaX = targetX - obj.x;
        const deltaY = targetY - obj.y;
        const framesNeeded = duration / (1000 / 30); // 30 FPS

        obj.velocityX = deltaX / framesNeeded;
        obj.velocityY = deltaY / framesNeeded;

        obj.moveAnimation = {
          targetX,
          targetY,
          startTime: Date.now(),
          duration
        };
      }
      return;
    }

    // Alternative schema fallback: movement preset or velocity
    if (!action.movement) {
      return;
    }

    for (const obj of targets) {
      if (action.movement.preset) {
        const preset = this.templateResolver.getMovementPreset(action.movement.preset);
        if (preset && preset.type === 'linear') {
          const speed = preset.parameters?.speed || 0.5;
          obj.velocityX = (Math.random() - 0.5) * speed * 10;
          obj.velocityY = (Math.random() - 0.5) * speed * 10;
        } else if (preset && preset.type === 'circular') {
          obj.circularMotion = {
            radius: preset.parameters?.radius || 10,
            speed: preset.parameters?.speed || 1,
            angle: 0
          };
        }
      } else if (action.movement.velocity) {
        obj.velocityX = action.movement.velocity.x || 0;
        obj.velocityY = action.movement.velocity.y || 0;
        if (action.movement.acceleration) {
          obj.accelerationX = action.movement.acceleration.x || 0;
          obj.accelerationY = action.movement.acceleration.y || 0;
        }
      } else if (action.movement.path) {
        const path = action.movement.path;
        if (path && path.length > 0) {
          obj.pathAnimation = {
            points: path,
            startTime: Date.now(),
            currentIndex: 0,
            totalDuration: path[path.length - 1]?.time || 1
          };
        }
      }
    }
  }

  /**
   * Executes a transform action - applies visual transformations
   * 
   * @param {Object} action - Transform action configuration
   * @param {ObjectPool} objectPool - Object pool
   * @param {Map} activeObjects - Active objects map
   */
  executeTransform(action, objectPool, activeObjects) {
    // Support objectId as alternative to target
    const targetId = action.target || action.objectId;
    const targets = this.getTargets(targetId, objectPool, activeObjects);

    if (targets.length === 0) {
      return;
    }

    // Direct scale/rotation/alpha properties
    if (action.scale !== undefined || action.rotation !== undefined || action.alpha !== undefined) {
      for (const obj of targets) {
        if (action.scale !== undefined) {
          obj.scale = action.scale;
        }
        if (action.rotation !== undefined) {
          obj.rotation = (action.rotation * Math.PI) / 180; // degrees to radians
        }
        if (action.alpha !== undefined) {
          obj.alpha = action.alpha;
        }
      }
      return;
    }

    // Alternative schema fallback: effect string
    if (!action.effect) {
      return;
    }

    // Apply transformation type to each target
    for (const obj of targets) {
      this.applyTransformationType(obj, action.effect);
    }
  }

  /**
   * Applies a transformation type to an object
   * 
   * @param {Object} obj - Object to transform
   * @param {string} effect - Effect name
   */
  applyTransformationType(obj, effect) {
    switch (effect) {
      case 'explode':
        obj.exploding = true;
        obj.transformation = 'explode';
        obj.transformProgress = 0;
        break;
      case 'melt':
        obj.melting = true;
        obj.transformation = 'melt';
        obj.transformProgress = 0;
        break;
      case 'glitch':
        obj.glitching = true;
        obj.transformation = 'glitch';
        break;
      case 'shatter':
        obj.shattered = true;
        obj.transformation = 'shatter';
        break;
      case 'pixelate':
        obj.pixelated = true;
        obj.transformation = 'pixelate';
        break;
      case 'rainbow':
        obj.rainbow = true;
        break;
      case 'invert':
        obj.inverted = !obj.inverted;
        break;
      case 'multiply':
        obj.willMultiply = true;
        break;
      case 'pulse':
        obj.pulsePhase = 0;
        break;
      default:
        // Unknown transformation, ignore
        break;
    }
  }

  /**
   * Executes a destroy action - removes objects
   * 
   * @param {Object} action - Destroy action configuration
   * @param {ObjectPool} objectPool - Object pool
   * @param {Map} activeObjects - Active objects map
   */
  executeDestroy(action, objectPool, activeObjects) {
    if (action.target === 'all') {
      // Remove all objects
      const allObjects = objectPool.getAllObjects();
      for (const obj of allObjects) {
        if (obj.choreographyId) {
          activeObjects.delete(obj.choreographyId);
        }
      }
      objectPool.clear();
    } else if (activeObjects.has(action.target)) {
      const obj = activeObjects.get(action.target);
      if (obj && obj.id !== undefined) {
        objectPool.removeObject(obj.id);
      }
      activeObjects.delete(action.target);
    }
  }

  /**
   * Executes a visual action - updates visual properties
   * 
   * @param {Object} action - Visual action configuration
   * @param {ObjectPool} objectPool - Object pool
   * @param {Map} activeObjects - Active objects map
   */
  executeVisual(action, objectPool, activeObjects) {
    // Support objectId as alternative to target
    const targetId = action.target || action.objectId;
    const targets = this.getTargets(targetId, objectPool, activeObjects);

    if (targets.length === 0) {
      return;
    }

    // Flat color/alpha properties
    if (action.color || action.alpha !== undefined) {
      for (const obj of targets) {
        if (action.color) {
          obj.color = action.color;
        }
        if (action.alpha !== undefined) {
          obj.alpha = action.alpha;
        }
      }
      return;
    }

    // Alternative schema fallback: changes object
    if (action.changes) {
      for (const obj of targets) {
        if (action.changes.color) {
          obj.color = action.changes.color;
        }
        if (action.changes.scale !== undefined) {
          obj.scale = action.changes.scale;
        }
        if (action.changes.rotation !== undefined) {
          obj.rotation = (action.changes.rotation * Math.PI) / 180;
        }
        if (action.changes.opacity !== undefined) {
          obj.alpha = action.changes.opacity;
        }
      }
    }
  }

  /**
   * Executes a formation action - arranges objects in patterns
   * (Stub implementation - can be expanded based on needs)
   * 
   * @param {Object} action - Formation action configuration
   * @param {ObjectPool} objectPool - Object pool
   * @param {Map} activeObjects - Active objects map
   */
  executeFormation(action, objectPool, activeObjects) {
    // Implementation for formation patterns
    // This would arrange objects in specified patterns (grid, circle, line, etc.)
    // Placeholder for future implementation
  }

  /**
   * Executes an audio-map action - links audio to visual properties
   * (Stub implementation - can be expanded based on needs)
   * 
   * @param {Object} action - Audio-map action configuration
   * @param {ObjectPool} objectPool - Object pool
   * @param {Map} activeObjects - Active objects map
   * @param {Object} audioData - Audio analysis data
   */
  executeAudioMap(action, objectPool, activeObjects, audioData) {
    // Implementation for audio mapping
    // This would link audio properties to visual properties
    // Example: scale linked to amplitude, color linked to frequency
    // Placeholder for future implementation
  }

  /**
   * Executes a background action - updates background settings
   * 
   * @param {Object} action - Background action configuration
   */
  executeBackground(action) {
    if (!this.renderManager || !this.renderManager.backgroundManager) {
      return; // No render manager available
    }

    // Extract background configuration from action
    const mode = action.mode || this.renderManager.backgroundManager.currentMode;

    // Extract mode-specific config
    let config = {};
    if (mode === 'static' && action.static) {
      config = { ...action.static };
    } else if (mode === 'audio-reactive' && action.audioReactive) {
      config = { ...action.audioReactive };
    } else if (mode === 'content' && action.content) {
      config = { ...action.content };
    }

    // Get transition settings
    const transition = action.transition || { duration: 0.5, easing: 'ease-in-out' };

    // Update background through RenderManager's BackgroundManager
    this.renderManager.backgroundManager.updateBackground(mode, config, transition);
  }
}

export default {
  ActionExecutor
};
