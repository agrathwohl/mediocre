/**
 * Instrument validation utilities for ensuring required instruments are present
 */

/**
 * Extract excluded/banned instruments from a user prompt
 * @param {string} prompt - User prompt that may contain instrument exclusions
 * @returns {string[]} Array of excluded instrument names
 */
export function extractExcludedInstruments(prompt) {
  // Pattern 1: "--not-instruments X,Y,Z" flag format
  let match = prompt.match(/--not-instruments\s+["']?([^"'\n]+)["']?/i);

  // Pattern 2: "MUST NOT include: X, Y, Z"
  if (!match) {
    match = prompt.match(/MUST NOT include[:\s]+([^.!\n]+)/i);
  }

  // Pattern 3: "exclude instruments: X, Y, Z"
  if (!match) {
    match = prompt.match(/exclude instruments[:\s]+([^.!\n]+)/i);
  }

  // Pattern 4: "banned instruments: X, Y, Z"
  if (!match) {
    match = prompt.match(/banned instruments[:\s]+([^.!\n]+)/i);
  }

  if (match) {
    return match[1].split(',').map(i => i.trim()).filter(i => i.length > 0);
  }

  return [];
}

/**
 * Extract required instruments from a user prompt
 * @param {string} prompt - User prompt that may contain instrument requirements
 * @returns {string[]} Array of required instrument names
 */
export function extractRequiredInstruments(prompt) {
  // Pattern 1: "MUST include these instruments: X, Y, Z."
  let match = prompt.match(/MUST include these instruments:\s*([^.!\n]+)/i);

  // Pattern 2: "--instruments X,Y,Z" flag format
  if (!match) {
    match = prompt.match(/--instruments\s+["']?([^"'\n]+)["']?/i);
  }

  // Pattern 3: "Required instruments: X, Y, Z"
  if (!match) {
    match = prompt.match(/required instruments:\s*([^.!\n]+)/i);
  }

  // Pattern 4: "instruments must be: X, Y, Z"
  if (!match) {
    match = prompt.match(/instruments must be:\s*([^.!\n]+)/i);
  }

  if (match) {
    return match[1].split(',').map(i => i.trim()).filter(i => i.length > 0);
  }

  return [];
}

/**
 * Check if an instrument name matches the required instrument
 * Uses word-boundary matching to avoid false positives
 * @param {string} required - Required instrument name
 * @param {string} arranged - Arranged instrument name
 * @returns {boolean} True if instruments match
 */
export function instrumentMatches(required, arranged) {
  const reqLower = required.toLowerCase().trim();
  const arrLower = arranged.toLowerCase().trim();

  // Exact match
  if (reqLower === arrLower) return true;

  // Split into words for partial matching
  const reqWords = reqLower.split(/[\s,\-()]+/).filter(w => w.length > 2); // Ignore short words
  const arrWords = arrLower.split(/[\s,\-()]+/).filter(w => w.length > 2);

  // Check if all significant words from required are in arranged
  // e.g., "Electric Guitar" matches "Electric Guitar (clean)"
  const allRequiredWordsPresent = reqWords.every(reqWord =>
    arrWords.some(arrWord =>
      arrWord === reqWord || // Exact word match
      (arrWord.includes(reqWord) && arrWord.length < reqWord.length * 2) // Partial match but not too different
    )
  );

  if (allRequiredWordsPresent && reqWords.length > 0) return true;

  // Check for common instrument aliases
  const aliases = {
    'piano': ['acoustic grand piano', 'bright acoustic piano', 'electric piano', 'acoustic piano'],
    'guitar': ['acoustic guitar', 'electric guitar', 'classical guitar', 'distortion guitar'],
    'bass': ['acoustic bass', 'electric bass', 'fretless bass', 'slap bass'],
    'drums': ['percussion', 'drum kit', 'drum set'],
    'strings': ['violin', 'viola', 'cello', 'contrabass', 'string ensemble'],
    'synth': ['lead synth', 'pad synth', 'synthesizer', 'synth lead', 'synth pad'],
    'vocals': ['choir', 'voice', 'vocal'],
    'trumpet': ['trumpet', 'muted trumpet', 'brass'],
    'saxophone': ['saxophone', 'sax', 'alto sax', 'tenor sax', 'soprano sax'],
    'organ': ['organ', 'church organ', 'rock organ', 'hammond'],
    'flute': ['flute', 'piccolo', 'pan flute'],
    'violin': ['violin', 'fiddle'],
    'cello': ['cello', 'violoncello']
  };

  for (const [alias, expansions] of Object.entries(aliases)) {
    if (reqLower.includes(alias)) {
      if (expansions.some(exp => arrLower.includes(exp))) {
        return true;
      }
    }
  }

  // Avoid false positives with "bass" matching "bass drum" or similar
  if (reqLower === 'bass' && arrLower.includes('bass drum')) {
    return false;
  }

  return false;
}

