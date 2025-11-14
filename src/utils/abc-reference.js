import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { config } from './config.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/**
 * Search for ABC notation files in output directory that match genre/style keywords
 * Returns examples for formatting reference only (not for musical content copying)
 * @param {Array<string>} keywords - Keywords to search for in filenames
 * @param {number} maxResults - Maximum number of files to return
 * @returns {Array<Object>} Array of file info with ABC content for reference
 */
export function findAbcReferenceFiles(keywords = [], maxResults = 3) {
  const outputDir = config.get('outputDir');
  
  if (!fs.existsSync(outputDir)) {
    return [];
  }
  
  try {
    // Get all ABC files
    const allFiles = fs.readdirSync(outputDir)
      .filter(file => file.endsWith('.abc'))
      .map(file => ({
        filename: file,
        path: path.join(outputDir, file),
        stats: fs.statSync(path.join(outputDir, file))
      }));
    
    // Filter by keywords (case insensitive)
    let matchingFiles = allFiles;
    if (keywords.length > 0) {
      matchingFiles = allFiles.filter(file => {
        const lowerFilename = file.filename.toLowerCase();
        return keywords.some(keyword => 
          lowerFilename.includes(keyword.toLowerCase())
        );
      });
    }
    
    // Sort by modification time (newest first) and limit results
    const selectedFiles = matchingFiles
      .sort((a, b) => b.stats.mtime - a.stats.mtime)
      .slice(0, maxResults);
    
    // Read content and return
    return selectedFiles.map(file => {
      try {
        const content = fs.readFileSync(file.path, 'utf8');
        // Return first 50 lines to avoid overwhelming the prompt
        const lines = content.split('\n');
        const truncatedContent = lines.slice(0, 50).join('\n');
        
        return {
          filename: file.filename,
          content: truncatedContent,
          totalLines: lines.length,
          truncated: lines.length > 50
        };
      } catch (error) {
        console.warn(`Warning: Could not read ${file.filename}: ${error.message}`);
        return null;
      }
    }).filter(Boolean);
    
  } catch (error) {
    console.warn(`Warning: Error searching for ABC reference files: ${error.message}`);
    return [];
  }
}

/**
 * Generate a reference prompt section with example ABC files for formatting guidance
 * @param {Array<string>} keywords - Keywords to search for (genre, style, etc.)
 * @returns {string} Formatted prompt section with examples
 */
export function generateAbcReferencePrompt(keywords = []) {
  const referenceFiles = findAbcReferenceFiles(keywords, 2);
  
  if (referenceFiles.length === 0) {
    return `
📚 ABC NOTATION REFERENCE EXAMPLES 📚

No matching reference files found in the output directory. Follow standard ABC notation formatting rules.
`;
  }
  
  let prompt = `
📚 ABC NOTATION REFERENCE EXAMPLES 📚

The following are examples of CORRECT ABC notation formatting from existing files.
Use these ONLY as formatting guidelines - DO NOT copy musical content!
Focus on: proper spacing, line structure, MIDI commands, voice declarations, etc.

`;

  referenceFiles.forEach((file, index) => {
    prompt += `
EXAMPLE ${index + 1}: ${file.filename}
${file.truncated ? `(Showing first 50 lines of ${file.totalLines} total)` : ''}
\`\`\`
${file.content}
\`\`\`

`;
  });
  
  prompt += `
⚠️ REMEMBER: Use these examples ONLY for proper ABC formatting syntax!
Create completely original musical content based on your genre fusion assignment.
`;
  
  return prompt;
}

/**
 * Tool function for LLM to search ABC reference files during generation
 * This is called by the LLM when it needs formatting guidance
 * @param {Object} params - Tool parameters
 * @param {Array<string>} params.keywords - Keywords to search for
 * @param {string} params.question - What the LLM is uncertain about
 * @returns {string} Formatted response with relevant examples
 */
export function searchAbcReference({ keywords = [], question = "" }) {
  console.log(`🔍 LLM searching ABC reference for: "${question}" with keywords: [${keywords.join(', ')}]`);
  
  const referenceFiles = findAbcReferenceFiles(keywords, 3);
  
  if (referenceFiles.length === 0) {
    return `No ABC reference files found matching keywords: ${keywords.join(', ')}. 
Follow standard ABC notation formatting rules for: ${question}`;
  }
  
  let response = `Found ${referenceFiles.length} ABC reference examples for: "${question}"\n\n`;
  
  referenceFiles.forEach((file, index) => {
    response += `REFERENCE ${index + 1}: ${file.filename}\n`;
    response += `${file.truncated ? `(First 50 lines of ${file.totalLines} total)\n` : ''}`;
    response += `\`\`\`\n${file.content}\n\`\`\`\n\n`;
  });
  
  response += `Use these examples ONLY for ABC formatting syntax guidance. Do NOT copy musical content!`;
  
  return response;
}