/**
 * Playlist Controller Module
 * 
 * Manages playlist playback, track iteration, and playlist file parsing.
 * Supports JSON playlist files and automatic track progression.
 * 
 * @module playback/playlist/playlist-controller
 * 
 * @example
 * import { PlaylistController } from './playlist/playlist-controller.js';
 * 
 * const controller = new PlaylistController('./playlist.json');
 * await controller.load();
 * 
 * // Get current track
 * const track = controller.getCurrentTrack();
 * 
 * // Play next track
 * controller.playNext();
 */

import fs from 'fs/promises';
import { resolve, dirname } from 'path';

/**
 * PlaylistController class for managing track playlists
 */
export class PlaylistController {
  /**
   * Creates a new PlaylistController instance
   * 
   * @param {string} playlistPath - Path to playlist JSON file
   * @param {Object} [options={}] - Controller options
   * @param {boolean} [options.loop=false] - Whether to loop playlist
   * @param {boolean} [options.shuffle=false] - Whether to shuffle tracks
   */
  constructor(playlistPath, options = {}) {
    this.playlistPath = playlistPath;
    this.playlistDir = playlistPath ? dirname(playlistPath) : process.cwd();
    
    this.options = {
      loop: options.loop || false,
      shuffle: options.shuffle || false
    };
    
    // Playlist state
    this.tracks = [];
    this.currentIndex = 0;
    this.isLoaded = false;
    this.playlistName = '';
    this.playlistMetadata = {};
    
    // Playback state
    this.playHistory = [];
    this.shuffledIndices = [];
  }

  /**
   * Loads the playlist from disk
   * 
   * @returns {Promise<boolean>} True if loaded successfully
   */
  async load() {
    if (!this.playlistPath) {
      console.warn('No playlist path specified');
      return false;
    }

    try {
      await fs.access(this.playlistPath);
    } catch {
      console.warn(`Playlist file not found: ${this.playlistPath}`);
      return false;
    }

    try {
      const content = await fs.readFile(this.playlistPath, 'utf-8');
      const playlist = JSON.parse(content);
      
      this.playlistName = playlist.name || 'Untitled Playlist';
      this.playlistMetadata = playlist.metadata || {};
      this.tracks = playlist.tracks || [];
      
      if (this.tracks.length === 0) {
        console.warn('Playlist contains no tracks');
        return false;
      }
      
      // Initialize shuffled indices if shuffle mode
      if (this.options.shuffle) {
        this.shuffleTracks();
      }
      
      this.isLoaded = true;
      this.currentIndex = 0;
      this.playHistory = [];
      
      console.log(`Loaded playlist: ${this.playlistName} (${this.tracks.length} tracks)`);
      return true;
      
    } catch (error) {
      console.error(`Failed to load playlist: ${error.message}`);
      return false;
    }
  }

  /**
   * Shuffles the track order
   * Creates a shuffled index array
   */
  shuffleTracks() {
    this.shuffledIndices = Array.from(
      { length: this.tracks.length },
      (_, i) => i
    );
    
    // Fisher-Yates shuffle
    for (let i = this.shuffledIndices.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [this.shuffledIndices[i], this.shuffledIndices[j]] = 
      [this.shuffledIndices[j], this.shuffledIndices[i]];
    }
  }

  /**
   * Gets the current track
   * 
   * @returns {Object|null} Current track or null if not loaded
   */
  getCurrentTrack() {
    if (!this.isLoaded || this.tracks.length === 0) {
      return null;
    }
    
    const index = this.options.shuffle
      ? this.shuffledIndices[this.currentIndex]
      : this.currentIndex;
      
    return this.tracks[index];
  }

  /**
   * Gets the current track with resolved paths
   * 
   * @returns {Object|null} Track with absolute paths
   */
  getCurrentTrackWithPaths() {
    const track = this.getCurrentTrack();
    if (!track) return null;
    
    return {
      ...track,
      audioPath: this.resolvePath(track.audio),
      choreographyPath: track.choreography
        ? this.resolvePath(track.choreography)
        : null
    };
  }

  /**
   * Advances to the next track
   * 
   * @returns {Object|null} Next track or null if at end
   */
  playNext() {
    if (!this.isLoaded) return null;
    
    // Save current track to history
    const currentTrack = this.getCurrentTrack();
    if (currentTrack) {
      this.playHistory.push({
        track: currentTrack,
        index: this.currentIndex,
        time: Date.now()
      });
    }
    
    // Advance index
    this.currentIndex++;
    
    // Check if we've reached the end
    if (this.currentIndex >= this.tracks.length) {
      if (this.options.loop) {
        this.currentIndex = 0;
        // Reshuffle if needed
        if (this.options.shuffle) {
          this.shuffleTracks();
        }
      } else {
        this.currentIndex = this.tracks.length - 1;
        return null;
      }
    }
    
    return this.getCurrentTrack();
  }

