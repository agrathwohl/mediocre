#!/usr/bin/env node

import fs from 'fs';
import { program } from 'commander';
import { config } from './utils/config.js';
import { parseGenreList, generateMultipleHybridGenres } from './utils/genre-generator.js';
import { generateAbc } from './commands/generate-abc.js';
import { convertToMidi } from './commands/convert-midi.js';
import { convertToPdf } from './commands/convert-pdf.js';
import { convertToWav } from './commands/convert-wav.js';
import { processEffects } from './commands/process-effects.js';
import { buildDataset } from './commands/build-dataset.js';
import { listCompositions, displayCompositionInfo, createMoreLikeThis } from './commands/manage-dataset.js';
import { modifyComposition } from './commands/modify-composition.js';
import { combineCompositions } from './commands/combine-compositions.js';
import { generateLyrics } from './commands/generate-lyrics.js';
import { createDatasetBrowser } from './ui/index.js';

// Set up the CLI program
program
  .name('mediocre')
  .description('CLI tool for generating synthetic music compositions for AI training datasets')
  .version('0.1.0');

// Add commands
program
  .command('genres')
  .description('Generate hybrid genre names for composition')
  .option('-c, --classical <genres>', 'Comma-separated list of classical/traditional genres')
  .option('-m, --modern <genres>', 'Comma-separated list of modern genres')
  .option('-n, --count <number>', 'Number of hybrid genres to generate', '5')
  .action((options) => {
    const classicalGenres = parseGenreList(options.classical);
    const modernGenres = parseGenreList(options.modern);
    const count = parseInt(options.count || '5', 10);
    
    const hybridGenres = generateMultipleHybridGenres(classicalGenres, modernGenres, count);
    
    console.log('\nGenerated Hybrid Genres:\n');
    
    hybridGenres.forEach((genre, index) => {
      console.log(`${index + 1}. ${genre.name}`);
      console.log(`   ${genre.description}`);
    });
  });

program
  .command('generate')
  .description('Generate ABC notation files using Claude')
  .option('-c, --count <number>', 'Number of compositions to generate', '1')
  .option('-g, --genre <string>', 'Music genre or hybrid genre (format: classical_x_modern)')
  .option('-s, --style <string>', 'Music style')
  .option('-C, --classical <genres>', 'Comma-separated list of classical/traditional genres for hybrid generation')
  .option('-M, --modern <genres>', 'Comma-separated list of modern genres for hybrid generation')
  .option('-o, --output <directory>', 'Output directory', config.get('outputDir'))
  .option('--system-prompt <file>', 'Path to a file containing a custom system prompt for Claude')
  .option('--user-prompt <file>', 'Path to a file containing a custom user prompt for Claude')
  .option('--creative-names', '[EXPERIMENTAL] Generate creative genre names instead of standard hybrid format (may produce unpredictable results)', false)
  .option('--solo', 'Include a musical solo section for the lead instrument')
  .option('--record-label <name>', 'Make it sound like it was released on the given record label')
  .action(async (options) => {
    try {
      let genres = [];
      
      // If classical and modern genres are provided, generate hybrid genres
      if (options.classical || options.modern) {
        const classicalGenres = parseGenreList(options.classical);
        const modernGenres = parseGenreList(options.modern);
        const count = parseInt(options.count || '1', 10);
        
        // Generate enough hybrid genres for the requested composition count
        genres = generateMultipleHybridGenres(classicalGenres, modernGenres, count);
        
        console.log('\nGenerated Hybrid Genres for Composition:\n');
        genres.forEach((genre, index) => {
          console.log(`${index + 1}. ${genre.name}`);
        });
      } else if (options.genre) {
        // Use a single specified genre for all compositions
        for (let i = 0; i < parseInt(options.count || '1', 10); i++) {
          genres.push({ name: options.genre });
        }
      } else {
        // Generate a single random hybrid genre
        genres = generateMultipleHybridGenres([], [], parseInt(options.count || '1', 10));
        
        console.log('\nGenerated Random Hybrid Genres for Composition:\n');
        genres.forEach((genre, index) => {
          console.log(`${index + 1}. ${genre.name}`);
        });
      }
      
      // Load custom prompts if provided
      let customSystemPrompt = null;
      let customUserPrompt = null;
      
      if (options.systemPrompt) {
        try {
          customSystemPrompt = fs.readFileSync(options.systemPrompt, 'utf8');
          console.log(`Loaded custom system prompt from ${options.systemPrompt}`);
        } catch (error) {
          console.error(`Error loading system prompt: ${error.message}`);
          process.exit(1);
        }
      }
      
      if (options.userPrompt) {
        try {
          customUserPrompt = fs.readFileSync(options.userPrompt, 'utf8');
          console.log(`Loaded custom user prompt from ${options.userPrompt}`);
        } catch (error) {
          console.error(`Error loading user prompt: ${error.message}`);
          process.exit(1);
        }
      }
      
      // Generate ABC notation for each genre
      const allFiles = [];
      
      for (const genre of genres) {
        const genreOptions = {
          genre: genre.name,
          style: options.style || 'standard',
          count: 1, // Generate one composition per genre
          output: options.output,
          systemPrompt: customSystemPrompt,
          userPrompt: customUserPrompt,
          creativeNames: options.creativeNames === true, // Default to false unless explicitly specified
          solo: options.solo || false,
          recordLabel: options.recordLabel || ''
        };
        
        const files = await generateAbc(genreOptions);
        allFiles.push(...files);
      }
      
      console.log(`\nGenerated ${allFiles.length} composition(s) total`);
    } catch (error) {
      console.error('Error generating compositions:', error);
    }
  });

