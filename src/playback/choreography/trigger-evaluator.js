/**
 * Trigger Evaluator Module
 * 
 * Evaluates trigger conditions for choreography events:
 * - Time triggers (at specific timestamps)
 * - Beat triggers (on musical beats)
 * - Audio triggers (based on audio features)
 * - Loop triggers (repeating intervals)
 * 
 * @module playback/choreography/trigger-evaluator
 * 
 * @example
 * import { TriggerEvaluator } from './trigger-evaluator.js';
 * 
 * const evaluator = new TriggerEvaluator({ bpm: 120 });
 * 
 * // Check time trigger
 * const shouldTrigger = evaluator.checkTrigger(
 *   { type: 'time', at: 10.5 },
 *   currentTime,
 *   amplitude,
 *   velocity
 * );
 */

/**
 * Default BPM if not specified
 * @type {number}
 */
export const DEFAULT_BPM = 120;

/**
 * Beats per measure (assuming 4/4 time)
 * @type {number}
 */
export const BEATS_PER_MEASURE = 4;

/**
 * Trigger types
 * @type {string[]}
 */
export const TRIGGER_TYPES = ['time', 'beat', 'audio', 'loop'];

/**
 * Audio condition operators
 * @type {string[]}
 */
export const AUDIO_OPERATORS = ['>', '<', '==', 'spike', 'drop'];

/**
 * TriggerEvaluator class for evaluating trigger conditions
 */
export class TriggerEvaluator {
  /**
   * Creates a new TriggerEvaluator instance
   * @param {Object} [metadata={}] - Choreography metadata (BPM, etc.)
   * @param {number} [metadata.bpm] - Beats per minute
   */
  constructor(metadata = {}) {
    this.metadata = metadata;
    this.bpm = metadata.bpm || DEFAULT_BPM;
    this.beatsPerSecond = this.bpm / 60;
    this.executedLoops = new Set();
  }

  /**
   * Checks if a trigger condition is met
   * @param {Object} trigger - Trigger configuration
   * @param {number} currentTime - Current elapsed time
   * @param {number} [amplitude=0] - Audio amplitude
   * @param {number} [velocity=0] - Audio velocity/onset
   * @returns {boolean} True if trigger should fire
   */
  checkTrigger(trigger, currentTime, amplitude = 0, velocity = 0) {
    if (!trigger || !trigger.type) {
      return false;
    }

    switch (trigger.type) {
      case 'time':
        return this.evaluateTimeTrigger(trigger, currentTime);
      case 'beat':
        return this.evaluateBeatTrigger(trigger, currentTime);
      case 'audio':
        return this.evaluateAudioTrigger(trigger, amplitude, velocity);
      case 'loop':
        return this.evaluateLoopTrigger(trigger, currentTime);
      default:
        return false;
    }
  }

  /**
   * Evaluates a time-based trigger
   * @param {Object} trigger - Trigger with 'at' property
   * @param {number} currentTime - Current time
   * @returns {boolean} True if currentTime >= trigger.at
   */
  evaluateTimeTrigger(trigger, currentTime) {
    return currentTime >= (trigger.at || 0);
  }

  /**
   * Evaluates a beat-based trigger
   * @param {Object} trigger - Trigger with measure and beat
   * @param {number} currentTime - Current time
   * @returns {boolean} True if beat time reached
   */
  evaluateBeatTrigger(trigger, currentTime) {
    const measure = Math.max(1, trigger.measure || 1);
    const beat = Math.max(1, trigger.beat || 1);

    // Calculate time for this beat
    // Time = (measures before * beats per measure + beats before) / beats per second
    const beatsBefore = (measure - 1) * BEATS_PER_MEASURE + (beat - 1);
    const beatTime = beatsBefore / this.beatsPerSecond;

    return currentTime >= beatTime;
  }

  /**
   * Evaluates an audio-based trigger
   * @param {Object} trigger - Trigger with condition
   * @param {number} amplitude - Audio amplitude (0-1)
   * @param {number} velocity - Audio velocity (0-1)
   * @returns {boolean} True if audio condition met
   */
  evaluateAudioTrigger(trigger, amplitude, velocity) {
    if (!trigger.condition) {
      return false;
    }

    const { parameter, operator, value } = trigger.condition;
    let paramValue = 0;

    // Get parameter value
    if (parameter === 'amplitude') {
      paramValue = amplitude;
    } else if (parameter === 'velocity') {
      paramValue = velocity;
    } else {
      return false;
    }

    // Evaluate operator
    switch (operator) {
      case '>':
        return paramValue > value;
      case '<':
        return paramValue < value;
      case '>=':
        return paramValue >= value;
      case '<=':
        return paramValue <= value;
      case '==':
        if (Number.isNaN(paramValue) || Number.isNaN(value)) return false;
        return Math.abs(paramValue - value) < 0.01;
      case 'spike':
        // Spike: high velocity and moderate amplitude
        return velocity > value && amplitude > 0.3;
      case 'drop':
        // Drop: negative velocity and low amplitude
        return velocity < -value && amplitude < 0.3;
      default:
        return false;
    }
  }

