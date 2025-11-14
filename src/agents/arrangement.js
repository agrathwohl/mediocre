/**
 * Arrangement Agent
 * Step 4a: Determines instrumentation and voice assignments
 * Works IN TANDEM with Compositional Form Agent
 */

import { BaseAgent } from './base-agent.js';
import {
  extractRequiredInstruments,
  extractExcludedInstruments,
  validateInstruments,
  validateExclusions,
  formatInstrumentRequirement,
  formatInstrumentExclusion
} from '../utils/instrument-validation.js';

export class ArrangementAgent extends BaseAgent {
  constructor(anthropic) {
    super('arrangement', anthropic);
  }

  async execute(userPrompt, previousOutputs = {}, collaborationContext = null) {
    const genreContext = previousOutputs.creative_genre_name || {};
    const historyContext = previousOutputs.music_history || {};
    const formContext = collaborationContext; // Data from Compositional Form agent

    // Extract required and excluded instruments from the user prompt
    const requiredInstruments = extractRequiredInstruments(userPrompt);
    const excludedInstruments = extractExcludedInstruments(userPrompt);

    const systemPrompt = `You are a musical arrangement expert. Your task is to determine the optimal instrumentation and voice assignments for a composition.

${formContext ? `COLLABORATION CONTEXT from Compositional Form Agent:
${JSON.stringify(formContext, null, 2)}

Consider this structural information when making arrangement decisions.
` : ''}

${formatInstrumentRequirement(requiredInstruments)}
${formatInstrumentExclusion(excludedInstruments)}

🎯 YOUR ABC NOTATION RESPONSIBILITY 🎯
YOU OWN THE VOICE COUNT. This is YOUR decision and YOUR responsibility.

CRITICAL ABC RULES YOU MUST FOLLOW:
1. Whatever "total_voices" you specify will be EXACTLY what gets used in the ABC notation
2. If you say total_voices: 3, the composition will use V:1, V:2, V:3 ONLY
3. The Timbrel agent will declare %%MIDI program 1, 2, 3 ONLY
4. DO NOT declare more voices than you actually plan to use
5. Count carefully: If you list 3 voices in the array, total_voices MUST be 3

HYPER-FOCUS ON THIS:
- Your voice count is BINDING and FINAL
- Downstream agents TRUST your count completely
- If you fuck this up, orphaned MIDI declarations will cause segfaults
- Double-check: voices array length === total_voices${requiredInstruments.length > 0 ? `
- MANDATORY: All ${requiredInstruments.length} required instruments MUST be included` : ''}

Your output MUST be valid JSON with this exact structure (example shows 3 voices, but use as many as needed):
{
  "total_voices": 3,
  "voices": [
    {
      "voice_number": 1,
      "instrument_name": "Lead Synth",
      "midi_program": 81,
      "clef": "treble",
      "role": "Primary melody",
      "range": "d-d'''",
      "characteristics": "Bright, cutting lead"
    },
    {
      "voice_number": 2,
      "instrument_name": "Bass",
      "midi_program": 38,
      "clef": "bass",
      "role": "Foundational bass",
      "range": "E,-E",
      "characteristics": "Deep, solid"
    },
    {
      "voice_number": 3,
      "instrument_name": "Pad",
      "midi_program": 89,
      "clef": "treble",
      "role": "Harmonic support",
      "range": "c-c''",
      "characteristics": "Atmospheric"
    }
  ],
  "drums": {
    "enabled": true,
    "style": "Breakbeat",
    "complexity": "high"
  },
  "interplay_notes": "How voices interact with each other",
  "arrangement_strategy": "Overall arrangement approach",
  "overflow_data": {}
}

Guidelines:
- Use as many voices as musically appropriate (no arbitrary limits)
- Voice numbers MUST be sequential: 1, 2, 3, 4, 5, 6, 7... (never skip numbers)
- Choose instruments that make sense for BOTH classical and modern influences
- Assign appropriate MIDI program numbers (0-127, avoid channel 10)
- VERIFY: voices array length === total_voices before returning

IMPORTANT: You MUST output ONLY valid JSON. Do not include markdown, explanations, or any text outside the JSON object.
Do not wrap the JSON in markdown code fences.
Start your response with { and end with }`;

    const prompt = `${userPrompt}

${genreContext.genre_name ? `Genre: "${genreContext.genre_name}"
` : ''}${historyContext.classical_characteristics ? `Classical Characteristics: ${JSON.stringify(historyContext.classical_characteristics, null, 2)}
Modern Characteristics: ${JSON.stringify(historyContext.modern_characteristics, null, 2)}
` : ''}
Determine the optimal instrumentation and arrangement for this composition. Return ONLY the JSON object.`;

    const MAX_RETRIES = 2;
    let attempt = 0;

    while (attempt <= MAX_RETRIES) {
      try {
        const response = await this.callLLM(systemPrompt, prompt, {
          temperature: 0.7 + (attempt * 0.1),  // Increase temperature on retries
          maxTokens: 16000  // Increased to handle detailed arrangements
        });

        const parsed = this.parseJSONResponse(response);

        // Validate that all required instruments are included
        const validation = validateInstruments(
          requiredInstruments,
          parsed.voices.map(v => v.instrument_name)
        );

        if (!validation.valid && requiredInstruments.length > 0) {
          if (attempt < MAX_RETRIES) {
            console.warn(`⚠️  Attempt ${attempt + 1}: Missing instruments: ${validation.missing.join(', ')}`);
            console.warn(`   Arranged: ${parsed.voices.map(v => v.instrument_name).join(', ')}`);
            console.warn(`   Retrying with adjusted parameters...`);
            attempt++;
            continue; // Retry
          } else {
            // Final attempt failed - return error
            console.error(`❌ ERROR: After ${MAX_RETRIES + 1} attempts, required instruments still missing: ${validation.missing.join(', ')}`);
            console.error(`   Arranged: ${parsed.voices.map(v => v.instrument_name).join(', ')}`);
            return this.createResponse('error', {
              error: `Failed to include required instruments: ${validation.missing.join(', ')}`,
              arranged_instruments: parsed.voices.map(v => v.instrument_name),
              missing_instruments: validation.missing
            }, 'Required instruments validation failed');
          }
        }

        // Validate that no excluded instruments are present
        const exclusionValidation = validateExclusions(
          excludedInstruments,
          parsed.voices.map(v => v.instrument_name)
        );

        if (!exclusionValidation.valid && excludedInstruments.length > 0) {
          if (attempt < MAX_RETRIES) {
            console.warn(`⚠️  Attempt ${attempt + 1}: Banned instruments found: ${exclusionValidation.violations.join(', ')}`);
            console.warn(`   Arranged: ${parsed.voices.map(v => v.instrument_name).join(', ')}`);
            console.warn(`   Retrying with adjusted parameters...`);
            attempt++;
            continue; // Retry
          } else {
            // Final attempt failed - return error
            console.error(`❌ ERROR: After ${MAX_RETRIES + 1} attempts, banned instruments still present: ${exclusionValidation.violations.join(', ')}`);
            console.error(`   Arranged: ${parsed.voices.map(v => v.instrument_name).join(', ')}`);
            return this.createResponse('error', {
              error: `Included banned instruments: ${exclusionValidation.violations.join(', ')}`,
              arranged_instruments: parsed.voices.map(v => v.instrument_name),
              banned_violations: exclusionValidation.violations
            }, 'Excluded instruments validation failed');
          }
        }

        // Success - all validations passed
        if (validation.valid && requiredInstruments.length > 0) {
          console.log(`   ✅ All required instruments included:`);
          for (const [required, arranged] of Object.entries(validation.mapping)) {
            const voice = parsed.voices.find(v => v.instrument_name === arranged);
            console.log(`      ${required} → ${arranged} (MIDI program ${voice?.midi_program || '?'})`);
          }
        }

        if (exclusionValidation.valid && excludedInstruments.length > 0) {
          console.log(`   ✅ No banned instruments included (avoided: ${excludedInstruments.join(', ')})`);
        }

        return this.createResponse('success', {
          total_voices: parsed.total_voices,
          voices: parsed.voices,
          drums: parsed.drums,
          interplay_notes: parsed.interplay_notes,
          arrangement_strategy: parsed.arrangement_strategy
        }, `Arrangement for ${parsed.total_voices} voices`);

      } catch (error) {
        if (attempt < MAX_RETRIES) {
          console.warn(`⚠️  Attempt ${attempt + 1} failed: ${error.message}. Retrying...`);
          attempt++;
          continue;
        } else {
          console.error('Arrangement Agent failed after all retries:', error);
          return this.createResponse('error', {
            error: error.message
          }, 'Failed to create arrangement');
        }
      }
    }
  }
}
