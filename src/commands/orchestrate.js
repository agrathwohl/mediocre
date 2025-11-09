/**
 * Orchestrate Command
 * Uses multi-agent system to compose music
 */

import { MusicOrchestrator } from '../agents/orchestrator.js';
import { config } from '../utils/config.js';
import { getAnthropic, cleanAbcNotation } from '../utils/claude.js';
import path from 'path';
import fs from 'fs/promises';

/**
 * Orchestrate music composition using specialist agents
 */
export async function orchestrate(options) {

  // Validate AI provider
  if (config.get('aiProvider') !== 'anthropic') {
    throw new Error('Orchestrate command currently only supports Anthropic AI provider');
  }

  // Initialize Anthropic using Vercel AI SDK
  const anthropic = getAnthropic();

  // Parse genre
  const genre = options.genre || 'chorale_x_metalheadz';
  const [classicalGenre, modernGenre] = genre.split('_x_');

  if (!classicalGenre || !modernGenre) {
    throw new Error('Genre must be in format: classical_x_modern (e.g., chorale_x_metalheadz)');
  }

  // Build user prompt
  const userPrompt = buildUserPrompt({
    classicalGenre,
    modernGenre,
    recordLabel: options.recordLabel,
    producer: options.producer,
    instruments: options.instruments,
    solo: options.solo
  });

  console.log('═══════════════════════════════════════════════════════');
  console.log('  MEDIOCRE MUSIC COMPOSITION ORCHESTRATOR');
  console.log('═══════════════════════════════════════════════════════');
  console.log(`Classical: ${classicalGenre}`);
  console.log(`Modern: ${modernGenre}`);
  if (options.recordLabel) console.log(`Record Label: ${options.recordLabel}`);
  if (options.producer) console.log(`Producer: ${options.producer}`);
  if (options.instruments) console.log(`Instruments: ${options.instruments}`);
  if (options.resume) console.log(`Resume Session: ${options.resume}`);
  console.log('═══════════════════════════════════════════════════════\n');

  // Create orchestrator
  const orchestratorOptions = {
    saveIntermediateOutputs: true,
    sessionId: options.resume || Date.now()
  };
  const orchestrator = new MusicOrchestrator(anthropic, orchestratorOptions);

  try {
    // Run orchestration
    const result = await orchestrator.orchestrate(userPrompt, options);

    // Clean ABC notation
    let cleanedAbc = cleanAbcNotation(result.abc_notation);

    // ADDITIONAL VALIDATION: Strip orphaned MIDI declarations
    cleanedAbc = stripOrphanedMIDIDeclarations(cleanedAbc);

    // Validate final ABC
    const validationWarnings = validateFinalABC(cleanedAbc);
    if (validationWarnings.length > 0) {
      console.log('\n⚠️  ABC Validation Warnings:');
      validationWarnings.forEach(warning => console.log(`   - ${warning}`));
    }

    // Generate output filename
    const outputDir = options.output || './output';
    await fs.mkdir(outputDir, { recursive: true });

    const timestamp = Date.now();
    const genreName = result.genre_name.toLowerCase().replace(/[^a-z0-9]+/g, '_');

    // Add quality warning suffix if needed
    const qualitySuffix = result.has_critical_issues ? '_CRITICAL_ISSUES' :
                         result.has_major_issues ? '_QUALITY_WARNINGS' : '';

    const baseFilename = `${genreName}-${timestamp}${qualitySuffix}`;

    const abcPath = path.join(outputDir, `${baseFilename}.abc`);
    const jsonPath = path.join(outputDir, `${baseFilename}.json`);
    const mdPath = path.join(outputDir, `${baseFilename}.md`);

    // Save ABC file
    await fs.writeFile(abcPath, cleanedAbc);
    console.log(`\n📄 ABC notation saved: ${abcPath}`);

    // Save full context as JSON
    await fs.writeFile(jsonPath, JSON.stringify(result.full_context, null, 2));
    console.log(`📄 Full context saved: ${jsonPath}`);

    // Create markdown summary
    const markdown = createMarkdownSummary(result, cleanedAbc);
    await fs.writeFile(mdPath, markdown);
    console.log(`📄 Summary saved: ${mdPath}`);

    // Print validation results
    if (result.validation) {
      console.log('\n🔍 Validation Results:');
      console.log(`   Status: ${result.validation.validation_status}`);
      console.log(`   Recommendation: ${result.validation.recommendation}`);
      if (result.validation.issues.length > 0) {
        console.log(`   Issues found: ${result.validation.issues.length}`);
        result.validation.issues.forEach((issue, i) => {
          console.log(`   ${i + 1}. [${issue.severity}] ${issue.description}`);
        });
      }
    }

    console.log('\n✅ Orchestration complete!');

    return {
      abcPath,
      jsonPath,
      mdPath,
      genreName: result.genre_name,
      metadata: result.metadata
    };

  } catch (error) {
    console.error('\n❌ Orchestration failed:', error.message);
    throw error;
  }
}

