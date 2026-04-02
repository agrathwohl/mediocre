#!/usr/bin/env node

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { dirname } from 'path';
import { execa } from 'execa';
import { program } from 'commander';
import { config } from './utils/config.js';
import { parseGenreList, generateMultipleHybridGenres } from './utils/genre-generator.js';
import { generateAbc } from './commands/generate-abc.js';
import { generateMxml, runMxmlSequentialExpansion } from './commands/generate-mxml.js';
import { convertToMidi } from './commands/convert-midi.js';
import { convertToPdf } from './commands/convert-pdf.js';
import { convertToWav } from './commands/convert-wav.js';
import { processEffects } from './commands/process-effects.js';
import { buildDatasetML, validateDatasetCommand, datasetInfoCommand } from './commands/build-dataset.js';
import { listCompositions, displayCompositionInfo, createMoreLikeThis } from './commands/manage-dataset.js';
import { modifyComposition, runModifyValidationLoop } from './commands/modify-composition.js';
import { modifyMxmlComposition } from './commands/modify-mxml-composition.js';
import { combineCompositions } from './commands/combine-compositions.js';
import { generateLyrics } from './commands/generate-lyrics.js';
import { mixAndMatch } from './commands/mix-and-match.js';
import { sanitizeDrums } from './commands/sanitize-drums.js';
import { generateAsciiArt, listAsciiArt, exportAsciiArt } from './commands/generate-ascii-art.js';
import { generateChoreographyNew } from './commands/generate-choreography-new.js';
import { generateOnsets } from './commands/generate-onsets.js';
import { playChoreography } from './commands/play-choreography.js';
import { enhanceComposition } from './commands/enhance-composition.js';
import { complainCommand } from './commands/complain.js';
import { generateTimidityConfig } from './commands/generate-timidity-config.js';
import { createDatasetBrowser } from './ui/index.js';
import { extractMidiStems } from './utils/stem-extractor.js';
import { validateAbcCommand } from './commands/validate-abc.js';
import { resumeSession } from './commands/resume-session.js';
import { compareIterations } from './commands/compare-iterations.js';
import { listCheckpointsForPath, CheckpointManager } from './control/checkpoint-manager.js';
import { generateTemplate } from './commands/generate-template.js';
import { compose } from './commands/compose.js';
import { resolveMirrorFile } from './utils/abc-mirror.js';
import { evolve } from './commands/evolve.js';
import { setAnthropicConfig, setLlamaServer, setAbc2midiBinary, getAbc2midiBinary } from './utils/llm-client.js';

// ES module path resolution
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Set up the CLI program
program
  .name('mediocre')
  .description('CLI tool for generating synthetic music compositions for AI training datasets')
  .version('0.1.2')
  .option('--model <id>', 'Custom model ID for all AI agents')
  .option('--proxy-url <url>', 'Custom base URL for Anthropic API proxy')
  .option('--api-key <key>', 'Custom API key for Anthropic')
  .option('--llama-server <url>', 'Use a local llama-server (OpenAI-compatible API) instead of Anthropic (e.g. http://localhost:8001/v1)')
  .option('--abc2midi <path>', 'Path to a custom abc2midi binary (e.g. for Pneuma fork)');

