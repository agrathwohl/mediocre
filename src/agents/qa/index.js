import { ToolLoopAgent, Output, stepCountIs } from 'ai';
import { z } from 'zod';
import { validateAbcTool, readAbcFileTool } from '../shared/tools.js';
import { createStepLogger } from '../shared/utils.js';
import { getAnthropic, getModel, supportsContextManagement, getAbc2midiBinary } from '../../utils/llm-client.js';
import { FORK_DIRECTIVES_REFERENCE } from '../shared/fork-directives-reference.js';

let _qaAgent = null;
let _qaAgentForkAware = false;

function getQaAgent() {
  const usingFork = getAbc2midiBinary() !== 'abc2midi';

  // Recreate if fork status changed since last creation
  if (_qaAgent && _qaAgentForkAware !== usingFork) _qaAgent = null;

  if (!_qaAgent) {
    const anthropic = getAnthropic();
    _qaAgentForkAware = usingFork;

    const forkBlock = usingFork ? `

FORK DIRECTIVE AWARENESS (CRITICAL):
This composition was generated using the abc2midi-llm fork which supports EXTENDED directives beyond standard abc2midi.
The following directives are VALID and RECOGNIZED by the fork binary — do NOT flag them as non-standard, unknown, or no-ops:
- %%PNEUMA (humanize, heartbeat, drift, free, rubato) — temporal liberation / organic timing
- %%ENSEMBLE (offset, jitter, voice) — inter-voice timing offset
- %%BREATH (auto, bars, after, off) — automatic rest insertion
- %%GRAVITY (phrase, weight, agogic, off) — phrase-level dynamics/timing weight
- %%ARTICULATE (auto, repeated, leap, phraseend, staccato, off) — context-aware note length
- %%DYNAMICS (curve, transition, attack, off) — smooth velocity interpolation between dynamic marks
- %%SPECTRAL (tilt, cc, off) — velocity-dependent timbral shift via CC messages
- %%SPATIAL (group, delay) — inter-group timing offset for spatial simulation
- %%TRANSFORM (source, retrograde, invert, invertaxis, fragment, pitchshift, timescale, delay, off) — cross-voice algorithmic transformation. Target voices need NO placeholder notes — content is generated from source at render time.
- %%SHADOW (source, mode, probability, transpose, delay, invertmotion, intervallock, off) — reactive voice following. Target voices need NO placeholder notes — content is generated from source at render time.

IMPORTANT: %%TRANSFORM and %%SHADOW target voices are SUPPOSED to have no note content (or only rests). The fork binary generates their content algorithmically from the source voice at render time. A voice with %%TRANSFORM source N or %%SHADOW source N and empty/rest content is CORRECT behavior, NOT a bug. Do NOT flag these as "empty voices" or "voices with no content."
` : '';

    _qaAgent = new ToolLoopAgent({
      model: anthropic(getModel('claude-sonnet-4-6'), {
        cacheControl: { type: 'ephemeral', ttl: '1h' },
      }),

  instructions: `You are a music composition quality assurance expert.
Your task is to review ABC notation compositions for quality, completeness, and authenticity.
${forkBlock}
DRUM KIT COMPLIANCE:
If a drum prescription is provided in the review prompt, you MUST validate that EVERY GM percussion number
used in %%MIDI drum directives appears in the prescribed drum kit. Any unauthorized drum sound is a CRITICAL
technical issue that warrants a 'fail' verdict. Extract all GM numbers from %%MIDI drum lines and cross-check
against the allowed set.

REVIEW ASPECTS:
1. Technical Quality - ABC notation syntax, headers, MIDI assignments
2. Musical Quality - Melodic interest, harmonic coherence, rhythmic variety
3. Genre Fusion Authenticity - Integration of classical and modern elements
4. Completeness - Structure, development, musical satisfaction
5. Duration - Whether the length is appropriate for what this composition is trying to be

WORKFLOW (when given a filePath):
1. Call validate_abc with filePath to check for technical errors
2. Call read_abc_file with filePath to load the notation for musical review
3. Assess all aspects using the loaded content

DURATION ASSESSMENT:
CRITICAL: Call validate_abc FIRST before doing anything else. If validate_abc reports ANY hard errors (issues array non-empty), abc2midi will bail early and produce a stub MIDI that may be only seconds long regardless of how many bars are written. In this case:
- Set duration score to 1 (the MIDI output cannot be trusted)
- Issue a high-priority 'technical' recommendation to fix the errors
- Do NOT attempt to estimate actual duration from bar count/tempo

If validate_abc reports no hard errors, estimate the duration by examining the tempo (Q: header), meter (M: header), and number of measures. Then use your musical knowledge to judge whether this length serves the work.

The vast majority of music — across almost every genre — should not be under 2 minutes. Very short durations are only appropriate when the genre context itself specifically calls for extreme brevity as an aesthetic position. If the hybrid does not clearly reference such a tradition, a sub-2-minute piece should be flagged as needing expansion.

Beyond that floor, use your own musical judgment: does this specific hybrid demand a longer, more developed form? Does one side of the fusion call for extended development that the piece doesn't satisfy? Or is the current length appropriate for what this particular piece is trying to be? You may honor one tradition's length expectations, both, or neither — use your discernment. Issue a high-priority 'duration' recommendation only if you genuinely judge the piece is underdeveloped relative to its own musical ambition and genre context.

TECHNIQUE FIDELITY EVALUATION:
When evaluating technique fidelity, check: are the specific compositional methods of each genre actually used, not just referenced?
- For serial music: are there actual tone rows with transformations, not just chromatic passages?
- For minimalism: are there actual phase processes or additive patterns, not just repetition?
- For fugue: is there genuine subject/answer exposition with countersubject, not just imitative entries?
- For electronic genres: are rhythmic and textural approaches authentic to the specific subgenre?
Score 0-3 if style fingerprints absent, 4-6 if present but superficial, 7-10 if authentically implemented.

MIXTURE STRATEGY EVALUATION (Alcalde 2022):
Assess whether the piece commits to a coherent mixture strategy:
- CLASH: Are styles kept genuinely distinct with deliberate structural friction?
- COEXISTENCE: Is there a genuine compound identity with shared integration points, or are styles just placed side by side?
- DISTORTION: Is one style recognizable but altered by incongruous elements that don't form a second identity? (If both styles clearly identifiable, it's coexistence, not distortion.)
- TRAJECTORY: Is the transformation gradual and traceable?
A piece with no discernible strategy: score below 4. Commits but inconsistent: 4-6. Coherent throughout: 7-10.
Provide detailed, actionable assessment with specific issues and recommendations.`,

  output: Output.object({
    schema: z.object({
      verdict: z.enum(['pass', 'fail', 'needs_revision']).describe('Overall quality verdict'),

      scores: z.object({
        technical: z.number().describe('Technical quality score 0-10'),
        musical: z.number().describe('Musical quality score 0-10'),
        fusion: z.number().describe('Genre fusion authenticity score 0-10'),
        completeness: z.number().describe('Completeness score 0-10'),
        duration: z.number().describe('Duration appropriateness score 0-10'),
        techniqueFidelity: z.number().describe('Technique fidelity score 0-10'),
        fusionStrategy: z.number().describe('Mixture strategy coherence score 0-10'),
        harmonicSophistication: z.number().describe('Harmonic sophistication score 0-10'),
      }),

      issues: z.object({
        technical: z.array(z.object({
          severity: z.enum(['critical', 'major', 'minor']),
          description: z.string().describe('What is wrong'),
          location: z.string().optional().describe('Where in the composition'),
        })).describe('Technical problems found'),

        musical: z.array(z.object({
          severity: z.enum(['critical', 'major', 'minor']),
          description: z.string().describe('What is wrong'),
          location: z.string().optional().describe('Where in the composition'),
        })).describe('Musical quality problems'),

        fusion: z.array(z.object({
          severity: z.enum(['critical', 'major', 'minor']),
          description: z.string().describe('What is wrong with genre fusion'),
          missingElement: z.string().optional().describe('What genre element is missing or weak'),
        })).describe('Genre fusion problems'),
      }),

      strengths: z.array(z.string()).describe('What the composition does well'),

      recommendations: z.array(z.object({
        priority: z.enum(['high', 'medium', 'low']),
        category: z.enum(['technical', 'musical', 'fusion', 'completeness', 'duration']),
        action: z.string().describe('Specific action to take'),
        expectedImprovement: z.string().describe('How this will improve the composition'),
      })).describe('Prioritized, actionable recommendations'),

      summary: z.string().describe('Brief overall assessment'),
    }),
  }),

  tools: {
    validate_abc: validateAbcTool,
    read_abc_file: readAbcFileTool,
  },

  stopWhen: stepCountIs(5),
  toolChoice: 'auto',
    });
  }
  return _qaAgent;
}

