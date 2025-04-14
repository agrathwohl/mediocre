import fs from 'fs';
import path from 'path';
import chalk from 'chalk';
import { config } from '../utils/config.js';
import { 
  sortByAge, 
  sortByLength, 
  sortByTitle, 
  filterByGenre,
  getMusicPieceInfo,
  generateMoreLikeThis
} from '../utils/dataset-utils.js';

/**
 * Format file information for display
 * @param {Object} fileInfo - File info object
 * @returns {string} Formatted string
 */
function formatFileInfo(fileInfo) {
  const date = new Date(fileInfo.created).toLocaleDateString();
  const time = new Date(fileInfo.created).toLocaleTimeString();
  const size = (fileInfo.size / 1024 / 1024).toFixed(2) + ' MB';
  return `${chalk.green(fileInfo.basename)} (${size}) - ${date} ${time}`;
}

/**
 * Lists all compositions in the dataset with various sorting options
 * @param {Object} options - Command options
 * @param {string} [options.sort] - Sort method: 'age', 'length', 'title'
 * @param {string} [options.genre] - Genre to filter by
 * @param {string} [options.directory] - Directory to search in
 * @param {number} [options.limit] - Limit the number of results
 * @returns {Promise<Array>} List of sorted files
 */
export async function listCompositions(options) {
  const directory = options.directory || config.get('outputDir');
  const limit = options.limit ? parseInt(options.limit, 10) : null;
  
  // Apply sorting and filtering
  let results;
  
  if (options.genre) {
    results = filterByGenre(options.genre, directory);
    console.log(chalk.blue(`\nFiltering by genre: ${options.genre}`));
  } else {
    switch (options.sort) {
      case 'length':
        console.log(chalk.blue('\nSorting by length...'));
        results = await sortByLength(directory);
        break;
      case 'title':
        console.log(chalk.blue('\nSorting by title...'));
        results = sortByTitle(directory);
        break;
      case 'age':
      default:
        console.log(chalk.blue('\nSorting by age (newest first)...'));
        results = sortByAge(directory);
        break;
    }
  }
  
  // Apply limit if specified
  if (limit && limit > 0) {
    results = results.slice(0, limit);
  }
  
  // Display results
  console.log(chalk.yellow(`\nFound ${results.length} compositions:`));
  results.forEach((file, index) => {
    console.log(`${index + 1}. ${formatFileInfo(file)}`);
  });
  
  return results;
}

/**
 * Display detailed information about a specific composition
 * @param {Object} options - Command options
 * @param {string} options.filename - Filename or base filename of the composition
 * @param {string} [options.directory] - Directory to search in
 * @returns {Object} Composition information
 */
export function displayCompositionInfo(options) {
  const directory = options.directory || config.get('outputDir');
  const filename = options.filename;
  
  if (!filename) {
    throw new Error('Filename is required');
  }
  
  // Get detailed composition information
  const info = getMusicPieceInfo(filename, directory);
  
  if (!info.files || Object.keys(info.files).length === 0) {
    console.log(chalk.red(`No files found for "${filename}"`));
    return null;
  }
  
  // Display composition information
  console.log(chalk.blue('\n=== Composition Information ==='));
  console.log(chalk.yellow('Title:'), info.title || 'Unknown');
  console.log(chalk.yellow('Genre:'), info.genre || 'Unknown');
  console.log(chalk.yellow('Base Filename:'), info.baseFilename);
  
  if (info.instruments && info.instruments.length > 0) {
    console.log(chalk.yellow('Instruments:'), info.instruments.join(', '));
  }
  
  // List all associated files
  console.log(chalk.blue('\n=== Associated Files ==='));
  
  if (info.files.abc) {
    console.log(chalk.green('ABC Notation:'), path.basename(info.files.abc.path));
  }
  
  if (info.files.midi && info.files.midi.length > 0) {
    console.log(chalk.green('MIDI Files:'));
    info.files.midi.forEach(file => {
      console.log(`  - ${path.basename(file.path)}`);
    });
  }
  
  if (info.files.wav && info.files.wav.length > 0) {
    console.log(chalk.green('WAV Files:'));
    info.files.wav.forEach(file => {
      console.log(`  - ${path.basename(file.path)}`);
    });
  }
  
  if (info.files.description) {
    console.log(chalk.green('Description:'), path.basename(info.files.description.path));
  }
  
  if (info.files.markdown) {
    console.log(chalk.green('Markdown:'), path.basename(info.files.markdown.path));
  }
  
  // Display composition analysis from description if available
  if (info.files.description && info.files.description.content.analysis) {
    console.log(chalk.blue('\n=== Composition Analysis ==='));
    const analysis = info.files.description.content.analysis.split('\n\n')[0]; // Display just the first paragraph
    console.log(analysis);
    console.log(chalk.gray('(Use --show-full-analysis to display the complete analysis)'));
  }
  
  if (options.showFullAnalysis && info.files.description && info.files.description.content.analysis) {
    console.log(chalk.blue('\n=== Full Analysis ==='));
    console.log(info.files.description.content.analysis);
  }
  
  return info;
}

/**
 * Create more compositions similar to the specified one
 * @param {Object} options - Command options
 * @param {string} options.filename - Filename or base filename of the reference composition
 * @param {number} [options.count] - Number of compositions to generate
 * @param {string} [options.directory] - Directory to search in
 * @returns {Promise<Array<string>>} Array of new composition file paths
 */
export async function createMoreLikeThis(options) {
  const directory = options.directory || config.get('outputDir');
  const filename = options.filename;
  const count = options.count ? parseInt(options.count, 10) : 1;
  
  if (!filename) {
    throw new Error('Filename is required');
  }
  
  console.log(chalk.blue(`\nGenerating ${count} composition(s) similar to "${filename}"...`));
  
  try {
    // Generate similar compositions
    const newFiles = await generateMoreLikeThis(filename, count, directory);
    
    console.log(chalk.green(`\nGenerated ${newFiles.length} new composition(s):`));
    newFiles.forEach(file => {
      console.log(`- ${path.basename(file)}`);
    });
    
    return newFiles;
  } catch (error) {
    console.error(chalk.red('\nError generating compositions:'), error.message);
    throw error;
  }
}