/**
 * @fileoverview Analyze audio command - comprehensive audio analysis for compositions
 * Provides amplitude, frequency band, beat detection, and onset analysis
 */

import { Command } from 'commander';
import fs from 'fs';
import path from 'path';
import AudioAnalyzer from '../utils/audio-analyzer.js';
import FrequencyAnalyzer from '../utils/frequency-analyzer.js';
import { validateFileExists } from '../utils/file-validators.js';

/**
 * Create the analyze-audio command for the CLI
 * @returns {Command} Commander command instance
 */
export function createAnalyzeAudioCommand() {
  const command = new Command('analyze-audio');

  command
    .description('Analyze audio files for amplitude, frequency bands, beats, and onsets')
    .argument('<audio-file>', 'Audio file to analyze (WAV, MP3, FLAC, etc)')
    .option('-m, --method <method>', 'Analysis method (ffmpeg, sox, aubio)', 'aubio')
    .option('-r, --sample-rate <rate>', 'Samples per second for analysis', '30')
    .option('-o, --output <file>', 'Save analysis results to JSON file')
    .option('--amplitude-only', 'Only analyze amplitude/loudness')
    .option('--frequency-only', 'Only analyze frequency bands')
    .option('--beats-only', 'Only detect beats and onsets')
    .option('--json', 'Output raw JSON instead of formatted text')
    .option('-q, --quiet', 'Suppress progress messages')
    .addHelpText('after', `
Analysis Types:
  amplitude    - Overall loudness over time (requires FFmpeg or Sox)
  frequency    - Bass, mid, treble frequency bands (requires aubio-tools)
  beats        - Beat positions and tempo (requires aubio-tools)
  onsets       - Note/sound onset detection (requires aubio-tools)
  pitch        - Dominant frequency tracking (requires aubio-tools)

Methods:
  ffmpeg       - Fast amplitude analysis using FFmpeg
  sox          - Amplitude analysis using Sox
  aubio        - Comprehensive analysis using aubio tools (recommended)

Required Tools:
  - FFmpeg: sudo apt-get install ffmpeg
  - Sox: sudo apt-get install sox
  - Aubio: sudo apt-get install aubio-tools

Examples:
  $ mediocre analyze-audio output/song.wav
  $ mediocre analyze-audio output/song.wav --method aubio
  $ mediocre analyze-audio output/song.wav --beats-only
  $ mediocre analyze-audio output/song.wav -o output/song.analysis.json
  $ mediocre analyze-audio output/song.wav --json | jq '.beats'
    `)
    .action(async (audioFile, options) => {
      await analyzeAudio(audioFile, options);
    });

  return command;
}

/**
 * Perform comprehensive audio analysis
 * @param {string} audioFile - Path to audio file
 * @param {Object} options - Command options
 */
