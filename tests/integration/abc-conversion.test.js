/**
 * Integration tests for ABC notation validation and conversion
 */

import fs from 'fs';
import path from 'path';
import mockFs from 'mock-fs';
import { execa } from 'execa';

// Import the functions to test
import { validateAbcNotation, cleanAbcNotation } from '../../src/utils/claude.js';
import { convertToMidi } from '../../src/commands/convert-midi.js';

// Mock execa to avoid actual command execution
jest.mock('execa', () => ({
  execa: jest.fn().mockResolvedValue({ stdout: 'mocked output' })
}));

describe('ABC Notation Conversion Integration', () => {
  // Sample invalid ABC notations for testing
  const invalidAbcNotation = `X:1
T:Invalid Test Piece with Blank Lines
M:4/4
L:1/8
K:C
%%MIDI program 1 0

[V:1] CDEF GABc | cBAG FEDC |

[V:2] C,E,G,C EGce | eGEC G,E,C, |`;

  const validAbcNotation = `X:1
T:Valid Test Piece
M:4/4
L:1/8
K:C
%%MIDI program 1 0
[V:1] CDEF GABc | cBAG FEDC |
[V:2] C,E,G,C EGce | eGEC G,E,C, |`;

  beforeEach(() => {
    // Setup a mock file system
    mockFs({
      '/output': {
        'invalid.abc': invalidAbcNotation,
        'valid.abc': validAbcNotation
      }
    });
    
    // Mock console.log and console.warn
    jest.spyOn(console, 'log').mockImplementation(() => {});
    jest.spyOn(console, 'warn').mockImplementation(() => {});
    jest.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    mockFs.restore();
    jest.restoreAllMocks();
    jest.clearAllMocks();
  });

  describe('Conversion with Validation', () => {
    test('should validate and fix ABC notation before conversion to MIDI', async () => {
      // Mock fs.writeFileSync to capture writes to temp files
      const originalWriteFileSync = fs.writeFileSync;
      let capturedContent = null;
      fs.writeFileSync = jest.fn((path, content) => {
        if (path.includes('.fixed.abc')) {
          capturedContent = content;
        }
        return originalWriteFileSync(path, content);
      });
      
      // Call convertToMidi with invalid ABC file
      await convertToMidi({
        input: '/output/invalid.abc',
        output: '/output'
      });
      
      // execa should be called with abc2midi
      expect(execa).toHaveBeenCalled();
      
      // A temp file should have been created with fixed content
      expect(capturedContent).not.toBeNull();
      
      // Validate the fixed content - it should pass validation
      if (capturedContent) {
        const validation = validateAbcNotation(capturedContent);
        // The fixed content should not have blank line issues
        expect(validation.issues.filter(issue => issue.includes('Blank line'))).toHaveLength(0);
      }
      
      // Restore original fs.writeFileSync
      fs.writeFileSync = originalWriteFileSync;
    });
    
    test('should convert valid ABC notation without modification', async () => {
      // Set up a spy for fs.writeFileSync
      const writeFileSpy = jest.spyOn(fs, 'writeFileSync');
      
      // Call convertToMidi with valid ABC file
      await convertToMidi({
        input: '/output/valid.abc',
        output: '/output'
      });
      
      // execa should be called with abc2midi
      expect(execa).toHaveBeenCalled();
      
      // No temp file should be created for valid files
      expect(writeFileSpy).not.toHaveBeenCalledWith(
        expect.stringContaining('.fixed.abc'),
        expect.anything()
      );
    });
  });
  
  describe('End-to-end Validation Chain', () => {
    test('should validate, fix, convert, and clean up all in sequence', async () => {
      // Mock the fs.unlinkSync to track file deletion
      const unlinkSpy = jest.spyOn(fs, 'unlinkSync').mockImplementation(() => {});
      
      // Call validation and convert function like the CLI would do
      async function processAndConvert(inputPath) {
        // Step 1: Validate
        const abcContent = fs.readFileSync(inputPath, 'utf-8');
        const validation = validateAbcNotation(abcContent);
        
        // Step 2: Fix if needed
        if (!validation.isValid) {
          console.warn(`Found ${validation.issues.length} issues in ${inputPath}`);
          
          // Create a fixed version
          const tempPath = inputPath + '.fixed.abc';
          fs.writeFileSync(tempPath, validation.fixedNotation);
          
          // Step 3: Convert fixed version
          await convertToMidi({
            input: tempPath,
            output: '/output'
          });
          
          // Step 4: Clean up
          fs.unlinkSync(tempPath);
          
          return true;
        }
        
        // If valid, just convert
        await convertToMidi({
          input: inputPath,
          output: '/output'
        });
        
        return true;
      }
      
      // Run the process on invalid file
      await processAndConvert('/output/invalid.abc');
      
      // Validate all steps were executed
      expect(console.warn).toHaveBeenCalled();  // Should warn about issues
      expect(execa).toHaveBeenCalled();         // Should call conversion
      expect(unlinkSpy).toHaveBeenCalled();     // Should clean up temp file
      
      // Reset for the valid file test
      jest.clearAllMocks();
      
      // Run the process on valid file
      await processAndConvert('/output/valid.abc');
      
      // Validate steps for valid file
      expect(console.warn).not.toHaveBeenCalled();  // No warnings for valid file
      expect(execa).toHaveBeenCalled();             // Should still call conversion
      expect(unlinkSpy).not.toHaveBeenCalled();     // No temp file to clean up
    });
  });
});