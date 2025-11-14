/**
 * Tests for the pipeline command
 */

import { jest } from '@jest/globals';
import fs from 'fs';
import path from 'path';
import mockFs from 'mock-fs';

// Mock all the command modules before importing
const mockGenerateAbc = jest.fn();
const mockConvertToMidi = jest.fn();
const mockConvertToPdf = jest.fn();
const mockConvertToWav = jest.fn();
const mockProcessEffects = jest.fn();
const mockCombineCompositions = jest.fn();
const mockModifyComposition = jest.fn();
const mockGenerateLyrics = jest.fn();
const mockMixAndMatch = jest.fn();
const mockRearrangeComposition = jest.fn();

jest.unstable_mockModule('../../src/commands/generate-abc.js', () => ({
  generateAbc: mockGenerateAbc
}));
jest.unstable_mockModule('../../src/commands/convert-midi.js', () => ({
  convertToMidi: mockConvertToMidi
}));
jest.unstable_mockModule('../../src/commands/convert-pdf.js', () => ({
  convertToPdf: mockConvertToPdf
}));
jest.unstable_mockModule('../../src/commands/convert-wav.js', () => ({
  convertToWav: mockConvertToWav
}));
jest.unstable_mockModule('../../src/commands/process-effects.js', () => ({
  processEffects: mockProcessEffects
}));
jest.unstable_mockModule('../../src/commands/combine-compositions.js', () => ({
  combineCompositions: mockCombineCompositions
}));
jest.unstable_mockModule('../../src/commands/modify-composition.js', () => ({
  modifyComposition: mockModifyComposition
}));
jest.unstable_mockModule('../../src/commands/generate-lyrics.js', () => ({
  generateLyrics: mockGenerateLyrics
}));
jest.unstable_mockModule('../../src/commands/mix-and-match.js', () => ({
  mixAndMatch: mockMixAndMatch
}));
jest.unstable_mockModule('../../src/commands/rearrange.js', () => ({
  rearrangeComposition: mockRearrangeComposition
}));

const { runPipeline } = await import('../../src/commands/pipeline.js');

