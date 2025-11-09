/**
 * Critic Agent
 * Step 8: Validates ABC notation and identifies issues
 */

import { BaseAgent } from './base-agent.js';

export class CriticAgent extends BaseAgent {
  constructor(anthropic) {
    super('critic', anthropic);
  }

  async execute(userPrompt, previousOutputs = {}) {
    const compositionContext = previousOutputs.composition || {};
    const arrangementContext = previousOutputs.arrangement || {};
    const formContext = previousOutputs.compositional_form || {};

    if (!compositionContext.abc_notation) {
      return this.createResponse('error', {
        error: 'No ABC notation to review'
      }, 'Composition agent did not produce ABC notation');
    }

    const systemPrompt = `You are an expert ABC notation critic and validator. Your task is to review ABC notation for syntax errors, musical problems, and inappropriate decisions.

EXPECTED SPECIFICATIONS:
- Total voices: ${arrangementContext.total_voices || 'unknown'}
- Key: ${formContext.key || 'unknown'}
- Time signature: ${formContext.time_signature || 'unknown'}
- Total measures: ${formContext.total_measures || 'unknown'}

Your output MUST be valid JSON with this structure:
{
  "validation_status": "pass" or "fail",
  "issues": [
    {
      "severity": "critical|major|minor",
      "category": "syntax|bar_count|voice_mismatch|octave_notation|midi_config|musical_quality",
      "description": "Specific description of the issue",
      "location": "Where in the ABC (e.g., 'V:1 bar 23', 'Header line 10')",
      "suggested_fix": "How to fix it",
      "agent_to_revise": "Which agent should fix this (e.g., 'composition', 'arrangement')"
    }
  ],
  "syntax_errors": {
    "uppercase_apostrophes": false,
    "orphaned_midi_declarations": false,
    "invalid_dynamics": false,
    "bar_count_mismatches": false
  },
  "musical_quality_notes": "Overall assessment of musical quality",
  "recommendation": "accept|revise"
}

CHECK FOR:
1. SYNTAX ERRORS:
   - Uppercase letters with apostrophes (C' D' E' - INVALID)
   - MIDI program/channel declarations that don't match voice count
   - Orphaned MIDI declarations (e.g., %%MIDI program 11 with no V:11)
   - Invalid dynamics (ffff, pppp)
   - Bar count errors (bars don't have correct number of beats)

2. STRUCTURAL PROBLEMS:
   - Voice count mismatch between header and body
   - Missing voice sections
   - Inconsistent bar counts between voices

3. MUSICAL QUALITY:
   - Really bad decisions (inappropriate instruments, poor structure)
   - Missed opportunities to fulfill genre requirements
   - Clichés or uninspired choices

BE SPECIFIC. If you find issues, identify EXACTLY where they are and which agent should fix them.

Output ONLY the JSON object, no other text.`;

    const prompt = `Review the following ABC notation for errors and quality issues.

ABC NOTATION TO REVIEW:
${compositionContext.abc_notation}

Provide your analysis as a JSON object following the specified structure.`;

    try {
      const response = await this.callLLM(systemPrompt, prompt, {
        temperature: 0.3, // Lower temperature for analytical task
        maxTokens: 16000  // Large ABC files need detailed validation
      });

      const parsed = this.parseJSONResponse(response);

      return this.createResponse('success', {
        validation_status: parsed.validation_status,
        issues: parsed.issues,
        syntax_errors: parsed.syntax_errors,
        musical_quality_notes: parsed.musical_quality_notes,
        recommendation: parsed.recommendation
      }, `Validation ${parsed.validation_status}: ${parsed.issues.length} issues found`);
    } catch (error) {
      console.error('Critic Agent failed:', error);
      return this.createResponse('error', {
        error: error.message
      }, 'Failed to validate ABC notation');
    }
  }
}
