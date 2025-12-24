#!/usr/bin/env node

import fs from 'fs';
import path from 'path';
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
import { mixAndMatch } from './commands/mix-and-match.js';
import { createDatasetBrowser } from './ui/index.js';
import { validateAbcNotation, cleanAbcNotation, evaluateCompositionCompleteness } from './utils/claude.js';

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
  .option('--producer <name>', 'Make it sound as if it was produced by the provided record producer')
  .option('--instruments <list>', 'Comma-separated list of instruments the output ABC notations must include')
  .option('--sequential', 'Use sequential LLM expansion to create longer, more developed compositions through chained modifications')
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
          recordLabel: options.recordLabel || '',
          producer: options.producer || '',
          instruments: options.instruments || '',
          sequentialMode: options.sequential || false // Tell initial generation to focus on quality, not completeness
        };
        
        const files = await generateAbc(genreOptions);

        // If sequential mode is enabled, let the LLM decide when the composition is complete
        if (options.sequential && files.length > 0) {
          console.log('\n🔗 Sequential expansion mode enabled - LLM will evaluate and expand until complete...\n');

          const MAX_PASSES = 10; // Safety limit to prevent infinite loops

          // Helper function to validate ABC with abc2midi - STOP ON FAILURE
          const validateWithAbc2Midi = async (abcFilePath) => {
            const { execSync } = await import('child_process');
            const tempMidiPath = abcFilePath.replace('.abc', '_validation_temp.mid');

            try {
              // Run abc2midi and capture output
              execSync(`abc2midi "${abcFilePath}" -o "${tempMidiPath}" 2>&1`, {
                timeout: 30000, // 30 second timeout
                encoding: 'utf8'
              });

              // Check if MIDI file was created
              if (fs.existsSync(tempMidiPath)) {
                // Clean up temp file
                fs.unlinkSync(tempMidiPath);
                return { valid: true, error: null };
              } else {
                return { valid: false, error: 'abc2midi did not produce output file' };
              }
            } catch (error) {
              // Clean up temp file if it exists
              if (fs.existsSync(tempMidiPath)) {
                fs.unlinkSync(tempMidiPath);
              }

              // Check for segfault or other fatal errors
              if (error.signal === 'SIGSEGV') {
                return { valid: false, error: 'abc2midi SEGFAULTED - ABC notation is invalid' };
              }
              if (error.killed) {
                return { valid: false, error: 'abc2midi timed out - ABC notation may be malformed' };
              }

              return { valid: false, error: `abc2midi failed: ${error.message}` };
            }
          };

          for (let fileIndex = 0; fileIndex < files.length; fileIndex++) {
            let currentFile = files[fileIndex];
            let currentAbc = fs.readFileSync(currentFile, 'utf8');
            console.log(`\n📝 Evaluating composition ${fileIndex + 1}/${files.length}: ${currentFile}`);

            // Validate initial generation with abc2midi
            console.log(`  🔧 Validating initial generation with abc2midi...`);
            let initialValidation = await validateWithAbc2Midi(currentFile);

            if (!initialValidation.valid) {
              console.warn(`  ⚠️ Initial generation failed abc2midi: ${initialValidation.error}`);
              console.log(`  🔧 Attempting to fix initial ABC notation...`);

              const fixedFile = await modifyComposition({
                abcFile: currentFile,
                instructions: `FIX THIS ABC NOTATION - IT FAILED abc2midi VALIDATION WITH ERROR: "${initialValidation.error}".
DO NOT EXPAND OR MODIFY THE MUSIC. ONLY FIX THE TECHNICAL ERRORS IN THE ABC NOTATION.
Return the FIXED ABC notation that will pass abc2midi without errors.`,
                output: options.output,
                solo: options.solo || false,
                recordLabel: options.recordLabel || '',
                producer: options.producer || '',
                instruments: options.instruments || ''
              });

              initialValidation = await validateWithAbc2Midi(fixedFile);
              if (!initialValidation.valid) {
                console.error(`  ❌ FATAL: Cannot fix initial generation. Skipping this composition.`);
                continue;
              }

              console.log(`  ✅ Initial ABC notation fixed!`);
              currentFile = fixedFile;
              currentAbc = fs.readFileSync(currentFile, 'utf8');
            } else {
              console.log(`  ✅ Initial generation passes abc2midi validation`);
            }

            // Extract genre info from filename for evaluation
            const baseFilename = path.basename(currentFile, '.abc');
            let genre = 'Classical_x_Contemporary';
            let classicalGenre = 'Classical';
            let modernGenre = 'Contemporary';

            if (baseFilename.includes('_x_')) {
              genre = baseFilename.split('-score')[0];
              const parts = genre.split('_x_');
              if (parts.length === 2) {
                classicalGenre = parts[0];
                modernGenre = parts[1];
              }
            }

            let passNumber = 0;
            let needsExpansion = true;

            while (needsExpansion && passNumber < MAX_PASSES) {
              passNumber++;
              console.log(`\n  🔍 Pass ${passNumber}: Evaluating composition completeness...`);

              try {
                // Ask the LLM to evaluate if the composition needs more work
                const evaluation = await evaluateCompositionCompleteness({
                  abcNotation: currentAbc,
                  genre,
                  classicalGenre,
                  modernGenre,
                  currentPass: passNumber
                });

                console.log(`  📊 Evaluation: ${evaluation.reasoning}`);

                if (!evaluation.needsExpansion) {
                  console.log(`  ✅ Composition is complete!`);
                  needsExpansion = false;
                  break;
                }

                console.log(`  📝 Expanding: ${evaluation.instructions.substring(0, 100)}...`);

                // Apply the LLM-suggested modifications
                const modifiedFile = await modifyComposition({
                  abcFile: currentFile,
                  instructions: evaluation.instructions,
                  output: options.output,
                  solo: options.solo || false,
                  recordLabel: options.recordLabel || '',
                  producer: options.producer || '',
                  instruments: options.instruments || ''
                });

                // VALIDATE with abc2midi after each expansion
                console.log(`  🔧 Validating with abc2midi...`);
                let validation = await validateWithAbc2Midi(modifiedFile);

                if (!validation.valid) {
                  console.warn(`  ⚠️ abc2midi validation failed: ${validation.error}`);
                  console.log(`  🔧 Attempting to fix the ABC notation...`);

                  // Try to fix the ABC notation
                  const fixedFile = await modifyComposition({
                    abcFile: modifiedFile,
                    instructions: `FIX THIS ABC NOTATION - IT FAILED abc2midi VALIDATION WITH ERROR: "${validation.error}".

DO NOT EXPAND OR MODIFY THE MUSIC. ONLY FIX THE TECHNICAL ERRORS IN THE ABC NOTATION.
Common issues to check and fix:
- Blank lines between voice sections (REMOVE them)
- Malformed MIDI directives
- Unbalanced bar lines
- Invalid note durations or time signatures
- Missing or malformed headers

Return the FIXED ABC notation that will pass abc2midi without errors.`,
                    output: options.output,
                    solo: options.solo || false,
                    recordLabel: options.recordLabel || '',
                    producer: options.producer || '',
                    instruments: options.instruments || ''
                  });

                  // Validate the fix
                  validation = await validateWithAbc2Midi(fixedFile);

                  if (!validation.valid) {
                    console.error(`  ❌ FATAL: Fix attempt also failed abc2midi: ${validation.error}`);
                    console.error(`  ❌ STOPPING GENERATION - ABC notation is unfixable`);
                    needsExpansion = false;
                    currentFile = modifiedFile; // Keep the last valid-ish file
                    break;
                  }

                  console.log(`  ✅ ABC notation fixed successfully!`);
                  currentFile = fixedFile;
                  currentAbc = fs.readFileSync(currentFile, 'utf8');
                } else {
                  console.log(`  ✅ abc2midi validation passed`);
                  currentFile = modifiedFile;
                  currentAbc = fs.readFileSync(currentFile, 'utf8');
                }

                console.log(`  ✅ Pass ${passNumber} complete: ${currentFile}`);

              } catch (passError) {
                console.error(`  ❌ Error in pass ${passNumber}:`, passError.message);
                // Break on error to avoid infinite error loops
                break;
              }
            }

            if (passNumber >= MAX_PASSES) {
              console.log(`  ⚠️ Reached maximum ${MAX_PASSES} passes - stopping expansion`);
            }

            // Replace the original file reference with the final expanded version
            files[fileIndex] = currentFile;
            console.log(`\n  🎵 Final composition after ${passNumber} passes: ${currentFile}`);
          }

          console.log('\n🎵 Sequential expansion complete!\n');
        }

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
  .argument('<abcFile>', 'Direct file path to ABC notation file')
  .option('--show-full-analysis', 'Display the full composition analysis')
  .action(async (abcFile, options) => {
    try {
      displayCompositionInfo({ ...options, abcFile });
    } catch (error) {
      console.error('Error displaying composition info:', error);
    }
  });

