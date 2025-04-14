import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { config } from './config.js';
import { execaCommand } from 'execa';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/**
 * Get file stats including size, creation time, and modification time
 * @param {string} filePath - Path to the file
 * @returns {Object} File stats with added basename
 */
function getFileStats(filePath) {
  const stats = fs.statSync(filePath);
  return {
    path: filePath,
    basename: path.basename(filePath),
    size: stats.size,
    created: stats.birthtime,
    modified: stats.mtime,
  };
}

/**
 * Sorts audio files by creation date (newest first)
 * @param {string} directory - Directory to search (defaults to output dir)
 * @param {string} extension - File extension to filter by (defaults to 'wav')
 * @returns {Array<Object>} Sorted array of file objects with stats
 */
export function sortByAge(directory = config.get('outputDir'), extension = 'wav') {
  const files = fs.readdirSync(directory)
    .filter(file => file.endsWith(`.${extension}`))
    .map(file => getFileStats(path.join(directory, file)));
  
  return files.sort((a, b) => b.created - a.created);
}

/**
 * Sorts audio files by length (duration)
 * @param {string} directory - Directory to search (defaults to output dir)
 * @param {string} extension - File extension to filter by (defaults to 'wav')
 * @returns {Promise<Array<Object>>} Sorted array of file objects with duration info
 */
export async function sortByLength(directory = config.get('outputDir'), extension = 'wav') {
  const files = fs.readdirSync(directory)
    .filter(file => file.endsWith(`.${extension}`))
    .map(file => path.join(directory, file));

  const filesWithDuration = await Promise.all(
    files.map(async (filePath) => {
      try {
        // Use ffprobe (if available) to get duration
        const { stdout } = await execaCommand(
          `ffprobe -v error -show_entries format=duration -of default=noprint_wrappers=1:nokey=1 "${filePath}"`
        );
        const duration = parseFloat(stdout.trim());
        const stats = getFileStats(filePath);
        return { ...stats, duration };
      } catch (error) {
        // Fallback to file size if ffprobe fails
        const stats = getFileStats(filePath);
        return { ...stats, duration: null };
      }
    })
  );

  // Sort by duration (falling back to size if duration is not available)
  return filesWithDuration.sort((a, b) => {
    if (a.duration && b.duration) return b.duration - a.duration;
    return b.size - a.size;
  });
}

/**
 * Sorts audio files by title (alphabetically)
 * @param {string} directory - Directory to search (defaults to output dir)
 * @param {string} extension - File extension to filter by (defaults to 'wav')
 * @returns {Array<Object>} Sorted array of file objects
 */
export function sortByTitle(directory = config.get('outputDir'), extension = 'wav') {
  const files = fs.readdirSync(directory)
    .filter(file => file.endsWith(`.${extension}`))
    .map(file => getFileStats(path.join(directory, file)));
  
  return files.sort((a, b) => {
    // Extract title from filename (strip off timestamp and extensions)
    const titleA = a.basename.replace(/(-score\d+-\d+)(\.\w+)+$/, '');
    const titleB = b.basename.replace(/(-score\d+-\d+)(\.\w+)+$/, '');
    return titleA.localeCompare(titleB);
  });
}

/**
 * Filters audio files by genre
 * @param {string} genre - Genre to filter by
 * @param {string} directory - Directory to search (defaults to output dir)
 * @param {string} extension - File extension to filter by (defaults to 'wav')
 * @returns {Array<Object>} Filtered array of file objects
 */
export function filterByGenre(genre, directory = config.get('outputDir'), extension = 'wav') {
  const files = fs.readdirSync(directory)
    .filter(file => file.endsWith(`.${extension}`))
    .filter(file => file.toLowerCase().includes(genre.toLowerCase()))
    .map(file => getFileStats(path.join(directory, file)));
  
  return files;
}

/**
 * Gets all related files for a music piece (ABC, MIDI, WAV, description)
 * @param {string} baseFilename - Base filename without extension
 * @param {string} directory - Directory to search (defaults to output dir)
 * @returns {Object} Object containing all related files and metadata
 */
