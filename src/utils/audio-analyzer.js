#!/usr/bin/env node

import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

/**
 * Shared audio analysis module for ASCII animations
 * Provides unified interface for FFmpeg and Sox audio analysis
 */
export class AudioAnalyzer {
  constructor(audioFile, options = {}) {
    this.audioFile = audioFile;
    this.sampleRate = options.sampleRate || 20; // Samples per second
    this.method = options.method || 'ffmpeg'; // 'ffmpeg' or 'sox'
  }

  /**
   * Extract amplitude data from audio file
   * @returns {Promise<number[]>} Array of amplitude values (0-1 range)
   */
  async extractAmplitudes() {
    try {
      const amplitudes = this.method === 'ffmpeg'
        ? await this._extractWithFFmpeg()
        : await this._extractWithSox();

      if (amplitudes.length === 0) {
        throw new Error(`${this.method} analysis returned no data`);
      }

      console.log(`✅ Extracted ${amplitudes.length} amplitude samples using ${this.method}`);
      return amplitudes;
    } catch (error) {
      console.log(`${this.method} analysis failed: ${error.message}`);
      console.log('Falling back to simulated beat pattern...');
      return this._generateFallbackBeats();
    }
  }

  /**
   * Extract amplitudes using FFmpeg audio statistics filter
   * @private
   */
  async _extractWithFFmpeg() {
    // CRITICAL: FFmpeg outputs filter metadata to stderr, not stdout!
    // We must use 2>&1 to redirect stderr to stdout so we can capture it
    const { stdout } = await execAsync(
      `ffmpeg -i "${this.audioFile}" -af "astats=metadata=1:reset=1,ametadata=print:key=lavfi.astats.Overall.Peak_level:file=-" -f null - 2>&1 | grep "Peak_level" | cut -d'=' -f2`
    );

    return stdout.split('\n')
      .filter(line => line.trim())
      .map(val => {
        const num = parseFloat(val);
        // Convert from dB to linear (0-1 range)
        // FFmpeg gives negative dB values, 0 dB = max
        if (isNaN(num)) return 0;
        const linear = Math.pow(10, num / 20);
        return Math.min(1, Math.max(0, linear));
      });
  }

  /**
   * Extract amplitudes using Sox (one command for entire file)
   * @private
   */
  async _extractWithSox() {
    // Get audio duration first
    const { stdout: durationOutput } = await execAsync(
      `sox "${this.audioFile}" -n stat 2>&1 | grep "Length" | awk '{print $3}'`
    );
    const duration = parseFloat(durationOutput.trim()) || 30;

    // Calculate sample points
    const totalSamples = Math.floor(duration * this.sampleRate);
    const sampleInterval = duration / totalSamples;

    // Extract all samples in one command using Sox segments
    const amplitudes = [];
    const batchSize = 100; // Process 100 samples at a time

    for (let batch = 0; batch < Math.ceil(totalSamples / batchSize); batch++) {
      const startIdx = batch * batchSize;
      const endIdx = Math.min(startIdx + batchSize, totalSamples);

      // Build sox command for this batch
      let soxCommand = '';
      for (let i = startIdx; i < endIdx; i++) {
        const startTime = i * sampleInterval;
        const endTime = startTime + sampleInterval;
        soxCommand += `sox "${this.audioFile}" -n trim ${startTime} =${endTime} stat 2>&1 | grep "Maximum amplitude" | awk '{print $3}' && `;
      }
      soxCommand = soxCommand.slice(0, -4); // Remove last " && "

      const { stdout } = await execAsync(soxCommand);
      const batchAmplitudes = stdout.split('\n')
        .filter(line => line.trim())
        .map(val => {
          const num = parseFloat(val);
          return isNaN(num) ? 0 : Math.abs(num);
        });

      amplitudes.push(...batchAmplitudes);
    }

    return amplitudes;
  }

  /**
   * Generate fallback beat pattern when audio analysis fails
   * @private
   */
  _generateFallbackBeats(duration = 30) {
    const beats = [];
    const samplesPerSecond = this.sampleRate;

    for (let i = 0; i < duration * samplesPerSecond; i++) {
      const t = i / samplesPerSecond;
      // Create a beat pattern: strong on 1 and 3, weak on 2 and 4
      const beatPhase = (t * 2) % 4; // 120 BPM = 2 beats/sec
      let amplitude = 0.2; // Base level

      if (beatPhase < 0.1 || Math.abs(beatPhase - 2) < 0.1) {
        // Strong beats
        amplitude = 0.9 + Math.random() * 0.1;
      } else if (Math.abs(beatPhase - 1) < 0.1 || Math.abs(beatPhase - 3) < 0.1) {
        // Weak beats
        amplitude = 0.5 + Math.random() * 0.2;
      } else {
        // Between beats
        amplitude = 0.2 + Math.random() * 0.2;
      }

      beats.push(amplitude);
    }

    return beats;
  }

  /**
   * Detect beats from amplitude data
   * @param {number[]} amplitudes - Array of amplitude values
   * @returns {number[]} Array of timestamps where beats occur
   */
  detectBeats(amplitudes) {
    const beats = [];
    const threshold = 0.6;
    const sampleRate = this.sampleRate;

    for (let i = 1; i < amplitudes.length; i++) {
      const amplitude = amplitudes[i];
      const prevAmplitude = amplitudes[i - 1] || 0;

      // Detect beat: amplitude spike above threshold
      if (amplitude > threshold && amplitude > prevAmplitude * 1.3) {
        beats.push(i / sampleRate); // Convert to seconds
      }
    }

    return beats;
  }
}

// Export for use in animation scripts
export default AudioAnalyzer;