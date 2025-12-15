#!/usr/bin/env node

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/**
 * Manages ASCII art library with AI-generated shapes for ABC notations
 */
export class AsciiArtManager {
  constructor() {
    this.libraryPath = path.join(__dirname, '../../ascii-art-library.json');
    this.library = this.loadLibrary();
  }

  /**
   * Load the ASCII art library from disk
   * @returns {Object} The library object
   */
  loadLibrary() {
    if (fs.existsSync(this.libraryPath)) {
      try {
        const data = fs.readFileSync(this.libraryPath, 'utf8');
        return JSON.parse(data);
      } catch (error) {
        console.error('Error loading ASCII art library:', error);
        return this.createEmptyLibrary();
      }
    }
    return this.createEmptyLibrary();
  }

  /**
   * Create an empty library structure
   * @returns {Object} Empty library
   */
  createEmptyLibrary() {
    return {
      version: '1.0.0',
      createdAt: new Date().toISOString(),
      abcNotations: {},
      globalShapes: []
    };
  }

  /**
   * Save the library to disk
   */
  saveLibrary() {
    try {
      fs.writeFileSync(this.libraryPath, JSON.stringify(this.library, null, 2));
      console.log(`✅ ASCII art library saved to ${this.libraryPath}`);
    } catch (error) {
      console.error('Error saving ASCII art library:', error);
      throw error;
    }
  }

  /**
   * Add AI-generated ASCII art for a specific ABC notation
   * @param {string} abcBasename - Base name of the ABC file (without .abc)
   * @param {Array} shapes - Array of shape objects with art and metadata
   * @param {Object} metadata - Additional metadata about the ABC notation
   */
  addArtForAbc(abcBasename, shapes, metadata = {}) {
    if (!this.library.abcNotations[abcBasename]) {
      this.library.abcNotations[abcBasename] = {
        createdAt: new Date().toISOString(),
        metadata: metadata,
        shapes: []
      };
    }

    const entry = this.library.abcNotations[abcBasename];
    entry.updatedAt = new Date().toISOString();

    // Add shapes with unique IDs
    shapes.forEach(shape => {
      const shapeWithId = {
        ...shape,
        id: `${abcBasename}_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
        createdAt: new Date().toISOString()
      };
      entry.shapes.push(shapeWithId);
    });

    this.saveLibrary();
    return entry;
  }

  /**
   * Get ASCII art shapes for a specific ABC notation
   * @param {string} abcBasename - Base name of the ABC file
   * @returns {Array} Array of shape objects
   */
  getArtForAbc(abcBasename) {
    const entry = this.library.abcNotations[abcBasename];
    return entry ? entry.shapes : [];
  }

  /**
   * Check if a WAV file is associated with an ABC notation
   * @param {string} wavPath - Path to the WAV file
   * @returns {Object|null} Object with abcBasename and shapes, or null
   */
  getArtForWav(wavPath) {
    const basename = path.basename(wavPath, path.extname(wavPath));

    // Check for pattern: {abcBasename}1.mid.wav
    const match = basename.match(/^(.+?)1\.mid$/);
    if (match) {
      const abcBasename = match[1];
      const shapes = this.getArtForAbc(abcBasename);
      if (shapes.length > 0) {
        return {
          abcBasename,
          shapes,
          metadata: this.library.abcNotations[abcBasename].metadata
        };
      }
    }

    return null;
  }

  /**
   * Get all available ABC basenames
   * @returns {Array} Array of ABC basenames
   */
  getAbcList() {
    return Object.keys(this.library.abcNotations);
  }

  /**
   * Export shapes in format compatible with visualization scripts
   * @param {Array} shapes - Array of shape objects
   * @returns {Array} Formatted shapes for visualization
   */
  formatShapesForVisualization(shapes) {
    return shapes.map((shape, index) => ({
      art: shape.art,
      type: shape.intensity || (index < 2 ? 'small' : index < 4 ? 'medium' : index < 6 ? 'high' : 'max'),
      theme: shape.theme || 'custom',
      source: 'ai-generated',
      id: shape.id
    }));
  }

  /**
   * Add global shapes available for all visualizations
   * @param {Array} shapes - Array of shape objects
   */
  addGlobalShapes(shapes) {
    shapes.forEach(shape => {
      const shapeWithId = {
        ...shape,
        id: `global_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
        createdAt: new Date().toISOString()
      };
      this.library.globalShapes.push(shapeWithId);
    });
    this.saveLibrary();
  }

  /**
   * Get statistics about the library
   * @returns {Object} Library statistics
   */
  getStats() {
    const stats = {
      totalAbcNotations: Object.keys(this.library.abcNotations).length,
      totalShapes: 0,
      globalShapes: this.library.globalShapes.length,
      abcStats: {}
    };

    Object.entries(this.library.abcNotations).forEach(([abc, data]) => {
      stats.totalShapes += data.shapes.length;
      stats.abcStats[abc] = {
        shapeCount: data.shapes.length,
        createdAt: data.createdAt,
        updatedAt: data.updatedAt
      };
    });

    return stats;
  }
}

// Export singleton instance
export default new AsciiArtManager();