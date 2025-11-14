import { describe, it, expect } from '@jest/globals';
import {
  extractRequiredInstruments,
  instrumentMatches,
  validateInstruments,
  formatInstrumentRequirement
} from '../../src/utils/instrument-validation.js';

describe('Instrument Validation', () => {
  describe('extractRequiredInstruments', () => {
    it('extracts instruments from standard format with period', () => {
      const prompt = 'Create a composition. The composition MUST include these instruments: Piano, Violin, Drums.';
      expect(extractRequiredInstruments(prompt)).toEqual(['Piano', 'Violin', 'Drums']);
    });

    it('extracts instruments from standard format without period', () => {
      const prompt = 'MUST include these instruments: Guitar, Bass';
      expect(extractRequiredInstruments(prompt)).toEqual(['Guitar', 'Bass']);
    });

    it('handles --instruments flag format', () => {
      const prompt = 'Create music with --instruments "Trumpet, Saxophone"';
      expect(extractRequiredInstruments(prompt)).toEqual(['Trumpet', 'Saxophone']);
    });

    it('handles "required instruments" format', () => {
      const prompt = 'Make a song. Required instruments: Flute, Harp, Cello';
      expect(extractRequiredInstruments(prompt)).toEqual(['Flute', 'Harp', 'Cello']);
    });

    it('handles "instruments must be" format', () => {
      const prompt = 'instruments must be: Organ, Choir';
      expect(extractRequiredInstruments(prompt)).toEqual(['Organ', 'Choir']);
    });

    it('returns empty array when no instruments specified', () => {
      const prompt = 'Create a composition in jazz style';
      expect(extractRequiredInstruments(prompt)).toEqual([]);
    });

    it('handles extra spaces and formatting', () => {
      const prompt = 'MUST include these instruments:  Piano ,  Violin  , Drums  !';
      expect(extractRequiredInstruments(prompt)).toEqual(['Piano', 'Violin', 'Drums']);
    });
  });

  describe('instrumentMatches', () => {
    it('matches exact names case-insensitively', () => {
      expect(instrumentMatches('Piano', 'Piano')).toBe(true);
      expect(instrumentMatches('piano', 'Piano')).toBe(true);
      expect(instrumentMatches('PIANO', 'piano')).toBe(true);
    });

    it('matches with modifiers and variations', () => {
      expect(instrumentMatches('Guitar', 'Electric Guitar (clean)')).toBe(true);
      expect(instrumentMatches('Electric Guitar', 'Electric Guitar (clean)')).toBe(true);
      expect(instrumentMatches('Piano', 'Acoustic Grand Piano')).toBe(true);
    });

    it('handles aliases correctly', () => {
      expect(instrumentMatches('Drums', 'Percussion')).toBe(true);
      expect(instrumentMatches('Drums', 'Drum Kit')).toBe(true);
      expect(instrumentMatches('Synth', 'Lead Synth')).toBe(true);
      expect(instrumentMatches('Vocals', 'Choir')).toBe(true);
    });

    it('rejects false positives', () => {
      expect(instrumentMatches('Bass', 'Bass Drum')).toBe(false);
      expect(instrumentMatches('Piano', 'Soprano')).toBe(false);
      expect(instrumentMatches('Organ', 'Organism')).toBe(false);
    });

    it('matches specific instrument types', () => {
      expect(instrumentMatches('Trumpet', 'Trumpet')).toBe(true);
      expect(instrumentMatches('Trumpet', 'Muted Trumpet')).toBe(true);
      expect(instrumentMatches('Saxophone', 'Alto Sax')).toBe(true);
      expect(instrumentMatches('Saxophone', 'Tenor Sax')).toBe(true);
    });

    it('handles electric bass specifically', () => {
      expect(instrumentMatches('Electric Bass', 'Electric Bass')).toBe(true);
      expect(instrumentMatches('Electric Bass', 'Electric Bass (finger)')).toBe(true);
      expect(instrumentMatches('Bass', 'Electric Bass')).toBe(true);
      expect(instrumentMatches('Bass', 'Acoustic Bass')).toBe(true);
    });
  });

  describe('validateInstruments', () => {
    it('validates all instruments present', () => {
      const result = validateInstruments(
        ['Piano', 'Violin'],
        ['Acoustic Grand Piano', 'Violin']
      );
      expect(result.valid).toBe(true);
      expect(result.missing).toEqual([]);
      expect(result.mapping).toEqual({
        'Piano': 'Acoustic Grand Piano',
        'Violin': 'Violin'
      });
    });

    it('detects missing instruments', () => {
      const result = validateInstruments(
        ['Piano', 'Violin', 'Drums'],
        ['Piano', 'Violin']
      );
      expect(result.valid).toBe(false);
      expect(result.missing).toEqual(['Drums']);
      expect(result.mapping).toEqual({
        'Piano': 'Piano',
        'Violin': 'Violin'
      });
    });

    it('handles empty required instruments', () => {
      const result = validateInstruments(
        [],
        ['Piano', 'Violin']
      );
      expect(result.valid).toBe(true);
      expect(result.missing).toEqual([]);
      expect(result.mapping).toEqual({});
    });

    it('validates with aliases', () => {
      const result = validateInstruments(
        ['Drums', 'Synth'],
        ['Percussion', 'Lead Synth 1']
      );
      expect(result.valid).toBe(true);
      expect(result.missing).toEqual([]);
      expect(result.mapping).toEqual({
        'Drums': 'Percussion',
        'Synth': 'Lead Synth 1'
      });
    });

    it('validates multiple missing instruments', () => {
      const result = validateInstruments(
        ['Trumpet', 'Saxophone', 'Electric Bass', 'Drums'],
        ['Piano', 'Violin']
      );
      expect(result.valid).toBe(false);
      expect(result.missing).toEqual(['Trumpet', 'Saxophone', 'Electric Bass', 'Drums']);
      expect(result.mapping).toEqual({});
    });
  });

  describe('formatInstrumentRequirement', () => {
    it('returns empty string for no instruments', () => {
      expect(formatInstrumentRequirement([])).toBe('');
    });

    it('formats single instrument correctly', () => {
      const result = formatInstrumentRequirement(['Piano']);
      expect(result).toContain('🚨 MANDATORY INSTRUMENT REQUIREMENTS 🚨');
      expect(result).toContain('1. Piano');
      expect(result).toContain('DO NOT SKIP OR SUBSTITUTE');
    });

    it('formats multiple instruments correctly', () => {
      const result = formatInstrumentRequirement(['Piano', 'Violin', 'Drums']);
      expect(result).toContain('1. Piano');
      expect(result).toContain('2. Violin');
      expect(result).toContain('3. Drums');
      expect(result).toContain('THIS IS A HARD REQUIREMENT');
    });
  });
});