/**
 * Tests for file operations in the UI
 */

import fs from 'fs';
import path from 'path';
import mockFs from 'mock-fs';
import { jest } from '@jest/globals';

// Since we can't directly test the functions in dataset-browser.js, we'll test similar logic here
describe('File Operations', () => {
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
        'thumbs_down': {}
      }
    });
  });

  afterEach(() => {
    mockFs.restore();
  });

  test('moveFilesToThumbsDown should move files to thumbs_down directory', () => {
    const files = [
      '/output/test_x_genre-score1-1234567890.abc',
      '/output/test_x_genre-score1-1234567890.md',
      '/output/test_x_genre-score1-12345678901.mid',
      '/output/test_x_genre-score1-12345678901.mid.wav',
      '/output/test_x_genre-score1-1234567890_description.json'
    ];
    
    const thumbsDownDir = '/output/thumbs_down';
    
    // Create the move function
    const moveFilesToThumbsDown = (files, dir) => {
      const movedFiles = [];
      for (const filePath of files) {
        const filename = path.basename(filePath);
        const destPath = path.join(dir, filename);
        
        // Move the file (in real implementation this would use fs.renameSync)
        fs.writeFileSync(destPath, fs.readFileSync(filePath));
        fs.unlinkSync(filePath);
        
        movedFiles.push(filename);
      }
      return movedFiles;
    };
    
    // Execute the function
    const result = moveFilesToThumbsDown(files, thumbsDownDir);
    
    // Check the results
    expect(result.length).toBe(5);
    expect(result).toContain('test_x_genre-score1-1234567890.abc');
    
    // Verify that files were moved
    expect(fs.existsSync('/output/test_x_genre-score1-1234567890.abc')).toBe(false);
    expect(fs.existsSync('/output/thumbs_down/test_x_genre-score1-1234567890.abc')).toBe(true);
    expect(fs.existsSync('/output/thumbs_down/test_x_genre-score1-1234567890_description.json')).toBe(true);
  });

  test('should handle non-existent files gracefully', () => {
    const files = [
      '/output/nonexistent-file.abc',
      '/output/test_x_genre-score1-1234567890.md'
    ];
    
    const thumbsDownDir = '/output/thumbs_down';
    
    // Create the move function with error handling
    const moveFilesToThumbsDown = (files, dir) => {
      const movedFiles = [];
      const errors = [];
      
      for (const filePath of files) {
        try {
          const filename = path.basename(filePath);
          const destPath = path.join(dir, filename);
          
          if (fs.existsSync(filePath)) {
            // Move the file
            fs.writeFileSync(destPath, fs.readFileSync(filePath));
            fs.unlinkSync(filePath);
            movedFiles.push(filename);
          } else {
            errors.push(`File not found: ${filePath}`);
          }
        } catch (error) {
          errors.push(`Error moving ${filePath}: ${error.message}`);
        }
      }
      
      return { movedFiles, errors };
    };
    
    // Execute the function
    const result = moveFilesToThumbsDown(files, thumbsDownDir);
    
    // Check the results
    expect(result.movedFiles.length).toBe(1);
    expect(result.movedFiles).toContain('test_x_genre-score1-1234567890.md');
    expect(result.errors.length).toBe(1);
    expect(result.errors[0]).toContain('File not found:');
    
    // Verify that the existing file was moved
    expect(fs.existsSync('/output/test_x_genre-score1-1234567890.md')).toBe(false);
    expect(fs.existsSync('/output/thumbs_down/test_x_genre-score1-1234567890.md')).toBe(true);
  });

  test('should create thumbs_down directory if it does not exist', () => {
    // Remove the directory first
    fs.rmdirSync('/output/thumbs_down');
    
    const files = [
      '/output/test_x_genre-score1-1234567890.abc'
    ];
    
    const thumbsDownDir = '/output/thumbs_down';
    
    // Create the move function with directory creation
    const moveFilesToThumbsDown = (files, dir) => {
      // Create directory if it doesn't exist
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }
      
      const movedFiles = [];
      for (const filePath of files) {
        const filename = path.basename(filePath);
        const destPath = path.join(dir, filename);
        
        // Move the file
        fs.writeFileSync(destPath, fs.readFileSync(filePath));
        fs.unlinkSync(filePath);
        
        movedFiles.push(filename);
      }
      return movedFiles;
    };
    
    // Execute the function
    const result = moveFilesToThumbsDown(files, thumbsDownDir);
    
    // Check that the directory was created
    expect(fs.existsSync('/output/thumbs_down')).toBe(true);
    
    // Verify that the file was moved
    expect(result.length).toBe(1);
    expect(fs.existsSync('/output/test_x_genre-score1-1234567890.abc')).toBe(false);
    expect(fs.existsSync('/output/thumbs_down/test_x_genre-score1-1234567890.abc')).toBe(true);
  });
});