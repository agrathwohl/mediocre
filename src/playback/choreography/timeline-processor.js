/**
 * Timeline Processor Module
 * 
 * Processes choreography timeline events and background events,
 * evaluating triggers and executing actions at the appropriate times.
 * 
 * @module playback/choreography/timeline-processor
 * 
 * @example
 * import { TimelineProcessor } from './timeline-processor.js';
 * 
 * const processor = new TimelineProcessor(timeline, backgroundEvents);
 * 
 * // Process timeline events
 * processor.processTimeline(
 *   currentTime,
 *   triggerEvaluator,
 *   actionExecutor,
 *   transformManager
 * );
 * 
 * // Process background events
 * processor.processBackgroundEvents(
 *   currentTime,
 *   backgroundExecutor
 * );
 */

/**
 * TimelineProcessor class for processing choreography events
 */
export class TimelineProcessor {
  /**
   * Creates a new TimelineProcessor instance
   * @param {Array} timeline - Array of timeline events
   * @param {Array} [backgroundEvents=[]] - Array of background events
   */
  constructor(timeline, backgroundEvents = []) {
    this.timeline = timeline || [];
    this.backgroundEvents = backgroundEvents || [];
    
    // Track executed events to avoid duplicates
    this.executedEvents = new Set();
    this.executedBackgroundEvents = new Set();
    
    // Track active objects by choreography ID
    this.activeObjects = new Map();
    
    // Indices for efficient event processing
    this.timelineIndex = 0;
    this.backgroundIndex = 0;
  }

  /**
   * Processes timeline events for the current time
   * Iterates through timeline and executes events whose triggers have fired
   * 
   * @param {number} currentTime - Current elapsed time in seconds
   * @param {TriggerEvaluator} triggerEvaluator - Trigger evaluator instance
   * @param {ActionExecutor} actionExecutor - Action executor instance
   * @param {ObjectPool} objectPool - Object pool for managing objects
   * @param {Object} audioData - Audio analysis data { amplitude, velocity }
   * @returns {Object} Processing result { executedCount, events }
   */
  processTimeline(currentTime, triggerEvaluator, actionExecutor, objectPool, audioData = {}) {
    const { amplitude = 0, velocity = 0 } = audioData;
    let executedCount = 0;
    const executedEvents = [];

    // Process all events that should trigger by current time
    for (let i = this.timelineIndex; i < this.timeline.length; i++) {
      const event = this.timeline[i];
      const eventId = `event_${i}`;

      // Check if this event has already been executed
      if (this.executedEvents.has(eventId)) {
        continue;
      }

      // Check trigger conditions
      const shouldTrigger = triggerEvaluator.checkTrigger(
        event.trigger,
        currentTime,
        amplitude,
        velocity
      );

      if (shouldTrigger) {
        // Execute all actions for this event
        if (event.actions) {
          for (const action of event.actions) {
            actionExecutor.executeAction(
              action,
              objectPool,
              this.activeObjects,
              audioData
            );
          }
        }

        // Mark as executed (unless it's a loop trigger with infinite count)
        if (event.trigger?.type !== 'loop' || event.trigger?.count !== -1) {
          this.executedEvents.add(eventId);
        }

        executedCount++;
        executedEvents.push({
          index: i,
          type: event.trigger?.type,
          label: event.label
        });

        // Update timeline index for time-based events (optimization)
        if (event.trigger?.type === 'time') {
          this.timelineIndex = i + 1;
        }
      } else if (
        event.trigger?.type === 'time' &&
        event.trigger?.at > currentTime
      ) {
        // Stop checking future time-based events (optimization)
        break;
      }
    }

    return { executedCount, events: executedEvents };
  }

  /**
   * Processes background events for the current time
   * Background events only support time triggers
   * 
   * @param {number} currentTime - Current elapsed time in seconds
   * @param {Function} backgroundExecutor - Function to execute background actions
   * @returns {Object} Processing result { executedCount, events }
   */
  processBackgroundEvents(currentTime, backgroundExecutor) {
    let executedCount = 0;
    const executedEvents = [];

    // Process all background events that should trigger by current time
    for (let i = this.backgroundIndex; i < this.backgroundEvents.length; i++) {
      const event = this.backgroundEvents[i];
      const eventId = `bg_event_${i}`;

      // Check if this event has already been executed
      if (this.executedBackgroundEvents.has(eventId)) {
        continue;
      }

      // Background events only use time triggers
      if (event.trigger?.type === 'time' && currentTime >= event.trigger.at) {
        // Execute all background actions for this event
        if (event.actions) {
          for (const action of event.actions) {
            backgroundExecutor(action);
          }
        }

        // Mark as executed
        this.executedBackgroundEvents.add(eventId);
        this.backgroundIndex = i + 1;

        executedCount++;
        executedEvents.push({
          index: i,
          label: event.label
        });
      } else if (event.trigger?.type === 'time' && event.trigger.at > currentTime) {
        // Stop checking future time-based events
        break;
      }
    }

    return { executedCount, events: executedEvents };
  }

