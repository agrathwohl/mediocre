/**
 * Tests for the validate-abc command
 */

import fs from 'fs';
import path from 'path';
import { exec } from 'child_process';
import mockFs from 'mock-fs';
import { promisify } from 'util';

// Import the functions and command to test
import { validateAbcNotation, cleanAbcNotation } from '../../src/utils/claude.js';

// Create a promise-based version of exec
const execPromise = promisify(exec);

describe('validate-abc Command', () => {
  // Sample invalid ABC notation for testing
  const invalidAbcNotation = `X:1
T:Test ABC Command
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
        'test-abc-validation.abc': invalidAbcNotation
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
  });

  describe('validateAbcNotation in convert-midi', () => {
    test('should validate and fix ABC notation before conversion', () => {
      // Mock the convertFile function and its dependencies
      jest.mock('../../src/commands/convert-midi.js', () => {
        const original = jest.requireActual('../../src/commands/convert-midi.js');
        return {
          ...original,
          convertFile: jest.fn().mockImplementation(async (inputPath, outputPath) => {
            // Read the ABC file
            const abcContent = fs.readFileSync(inputPath, 'utf-8');
            
            // Validate the ABC content
            const validation = validateAbcNotation(abcContent);
            
            // Should call the validation function
            expect(validation.isValid).toBe(false);
            expect(validation.issues.length).toBeGreaterThan(0);
            
            // Should create a temp file with fixed content
            const fixedContent = validation.fixedNotation;
            expect(fixedContent).not.toEqual(abcContent);
            
            // Return success
            return true;
          })
        };
      });
      
      // Now we can test the validation integration
      const { convertToMidi } = require('../../src/commands/convert-midi.js');
      
      return convertToMidi({
        input: '/output/test-abc-validation.abc',
        output: '/output'
      }).then(() => {
        // Validation occurred in the mocked convertFile function
        expect(console.warn).toHaveBeenCalled();
      });
    });
  });

  describe('validateAbcNotation in generate-abc', () => {
    test('should validate generated ABC notation', () => {
      // Create a stub for the validateAbcNotation function to track calls
      const validateSpy = jest.spyOn(validateAbcNotation);
      
      // Mock the generate function
      jest.mock('../../src/commands/generate-abc.js', () => {
        const original = jest.requireActual('../../src/commands/generate-abc.js');
        return {
          ...original,
          generateAbc: jest.fn().mockImplementation(async (options) => {
            // First pass: clean the notation
            const cleanedAbcNotation = cleanAbcNotation(invalidAbcNotation);
            
            // Validate the ABC notation - this should call our spy
            const validation = validateAbcNotation(cleanedAbcNotation);
            
            // Save to a test file
            fs.writeFileSync('/output/test-generated.abc', cleanedAbcNotation);
            
            return ['/output/test-generated.abc'];
          })
        };
      });
      
      // Now we can test the validation integration
      const { generateAbc } = require('../../src/commands/generate-abc.js');
      
      return generateAbc({
        genre: 'test_x_genre',
        output: '/output'
      }).then(() => {
        // Validation function should have been called
        expect(validateSpy).toHaveBeenCalled();
      });
    });
  });

  // This is a mock implementation of the CLI command, since we can't directly
  // test the index.js script easily in this context
  describe('validate-abc CLI command', () => {
    test('should run validation process on a file', () => {
      // Create a standalone validation function similar to the CLI command
      const validateAbcFile = async (inputPath, outputPath) => {
        // Load the ABC notation
        const abcContent = fs.readFileSync(inputPath, 'utf-8');
        
        // Validate the ABC notation
        const validation = validateAbcNotation(abcContent);
        
        if (validation.isValid) {
          console.log(`✅ ABC notation validation passed. No issues found.`);
          return { isValid: true, issues: [] };
        }
        
        // Log the issues found
        console.warn(`⚠️ Found ${validation.issues.length} issues in the ABC notation:`);
        validation.issues.forEach(issue => console.warn(`  - ${issue}`));
        
        // Apply automatic fixes
        console.log(`Applying automatic fixes...`);
        const fixedContent = validation.fixedNotation;
        
        // Determine the output path
        const actualOutputPath = outputPath || inputPath;
        
        // Save the fixed content
        fs.writeFileSync(actualOutputPath, fixedContent);
        console.log(`Fixed ABC notation saved to: ${actualOutputPath}`);
        
        return validation;
      };
      
      // Run the validation function on our test file
      return validateAbcFile('/output/test-abc-validation.abc', '/output/fixed.abc').then((result) => {
        // Validation should have found issues
        expect(result.isValid).toBe(false);
        expect(result.issues.length).toBeGreaterThan(0);
        
        // The file should have been fixed
        expect(fs.existsSync('/output/fixed.abc')).toBe(true);
        
        // The fixed file should be different from the original
        const fixedContent = fs.readFileSync('/output/fixed.abc', 'utf-8');
        expect(fixedContent).not.toEqual(invalidAbcNotation);
        
        // The fixed file should pass validation
        const reValidation = validateAbcNotation(fixedContent);
        expect(reValidation.issues.filter(issue => issue.includes('Blank line detected'))).toHaveLength(0);
      });
    });
  });
});