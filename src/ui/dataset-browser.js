import blessed from 'neo-blessed';
import chalk from 'chalk';
import path from 'path';
import { config } from '../utils/config.js';
import { 
  sortByAge, 
  sortByLength, 
  sortByTitle, 
  filterByGenre,
  getMusicPieceInfo,
  generateMoreLikeThis
} from '../utils/dataset-utils.js';
import { execaCommand } from 'execa';

/**
 * Format file size in a human readable way
 * @param {number} bytes - File size in bytes
 * @returns {string} Formatted file size
 */
function formatFileSize(bytes) {
  if (bytes < 1024) return bytes + ' B';
  const units = ['KB', 'MB', 'GB', 'TB'];
  let size = bytes / 1024;
  let unitIndex = 0;
  while (size >= 1024 && unitIndex < units.length - 1) {
    size /= 1024;
    unitIndex++;
  }
  return size.toFixed(2) + ' ' + units[unitIndex];
}

/**
 * Format date in a human readable way
 * @param {Date} date - Date object
 * @returns {string} Formatted date
 */
function formatDate(date) {
  return new Date(date).toLocaleString();
}

/**
 * Create a neo-blessed UI for browsing and interacting with the music dataset
 * @param {Object} options - UI options
 * @param {string} options.directory - Directory to browse
 * @returns {Promise<void>} - Resolves when UI is closed
 */
