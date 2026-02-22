#!/usr/bin/env node

import { exec } from 'child_process';
import { promisify } from 'util';
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';

const execAsync = promisify(exec);

/**
 * Shared audio analysis module for ASCII animations
 * Supports audiowaveform (preferred), FFmpeg, and Sox
 * Caches analysis results to disk for instant playback
 */
export class AudioAnalyzer {
  constructor(audioFile, options = {}) {
    this.audioFile = audioFile;
    this.sampleRate = options.sampleRate || 20; // Samples per second
    this.method = options.method || 'audiowaveform'; // 'audiowaveform', 'ffmpeg', or 'sox'
    this.cacheDir = options.cacheDir || path.join(process.cwd(), '.audio-cache');
  }

  /**
   * Get cache file path for this audio file
   * @private
   */
  _getCachePath() {
    // Create cache filename from audio file path + sample rate
    const audioHash = crypto.createHash('md5')
      .update(this.audioFile + this.sampleRate)
      .digest('hex');
    return path.join(this.cacheDir, `${audioHash}.json`);
  }

  /**
   * Load cached analysis if it exists
   * @private
   */
  async _loadCache() {
    try {
      const cachePath = this._getCachePath();
      const cached = JSON.parse(await fs.promises.readFile(cachePath, 'utf8'));
      console.log(`✅ Loaded cached analysis (${cached.samples.length} samples)`);
      return cached.samples;
    } catch (error) {
      if (error.code !== 'ENOENT') {
        console.log(`Cache load failed: ${error.message}`);
      }
    }
    return null;
  }

  /**
   * Save analysis to cache
   * @private
   */
  async _saveCache(samples) {
    try {
      const cachePath = this._getCachePath();
      await fs.promises.mkdir(this.cacheDir, { recursive: true });
      await fs.promises.writeFile(cachePath, JSON.stringify({
        audioFile: this.audioFile,
        sampleRate: this.sampleRate,
        method: this.method,
        samples: samples,
        timestamp: Date.now()
      }));
      console.log(`💾 Cached analysis to ${cachePath}`);
    } catch (error) {
      console.log(`Cache save failed: ${error.message}`);
    }
  }

  /**
   * Get audio file duration in seconds
   * @private
   */
  async _getAudioDuration() {
    try {
      const { stdout } = await execAsync(
        `sox "${this.audioFile}" -n stat 2>&1 | grep "Length" | awk '{print $3}'`
      );
      const duration = parseFloat(stdout.trim());
      return isNaN(duration) ? 30 : duration;
    } catch (error) {
      console.log(`Could not get audio duration: ${error.message}`);
      return 30; // Fallback default
    }
  }

  /**
   * Extract amplitude data from audio file
   * @returns {Promise<number[]>} Array of amplitude values (0-1 range)
   */
  async extractAmplitudes() {
    // Try cache first
    const cached = await this._loadCache();
    if (cached) {
      return cached;
    }

    try {
      let amplitudes;

      if (this.method === 'audiowaveform') {
        amplitudes = await this._extractWithAudiowaveform();
      } else if (this.method === 'ffmpeg') {
        amplitudes = await this._extractWithFFmpeg();
      } else {
        amplitudes = await this._extractWithSox();
      }

      if (amplitudes.length === 0) {
        throw new Error(`${this.method} analysis returned no data`);
      }

      console.log(`✅ Extracted ${amplitudes.length} amplitude samples using ${this.method}`);

      // Save to cache
      await this._saveCache(amplitudes);

      return amplitudes;
    } catch (error) {
      console.log(`${this.method} analysis failed: ${error.message}`);
      console.log('Falling back to simulated beat pattern...');

      // Get actual audio duration for fallback
      const duration = await this._getAudioDuration();
      return this._generateFallbackBeats(duration);
    }
  }

  /**
   * Extract amplitudes using audiowaveform (FAST and ACCURATE)
   * @private
   */
  async _extractWithAudiowaveform() {
    await fs.promises.mkdir(this.cacheDir, { recursive: true });

    const tempJsonPath = path.join(this.cacheDir || '/tmp', `waveform-${Date.now()}.json`);

    try {
      // audiowaveform outputs JSON with peak data
      // --pixels-per-second controls resolution (samples per second)
      await execAsync(
        `audiowaveform -i "${this.audioFile}" -o "${tempJsonPath}" --pixels-per-second ${this.sampleRate} --bits 8`
      );

      const waveformData = JSON.parse(await fs.promises.readFile(tempJsonPath, 'utf8'));

      // audiowaveform data format: alternating [min, max] pairs
      // e.g., [-36, 35, -47, 55, ...] where each pair is [min, max] for that sample window
      // We want peak amplitude: max(abs(min), abs(max)) for each sample
      const amplitudes = [];
      for (let i = 0; i + 1 < waveformData.data.length; i += 2) {
        const min = waveformData.data[i];
        const max = waveformData.data[i + 1];
        // Peak is the larger absolute value
        const peak = Math.max(Math.abs(min), Math.abs(max));
        // Normalize from 0-128 to 0-1
        amplitudes.push(peak / 128.0);
      }

      // Clean up temp file
      await fs.promises.unlink(tempJsonPath);

      return amplitudes;
    } catch (error) {
      // Clean up temp file if it exists
      await fs.promises.unlink(tempJsonPath).catch(() => {});
      throw error;
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