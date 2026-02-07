/**
 * Template Resolver Module
 * 
 * Resolves templates and calculates positions for choreography.
 * Handles template lookups, movement presets, centroid calculation,
 * and shape-to-art conversion.
 * 
 * @module playback/choreography/template-resolver
 * 
 * @example
 * import { TemplateResolver } from './template-resolver.js';
 * 
 * const resolver = new TemplateResolver(choreographyData.templates);
 * 
 * // Get template
 * const template = resolver.getTemplate('dancer_01');
 * 
 * // Get movement preset
 * const movement = resolver.getMovementPreset('bounce');
 * 
 * // Resolve position
 * const position = resolver.resolvePosition({ x: 'center', y: 'top' }, 80, 24);
 */

import { SCREEN_RESOLUTION } from '../../utils/constants.js';

/**
 * Default template when none specified
 * @type {Object}
 */
export const DEFAULT_TEMPLATE = {
  name: "default",
  shape: "★",
  defaultScale: 1,
  color: null,
};

/**
 * Shape map for simple characters to ASCII art
 * @type {Object}
 */
export const SHAPE_MAP = {
  "★": { art: "  ★\n ★★★\n  ★", type: "small" },
  "♪": { art: " ♪\n╱|╲", type: "small" },
  "◆": { art: "  ◆\n ◆◆◆\n  ◆", type: "small" },
  "●": { art: "  ●\n ●●●\n  ●", type: "small" },
  "▲": { art: "  ▲\n ▲▲▲", type: "small" },
  "■": { art: " ■■■\n ■■■\n ■■■", type: "small" },
};

/**
 * TemplateResolver class for resolving templates and positions
 */
export class TemplateResolver {
  /**
   * Creates a new TemplateResolver instance
   * @param {Object} templates - Templates object with 'objects' and 'movements' keys
   * @param {Object} [metadata={}] - Choreography metadata
   * @param {Array} [timeline=[]] - Timeline events for centroid calculation
   */
  constructor(templates, metadata = {}, timeline = []) {
    this.templates = templates || {};
    this.metadata = metadata;
    this.timeline = timeline;
    
    // Calculate centroid for centering choreography
    this.centroid = this.calculateCentroid();
  }

  /**
   * Gets a template by name
   * @param {string} templateName - Name of the template
   * @returns {Object} Template configuration
   */
  getTemplate(templateName) {
    if (!this.templates.objects || !this.templates.objects[templateName]) {
      return { ...DEFAULT_TEMPLATE };
    }
    return this.templates.objects[templateName];
  }

  /**
   * Gets a movement preset by name
   * @param {string} presetName - Name of the preset
   * @returns {Object|null} Movement preset or null if not found
   */
  getMovementPreset(presetName) {
    if (!this.templates.movements || !this.templates.movements[presetName]) {
      return null;
    }
    return this.templates.movements[presetName];
  }

  /**
   * Converts a shape to ASCII art format
   * @param {string|Array} shape - Shape character or array of strings
   * @returns {Object} Art object { art, type }
   */
  convertShapeToArt(shape) {
    // If it's a simple character in the map, use it
    if (SHAPE_MAP[shape]) {
      return { ...SHAPE_MAP[shape] };
    }

    // Otherwise assume it's already formatted ASCII art
    return {
      art: Array.isArray(shape) ? shape.join("\n") : shape,
      type: "medium",
    };
  }

  /**
   * Calculates the centroid of all spawn positions from timeline events
   * Used for centering choreography in the terminal
   * @returns {Object} Centroid { x, y }
   */
  calculateCentroid() {
    const positions = [];

    // Collect all spawn positions from timeline events (not templates)
    if (this.timeline && Array.isArray(this.timeline)) {
      for (const event of this.timeline) {
        if (!event.actions) continue;
        for (const action of event.actions) {
          if (action.type === 'spawn' && action.position) {
            const x = typeof action.position.x === 'number' ? action.position.x : null;
            const y = typeof action.position.y === 'number' ? action.position.y : null;
            if (x !== null && y !== null) {
              positions.push({ x, y });
            }
          }
        }
      }
    }

    // Default to screen center
    if (positions.length === 0) {
      return {
        x: SCREEN_RESOLUTION.width / 2,
        y: SCREEN_RESOLUTION.height / 2,
      };
    }

    // Calculate average
    const sumX = positions.reduce((sum, pos) => sum + pos.x, 0);
    const sumY = positions.reduce((sum, pos) => sum + pos.y, 0);

    return {
      x: sumX / positions.length,
      y: sumY / positions.length,
    };
  }

