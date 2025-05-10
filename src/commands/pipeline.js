/**
 * Pipeline command for running multiple mediocre commands in sequence
 * Allows creating complex workflows where output from one command is fed to the next
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { generateAbc } from './generate-abc.js';
import { convertToMidi } from './convert-midi.js';
import { convertToPdf } from './convert-pdf.js';
import { convertToWav } from './convert-wav.js';
import { processEffects } from './process-effects.js';
import { combineCompositions } from './combine-compositions.js';
import { modifyComposition } from './modify-composition.js';
import { generateLyrics } from './generate-lyrics.js';
import { mixAndMatch } from './mix-and-match.js';
import { rearrangeComposition } from './rearrange.js';
import { config } from '../utils/config.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/**
 * Runs a pipeline of mediocre commands in sequence
 * @param {Object} options - Pipeline options
 * @param {string} options.config - Path to the pipeline configuration file
 * @returns {Promise<Object>} Pipeline execution results
 */
export async function runPipeline(options) {
  const configPath = options.config;

  if (!configPath) {
    throw new Error('Pipeline configuration file path is required. Use --config option.');
  }

  // Read pipeline configuration
  let pipelineConfig;
  try {
    const configContent = fs.readFileSync(configPath, 'utf8');
    pipelineConfig = JSON.parse(configContent);
  } catch (error) {
    throw new Error(`Failed to read or parse pipeline configuration file: ${error.message}`);
  }

  const {
    name = 'Mediocre Pipeline',
    description = 'A sequence of mediocre commands',
    output_dir = config.get('outputDir'),
    steps = []
  } = pipelineConfig;

  if (!Array.isArray(steps) || steps.length === 0) {
    throw new Error('Pipeline configuration must include at least one step');
  }

  // Create pipeline output directory if it doesn't exist
  if (!fs.existsSync(output_dir)) {
    fs.mkdirSync(output_dir, { recursive: true });
  }

  console.log(`\n🎵 Starting pipeline: ${name} 🎵`);
  console.log(description);
  console.log(`Output directory: ${output_dir}`);
  console.log(`Total steps: ${steps.length}\n`);

  // Track pipeline execution
  const pipelineResults = {
    name,
    description,
    output_dir,
    started_at: new Date().toISOString(),
    steps: [],
    completed_steps: 0,
    total_steps: steps.length,
    files_produced: []
  };

  // Keep track of files produced by previous steps
  let previousStepFiles = [];

  // Execute each step in sequence
  for (let i = 0; i < steps.length; i++) {
    const step = steps[i];
    const stepNumber = i + 1;
    
    console.log(`\n⏳ Step ${stepNumber}/${steps.length}: ${step.name || step.command}`);
    
    const stepResult = {
      name: step.name || `Step ${stepNumber}`,
      command: step.command,
      args: step.args || {},
      started_at: new Date().toISOString(),
      files_produced: [],
      success: false,
      error: null
    };

    try {
      // Create step-specific output directory
      const stepOutputDir = path.join(output_dir, `step${stepNumber}_${step.command}`);
      if (!fs.existsSync(stepOutputDir)) {
        fs.mkdirSync(stepOutputDir, { recursive: true });
      }
      
      // Prepare step arguments
      const stepArgs = { ...(step.args || {}) };
      
      // Set output directory to the step-specific directory
      stepArgs.output = stepOutputDir;
      
      // Add files from previous step to the current step's input
      if (previousStepFiles.length > 0) {
        await adaptInputFiles(step.command, stepArgs, previousStepFiles);
      }

      // Log the command about to be executed
      console.log(`Command: ${step.command}`);
      console.log('Arguments:', JSON.stringify(stepArgs, null, 2));
      
      // Execute the command
      const producedFiles = await executeCommand(step.command, stepArgs);
      
      // Update step results
      stepResult.files_produced = producedFiles;
      stepResult.completed_at = new Date().toISOString();
      stepResult.success = true;
      
      // Update previous step files for the next step
      previousStepFiles = producedFiles;
      
      console.log(`✅ Step ${stepNumber} completed. Files produced: ${producedFiles.length}`);
    } catch (error) {
      stepResult.error = error.message;
      stepResult.completed_at = new Date().toISOString();
      console.error(`❌ Error in step ${stepNumber}: ${error.message}`);
      
      // Determine if we should abort the pipeline
      if (step.abort_on_error === true) {
        console.error('Aborting pipeline due to error in step');
        break;
      } else {
        console.log('Continuing pipeline despite error');
      }
    }
    
    // Add step result to pipeline results
    pipelineResults.steps.push(stepResult);
    pipelineResults.completed_steps++;
    
    // Add files to overall produced files
    if (stepResult.files_produced && stepResult.files_produced.length > 0) {
      pipelineResults.files_produced.push(...stepResult.files_produced);
    }
  }

  // Complete pipeline execution
  pipelineResults.completed_at = new Date().toISOString();
  pipelineResults.duration_ms = new Date(pipelineResults.completed_at) - new Date(pipelineResults.started_at);
  
  // Write pipeline results to output directory
  const resultsPath = path.join(output_dir, 'pipeline_results.json');
  fs.writeFileSync(resultsPath, JSON.stringify(pipelineResults, null, 2));
  
  console.log(`\n🎉 Pipeline completed: ${pipelineResults.completed_steps}/${pipelineResults.total_steps} steps`);
  console.log(`Total files produced: ${pipelineResults.files_produced.length}`);
  console.log(`Results written to: ${resultsPath}\n`);
  
  return pipelineResults;
}

