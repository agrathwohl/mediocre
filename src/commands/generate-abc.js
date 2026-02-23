import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import {
  generateMusicWithClaude,
  generateMusicWithSoundfonts,
  generateDescription,
  cleanAbcNotation,
  validateAbcNotation,
  saveCustomTimidityConfig
} from '../utils/claude.js';
import { generateCreativeGenreName } from '../utils/genre-generator.js';
import { config } from '../utils/config.js';
import { isAgentEnabled } from '../utils/feature-flags.js';
import { generateMusicWithAgent } from '../agents/composition/index.js';
import { researchGenresForComposition } from '../agents/genre-research/index.js';
import { ensureUniqueTitleWithAgent } from '../agents/title/index.js';
import { loadCompositionContext } from '../utils/orchestrator-context.js';
import { orchestratePostProcessing } from '../agents/orchestrator/index.js';
import { arrangeSoundfontsAndGenerateConfig } from '../agents/timidity-config/index.js';
import { GateController } from '../control/gate-controller.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/**
 * Extract MIDI instrument names from ABC notation
 * @param {string} abcNotation - ABC notation
 * @returns {Array<string>} Array of instrument names
 */
export function extractInstruments(abcNotation) {
  const instruments = [];
  const programRegex = /%%MIDI\s+program\s+(?:\d+\s+)?(\d+)/g;
  let match;
  
  // General MIDI program numbers to instrument names mapping
  const gmInstruments = [
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
  
  // Check for gchord and drum settings
  const hasGchord = abcNotation.includes('%%MIDI gchord');
  const hasDrum = abcNotation.includes('%%MIDI drum');
  
  if (hasGchord) {
    instruments.push('Guitar Chords');
  }
  
  if (hasDrum) {
    instruments.push('Percussion');
  }
  
  // Extract MIDI program numbers
  while ((match = programRegex.exec(abcNotation)) !== null) {
    const programNumber = parseInt(match[1], 10);
    if (programNumber >= 1 && programNumber <= 128) {
      // MIDI program numbers are 1-based, but our array is 0-based
      const instrumentName = gmInstruments[programNumber - 1];
      instruments.push(instrumentName);
    }
  }
  
  return [...new Set(instruments)]; // Remove duplicates
}

/**
 * Parse hybrid genre name into components
 * @param {string} genreName - Hybrid genre name (format: Classical_x_Modern)
 * @returns {Object} Object with classical and modern components
 */
function parseHybridGenre(genreName) {
  // Default components
  const components = {
    classical: 'Classical',
    modern: 'Contemporary'
  };
  
  // Check if follows the hybrid format
  const parts = genreName.toLowerCase().split('_x_');
  
  if (parts.length === 2) {
    // Preserve original case for display, but match case-insensitive
    const lowerGenreName = genreName.toLowerCase();
    const splitIndex = lowerGenreName.indexOf('_x_');
    components.classical = genreName.substring(0, splitIndex);
    components.modern = genreName.substring(splitIndex + 3);
  }
  
  return components;
}

/**
 * Sanitize a string for safe use in filenames.
 * @param {string} str - String to sanitize
 * @returns {string} Filename-safe string
 */
function sanitizeForFilename(str) {
  return str
    .replace(/[^a-zA-Z0-9_\-. ]/g, '_')
    .replace(/\s+/g, '_')
    .replace(/_{2,}/g, '_');
}

/**
 * Generate ABC notation files using Claude
 * @param {Object} options - Command options
 * @param {string} [options.genre] - Music genre (hybrid format preferred: Classical_x_Modern)
 * @param {string} [options.style] - Music style
 * @param {number} [options.count=1] - Number of compositions to generate
 * @param {string} [options.output] - Output directory
 * @param {string} [options.systemPrompt] - Custom system prompt for Claude
 * @param {string} [options.userPrompt] - Custom user prompt for Claude
 * @param {boolean} [options.solo] - Include a musical solo section for the lead instrument
 * @param {string} [options.recordLabel] - Make it sound like it was released on this record label
 * @param {string} [options.producer] - Make it sound as if it was produced by this record producer
 * @param {string} [options.instruments] - Comma-separated list of instruments the output ABC notations must include
 * @param {boolean} [options.sequentialMode] - If true, generate foundation then run orchestrated enhancement loop
 * @param {number} [options.maxIterations=5] - Max orchestration iterations when sequentialMode is true
 * @param {boolean} [options.soundfonts] - If true, use LLM to select custom soundfonts and generate per-composition TiMidity config
 * @returns {Promise<string[]>} Array of generated file paths
 */
export async function generateAbc(options) {
  const count = parseInt(options.count || '1', 10);
  const genre = options.genre || 'Classical_x_Contemporary';
  const style = options.style || 'standard';
  const outputDir = options.output || config.get('outputDir');
  const customSystemPrompt = options.systemPrompt;
  const customUserPrompt = options.userPrompt;
  const useCreativeNames = options.creativeNames === true; // Default to false unless explicitly specified
  const includeSolo = options.solo || false;
  const recordLabel = options.recordLabel || '';
  const producer = options.producer || '';
  const requestedInstruments = options.instruments || '';
  const sequentialMode = options.sequentialMode || false;
  const useCustomSoundfonts = options.soundfonts || false;
  
  // Parse the hybrid genre
  const genreComponents = parseHybridGenre(genre);
  
  // Ensure the output directory exists and is writable
  await fs.promises.mkdir(outputDir, { recursive: true });
  try {
    await fs.promises.access(outputDir, fs.constants.W_OK);
  } catch {
    throw new Error(`Output directory is not writable: ${outputDir}`);
  }
  
  const generatedFiles = [];
  
  for (let i = 0; i < count; i++) {
    // Generate a timestamp
    const timestamp = Date.now();

    // Hoist process log state so catch block can always finalize it
    let processLog = null;
    let saveProcessLog = null;

    try {
      // Generate a creative genre name if requested
      let displayGenre = genre;
      let creativeGenreName = null;
      
      if (useCreativeNames) {
        console.log('EXPERIMENTAL FEATURE: Generating creative genre name...');
        console.log('WARNING: Creative genre names may produce unpredictable results');
        try {
          const creativeResult = await generateCreativeGenreName({
            classicalGenre: genreComponents.classical,
            modernGenre: genreComponents.modern,
            temperature: 0.9
          });
          
          creativeGenreName = creativeResult.creativeName;
          console.log(`Generated creative genre name: ${creativeGenreName}`);
          
          // Use the creative name in the filename but keep the original genres internally
          displayGenre = creativeGenreName;
        } catch (error) {
          console.error('Error generating creative genre name:', error.message);
          // Fall back to standard genre format if creative name generation fails
        }
      }
      
      // Generate a filename based on genre and style
      const filename = `${sanitizeForFilename(displayGenre)}-score${i+1}-${timestamp}`;

      // Initialize process log — written immediately so there's always a record even on crash
      const processLogPath = path.join(outputDir, `${filename}_process.json`);
      processLog = {
        filename,
        genre: displayGenre,
        classicalGenre: genreComponents.classical,
        modernGenre: genreComponents.modern,
        style,
        startedAt: new Date().toISOString(),
        steps: [],
        status: 'in_progress',
      };
      await fs.promises.mkdir(outputDir, { recursive: true });
      saveProcessLog = () => fs.promises.writeFile(processLogPath, JSON.stringify(processLog, null, 2));
      await saveProcessLog();

      const logStep = async (step, data = {}) => {
        processLog.steps.push({ step, timestamp: new Date().toISOString(), ...data });
        await saveProcessLog();
      };

      // Generate the ABC notation with special attention to genre fusion
      console.log(`Generating ${displayGenre} composition in ${style} style...`);
      console.log(`Fusing ${genreComponents.classical} with ${genreComponents.modern}...`);
      await logStep('generation_start', { classical: genreComponents.classical, modern: genreComponents.modern });

      // Log if using a custom system prompt
      if (customSystemPrompt) {
        console.log('Using custom system prompt...');
      }

      let abcNotation;
      let selectedSoundfonts = null;
      let soundfontReasoning = null;

      if (useCustomSoundfonts) {
        // Generate music with LLM soundfont selection (--soundfonts flag)
        console.log('Using custom soundfont selection...');
        const generationResult = await generateMusicWithSoundfonts({
          genre: creativeGenreName || genre,
          classicalGenre: genreComponents.classical,
          modernGenre: genreComponents.modern,
          style,
          temperature: 0.7,
          customSystemPrompt,
          customUserPrompt,
          solo: includeSolo,
          recordLabel: recordLabel,
          producer: producer,
          instruments: requestedInstruments,
          useStreaming: options.useStreaming || false
        });

        abcNotation = generationResult.abcNotation;
        selectedSoundfonts = generationResult.soundfonts;
        soundfontReasoning = generationResult.soundfontReasoning;

        // Save the custom TiMidity config for this composition
        console.log(`Saving custom TiMidity config with ${selectedSoundfonts.length} soundfonts...`);
        const timidityConfigPath = await saveCustomTimidityConfig({
          soundfonts: selectedSoundfonts,
          outputDir,
          baseFilename: filename,
          title: creativeGenreName || genre,
          genre: creativeGenreName || genre
        });
        console.log(`Saved TiMidity config: ${timidityConfigPath}`);
      } else {
        // Check if agent-based generation is enabled
        if (isAgentEnabled('composition')) {
          console.log('🤖 Using agent-based generation...');

          // Research genres before generation so the composition agent knows
          // exactly what each genre requires (instruments, tempo, essential elements).
          // Also assesses whether the CLI flags complement or clash with the genres.
          const genreResearch = await researchGenresForComposition(
            genreComponents.classical,
            genreComponents.modern,
            {
              solo: includeSolo,
              recordLabel,
              producer,
              instruments: requestedInstruments,
              style,
            }
          );

          const agentArgs = {
            genre: creativeGenreName || genre,
            classicalGenre: genreComponents.classical,
            modernGenre: genreComponents.modern,
            style,
            objectMode: options.objectMode || false,
            solo: includeSolo,
            recordLabel: recordLabel,
            producer: producer,
            instruments: requestedInstruments,
            genreResearch,
          };
          // Retry once on SIGSEGV — a fresh generation often avoids whatever caused the crash
          try {
            abcNotation = await generateMusicWithAgent(agentArgs);
            await logStep('generation_complete', { mode: 'agent' });
          } catch (firstErr) {
            if (firstErr.message.includes('SIGSEGV') || firstErr.message.includes('SIGABRT') || firstErr.message.includes('crashed')) {
              const partialAbc = firstErr.abcNotation || null;
              await logStep('generation_crash_retry', { attempt: 1, error: firstErr.message });
              console.warn('⚠️ SIGSEGV on first attempt — retrying generation from scratch...');
              try {
                abcNotation = await generateMusicWithAgent(agentArgs);
                await logStep('generation_complete', { mode: 'agent', attempt: 2 });
              } catch (retryErr) {
                // Both attempts crashed — if we have partial ABC, fall through to outer validation
                // which will clean it and revalidate. If the cleaned version passes, enhancement runs.
                const crashAbc = retryErr.abcNotation || partialAbc;
                await logStep('generation_crash_both', { attempt: 2, error: retryErr.message, hadPartialAbc: !!crashAbc });
                if (crashAbc) {
                  console.warn(`⚠️ Both attempts crashed — attempting to continue with cleaned notation...`);
                  abcNotation = crashAbc;
                  // fall through — outer validation will clean and revalidate
                } else {
                  // Truly nothing to work with
                  processLog.status = 'crashed';
                  await saveProcessLog();
                  throw retryErr;
                }
              }
            } else {
              await logStep('generation_error', { error: firstErr.message });
              processLog.status = 'error';
              await saveProcessLog();
              throw firstErr;
            }
          }
        } else {
          // Default: Generate music without custom soundfont selection (use sanitized config)
          console.log('📝 Using traditional generation...');
          abcNotation = await generateMusicWithClaude({
            genre: creativeGenreName || genre,
            classicalGenre: genreComponents.classical,
            modernGenre: genreComponents.modern,
            style,
            temperature: 0.7,
            customSystemPrompt,
            customUserPrompt,
            solo: includeSolo,
            recordLabel: recordLabel,
            producer: producer,
            instruments: requestedInstruments,
            useStreaming: options.useStreaming || false
          });
        }
      }

      // Extract the instruments used in the composition
      const instruments = extractInstruments(abcNotation);
      const instrumentString = instruments.length > 0 
        ? instruments.join(', ') 
        : 'Default Instrument';
      
      console.log(`Using instruments: ${instrumentString}`);
      
      // First pass: clean the notation
      let cleanedAbcNotation = cleanAbcNotation(abcNotation);

      // Validate the ABC notation
      let validation = await validateAbcNotation(cleanedAbcNotation);

      // If there are issues, apply fix and revalidate — never gate on the pre-fix result
      if (!validation.isValid) {
        console.warn(`⚠️ WARNING: ABC notation validation issues found for ${filename}.abc:`);
        const issues = validation.issues || [];
        issues.forEach(issue => console.warn(`  - ${issue}`));
        console.warn(`Auto-fixing ${issues.length} issues...`);
        await logStep('validation_fix', { issues });
        cleanedAbcNotation = validation.fixedNotation;
        // Revalidate the fixed version — this is what actually decides whether we can proceed
        validation = await validateAbcNotation(cleanedAbcNotation);
        if (!validation.isValid) {
          console.warn(`⚠️ Fixed version still has ${(validation.issues || []).length} issue(s)`);
          await logStep('validation_fix_result', { status: 'still_invalid', issues: validation.issues || [] });
        } else {
          console.log(`✅ Fixed version passes validation`);
          await logStep('validation_fix_result', { status: 'ok' });
        }
      } else {
        console.log(`✅ ABC notation validation passed for ${filename}.abc`);
        await logStep('validation', { status: 'ok' });
      }

      // Save the cleaned and validated ABC notation to a file
      const abcFilePath = path.join(outputDir, `${filename}.abc`);
      await fs.promises.writeFile(abcFilePath, cleanedAbcNotation);
      generatedFiles.push(abcFilePath);
      await logStep('abc_written', { path: abcFilePath });

      // Only skip if abc2midi crashed (segfault/fatal) — non-fatal errors still produce usable MIDI
      const abcCrashed = (validation.issues || []).some(i => i.includes('crashed'));
      if (!abcCrashed) {
        // Generate and save the description
        console.log('Generating description document...');
        const description = await generateDescription({
          abcNotation,
          genre: creativeGenreName || genre, // Use creative name if available
          classicalGenre: genreComponents.classical,
          modernGenre: genreComponents.modern,
          style
        });
        
        // Add creative genre name to the description if one was generated
        if (creativeGenreName) {
          description.creativeGenreName = creativeGenreName;
        }

        // Use timidity config agent to select soundfonts when agents enabled but --soundfonts not used
        if (isAgentEnabled('timidityConfig') && !selectedSoundfonts) {
          console.log('🎛️ Using timidity config agent for soundfont selection...');
          try {
            const configResult = await arrangeSoundfontsAndGenerateConfig({
              abcNotation: cleanedAbcNotation,
              genre: creativeGenreName || genre,
              classicalGenre: genreComponents.classical,
              modernGenre: genreComponents.modern,
              outputDir,
              baseFilename: filename,
            });
            selectedSoundfonts = configResult.soundfonts;
            soundfontReasoning = configResult.layeringStrategy;
            console.log(`🎛️ Timidity config saved: ${configResult.configPath}`);
          } catch (cfgErr) {
            console.error('⚠️ Timidity config agent failed, skipping config:', cfgErr.message);
          }
        }

        // Add soundfont selection info to description (only if --soundfonts was used)
        if (selectedSoundfonts) {
          description.soundfonts = selectedSoundfonts;
          description.soundfontReasoning = soundfontReasoning;
          description.timidityConfig = `${filename}.timidity.cfg`;
        }

        // Save the description as JSON
        const descriptionFilePath = path.join(outputDir, `${filename}_description.json`);
        await fs.promises.writeFile(descriptionFilePath, JSON.stringify(description, null, 2));

        // Create a markdown file with both the ABC notation and description
        const soundfontSection = selectedSoundfonts ? `
## Soundfont Selection
**TiMidity Config:** \`${filename}.timidity.cfg\`
**Reasoning:** ${soundfontReasoning}

**Selected Soundfonts:**
${selectedSoundfonts.map((sf, i) => `${i + 1}. ${sf}`).join('\n')}
` : '';

        const mdContent = `# ${creativeGenreName || genre} Composition in ${style} Style

## Genre Fusion${creativeGenreName ? `\n- Creative Genre Name: "${creativeGenreName}"` : ''}
- Classical Element: ${genreComponents.classical}
- Modern Element: ${genreComponents.modern}

## Instruments
${instrumentString}
${soundfontSection}
## ABC Notation

\`\`\`
${abcNotation}
\`\`\`

## Analysis

${description.analysis}`;
        const mdFilePath = path.join(outputDir, `${filename}.md`);
        await fs.promises.writeFile(mdFilePath, mdContent);

        // Sequential mode: foundation generated, now feed to orchestrated enhancement loop
        if (sequentialMode) {
          console.log('\n🔄 Sequential mode: foundation complete, starting orchestrated enhancement...');
          try {
            const context = await loadCompositionContext(abcFilePath);

            // Create gate controller for interactive mode in sequential
            const gateController = options.interactive ? new GateController() : null;
            const enhancementResult = await orchestratePostProcessing({
              abcFilePath,
              musicalContext: context,
              genres: {
                classical: context.metadata.classicalGenre || '',
                modern: context.metadata.modernGenre || '',
                hybrid: context.metadata.genre || '',
              },
              maxIterations: options.maxIterations || 10,
              selectedSoundfonts: selectedSoundfonts || null,
              gateController,
            });

            if (gateController) gateController.close();

            // Remove the foundation .abc from generatedFiles — it's an intermediate artifact.
            // Iteration checkpoints (_iter*.abc) are also just artifacts, not final output.
            const foundationIdx = generatedFiles.indexOf(abcFilePath);
            if (foundationIdx !== -1) generatedFiles.splice(foundationIdx, 1);

            // Write the final result as the next clean versioned file (_1.abc, _2.abc, ...)
            const baseNoExt = abcFilePath.replace(/\.abc$/, '');
            let version = 1;
            let finalPath = `${baseNoExt}_${version}.abc`;
            while (true) {
              try { await fs.promises.access(finalPath); } catch { break; }
              version++;
              finalPath = `${baseNoExt}_${version}.abc`;
            }
            await fs.promises.writeFile(finalPath, enhancementResult.enhancedAbc);
            generatedFiles.push(finalPath);
            console.log(`✅ Sequential enhancement complete (${enhancementResult.iterations} iteration(s)) → ${path.basename(finalPath)}`);
          } catch (enhanceError) {
            console.error('⚠️ Sequential enhancement failed, keeping foundation:', enhanceError.message);
          }
        }
      } else {
        console.log('⚠️ Skipping enhancement - abc2midi crashed on this notation (segfault/fatal)');
        await logStep('enhancement_skipped', { reason: 'crash' });
      }

      processLog.status = 'complete';
      processLog.completedAt = new Date().toISOString();
      await saveProcessLog();
      console.log(`Generated ${abcFilePath}`);
    } catch (error) {
      console.error(`Error generating composition ${i+1}:`, error.message || error);
      if (saveProcessLog && processLog) {
        try {
          processLog.status = 'failed';
          processLog.error = error.message;
          processLog.failedAt = new Date().toISOString();
          await saveProcessLog();
        } catch (_) {}
      }
    }
  }

  return generatedFiles;
}

// If called directly from the command line
if (import.meta.url === `file://${process.argv[1]}`) {
  const args = process.argv.slice(2);
  const options = {
    genre: args[0],
    style: args[1],
    count: args[2] || '1',
    output: args[3] || config.get('outputDir')
  };
  
  (async () => {
    try {
      const files = await generateAbc(options);
      console.log(`Generated ${files.length} composition(s)`);
      process.exit(0);
    } catch (error) {
      console.error('Error:', error);
      process.exit(1);
    }
  })();
}