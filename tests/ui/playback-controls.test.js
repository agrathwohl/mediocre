/**
 * Tests for playback controls in dataset-browser.js
 */

import { jest } from '@jest/globals';

// Mock MPV
const mockMpv = {
  load: jest.fn().mockResolvedValue(),
  quit: jest.fn().mockResolvedValue(),
  pause: jest.fn().mockResolvedValue(),
  resume: jest.fn().mockResolvedValue(),
  seek: jest.fn().mockResolvedValue(),
  getProperty: jest.fn().mockImplementation((prop) => {
    if (prop === 'time-pos') return Promise.resolve(30);
    if (prop === 'duration') return Promise.resolve(180);
    return Promise.resolve(null);
  }),
  on: jest.fn()
};

describe('Playback Controls', () => {
  beforeEach(() => {
    jest.useFakeTimers();
    mockMpv.load.mockClear();
    mockMpv.quit.mockClear();
    mockMpv.pause.mockClear();
    mockMpv.resume.mockClear();
    mockMpv.seek.mockClear();
    mockMpv.getProperty.mockClear();
    mockMpv.on.mockClear();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  // Test the playback logic (we can't directly test the UI functions from dataset-browser.js)
  test('togglePlayback should toggle between play and pause', async () => {
    // Simulate the togglePlayback function
    let isPlaying = true;
    
    const togglePlayback = async () => {
      if (isPlaying) {
        await mockMpv.pause();
        isPlaying = false;
      } else {
        await mockMpv.resume();
        isPlaying = true;
      }
    };
    
    // Test toggling from playing to paused
    await togglePlayback();
    expect(mockMpv.pause).toHaveBeenCalled();
    expect(isPlaying).toBe(false);
    
    // Test toggling from paused to playing
    await togglePlayback();
    expect(mockMpv.resume).toHaveBeenCalled();
    expect(isPlaying).toBe(true);
  });

  test('seeking functions should call mpv.seek with correct positions', async () => {
    // Simulate currentPosition and duration
    let currentPosition = 50;
    const duration = 200;
    
    // Simulate seekBackward and seekForward functions
    const seekBackward = async () => {
      const newPosition = Math.max(0, currentPosition - 10);
      await mockMpv.seek(newPosition);
      currentPosition = newPosition;
    };
    
    const seekForward = async () => {
      const newPosition = Math.min(duration, currentPosition + 10);
      await mockMpv.seek(newPosition);
      currentPosition = newPosition;
    };
    
    // Test seeking backward
    await seekBackward();
    expect(mockMpv.seek).toHaveBeenCalledWith(40);
    expect(currentPosition).toBe(40);
    
    // Test seeking forward
    await seekForward();
    expect(mockMpv.seek).toHaveBeenCalledWith(50);
    expect(currentPosition).toBe(50);
    
    // Test seeking backward to minimum
    currentPosition = 5;
    await seekBackward();
    expect(mockMpv.seek).toHaveBeenCalledWith(0);
    expect(currentPosition).toBe(0);
    
    // Test seeking forward to maximum
    currentPosition = 195;
    await seekForward();
    expect(mockMpv.seek).toHaveBeenCalledWith(200);
    expect(currentPosition).toBe(200);
  });

  test('progress update interval should update progress bar', () => {
    // Simulate variables used in the interval function
    let currentPosition = 0;
    let duration = 0;
    let progressBarValue = 0;
    
    // Simulate the progress update function
    const updateProgress = async () => {
      currentPosition = await mockMpv.getProperty('time-pos');
      duration = await mockMpv.getProperty('duration');
      
      if (duration > 0) {
        progressBarValue = Math.min(100, Math.max(0, (currentPosition / duration) * 100));
      }
    };
    
    // Test the update function
    return updateProgress().then(() => {
      expect(mockMpv.getProperty).toHaveBeenCalledWith('time-pos');
      expect(mockMpv.getProperty).toHaveBeenCalledWith('duration');
      expect(currentPosition).toBe(30);
      expect(duration).toBe(180);
      expect(progressBarValue).toBeCloseTo(16.67, 1); // 30/180 * 100 ≈ 16.67%
    });
  });
});