program
  .command('convert')
  .description('Convert ABC files to MIDI, PDF, and WAV')
  .option('-i, --input <file>', 'Input ABC file')
  .option('-d, --directory <directory>', 'Input directory with ABC files')
  .option('-o, --output <directory>', 'Output directory', config.get('outputDir'))
  .option('--to <format>', 'Target format (midi, pdf, wav, all)', 'all')
  .action(async (options) => {
    try {
      if (options.to === 'midi' || options.to === 'all') {
        const files = await convertToMidi(options);
        console.log(`Converted ${files.length} file(s) to MIDI`);
      }
      if (options.to === 'pdf' || options.to === 'all') {
        const files = await convertToPdf(options);
        console.log(`Converted ${files.length} file(s) to PDF`);
      }
      if (options.to === 'wav' || options.to === 'all') {
        const files = await convertToWav(options);
        console.log(`Converted ${files.length} file(s) to WAV`);
      }
    } catch (error) {
      console.error('Error converting files:', error);
    }
  });

program
  .command('process')
  .description('Apply audio effects to WAV files')
  .option('-i, --input <file>', 'Input WAV file')
  .option('-d, --directory <directory>', 'Input directory with WAV files')
  .option('-o, --output <directory>', 'Output directory', config.get('outputDir'))
  .option('-e, --effect <effect>', 'Effect to apply (reverb, delay, distortion, all)', 'all')
  .action(async (options) => {
    try {
      const files = await processEffects(options);
      console.log(`Processed ${files.length} file(s) with effects`);
    } catch (error) {
      console.error('Error processing audio effects:', error);
    }
  });

program
  .command('dataset')
  .description('Build dataset from generated files')
  .option('-d, --directory <directory>', 'Input directory', config.get('outputDir'))
  .option('-o, --output <directory>', 'Output directory', config.get('datasetDir'))
  .action(async (options) => {
    try {
      const outputDir = await buildDataset(options);
      console.log(`Dataset built successfully at ${outputDir}`);
    } catch (error) {
      console.error('Error building dataset:', error);
    }
  });

// Add dataset management commands
program
  .command('list')
  .description('List and sort compositions in the output directory')
  .option('-s, --sort <method>', 'Sort method (age, length, title)', 'age')
  .option('-g, --genre <genre>', 'Filter by genre')
  .option('-d, --directory <directory>', 'Directory to search in', config.get('outputDir'))
  .option('-l, --limit <number>', 'Limit the number of results')
  .action(async (options) => {
    try {
      await listCompositions(options);
    } catch (error) {
      console.error('Error listing compositions:', error);
    }
  });

program
  .command('info')
  .description('Display detailed information about a composition')
  .argument('<filename>', 'Filename or base filename of the composition')
  .option('-d, --directory <directory>', 'Directory to search in', config.get('outputDir'))
  .option('--show-full-analysis', 'Display the full composition analysis')
  .action(async (filename, options) => {
    try {
      displayCompositionInfo({ ...options, filename });
    } catch (error) {
      console.error('Error displaying composition info:', error);
    }
  });

program
  .command('more-like-this')
  .description('Generate more compositions similar to the specified one')
  .argument('<filename>', 'Filename or base filename of the reference composition')
  .option('-c, --count <number>', 'Number of compositions to generate', '1')
  .option('-d, --directory <directory>', 'Directory to search in', config.get('outputDir'))
  .option('--creative-names', '[EXPERIMENTAL] Generate creative genre names instead of standard hybrid format (may produce unpredictable results)', false)
  .action(async (filename, options) => {
    try {
      await createMoreLikeThis({ ...options, filename });
    } catch (error) {
      console.error('Error generating similar compositions:', error);
    }
  });