program.hook('preAction', (thisCommand) => {
  const { model, proxyUrl, apiKey, llamaServer, abc2midi } = thisCommand.opts();
  if (abc2midi) {
    setAbc2midiBinary(abc2midi);
  }
  if (llamaServer) {
    setLlamaServer(llamaServer);
    if (model) setAnthropicConfig({ model });
    return;
  }
  if (Boolean(proxyUrl) !== Boolean(apiKey)) {
    console.error('Error: --proxy-url and --api-key must be provided together.');
    process.exit(1);
  }
  if (model || proxyUrl) {
    setAnthropicConfig({ model, baseURL: proxyUrl, apiKey });
  }
});

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
  .option('-g, --genre <value>', 'Music genre or hybrid genre (format: classical_x_modern)')
  .option('-s, --style <value>', 'Music style')
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
  .option('--soundfonts', '[EXPERIMENTAL] Use LLM to select custom soundfonts and generate per-composition TiMidity config')
  .option('--sequential', 'Generate foundation then use orchestrated enhancement loop (requires agents enabled)')
  .option('--max-iterations <n>', 'Max enhancement iterations for sequential mode', '10')
  .option('--no-object', 'Use text output mode instead of structured object mode (default: object mode)')
  .option('--stream-text', 'Use streaming mode for API calls (helps avoid timeout errors on large generations)')
  .option('--interactive', 'Enable human-in-the-loop interactive mode for sequential enhancement')
  .option('--instructions <text>', 'Hard compositional requirements applied throughout the entire generation pipeline (e.g. "use only grand piano and drums")')
  .option('--midi', 'Run abc2midi on generated ABC files (enabled by default)', true)
  .option('--no-midi', 'Skip abc2midi conversion')
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
          customSystemPrompt = await fs.promises.readFile(options.systemPrompt, 'utf8');
          console.log(`Loaded custom system prompt from ${options.systemPrompt}`);
        } catch (error) {
          throw new Error(`Failed to load system prompt: ${error.message}`);
        }
      }
      
      if (options.userPrompt) {
        try {
          customUserPrompt = await fs.promises.readFile(options.userPrompt, 'utf8');
          console.log(`Loaded custom user prompt from ${options.userPrompt}`);
        } catch (error) {
          throw new Error(`Failed to load user prompt: ${error.message}`);
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
          soundfonts: options.soundfonts || false,
          sequentialMode: options.sequential || false,
          maxIterations: parseInt(options.maxIterations || '5', 10),
          objectMode: options.object !== false,
          useStreaming: options.streamText || false,
          interactive: options.interactive || false
        };

        const files = await generateAbc(genreOptions);

        allFiles.push(...files);
      }

      if (options.midi !== false && allFiles.length > 0) {
        console.log('\n🎹 Running abc2midi on generated files...');
        for (const abcFile of allFiles) {
          try {
            const midiFiles = await convertToMidi({ input: abcFile, output: options.output });
            if (midiFiles.length > 0) {
              console.log(`  ✅ ${path.basename(abcFile)} → MIDI`);
              // Extract stems for each successfully created MIDI
              const stemResult = await extractMidiStems(abcFile);
              if (!stemResult.success) {
                console.warn(`  ⚠️ Stem extraction failed: ${stemResult.error}`);
              }
            }
          } catch (midiError) {
            console.warn(`  ⚠️ abc2midi failed for ${path.basename(abcFile)}: ${midiError.message}`);
          }
        }
      }

      console.log(`\nGenerated ${allFiles.length} composition(s) total`);
    } catch (error) {
      console.error('Error generating compositions:', error);
    }
  });

program
  .command('template')
  .description('Generate a structure file from a formal template for pipeline composition')
  .requiredOption('--form <type>', 'Form type: ritual, stack-overflow, source-transfer, accumulative')
  .option('--key <key>', 'Key signature (e.g. Dmin, Ddor, Am, K:none)', 'Ddor')
  .option('--meter <meter>', 'Time signature (e.g. 7/8, 5/4, 11/8)', '7/8')
  .option('--note-len <len>', 'Base note length (e.g. 1/8, 1/16)', '1/8')
  .option('--tempo <bpm>', 'Tempo in BPM', '152')
  .option('--bars <n>', 'Total bar count', '64')
  .option('--voices <preset>', 'Voice preset: medieval, orchestral, electronic, chamber, industrial, baroque', 'orchestral')
  .option('--drumarc <arc>', 'Drum timbral arc: exploration, sparse-to-dense, skin-metal-wood, decay', 'exploration')
  .option('--exit-strategy <type>', 'Exit strategy for accumulative form: reverse, selective, collapse', 'reverse')
  .option('--entry-interval <n>', 'Bars between voice entries (accumulative form)', '8')
  .option('--source-a <desc>', 'Source A description (source-transfer form)')
  .option('--source-b <desc>', 'Source B description (source-transfer form)')
  .option('--push-bars <n>', 'Push phase bars (stack-overflow form)', '32')
  .option('--pneuma <preset>', 'Pneuma temporal humanization: none, subtle, organic, drunk, ritual, mechanical', 'organic')
  .option('--instruments <list>', 'Comma-separated list of instruments (e.g. "violin,cello,church organ,warm pad")')
  .option('--enhanced', 'Enable abc2midi-llm fork directives (ENSEMBLE, SPATIAL, ARTICULATE, TRANSFORM). Requires --abc2midi pointed at the fork.')
  .option('-o, --output <directory>', 'Output directory', config.get('outputDir'))
  .option('--filename <name>', 'Output filename')
  .action(async (options) => {
    try {
      await generateTemplate(options);
    } catch (error) {
      console.error('Error generating template:', error);
    }
  });