export async function createDatasetBrowser(options = {}) {
  const directory = options.directory || config.get('outputDir');
  let files = [];
  let selectedFile = null;
  let currentSortMethod = 'age';
  let currentFilterGenre = '';
  let isLoading = false;
  
  // Create blessed screen
  const screen = blessed.screen({
    smartCSR: true,
    title: 'Mediocre - Dataset Browser',
    fullUnicode: true,
    dockBorders: true,
    autoPadding: true
  });
  
  // Create header
  const header = blessed.box({
    top: 0,
    left: 0,
    width: '100%',
    height: 3,
    content: '{center}🎵 Mediocre - Dataset Browser 🎵{/center}',
    tags: true,
    style: {
      fg: 'white',
      bg: 'blue',
      bold: true
    }
  });
  
  // Create file list
  const fileList = blessed.list({
    top: 3,
    left: 0,
    width: '70%',
    height: '60%-3',
    keys: true,
    vi: true,
    mouse: true,
    border: {
      type: 'line'
    },
    style: {
      item: {
        fg: 'white'
      },
      selected: {
        bg: 'blue',
        fg: 'white',
        bold: true
      },
      border: {
        fg: 'blue'
      }
    },
    scrollbar: {
      ch: '│',
      style: {
        bg: 'blue'
      }
    },
    tags: true
  });
  
  // Create details panel
  const detailsPanel = blessed.box({
    top: 3,
    right: 0,
    width: '30%',
    height: '60%-3',
    content: '{center}Select a file to view details{/center}',
    border: {
      type: 'line'
    },
    style: {
      border: {
        fg: 'blue'
      }
    },
    tags: true,
    scrollable: true,
    alwaysScroll: true,
    mouse: true,
    keys: true,
    vi: true,
    scrollbar: {
      ch: '│',
      style: {
        bg: 'blue'
      }
    }
  });
  
  // Create command panel
  const commandPanel = blessed.box({
    bottom: '40%',
    left: 0,
    width: '100%',
    height: 3,
    content: ' {bold}Sort:{/bold} [A]ge | [L]ength | [T]itle  {bold}Filter:{/bold} [G]enre  {bold}Actions:{/bold} [P]lay | [I]nfo | [M]ore Like This | [Q]uit',
    tags: true,
    style: {
      fg: 'white',
      bg: 'gray'
    }
  });
  
  // Create status bar/console output
  const consoleOutput = blessed.log({
    bottom: 0,
    left: 0,
    width: '100%',
    height: '40%-3',
    border: {
      type: 'line'
    },
    tags: true,
    style: {
      border: {
        fg: 'blue'
      }
    },
    keys: true,
    vi: true,
    mouse: true,
    scrollable: true,
    scrollbar: {
      ch: '│',
      style: {
        bg: 'blue'
      }
    }
  });
  
  // Filter input box (hidden by default)
  const filterInput = blessed.textbox({
    bottom: '40%',
    left: 0,
    width: '100%',
    height: 3,
    content: '',
    border: {
      type: 'line'
    },
    style: {
      border: {
        fg: 'yellow'
      },
      focus: {
        border: {
          fg: 'red'
        }
      }
    },
    hidden: true
  });
  
  // Add all elements to the screen
  screen.append(header);
  screen.append(fileList);
  screen.append(detailsPanel);
  screen.append(commandPanel);
  screen.append(consoleOutput);
  screen.append(filterInput);
  
  // Set key handlers
  screen.key(['escape', 'q', 'C-c'], function() {
    return process.exit(0);
  });
  
  // Sort handlers
  screen.key('a', async function() {
    await sortFiles('age');
  });
  
  screen.key('l', async function() {
    await sortFiles('length');
  });
  
  screen.key('t', async function() {
    await sortFiles('title');
  });
  
  // Filter handler
  screen.key('g', function() {
    promptForGenreFilter();
  });
  
  // Action handlers
  screen.key('p', function() {
    playSelectedFile();
  });
  
  screen.key('i', function() {
    showDetailedInfo();
  });
  
  screen.key('m', function() {
    generateMoreLike();
  });
  
  // List selection handler
  fileList.on('select', function(item) {
    if (item && item.content) {
      const index = fileList.getItemIndex(item);
      if (index !== null && index < files.length) {
        selectedFile = files[index];
        showFileDetails(selectedFile);
      }
    }
  });
  
  /**
   * Load files and update the list
   */
  async function loadFiles() {
    setLoading(true);
    consoleOutput.log('Loading files...');
    
    try {
      if (currentFilterGenre) {
        files = filterByGenre(currentFilterGenre, directory);
        consoleOutput.log(`Filtered by genre: ${currentFilterGenre}`);
      } else {
        switch (currentSortMethod) {
          case 'length':
            consoleOutput.log('Sorting by length...');
            files = await sortByLength(directory);
            break;
          case 'title':
            consoleOutput.log('Sorting by title...');
            files = sortByTitle(directory);
            break;
          case 'age':
          default:
            consoleOutput.log('Sorting by age (newest first)...');
            files = sortByAge(directory);
            break;
        }
      }
      
      updateFileList();
      consoleOutput.log(`Found ${files.length} files.`);
    } catch (error) {
      consoleOutput.log(`Error loading files: ${error.message}`);
    } finally {
      setLoading(false);
    }
  }
  
  /**
   * Update the file list display
   */
  function updateFileList() {
    const listItems = files.map(file => {
      const size = formatFileSize(file.size);
      const date = formatDate(file.created);
      const basename = path.basename(file.path);
      // Extract meaningful part of filename (remove timestamp)
      const displayName = basename.replace(/(-score\d+-\d+)(\.\w+)+$/, '');
      
      return `${displayName.padEnd(30)} | ${size.padEnd(10)} | ${date}`;
    });
    
    fileList.setItems(listItems);
    screen.render();
  }
  
  /**
   * Show file details in the details panel
   * @param {Object} file - File object
   */
  function showFileDetails(file) {
    if (!file) {
      detailsPanel.setContent('{center}No file selected{/center}');
      screen.render();
      return;
    }
    
    const basename = path.basename(file.path);
    const baseFilename = basename.substring(0, basename.lastIndexOf('.'));
    
    // Get the filename without the timestamp
    const displayName = basename.replace(/(-score\d+-\d+)(\.\w+)+$/, '');
    
    // Extract genre information
    let genre = "Unknown";
    if (displayName.includes('_x_')) {
      genre = displayName;
    }
    
    detailsPanel.setContent(
      `{bold}File:{/bold} ${basename}\n\n` +
      `{bold}Genre:{/bold} ${genre}\n\n` +
      `{bold}Size:{/bold} ${formatFileSize(file.size)}\n\n` +
      `{bold}Created:{/bold} ${formatDate(file.created)}\n\n` +
      `{bold}Modified:{/bold} ${formatDate(file.modified)}\n\n` +
      `{bold}Path:{/bold} ${file.path}\n\n` +
      `Press 'I' for more information\n` +
      `Press 'P' to play this file\n` +
      `Press 'M' to generate more like this`
    );
    
    screen.render();
  }
  
  /**
   * Set loading state
   * @param {boolean} loading - Whether the UI is in loading state
   */
  function setLoading(loading) {
    isLoading = loading;
    
    if (loading) {
      header.style.bg = 'red';
      header.setContent('{center}🎵 Mediocre - Dataset Browser (Loading...) 🎵{/center}');
    } else {
      header.style.bg = 'blue';
      header.setContent('{center}🎵 Mediocre - Dataset Browser 🎵{/center}');
    }
    
    screen.render();
  }
  
  /**
   * Sort files by the specified method
   * @param {string} method - Sort method
   */
  async function sortFiles(method) {
    if (isLoading) return;
    
    currentSortMethod = method;
    currentFilterGenre = ''; // Clear any genre filter
    await loadFiles();
  }
  
  /**
   * Prompt for genre filter
   */
  function promptForGenreFilter() {
    if (isLoading) return;
    
    filterInput.hidden = false;
    filterInput.setContent('Enter genre to filter by (e.g., baroque_x_grunge):');
    screen.render();
    
    filterInput.readInput(function(err, value) {
      if (err || !value) {
        filterInput.hidden = true;
        screen.render();
        return;
      }
      
      currentFilterGenre = value.trim();
      filterInput.hidden = true;
      loadFiles();
    });
  }
  
  /**
   * Play the selected file
   */
  async function playSelectedFile() {
    if (!selectedFile || isLoading) return;
    
    try {
      consoleOutput.log(`Playing ${path.basename(selectedFile.path)}...`);
      
      // Use different play commands based on platform
      let playCommand;
      if (process.platform === 'darwin') {
        playCommand = `afplay "${selectedFile.path}"`;
      } else if (process.platform === 'linux') {
        playCommand = `aplay "${selectedFile.path}"`;
      } else if (process.platform === 'win32') {
        playCommand = `start "" "${selectedFile.path}"`;
      } else {
        throw new Error('Unsupported platform');
      }
      
      // Play in background
      execaCommand(playCommand, { detached: true, stdio: 'ignore' });
      
    } catch (error) {
      consoleOutput.log(`Error playing file: ${error.message}`);
    }
  }
  
  /**
   * Show detailed information about the selected file
   */
  async function showDetailedInfo() {
    if (!selectedFile || isLoading) return;
    
    try {
      consoleOutput.log(`Loading detailed info for ${path.basename(selectedFile.path)}...`);
      
      const baseFilename = path.basename(selectedFile.path);
      const baseWithoutExt = baseFilename.includes('.') ? 
        baseFilename.substring(0, baseFilename.lastIndexOf('.')) : 
        baseFilename;
      
      const info = getMusicPieceInfo(baseWithoutExt, directory);
      
      if (!info || !info.files || Object.keys(info.files).length === 0) {
        consoleOutput.log('No detailed information found for this file');
        return;
      }
      
      // Display basic info
      consoleOutput.log(`=== Composition Information ===`);
      consoleOutput.log(`Title: ${info.title || 'Unknown'}`);
      consoleOutput.log(`Genre: ${info.genre || 'Unknown'}`);
      
      if (info.instruments && info.instruments.length > 0) {
        consoleOutput.log(`Instruments: ${info.instruments.join(', ')}`);
      }
      
      // List associated files
      consoleOutput.log(`=== Associated Files ===`);
      
      if (info.files.abc) {
        consoleOutput.log(`ABC Notation: ${path.basename(info.files.abc.path)}`);
      }
      
      if (info.files.midi && info.files.midi.length > 0) {
        consoleOutput.log(`MIDI Files:`);
        info.files.midi.forEach(file => {
          consoleOutput.log(`  - ${path.basename(file.path)}`);
        });
      }
      
      if (info.files.wav && info.files.wav.length > 0) {
        consoleOutput.log(`WAV Files:`);
        info.files.wav.forEach(file => {
          consoleOutput.log(`  - ${path.basename(file.path)}`);
        });
      }
      
      // Display brief analysis if available
      if (info.files.description && info.files.description.content.analysis) {
        consoleOutput.log(`=== Analysis Preview ===`);
        const analysis = info.files.description.content.analysis.split('\n\n')[0]; // First paragraph
        consoleOutput.log(analysis);
      }
      
    } catch (error) {
      consoleOutput.log(`Error retrieving detailed info: ${error.message}`);
    }
  }
  
  /**
   * Generate more compositions like the selected one
   */
  async function generateMoreLike() {
    if (!selectedFile || isLoading) return;
    
    try {
      const baseFilename = path.basename(selectedFile.path);
      const baseWithoutExt = baseFilename.includes('.') ? 
        baseFilename.substring(0, baseFilename.lastIndexOf('.')) : 
        baseFilename;
      
      // Prompt for count
      filterInput.hidden = false;
      filterInput.setContent('How many similar compositions to generate? (1-5):');
      screen.render();
      
      filterInput.readInput(async function(err, value) {
        filterInput.hidden = true;
        
        if (err || !value) {
          screen.render();
          return;
        }
        
        const count = parseInt(value.trim(), 10) || 1;
        
        consoleOutput.log(`Generating ${count} composition(s) similar to ${baseWithoutExt}...`);
        setLoading(true);
        
        try {
          // Generate similar compositions
          const newFiles = await generateMoreLikeThis(baseWithoutExt, count, directory);
          
          consoleOutput.log(`Generated ${newFiles.length} new composition(s):`);
          newFiles.forEach(file => {
            consoleOutput.log(`- ${path.basename(file)}`);
          });
          
          // Reload the file list to show new files
          await loadFiles();
          
        } catch (error) {
          consoleOutput.log(`Error generating compositions: ${error.message}`);
        } finally {
          setLoading(false);
        }
      });
      
    } catch (error) {
      consoleOutput.log(`Error: ${error.message}`);
    }
  }
  
  // Initial file load
  await loadFiles();
  
  // Focus on the file list
  fileList.focus();
  
  // Render the screen
  screen.render();
  
  // Return a promise that resolves when the UI is closed
  return new Promise((resolve) => {
    screen.key(['escape', 'q', 'C-c'], function() {
      screen.destroy();
      resolve();
    });
  });
}