async function analyzeAudio(audioFile, options) {
  // Validate audio file exists
  try {
    validateFileExists(audioFile, 'Audio file');
  } catch (error) {
    console.error(`❌ ${error.message}`);
    process.exit(1);
  }

  const log = options.quiet ? () => {} : console.log;
  const sampleRate = parseInt(options.sampleRate) || 30;

  log('\n🎵 MEDIOCRE AUDIO ANALYZER');
  log('═══════════════════════════\n');
  log(`📁 File: ${path.basename(audioFile)}`);
  log(`🔧 Method: ${options.method}`);
  log(`📊 Sample Rate: ${sampleRate} samples/sec\n`);

  const results = {
    file: audioFile,
    method: options.method,
    sampleRate,
    timestamp: new Date().toISOString()
  };

  try {
    // Amplitude analysis
    if (!options.frequencyOnly && !options.beatsOnly) {
      log('📈 Analyzing amplitude...');
      const audioAnalyzer = new AudioAnalyzer(audioFile, {
        sampleRate,
        method: options.method === 'aubio' ? 'sox' : options.method
      });

      const amplitudes = await audioAnalyzer.extractAmplitudes();
      const beats = audioAnalyzer.detectBeats(amplitudes);

      results.amplitude = {
        samples: amplitudes.length,
        duration: amplitudes.length / sampleRate,
        average: amplitudes.reduce((a, b) => a + b, 0) / amplitudes.length,
        peak: Math.max(...amplitudes),
        min: Math.min(...amplitudes),
        detectedBeats: beats.length,
        data: options.json ? amplitudes : undefined
      };

      if (!options.json) {
        log(`   Duration: ${results.amplitude.duration.toFixed(1)}s`);
        log(`   Samples: ${results.amplitude.samples}`);
        log(`   Average: ${results.amplitude.average.toFixed(3)}`);
        log(`   Peak: ${results.amplitude.peak.toFixed(3)}`);
        log(`   Detected beats: ${results.amplitude.detectedBeats}`);
      }
    }

    // Frequency band analysis (requires aubio)
    if (!options.amplitudeOnly && !options.beatsOnly) {
      log('\n🎛️  Analyzing frequency bands...');
      try {
        const freqAnalyzer = new FrequencyAnalyzer(audioFile, { sampleRate });
        const frequencyBands = await freqAnalyzer.extractFrequencyBands();

        if (frequencyBands.length > 0) {
          const avgBass = frequencyBands.reduce((a, b) => a + b.bass, 0) / frequencyBands.length;
          const avgMid = frequencyBands.reduce((a, b) => a + b.mid, 0) / frequencyBands.length;
          const avgTreble = frequencyBands.reduce((a, b) => a + b.treble, 0) / frequencyBands.length;

          results.frequency = {
            samples: frequencyBands.length,
            averageBass: avgBass,
            averageMid: avgMid,
            averageTreble: avgTreble,
            peakBass: Math.max(...frequencyBands.map(f => f.bass)),
            peakMid: Math.max(...frequencyBands.map(f => f.mid)),
            peakTreble: Math.max(...frequencyBands.map(f => f.treble)),
            data: options.json ? frequencyBands : undefined
          };

          if (!options.json) {
            log(`   Samples: ${results.frequency.samples}`);
            log(`   Average bands:`);
            log(`     Bass:   ${avgBass.toFixed(3)}`);
            log(`     Mid:    ${avgMid.toFixed(3)}`);
            log(`     Treble: ${avgTreble.toFixed(3)}`);
          }
        }
      } catch (error) {
        log(`   ⚠️  Frequency analysis unavailable: ${error.message}`);
        results.frequency = { error: error.message };
      }
    }

    // Beat and onset detection (requires aubio)
    if (!options.amplitudeOnly && !options.frequencyOnly) {
      log('\n🥁 Detecting beats and onsets...');
      try {
        const freqAnalyzer = new FrequencyAnalyzer(audioFile, { sampleRate });

        const [beats, onsets] = await Promise.all([
          freqAnalyzer.extractBeats(),
          freqAnalyzer.extractOnsets()
        ]);

        results.beats = {
          count: beats.length,
          timestamps: beats.map(b => b.time),
          averageBPM: beats.length > 1
            ? 60 / ((beats[beats.length - 1].time - beats[0].time) / (beats.length - 1))
            : 0
        };

        results.onsets = {
          count: onsets.length,
          timestamps: onsets.map(o => o.time)
        };

        if (!options.json) {
          log(`   Beats: ${results.beats.count}`);
          log(`   Estimated BPM: ${results.beats.averageBPM.toFixed(1)}`);
          log(`   Onsets: ${results.onsets.count}`);
        }

        // Also try pitch analysis
        try {
          const pitch = await freqAnalyzer.extractPitch();
          if (pitch.length > 0) {
            const avgFreq = pitch.filter(p => p.frequency > 0).reduce((a, b) => a + b.frequency, 0) /
                           pitch.filter(p => p.frequency > 0).length;

            results.pitch = {
              samples: pitch.length,
              averageFrequency: avgFreq,
              data: options.json ? pitch : undefined
            };

            if (!options.json) {
              log(`   Average pitch: ${avgFreq.toFixed(1)} Hz`);
            }
          }
        } catch (pitchError) {
          // Pitch analysis is optional
        }
      } catch (error) {
        log(`   ⚠️  Beat detection unavailable: ${error.message}`);
        results.beats = { error: error.message };
        results.onsets = { error: error.message };
      }
    }

    // Output results
    if (options.json) {
      console.log(JSON.stringify(results, null, 2));
    } else {
      log('\n✅ Analysis complete');
    }

    // Save to file if requested
    if (options.output) {
      fs.writeFileSync(options.output, JSON.stringify(results, null, 2));
      log(`\n💾 Results saved to: ${options.output}`);
    }

  } catch (error) {
    console.error(`\n❌ Analysis failed: ${error.message}`);
    process.exit(1);
  }
}

export default createAnalyzeAudioCommand;