program
  .command('compose <template>')
  .description('Fill a template structure file with LLM-generated content')
  .option('--dry-run', 'Parse template and show slots without generating')
  .option('--slot <n>', 'Fill only slot N (for testing)')
  .option('--skip-validation', 'Skip abc2midi validation')
  .option('-o, --output <file>', 'Output filename (default: <template>-composed.abc)')
  .action(async (templatePath, options) => {
    try {
      await compose(templatePath, {
        dryRun: options.dryRun,
        slotNumber: options.slot ?? null,
        output: options.output,
        skipValidation: options.skipValidation,
      });
    } catch (error) {
      console.error('Error composing:', error);
    }
  });

program
  .command('mirror <file>')
  .description('Resolve %%MIRROR directives in an ABC file (splice material from other compositions)')
  .option('-o, --output <file>', 'Output filename (default: overwrite in place)')
  .action(async (filePath, options) => {
    try {
      const { operations, errors } = await resolveMirrorFile(filePath, options.output);
      if (operations === 0) {
        console.log('No %%MIRROR directives found.');
      } else {
        console.log(`✓ Resolved ${operations} MIRROR directive(s) → ${options.output || filePath}`);
      }
      if (errors.length > 0) {
        errors.forEach(e => console.warn(`  ⚠️ ${e}`));
      }
    } catch (error) {
      console.error('Error resolving mirrors:', error);
    }
  });

program
  .command('evolve <abc-file>')
  .description('Evolutionary selection: render N variations with different seeds, score segments via QA, assemble the best. Requires abc2midi-llm fork with -seed support.')
  .option('-n, --renders <n>', 'Number of seed variations to render', '20')
  .option('--segment-bars <n>', 'Bars per evaluation segment', '8')
  .option('--top <n>', 'Show top N results in output', '5')
  .option('--keep-renders', 'Keep individual render MIDI and ABC files')
  .option('--skip-qa', 'Skip LLM scoring — use content density as proxy (fast)')
  .option('-o, --output <file>', 'Output filename for evolved ABC')
  .action(async (abcFile, options) => {
    try {
      await evolve(abcFile, {
        renders: parseInt(options.renders),
        segmentBars: parseInt(options.segmentBars),
        topN: parseInt(options.top),
        keepRenders: options.keepRenders,
        skipQa: options.skipQa,
        output: options.output,
      });
    } catch (error) {
      console.error('Error in evolution:', error);
    }
  });