program
  .command('modify')
  .description('Modify an existing composition according to instructions')
  .argument('<filename>', 'Filename or base filename of the composition to modify')
  .option('-i, --instructions <text>', 'Instructions for modifying the composition')
  .option('-f, --instructions-file <file>', 'File containing instructions for modifying the composition')
  .option('-d, --directory <directory>', 'Directory containing the original composition', config.get('outputDir'))
  .option('-o, --output <directory>', 'Output directory for the modified composition')
  .option('--solo', 'Include a musical solo section for the lead instrument')
  .option('--record-label <name>', 'Make it sound like it was released on the given record label')
  .action(async (filename, options) => {
    try {
      let instructions = options.instructions;
      
      // If instructions file is provided, read from it
      if (options.instructionsFile && !instructions) {
        try {
          instructions = fs.readFileSync(options.instructionsFile, 'utf8');
          console.log(`Loaded modification instructions from ${options.instructionsFile}`);
        } catch (error) {
          console.error(`Error loading instructions file: ${error.message}`);
          process.exit(1);
        }
      }
      
      if (!instructions) {
        console.error('Instructions are required. Use --instructions or --instructions-file.');
        process.exit(1);
      }
      
      await modifyComposition({ 
        ...options, 
        filename,
        instructions
      });
    } catch (error) {
      console.error('Error modifying composition:', error);
    }
  });

program
  .command('browse')
  .description('Launch interactive browser for the music dataset')
  .option('-d, --directory <directory>', 'Directory to browse', config.get('outputDir'))
  .action(async (options) => {
    try {
      console.log('Launching interactive browser...');
      await createDatasetBrowser(options);
    } catch (error) {
      console.error('Error in interactive browser:', error);
    }
  });

program
  .command('combine')
  .description('Find short compositions and combine them into new pieces')
  .option('-l, --duration-limit <seconds>', 'Maximum duration in seconds for pieces to combine', '60')
  .option('-f, --date-from <date>', 'Filter pieces created after this date (ISO format)')
  .option('-t, --date-to <date>', 'Filter pieces created before this date (ISO format)')
  .option('-g, --genres <genres>', 'Comma-separated list of genres to include')
  .option('-o, --output <directory>', 'Output directory for new compositions', config.get('outputDir'))
  .option('-d, --directory <directory>', 'Directory to search for compositions', config.get('outputDir'))
  .option('--solo', 'Include a musical solo section for the lead instrument')
  .option('--record-label <name>', 'Make it sound like it was released on the given record label')
  .action(async (options) => {
    try {
      const files = await combineCompositions(options);
      console.log(`Generated ${files.length} combined composition(s)`);
    } catch (error) {
      console.error('Error combining compositions:', error);
    }
  });

program
  .command('lyrics')
  .description('Add lyrics to an existing composition using Claude')
  .requiredOption('-m, --midi-file <file>', 'Path to MIDI file to add lyrics to')
  .requiredOption('-p, --lyrics-prompt <text>', 'Prompt describing what the lyrics should be about')
  .option('-d, --directory <directory>', 'Directory containing the original MIDI file', config.get('outputDir'))
  .option('-o, --output <directory>', 'Output directory for the file with lyrics')
  .option('--solo', 'Include a musical solo section for the lead instrument')
  .option('--record-label <name>', 'Make it sound like it was released on the given record label')
  .action(async (options) => {
    try {
      const abcFile = await generateLyrics(options);
      console.log(`ABC notation with lyrics saved to: ${abcFile}`);
      console.log('Convert to PDF to see the score with lyrics using:');
      console.log(`mediocre convert --input ${abcFile} --to pdf`);
    } catch (error) {
      console.error('Error adding lyrics:', error);
    }
  });

// Default help message
if (process.argv.length === 2) {
  console.log(`
  🎵 Mediocre - Music Generation Tool 🎵
  
  Generate synthetic music compositions for AI training.
  
  Commands:
    genres         Generate hybrid genre names by combining classical and modern genres
    generate       Generate ABC notation files using Claude
    convert        Convert ABC files to MIDI, PDF, and WAV
    process        Apply audio effects to WAV files
    dataset        Build dataset from generated files
    list           List and sort compositions in the output directory
    info           Display detailed information about a composition
    more-like-this Generate more compositions similar to the specified one
    modify         Modify an existing composition according to instructions
    combine        Find short compositions and combine them into new pieces
    lyrics         Add lyrics to an existing composition using Claude
    browse         Launch interactive TUI browser for the music dataset
    
  Examples:
    mediocre genres -c "baroque,classical,romantic" -m "techno,ambient,glitch" -n 5
    mediocre generate -C "baroque,classical" -M "techno,ambient" -c 3
    mediocre generate -g "baroque_x_jazz" --system-prompt my-prompt.txt --solo
    mediocre generate -g "baroque_x_jazz" --record-label "Merge Records"
    mediocre generate -g "baroque_x_jazz" --creative-names # EXPERIMENTAL FEATURE
    mediocre list --sort length --limit 10
    mediocre info "baroque_x_grunge-score1-1744572129572"
    mediocre more-like-this "baroque_x_grunge-score1-1744572129572" -c 2
    mediocre modify "baroque_x_grunge-score1-1744572129572" -i "Make it longer with a breakdown section" --solo
    mediocre combine --duration-limit 45 --genres "baroque,romantic" --record-label "Raster Noton"
    mediocre lyrics -m "baroque_x_jazz-score1.mid" -p "A song about the beauty of nature" --solo
    mediocre browse
    
  For more information, run: mediocre --help
  `);
} else {
  program.parse();
}