/**
 * Composition Agent
 * Step 7: Assembles all previous outputs into complete ABC notation
 */

import { BaseAgent } from './base-agent.js';

export class CompositionAgent extends BaseAgent {
  constructor(anthropic) {
    super('composition', anthropic);
  }

  async execute(userPrompt, previousOutputs = {}) {
    const genreContext = previousOutputs.creative_genre_name || {};
    const historyContext = previousOutputs.music_history || {};
    const arrangementContext = previousOutputs.arrangement || {};
    const formContext = previousOutputs.compositional_form || {};
    const melodicContext = previousOutputs.melodic || {};
    const timbrelContext = previousOutputs.timbrel || {};
    const dynamicsContext = previousOutputs.dynamics || {};

    const systemPrompt = `You are an expert ABC notation composer. Your task is to take all the musical decisions from previous agents and create complete, valid, playable ABC notation.

YOU HAVE BEEN GIVEN COMPLETE SPECIFICATIONS:
${JSON.stringify({
  genre: genreContext,
  history: historyContext,
  arrangement: arrangementContext,
  form: formContext,
  melodic: melodicContext,
  timbrel: timbrelContext,
  dynamics: dynamicsContext
}, null, 2)}

╔═══════════════════════════════════════════════════════════════╗
║           ABC NOTATION TEMPLATE - FOLLOW EXACTLY              ║
╚═══════════════════════════════════════════════════════════════╝

HEADER STRUCTURE (Lines 1-N):
X:1
T:Your Title Here
M:${formContext.time_signature || '4/4'}
L:1/16
Q:1/4=${formContext.tempo || 174}
K:${formContext.key || 'Dm'}
%%MIDI program 1 <instrument_number>
%%MIDI program 2 <instrument_number>
%%MIDI program 3 <instrument_number>
[... one %%MIDI program line for EACH voice, numbered 1 to ${arrangementContext.total_voices || 'N'}]

BODY STRUCTURE (After header, continuous notation):
[V:1]
<continuous notes and bars for entire piece>|
<more bars>|
<more bars>|
[V:2]
<continuous notes and bars for entire piece>|
<more bars>|
<more bars>|
[V:3]
<continuous notes and bars for entire piece>|

CRITICAL RULES:

1. %%MIDI DECLARATIONS - ONLY IN HEADER, ONLY THESE COMMANDS:

   ✓ VALID COMMANDS (abc2midi will accept these):
   %%MIDI program <channel> <instrument_0-127>
   %%MIDI channel <channel>
   %%MIDI beat <n1> <n2> <n3> <n4>
   %%MIDI beatmod <n>
   %%MIDI deltaloudness <n>
   %%MIDI drum <pattern> <n1> <n2> <n3>...
   %%MIDI chordprog <instrument>
   %%MIDI bassprog <instrument>

   ✗ INVALID - DO NOT USE:
   %%MIDI c
   %%MIDI p
   %%MIDI v
   %%MIDI vol
   %%MIDI voice
   <any other %%MIDI command not in the valid list above>

2. MIDI PROGRAM DECLARATIONS:
   - ONLY in header section (before first [V:1])
   - NEVER mid-score (no %%MIDI program after any [V:N] declaration)
   - MUST have exactly ${arrangementContext.total_voices || 'N'} declarations
   - Sequential channels: %%MIDI program 1 X, %%MIDI program 2 Y, %%MIDI program 3 Z
   - Valid instrument numbers: 0-127 ONLY

3. DRUM PATTERN SYNTAX:
   %%MIDI drum <pattern> <program1> <program2>... <velocity1> <velocity2>...

   CRITICAL: If pattern has N 'd' characters, you need EXACTLY N programs and EXACTLY N velocities

   ✓ CORRECT:
   %%MIDI drum ddzd 36 38 36 36 76 76 76 76
   (4 'd' chars → 4 programs: 36,38,36,36 → 4 velocities: 76,76,76,76)

   ✗ WRONG:
   %%MIDI drum ddzd 36 38 36 36 42 44 76 76 76 76 80 80
   (4 'd' chars but 6 programs and 6 velocities - MISMATCHED!)

   COUNT 'd' characters in your pattern, then provide EXACTLY that many numbers!

4. VOICE DECLARATIONS:
   - Write [V:1] ONCE at the start of voice 1's section
   - Then write ALL of voice 1's bars continuously (no more [V:1] declarations)
   - Then write [V:2] ONCE for voice 2
   - Then write ALL of voice 2's bars continuously
   - Pattern: [V:N] appears EXACTLY ONCE per voice, at the START of that voice's section

   ✓ CORRECT:
   [V:1]
   cdef|gfed|cdef|gfed|
   cdef|gfed|cdef|gfed|
   [V:2]
   CDEF|GFED|CDEF|GFED|

   ✗ WRONG (DO NOT DO THIS):
   [V:1]
   cdef|gfed|
   [V:1]
   cdef|gfed|
   [V:1]
   cdef|gfed|
   (DO NOT repeat [V:1] - write it ONCE!)

5. OCTAVE NOTATION:
   ✓ CORRECT: c' d' e' f' g' a' b' c'' (lowercase + apostrophe)
   ✗ WRONG: C' D' E' F' G' A' B' (uppercase + apostrophe is INVALID)

   - Apostrophes (') ONLY with lowercase
   - For low notes: C, D, E, (uppercase + comma)

6. BAR COUNTS:
   Time signature: ${formContext.time_signature || '4/4'}
   Unit note length: L:1/16

   Each bar needs EXACTLY 16 sixteenth notes worth of duration:
   - c2 = 2 sixteenths
   - c4 = 4 sixteenths
   - c8 = 8 sixteenths
   - z2 = 2 sixteenth rest

   COUNT every note/rest in each bar. If sum ≠ 16, add rests with z

7. VOICE COUNT:
   - Arrangement specified ${arrangementContext.total_voices || 'N'} voices
   - You MUST create EXACTLY ${arrangementContext.total_voices || 'N'} voices
   - Voice numbers: 1, 2, 3, ..., ${arrangementContext.total_voices || 'N'} (sequential, no gaps)

8. VOICE SYNCHRONIZATION:
   - ALL voices must have SAME number of bars
   - If [V:1] has 64 bars, then [V:2], [V:3], etc. MUST have 64 bars

GENERATION CHECKLIST (verify before returning):
□ Header has EXACTLY ${arrangementContext.total_voices || 'N'} %%MIDI program declarations
□ All %%MIDI commands are from the VALID list (no made-up commands)
□ NO %%MIDI program declarations after any [V:N] (all in header only)
□ Each voice section starts with [V:N] ONCE and ONLY ONCE
□ Drum pattern has matching counts (N 'd' chars = N programs = N velocities)
□ No uppercase letters with apostrophes (C' D' E' etc.)
□ All voices have same bar count
□ metadata.voices_used equals ${arrangementContext.total_voices || 'N'}

Your output MUST be valid JSON with this structure:
{
  "abc_notation": "Complete ABC notation as a single string with \\n for line breaks",
  "metadata": {
    "title": "Composition title",
    "total_bars": 64,
    "voices_used": ${arrangementContext.total_voices || 3},
    "key": "${formContext.key || 'Dm'}",
    "tempo": ${formContext.tempo || 174}
  },
  "overflow_data": {
    "_bar_count_verification": "All voices have 64 bars",
    "_octave_notation_check": "Only lowercase letters used with apostrophes"
  }
}

MANDATORY CHECKS BEFORE RETURNING:
1. Search output for pattern [A-G]' and ELIMINATE IT (uppercase + apostrophe)
2. Count voices used === ${arrangementContext.total_voices}
3. Count bars for each voice, verify all equal
4. Verify metadata.voices_used === ${arrangementContext.total_voices}

Output ONLY the JSON object, no other text.`;

    const prompt = `Using ALL the specifications provided in the system prompt, compose complete ABC notation.

Title should reference: ${genreContext.genre_name || 'the genre fusion'}

Be creative within the specifications, but follow them precisely.`;

    try {
      const response = await this.callLLM(systemPrompt, prompt, {
        temperature: 0.7,
        maxTokens: 32000 // Need lots of tokens for full ABC notation
      });

      const parsed = this.parseJSONResponse(response);

      return this.createResponse('success', {
        abc_notation: parsed.abc_notation,
        metadata: parsed.metadata
      }, `ABC notation generated: ${parsed.metadata.total_bars} bars, ${parsed.metadata.voices_used} voices`);
    } catch (error) {
      console.error('Composition Agent failed:', error);
      return this.createResponse('error', {
        error: error.message
      }, 'Failed to generate ABC notation');
    }
  }
}
