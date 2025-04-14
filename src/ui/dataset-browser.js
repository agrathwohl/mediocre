import blessed from 'neo-blessed';
import chalk from 'chalk';
import path from 'path';
import fs from 'fs';
import { config } from '../utils/config.js';
import {
  sortByAge,
  sortByLength,
  sortByTitle,
  filterByGenre,
  filterByComposition,
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
    content: ' {bold}Sort:{/bold} [A]ge | [L]ength | [T]itle  {bold}Filter:{/bold} [G] by Name  {bold}Actions:{/bold} [P]lay | [I]nfo | [M]ore Like This | [Q]uit',
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
    label: ' Composition Details ',
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
    alwaysScroll: true,
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
        // Use the new filterByComposition function instead
        files = filterByComposition(currentFilterGenre, directory);
        consoleOutput.log(`Filtered by composition name: ${currentFilterGenre}`);
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

      // If we have files selected, select the first one for convenience
      if (files.length > 0 && !selectedFile) {
        selectedFile = files[0];
        showFileDetails(selectedFile);
        fileList.select(0);
      }
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
      const date = formatDate(file.created);
      const filename = path.basename(file.path);

      // Clean the filename - remove the extension completely
      const cleanName = filename.includes('.') ?
        filename.substring(0, filename.indexOf('.')) :
        filename;

      // Format table columns properly with fixed width for better alignment
      const nameWidth = 40; // Set appropriate width for filenames
      const dateWidth = 25; // Set appropriate width for date

      // Ensure consistent column widths for proper alignment
      const displayName = cleanName.padEnd(nameWidth).substring(0, nameWidth);
      const displayDate = date.padEnd(dateWidth);

      // Return formatted row with proper spacing
      return `${displayName}  │  ${displayDate}`;
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
    // Make sure we get the base name without ANY extension
    const baseFilename = basename.includes('.') ?
      basename.substring(0, basename.indexOf('.')) :
      basename;

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

    // Get and display the markdown content in the console output
    // Make sure we pass the basename without ANY extension and remove trailing digit
    let pureBasename = baseFilename.includes('.') ?
      baseFilename.substring(0, baseFilename.indexOf('.')) :
      baseFilename;

    // CRITICALLY IMPORTANT: remove the last digit from the timestamp
    if (pureBasename.match(/-score\d+-\d+\d$/)) {
      pureBasename = pureBasename.slice(0, -1);
    }
    loadMarkdownContent(pureBasename);

    screen.render();
  }

  /**
   * Load and display composition details from JSON description file
   * @param {string} baseFilename - Base filename without extension
   */
  function loadMarkdownContent(baseFilename) {
    try {
      if (!baseFilename) {
        consoleOutput.setContent('');
        consoleOutput.pushLine('No file selected');
        return;
      }

      // Get the base name without extension and remove trailing digit from timestamp
      let baseWithoutExt = baseFilename.includes('.') ?
        baseFilename.substring(0, baseFilename.indexOf('.')) :
        baseFilename;

      // CRITICALLY IMPORTANT: remove the last digit from the timestamp
      // Example: convert chorale_x_experimental-score1-17446030330691 to chorale_x_experimental-score1-1744603033069
      if (baseWithoutExt.match(/-score\d+-\d+\d$/)) {
        baseWithoutExt = baseWithoutExt.slice(0, -1);
      }

      // Description file is exactly basename_description.json, no special handling needed
      const descFile = `${baseWithoutExt}_description.json`;
      const descPath = path.join(directory, descFile);

      // Clear the console initially
      consoleOutput.setContent('');
      consoleOutput.pushLine('{bold}{green-fg}=== Composition Details ==={/green-fg}{/bold}');
      consoleOutput.pushLine('');

      if (!fs.existsSync(descPath)) {
        // Show filename and helpful message even if description file not found
        const displayName = baseWithoutExt.includes('_x_') ?
          baseWithoutExt.split('-score')[0] : baseWithoutExt;

        consoleOutput.pushLine(`{bold}{yellow-fg}${displayName}{/yellow-fg}{/bold}`);
        consoleOutput.pushLine('');
        consoleOutput.pushLine('{bold}Commands:{/bold}');
        consoleOutput.pushLine('{bold}[I]{/bold} - Show full composition information');
        consoleOutput.pushLine('{bold}[P]{/bold} - Play this composition');
        consoleOutput.pushLine('{bold}[M]{/bold} - Generate more like this');
        return;
      }

      // Read description directly
      const desc = JSON.parse(fs.readFileSync(descPath, 'utf8'));

      // Display title based on genre
      const genre = desc.genre || baseWithoutExt;
      consoleOutput.pushLine(`{bold}{yellow-fg}${genre}{/yellow-fg}{/bold}`);
      consoleOutput.pushLine('');

      // Display basic info
      if (desc.classicalGenre && desc.modernGenre) {
        consoleOutput.pushLine(`{bold}Classical:{/bold} ${desc.classicalGenre}`);
        consoleOutput.pushLine(`{bold}Modern:{/bold}   ${desc.modernGenre}`);
      }

      if (desc.style) {
        consoleOutput.pushLine(`{bold}Style:{/bold}    ${desc.style}`);
      }

      // Always display at least part of the analysis
      if (desc.analysis) {
        consoleOutput.pushLine('');
        consoleOutput.pushLine('{bold}{green-fg}=== Analysis Preview ==={/green-fg}{/bold}');
        consoleOutput.pushLine('');

        // Show the first 3 paragraphs to give more information by default
        const paragraphs = desc.analysis.split('\n\n');
        for (let i = 0; i < Math.min(3, paragraphs.length); i++) {
          consoleOutput.pushLine(paragraphs[i]);
          if (i < Math.min(2, paragraphs.length - 1)) {
            consoleOutput.pushLine('');
          }
        }

        if (paragraphs.length > 3) {
          consoleOutput.pushLine('');
          consoleOutput.pushLine('{bold}[Press "I" for full analysis]{/bold}');
        }
      }

      // Always show command help
      consoleOutput.pushLine('');
      consoleOutput.pushLine('{bold}Commands:{/bold}');
      consoleOutput.pushLine('{bold}[I]{/bold} - Show full composition information');
      consoleOutput.pushLine('{bold}[P]{/bold} - Play this composition');
      consoleOutput.pushLine('{bold}[M]{/bold} - Generate more like this');

    } catch (error) {
      consoleOutput.setContent('');
      consoleOutput.pushLine(`Error: ${error.message}`);
    }
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
    filterInput.setContent('Enter a composition name to filter by (e.g., baroque_x_grunge-score1):');
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
      const baseFilename = path.basename(selectedFile.path);

      // Get the base name without extension and remove trailing digit from timestamp
      let baseWithoutExt = baseFilename.includes('.') ?
        baseFilename.substring(0, baseFilename.indexOf('.')) :
        baseFilename;

      // CRITICALLY IMPORTANT: remove the last digit from the timestamp
      // Example: convert chorale_x_experimental-score1-17446030330691 to chorale_x_experimental-score1-1744603033069
      if (baseWithoutExt.match(/-score\d+-\d+\d$/)) {
        baseWithoutExt = baseWithoutExt.slice(0, -1);
      }

      consoleOutput.setContent('');

      // Description file is exactly basename_description.json, no special handling needed
      const descFile = `${baseWithoutExt}_description.json`;
      const descPath = path.join(directory, descFile);

      /*if (!fs.existsSync(descPath)) {
        consoleOutput.pushLine(`No description file found: ${descFile}`);
        return;
      }*/

      // Read description directly
      const desc = JSON.parse(fs.readFileSync(descPath, 'utf8'));

      // Display title with highlighting
      const title = desc.genre || baseWithoutExt;
      consoleOutput.pushLine(`{bold}{yellow-fg}${title}{/yellow-fg}{/bold}`);
      consoleOutput.pushLine('');

      // Display basic info
      if (desc.classicalGenre && desc.modernGenre) {
        consoleOutput.pushLine(`{bold}Classical:{/bold} ${desc.classicalGenre}`);
        consoleOutput.pushLine(`{bold}Modern:{/bold}   ${desc.modernGenre}`);
      }

      if (desc.style) {
        consoleOutput.pushLine(`{bold}Style:{/bold}    ${desc.style}`);
      }

      // Always display full analysis
      if (desc.analysis) {
        consoleOutput.pushLine('');
        consoleOutput.pushLine('{bold}{green-fg}=== Full Analysis ==={/green-fg}{/bold}');
        consoleOutput.pushLine('');

        // Format the analysis with paragraphs
        const analysis = desc.analysis;
        const paragraphs = analysis.split('\n\n');

        paragraphs.forEach(paragraph => {
          // Format headings
          if (paragraph.startsWith('#')) {
            const headingLevel = paragraph.match(/^#+/)[0].length;
            const headingText = paragraph.replace(/^#+\s+/, '');

            if (headingLevel === 1) {
              consoleOutput.pushLine(`{bold}{yellow-fg}${headingText}{/yellow-fg}{/bold}`);
            } else if (headingLevel === 2) {
              consoleOutput.pushLine(`{bold}{cyan-fg}${headingText}{/cyan-fg}{/bold}`);
            } else {
              consoleOutput.pushLine(`{bold}${headingText}{/bold}`);
            }
          }
          // Format lists
          else if (paragraph.match(/^[\s-*]+/)) {
            const listItems = paragraph.split('\n');
            listItems.forEach(item => {
              // Check for bold text in list items
              let formattedItem = item.replace(/^[\s-*]+/, '• ');

              // Format bold markdown text (** **)
              if (formattedItem.includes('**')) {
                formattedItem = formattedItem.replace(/\*\*(.*?)\*\*/g, '{bold}$1{/bold}');
              }

              // Format italic markdown text (* *)
              if (formattedItem.includes('*')) {
                formattedItem = formattedItem.replace(/\*([^*]+)\*/g, '{italic}$1{/italic}');
              }

              consoleOutput.pushLine(formattedItem);
            });
          }
          // Format paragraphs with bold/italic markdown
          else {
            let formattedText = paragraph;

            // Format bold markdown text (** **)
            if (formattedText.includes('**')) {
              formattedText = formattedText.replace(/\*\*(.*?)\*\*/g, '{bold}$1{/bold}');
            }

            // Format italic markdown text (* *)
            if (formattedText.includes('*') && !formattedText.includes('**')) {
              formattedText = formattedText.replace(/\*([^*]+)\*/g, '{italic}$1{/italic}');
            }

            consoleOutput.pushLine(formattedText);
          }

          consoleOutput.pushLine('');
        });
      } else {
        consoleOutput.pushLine('No analysis found in description file.');
      }

      // Skip ABC notation preview

    } catch (error) {
      consoleOutput.setContent('');
      consoleOutput.pushLine(`Error retrieving detailed info: ${error.message}`);
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
