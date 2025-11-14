/**
 * Instrument Composer Agent
 * Composes ONE instrument at a time with strict bar count enforcement
 * Each instrument is composed completely before moving to the next
 */

import { BaseAgent } from './base-agent.js';
import { calculateNotesPerBar } from '../utils/abc-utils.js';

export class InstrumentComposerAgent extends BaseAgent {
  constructor(anthropic) {
    super('instrument-composer', anthropic);
  }

  async execute(userPrompt, previousOutputs = {}, instrumentContext = {}) {
    const {
      voiceNumber,
      instrument,
      totalBars,
      timeSignature,
      tempo,
      key,
      previousVoices = []
    } = instrumentContext;

    const genreContext = previousOutputs.creative_genre_name || {};
    const historyContext = previousOutputs.music_history || {};
    const formContext = previousOutputs.compositional_form || {};
    const melodicContext = previousOutputs.melodic || {};
    const dynamicsContext = previousOutputs.dynamics || {};

    const systemPrompt = `You are composing for ONE SPECIFIC INSTRUMENT in a multi-voice composition.

🎯 YOUR SINGLE INSTRUMENT FOCUS 🎯
You are ONLY composing for:
- Voice ${voiceNumber}: ${instrument.instrument_name}
- MIDI Program: ${instrument.midi_program}
- Clef: ${instrument.clef}
- Role: ${instrument.role}
- Range: ${instrument.range}
- Characteristics: ${instrument.characteristics}

⚠️ CRITICAL REQUIREMENTS ⚠️

1. **BAR COUNT IS NON-NEGOTIABLE**:
   - You MUST compose EXACTLY ${totalBars} bars
   - NOT ${totalBars - 1}, NOT ${totalBars + 1}, EXACTLY ${totalBars}
   - Count as you compose: Bar 1, Bar 2, ... Bar ${totalBars}
   - If you reach bar ${totalBars - 5}, you have 5 bars left. PERIOD.

2. **TIME SIGNATURE COMPLIANCE**:
   - Time signature: ${timeSignature}
   - With L:1/16, each bar needs EXACTLY ${calculateNotesPerBar(timeSignature)} sixteenth notes
   - EVERY SINGLE BAR must have the correct count
   - Complete bars musically: extend notes, add variations, or use rests as appropriate
   - CRITICAL: ${timeSignature} = ${calculateNotesPerBar(timeSignature)} sixteenth notes per bar!

3. **VOICE SYNCHRONIZATION**:
   ${previousVoices.length > 0 ? `
   The following voices have already been composed:
   ${previousVoices.map(v => `- Voice ${v.number}: ${v.bars} bars`).join('\n')}

   YOU MUST MATCH THEIR BAR COUNT EXACTLY!
   ` : 'You are composing the first voice. Set the standard with exactly ' + totalBars + ' bars.'}

4. **MUSICAL CONTEXT**:
   - Genre: ${genreContext.genre_name}
   - Form sections: ${JSON.stringify(formContext.sections, null, 2)}
   - Your instrument's role: ${instrument.role}
   ${melodicContext.melodic_ideas ? `- Melodic ideas to incorporate: ${JSON.stringify(melodicContext.melodic_ideas)}` : ''}

5. **ABC NOTATION RULES**:
   - Use lowercase for high octaves: c' d' e' (NOT C' D' E')
   - Voice header: V:${voiceNumber} (NO BRACKETS! Not [V:${voiceNumber}])
   - Include section markers as comments: % Section A
   - NO blank lines in the ABC notation
   - Bar lines: | for regular bars, || for section ends

6. **PROGRESSIVE COMPOSITION**:
   - Compose section by section
   - Keep track: "Completed 16 bars of Section A, need 16 more for Section B"
   - Build towards the EXACT total: ${totalBars} bars

7. **VERIFICATION CHECKLIST**:
   Before returning, verify:
   ☐ Counted ${totalBars} bars? (manually count |)
   ☐ Each bar has correct note count for ${timeSignature}?
   ☐ No uppercase letters with apostrophes?
   ☐ Voice header is V:${voiceNumber} (without brackets)?

Your output MUST be valid JSON with this structure:
{
  "voice_abc": "V:${voiceNumber} clef=${instrument.clef}\\n% Section A\\n|: DEFG ... complete ABC for this voice only ... :|",
  "bar_count": ${totalBars},
  "verification": {
    "bars_composed": ${totalBars},
    "bars_required": ${totalBars},
    "match": true,
    "section_breakdown": "Section A: 32 bars, Section B: 32 bars = 64 total"
  }
}

REMEMBER:
- You are composing ONLY Voice ${voiceNumber} (${instrument.instrument_name})
- You MUST compose EXACTLY ${totalBars} bars
- Every other voice depends on you hitting this EXACT bar count
- If you compose ${totalBars - 1} or ${totalBars + 1} bars, the entire composition FAILS

Output ONLY the JSON object.`;

    const prompt = `Compose Voice ${voiceNumber} (${instrument.instrument_name}) for the ${genreContext.genre_name} composition.

This instrument should fulfill its role: ${instrument.role}
Characteristics to embody: ${instrument.characteristics}

MANDATORY: Compose EXACTLY ${totalBars} bars. Count carefully as you compose.`;

    const MAX_RETRIES = 3;
    let attempt = 0;

    while (attempt <= MAX_RETRIES) {
      try {
        const response = await this.callLLM(systemPrompt, prompt, {
          temperature: 0.7 + (attempt * 0.05), // Slight temperature increase on retries
          maxTokens: 16000
        });

        const parsed = this.parseJSONResponse(response);

        // STRICT VALIDATION: Bar count MUST match
        if (parsed.bar_count !== totalBars) {
          if (attempt < MAX_RETRIES) {
            console.warn(`⚠️  Voice ${voiceNumber} attempt ${attempt + 1}: Bar count mismatch!`);
            console.warn(`   Expected: ${totalBars} bars, Got: ${parsed.bar_count} bars`);
            console.warn(`   Retrying with stricter enforcement...`);
            attempt++;
            continue;
          } else {
            // Final attempt failed
            console.error(`❌ CRITICAL ERROR: Voice ${voiceNumber} failed to produce ${totalBars} bars after ${MAX_RETRIES + 1} attempts`);
            return this.createResponse('error', {
              error: `Bar count mismatch: expected ${totalBars}, got ${parsed.bar_count}`,
              voice: voiceNumber,
              instrument: instrument.instrument_name
            }, 'Failed to match required bar count');
          }
        }

        // Verify the verification object confirms the match
        if (!parsed.verification.match) {
          console.warn(`⚠️  Voice ${voiceNumber}: Internal verification failed despite bar count match`);
        }

        // Success!
        console.log(`   ✅ Voice ${voiceNumber} (${instrument.instrument_name}): ${parsed.bar_count} bars composed successfully`);
        console.log(`      Verification: ${parsed.verification.section_breakdown}`);

        return this.createResponse('success', {
          voice_number: voiceNumber,
          instrument_name: instrument.instrument_name,
          voice_abc: parsed.voice_abc,
          bar_count: parsed.bar_count,
          verification: parsed.verification
        }, `Voice ${voiceNumber} composed: ${parsed.bar_count} bars`);

      } catch (error) {
        if (attempt < MAX_RETRIES) {
          console.warn(`⚠️  Voice ${voiceNumber} attempt ${attempt + 1} failed: ${error.message}. Retrying...`);
          attempt++;
          continue;
        } else {
          console.error(`Voice ${voiceNumber} composition failed after all retries:`, error);
          return this.createResponse('error', {
            error: error.message,
            voice: voiceNumber,
            instrument: instrument.instrument_name
          }, `Failed to compose voice ${voiceNumber}`);
        }
      }
    }
  }
}