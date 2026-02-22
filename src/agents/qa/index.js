/**
 * QA (Quality Assurance) Agent - AI SDK v6
 * Reviews composition quality, completeness, and genre fusion authenticity
 * Provides feedback and decides if revision is needed
 */

import { ToolLoopAgent, Output, stepCountIs } from 'ai';
import { createAnthropic } from '@ai-sdk/anthropic';
import { z } from 'zod';
import { validateAbcTool, readAbcFileTool } from '../shared/tools.js';
import { createStepLogger } from '../shared/utils.js';

const anthropic = createAnthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
});

/**
 * QA Agent
 * Uses Claude Sonnet with structured output for targeted insights
 * Features: Multi-aspect validation, detailed issue tracking, specific recommendations
 */
export const qaAgent = new ToolLoopAgent({
  model: anthropic('claude-sonnet-4-6', {
    cacheControl: { type: 'ephemeral', ttl: '1h' },
  }),

  instructions: `You are a music composition quality assurance expert.
Your task is to review ABC notation compositions for quality, completeness, and authenticity.

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
Provide detailed, actionable assessment with specific issues and recommendations.`,

  output: Output.object({
    schema: z.object({
      // Overall verdict
      verdict: z.enum(['pass', 'fail', 'needs_revision']).describe('Overall quality verdict'),

      // Scores (0-10 scale)
      scores: z.object({
        technical: z.number().describe('Technical quality score 0-10'),
        musical: z.number().describe('Musical quality score 0-10'),
        fusion: z.number().describe('Genre fusion authenticity score 0-10'),
        completeness: z.number().describe('Completeness score 0-10'),
        duration: z.number().describe('Duration appropriateness score 0-10 — judged against this specific genre hybrid\'s needs, not a fixed time target'),
      }),

      // Detailed issues by category
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

      // Strengths
      strengths: z.array(z.string()).describe('What the composition does well'),

      // Specific actionable recommendations
      recommendations: z.array(z.object({
        priority: z.enum(['high', 'medium', 'low']),
        category: z.enum(['technical', 'musical', 'fusion', 'completeness', 'duration']),
        action: z.string().describe('Specific action to take'),
        expectedImprovement: z.string().describe('How this will improve the composition'),
      })).describe('Prioritized, actionable recommendations'),

      // Summary feedback
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

/**
 * Review a composition with the QA agent
 * @param {Object} options - Review options
 * @param {string} options.abcNotation - ABC notation to review
 * @param {string} options.genre - Expected genre (e.g., "baroque_x_synthwave")
 * @param {string} options.classicalGenre - Classical component
 * @param {string} options.modernGenre - Modern component
 * @returns {Promise<Object>} QA assessment with verdict, scores, and feedback
 */
export async function reviewCompositionWithAgent(options) {
  const {
    abcFilePath,
    abcNotation,
    genre,
    classicalGenre,
    modernGenre,
  } = options;

  if (!abcFilePath && !abcNotation) {
    throw new Error('reviewCompositionWithAgent requires abcFilePath or abcNotation');
  }

  const prompt = abcFilePath
    ? `Review the ${genre} composition (fusion of ${classicalGenre} and ${modernGenre}) stored at: ${abcFilePath}

Call validate_abc with filePath="${abcFilePath}" to check for technical errors first, then provide comprehensive quality assessment across all aspects: technical, musical, genre fusion, and completeness.`
    : `Review this ${genre} composition (fusion of ${classicalGenre} and ${modernGenre}).

ABC Notation:
\`\`\`
${abcNotation}
\`\`\`

Call validate_abc with the abcNotation above to check for technical errors first, then provide comprehensive quality assessment across all aspects: technical, musical, genre fusion, and completeness.`;

  try {
    const { output: assessment } = await qaAgent.generate({
      prompt,
      onStepFinish: createStepLogger('QA-Agent'),
      providerOptions: {
        anthropic: {
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
        },
      },
    });

    // Display assessment
    console.log(`\n📊 QA Assessment: ${assessment.verdict.toUpperCase()}`);
    console.log(`   Technical: ${assessment.scores.technical}/10`);
    console.log(`   Musical: ${assessment.scores.musical}/10`);
    console.log(`   Fusion: ${assessment.scores.fusion}/10`);
    console.log(`   Completeness: ${assessment.scores.completeness}/10`);
    console.log(`   Duration: ${assessment.scores.duration}/10`);

    // Show issues if any
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

    // Show recommendations
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

/**
 * Generate composition with QA validation loop
 * Wraps composition generation with automatic QA review
 * @param {Function} generateFn - Composition generation function
 * @param {Object} options - Generation options (passed to both generate and QA)
 * @param {number} [maxRetries=2] - Max generation attempts if QA fails
 * @returns {Promise<{abcNotation: string, assessment: Object}>}
 */
export async function generateWithQA(generateFn, options, maxRetries = 2) {
  let attempts = 0;
  let lastError = null;

  while (attempts < maxRetries) {
    attempts++;
    console.log(`\n🎵 Generation attempt ${attempts}/${maxRetries}...`);

    try {
      // Generate composition
      const abcNotation = await generateFn(options);

      // Review with QA agent
      console.log('\n🔍 Running QA review...');
      const assessment = await reviewCompositionWithAgent({
        abcNotation,
        genre: options.genre,
        classicalGenre: options.classicalGenre,
        modernGenre: options.modernGenre,
      });

      // Check verdict
      if (assessment.verdict === 'pass') {
        console.log('✅ QA PASSED - Composition approved!');
        return { abcNotation, assessment };
      }

      if (assessment.verdict === 'needs_revision' && attempts < maxRetries) {
        console.log(`⚠️ QA NEEDS REVISION - Retrying (${attempts}/${maxRetries})...`);
        continue;
      }

      // Fail verdict or out of retries
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