describe('Pipeline Command', () => {
  const mockOutputDir = '/test-output';
  const mockConfigPath = '/test-config.json';

  beforeEach(() => {
    // Mock console methods
    jest.spyOn(console, 'log').mockImplementation(() => {});
    jest.spyOn(console, 'warn').mockImplementation(() => {});
    jest.spyOn(console, 'error').mockImplementation(() => {});

    // Reset all mocks
    jest.clearAllMocks();

    // Setup default mock implementations
    mockGenerateAbc.mockResolvedValue(['/output/test1.abc', '/output/test2.abc']);
    mockConvertToMidi.mockResolvedValue(['/output/test1.mid']);
    mockConvertToPdf.mockResolvedValue(['/output/test1.pdf']);
    mockConvertToWav.mockResolvedValue(['/output/test1.wav']);
    mockProcessEffects.mockResolvedValue(['/output/test1_processed.wav']);
    mockCombineCompositions.mockResolvedValue(['/output/combined.abc']);
    mockModifyComposition.mockResolvedValue({ outputAbcFile: '/output/modified.abc' });
    mockGenerateLyrics.mockResolvedValue('/output/with_lyrics.abc');
    mockMixAndMatch.mockResolvedValue('/output/mixed.abc');
    mockRearrangeComposition.mockResolvedValue('/output/rearranged.abc');
  });

  afterEach(() => {
    mockFs.restore();
    jest.restoreAllMocks();
  });

  describe('Configuration Parsing', () => {
    test('should throw error when no config path provided', async () => {
      await expect(runPipeline({})).rejects.toThrow(
        'Pipeline configuration file path is required. Use --config option.'
      );
    });

    test('should throw error when config file does not exist', async () => {
      mockFs({});
      
      await expect(runPipeline({ config: '/nonexistent.json' })).rejects.toThrow(
        'Failed to read or parse pipeline configuration file'
      );
    });

    test('should throw error when config file has invalid JSON', async () => {
      mockFs({
        '/invalid.json': 'invalid json content'
      });

      await expect(runPipeline({ config: '/invalid.json' })).rejects.toThrow(
        'Failed to read or parse pipeline configuration file'
      );
    });

    test('should throw error when config has no steps', async () => {
      const config = {
        name: 'Test Pipeline',
        steps: []
      };

      mockFs({
        [mockConfigPath]: JSON.stringify(config)
      });

      await expect(runPipeline({ config: mockConfigPath })).rejects.toThrow(
        'Pipeline configuration must include at least one step'
      );
    });

    test('should parse valid configuration successfully', async () => {
      const config = {
        name: 'Test Pipeline',
        description: 'A test pipeline',
        output_dir: mockOutputDir,
        steps: [
          {
            name: 'Generate Music',
            command: 'generate',
            args: { count: 1 }
          }
        ]
      };

      mockFs({
        [mockConfigPath]: JSON.stringify(config),
        [mockOutputDir]: {}
      });

      const result = await runPipeline({ config: mockConfigPath });

      expect(result.name).toBe('Test Pipeline');
      expect(result.description).toBe('A test pipeline');
      expect(result.total_steps).toBe(1);
      expect(result.completed_steps).toBe(1);
    });
  });

  describe('Step Execution', () => {
    test('should execute generate command', async () => {
      const config = {
        steps: [
          {
            command: 'generate',
            args: { genre: 'classical_x_jazz', count: 2 }
          }
        ]
      };

      mockFs({
        [mockConfigPath]: JSON.stringify(config),
        [mockOutputDir]: {}
      });

      await runPipeline({ config: mockConfigPath });

      expect(mockGenerateAbc).toHaveBeenCalledWith(
        expect.objectContaining({
          genre: 'classical_x_jazz',
          count: 2,
          output: expect.stringContaining('step1_generate')
        })
      );
    });

    test('should execute convert command with all formats', async () => {
      const config = {
        steps: [
          {
            command: 'convert',
            args: { to: 'all' }
          }
        ]
      };

      mockFs({
        [mockConfigPath]: JSON.stringify(config),
        [mockOutputDir]: {}
      });

      await runPipeline({ config: mockConfigPath });

      expect(mockConvertToMidi).toHaveBeenCalled();
      expect(mockConvertToPdf).toHaveBeenCalled();
      expect(mockConvertToWav).toHaveBeenCalled();
    });

    test('should execute modify command with default instructions', async () => {
      // Setup previous step files
      mockGenerateAbc.mockResolvedValue(['/output/test.abc']);

      const config = {
        steps: [
          { command: 'generate', args: { count: 1 } },
          { command: 'modify', args: {} }
        ]
      };

      mockFs({
        [mockConfigPath]: JSON.stringify(config),
        [mockOutputDir]: {}
      });

      await runPipeline({ config: mockConfigPath });

      expect(mockModifyComposition).toHaveBeenCalledWith(
        expect.objectContaining({
          abcFile: '/output/test.abc',
          instructions: 'Develop this composition further by adding more variation and complexity'
        })
      );
    });

    test('should execute lyrics command with default prompt', async () => {
      // Setup previous step files
      mockGenerateAbc.mockResolvedValue(['/output/test.abc']);
      mockConvertToMidi.mockResolvedValue(['/output/test.mid']);
      
      const config = {
        steps: [
          { command: 'generate', args: { count: 1 } },
          { command: 'convert', args: { to: 'midi' } },
          { command: 'lyrics', args: {} }
        ]
      };

      mockFs({
        [mockConfigPath]: JSON.stringify(config),
        [mockOutputDir]: {}
      });

      await runPipeline({ config: mockConfigPath });

      expect(generateLyrics).toHaveBeenCalledWith(
        expect.objectContaining({
          abcFile: '/output/test.abc',
          midiFile: '/output/test.mid',
          lyricsPrompt: 'A song about music and creativity'
        })
      );
    });

    test('should execute rearrange command with default instruments', async () => {
      generateAbc.mockResolvedValue(['/output/test.abc']);
      
      const config = {
        steps: [
          { command: 'generate', args: { count: 1 } },
          { command: 'rearrange', args: {} }
        ]
      };

      mockFs({
        [mockConfigPath]: JSON.stringify(config),
        [mockOutputDir]: {}
      });

      await runPipeline({ config: mockConfigPath });

      expect(rearrangeComposition).toHaveBeenCalledWith(
        expect.objectContaining({
          abcFile: '/output/test.abc',
          instruments: 'Piano,Violin,Cello,Flute'
        })
      );
    });

    test('should execute mix-and-match with multiple files', async () => {
      generateAbc.mockResolvedValue(['/output/test1.abc', '/output/test2.abc', '/output/test3.abc', '/output/test4.abc']);
      
      const config = {
        steps: [
          { command: 'generate', args: { count: 4 } },
          { command: 'mix-and-match', args: {} }
        ]
      };

      mockFs({
        [mockConfigPath]: JSON.stringify(config),
        [mockOutputDir]: {}
      });

      await runPipeline({ config: mockConfigPath });

      expect(mixAndMatch).toHaveBeenCalledWith(
        expect.objectContaining({
          files: ['/output/test1.abc', '/output/test2.abc', '/output/test3.abc']
        })
      );
    });
  });

  describe('File Chaining', () => {
    test('should chain ABC files from generate to convert', async () => {
      const config = {
        steps: [
          { command: 'generate', args: { count: 1 } },
          { command: 'convert', args: { to: 'midi' } }
        ]
      };

      mockFs({
        [mockConfigPath]: JSON.stringify(config),
        [mockOutputDir]: {}
      });

      await runPipeline({ config: mockConfigPath });

      expect(convertToMidi).toHaveBeenCalledWith(
        expect.objectContaining({
          input: '/output/test1.abc'
        })
      );
    });

    test('should chain WAV files from convert to process', async () => {
      generateAbc.mockResolvedValue(['/output/test.abc']);
      convertToWav.mockResolvedValue(['/output/test.wav']);
      
      const config = {
        steps: [
          { command: 'generate', args: { count: 1 } },
          { command: 'convert', args: { to: 'wav' } },
          { command: 'process', args: { effect: 'reverb' } }
        ]
      };

      mockFs({
        [mockConfigPath]: JSON.stringify(config),
        [mockOutputDir]: {}
      });

      await runPipeline({ config: mockConfigPath });

      expect(processEffects).toHaveBeenCalledWith(
        expect.objectContaining({
          input: '/output/test.wav',
          effect: 'reverb'
        })
      );
    });
  });

  describe('Error Handling', () => {
    test('should continue pipeline when step fails and abort_on_error is false', async () => {
      generateAbc.mockRejectedValue(new Error('Generation failed'));
      
      const config = {
        steps: [
          { command: 'generate', args: { count: 1 }, abort_on_error: false },
          { command: 'convert', args: { to: 'midi' } }
        ]
      };

      mockFs({
        [mockConfigPath]: JSON.stringify(config),
        [mockOutputDir]: {}
      });

      const result = await runPipeline({ config: mockConfigPath });

      expect(result.completed_steps).toBe(2);
      expect(result.steps[0].success).toBe(false);
      expect(result.steps[0].error).toBe('Generation failed');
      expect(result.steps[1].success).toBe(true);
    });

    test('should abort pipeline when step fails and abort_on_error is true', async () => {
      generateAbc.mockRejectedValue(new Error('Generation failed'));
      
      const config = {
        steps: [
          { command: 'generate', args: { count: 1 }, abort_on_error: true },
          { command: 'convert', args: { to: 'midi' } }
        ]
      };

      mockFs({
        [mockConfigPath]: JSON.stringify(config),
        [mockOutputDir]: {}
      });

      const result = await runPipeline({ config: mockConfigPath });

      expect(result.completed_steps).toBe(1);
      expect(result.steps[0].success).toBe(false);
      expect(result.steps[0].error).toBe('Generation failed');
      expect(result.steps).toHaveLength(1);
    });

    test('should throw error for unknown command', async () => {
      const config = {
        steps: [
          { command: 'unknown-command', args: {} }
        ]
      };

      mockFs({
        [mockConfigPath]: JSON.stringify(config),
        [mockOutputDir]: {}
      });

      const result = await runPipeline({ config: mockConfigPath });

      expect(result.steps[0].success).toBe(false);
      expect(result.steps[0].error).toBe('Unknown command: unknown-command');
    });
  });

  describe('Results Tracking', () => {
    test('should track pipeline execution results', async () => {
      const config = {
        name: 'Test Pipeline',
        description: 'Test description',
        steps: [
          { name: 'Generate Step', command: 'generate', args: { count: 1 } }
        ]
      };

      mockFs({
        [mockConfigPath]: JSON.stringify(config),
        [mockOutputDir]: {}
      });

      const result = await runPipeline({ config: mockConfigPath });

      expect(result).toMatchObject({
        name: 'Test Pipeline',
        description: 'Test description',
        total_steps: 1,
        completed_steps: 1,
        files_produced: ['/output/test1.abc', '/output/test2.abc']
      });

      expect(result.started_at).toBeDefined();
      expect(result.completed_at).toBeDefined();
      expect(result.duration_ms).toBeGreaterThan(0);
      
      expect(result.steps[0]).toMatchObject({
        name: 'Generate Step',
        command: 'generate',
        success: true,
        files_produced: ['/output/test1.abc', '/output/test2.abc']
      });
    });

    test('should write results to pipeline_results.json', async () => {
      const config = {
        steps: [
          { command: 'generate', args: { count: 1 } }
        ]
      };

      const mockWriteFileSync = jest.spyOn(fs, 'writeFileSync').mockImplementation(() => {});

      mockFs({
        [mockConfigPath]: JSON.stringify(config),
        [mockOutputDir]: {}
      });

      await runPipeline({ config: mockConfigPath });

      expect(mockWriteFileSync).toHaveBeenCalledWith(
        expect.stringContaining('pipeline_results.json'),
        expect.stringContaining('"name"')
      );

      mockWriteFileSync.mockRestore();
    });
  });

  describe('Directory Management', () => {
    test('should create output directory if it does not exist', async () => {
      const config = {
        output_dir: '/new-output-dir',
        steps: [
          { command: 'generate', args: { count: 1 } }
        ]
      };

      const mockMkdirSync = jest.spyOn(fs, 'mkdirSync').mockImplementation(() => {});
      const mockExistsSync = jest.spyOn(fs, 'existsSync').mockReturnValue(false);

      mockFs({
        [mockConfigPath]: JSON.stringify(config)
      });

      await runPipeline({ config: mockConfigPath });

      expect(mockMkdirSync).toHaveBeenCalledWith('/new-output-dir', { recursive: true });

      mockMkdirSync.mockRestore();
      mockExistsSync.mockRestore();
    });

    test('should create step-specific directories', async () => {
      const config = {
        steps: [
          { command: 'generate', args: { count: 1 } },
          { command: 'convert', args: { to: 'midi' } }
        ]
      };

      const mockMkdirSync = jest.spyOn(fs, 'mkdirSync').mockImplementation(() => {});
      const mockExistsSync = jest.spyOn(fs, 'existsSync').mockReturnValue(false);

      mockFs({
        [mockConfigPath]: JSON.stringify(config)
      });

      await runPipeline({ config: mockConfigPath });

      expect(mockMkdirSync).toHaveBeenCalledWith(
        expect.stringContaining('step1_generate'),
        { recursive: true }
      );
      expect(mockMkdirSync).toHaveBeenCalledWith(
        expect.stringContaining('step2_convert'),
        { recursive: true }
      );

      mockMkdirSync.mockRestore();
      mockExistsSync.mockRestore();
    });
  });

  describe('Default Values', () => {
    test('should use default values when not specified in config', async () => {
      const config = {
        steps: [
          { command: 'generate', args: { count: 1 } }
        ]
      };

      mockFs({
        [mockConfigPath]: JSON.stringify(config),
        [mockOutputDir]: {}
      });

      const result = await runPipeline({ config: mockConfigPath });

      expect(result.name).toBe('Mediocre Pipeline');
      expect(result.description).toBe('A sequence of mediocre commands');
    });
  });
});