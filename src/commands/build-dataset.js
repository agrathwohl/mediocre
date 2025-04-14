import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { config } from '../utils/config.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/**
 * Build dataset from generated files
 * @param {Object} options - Command options
 * @param {string} [options.directory] - Input directory
 * @param {string} [options.output] - Output directory
 * @returns {Promise<string>} Path to the generated dataset
 */
export async function buildDataset(options) {
  const inputDir = options.directory || config.get('outputDir');
  const outputDir = options.output || config.get('datasetDir');
  
  // Ensure the output directory exists
  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }
  
  try {
    console.log(`Building dataset from ${inputDir} to ${outputDir}...`);
    
    // Collect all relevant files (.abc, .mid, .wav, .pdf)
    const files = fs.readdirSync(inputDir);
    const datasetFiles = {
      abc: [],
      midi: [],
      wav: [],
      pdf: [],
      json: []
    };
    
    for (const file of files) {
      const filePath = path.join(inputDir, file);
      const fileStats = fs.statSync(filePath);
      
      if (fileStats.isDirectory()) {
        continue;
      }
      
      if (file.endsWith('.abc')) {
        datasetFiles.abc.push(filePath);
      } else if (file.endsWith('.mid')) {
        datasetFiles.midi.push(filePath);
      } else if (file.endsWith('.wav')) {
        datasetFiles.wav.push(filePath);
      } else if (file.endsWith('.pdf')) {
        datasetFiles.pdf.push(filePath);
      } else if (file.endsWith('.json')) {
        datasetFiles.json.push(filePath);
      }
    }
    
    console.log(`Found ${datasetFiles.abc.length} ABC files, ${datasetFiles.midi.length} MIDI files, ${datasetFiles.wav.length} WAV files, ${datasetFiles.pdf.length} PDF files, ${datasetFiles.json.length} JSON files`);
    
    // Create metadata file
    const metadata = {
      timestamp: new Date().toISOString(),
      files: {
        abc: datasetFiles.abc.map(file => path.basename(file)),
        midi: datasetFiles.midi.map(file => path.basename(file)),
        wav: datasetFiles.wav.map(file => path.basename(file)),
        pdf: datasetFiles.pdf.map(file => path.basename(file)),
        json: datasetFiles.json.map(file => path.basename(file))
      },
      pairs: []
    };
    
    // Build pairs of related files (abc-mid-wav-pdf-json)
    const baseNames = new Set();
    
    // Extract base names without extensions and without suffixes like -reverb, -delay, etc.
    for (const file of [...datasetFiles.abc, ...datasetFiles.midi, ...datasetFiles.wav, ...datasetFiles.pdf]) {
      let baseName = path.basename(file).split('.')[0];
      
      // Remove effect suffixes
      baseName = baseName.replace(/-(?:reverb|delay|distortion|all)$/, '');
      
      baseNames.add(baseName);
    }
    
    // For each base name, find all associated files
    for (const baseName of baseNames) {
      const pair = {
        baseName,
        abc: datasetFiles.abc
          .filter(file => path.basename(file).startsWith(baseName))
          .map(file => path.basename(file)),
        midi: datasetFiles.midi
          .filter(file => path.basename(file).startsWith(baseName))
          .map(file => path.basename(file)),
        wav: datasetFiles.wav
          .filter(file => path.basename(file).startsWith(baseName) || path.basename(file).startsWith(`${baseName}-`))
          .map(file => path.basename(file)),
        pdf: datasetFiles.pdf
          .filter(file => path.basename(file).startsWith(baseName))
          .map(file => path.basename(file)),
        json: datasetFiles.json
          .filter(file => path.basename(file).startsWith(baseName))
          .map(file => path.basename(file))
      };
      
      metadata.pairs.push(pair);
    }
    
    // Write metadata file
    const metadataPath = path.join(outputDir, 'metadata.json');
    fs.writeFileSync(metadataPath, JSON.stringify(metadata, null, 2));
    
    // Copy all files to the dataset directory
    for (const category of ['abc', 'midi', 'wav', 'pdf', 'json']) {
      for (const file of datasetFiles[category]) {
        const destPath = path.join(outputDir, path.basename(file));
        fs.copyFileSync(file, destPath);
      }
    }
    
    console.log(`Dataset built successfully at ${outputDir}`);
    return outputDir;
  } catch (error) {
    throw new Error(`Failed to build dataset: ${error.message}`);
  }
}

// If called directly from the command line
if (import.meta.url === `file://${process.argv[1]}`) {
  const args = process.argv.slice(2);
  const options = {
    directory: args[0] || config.get('outputDir'),
    output: args[1] || config.get('datasetDir')
  };
  
  buildDataset(options)
    .then(outputDir => {
      console.log(`Dataset built successfully at ${outputDir}`);
      process.exit(0);
    })
    .catch(error => {
      console.error('Error:', error);
      process.exit(1);
    });
}