/**
 * ABC Notation Utilities
 * Shared utilities for working with ABC notation
 */

/**
 * Calculate the number of sixteenth notes per bar for a given time signature
 * @param {string} timeSignature - Time signature like "4/4", "3/4", "7/8"
 * @returns {number} Number of sixteenth notes that make up one bar
 */
export function calculateNotesPerBar(timeSignature) {
  // With L:1/16 (sixteenth notes as unit)
  // Time signature numerator = number of beats
  // Time signature denominator = what note gets the beat
  const [numerator, denominator] = timeSignature.split('/').map(Number);

  // Each beat type equals this many sixteenth notes:
  // 1 = 16 sixteenth notes (whole note)
  // 2 = 8 sixteenth notes (half note)
  // 4 = 4 sixteenth notes (quarter note)
  // 8 = 2 sixteenth notes (eighth note)
  // 16 = 1 sixteenth note
  const sixteenthsPerBeat = 16 / denominator;

  return numerator * sixteenthsPerBeat;
}

