/**
 * Tests for ABC notation validation functions in claude.js
 */

import fs from 'fs';
import path from 'path';
import mockFs from 'mock-fs';

// Import the functions to test
import {
  validateAbcNotation,
  cleanAbcNotation
} from '../../src/utils/claude.js';

describe('ABC Notation Validation', () => {
  // Sample valid and invalid ABC notations for testing
  const validAbcNotation = `X:1
T:Valid Test Piece
M:4/4
L:1/8
K:C
%%MIDI program 1 0
[V:1] CDEF GABc | cBAG FEDC |
[V:2] C,E,G,C EGce | eGEC G,E,C, |`;

  const invalidAbcNotation = `X:1
T:Invalid Test Piece with Blank Lines
M:4/4
L:1/8
K:C
%%MIDI program 1 0

[V:1] CDEF GABc | cBAG FEDC |

[V:2] C,E,G,C EGce | eGEC G,E,C, |`;

  const indentedAbcNotation = `X:1
T:Indented Test Piece
M:4/4
L:1/8
K:C
%%MIDI program 1 0
  [V:1] CDEF GABc | cBAG FEDC |
  [V:2] C,E,G,C EGce | eGEC G,E,C, |`;

  const missingHeaderAbcNotation = `T:Missing X Header
M:4/4
L:1/8
K:C
[V:1] CDEF GABc | cBAG FEDC |
[V:2] C,E,G,C EGce | eGEC G,E,C, |`;

  const lyricsAbcNotation = `X:1
T:Piece with Lyrics
M:4/4
L:1/8
K:C
[V:1] CDEF GABc | cBAG FEDC |
w: This is a test of ly-rics in the piece

[V:2] C,E,G,C EGce | eGEC G,E,C, |`;

  describe('validateAbcNotation', () => {
    test('should validate a correctly formatted ABC notation', () => {
      const result = validateAbcNotation(validAbcNotation);
      expect(result.isValid).toBe(true);
      expect(result.issues.length).toBe(0);
      expect(result.fixedNotation).toBeNull();
    });

    test('should detect blank lines between voice sections', () => {
      const result = validateAbcNotation(invalidAbcNotation);
      expect(result.isValid).toBe(false);
      expect(result.issues.length).toBeGreaterThan(0);
      expect(result.issues[0]).toContain('Blank line detected');
      expect(result.fixedNotation).not.toBeNull();
    });

    test('should detect indentation issues in voice sections', () => {
      const result = validateAbcNotation(indentedAbcNotation);
      expect(result.isValid).toBe(false);
      expect(result.issues.length).toBeGreaterThan(0);
      expect(result.issues[0]).toContain('starts with whitespace');
      expect(result.fixedNotation).not.toBeNull();
    });

    test('should detect missing required headers', () => {
      const result = validateAbcNotation(missingHeaderAbcNotation);
      expect(result.isValid).toBe(false);
      expect(result.issues.length).toBeGreaterThan(0);
      expect(result.issues.some(issue => issue.includes('Missing required header: X:'))).toBe(true);
      expect(result.fixedNotation).not.toBeNull();
    });

    test('should detect spacing issues in lyrics lines', () => {
      const result = validateAbcNotation(lyricsAbcNotation);
      expect(result.isValid).toBe(false);
      expect(result.issues.length).toBeGreaterThan(0);
      expect(result.issues.some(issue => issue.includes('Blank line detected'))).toBe(true);
      expect(result.fixedNotation).not.toBeNull();
    });
  });

  describe('cleanAbcNotation', () => {
    test('should clean blank lines between voice sections', () => {
      const cleaned = cleanAbcNotation(invalidAbcNotation);
      const validation = validateAbcNotation(cleaned);
      
      // The cleaned version should not have the blank line issue
      expect(validation.issues.every(issue => !issue.includes('Blank line detected'))).toBe(true);
    });

    test('should fix indentation issues in voice sections', () => {
      const cleaned = cleanAbcNotation(indentedAbcNotation);
      const validation = validateAbcNotation(cleaned);
      
      // The cleaned version should not have indentation issues
      expect(validation.issues.every(issue => !issue.includes('starts with whitespace'))).toBe(true);
    });

    test('should fix spacing in lyrics lines', () => {
      const cleaned = cleanAbcNotation(lyricsAbcNotation);
      
      // The cleaned version shouldn't have blank lines between lyrics
      expect(cleaned).not.toContain('w: This is a test of ly-rics in the piece\n\n');
    });

    test('should maintain required headers', () => {
      const cleaned = cleanAbcNotation(validAbcNotation);
      
      // The cleaned version should preserve all headers
      expect(cleaned).toContain('X:1');
      expect(cleaned).toContain('T:Valid Test Piece');
      expect(cleaned).toContain('M:4/4');
      expect(cleaned).toContain('K:C');
    });

    test('should fix common notation formatting issues', () => {
      const notationWithSpacingIssues = `X:1
T:Test
M:4/4
K:C
  [V:1]  CDEF | GABc |
   [V:2]   C,E,G,C | EGce |`;
      
      const cleaned = cleanAbcNotation(notationWithSpacingIssues);
      
      // Should fix the spacing issues
      expect(cleaned).toContain('[V:1] CDEF');
      expect(cleaned).toContain('[V:2] C,E,G,C');
      expect(cleaned).not.toContain('  [V:1]');
      expect(cleaned).not.toContain('   [V:2]');
    });
  });
});