export async function reviewCompositionWithAgent(options) {
  const {
    abcFilePath,
    abcNotation,
    genre,
    classicalGenre,
    modernGenre,
    drumPrescription = null,
    userInstructions = '',
    customSystemPrompt = null,
  } = options;

  if (!abcFilePath && !abcNotation) {
    throw new Error('reviewCompositionWithAgent requires abcFilePath or abcNotation');
  }

  let prompt = abcFilePath
    ? `Review the ${genre} composition (fusion of ${classicalGenre} and ${modernGenre}) stored at: ${abcFilePath}

Call validate_abc with filePath="${abcFilePath}" to check for technical errors first, then provide comprehensive quality assessment across all aspects: technical, musical, genre fusion, and completeness.`
    : `Review this ${genre} composition (fusion of ${classicalGenre} and ${modernGenre}).

ABC Notation:
\`\`\`
${abcNotation}
\`\`\`

Call validate_abc with the abcNotation above to check for technical errors first, then provide comprehensive quality assessment across all aspects: technical, musical, genre fusion, and completeness.`;


  if (drumPrescription) {
    const allowedList = drumPrescription.drumKit.map(s => '  ' + s.gm + ' = ' + s.name).join('\n');
    prompt += '\n\n## DRUM KIT PRESCRIPTION (validate compliance)\n'
      + 'The following GM percussion numbers are the ONLY authorized drum sounds:\n'
      + allowedList + '\n'
      + 'Any %%MIDI drum directive using GM numbers NOT in this list is a CRITICAL technical issue.';
  }

  if (userInstructions) {
    prompt += `\n\n## HARD REQUIREMENTS (check compliance)\nThe following user requirements MUST be fully satisfied. Flag any violation as a high-priority issue:\n${userInstructions}`;
  }

  if (customSystemPrompt) {
    prompt += `\n\n## ADDITIONAL DIRECTIVE CONTEXT\nThe composition was generated with the following extended directive set. These directives are VALID and should be evaluated for quality of usage, not flagged as errors:\n${customSystemPrompt}`;
  }

  try {
    const { output: assessment } = await getQaAgent().generate({
      prompt,
      onStepFinish: createStepLogger('QA-Agent'),
      providerOptions: {
        anthropic: {
          ...(supportsContextManagement() && {
            contextManagement: {
              edits: [
                {
                  type: 'clear_tool_uses_20250919',
                  trigger: { type: 'input_tokens', value: 15000 },
                  keep: { type: 'tool_uses', value: 2 },
                  clearToolInputs: true,
                },
              ],
            },
          }),
        },
      },
    });

    console.log(`\n📊 QA Assessment: ${assessment.verdict.toUpperCase()}`);
    console.log(`   Technical: ${assessment.scores.technical}/10`);
    console.log(`   Musical: ${assessment.scores.musical}/10`);
    console.log(`   Fusion: ${assessment.scores.fusion}/10`);
    console.log(`   Completeness: ${assessment.scores.completeness}/10`);
    console.log(`   Duration: ${assessment.scores.duration}/10`);
    console.log(`   Technique Fidelity: ${assessment.scores.techniqueFidelity}/10`);
    console.log(`   Mixture Strategy: ${assessment.scores.fusionStrategy}/10`);
    console.log(`   Harmonic Sophistication: ${assessment.scores.harmonicSophistication}/10`);

    const totalIssues = assessment.issues.technical.length +
      assessment.issues.musical.length +
      assessment.issues.fusion.length;

    if (totalIssues > 0) {
      console.log(`\n⚠️ Issues Found: ${totalIssues}`);
      if (assessment.issues.technical.length > 0) {
        console.log('  Technical:');
        assessment.issues.technical.forEach(issue => {
          console.log(`    [${issue.severity}] ${issue.description}`);
        });
      }
      if (assessment.issues.musical.length > 0) {
        console.log('  Musical:');
        assessment.issues.musical.forEach(issue => {
          console.log(`    [${issue.severity}] ${issue.description}`);
        });
      }
      if (assessment.issues.fusion.length > 0) {
        console.log('  Genre Fusion:');
        assessment.issues.fusion.forEach(issue => {
          console.log(`    [${issue.severity}] ${issue.description}`);
        });
      }
    }

    if (assessment.recommendations.length > 0) {
      console.log('\n📝 Recommendations:');
      assessment.recommendations
        .sort((a, b) => {
          const priority = { high: 0, medium: 1, low: 2 };
          return priority[a.priority] - priority[b.priority];
        })
        .forEach((rec, i) => {
          console.log(`   ${i + 1}. [${rec.priority.toUpperCase()}] ${rec.action}`);
        });
    }

    console.log(`\n💬 ${assessment.summary}`);

    return assessment;

  } catch (error) {
    console.error('QA agent error:', error.message);
    throw error;
  }
}

