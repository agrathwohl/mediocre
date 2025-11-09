/**
 * Dynamics Agent
 * Step 6b: Handles dynamic markings, expression, and emotional arc
 * Works IN TANDEM with Timbrel Agent
 */

import { BaseAgent } from './base-agent.js';

export class DynamicsAgent extends BaseAgent {
  constructor(anthropic) {
    super('dynamics', anthropic);
  }

  async execute(userPrompt, previousOutputs = {}, collaborationContext = null) {
    const genreContext = previousOutputs.creative_genre_name || {};
    const historyContext = previousOutputs.music_history || {};
    const formContext = previousOutputs.compositional_form || {};
    const melodicContext = previousOutputs.melodic || {};
    const timbrelContext = collaborationContext; // Data from Timbrel agent

    const systemPrompt = `You are a musical dynamics and expression expert. Your task is to design the dynamic arc and expressive markings for the composition.

${timbrelContext ? `COLLABORATION CONTEXT from Timbrel Agent:
${JSON.stringify(timbrelContext, null, 2)}

Consider these timbral techniques when designing dynamics.
` : ''}

Your output MUST be valid JSON with this exact structure:
{
  "overall_dynamic_arc": "Description of the emotional/dynamic journey",
  "section_dynamics": [
    {
      "section": "Intro",
      "starting_dynamic": "p",
      "ending_dynamic": "mp",
      "approach": "gradual crescendo",
      "beat_settings": {
        "beat": [80, 70, 65, 1],
        "beatmod": 5
      }
    }
  ],
  "climax_points": [
    {
      "section": "Drop",
      "measure": 32,
      "dynamic": "fff",
      "description": "Maximum energy point"
    }
  ],
  "expression_markings": {
    "use_crescendo": true,
    "use_diminuendo": true,
    "deltaloudness": 10
  },
  "voice_specific_dynamics": {
    "voice_1": "More dynamic range, leads expression",
    "voice_2": "Supportive, less extreme dynamics"
  }
}

CRITICAL RULES:
- Valid dynamics: ppp, pp, p, mp, mf, f, ff, fff (NEVER use pppp or ffff)
- Design dynamics that support the melodic and formal structure
- Consider genre-appropriate dynamic ranges
- Use %%MIDI beat and beatmod settings for subtle dynamic shaping

IMPORTANT: You MUST output ONLY valid JSON. Do not include markdown, explanations, or any text outside the JSON object.
Do not wrap the JSON in markdown code fences.
Start your response with { and end with }`;

    const prompt = `${userPrompt}

${genreContext.genre_name ? `Genre: "${genreContext.genre_name}"
` : ''}${formContext.sections ? `Sections: ${JSON.stringify(formContext.sections.map(s => ({name: s.name, measures: s.measures, texture: s.texture})), null, 2)}
` : ''}${melodicContext.melodic_development_strategy ? `Melodic Development: ${melodicContext.melodic_development_strategy}
` : ''}
Design the dynamic arc and expression markings for this composition. Return ONLY the JSON object.`;

    try {
      const response = await this.callLLM(systemPrompt, prompt, {
        temperature: 0.7,
        maxTokens: 16000  // Increased to handle detailed section dynamics
      });

      const parsed = this.parseJSONResponse(response);

      return this.createResponse('success', {
        overall_dynamic_arc: parsed.overall_dynamic_arc,
        section_dynamics: parsed.section_dynamics,
        climax_points: parsed.climax_points,
        expression_markings: parsed.expression_markings,
        voice_specific_dynamics: parsed.voice_specific_dynamics
      }, `Dynamic arc and expression designed`);
    } catch (error) {
      console.error('Dynamics Agent failed:', error);
      return this.createResponse('error', {
        error: error.message
      }, 'Failed to create dynamics specification');
    }
  }
}
