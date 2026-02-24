import fs from 'fs';
import path from 'path';
import { validateAbcNotation } from '../utils/claude.js';
import { config } from '../utils/config.js';

export async function validateAbcCommand(options) {
  try {
    // When no input/output options are provided, process all ABC files in the output directory
    if (!options.input) {
      console.log('No input file specified. Processing all ABC files in the output directory...');
      
      // Get the output directory path from config
      const outputDir = config.get('outputDir');
      
      // Find all ABC files in the output directory
      const abcFiles = (await fs.promises.readdir(outputDir))
        .filter(file => file.endsWith('.abc'))
        .map(file => path.join(outputDir, file));
        
      
      console.log(`Found ${abcFiles.length} ABC files to process.`);
      
      let fixedCount = 0;
      let validCount = 0;
      
      // Process each file
      for (const abcFile of abcFiles) {
        console.log(`Processing file: ${abcFile}`);
        const abcContent = await fs.promises.readFile(abcFile, 'utf-8');
        
        // Validate the ABC notation
        const validation = await validateAbcNotation(abcContent);
        
        if (validation.isValid) {
          console.log(`\u2705 ${path.basename(abcFile)}: Validation passed. No issues found.`);
          validCount++;
          continue;
        }
        
        // Log the issues found
        console.warn(`\u26a0\ufe0f ${path.basename(abcFile)}: Found ${validation.issues.length} issues in the ABC notation:`);
        validation.issues.forEach(issue => console.warn(`  - ${issue}`));
        
        // Apply automatic fixes
        console.log(`Applying automatic fixes to ${path.basename(abcFile)}...`);
        const fixedContent = validation.fixedNotation;
        
        // Save the fixed content back to the original file
        await fs.promises.writeFile(abcFile, fixedContent);
        console.log(`\u2705 Fixed ABC notation saved to: ${abcFile}`);
        fixedCount++;
      }
      
      console.log(`Processed ${abcFiles.length} files: ${validCount} already valid, ${fixedCount} fixed.`);
      return;
    }
    
    // Standard single file processing when input is specified
    console.log(`Validating ABC file: ${options.input}`);
    const abcContent = await fs.promises.readFile(options.input, 'utf-8');
    
    // Validate the ABC notation
    const validation = await validateAbcNotation(abcContent);
    
    if (validation.isValid) {
      console.log(`\u2705 ABC notation validation passed. No issues found.`);
      return;
    }
    
    // Log the issues found
    console.warn(`\u26a0\ufe0f Found ${validation.issues.length} issues in the ABC notation:`);
    validation.issues.forEach(issue => console.warn(`  - ${issue}`));
    
    // Apply automatic fixes
    console.log(`Applying automatic fixes...`);
    const fixedContent = validation.fixedNotation;
    
    // Determine the output path
    const outputPath = options.output || options.input;
    
    // Save the fixed content
    await fs.promises.writeFile(outputPath, fixedContent);
    console.log(`Fixed ABC notation saved to: ${outputPath}`);
  } catch (error) {
    console.error('Error validating ABC file:', error);
  }
}