  /**
   * Goes back to the previous track
   * 
   * @returns {Object|null} Previous track or null if at start
   */
  playPrevious() {
    if (!this.isLoaded || this.currentIndex <= 0) {
      return null;
    }
    
    this.currentIndex--;
    return this.getCurrentTrack();
  }

  /**
   * Jumps to a specific track index
   * 
   * @param {number} index - Track index
   * @returns {Object|null} Track at index or null if invalid
   */
  jumpTo(index) {
    if (!this.isLoaded || index < 0 || index >= this.tracks.length) {
      return null;
    }
    
    this.currentIndex = index;
    return this.getCurrentTrack();
  }

  /**
   * Checks if there is a next track
   * 
   * @returns {boolean} True if there is a next track
   */
  hasNext() {
    if (!this.isLoaded) return false;
    if (this.options.loop) return true;
    return this.currentIndex < this.tracks.length - 1;
  }

  /**
   * Checks if there is a previous track
   * 
   * @returns {boolean} True if there is a previous track
   */
  hasPrevious() {
    return this.isLoaded && this.currentIndex > 0;
  }

  /**
   * Resolves a relative path to absolute
   * 
   * @param {string} filePath - Relative or absolute path
   * @returns {string} Absolute path
   */
  resolvePath(filePath) {
    if (!filePath) return filePath;
    if (filePath.startsWith('/')) return filePath;
    return resolve(this.playlistDir, filePath);
  }

  /**
   * Gets all tracks
   * 
   * @returns {Array} All tracks
   */
  getAllTracks() {
    return this.tracks;
  }

  /**
   * Gets track count
   * 
   * @returns {number} Number of tracks
   */
  getTrackCount() {
    return this.tracks.length;
  }

  /**
   * Gets current track index
   * 
   * @returns {number} Current index
   */
  getCurrentIndex() {
    return this.currentIndex;
  }

  /**
   * Gets playlist name
   * 
   * @returns {string} Playlist name
   */
  getPlaylistName() {
    return this.playlistName;
  }

  /**
   * Gets playlist metadata
   * 
   * @returns {Object} Metadata
   */
  getMetadata() {
    return this.playlistMetadata;
  }

  /**
   * Gets playback progress
   * 
   * @returns {Object} Progress info
   */
  getProgress() {
    if (!this.isLoaded) {
      return { current: 0, total: 0, percent: 0 };
    }
    
    return {
      current: this.currentIndex + 1,
      total: this.tracks.length,
      percent: ((this.currentIndex + 1) / this.tracks.length) * 100
    };
  }

  /**
   * Resets to the beginning
   */
  reset() {
    this.currentIndex = 0;
    this.playHistory = [];
    if (this.options.shuffle) {
      this.shuffleTracks();
    }
  }

  /**
   * Gets play history
   * 
   * @returns {Array} History of played tracks
   */
  getHistory() {
    return this.playHistory;
  }

  /**
   * Gets remaining tracks
   * 
   * @returns {Array} Tracks yet to play
   */
  getRemainingTracks() {
    if (!this.isLoaded) return [];
    
    const remaining = [];
    for (let i = this.currentIndex + 1; i < this.tracks.length; i++) {
      const index = this.options.shuffle ? this.shuffledIndices[i] : i;
      remaining.push(this.tracks[index]);
    }
    return remaining;
  }

  /**
   * Checks if a track exists at index
   * 
   * @param {number} index - Track index
   * @returns {boolean} True if valid index
   */
  isValidIndex(index) {
    return this.isLoaded && index >= 0 && index < this.tracks.length;
  }

  /**
   * Gets track at specific index
   * 
   * @param {number} index - Track index
   * @returns {Object|null} Track or null
   */
  getTrackAt(index) {
    if (!this.isValidIndex(index)) return null;
    return this.tracks[index];
  }

  /**
   * Finds track by name
   * 
   * @param {string} name - Track name to search for
   * @returns {number} Index or -1 if not found
   */
  findTrackByName(name) {
    return this.tracks.findIndex(track => track.name === name);
  }

  /**
   * Updates playlist options
   * 
   * @param {Object} options - New options
   */
  updateOptions(options) {
    const oldShuffle = this.options.shuffle;
    
    this.options = {
      ...this.options,
      ...options
    };
    
    // Reshuffle if shuffle mode changed to true
    if (!oldShuffle && this.options.shuffle) {
      this.shuffleTracks();
    }
  }
}

export default {
  PlaylistController
};