program
  .command('more-like-this')
  .description('Generate more compositions similar to the specified one')
  .argument('<abcFile>', 'Direct file path to ABC notation file to use as reference')
  .option('-c, --count <number>', 'Number of compositions to generate', '1')
  .option('-s, --style <string>', 'Music style to apply')
  .option('--creative-names', '[EXPERIMENTAL] Generate creative genre names instead of standard hybrid format (may produce unpredictable results)', false)
  .option('--solo', 'Include a musical solo section for the lead instrument')
  .option('--record-label <name>', 'Make it sound like it was released on the given record label')
  .option('--producer <name>', 'Make it sound as if it was produced by the provided record producer')
  .option('--instruments <list>', 'Comma-separated list of instruments the output ABC notations must include')
  .action(async (abcFile, options) => {
    try {
      await createMoreLikeThis({ ...options, abcFile });
    } catch (error) {
      console.error('Error generating similar compositions:', error);
    }
  });

program
  .command('modify')
  .description('Modify an existing composition according to instructions')
  .argument('<abcFile>', 'Direct file path to ABC notation file to modify')
  .option('-i, --instructions <text>', 'Instructions for modifying the composition')
  .option('-f, --instructions-file <file>', 'File containing instructions for modifying the composition')
  .option('-o, --output <directory>', 'Output directory for the modified composition')
  .option('--solo', 'Include a musical solo section for the lead instrument')
  .option('--record-label <name>', 'Make it sound like it was released on the given record label')
  .option('--producer <name>', 'Make it sound as if it was produced by the provided record producer')
  .option('--instruments <list>', 'Comma-separated list of instruments the output ABC notations must include')
  .action(async (abcFile, options) => {
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
        abcFile,
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
  .option('--producer <name>', 'Make it sound as if it was produced by the provided record producer')
  .option('--instruments <list>', 'Comma-separated list of instruments the output ABC notations must include')
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
  .requiredOption('-a, --abc-file <file>', 'Direct file path to ABC notation file')
  .requiredOption('-p, --lyrics-prompt <text>', 'Prompt describing what the lyrics should be about')
  .option('-o, --output <directory>', 'Output directory for the file with lyrics')
  .option('--solo', 'Include a musical solo section for the lead instrument')
  .option('--record-label <name>', 'Make it sound like it was released on the given record label')
  .option('--producer <name>', 'Make it sound as if it was produced by the provided record producer')
  .option('--instruments <list>', 'Comma-separated list of instruments the output ABC notations must include')
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

program
  .command('mix-and-match')
  .description('Create a new composition by mixing and matching segments from multiple ABC files')
  .requiredOption('-f, --files <files...>', 'List of direct file paths to ABC notation files')
  .option('-o, --output <directory>', 'Output directory for the mixed composition')
  .option('--solo', 'Include a musical solo section for the lead instrument')
  .option('--record-label <name>', 'Make it sound like it was released on the given record label')
  .option('--producer <name>', 'Make it sound as if it was produced by the provided record producer')
  .option('--instruments <list>', 'Comma-separated list of instruments the output ABC notations must include')
  .action(async (options) => {
    try {
      const mixedFile = await mixAndMatch(options);
      console.log(`Mixed composition saved to: ${mixedFile}`);
      console.log('Convert to MIDI for playback using:');
      console.log(`mediocre convert --input ${mixedFile} --to midi`);
    } catch (error) {
      console.error('Error mixing compositions:', error);
    }
  });

program
  .command('validate-abc')
  .description('Validate and fix formatting issues in ABC notation files')
  .option('-i, --input <file>', 'Input ABC file to validate and fix')
  .option('-o, --output <file>', 'Output file path (defaults to overwriting input)')
  .action(async (options) => {
    try {
      // When no input/output options are provided, process all ABC files in the output directory
      if (!options.input) {
        console.log('No input file specified. Processing all ABC files in the output directory...');
        
        // Get the output directory path from config
        const outputDir = config.get('outputDir');
        
        // Find all ABC files in the output directory
        const abcFiles = fs.readdirSync(outputDir)
          .filter(file => file.endsWith('.abc'))
          .map(file => path.join(outputDir, file));
          
        // TO TEST: Limit to just a few files in development
        // const abcFiles = fs.readdirSync(outputDir)
        //   .filter(file => file.endsWith('.abc'))
        //   .slice(0, 3)  // Process only the first 3 files for testing
        //   .map(file => path.join(outputDir, file));
        
        console.log(`Found ${abcFiles.length} ABC files to process.`);
        
        let fixedCount = 0;
        let validCount = 0;
        
        // Process each file
        for (const abcFile of abcFiles) {
          console.log(`Processing file: ${abcFile}`);
          const abcContent = fs.readFileSync(abcFile, 'utf-8');
          
          // Validate the ABC notation
          const validation = validateAbcNotation(abcContent);
          
          if (validation.isValid) {
            console.log(`✅ ${path.basename(abcFile)}: Validation passed. No issues found.`);
            validCount++;
            continue;
          }
          
          // Log the issues found
          console.warn(`⚠️ ${path.basename(abcFile)}: Found ${validation.issues.length} issues in the ABC notation:`);
          validation.issues.forEach(issue => console.warn(`  - ${issue}`));
          
          // Apply automatic fixes
          console.log(`Applying automatic fixes to ${path.basename(abcFile)}...`);
          const fixedContent = validation.fixedNotation;
          
          // Save the fixed content back to the original file
          fs.writeFileSync(abcFile, fixedContent);
          console.log(`✅ Fixed ABC notation saved to: ${abcFile}`);
          fixedCount++;
        }
        
        console.log(`Processed ${abcFiles.length} files: ${validCount} already valid, ${fixedCount} fixed.`);
        return;
      }
      
      // Standard single file processing when input is specified
      console.log(`Validating ABC file: ${options.input}`);
      const abcContent = fs.readFileSync(options.input, 'utf-8');
      
      // Validate the ABC notation
      const validation = validateAbcNotation(abcContent);
      
      if (validation.isValid) {
        console.log(`✅ ABC notation validation passed. No issues found.`);
        return;
      }
      
      // Log the issues found
      console.warn(`⚠️ Found ${validation.issues.length} issues in the ABC notation:`);
      validation.issues.forEach(issue => console.warn(`  - ${issue}`));
      
      // Apply automatic fixes
      console.log(`Applying automatic fixes...`);
      const fixedContent = validation.fixedNotation;
      
      // Determine the output path
      const outputPath = options.output || options.input;
      
      // Save the fixed content
      fs.writeFileSync(outputPath, fixedContent);
      console.log(`Fixed ABC notation saved to: ${outputPath}`);
    } catch (error) {
      console.error('Error validating ABC file:', error);
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
    mix-and-match  Create a new composition by mixing and matching segments from multiple ABC files
    lyrics         Add lyrics to an existing composition using Claude
    browse         Launch interactive TUI browser for the music dataset
    validate-abc   Validate and fix formatting issues in ABC notation files
    
  Examples:
    mediocre genres -c "baroque,classical,romantic" -m "techno,ambient,glitch" -n 5
    mediocre generate -C "baroque,classical" -M "techno,ambient" -c 3
    mediocre generate -g "baroque_x_jazz" --system-prompt my-prompt.txt --solo
    mediocre generate -g "baroque_x_jazz" --record-label "Merge Records"
    mediocre generate -g "baroque_x_jazz" --producer "Phil Spector"
    mediocre generate -g "baroque_x_jazz" --instruments "Violin,Piano,Trumpet"
    mediocre generate -g "baroque_x_jazz" --sequential    # LLM evaluates and expands until complete
    mediocre generate -g "baroque_x_jazz" --creative-names # EXPERIMENTAL FEATURE
    mediocre list --sort length --limit 10
    mediocre info "/path/to/baroque_x_grunge-score1-1744572129572.abc"
    mediocre more-like-this "/path/to/baroque_x_grunge-score1-1744572129572.abc" -c 2 -s "minimalist" --record-label "Warp Records" --solo --instruments "Cello,Synthesizer"
    mediocre modify "/home/user/music/baroque_x_grunge-score1-1744572129572.abc" -i "Make it longer with a breakdown section" --solo --instruments "Guitar,Drums,Bass"
    mediocre combine --duration-limit 45 --genres "baroque,romantic" --record-label "Raster Noton" --instruments "Synthesizer,Piano,Violin"
    mediocre mix-and-match -f "/home/user/music/fugue.abc" "/home/user/music/serialism.abc" --instruments "Piano,Violin,Synthesizer"
    mediocre lyrics -m "/path/to/baroque_x_jazz-score1.mid" -a "/path/to/baroque_x_jazz-score1.abc" -p "A song about the beauty of nature" --solo --instruments "Piano,Vocals"
    mediocre validate-abc                                 # Process and fix all ABC files in output dir
    mediocre validate-abc -i "/path/to/baroque_x_jazz-score1.abc" -o "/path/to/fixed.abc"  # Process a single file
    mediocre browse
    
  For more information, run: mediocre --help
  `);
} else {
  program.parse();
}