export async function generateWithQA(generateFn, options, maxRetries = 2) {
  let attempts = 0;
  let lastError = null;

  while (attempts < maxRetries) {
    attempts++;
    console.log(`\n🎵 Generation attempt ${attempts}/${maxRetries}...`);

    try {
      const abcNotation = await generateFn(options);

      console.log('\n🔍 Running QA review...');
      const assessment = await reviewCompositionWithAgent({
        abcNotation,
        genre: options.genre,
        classicalGenre: options.classicalGenre,
        modernGenre: options.modernGenre,
      });

      if (assessment.verdict === 'pass') {
        console.log('✅ QA PASSED - Composition approved!');
        return { abcNotation, assessment };
      }

      if (assessment.verdict === 'needs_revision' && attempts < maxRetries) {
        console.log(`⚠️ QA NEEDS REVISION - Retrying (${attempts}/${maxRetries})...`);
        continue;
      }

      console.log('❌ QA FAILED - Composition did not meet quality standards');
      return { abcNotation, assessment };

    } catch (error) {
      lastError = error;
      console.error(`❌ Attempt ${attempts} failed:`, error.message);

      if (attempts >= maxRetries) {
        throw new Error(`Generation failed after ${maxRetries} attempts: ${lastError.message}`);
      }
    }
  }

  throw new Error(`Generation failed after ${maxRetries} attempts: ${lastError?.message || 'Unknown error'}`);
}