/**
 * Validate that required instruments are present in arranged instruments
 * @param {string[]} requiredInstruments - Array of required instrument names
 * @param {string[]} arrangedInstruments - Array of arranged instrument names
 * @returns {{valid: boolean, missing: string[], mapping: Object}} Validation result
 */
export function validateInstruments(requiredInstruments, arrangedInstruments) {
  if (requiredInstruments.length === 0) {
    return { valid: true, missing: [], mapping: {} };
  }

  const missing = [];
  const mapping = {};

  for (const required of requiredInstruments) {
    const matchIndex = arrangedInstruments.findIndex(arranged =>
      instrumentMatches(required, arranged)
    );

    if (matchIndex >= 0) {
      mapping[required] = arrangedInstruments[matchIndex];
    } else {
      missing.push(required);
    }
  }

  return {
    valid: missing.length === 0,
    missing,
    mapping
  };
}

/**
 * Validate that excluded instruments are NOT present in arranged instruments
 * @param {string[]} excludedInstruments - Array of excluded instrument names
 * @param {string[]} arrangedInstruments - Array of arranged instrument names
 * @returns {{valid: boolean, violations: string[], violationMapping: Object}} Validation result
 */
export function validateExclusions(excludedInstruments, arrangedInstruments) {
  if (excludedInstruments.length === 0) {
    return { valid: true, violations: [], violationMapping: {} };
  }

  const violations = [];
  const violationMapping = {};

  for (const excluded of excludedInstruments) {
    for (const arranged of arrangedInstruments) {
      if (instrumentMatches(excluded, arranged)) {
        violations.push(arranged);
        violationMapping[excluded] = arranged;
      }
    }
  }

  return {
    valid: violations.length === 0,
    violations,
    violationMapping
  };
}

/**
 * Format instrument requirement for system prompts
 * @param {string[]} instruments - Required instruments
 * @returns {string} Formatted requirement section
 */
export function formatInstrumentRequirement(instruments) {
  if (instruments.length === 0) return '';

  return `🚨 MANDATORY INSTRUMENT REQUIREMENTS 🚨
The user has EXPLICITLY REQUIRED these instruments:
${instruments.map((inst, i) => `  ${i+1}. ${inst}`).join('\n')}

YOU MUST:
1. Include ALL of these instruments in your arrangement
2. Assign each to a specific voice number
3. Find the appropriate MIDI program number for each
4. If you cannot identify a suitable MIDI program, use your best approximation
5. DO NOT SKIP OR SUBSTITUTE ANY OF THESE INSTRUMENTS

THIS IS A HARD REQUIREMENT. IF YOU DO NOT INCLUDE ALL THESE INSTRUMENTS, YOUR OUTPUT WILL BE REJECTED AND YOU WILL BE ASKED TO TRY AGAIN.
`;
}

/**
 * Format instrument exclusion requirement for system prompts
 * @param {string[]} excludedInstruments - Excluded instruments
 * @returns {string} Formatted exclusion section
 */
export function formatInstrumentExclusion(excludedInstruments) {
  if (excludedInstruments.length === 0) return '';

  return `⛔ BANNED INSTRUMENTS - DO NOT USE ⛔
The user has EXPLICITLY BANNED these instruments:
${excludedInstruments.map((inst, i) => `  ❌ ${i+1}. ${inst}`).join('\n')}

YOU MUST NOT:
1. Include ANY of these instruments in your arrangement
2. Use any variant or similar instrument that matches these names
3. Use any MIDI program that corresponds to these instruments
4. Attempt to work around this restriction

If you include ANY of these banned instruments, your output will be REJECTED.
Choose different instruments for your arrangement.
`;
}