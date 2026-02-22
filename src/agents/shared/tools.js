/**
 * Shared tools for AI SDK v6 agents
 * Common tools used across multiple agents
 */

import { tool } from 'ai';
import { z } from 'zod';
import { validateAbcNotation } from '../../utils/claude.js';
import fs from 'fs';

// Cache the soundfont index
let soundfontIndex = null;
const SOUNDFONT_INDEX_PATH = '/home/gwohl/code/mediocre/soundfonts/soundfont_index.json';

/**
 * Load soundfont index (cached)
 */
function loadSoundfontIndex() {
  if (!soundfontIndex) {
    const data = fs.readFileSync(SOUNDFONT_INDEX_PATH, 'utf-8');
    soundfontIndex = JSON.parse(data);
  }
  return soundfontIndex;
}

/**
 * Validate ABC notation syntax and structure
 * Used by: Composition Agent, QA Agent, Ornamentation Agent, MIDI Extensions Agent
 */
export const validateAbcTool = tool({
  description: 'Validate ABC notation syntax, structure, and playability. Pass either abcNotation (inline text) or filePath (path to .abc file on disk). Call this ONLY after you have generated a complete composition draft — never before generating music.',
  inputSchema: z.object({
    abcNotation: z.string().optional().describe('The ABC notation text to validate (use this when you have the notation in memory)'),
    filePath: z.string().optional().describe('Path to an .abc file on disk to validate (preferred — avoids duplicating large notation in context)'),
  }),
  execute: async ({ abcNotation, filePath }) => {
    let notation = abcNotation;
    if (filePath && !notation) {
      notation = fs.readFileSync(filePath, 'utf-8');
    }
    if (!notation) {
      return { isValid: false, issues: ['No notation provided — pass abcNotation or filePath'], issueCount: 1, warnings: [], warningCount: 0, recommendations: 'Provide abcNotation or filePath' };
    }

    const validation = validateAbcNotation(notation);
    const hasWarnings = validation.warnings?.length > 0;
    const hasIssues = validation.issues.length > 0;

    return {
      isValid: validation.isValid,
      issues: validation.issues,
      issueCount: validation.issues.length,
      warnings: validation.warnings || [],
      warningCount: validation.warnings?.length || 0,
      recommendations: hasIssues
        ? `Fix ${validation.issues.length} error(s): ${validation.issues.join('; ')}`
        : hasWarnings
          ? `No errors, but ${validation.warnings.length} timing warning(s) — fix bar note lengths so each bar sums to the correct duration. Sample: ${validation.warnings.slice(0, 5).join('; ')}`
          : 'Notation is valid and ready',
    };
  },
});

/**
 * Read an ABC file from disk
 * Used by: QA Agent (to read composition content without embedding it in prompt)
 */
export const readAbcFileTool = tool({
  description: 'Read the contents of an ABC notation file from disk. Use this to load a composition for musical review.',
  inputSchema: z.object({
    filePath: z.string().describe('Path to the .abc file to read'),
  }),
  execute: async ({ filePath }) => {
    const content = fs.readFileSync(filePath, 'utf-8');
    return { content, byteLength: Buffer.byteLength(content, 'utf-8') };
  },
});

/**
 * Extract instruments from ABC notation
 * Used by: Composition Agent, Soundfont Agent, MIDI Extensions Agent
 */
export const extractInstrumentsTool = tool({
  description: 'Extract MIDI instruments and program numbers from ABC notation. Returns list of instruments used.',
  inputSchema: z.object({
    abcNotation: z.string().describe('The ABC notation to analyze'),
  }),
  execute: async ({ abcNotation }) => {
    const { extractInstruments } = await import('../../commands/generate-abc.js');
    const instruments = extractInstruments(abcNotation);

    return {
      instruments,
      count: instruments.length,
      instrumentList: instruments.join(', '),
      hasMultipleInstruments: instruments.length > 1,
    };
  },
});

/**
 * Check if a title already exists in compositions.json
 * Used by: Title Agent, Composition Agent
 */
export const checkTitleExistsTool = tool({
  description: 'Check if a composition title is already in use. Returns existence status and recommendation.',
  inputSchema: z.object({
    title: z.string().describe('The title to check for uniqueness'),
  }),
  execute: async ({ title }) => {
    // Import titleExists function from claude.js
    const { default: fs } = await import('fs');
    const { default: path } = await import('path');

    // Check if title exists in compositions.json
    const possiblePaths = [
      path.join(process.cwd(), 'docs/data/compositions.json'),
      path.join(process.cwd(), '../../docs/data/compositions.json'),
    ];

    let titleExists = false;
    for (const compositionsPath of possiblePaths) {
      try {
        if (fs.existsSync(compositionsPath)) {
          const content = fs.readFileSync(compositionsPath, 'utf8');
          const compositions = JSON.parse(content);
          if (Array.isArray(compositions)) {
            titleExists = compositions.some(
              c => c.title && c.title.toLowerCase().trim() === title.toLowerCase().trim()
            );
            if (titleExists) break;
          }
        }
      } catch (error) {
        // Continue to next path
      }
    }

    return {
      exists: titleExists,
      message: titleExists
        ? 'Title already exists - generate a different, unique title'
        : 'Title is unique and available',
      recommendation: titleExists
        ? 'Try adding a unique modifier or creative variation'
        : 'Title can be used',
    };
  },
});

/**
 * Search soundfont catalog by keywords
 * Used by: Soundfont Agent
 */
export const searchSoundfontCatalogTool = tool({
  description: 'Search the soundfont catalog (500 soundfonts, 81k+ presets) by keywords. Returns matching soundfonts with scores, preset counts, and metadata.',
  inputSchema: z.object({
    keywords: z.array(z.string()).describe('Keywords to search for (e.g., ["piano", "synth", "orchestral"])'),
    limit: z.number().optional().describe('Maximum results to return (default 20)'),
  }),
  execute: async ({ keywords, limit = 20 }) => {
    const index = loadSoundfontIndex();
    const searchTerms = keywords.map(k => k.toLowerCase());

    const results = index.soundfonts
      .map(sf => {
        // Search in filename, metadata, and preset names
        const filename = sf.filename.toLowerCase();
        const metadata = JSON.stringify(sf.metadata || {}).toLowerCase();
        const presets = sf.presets?.map(p => p.name.toLowerCase()).join(' ') || '';

        const searchText = `${filename} ${metadata} ${presets}`;

        // Count keyword matches
        const matches = searchTerms.filter(term => searchText.includes(term));

        return {
          soundfont: sf.filename,
          score: matches.length,
          matchedKeywords: matches,
          presetCount: sf.presetCount,
          metadata: sf.metadata,
          size: sf.size,
        };
      })
      .filter(result => result.score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, limit);

    return {
      totalMatches: results.length,
      results: results.map(r => ({
        filename: r.soundfont,
        score: r.score,
        matchedKeywords: r.matchedKeywords,
        presetCount: r.presetCount,
        author: r.metadata?.author || 'Unknown',
        comment: r.metadata?.comment || '',
      })),
      message: results.length > 0
        ? `Found ${results.length} soundfonts matching: ${searchTerms.join(', ')}`
        : 'No soundfonts found matching criteria',
    };
  },
});

/**
 * All shared tools registry
 * Export as object for easy access
 */
export const sharedTools = {
  validateAbc: validateAbcTool,
  extractInstruments: extractInstrumentsTool,
  checkTitleExists: checkTitleExistsTool,
  searchSoundfontCatalog: searchSoundfontCatalogTool,
};