  /**
   * Resolves a position specification to terminal coordinates
   * @param {Object} positionSpec - Position specification
   * @param {string|number} positionSpec.x - X position ('center', 'random', or number)
   * @param {string|number} positionSpec.y - Y position ('center', 'random', or number)
   * @param {number} termWidth - Terminal width
   * @param {number} termHeight - Terminal height
   * @returns {Object} Resolved position { x, y }
   */
  resolvePosition(positionSpec, termWidth, termHeight) {
    const result = { x: 0, y: 0 };

    // Handle X coordinate
    if (positionSpec.x === "random") {
      result.x = Math.random() * (termWidth - 10);
    } else if (positionSpec.x === "center") {
      result.x = termWidth / 2;
    } else if (typeof positionSpec.x === "number") {
      // Scale from screen resolution to terminal
      const scaledX = (positionSpec.x / SCREEN_RESOLUTION.width) * termWidth;
      const centroidScaledX =
        (this.centroid.x / SCREEN_RESOLUTION.width) * termWidth;
      const offsetX = termWidth / 2 - centroidScaledX;
      result.x = scaledX + offsetX;
    } else {
      result.x = positionSpec.x || 0;
    }

    // Handle Y coordinate
    if (positionSpec.y === "random") {
      result.y = Math.random() * (termHeight - 10);
    } else if (positionSpec.y === "center") {
      result.y = termHeight / 2;
    } else if (typeof positionSpec.y === "number") {
      // Scale from screen resolution to terminal
      const scaledY = (positionSpec.y / SCREEN_RESOLUTION.height) * termHeight;
      const centroidScaledY =
        (this.centroid.y / SCREEN_RESOLUTION.height) * termHeight;
      const offsetY = termHeight / 2 - centroidScaledY;
      result.y = scaledY + offsetY;
    } else {
      result.y = positionSpec.y || 0;
    }

    return result;
  }

  /**
   * Scales a coordinate from screen resolution to terminal
   * @param {number} value - Coordinate value
   * @param {number} screenMax - Screen max dimension
   * @param {number} termMax - Terminal max dimension
   * @returns {number} Scaled coordinate
   */
  scaleCoordinate(value, screenMax, termMax) {
    return (value / screenMax) * termMax;
  }

  /**
   * Gets all available template names
   * @returns {Array<string>} Template names
   */
  getTemplateNames() {
    if (!this.templates.objects) return [];
    return Object.keys(this.templates.objects);
  }

  /**
   * Gets all available movement preset names
   * @returns {Array<string>} Preset names
   */
  getMovementPresetNames() {
    if (!this.templates.movements) return [];
    return Object.keys(this.templates.movements);
  }

  /**
   * Updates templates
   * @param {Object} templates - New templates configuration
   */
  updateTemplates(templates) {
    this.templates = templates || {};
    this.centroid = this.calculateCentroid();
  }

  /**
   * Checks if a template exists
   * @param {string} templateName - Template name
   * @returns {boolean} True if template exists
   */
  hasTemplate(templateName) {
    return (
      this.templates.objects && templateName in this.templates.objects
    );
  }

  /**
   * Checks if a movement preset exists
   * @param {string} presetName - Preset name
   * @returns {boolean} True if preset exists
   */
  hasMovementPreset(presetName) {
    return (
      this.templates.movements && presetName in this.templates.movements
    );
  }
}

export default {
  TemplateResolver,
  DEFAULT_TEMPLATE,
  SCREEN_RESOLUTION,
  SHAPE_MAP,
};
