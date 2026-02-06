/**
 * Choreography Manager Module
 * 
 * Main coordinator for choreography playback. Manages timeline processing,
 * background events, object lifecycle, and integrates with all other
 * playback modules.
 * 
 * @module playback/choreography/choreography-manager
 * 
 * @example
 * import { ChoreographyManager } from './choreography-manager.js';
 * 
 * const manager = new ChoreographyManager(choreographyData, renderManager);
 * 
 * // Update each frame
 * manager.update(currentTime, amplitude, velocity);
 * 
 * // Get active objects for rendering
 * const objects = manager.getObjects();
 */

import { TemplateResolver } from './template-resolver.js';
import { TriggerEvaluator } from './trigger-evaluator.js';
import { TimelineProcessor } from './timeline-processor.js';
import { ActionExecutor } from './action-executors.js';
import { ObjectPool } from '../core/object-pool.js';

/**
 * Default object pool capacity
 * @type {number}
 */
const DEFAULT_MAX_OBJECTS = 50;

/**
 * ChoreographyManager class - Main coordinator for choreography playback
 */
export class ChoreographyManager {
  /**
   * Creates a new ChoreographyManager instance
   * 
   * @param {Object} choreographyData - Complete choreography data
   * @param {Object} choreographyData.metadata - Metadata (bpm, fps, etc.)
   * @param {Object} choreographyData.templates - Object and movement templates
   * @param {Array} choreographyData.timeline - Timeline events
   * @param {Array} [choreographyData.backgroundEvents] - Background events
   * @param {Object} choreographyData.settings - Playback settings
   * @param {RenderManager} [renderManager=null] - Optional render manager for background
   * @param {number} [maxObjects=50] - Maximum number of objects
   */
  constructor(choreographyData, renderManager = null, maxObjects = DEFAULT_MAX_OBJECTS) {
    // Store choreography data
    this.data = choreographyData || {};
    this.metadata = this.data.metadata || {};
    this.settings = this.data.settings || {};
    this.tracks = this.data.tracks || [];

    // Initialize sub-modules
    this.templateResolver = new TemplateResolver(
      this.data.templates,
      this.metadata,
      this.data.timeline
    );

    this.triggerEvaluator = new TriggerEvaluator(this.metadata);

    this.timelineProcessor = new TimelineProcessor(
      this.data.timeline,
      this.data.backgroundEvents || []
    );

    this.actionExecutor = new ActionExecutor(
      this.templateResolver,
      renderManager
    );

    // Initialize object pool
    this.objectPool = new ObjectPool(maxObjects);

    // Store render manager reference
    this.renderManager = renderManager;

    // Playback state
    this.isPlaying = false;
    this.startTime = null;
    this.currentTime = 0;
    this.lastFrameTime = 0;

    // Statistics
    this.stats = {
      eventsExecuted: 0,
      objectsSpawned: 0,
      objectsDestroyed: 0
    };
  }

  /**
   * Starts choreography playback
   */
  start() {
    this.isPlaying = true;
    this.startTime = Date.now();
    this.lastFrameTime = this.startTime;
  }

  /**
   * Stops choreography playback
   */
  stop() {
    this.isPlaying = false;
    this.startTime = null;
  }

  /**
   * Pauses playback (maintains current state)
   */
  pause() {
    this.isPlaying = false;
  }

  /**
   * Resumes playback
   */
  resume() {
    if (this.startTime) {
      this.isPlaying = true;
      this.lastFrameTime = Date.now();
    }
  }

  /**
   * Main update method - call every frame
   * 
   * @param {number} [deltaTime] - Time since last frame (auto-calculated if not provided)
   * @param {Object} audioData - Audio analysis data { amplitude, velocity }
   * @returns {Object} Update result { objects, eventsExecuted, stats }
   */
  update(deltaTime, audioData = {}) {
    if (!this.isPlaying) {
      return this.getState();
    }

    const now = Date.now();
    
    // Calculate delta time and current time
    if (deltaTime === undefined) {
      deltaTime = (now - this.lastFrameTime) / 1000;
    }
    this.lastFrameTime = now;

    // Update current time
    if (this.startTime) {
      this.currentTime = (now - this.startTime) / 1000;
    }

    // Update object lifetimes
    this.objectPool.updateLifetimes(deltaTime);

    // Remove expired objects
    const expiredCount = this.objectPool.removeExpired(this.currentTime);
    if (expiredCount > 0) {
      this.stats.objectsDestroyed += expiredCount;
      this.cleanupActiveObjects();
    }

    // Update terminal dimensions (in case of resize)
    this.actionExecutor.updateTerminalDimensions();

    // Process timeline events
    const timelineResult = this.timelineProcessor.processTimeline(
      this.currentTime,
      this.triggerEvaluator,
      this.actionExecutor,
      this.objectPool,
      audioData
    );

    // Process background events
    const backgroundResult = this.timelineProcessor.processBackgroundEvents(
      this.currentTime,
      (action) => this.actionExecutor.executeBackground(action)
    );

    // Update statistics
    this.stats.eventsExecuted += timelineResult.executedCount + backgroundResult.executedCount;
    this.stats.objectsSpawned = this.objectPool.getObjectCount();

    return {
      objects: this.objectPool.getAllObjects(),
      eventsExecuted: timelineResult.executedCount + backgroundResult.executedCount,
      timelineEvents: timelineResult.events,
      backgroundEvents: backgroundResult.events,
      stats: { ...this.stats },
      currentTime: this.currentTime
    };
  }

