/**
 * @fileoverview ABC Timing Extractor for ASCII Animation Sync
 * Extracts precise timing information from ABC notation for creating synchronized animations
 */

import { extractAbcVoices } from './abc-voice-parser.js';

/**
 * Parse ABC headers for timing information
 * @param {string} abcContent - The ABC notation content
 * @returns {Object} Parsed headers
 */
function parseAbcHeaders(abcContent) {
  const headers = {
    tempo: null,
    defaultNoteLength: null,
    meter: null,
    key: null
  };

  const lines = abcContent.split('\n');

  for (const line of lines) {
    // Stop at first non-header line (music content starts)
    if (line.match(/^\[?[A-Ga-g]/)) break;

    // Parse tempo (Q:1/4=120 or Q:120 or Q:"Allegro" 1/4=120)
    if (line.startsWith('Q:')) {
      const tempoMatch = line.match(/Q:.*?(\d+\/\d+)\s*=\s*(\d+)/) ||
                         line.match(/Q:\s*(\d+)/);
      if (tempoMatch) {
        if (tempoMatch[2]) {
          // Format: Q:1/4=120
          headers.tempo = {
            noteValue: tempoMatch[1],
            bpm: parseInt(tempoMatch[2])
          };
        } else {
          // Format: Q:120 (assumes quarter note)
          headers.tempo = {
            noteValue: '1/4',
            bpm: parseInt(tempoMatch[1])
          };
        }
      }
    }

    // Parse default note length (L:1/8)
    if (line.startsWith('L:')) {
      const lengthMatch = line.match(/L:\s*(\d+\/\d+)/);
      if (lengthMatch) {
        headers.defaultNoteLength = lengthMatch[1];
      }
    }

    // Parse meter/time signature (M:4/4 or M:C)
    if (line.startsWith('M:')) {
      const meterMatch = line.match(/M:\s*([^\s]+)/);
      if (meterMatch) {
        const meter = meterMatch[1];
        if (meter === 'C') {
          headers.meter = '4/4';
        } else if (meter === 'C|') {
          headers.meter = '2/2';
        } else {
          headers.meter = meter;
        }
      }
    }

    // Parse key signature
    if (line.startsWith('K:')) {
      const keyMatch = line.match(/K:\s*([^\s]+)/);
      if (keyMatch) {
        headers.key = keyMatch[1];
      }
    }
  }

  // Set defaults if not specified
  if (!headers.tempo) {
    headers.tempo = { noteValue: '1/4', bpm: 120 }; // Default 120 BPM quarter notes
  }
  if (!headers.defaultNoteLength) {
    headers.defaultNoteLength = '1/8'; // Default eighth note
  }
  if (!headers.meter) {
    headers.meter = '4/4'; // Default 4/4 time
  }

  return headers;
}

/**
 * Main function to extract timing map from ABC file
 * @param {string} abcContent - ABC notation content
 * @returns {Object} Timing map with events and metadata
 */
export function extractTimingMap(abcContent) {
  const headers = parseAbcHeaders(abcContent);
  const voices = extractAbcVoices(abcContent);
  const timingMap = {
    metadata: {
      tempo: headers.tempo || { noteValue: '1/4', bpm: 120 },
      timeSignature: headers.meter || '4/4',
      defaultNoteLength: headers.defaultNoteLength || '1/8',
      totalDuration: 0,
      voices: voices,
      beatsPerBar: parseTimeSignature(headers.meter || '4/4').beats,
      beatUnit: parseTimeSignature(headers.meter || '4/4').unit
    },
    events: [],
    measures: [],
    voiceData: {}
  };

  // Calculate timing constants
  const bpm = parseTempo(timingMap.metadata.tempo);
  const secondsPerBeat = 60 / bpm;
  const defaultNoteDuration = parseFraction(timingMap.metadata.defaultNoteLength);

  // Parse each voice separately
  voices.forEach(voice => {
    const voiceEvents = parseVoiceTimings(
      abcContent,
      voice.voice,
      secondsPerBeat,
      defaultNoteDuration
    );
    timingMap.voiceData[voice.voice] = {
      name: voice.name,
      events: voiceEvents
    };
  });

  // Merge all voice events into a unified timeline
  timingMap.events = mergeVoiceEvents(timingMap.voiceData);

  // Calculate measures and bars
  timingMap.measures = calculateMeasures(
    timingMap.events,
    timingMap.metadata.beatsPerBar,
    secondsPerBeat
  );

  // Calculate total duration
  if (timingMap.events.length > 0) {
    const lastEvent = timingMap.events[timingMap.events.length - 1];
    timingMap.metadata.totalDuration = lastEvent.endTime || lastEvent.startTime;
  }

  return timingMap;
}

/**
 * Parse tempo information
 * @param {Object} tempo - Tempo object with noteValue and bpm
 * @returns {number} BPM as a number
 */
function parseTempo(tempo) {
  if (typeof tempo === 'number') return tempo;
  if (typeof tempo === 'object' && tempo.bpm) return tempo.bpm;
  return 120; // Default BPM
}

/**
 * Parse time signature
 * @param {string} timeSignature - Time signature like "4/4"
 * @returns {Object} Object with beats and unit
 */
function parseTimeSignature(timeSignature) {
  const parts = timeSignature.split('/');
  return {
    beats: parseInt(parts[0]) || 4,
    unit: parseInt(parts[1]) || 4
  };
}

/**
 * Parse fraction string
 * @param {string} fraction - Fraction like "1/8"
 * @returns {number} Decimal value
 */
function parseFraction(fraction) {
  const parts = fraction.split('/');
  if (parts.length === 2) {
    return parseInt(parts[0]) / parseInt(parts[1]);
  }
  return parseFloat(fraction) || 1;
}

/**
 * Parse timing for a specific voice
 * @param {string} abcContent - Full ABC content
 * @param {string} voiceId - Voice ID to parse
 * @param {number} secondsPerBeat - Seconds per beat
 * @param {number} defaultNoteDuration - Default note duration as fraction
 * @returns {Array} Array of timing events
 */
function parseVoiceTimings(abcContent, voiceId, secondsPerBeat, defaultNoteDuration) {
  const events = [];
  let currentTime = 0;
  let currentBar = 1;
  let beatInBar = 0;

  // Extract voice content
  const voiceContent = extractVoiceContent(abcContent, voiceId);
  if (!voiceContent) return events;

  // Parse notes and rests
  const notePattern = /([A-Ga-g,']|z|\[.*?\])(\d*)(\/)?([\d]*)/g;
  let match;

  while ((match = notePattern.exec(voiceContent)) !== null) {
    const element = match[1];
    const multiplier = match[2] || '1';
    const divider = match[4] || '1';

    // Calculate duration
    let duration = defaultNoteDuration;
    if (match[2] || match[3]) {
      if (match[3]) {
        // Fractional duration (e.g., C/2)
        duration = defaultNoteDuration * (parseInt(multiplier) / parseInt(divider));
      } else {
        // Multiplied duration (e.g., C2)
        duration = defaultNoteDuration * parseInt(multiplier);
      }
    }

    const durationInSeconds = duration * secondsPerBeat / defaultNoteDuration;

    // Create event
    const event = {
      type: element === 'z' ? 'rest' : 'note',
      startTime: currentTime,
      endTime: currentTime + durationInSeconds,
      duration: durationInSeconds,
      voice: voiceId,
      bar: currentBar,
      beatInBar: Math.floor(beatInBar),
      element: element
    };

    // Parse note details if it's a note
    if (element !== 'z') {
      if (element.startsWith('[')) {
        // Chord
        event.type = 'chord';
        event.notes = parseChord(element);
      } else {
        // Single note
        event.pitch = parseNotePitch(element);
        event.octave = getNoteOctave(element);
      }
    }

    events.push(event);
    currentTime += durationInSeconds;
    beatInBar += duration;

    // Check for bar changes (simplified - real ABC is more complex)
    if (voiceContent[match.index + match[0].length] === '|') {
      currentBar++;
      beatInBar = 0;
    }
  }

  return events;
}

/**
 * Extract content for a specific voice
 * @param {string} abcContent - Full ABC content
 * @param {string} voiceId - Voice ID
 * @returns {string} Voice content
 */
function extractVoiceContent(abcContent, voiceId) {
  const lines = abcContent.split('\n');
  let currentVoice = null;
  let voiceContent = '';
  let foundVoice = false;

  for (const line of lines) {
    // Check for voice declaration
    const voiceMatch = line.match(/^V:\s*(\S+)/);
    if (voiceMatch) {
      currentVoice = voiceMatch[1];
      foundVoice = true;
      continue;
    }

    // If we're in the right voice, collect the content
    if (currentVoice === voiceId || (!foundVoice && voiceId === '1')) {
      // Skip comments and empty lines
      if (!line.startsWith('%') && line.trim()) {
        voiceContent += ' ' + line;
      }
    }
  }

  return voiceContent;
}

/**
 * Parse chord notation
 * @param {string} chordString - Chord string like "[ceg]"
 * @returns {Array} Array of note pitches
 */
function parseChord(chordString) {
  const notes = [];
  const cleaned = chordString.replace(/[\[\]]/g, '');
  const notePattern = /[A-Ga-g][,']*|\^[A-Ga-g][,']*/g;
  let match;

  while ((match = notePattern.exec(cleaned)) !== null) {
    notes.push({
      pitch: parseNotePitch(match[0]),
      octave: getNoteOctave(match[0])
    });
  }

  return notes;
}

/**
 * Parse note pitch
 * @param {string} noteStr - Note string
 * @returns {string} Note pitch (C, D, E, etc.)
 */
function parseNotePitch(noteStr) {
  const noteMatch = noteStr.match(/[A-Ga-g]/);
  if (!noteMatch) return null;

  let note = noteMatch[0].toUpperCase();

  // Check for accidentals
  if (noteStr.includes('^')) {
    note += '#';
  } else if (noteStr.includes('_')) {
    note += 'b';
  }

  return note;
}

/**
 * Get note octave
 * @param {string} noteStr - Note string
 * @returns {number} Octave number
 */
function getNoteOctave(noteStr) {
  let octave = 4; // Default middle octave

  // Uppercase letters are lower octave
  if (noteStr.match(/[A-G]/)) {
    octave = 3;
  }

  // Count apostrophes (higher octaves)
  const apostrophes = (noteStr.match(/'/g) || []).length;
  octave += apostrophes;

  // Count commas (lower octaves)
  const commas = (noteStr.match(/,/g) || []).length;
  octave -= commas;

  return octave;
}

/**
 * Merge events from all voices into a unified timeline
 * @param {Object} voiceData - Object with voice events
 * @returns {Array} Sorted array of all events
 */
function mergeVoiceEvents(voiceData) {
  const allEvents = [];

  for (const voiceId in voiceData) {
    allEvents.push(...voiceData[voiceId].events);
  }

  // Sort by start time
  allEvents.sort((a, b) => a.startTime - b.startTime);

  return allEvents;
}

/**
 * Calculate measure boundaries
 * @param {Array} events - Array of timing events
 * @param {number} beatsPerBar - Beats per measure
 * @param {number} secondsPerBeat - Seconds per beat
 * @returns {Array} Array of measure objects
 */
function calculateMeasures(events, beatsPerBar, secondsPerBeat) {
  const measures = [];
  const measureDuration = beatsPerBar * secondsPerBeat;
  let currentMeasure = 1;
  let measureStartTime = 0;

  while (measureStartTime < (events[events.length - 1]?.endTime || 0)) {
    measures.push({
      number: currentMeasure,
      startTime: measureStartTime,
      endTime: measureStartTime + measureDuration,
      events: events.filter(e =>
        e.startTime >= measureStartTime &&
        e.startTime < measureStartTime + measureDuration
      )
    });

    measureStartTime += measureDuration;
    currentMeasure++;
  }

  return measures;
}

/**
 * Generate animation map for terminal display
 * @param {Object} timingMap - Timing map object
 * @param {number} fps - Frames per second for animation
 * @returns {Array} Array of animation frames
 */
export function generateAnimationMap(timingMap, fps = 30) {
  const frames = [];
  const frameDuration = 1 / fps;
  const totalFrames = Math.ceil(timingMap.metadata.totalDuration * fps);

  for (let frameIndex = 0; frameIndex < totalFrames; frameIndex++) {
    const currentTime = frameIndex * frameDuration;

    // Find active events at this time
    const activeEvents = timingMap.events.filter(event =>
      currentTime >= event.startTime && currentTime < event.endTime
    );

    // Create frame data
    const frame = {
      index: frameIndex,
      time: currentTime,
      activeNotes: activeEvents.filter(e => e.type === 'note'),
      activeChords: activeEvents.filter(e => e.type === 'chord'),
      activeRests: activeEvents.filter(e => e.type === 'rest'),
      measure: timingMap.measures.find(m =>
        currentTime >= m.startTime && currentTime < m.endTime
      )?.number || 0,
      beat: Math.floor((currentTime % (60 / parseTempo(timingMap.metadata.tempo))) *
              parseTempo(timingMap.metadata.tempo) / 60) + 1
    };

    frames.push(frame);
  }

  return frames;
}

/**
 * Export timing map to JSON file
 * @param {Object} timingMap - Timing map object
 * @param {string} outputPath - Path for output file
 */
export async function exportTimingMap(timingMap, outputPath) {
  const fs = await import('fs/promises');

  try {
    await fs.writeFile(
      outputPath,
      JSON.stringify(timingMap, null, 2),
      'utf-8'
    );
    console.log(`Timing map exported to: ${outputPath}`);
  } catch (error) {
    console.error('Error exporting timing map:', error);
    throw error;
  }
}

/**
 * Create simplified animation data for ASCII visualization
 * @param {Object} timingMap - Timing map object
 * @returns {Object} Simplified animation data
 */
export function createSimplifiedAnimationData(timingMap) {
  const animationData = {
    metadata: {
      duration: timingMap.metadata.totalDuration,
      bpm: parseTempo(timingMap.metadata.tempo),
      voices: timingMap.metadata.voices.map(v => ({
        id: v.voice,
        name: v.name
      }))
    },
    timeline: []
  };

  // Sample at 10 FPS for simpler animation
  const sampleRate = 0.1; // 100ms intervals
  const samples = Math.ceil(timingMap.metadata.totalDuration / sampleRate);

  for (let i = 0; i < samples; i++) {
    const time = i * sampleRate;

    // Get active voices at this time
    const activeVoices = {};

    for (const voiceId in timingMap.voiceData) {
      const voiceEvents = timingMap.voiceData[voiceId].events;
      const activeEvent = voiceEvents.find(e =>
        time >= e.startTime && time < e.endTime
      );

      if (activeEvent) {
        activeVoices[voiceId] = {
          type: activeEvent.type,
          intensity: getIntensity(activeEvent, time),
          pitch: activeEvent.pitch,
          octave: activeEvent.octave
        };
      }
    }

    animationData.timeline.push({
      time: time,
      activeVoices: activeVoices
    });
  }

  return animationData;
}

/**
 * Calculate note intensity for animation (0-1)
 * @param {Object} event - Note event
 * @param {number} currentTime - Current time
 * @returns {number} Intensity value
 */
function getIntensity(event, currentTime) {
  const elapsed = currentTime - event.startTime;
  const duration = event.duration;

  // Simple envelope: attack, sustain, decay
  if (elapsed < duration * 0.1) {
    // Attack phase
    return elapsed / (duration * 0.1);
  } else if (elapsed < duration * 0.8) {
    // Sustain phase
    return 1.0;
  } else {
    // Decay phase
    return 1.0 - ((elapsed - duration * 0.8) / (duration * 0.2));
  }
}