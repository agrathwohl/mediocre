import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { execa } from 'execa';
import { config } from '../utils/config.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/**
 * Convert ABC notation files to PDF
 * @param {Object} options - Command options
 * @param {string} [options.input] - Input ABC file
 * @param {string} [options.directory] - Input directory with ABC files
 * @param {string} [options.output] - Output directory
 * @returns {Promise<string[]>} Array of generated PDF file paths
 */
export async function convertToPdf(options) {
  const outputDir = options.output || config.get('outputDir');
  const generatedFiles = [];
  
  // Ensure the output directory exists
  await fs.promises.mkdir(outputDir, { recursive: true });
  
  // Process a single file if provided
  if (options.input) {
    try {
      await fs.promises.access(options.input);
      const outputPath = path.join(outputDir, path.basename(options.input, '.abc') + '.pdf');
      await convertFile(options.input, outputPath);
      generatedFiles.push(outputPath);
    } catch (e) {
      if (e.code !== 'ENOENT') throw e;
    }
  }
  
  // Process all files in a directory if provided
  if (options.directory) {
    try {
      await fs.promises.access(options.directory);
      const files = await fs.promises.readdir(options.directory);
      for (const file of files) {
        if (file.endsWith('.abc')) {
          const inputPath = path.join(options.directory, file);
          const outputPath = path.join(outputDir, path.basename(file, '.abc') + '.pdf');
          try {
            await convertFile(inputPath, outputPath);
            generatedFiles.push(outputPath);
          } catch (error) {
            console.error(`Error converting ${inputPath}: ${error.message}`);
          }
        }
      }
    } catch (e) {
      if (e.code !== 'ENOENT') throw e;
    }
  }
  
  return generatedFiles;
}

/**
 * Convert a single ABC file to PDF
 * @param {string} inputPath - Input ABC file path
 * @param {string} outputPath - Output PDF file path
 * @returns {Promise<void>}
 */
async function convertFile(inputPath, outputPath) {
  try {
    console.log(`Converting ${inputPath} to ${outputPath}`);
    
    const abcm2psBin = process.env.ABCM2PS_BIN || 'abcm2ps';
    const ps2pdfBin = process.env.PS2PDF_BIN || 'ps2pdf';

    // Check if abcm2ps is installed
    try {
      await execa('which', [abcm2psBin]);
    } catch (error) {
      throw new Error(`${abcm2psBin} not found. Set ABCM2PS_BIN or install abcm2ps.`);
    }

    // Check if ps2pdf is installed
    try {
      await execa('which', [ps2pdfBin]);
    } catch (error) {
      throw new Error(`${ps2pdfBin} not found. Set PS2PDF_BIN or install ghostscript.`);
    }
    
    // Generate a temporary PS file
    const tempPsFile = path.join(config.get('tempDir'), path.basename(inputPath, '.abc') + '.ps');
    
    // Convert ABC to PS using abcm2ps
    await execa(abcm2psBin, [inputPath, '-O', tempPsFile]);

    // Convert PS to PDF using ps2pdf
    await execa(ps2pdfBin, [tempPsFile, outputPath]);
    
    // Clean up the temporary PS file
    await fs.promises.unlink(tempPsFile);
    
    console.log(`Converted ${inputPath} to ${outputPath}`);
  } catch (error) {
    throw new Error(`Failed to convert ${inputPath} to PDF: ${error.message}`);
  }
}

// If called directly from the command line
if (import.meta.url === `file://${process.argv[1]}`) {
  const args = process.argv.slice(2);
  const options = {
    input: args[0],
    directory: args[1],
    output: args[2] || config.get('outputDir')
  };
  
  (async () => {
    try {
      const files = await convertToPdf(options);
      console.log(`Converted ${files.length} file(s) to PDF`);
      process.exit(0);
    } catch (error) {
      console.error('Error:', error);
      process.exit(1);
    }
  })();
}