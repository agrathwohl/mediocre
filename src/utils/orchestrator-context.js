/**
 * Orchestrator Context Gathering
 *
 * Gathers musical history and metadata for the orchestrator agent
 * to make intelligent post-processing decisions.
 */

import fs from 'fs';
import path from 'path';
import { glob } from 'glob';

/**
 * Load composition context for orchestrator
 * @param {string} abcFilePath - Path to ABC file
 * @returns {Promise<Object>} Context object with metadata and analysis
 */
export async function loadCompositionContext(abcFilePath) {
  const basename = path.basename(abcFilePath, '.abc');
  const dir = path.dirname(abcFilePath);

  // Extract timestamp from basename if present (format: name-1234567890)
  const timestampMatch = basename.match(/-(\d+)$/);
  const basePattern = timestampMatch
    ? basename.replace(/-\d+$/, '')
    : basename;

  // Find description JSON file
  const jsonPath = await findContextFile(dir, basePattern, '_description.json', timestampMatch?.[1]);
  if (!jsonPath) {
    throw new Error(`No _description.json file found for ${basename}`);
  }

  // Find markdown analysis file
  const mdPath = await findContextFile(dir, basePattern, '.md', timestampMatch?.[1]);
  if (!mdPath) {
    throw new Error(`No .md analysis file found for ${basename}`);
  }

  // Read JSON metadata
  const metadata = JSON.parse(fs.readFileSync(jsonPath, 'utf-8'));

  // Read markdown and strip ABC notation section
  const markdownContent = fs.readFileSync(mdPath, 'utf-8');
  const analysisOnly = stripAbcNotationFromMarkdown(markdownContent);

  return {
    metadata,
    analysis: analysisOnly,
    abcFilePath,
    jsonPath,
    mdPath
  };
}

/**
 * Find context file (JSON or MD) matching basename
 * If exact timestamp match not found, returns most recent
 *
 * @param {string} dir - Directory to search
 * @param {string} basePattern - Base filename pattern (without timestamp)
 * @param {string} extension - File extension to match
 * @param {string} [exactTimestamp] - Exact timestamp to match (optional)
 * @returns {Promise<string|null>} File path or null if not found
 */
async function findContextFile(dir, basePattern, extension, exactTimestamp) {
  // Try exact match first if we have a timestamp
  if (exactTimestamp) {
    const exactPath = path.join(dir, `${basePattern}-${exactTimestamp}${extension}`);
    if (fs.existsSync(exactPath)) {
      return exactPath;
    }
  }

  // Find all matching files
  const pattern = path.join(dir, `${basePattern}-*${extension}`);
  const matches = await glob(pattern);

  if (matches.length === 0) {
    return null;
  }

  // If only one match, return it
  if (matches.length === 1) {
    return matches[0];
  }

  // Multiple matches - find most recent by unix epoch timestamp
  const filesWithTimestamps = matches.map(filePath => {
    const filename = path.basename(filePath, extension);
    const timestampMatch = filename.match(/-(\d+)$/);
    return {
      path: filePath,
      timestamp: timestampMatch ? parseInt(timestampMatch[1], 10) : 0
    };
  });

  // Sort by timestamp descending (most recent first)
  filesWithTimestamps.sort((a, b) => b.timestamp - a.timestamp);

  return filesWithTimestamps[0].path;
}

/**
 * Strip ABC notation section from markdown
 * Removes everything from "## ABC Notation" to the SECOND set of three backticks
 *
 * @param {string} markdown - Full markdown content
 * @returns {string} Markdown with ABC notation removed
 */
function stripAbcNotationFromMarkdown(markdown) {
  const lines = markdown.split('\n');
  const result = [];

  let inAbcSection = false;
  let backtickCount = 0;

  for (const line of lines) {
    // Start of ABC section
    if (line.trim() === '## ABC Notation') {
      inAbcSection = true;
      continue;
    }

    // Count backticks while in ABC section
    if (inAbcSection) {
      if (line.trim() === '```') {
        backtickCount++;

        // Second backtick = end of ABC code block
        if (backtickCount === 2) {
          inAbcSection = false;
          backtickCount = 0;
          continue;
        }
      }
      // Skip all lines in ABC section
      continue;
    }

    // Keep all lines outside ABC section
    result.push(line);
  }

  return result.join('\n').trim();
}

