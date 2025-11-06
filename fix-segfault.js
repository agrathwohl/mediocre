import fs from 'fs';

/**
 * Remove MIDI directives that commonly cause abc2midi segfaults
 * @param {string} abcContent - ABC notation content
 * @returns {string} Safer ABC notation
 */
function removeCrashTriggers(abcContent) {
  let fixed = abcContent;

  console.log('Removing abc2midi crash triggers...\n');

  // 1. Remove mid-score %%MIDI program changes (keep only header ones)
  const lines = fixed.split('\n');
  const headerEnd = lines.findIndex(line => line.match(/^\[V:/));

  let inHeader = true;
  const safeLine = lines.map((line, idx) => {
    // After we see first voice declaration, we're out of header
    if (line.match(/^\[V:/)) {
      inHeader = false;
    }

    // Remove MIDI program changes that appear after header
    if (!inHeader && line.match(/^%%MIDI\s+program\s+/)) {
      console.log(`⚠️ Removing mid-score program change: ${line}`);
      return ''; // Remove it
    }

    return line;
  }).filter(line => line !== '');

  fixed = safeLine.join('\n');

  // 2. Remove %%MIDI transpose directives (common segfault trigger)
  const transposeCount = (fixed.match(/%%MIDI\s+transpose/g) || []).length;
  if (transposeCount > 0) {
    console.log(`⚠️ Removing ${transposeCount} %%MIDI transpose directive(s)`);
    fixed = fixed.replace(/^%%MIDI\s+transpose\s+-?\d+\s*$/gm, '');
  }

  // 3. Remove %%MIDI nobeataccents/beataccents toggling (can cause crashes)
  const beatAccentCount = (fixed.match(/%%MIDI\s+(no)?beataccents/g) || []).length;
  if (beatAccentCount > 0) {
    console.log(`⚠️ Removing ${beatAccentCount} %%MIDI (no)beataccents directive(s)`);
    fixed = fixed.replace(/^%%MIDI\s+(no)?beataccents\s*$/gm, '');
  }

  // 4. Simplify complex drum patterns that might overflow buffers
  fixed = fixed.replace(/%%MIDI\s+drum\s+([a-z0-9]+)\s+([\d\s]+)/gi, (match, pattern, numbers) => {
    const nums = numbers.trim().split(/\s+/);

    // If pattern is extremely long (>16 drums), it might cause issues
    const dCount = (pattern.match(/d/g) || []).length;
    if (dCount > 16) {
      console.log(`⚠️ Simplifying overly complex drum pattern with ${dCount} drums`);
      // Truncate to first 8 drums
      const simplePattern = 'dddddddd';
      const simpleNums = [36, 38, 42, 46, 36, 38, 42, 46, 110, 105, 100, 95, 90, 85, 80, 75, nums[nums.length-1]];
      return `%%MIDI drum ${simplePattern} ${simpleNums.join(' ')}`;
    }

    return match;
  });

  // 5. Remove excessive blank lines that might have been created
  fixed = fixed.replace(/\n\n+/g, '\n');

  console.log('\n✅ Created safer version\n');

  return fixed;
}

// Main execution
const inputFile = process.argv[2];

if (!inputFile) {
  console.error('Usage: node fix-segfault.js <input.abc>');
  console.error('This will create <input>-safe.abc with crash triggers removed');
  process.exit(1);
}

if (!fs.existsSync(inputFile)) {
  console.error(`Error: File not found: ${inputFile}`);
  process.exit(1);
}

const content = fs.readFileSync(inputFile, 'utf-8');
const fixed = removeCrashTriggers(content);

const outputFile = inputFile.replace(/\.abc$/, '-safe.abc');
fs.writeFileSync(outputFile, fixed);

console.log(`Saved safer version to: ${outputFile}`);
console.log('Try running abc2midi on this file');
