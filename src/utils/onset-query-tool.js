/**
 * Onset query tool for LLM choreography generation
 * Allows LLM to query onset timings within specific time ranges
 */

import fs from 'fs/promises';
import { z } from 'zod';
import { tool } from 'ai';

/**
 * Load onset data from cache file
 * @param {string} onsetCachePath - Path to onset cache JSON
 * @returns {Promise<Array<number>>} Array of onset times
 */
async function loadOnsetData(onsetCachePath) {
  try {
    const content = await fs.readFile(onsetCachePath, 'utf8');
    const data = JSON.parse(content);
    return data.onsets || [];
  } catch (error) {
    throw new Error(`Failed to load onset data: ${error.message}`);
  }
}

/**
 * Query onsets within a time range
 * @param {Array<number>} onsets - Full onset array
 * @param {number} startTime - Start time in seconds
 * @param {number} endTime - End time in seconds
 * @returns {Array<number>} Onsets within the range
 */
function queryOnsetsInRange(onsets, startTime, endTime) {
  return onsets.filter(t => t >= startTime && t <= endTime);
}

/**
 * Create the onset query tool definition for AI SDK
 * @param {string} onsetCachePath - Path to onset cache file
 * @returns {Object} Tool definition with execute function
 */
export function createOnsetQueryTool(onsetCachePath) {
  let cachedOnsets = null;

  return tool({
    description: 'Query beat onset timings within a specific time range. Use this to get precise timing data for synchronizing choreography actions with musical beats.',
    inputSchema: z.object({
      startTime: z.number().describe('Start time in seconds'),
      endTime: z.number().describe('End time in seconds'),
    }),
    execute: async ({ startTime, endTime }) => {
      // Load onsets once and cache
      if (!cachedOnsets) {
        cachedOnsets = await loadOnsetData(onsetCachePath);
      }

      const onsetsInRange = queryOnsetsInRange(cachedOnsets, startTime, endTime);

      return {
        startTime,
        endTime,
        onsetCount: onsetsInRange.length,
        onsets: onsetsInRange.map(t => parseFloat(t.toFixed(3))),
        density: onsetsInRange.length / (endTime - startTime),
        summary: `Found ${onsetsInRange.length} onsets between ${startTime}s and ${endTime}s (${(onsetsInRange.length / (endTime - startTime)).toFixed(2)} onsets/sec)`
      };
    }
  });
}

/**
 * Get onset statistics for prompt context
 * @param {string} onsetCachePath - Path to onset cache file
 * @returns {Promise<Object>} Onset statistics
 */
export async function getOnsetStatistics(onsetCachePath) {
  try {
    const content = await fs.readFile(onsetCachePath, 'utf8');
    const data = JSON.parse(content);
    const onsets = data.onsets || [];
    const duration = data.duration || 0;

    return {
      totalOnsets: onsets.length,
      duration,
      averageDensity: duration > 0 ? onsets.length / duration : 0,
      firstOnset: onsets[0],
      lastOnset: onsets[onsets.length - 1]
    };
  } catch (error) {
    return null;
  }
}
