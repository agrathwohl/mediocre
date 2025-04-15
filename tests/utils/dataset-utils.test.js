/**
 * Tests for dataset-utils.js
 */

import fs from 'fs';
import path from 'path';
import mockFs from 'mock-fs';

// Import the functions to test
import {
  sortByAge,
  sortByTitle,
  filterByComposition,
  getMusicPieceInfo
} from '../../src/utils/dataset-utils.js';

describe('Dataset Utils', () => {
  beforeEach(() => {
    // Setup a mock file system
    mockFs({
      '/output': {
        'test_x_genre-score1-1234567890.abc': 'X:1\nT:Test Score\n',
        'test_x_genre-score1-1234567890.md': '# Test Score',
        'test_x_genre-score1-12345678901.mid': Buffer.from([0x4d, 0x54, 0x68, 0x64]),
        'test_x_genre-score1-12345678901.mid.wav': Buffer.from([0x52, 0x49, 0x46, 0x46]),
        'test_x_genre-score1-1234567890_description.json': JSON.stringify({
          genre: 'Test Genre',
          analysis: 'Test analysis'
        }),
        'newer_x_genre-score1-9876543210.abc': 'X:1\nT:Newer Score\n',
        'newer_x_genre-score1-9876543210.md': '# Newer Score',
        'newer_x_genre-score1-98765432101.mid': Buffer.from([0x4d, 0x54, 0x68, 0x64]),
        'newer_x_genre-score1-98765432101.mid.wav': Buffer.from([0x52, 0x49, 0x46, 0x46]),
        'newer_x_genre-score1-9876543210_description.json': JSON.stringify({
          genre: 'Newer Genre',
          analysis: 'Newer analysis'
        })
      }
    });
    
    // Mock the stat times
    const oldStats = fs.statSync;
    jest.spyOn(fs, 'statSync').mockImplementation((path) => {
      const stats = oldStats(path);
      
      // Override creation time based on filename
      if (path.includes('1234567890')) {
        stats.birthtime = new Date('2023-01-01');
        stats.mtime = new Date('2023-01-02');
      } else if (path.includes('9876543210')) {
        stats.birthtime = new Date('2023-02-01');
        stats.mtime = new Date('2023-02-02');
      }
      
      return stats;
    });
  });

  afterEach(() => {
    mockFs.restore();
    jest.restoreAllMocks();
  });

  describe('sortByAge', () => {
    test('should sort files by creation date (newest first)', () => {
      const files = sortByAge('/output', 'abc');
      expect(files.length).toBe(2);
      expect(files[0].basename).toBe('newer_x_genre-score1-9876543210.abc');
      expect(files[1].basename).toBe('test_x_genre-score1-1234567890.abc');
    });
  });

  describe('sortByTitle', () => {
    test('should sort files alphabetically by title', () => {
      const files = sortByTitle('/output', 'abc');
      expect(files.length).toBe(2);
      expect(files[0].basename).toBe('newer_x_genre-score1-9876543210.abc');
      expect(files[1].basename).toBe('test_x_genre-score1-1234567890.abc');
    });
  });

  describe('filterByComposition', () => {
    test('should filter files by composition name', () => {
      const files = filterByComposition('test', '/output', 'abc');
      expect(files.length).toBe(1);
      expect(files[0].basename).toBe('test_x_genre-score1-1234567890.abc');
    });
  });

  describe('getMusicPieceInfo', () => {
    test('should get all related files for a music piece', () => {
      const info = getMusicPieceInfo('test_x_genre-score1-1234567890', '/output');
      
      expect(info.genre).toBe('Test Genre');
      expect(info.files.abc).toBeDefined();
      expect(info.files.midi).toBeDefined();
      expect(info.files.wav).toBeDefined();
      expect(info.files.description).toBeDefined();
      expect(info.files.markdown).toBeDefined();
      
      expect(info.files.abc.content).toBe('X:1\nT:Test Score\n');
      expect(info.files.description.content.genre).toBe('Test Genre');
    });

    test('should handle trailing timestamp digit correctly', () => {
      const info = getMusicPieceInfo('test_x_genre-score1-12345678901', '/output');
      
      expect(info.genre).toBe('Test Genre');
      expect(info.files.abc).toBeDefined();
      expect(info.files.midi).toBeDefined();
      expect(info.files.wav).toBeDefined();
      expect(info.files.description).toBeDefined();
    });
  });
});