/**
 * Adapts files from the previous step to be used as input for the current step
 * @param {string} command - Command to execute
 * @param {Object} args - Command arguments
 * @param {Array<string>} previousFiles - Files produced by previous step
 */
async function adaptInputFiles(command, args, previousFiles) {
  if (previousFiles.length === 0) return;
  
  // Filter files by extension based on the command's expected input
  const abcFiles = previousFiles.filter(file => file.endsWith('.abc'));
  const midiFiles = previousFiles.filter(file => file.endsWith('.mid'));
  const wavFiles = previousFiles.filter(file => file.endsWith('.wav'));
  
  switch (command) {
    case 'generate':
      // generate doesn't take input files
      break;
      
    case 'convert':
      if (abcFiles.length > 0) {
        // Use the first ABC file if there are multiple
        args.input = abcFiles[0];
      }
      break;
      
    case 'process':
      if (wavFiles.length > 0) {
        // Use the first WAV file if there are multiple
        args.input = wavFiles[0];
      }
      break;
      
    case 'combine':
      // combine will look in the specified directory for WAV files
      // args.directory is already set to the step output directory
      break;
      
    case 'modify':
      if (abcFiles.length > 0) {
        // Use the first ABC file for modification
        args.abcFile = abcFiles[0];
        
        // If no instructions are provided, use a default
        if (!args.instructions && !args.instructionsFile) {
          args.instructions = "Develop this composition further by adding more variation and complexity";
        }
      }
      break;
      
    case 'lyrics':
      if (abcFiles.length > 0 && midiFiles.length > 0) {
        args.abcFile = abcFiles[0];
        args.midiFile = midiFiles[0];
        
        // If no lyrics prompt is provided, use a default
        if (!args.lyricsPrompt) {
          args.lyricsPrompt = "A song about music and creativity";
        }
      }
      break;
      
    case 'mix-and-match':
      if (abcFiles.length > 0) {
        // Use up to 3 ABC files for mix-and-match
        args.files = abcFiles.slice(0, 3);
      }
      break;
      
    case 'rearrange':
      if (abcFiles.length > 0) {
        // Use the first ABC file for rearranging
        args.abcFile = abcFiles[0];
        
        // If no instruments are provided, use a default set
        if (!args.instruments) {
          args.instruments = "Piano,Violin,Cello,Flute";
        }
      }
      break;
  }
}

/**
 * Executes a mediocre command with the given arguments
 * @param {string} command - Command to execute
 * @param {Object} args - Command arguments
 * @returns {Promise<Array<string>>} Paths to files produced by the command
 */
async function executeCommand(command, args) {
  let producedFiles = [];
  
  switch (command) {
    case 'generate':
      producedFiles = await generateAbc(args);
      break;
      
    case 'convert':
      if (args.to === 'midi' || !args.to || args.to === 'all') {
        producedFiles = await convertToMidi(args);
      }
      if (args.to === 'pdf' || args.to === 'all') {
        producedFiles = [...producedFiles, ...await convertToPdf(args)];
      }
      if (args.to === 'wav' || args.to === 'all') {
        producedFiles = [...producedFiles, ...await convertToWav(args)];
      }
      break;
      
    case 'process':
      producedFiles = await processEffects(args);
      break;
      
    case 'combine':
      producedFiles = await combineCompositions(args);
      break;
      
    case 'modify':
      const modifyResult = await modifyComposition(args);
      if (modifyResult && modifyResult.outputAbcFile) {
        producedFiles = [modifyResult.outputAbcFile];
      }
      break;
      
    case 'lyrics':
      const lyricsResult = await generateLyrics(args);
      producedFiles = [lyricsResult];
      break;
      
    case 'mix-and-match':
      const mixedFile = await mixAndMatch(args);
      producedFiles = [mixedFile];
      break;
      
    case 'rearrange':
      const rearrangedFile = await rearrangeComposition(args);
      producedFiles = [rearrangedFile];
      break;
      
    default:
      throw new Error(`Unknown command: ${command}`);
  }
  
  return producedFiles.filter(Boolean);
}

// If called directly from the command line
if (import.meta.url === `file://${process.argv[1]}`) {
  const configPath = process.argv[2];
  
  if (!configPath) {
    console.error('Please provide a path to a pipeline configuration file');
    process.exit(1);
  }
  
  runPipeline({ config: configPath })
    .then(() => {
      console.log('Pipeline execution completed');
      process.exit(0);
    })
    .catch(error => {
      console.error('Error executing pipeline:', error.message);
      process.exit(1);
    });
}