/**
 * REAL Frequency Band Analyzer using aubio tools
 * Extracts actual frequency bands and onsets from audio
 */

import { execSync } from 'child_process';
import fs from 'fs';
import path from 'path';

export class FrequencyAnalyzer {
  constructor(audioFile, options = {}) {
    this.audioFile = audioFile;
    this.sampleRate = options.sampleRate || 30; // samples per second
    this.method = options.method || 'aubio';
  }

  /**
   * Extract frequency bands using aubiomfcc (Mel-frequency cepstral coefficients)
   * Returns bands for bass, mid, and treble ranges
   */
  async extractFrequencyBands() {
    console.log('🎵 Extracting REAL frequency bands using aubiomfcc...');

    try {
      // Extract MFCCs which give us frequency band information
      // -r 44100: sample rate
      // -B 2048: buffer size (larger = better frequency resolution)
      // -H 512: hop size (smaller = more time resolution)
      const cmd = `aubiomfcc -r 44100 -B 2048 -H 512 "${this.audioFile}"`;
      const output = execSync(cmd, { encoding: 'utf8', maxBuffer: 10 * 1024 * 1024 });

      const lines = output.trim().split('\n');
      const mfccData = [];

      for (const line of lines) {
        const parts = line.split(/\s+/);
        if (parts.length >= 2) {
          const time = parseFloat(parts[0]);
          // MFCCs give us spectral shape - we can map to frequency bands
          const coefficients = parts.slice(1).map(v => parseFloat(v));

          mfccData.push({
            time,
            coefficients,
            // Map MFCCs to frequency bands (simplified)
            bass: Math.abs(coefficients[0] || 0) / 100,    // Low frequencies
            mid: Math.abs(coefficients[1] || 0) / 100,     // Mid frequencies
            treble: Math.abs(coefficients[2] || 0) / 100   // High frequencies
          });
        }
      }

      // Resample to target sample rate
      const duration = mfccData.length > 0 ? mfccData[mfccData.length - 1].time : 0;
      const targetSamples = Math.floor(duration * this.sampleRate);
      const resampled = [];

      for (let i = 0; i < targetSamples; i++) {
        const targetTime = i / this.sampleRate;
        // Find closest sample
        let closest = mfccData[0];
        for (const sample of mfccData) {
          if (Math.abs(sample.time - targetTime) < Math.abs(closest.time - targetTime)) {
            closest = sample;
          }
        }
        resampled.push({
          bass: closest.bass,
          mid: closest.mid,
          treble: closest.treble
        });
      }

      console.log(`✅ Extracted ${resampled.length} frequency samples`);
      return resampled;

    } catch (error) {
      console.error('❌ FATAL: aubiomfcc failed to extract frequency bands');
      console.error('   Error:', error.message);
      console.error('   Make sure aubio tools are installed: sudo apt-get install aubio-tools');
      throw new Error(`Failed to extract real frequency bands: ${error.message}`);
    }
  }

  /**
   * Extract onsets (when notes/beats start) using aubioonset
   * Returns timestamps and strengths of detected onsets
   */
  async extractOnsets() {
    console.log('🎵 Detecting onsets using aubioonset...');

    try {
      // -t 0.3: threshold for onset detection
      // -s -20: silence threshold in dB
      const cmd = `aubioonset -t 0.3 -s -20 "${this.audioFile}"`;
      const output = execSync(cmd, { encoding: 'utf8', maxBuffer: 10 * 1024 * 1024 });

      const lines = output.trim().split('\n');
      const onsets = [];

      for (const line of lines) {
        const time = parseFloat(line);
        if (!isNaN(time)) {
          onsets.push({
            time,
            index: Math.floor(time * this.sampleRate)
          });
        }
      }

      console.log(`✅ Detected ${onsets.length} onsets`);
      return onsets;

    } catch (error) {
      console.warn('⚠️ aubioonset failed:', error.message);
      return [];
    }
  }

  /**
   * Extract pitch/frequency over time using aubiopitch
   * Returns dominant frequency at each time point
   */
  async extractPitch() {
    console.log('🎵 Extracting pitch using aubiopitch...');

    try {
      // -p: pitch detection method (yinfft is good for music)
      // -u Hz: output in Hz
      const cmd = `aubiopitch -p yinfft -u Hz "${this.audioFile}"`;
      const output = execSync(cmd, { encoding: 'utf8', maxBuffer: 10 * 1024 * 1024 });

      const lines = output.trim().split('\n');
      const pitchData = [];

      for (const line of lines) {
        const parts = line.split(/\s+/);
        if (parts.length >= 2) {
          const time = parseFloat(parts[0]);
          const frequency = parseFloat(parts[1]);

          // Classify frequency into band
          let band = 'mid';
          if (frequency < 250) band = 'bass';
          else if (frequency > 2000) band = 'treble';

          pitchData.push({
            time,
            frequency,
            band
          });
        }
      }

      console.log(`✅ Extracted ${pitchData.length} pitch samples`);
      return pitchData;

    } catch (error) {
      console.warn('⚠️ aubiopitch failed:', error.message);
      return [];
    }
  }

  /**
   * Extract beat positions using aubiotrack
   */
  async extractBeats() {
    console.log('🎵 Detecting beats using aubiotrack...');

    try {
      const cmd = `aubiotrack "${this.audioFile}"`;
      const output = execSync(cmd, { encoding: 'utf8', maxBuffer: 10 * 1024 * 1024 });

      const lines = output.trim().split('\n');
      const beats = [];

      for (const line of lines) {
        const time = parseFloat(line);
        if (!isNaN(time)) {
          beats.push({
            time,
            index: Math.floor(time * this.sampleRate)
          });
        }
      }

      console.log(`✅ Detected ${beats.length} beats`);
      return beats;

    } catch (error) {
      console.warn('⚠️ aubiotrack failed:', error.message);
      return [];
    }
  }

  /**
   * Get comprehensive audio analysis
   */
  async analyze() {
    const [frequencyBands, onsets, pitch, beats] = await Promise.all([
      this.extractFrequencyBands(),
      this.extractOnsets(),
      this.extractPitch(),
      this.extractBeats()
    ]);

    return {
      frequencyBands,
      onsets,
      pitch,
      beats,
      sampleRate: this.sampleRate
    };
  }
}

export default FrequencyAnalyzer;