/**
 * Build user prompt from options
 */
function buildUserPrompt(options) {
  let prompt = `Create a musical composition that fuses ${options.classicalGenre} and ${options.modernGenre}.`;

  if (options.solo) {
    prompt += ' Include a dedicated solo section for the lead instrument.';
  }

  if (options.recordLabel) {
    prompt += ` Style the composition to sound like it was released on the record label "${options.recordLabel}".`;
  }

  if (options.producer) {
    prompt += ` Style the composition to sound as if it was produced by ${options.producer}.`;
  }

  if (options.instruments) {
    prompt += ` The composition MUST include these instruments: ${options.instruments}.`;
  }

  return prompt;
}

/**
 * Strip orphaned MIDI declarations (safety check)
 * Removes MIDI program/channel declarations for voices that don't exist
 */
function stripOrphanedMIDIDeclarations(abc) {
  // Extract all voice declarations (V:1, V:2, etc.)
  const voiceMatches = abc.match(/\[V:(\d+)\]/g) || [];
  const voiceNumbers = new Set(voiceMatches.map(v => parseInt(v.match(/\d+/)[0])));

  if (voiceNumbers.size === 0) {
    return abc; // No voices found, return as-is
  }

  // Remove MIDI declarations for voices that don't exist
  const lines = abc.split('\n');
  const filteredLines = lines.filter(line => {
    const midiMatch = line.match(/%%MIDI\s+(program|channel)\s+(\d+)/);
    if (midiMatch) {
      const voiceNum = parseInt(midiMatch[2]);
      // Keep line only if this voice number exists
      return voiceNumbers.has(voiceNum);
    }
    return true; // Keep all non-MIDI lines
  });

  return filteredLines.join('\n');
}

/**
 * Validate final ABC notation (returns warnings, doesn't modify)
 */
function validateFinalABC(abc) {
  const warnings = [];

  // Check for uppercase letters with apostrophes (should be caught by cleanAbcNotation)
  const uppercaseApostrophes = abc.match(/[A-G][']/g);
  if (uppercaseApostrophes) {
    warnings.push(`Found uppercase letters with apostrophes: ${uppercaseApostrophes.join(', ')} (should use lowercase)`);
  }

  // Check for invalid dynamics
  const invalidDynamics = abc.match(/!(f{4,}|p{4,})!/g);
  if (invalidDynamics) {
    warnings.push(`Found invalid dynamics: ${invalidDynamics.join(', ')} (max is !fff! or !ppp!)`);
  }

  // Count voices and MIDI declarations
  const voiceDeclarations = (abc.match(/\[V:\d+\]/g) || []).length;
  const midiProgramDeclarations = (abc.match(/%%MIDI program \d+/g) || []).length;

  if (voiceDeclarations !== midiProgramDeclarations) {
    warnings.push(`Voice/MIDI mismatch: ${voiceDeclarations} voices but ${midiProgramDeclarations} MIDI program declarations`);
  }

  return warnings;
}

/**
 * Create markdown summary of the composition
 */
function createMarkdownSummary(result, abc) {
  const genreData = result.full_context.creative_genre_name.data;
  const historyData = result.full_context.music_history.data;
  const arrangementData = result.full_context.arrangement.data;
  const formData = result.full_context.compositional_form.data;

  return `# ${result.metadata.title}

**Genre:** ${result.genre_name}

## Creative Vision

${genreData.portmanteau_explanation}

**Classical Influence:** ${genreData.classical_influence}
**Modern Influence:** ${genreData.modern_influence}

## Musical Characteristics

### Classical Elements
- **Harmonic Language:** ${historyData.classical_characteristics.harmonic_language}
- **Formal Structures:** ${historyData.classical_characteristics.formal_structures}
- **Melodic Style:** ${historyData.classical_characteristics.melodic_style}

### Modern Elements
- **Rhythmic Approach:** ${historyData.modern_characteristics.rhythmic_approach}
- **Production Techniques:** ${historyData.modern_characteristics.production_techniques}
- **Textural Approach:** ${historyData.modern_characteristics.textural_approach}

## Arrangement

**Total Voices:** ${arrangementData.total_voices}

${arrangementData.voices.map(v => `- Voice ${v.voice_number}: ${v.instrument_name} (MIDI ${v.midi_program}) - ${v.role}`).join('\n')}

${arrangementData.drums.enabled ? `**Drums:** ${arrangementData.drums.style} (${arrangementData.drums.complexity} complexity)` : ''}

## Structure

**Key:** ${formData.key}
**Time Signature:** ${formData.time_signature}
**Tempo:** ${formData.tempo} BPM
**Total Measures:** ${formData.total_measures}
**Form:** ${formData.form_type}

### Sections

${formData.sections.map(s => `- **${s.name}** (${s.measures} bars): ${s.harmonic_approach}, ${s.texture}`).join('\n')}

## ABC Notation

\`\`\`abc
${abc}
\`\`\`

---

*Generated by Mediocre Music Composition Orchestrator*
`;
}
