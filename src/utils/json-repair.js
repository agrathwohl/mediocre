/**
 * JSON repair utilities for handling malformed LLM output
 */

/**
 * Repair common JSON escape sequence issues from LLM output
 * Fixes excessive backslashes and invalid escape sequences common in ASCII art
 * @param {string} jsonText - Raw JSON text to repair
 * @returns {string} Repaired JSON text
 */
export function repairJSONEscapes(jsonText) {
  // First pass: Remove double commas (invalid JSON syntax)
  jsonText = jsonText.replace(/,,+/g, ',');

  // Second pass: Fix sequences of 3+ bare quotes (like """"""" -> \")
  // Three or more consecutive quotes is always invalid JSON
  jsonText = jsonText.replace(/"""+/g, () => '\\"');

  // Third pass: Remove any completely invalid escape sequences
  // Replace \<char> with just <char> if it's not a valid JSON escape
  // Valid JSON escapes: \" \\ \/ \b \f \n \r \t \uXXXX
  jsonText = jsonText.replace(/\\(?!["\\/bfnrtu]|u[0-9a-fA-F]{4})/g, '');

  // Fourth pass: Fix remaining standalone backslash sequences
  // Only fix sequences of backslashes NOT followed by valid escape chars
  // Valid sequences like \" or \\ should be left alone
  jsonText = jsonText.replace(/\\+(?!["\\/bfnrtu]|u[0-9a-fA-F]{4})/g, (match) => {
    const count = match.length;
    // If odd number of backslashes, it's invalid - make it even
    const fixed = count % 2 === 1 ? count + 1 : count;
    return '\\'.repeat(fixed);
  });

  // Fifth pass: Fix invalid enum values
  // Transition type fixes - valid values: "cut" | "crossfade" | "dissolve"
  jsonText = jsonText.replace(/"transition"\s*:\s*"fade"/gi, '"transition": "crossfade"');
  jsonText = jsonText.replace(/"transitionType"\s*:\s*"fade"/gi, '"transitionType": "crossfade"');
  jsonText = jsonText.replace(/"type"\s*:\s*"fade"/gi, '"type": "crossfade"');
  jsonText = jsonText.replace(/"type"\s*:\s*"glitch"/gi, '"type": "cut"');
  jsonText = jsonText.replace(/"type"\s*:\s*"pixelate"/gi, '"type": "dissolve"');
  jsonText = jsonText.replace(/"type"\s*:\s*"warp"/gi, '"type": "dissolve"');
  jsonText = jsonText.replace(/"type"\s*:\s*"shatter"/gi, '"type": "cut"');
  jsonText = jsonText.replace(/"type"\s*:\s*"morph"/gi, '"type": "crossfade"');
  jsonText = jsonText.replace(/"type"\s*:\s*"vortex"/gi, '"type": "dissolve"');
  jsonText = jsonText.replace(/"type"\s*:\s*"liquify"/gi, '"type": "dissolve"');
  jsonText = jsonText.replace(/"type"\s*:\s*"explode"/gi, '"type": "cut"');

  // Collision behavior fixes - valid values: "default" | "scripted" | "disabled"
  jsonText = jsonText.replace(/"collisionBehavior"\s*:\s*"phase"/gi, '"collisionBehavior": "default"');
  jsonText = jsonText.replace(/"collisionBehavior"\s*:\s*"bounce"/gi, '"collisionBehavior": "default"');
  jsonText = jsonText.replace(/"collisionBehavior"\s*:\s*"merge"/gi, '"collisionBehavior": "scripted"');

  return jsonText;
}

/**
 * Parse templates field if it's a string containing JSON
 * @param {Object} choreography - Choreography object
 * @returns {Object} Choreography with parsed templates
 */
export function parseTemplatesField(choreography) {
  if (choreography.templates && typeof choreography.templates === 'string') {
    try {
      choreography.templates = JSON.parse(choreography.templates);
      return { success: true, choreography };
    } catch (error) {
      return { success: false, error: error.message, choreography };
    }
  }
  return { success: true, choreography };
}