  /**
   * Resets the processor, clearing all executed event tracking
   * Useful for restarting choreography playback
   */
  reset() {
    this.executedEvents.clear();
    this.executedBackgroundEvents.clear();
    this.activeObjects.clear();
    this.timelineIndex = 0;
    this.backgroundIndex = 0;
  }

  /**
   * Registers an active object with a choreography ID
   * Allows actions to reference objects by ID
   * 
   * @param {string} choreographyId - Choreography object ID
   * @param {Object} obj - Object from the pool
   */
  registerActiveObject(choreographyId, obj) {
    this.activeObjects.set(choreographyId, obj);
    if (obj) {
      obj.choreographyId = choreographyId;
    }
  }

  /**
   * Unregisters an active object
   * 
   * @param {string} choreographyId - Choreography object ID to remove
   */
  unregisterActiveObject(choreographyId) {
    const obj = this.activeObjects.get(choreographyId);
    if (obj) {
      delete obj.choreographyId;
    }
    this.activeObjects.delete(choreographyId);
  }

  /**
   * Gets an active object by choreography ID
   * 
   * @param {string} choreographyId - Object ID
   * @returns {Object|undefined} Active object or undefined
   */
  getActiveObject(choreographyId) {
    return this.activeObjects.get(choreographyId);
  }

  /**
   * Gets all active objects
   * 
   * @returns {Map<string, Object>} Map of choreography ID to object
   */
  getAllActiveObjects() {
    return this.activeObjects;
  }

  /**
   * Clears all active object references
   * Does not affect the actual objects in the pool
   */
  clearActiveObjects() {
    this.activeObjects.forEach((obj) => {
      if (obj) {
        delete obj.choreographyId;
      }
    });
    this.activeObjects.clear();
  }

  /**
   * Gets the next upcoming timeline event
   * 
   * @param {number} currentTime - Current time
   * @returns {Object|null} Next event or null if none
   */
  getNextEvent(currentTime) {
    for (const event of this.timeline) {
      if (event.trigger?.type === 'time' && event.trigger?.at > currentTime) {
        if (!this.executedEvents.has(`event_${this.timeline.indexOf(event)}`)) {
          return event;
        }
      }
    }
    return null;
  }

  /**
   * Gets the time until the next event
   * 
   * @param {number} currentTime - Current time
   * @returns {number|null} Time until next event in seconds, or null
   */
  getTimeUntilNextEvent(currentTime) {
    const nextEvent = this.getNextEvent(currentTime);
    if (nextEvent?.trigger?.type === 'time') {
      return nextEvent.trigger.at - currentTime;
    }
    return null;
  }

  /**
   * Gets processing statistics
   * 
   * @returns {Object} Statistics
   * @property {number} totalTimelineEvents - Total timeline events
   * @property {number} totalBackgroundEvents - Total background events
   * @property {number} executedTimelineEvents - Number executed
   * @property {number} executedBackgroundEvents - Number executed
   * @property {number} activeObjects - Number of tracked active objects
   * @property {number} timelineProgress - Progress through timeline (0-1)
   * @property {number} backgroundProgress - Progress through background events (0-1)
   */
  getStats() {
    return {
      totalTimelineEvents: this.timeline.length,
      totalBackgroundEvents: this.backgroundEvents.length,
      executedTimelineEvents: this.executedEvents.size,
      executedBackgroundEvents: this.executedBackgroundEvents.size,
      activeObjects: this.activeObjects.size,
      timelineProgress: this.timeline.length > 0 ? this.timelineIndex / this.timeline.length : 0,
      backgroundProgress: this.backgroundEvents.length > 0 ? this.backgroundIndex / this.backgroundEvents.length : 0
    };
  }

  /**
   * Skips to a specific time in the choreography
   * Marks all events before that time as executed
   * 
   * @param {number} targetTime - Time to skip to
   */
  skipToTime(targetTime) {
    // Mark all timeline events before targetTime as executed
    for (let i = 0; i < this.timeline.length; i++) {
      const event = this.timeline[i];
      if (event.trigger?.type === 'time' && event.trigger?.at <= targetTime) {
        this.executedEvents.add(`event_${i}`);
        this.timelineIndex = i + 1;
      }
    }

    // Mark all background events before targetTime as executed
    for (let i = 0; i < this.backgroundEvents.length; i++) {
      const event = this.backgroundEvents[i];
      if (event.trigger?.type === 'time' && event.trigger?.at <= targetTime) {
        this.executedBackgroundEvents.add(`bg_event_${i}`);
        this.backgroundIndex = i + 1;
      }
    }
  }

  /**
   * Updates the timeline and background events
   * Useful for loading new choreography data
   * 
   * @param {Array} timeline - New timeline array
   * @param {Array} [backgroundEvents] - New background events array
   */
  updateEvents(timeline, backgroundEvents) {
    this.timeline = timeline || [];
    if (backgroundEvents !== undefined) {
      this.backgroundEvents = backgroundEvents || [];
    }
    this.reset();
  }
}

export default {
  TimelineProcessor
};
