/**
 * Critic Agent
 * Step 8: Validates ABC notation and identifies issues
 */

import { BaseAgent } from './base-agent.js';
import { AbcValidator } from '../utils/abc-validators.js';

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

      // CRITICAL: Auto-fix syntax errors in the ABC notation
      let correctedAbc = compositionContext.abc_notation;
      const appliedFixes = [];

      if (parsed.syntax_errors.uppercase_apostrophes) {
        correctedAbc = this.fixUppercaseApostrophes(correctedAbc);
        appliedFixes.push('Fixed uppercase apostrophes (C\' -> c\')');
      }

      if (parsed.syntax_errors.invalid_dynamics) {
        correctedAbc = this.fixInvalidDynamics(correctedAbc);
        appliedFixes.push('Fixed invalid dynamics (ffff -> fff, pppp -> ppp)');
      }

      // Always proactively fix high MIDI velocities (common issue, often not detected by LLM)
      const beforeVelocityFix = correctedAbc;
      correctedAbc = this.fixHighVelocities(correctedAbc);
      if (correctedAbc !== beforeVelocityFix) {
        appliedFixes.push('Reduced MIDI velocities to safe range (max 115)');
      }

      // Fix orphaned MIDI declarations
      const beforeOrphanFix = correctedAbc;
      correctedAbc = this.fixOrphanedMidiDeclarations(correctedAbc);
      if (correctedAbc !== beforeOrphanFix) {
        appliedFixes.push('Removed orphaned MIDI program declarations');
      }

      // CRITICAL: Fix MIDI directives in wrong locations (must be in header only)
      const beforeMidiPlacementFix = correctedAbc;
      correctedAbc = this.fixMidiDirectivePlacement(correctedAbc);
      if (correctedAbc !== beforeMidiPlacementFix) {
        appliedFixes.push('Moved MIDI directives to header (prevents abc2midi segfaults)');
      }

      // Fix missing voice sections and bar count mismatches
      const beforeStructuralFix = correctedAbc;
      correctedAbc = this.fixVoiceStructure(correctedAbc, arrangementContext, formContext);
      if (correctedAbc !== beforeStructuralFix) {
        appliedFixes.push('Fixed missing voice sections and bar count mismatches');
      }

      return this.createResponse('success', {
        validation_status: parsed.validation_status,
        issues: parsed.issues,
        syntax_errors: parsed.syntax_errors,
        musical_quality_notes: parsed.musical_quality_notes,
        recommendation: parsed.recommendation,
        abc_notation: correctedAbc,  // Return CORRECTED ABC
        original_abc: compositionContext.abc_notation,
        applied_fixes: appliedFixes,
        has_critical_issues: parsed.issues.some(i => i.severity === 'critical'),
        has_major_issues: parsed.issues.some(i => i.severity === 'major')
      }, `Validation ${parsed.validation_status}: ${parsed.issues.length} issues found, ${appliedFixes.length} auto-fixed`);
    } catch (error) {
      console.error('Critic Agent failed:', error);
      return this.createResponse('error', {
        error: error.message
      }, 'Failed to validate ABC notation');
    }
  }

  // Delegate to shared AbcValidator class for all ABC fixing logic
  fixUppercaseApostrophes(abc) {
    return AbcValidator.fixUppercaseApostrophes(abc);
  }

  fixInvalidDynamics(abc) {
    return AbcValidator.fixInvalidDynamics(abc);
  }

  fixHighVelocities(abc) {
    return AbcValidator.fixHighVelocities(abc);
  }

  fixOrphanedMidiDeclarations(abc) {
    return AbcValidator.fixOrphanedMidiDeclarations(abc);
  }

  fixMidiDirectivePlacement(abc) {
    return AbcValidator.fixMidiDirectivePlacement(abc);
  }

  /**
   * Fix missing voice sections and bar count mismatches
   * - Add missing voice sections with rests
   * - Pad voices to match expected bar count
   */
  fixVoiceStructure(abc, arrangementContext, formContext) {
    const lines = abc.split('\n');
    const expectedVoices = arrangementContext?.total_voices || 0;
    const expectedBars = formContext?.total_measures || 0;

    if (!expectedVoices || !expectedBars) {
      return abc; // Can't fix without knowing expectations
    }

    // Parse time signature to calculate rest bars
    const timeSig = formContext?.time_signature || '4/4';
    const [beatsPerBar] = timeSig.split('/').map(n => parseInt(n));

    // Separate header from voice sections
    const headerLines = [];
    const voiceSections = {};
    let currentVoice = null;
    let inHeader = true;

    for (const line of lines) {
      // Voice declaration (check BEFORE header to avoid V: being treated as header)
      // Support both V:1 and [V:1] formats
      const voiceMatch = line.match(/^\[?V:(\d+)/);
      if (voiceMatch) {
        inHeader = false;
        currentVoice = parseInt(voiceMatch[1]);
        if (!voiceSections[currentVoice]) {
          voiceSections[currentVoice] = [];
        }
        // Don't include V: line in content, we'll add it back during reconstruction
        continue;
      }

      // Header lines start with single capital letter followed by colon
      if (inHeader && line.match(/^[A-Z]:/)) {
        headerLines.push(line);
        continue;
      }

      // CRITICAL: Preserve ALL %% directives (MIDI, score, staves, etc.) and blank lines in header
      if (inHeader && (line.match(/^%%/) || line.trim() === '')) {
        headerLines.push(line);
        continue;
      }

      // Voice content (only if we're in a voice section)
      if (currentVoice !== null && line.trim() !== '') {
        voiceSections[currentVoice].push(line);
      }
    }

    // Add missing voices with rest bars (ONLY if voice doesn't exist)
    for (let v = 1; v <= expectedVoices; v++) {
      if (!voiceSections[v] || voiceSections[v].length === 0) {
        const restBar = `z${beatsPerBar}`;
        const restBars = Array(expectedBars).fill(restBar).join(' | ') + ' |';
        voiceSections[v] = [restBars];
      }
    }

    // Fix bar counts in existing voices
    for (const voiceNum of Object.keys(voiceSections)) {
      const voiceContent = voiceSections[voiceNum].join('\n');

      // Count actual bars (split by | and count segments with notes/rests)
      const bars = voiceContent.split('|').filter(segment => {
        const content = segment.trim();
        // Has notes (a-g, A-G), rests (z, Z), or chords [...]
        // Exclude comment-only bars starting with %
        return (content.match(/[a-gA-G]|[zZ]|\[.*\]/) && !content.match(/^%/));
      });
      const barCount = bars.length;

      if (barCount < expectedBars) {
        // Need to add more bars
        const missingBars = expectedBars - barCount;
        const restBar = `z${beatsPerBar}`;

        // Check if last line ends with any bar line variant to avoid double-bar (| |)
        const lastIdx = voiceSections[voiceNum].length - 1;
        const lastLine = voiceSections[voiceNum][lastIdx];
        const endsWithBarLine = lastLine.trim().match(/(\|\|?|\|[\]:\]])$/);

        // Build padding appropriately
        const padding = endsWithBarLine
          ? ' ' + Array(missingBars).fill(restBar).join(' | ') + ' |'
          : ' | ' + Array(missingBars).fill(restBar).join(' | ') + ' |';

        voiceSections[voiceNum][lastIdx] += padding;
      }
    }

    // Reconstruct ABC with proper voice declarations
    const result = [
      ...headerLines,
      ...Object.keys(voiceSections)
        .map(v => parseInt(v))
        .sort((a, b) => a - b)
        .flatMap(voiceNum => [
          `V:${voiceNum}`,
          ...voiceSections[voiceNum]
        ])
    ];

    return result.join('\n');
  }
}