  /**
   * Gets the current playback state
   * 
   * @returns {Object} Current state
   */
  getState() {
    return {
      isPlaying: this.isPlaying,
      currentTime: this.currentTime,
      objects: this.objectPool.getAllObjects(),
      stats: { ...this.stats },
      processorStats: this.timelineProcessor.getStats()
    };
  }

  /**
   * Gets all active objects for rendering
   * 
   * @returns {Array} Array of active objects
   */
  getObjects() {
    return this.objectPool.getAllObjects();
  }

  /**
   * Gets object count
   * 
   * @returns {number} Number of objects
   */
  getObjectCount() {
    return this.objectPool.getObjectCount();
  }

  /**
   * Skips to a specific time in the choreography
   * 
   * @param {number} targetTime - Time to skip to (in seconds)
   */
  skipTo(targetTime) {
    this.timelineProcessor.skipToTime(targetTime);
    this.currentTime = targetTime;
    if (this.startTime) {
      this.startTime = Date.now() - (targetTime * 1000);
    }
  }

  /**
   * Resets the choreography to initial state
   */
  reset() {
    this.stop();
    this.objectPool.clear();
    this.timelineProcessor.reset();
    this.triggerEvaluator.resetLoops();
    this.currentTime = 0;
    this.stats = {
      eventsExecuted: 0,
      objectsSpawned: 0,
      objectsDestroyed: 0
    };
  }

  /**
   * Cleans up active object references for objects that no longer exist
   */
  cleanupActiveObjects() {
    const activeObjects = this.timelineProcessor.getAllActiveObjects();
    const existingIds = new Set(
      this.objectPool.getAllObjects().map(obj => obj.id)
    );

    // Remove references to deleted objects
    for (const [choreographyId, obj] of activeObjects) {
      if (!existingIds.has(obj.id)) {
        this.timelineProcessor.unregisterActiveObject(choreographyId);
      }
    }
  }

  /**
   * Gets the next upcoming event
   * 
   * @returns {Object|null} Next event or null
   */
  getNextEvent() {
    return this.timelineProcessor.getNextEvent(this.currentTime);
  }

  /**
   * Gets time until next event
   * 
   * @returns {number|null} Time in seconds or null
   */
  getTimeUntilNextEvent() {
    return this.timelineProcessor.getTimeUntilNextEvent(this.currentTime);
  }

  /**
   * Gets comprehensive statistics
   * 
   * @returns {Object} Statistics
   */
  getStats() {
    return {
      playback: {
        isPlaying: this.isPlaying,
        currentTime: this.currentTime,
        duration: this.metadata.duration || 0
      },
      objects: this.objectPool.getStats(),
      events: this.timelineProcessor.getStats(),
      performance: { ...this.stats }
    };
  }

  /**
   * Updates choreography data (useful for live editing)
   * 
   * @param {Object} newData - New choreography data
   */
  updateChoreography(newData) {
    this.data = newData || {};
    this.metadata = this.data.metadata || {};
    this.settings = this.data.settings || {};

    // Update sub-modules
    this.templateResolver.updateTemplates(this.data.templates);
    this.triggerEvaluator.updateBpm(this.metadata.bpm || 120);
    this.timelineProcessor.updateEvents(
      this.data.timeline,
      this.data.backgroundEvents
    );
  }

  /**
   * Gets a template by name
   * 
   * @param {string} name - Template name
   * @returns {Object} Template
   */
  getTemplate(name) {
    return this.templateResolver.getTemplate(name);
  }

  /**
   * Gets all template names
   * 
   * @returns {Array} Template names
   */
  getTemplateNames() {
    return this.templateResolver.getTemplateNames();
  }

  /**
   * Gets movement preset names
   * 
   * @returns {Array} Preset names
   */
  getMovementPresetNames() {
    return this.templateResolver.getMovementPresetNames();
  }

  /**
   * Checks if choreography is at the end
   * 
   * @returns {boolean} True if at or past end
   */
  isAtEnd() {
    const duration = this.metadata.duration;
    if (!duration) return false;
    return this.currentTime >= duration;
  }

  /**
   * Gets progress through choreography (0-1)
   * 
   * @returns {number} Progress ratio
   */
  getProgress() {
    const duration = this.metadata.duration;
    if (!duration || duration === 0) return 0;
    return Math.min(1, Math.max(0, this.currentTime / duration));
  }
}

export default {
  ChoreographyManager,
  DEFAULT_MAX_OBJECTS
};