export function getMusicPieceInfo(baseFilename, directory = config.get('outputDir')) {
  // Extract base name without extension if a full filename is provided
  if (baseFilename.includes('.')) {
    baseFilename = baseFilename.substring(0, baseFilename.lastIndexOf('.'));
  }
  
  // Remove MIDI numbering if present (e.g. "piece1" from "piece1.mid")
  baseFilename = baseFilename.replace(/(\d+)\.mid$/, '');

  const files = {};
  
  // Find ABC notation file
  const abcPath = path.join(directory, `${baseFilename}.abc`);
  if (fs.existsSync(abcPath)) {
    files.abc = {
      path: abcPath,
      content: fs.readFileSync(abcPath, 'utf8')
    };
  }
  
  // Find MIDI file(s)
  const midiFiles = fs.readdirSync(directory)
    .filter(file => file.startsWith(baseFilename) && file.endsWith('.mid'));
  
  if (midiFiles.length > 0) {
    files.midi = midiFiles.map(file => ({
      path: path.join(directory, file),
      stats: getFileStats(path.join(directory, file))
    }));
  }
  
  // Find WAV file(s)
  const wavFiles = fs.readdirSync(directory)
    .filter(file => file.startsWith(baseFilename) && file.endsWith('.wav'));
  
  if (wavFiles.length > 0) {
    files.wav = wavFiles.map(file => ({
      path: path.join(directory, file),
      stats: getFileStats(path.join(directory, file))
    }));
  }
  
  // Find description file (JSON)
  const descriptionPath = path.join(directory, `${baseFilename}_description.json`);
  if (fs.existsSync(descriptionPath)) {
    files.description = {
      path: descriptionPath,
      content: JSON.parse(fs.readFileSync(descriptionPath, 'utf8'))
    };
  }
  
  // Find markdown file
  const mdPath = path.join(directory, `${baseFilename}.md`);
  if (fs.existsSync(mdPath)) {
    files.markdown = {
      path: mdPath,
      content: fs.readFileSync(mdPath, 'utf8')
    };
  }
  
  // Extract genre information
  let genre = null;
  if (files.description && files.description.content.genre) {
    genre = files.description.content.genre;
  } else if (baseFilename.includes('_x_')) {
    genre = baseFilename.replace(/(-score\d+-\d+)$/, '');
  }
  
  // Extract title from ABC if available
  let title = null;
  if (files.abc && files.abc.content) {
    const titleMatch = files.abc.content.match(/T:(.+)$/m);
    if (titleMatch && titleMatch[1]) {
      title = titleMatch[1].trim();
    }
  }
  
  // Extract instruments from ABC if available
  let instruments = [];
  if (files.abc && files.abc.content) {
    const programMatches = files.abc.content.matchAll(/%%MIDI\s+program\s+(?:\d+\s+)?(\d+)/g);
    const gMidiInstruments = [
      'Acoustic Grand Piano', 'Bright Acoustic Piano', 'Electric Grand Piano', 'Honky-tonk Piano',
      'Electric Piano 1', 'Electric Piano 2', 'Harpsichord', 'Clavi',
      'Celesta', 'Glockenspiel', 'Music Box', 'Vibraphone',
      'Marimba', 'Xylophone', 'Tubular Bells', 'Dulcimer',
      'Drawbar Organ', 'Percussive Organ', 'Rock Organ', 'Church Organ',
      'Reed Organ', 'Accordion', 'Harmonica', 'Tango Accordion',
      'Acoustic Guitar (nylon)', 'Acoustic Guitar (steel)', 'Electric Guitar (jazz)', 'Electric Guitar (clean)',
      'Electric Guitar (muted)', 'Overdriven Guitar', 'Distortion Guitar', 'Guitar harmonics',
      'Acoustic Bass', 'Electric Bass (finger)', 'Electric Bass (pick)', 'Fretless Bass',
      'Slap Bass 1', 'Slap Bass 2', 'Synth Bass 1', 'Synth Bass 2',
      'Violin', 'Viola', 'Cello', 'Contrabass',
      'Tremolo Strings', 'Pizzicato Strings', 'Orchestral Harp', 'Timpani',
      'String Ensemble 1', 'String Ensemble 2', 'Synth Strings 1', 'Synth Strings 2',
      'Choir Aahs', 'Voice Oohs', 'Synth Voice', 'Orchestra Hit',
      'Trumpet', 'Trombone', 'Tuba', 'Muted Trumpet',
      'French Horn', 'Brass Section', 'Synth Brass 1', 'Synth Brass 2',
      'Soprano Sax', 'Alto Sax', 'Tenor Sax', 'Baritone Sax',
      'Oboe', 'English Horn', 'Bassoon', 'Clarinet',
      'Piccolo', 'Flute', 'Recorder', 'Pan Flute',
      'Blown Bottle', 'Shakuhachi', 'Whistle', 'Ocarina',
      'Lead 1 (square)', 'Lead 2 (sawtooth)', 'Lead 3 (calliope)', 'Lead 4 (chiff)',
      'Lead 5 (charang)', 'Lead 6 (voice)', 'Lead 7 (fifths)', 'Lead 8 (bass + lead)',
      'Pad 1 (new age)', 'Pad 2 (warm)', 'Pad 3 (polysynth)', 'Pad 4 (choir)',
      'Pad 5 (bowed)', 'Pad 6 (metallic)', 'Pad 7 (halo)', 'Pad 8 (sweep)',
      'FX 1 (rain)', 'FX 2 (soundtrack)', 'FX 3 (crystal)', 'FX 4 (atmosphere)',
      'FX 5 (brightness)', 'FX 6 (goblins)', 'FX 7 (echoes)', 'FX 8 (sci-fi)',
      'Sitar', 'Banjo', 'Shamisen', 'Koto',
      'Kalimba', 'Bag pipe', 'Fiddle', 'Shanai',
      'Tinkle Bell', 'Agogo', 'Steel Drums', 'Woodblock',
      'Taiko Drum', 'Melodic Tom', 'Synth Drum', 'Reverse Cymbal',
      'Guitar Fret Noise', 'Breath Noise', 'Seashore', 'Bird Tweet',
      'Telephone Ring', 'Helicopter', 'Applause', 'Gunshot'
    ];
    
    for (const match of programMatches) {
      const programNumber = parseInt(match[1], 10);
      if (programNumber >= 1 && programNumber <= 128) {
        const instrumentName = gMidiInstruments[programNumber - 1];
        instruments.push(instrumentName);
      }
    }
    
    // Check for guitar chords
    if (files.abc.content.includes('%%MIDI gchord')) {
      instruments.push('Guitar Chords');
    }
    
    // Remove duplicates
    instruments = [...new Set(instruments)];
  }
  
  return {
    title,
    genre,
    baseFilename,
    instruments,
    files
  };
}

/**
 * Generates more compositions similar to the specified piece
 * @param {string} baseFilename - Base filename of the reference piece
 * @param {number} count - Number of compositions to generate
 * @param {string} directory - Directory to search (defaults to output dir)
 * @returns {Promise<Array<string>>} Array of new composition file paths
 */
export async function generateMoreLikeThis(baseFilename, count = 1, directory = config.get('outputDir')) {
  // Get details of the reference piece
  const refPiece = getMusicPieceInfo(baseFilename, directory);
  
  if (!refPiece.genre) {
    throw new Error('Could not determine genre of the reference piece');
  }
  
  // Prepare options for generating new pieces
  const genreComponents = refPiece.genre.split('_x_');
  let options = {};
  
  if (genreComponents.length === 2) {
    // If it's a hybrid genre
    options = {
      genre: refPiece.genre,
      count: count.toString(),
      output: directory
    };
  } else {
    // For non-hybrid genres, use the same genre
    options = {
      genre: refPiece.genre,
      count: count.toString(),
      output: directory
    };
  }
  
  // Import the generate function dynamically to avoid circular dependencies
  const { generateAbc } = await import('../commands/generate-abc.js');
  
  // Generate new compositions
  return generateAbc(options);
}