program
  .command('generate-mxml')
  .description('Generate MusicXML notation files using Claude Sonnet 4.5')
  .option('-c, --count <number>', 'Number of compositions to generate', '1')
  .option('-g, --genre <value>', 'Music genre or hybrid genre (format: classical_x_modern)')
  .option('-s, --style <value>', 'Music style')
  .option('-C, --classical <genres>', 'Comma-separated list of classical/traditional genres for hybrid generation')
  .option('-M, --modern <genres>', 'Comma-separated list of modern genres for hybrid generation')
  .option('-o, --output <directory>', 'Output directory', config.get('outputDir'))
  .option('--system-prompt <file>', 'Path to a file containing a custom system prompt for Claude')
  .option('--user-prompt <file>', 'Path to a file containing a custom user prompt for Claude')
  .option('--creative-names', '[EXPERIMENTAL] Generate creative genre names instead of standard hybrid format (may produce unpredictable results)', false)
  .option('--solo', 'Include a musical solo section for the lead instrument')
  .option('--record-label <name>', 'Make it sound like it was released on the given record label')
  .option('--producer <name>', 'Make it sound as if it was produced by the provided record producer')
  .option('--instruments <list>', 'Comma-separated list of instruments the output MusicXML must include')
  .option('--sequential', 'Use sequential LLM expansion to create longer, more developed compositions through chained modifications')
  .option('--stream-text', 'Use streaming mode for API calls (helps avoid timeout errors on large generations)')
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
          customSystemPrompt = await fs.promises.readFile(options.systemPrompt, 'utf8');
          console.log(`Loaded custom system prompt from ${options.systemPrompt}`);
        } catch (error) {
          throw new Error(`Failed to load system prompt: ${error.message}`);
        }
      }

      if (options.userPrompt) {
        try {
          customUserPrompt = await fs.promises.readFile(options.userPrompt, 'utf8');
          console.log(`Loaded custom user prompt from ${options.userPrompt}`);
        } catch (error) {
          throw new Error(`Failed to load user prompt: ${error.message}`);
        }
      }

      // Generate MusicXML notation for each genre
      const allFiles = [];

      for (const genre of genres) {
        const genreOptions = {
          genre: genre.name,
          style: options.style || 'standard',
          count: 1, // Generate one composition per genre
          output: options.output,
          systemPrompt: customSystemPrompt,
          userPrompt: customUserPrompt,
          creativeNames: options.creativeNames === true,
          solo: options.solo || false,
          recordLabel: options.recordLabel || '',
          producer: options.producer || '',
          instruments: options.instruments || '',
          sequentialMode: options.sequential || false,
          useStreaming: options.streamText || false
        };

        const files = await generateMxml(genreOptions);

        // If sequential mode is enabled, let the LLM decide when the composition is complete
        if (options.sequential && files.length > 0) {
          await runMxmlSequentialExpansion(files, {
            solo: options.solo || false,
            recordLabel: options.recordLabel || '',
            producer: options.producer || '',
            instruments: options.instruments || '',
            useStreaming: options.streamText || false
          });
        }

        allFiles.push(...files);
      }

      console.log(`\nGenerated ${allFiles.length} MusicXML composition(s) total`);
    } catch (error) {
      console.error('Error generating MusicXML compositions:', error);
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

const datasetCmd = program
  .command('dataset')
  .description('ML dataset operations (build, validate, info)');

datasetCmd
  .command('build')
  .description('Build ML-ready JSONL dataset from composition corpus')
  .option('-i, --input <directory>', 'Input directory with compositions', config.get('outputDir'))
  .option('-o, --output <directory>', 'Output directory for dataset', 'dataset')
  .option('-q, --quality <score>', 'Minimum QA score threshold (0-10)', '0')
  .option('--tier <tier>', 'Filter by quality tier: gold, silver, bronze')
  .option('--tasks <types>', 'Task types (comma-separated): genre_generation,description_to_music,music_to_description,parameter_generation,continuation')
  .option('--variants <n>', 'Instruction variants per task type', '1')
  .option('--no-deduplicate', 'Skip deduplication')
  .option('--train-ratio <ratio>', 'Train split ratio', '0.9')
  .option('--val-ratio <ratio>', 'Validation split ratio', '0.05')
  .option('--test-ratio <ratio>', 'Test split ratio', '0.05')
  .option('--version <version>', 'Dataset version string', '1.0.0')
  .option('--no-card', 'Skip dataset card generation')
  .option('--dry-run', 'Preview without writing files')
  .option('--max-samples <n>', 'Limit total compositions processed')
  .option('--stage <stage>', 'Prefer stage: final, modified, combined, score1')
  .option('--seed <n>', 'Random seed for splits', '42')
  .action(async (options) => {
    try {
      await buildDatasetML(options);
    } catch (error) {
      console.error('Error building dataset:', error.message);
      process.exit(1);
    }
  });

datasetCmd
  .command('validate')
  .description('Validate existing JSONL dataset for schema compliance')
  .argument('[path]', 'Dataset directory', 'dataset')
  .action(async (datasetPath) => {
    try {
      await validateDatasetCommand({ path: datasetPath });
    } catch (error) {
      console.error('Error validating dataset:', error.message);
      process.exit(1);
    }
  });

datasetCmd
  .command('info')
  .description('Display dataset statistics')
  .argument('[path]', 'Dataset directory', 'dataset')
  .action(async (datasetPath) => {
    try {
      await datasetInfoCommand({ path: datasetPath });
    } catch (error) {
      console.error('Error reading dataset info:', error.message);
      process.exit(1);
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
  .option('-s, --style <value>', 'Music style to apply')
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
  .option('--stream-text', 'Use streaming mode for API calls (helps avoid timeout errors on large generations)')
  .option('--sequential', 'Enable sequential mode: validates with abc2midi and auto-fixes issues')
  .option('--midi', 'Run abc2midi on successful output (default: true)', true)
  .option('--no-midi', 'Skip abc2midi conversion')
  .action(async (abcFile, options) => {
    try {
      let instructions = options.instructions;

      // If instructions file is provided, read from it
      if (options.instructionsFile && !instructions) {
        try {
          instructions = await fs.promises.readFile(options.instructionsFile, 'utf8');
          console.log(`Loaded modification instructions from ${options.instructionsFile}`);
        } catch (error) {
          throw new Error(`Failed to load instructions file: ${error.message}`);
        }
      }

      if (!instructions) {
        throw new Error('Instructions are required. Use --instructions or --instructions-file.');
      }

      const modifiedFile = await modifyComposition({
        ...options,
        abcFile,
        instructions,
        useStreaming: options.streamText || false
      });

      // If sequential mode is enabled, validate with abc2midi and auto-fix
      if (options.sequential && modifiedFile) {
        await runModifyValidationLoop(modifiedFile, options);
      }

      if (options.midi && modifiedFile) {
        const midiFile = modifiedFile.replace(/\.abc$/, '.mid');
        try {
          await execa(getAbc2midiBinary(), [modifiedFile, '-o', midiFile]);
          console.log(`🎵 MIDI generated: ${midiFile}`);
          // Extract stems for the modified composition
          const stemResult = await extractMidiStems(modifiedFile);
          if (!stemResult.success) {
            console.warn(`  ⚠️ Stem extraction failed: ${stemResult.error}`);
          }
        } catch (midiError) {
          console.warn(`⚠️ abc2midi conversion failed: ${midiError.message}`);
        }
      }
    } catch (error) {
      console.error('Error modifying composition:', error);
    }
  });

program
  .command('enhance')
  .description('Enhance a composition using orchestrated post-processing (ornamentation + MIDI expression)')
  .argument('<abcFile>', 'Direct file path to ABC notation file to enhance')
  .option('-o, --output <file>', 'Output path for enhanced composition (default: <input>-enhanced.abc)')
  .option('--max-iterations <number>', 'Maximum orchestration iterations', '10')
  .option('--interactive', 'Enable human-in-the-loop interactive mode')
  .action(async (abcFile, options) => {
    try {
      await enhanceComposition({
        input: abcFile,
        output: options.output,
        maxIterations: parseInt(options.maxIterations, 10),
        interactive: options.interactive || false,
      });
    } catch (error) {
      console.error('Error enhancing composition:', error);
    }
  });

program
  .command('complain')
  .description('Yell at the orchestrator about a prior session and force it to fix the problem')
  .argument('<sessionFile>', 'Path to _session.json from a prior run')
  .argument('<complaint>', 'Your complaint about what the orchestrator got wrong')
  .option('--max-iterations <number>', 'Maximum revision iterations', '5')
  .option('-o, --output <file>', 'Override output path for revision file')
  .action(async (sessionFile, complaint, options) => {
    try {
      await complainCommand({
        sessionFile,
        complaint,
        maxIterations: parseInt(options.maxIterations, 10),
        output: options.output,
      });
    } catch (error) {
      console.error('Error running complaint:', error);
    }
  });

program
  .command('timidity-config')
  .description('Generate TiMidity config for an existing ABC file')
  .argument('<abcFile>', 'Path to ABC notation file')
  .option('-g, --genre <name>', 'Genre name (e.g., "baroque_x_synthwave")')
  .option('-c, --classical-genre <name>', 'Classical genre component')
  .option('-m, --modern-genre <name>', 'Modern genre component')
  .option('-o, --output <dir>', 'Output directory for config file')
  .action(async (abcFile, options) => {
    try {
      await generateTimidityConfig(abcFile, {
        genre: options.genre,
        classicalGenre: options.classicalGenre,
        modernGenre: options.modernGenre,
        output: options.output,
      });
    } catch (error) {
      console.error('Error generating TiMidity config:', error);
      process.exit(1);
    }
  });

program
  .command('modify-mxml')
  .description('Modify an existing MusicXML composition according to instructions')
  .argument('<mxmlFile>', 'Direct file path to MusicXML notation file to modify')
  .option('-i, --instructions <text>', 'Instructions for modifying the composition')
  .option('-f, --instructions-file <file>', 'File containing instructions for modifying the composition')
  .option('-o, --output <directory>', 'Output directory for the modified composition')
  .option('--solo', 'Include a musical solo section for the lead instrument')
  .option('--record-label <name>', 'Make it sound like it was released on the given record label')
  .option('--producer <name>', 'Make it sound as if it was produced by the provided record producer')
  .option('--instruments <list>', 'Comma-separated list of instruments the output MusicXML must include')
  .option('--stream-text', 'Use streaming mode for API calls (helps avoid timeout errors on large generations)')
  .action(async (mxmlFile, options) => {
    try {
      let instructions = options.instructions;

      // If instructions file is provided, read from it
      if (options.instructionsFile && !instructions) {
        try {
          instructions = await fs.promises.readFile(options.instructionsFile, 'utf8');
          console.log(`Loaded modification instructions from ${options.instructionsFile}`);
        } catch (error) {
          throw new Error(`Failed to load instructions file: ${error.message}`);
        }
      }

      if (!instructions) {
        throw new Error('Instructions are required. Use --instructions or --instructions-file.');
      }

      const modifiedFile = await modifyMxmlComposition({
        ...options,
        mxmlFile,
        instructions,
        useStreaming: options.streamText || false
      });

      console.log(`Modified MusicXML composition saved to: ${modifiedFile}`);
    } catch (error) {
      console.error('Error modifying MusicXML composition:', error);
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
  .option('--sequential', 'Enable sequential mode: validates with abc2midi and auto-fixes issues')
  .option('--stream-text', 'Use streaming mode for API calls (helps avoid timeout errors on large generations)')
  .option('--midi', 'Run abc2midi on generated ABC files (enabled by default)', true)
  .option('--no-midi', 'Skip abc2midi conversion')
  .action(async (options) => {
    try {
      const files = await combineCompositions({
        ...options,
        useStreaming: options.streamText || false
      });

      // ABC validation happens inside combineCompositions - all returned files are valid
      // Run abc2midi to generate MIDI files
      if (options.midi !== false && files.length > 0) {
        console.log('\n🎹 Running abc2midi on generated files...');
        for (const abcFile of files) {
          try {
            const midiFile = abcFile.replace(/\.abc$/, '.mid');
            await execa(getAbc2midiBinary(), [abcFile, '-o', midiFile]);
            console.log(`  ✅ ${path.basename(abcFile)} → MIDI`);
            // Extract stems for each successfully created MIDI
            const stemResult = await extractMidiStems(abcFile);
            if (!stemResult.success) {
              console.warn(`  ⚠️ Stem extraction failed: ${stemResult.error}`);
            }
          } catch (midiError) {
            console.warn(`  ⚠️ abc2midi failed for ${path.basename(abcFile)}: ${midiError.message}`);
          }
        }
      }

      console.log(`\nGenerated ${files.length} combined composition(s)`);
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
  .command('sanitize')
  .description('Find and replace banned drum sounds in ABC files')
  .argument('<pattern>', 'Glob pattern to match ABC files (e.g., "output/*.abc")')
  .option('--llm', 'Use LLM for intelligent replacement (REQUIRED for non-standard drum programs)')
  .option('--dry-run', 'Report what would be changed without modifying files')
  .action(async (pattern, options) => {
    try {
      await sanitizeDrums(pattern, {
        useLLM: options.llm || false,
        dryRun: options.dryRun || false,
      });
    } catch (error) {
      console.error('Error sanitizing ABC files:', error);
    }
  });

program
  .command('generate-ascii-art')
  .description('Generate, list, or export ASCII art for musical compositions')
  .option('-a, --abc <file>', 'ABC file to generate ASCII art for')
  .option('-c, --count <number>', 'Number of ASCII art shapes to generate', '8')
  .option('-s, --style <value>', 'Style hint for ASCII art generation')
  .option('-l, --list', 'List all ABC notations with saved ASCII art')
  .option('-e, --export <basename>', 'Export ASCII art for a specific ABC basename')
  .action(async (options) => {
    try {
      if (options.list) {
        await listAsciiArt();
      } else if (options.export) {
        await exportAsciiArt(options.export);
      } else if (options.abc) {
        await generateAsciiArt(options);
      } else {
        throw new Error('Please specify --abc, --list, or --export.\n\nUsage:\n  mediocre generate-ascii-art --abc <file.abc> [--count 8] [--style "retro"]\n  mediocre generate-ascii-art --list\n  mediocre generate-ascii-art --export <basename>');
      }
    } catch (error) {
      console.error('Error with ASCII art command:', error);
      throw error;
    }
  });

program
  .command('generate-choreography')
  .description('Generate choreography JSON for audio visualization with iterative improvement')
  .option('-d, --description <text>', 'Music description', 'An experimental musical composition')
  .option('--desc <path>', 'Path to file containing description')
  .option('-a, --abc <path>', 'Path to ABC notation file')
  .option('-o, --output <path>', 'Output directory', './output')
  .option('--sequential', 'Use iterative expansion to reach target density (0.18 events/s, 0.80 actions/s)')
  .option('-v, --verbose', 'Show detailed progress')
    .action(async (options) => {
      try {
        await generateChoreographyNew(options);
      } catch (error) {
        console.error(`Error generating choreography: ${error.message}`);
        process.exitCode = 1;
      }
    });

// Hidden alias for generate-choreography-new (undocumented)
program
  .command('generate-choreography-new', { hidden: true })
  .description('Generate choreography JSON for audio visualization (alias)')
  .option('-d, --description <text>', 'Music description', 'An experimental musical composition')
  .option('--desc <path>', 'Path to file containing description')
  .option('-a, --abc <path>', 'Path to ABC notation file')
  .option('-o, --output <path>', 'Output directory', './output')
  .option('--sequential', 'Use iterative expansion to reach target density (0.18 events/s, 0.80 actions/s)')
  .option('-v, --verbose', 'Show detailed progress')
  .action(async (options) => {
    await generateChoreographyNew(options);
  });

program
  .command('generate-onsets')
  .description('Extract and save onset timing data from audio file')
  .option('-a, --abc <path>', 'Path to ABC notation file')
  .action(async (options) => {
    try {
      await generateOnsets(options);
    } catch (error) {
      console.error(`Error generating onsets: ${error.message}`);
      process.exitCode = 1;
    }
  });

program
  .command('play-choreography')
  .description('Play audio with choreographed ASCII art visualization')
  .argument('<audio>', 'Path to audio file (WAV)')
  .argument('[choreography]', 'Path to choreography JSON file (optional)')
  .option('--osd', 'Show on-screen display with playback info')
  .option('--no-title', 'Skip title card and ASCII art starring displays')
  .option('--no-descript', 'Skip subtitle/descript text overlay')
  .option('--record', 'Record screen to video file using gpu-screen-recorder')
  .action(async (audio, choreography, options) => {
    await playChoreography({
      audio,
      choreography,
      osd: options.osd,
      noTitle: options.noTitle,
      noDescript: options.noDescript,
      record: options.record
    });
  });

program
  .command('validate-abc')
  .description('Validate and fix formatting issues in ABC notation files')
  .option('-i, --input <file>', 'Input ABC file to validate and fix')
  .option('-o, --output <file>', 'Output file path (defaults to overwriting input)')
  .action(async (options) => {
    await validateAbcCommand(options);
  });


program
  .command('resume')
  .description('Resume a previously paused orchestration session')
  .argument('<sessionFile>', 'Path to session JSON file')
  .option('--max-iterations <number>', 'Additional iterations to run', '5')
  .option('--no-interactive', 'Disable interactive gating')
  .action(async (sessionFile, options) => {
    try {
      await resumeSession({
        sessionFile,
        maxIterations: parseInt(options.maxIterations, 10),
        interactive: options.interactive !== false,
      });
    } catch (error) {
      console.error('Error resuming session:', error.message);
      process.exit(1);
    }
  });

program
  .command('compare')
  .description('A/B comparison of two ABC iterations')
  .argument('<fileA>', 'Path to first ABC file')
  .argument('<fileB>', 'Path to second ABC file')
  .action(async (fileA, fileB) => {
    try {
      await compareIterations({ fileA, fileB });
    } catch (error) {
      console.error('Error comparing iterations:', error.message);
      process.exit(1);
    }
  });

program
  .command('checkpoints')
  .description('List all checkpoints and branches for a composition')
  .argument('<target>', 'Path to composition directory or ABC file')
  .action(async (target) => {
    try {
      const info = await listCheckpointsForPath(target);
      console.log(`\n📁 Checkpoints for: ${path.basename(target)}`);
      console.log('');
      if (info.iterations.length > 0) {
        console.log('  Iterations:');
        for (const iter of info.iterations) {
          console.log(`    ${iter.iteration}. ${path.basename(iter.path)} (${(iter.size / 1024).toFixed(1)} KB)`);
        }
      } else {
        console.log('  No iterations found.');
      }
      console.log('');
      if (info.branches.length > 0) {
        console.log('  Branches:');
        for (const branch of info.branches) {
          console.log(`    • ${branch.name} ${branch.hasJson ? '(+json)' : ''}`);
        }
      } else {
        console.log('  No branches found.');
      }
      if (info.sessionFile) {
        console.log(`\n  Session: ${path.basename(info.sessionFile)}`);
      }
      console.log('');
    } catch (error) {
      console.error('Error listing checkpoints:', error.message);
      process.exit(1);
    }
  });

program
  .command('branch')
  .description('Create a branch from a specific iteration')
  .argument('<abcFile>', 'Path to the composition ABC file')
  .option('--from <iteration>', 'Iteration number to branch from (default: latest)')
  .action(async (abcFile, options) => {
    try {
      const mgr = new CheckpointManager(abcFile);
      const iterations = await mgr.listIterations();
      let sourceAbc;
      let iterNum;
      if (options.from) {
        iterNum = parseInt(options.from, 10);
        const match = iterations.find(i => i.iteration === iterNum);
        if (!match) {
          console.error(`Iteration ${iterNum} not found. Available: ${iterations.map(i => i.iteration).join(', ')}`);
          process.exit(1);
        }
        sourceAbc = await fs.promises.readFile(match.path, 'utf-8');
      } else if (iterations.length > 0) {
        const latest = iterations[iterations.length - 1];
        iterNum = latest.iteration;
        sourceAbc = await fs.promises.readFile(latest.path, 'utf-8');
      } else {
        iterNum = 0;
        sourceAbc = await fs.promises.readFile(abcFile, 'utf-8');
      }
      const branchPath = await mgr.createBranch(sourceAbc, iterNum);
      console.log(`\n✅ Branch created: ${path.basename(branchPath)}`);
      console.log(`   To explore: mediocre enhance "${branchPath}" --interactive`);
    } catch (error) {
      console.error('Error creating branch:', error.message);
      process.exit(1);
    }
  });
// Default help message
// Handle default command behavior
if (process.argv.length === 2) {
  // No arguments at all - default to generate command
  process.argv.push('generate');
  program.parse();
} else if (process.argv.length === 3 && (process.argv[2] === '--help' || process.argv[2] === '-h')) {
  // Just --help flag - show custom help menu
  console.log(`
  🎵 Mediocre - Music Generation Tool 🎵

  Generate synthetic music compositions for AI training.

  Commands:
    genres         Generate hybrid genre names by combining classical and modern genres
    generate       Generate ABC notation files using Claude (default)
    generate-mxml  Generate MusicXML notation files using Claude Sonnet 4.5
    convert        Convert ABC files to MIDI, PDF, and WAV
    process        Apply audio effects to WAV files
    dataset        Build dataset from generated files
    list           List and sort compositions in the output directory
    info           Display detailed information about a composition
    more-like-this Generate more compositions similar to the specified one
    modify         Modify an existing ABC composition according to instructions
    modify-mxml    Modify an existing MusicXML composition according to instructions
    combine        Find short compositions and combine them into new pieces
    mix-and-match  Create a new composition by mixing and matching segments from multiple ABC files
    lyrics         Add lyrics to an existing composition using Claude
    browse         Launch interactive TUI browser for the music dataset
    sanitize       Find and replace banned drum sounds in ABC files
    generate-ascii-art  Generate, list, or export ASCII art for musical compositions
    generate-choreography  Generate choreography JSON with iterative improvement
    play-choreography      Play audio with choreographed ASCII art visualization
    generate-onsets        Extract and save onset timing data from audio file
    validate-abc   Validate and fix formatting issues in ABC notation files
    enhance        Enhance a composition using orchestrated post-processing (ornamentation + MIDI expression)
    complain       Yell at the orchestrator about a prior session and force it to fix the problem
    timidity-config Generate TiMidity config for an existing ABC file

  Examples:
    mediocre -g "baroque_x_jazz"                          # Defaults to generate command
    mediocre genres -c "baroque,classical,romantic" -m "techno,ambient,glitch" -n 5
    mediocre generate -C "baroque,classical" -M "techno,ambient" -c 3
    mediocre generate-mxml -g "baroque_x_jazz" --sequential --stream-text
    mediocre modify-mxml "/path/to/composition.musicxml" -i "Add a dramatic climax section" --stream-text
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
    mediocre enhance "/path/to/baroque_x_synthwave-score1.abc"  # Orchestrated post-processing with ornamentation + MIDI expression
    mediocre timidity-config "/path/to/baroque_x_synthwave-score1.abc"  # Generate TiMidity config with soundfont selection
    mediocre combine --duration-limit 45 --genres "baroque,romantic" --record-label "Raster Noton" --instruments "Synthesizer,Piano,Violin"
    mediocre mix-and-match -f "/home/user/music/fugue.abc" "/home/user/music/serialism.abc" --instruments "Piano,Violin,Synthesizer"
    mediocre lyrics -m "/path/to/baroque_x_jazz-score1.mid" -a "/path/to/baroque_x_jazz-score1.abc" -p "A song about the beauty of nature" --solo --instruments "Piano,Vocals"
    mediocre sanitize "/home/user/music/*.abc"            # Quick regex replacement of banned drum sounds
    mediocre sanitize "/home/user/music/**/*.abc" --llm   # Use LLM for intelligent drum sound replacement
    mediocre sanitize "output/*.abc" --dry-run            # Preview what would be changed without modifying
    mediocre generate-ascii-art --abc "/path/to/baroque_x_jazz-score1.abc" --count 8 --style "retro"
    mediocre generate-ascii-art --list                    # List all saved ASCII art
    mediocre generate-ascii-art --export baroque_x_jazz-score1  # Export ASCII art for specific composition
    mediocre validate-abc                                 # Process and fix all ABC files in output dir
    mediocre validate-abc -i "/path/to/baroque_x_jazz-score1.abc" -o "/path/to/fixed.abc"  # Process a single file
    mediocre browse

  For more information, run: mediocre <command> --help
  `);
} else if (process.argv[2] && process.argv[2].startsWith('-')) {
  // Starts with options but no command - default to generate
  process.argv.splice(2, 0, 'generate');
  program.parse();
} else {
  // Normal parsing with explicit command
  program.parse();
}