  /**
   * Evaluates a loop trigger
   * @param {Object} trigger - Trigger with 'every' property
   * @param {number} currentTime - Current time
   * @returns {boolean} True if loop interval reached
   */
  evaluateLoopTrigger(trigger, currentTime) {
    const interval = trigger.every || 1;
    const loopTime = Math.floor(currentTime / interval) * interval;
    const loopId = `loop_${interval}_${loopTime}`;

    // Check if this loop iteration was already executed
    if (!this.executedLoops.has(loopId)) {
      this.executedLoops.add(loopId);
      return true;
    }

    return false;
  }

  /**
   * Resets loop execution tracking
   */
  resetLoops() {
    this.executedLoops.clear();
  }

  /**
   * Gets the beat time for a specific measure and beat
   * @param {number} measure - Measure number (1-based)
   * @param {number} beat - Beat number (1-based)
   * @returns {number} Time in seconds
   */
  getBeatTime(measure, beat) {
    const beatsBefore = (measure - 1) * BEATS_PER_MEASURE + (beat - 1);
    return beatsBefore / this.beatsPerSecond;
  }

  /**
   * Gets current beat information
   * @param {number} currentTime - Current time
   * @returns {Object} { measure, beat, beatProgress }
   */
  getCurrentBeat(currentTime) {
    const totalBeats = currentTime * this.beatsPerSecond;
    const measure = Math.floor(totalBeats / BEATS_PER_MEASURE) + 1;
    const beat = Math.floor(totalBeats % BEATS_PER_MEASURE) + 1;
    const beatProgress = totalBeats % 1;

    return { measure, beat, beatProgress };
  }

  /**
   * Updates BPM
   * @param {number} bpm - New BPM
   */
  updateBpm(bpm) {
    this.bpm = bpm;
    this.beatsPerSecond = bpm / 60;
  }

  /**
   * Gets current BPM
   * @returns {number} Current BPM
   */
  getBpm() {
    return this.bpm;
  }

  /**
   * Validates a trigger configuration
   * @param {Object} trigger - Trigger to validate
   * @returns {Object} { valid, error }
   */
  validateTrigger(trigger) {
    if (!trigger) {
      return { valid: false, error: 'Trigger is null or undefined' };
    }

    if (!trigger.type) {
      return { valid: false, error: 'Trigger missing type property' };
    }

    if (!TRIGGER_TYPES.includes(trigger.type)) {
      return { valid: false, error: `Unknown trigger type: ${trigger.type}` };
    }

    // Type-specific validation
    switch (trigger.type) {
      case 'time':
        if (trigger.at === undefined) {
          return { valid: false, error: 'Time trigger missing "at" property' };
        }
        break;
      case 'beat':
        if (trigger.measure === undefined && trigger.beat === undefined) {
          return { valid: false, error: 'Beat trigger missing measure or beat' };
        }
        break;
      case 'audio':
        if (!trigger.condition) {
          return { valid: false, error: 'Audio trigger missing condition' };
        }
        if (!AUDIO_OPERATORS.includes(trigger.condition.operator)) {
          return { valid: false, error: `Unknown operator: ${trigger.condition.operator}` };
        }
        break;
      case 'loop':
        if (trigger.every === undefined) {
          return { valid: false, error: 'Loop trigger missing "every" property' };
        }
        break;
    }

    return { valid: true, error: null };
  }

  /**
   * Gets next trigger time for a trigger
   * @param {Object} trigger - Trigger configuration
   * @param {number} currentTime - Current time
   * @returns {number|null} Next trigger time or null
   */
  getNextTriggerTime(trigger, currentTime) {
    switch (trigger.type) {
      case 'time':
        return trigger.at > currentTime ? trigger.at : null;
      case 'beat':
        const beatTime = this.getBeatTime(
          trigger.measure || 1,
          trigger.beat || 1
        );
        return beatTime > currentTime ? beatTime : null;
      case 'loop':
        const interval = trigger.every || 1;
        const nextLoop = Math.ceil(currentTime / interval) * interval;
        return nextLoop;
      default:
        return null;
    }
  }
}

export default {
  TriggerEvaluator,
  DEFAULT_BPM,
  BEATS_PER_MEASURE,
  TRIGGER_TYPES,
  AUDIO_OPERATORS,
};
