/**
 * Music History Agent
 * Step 3: Expert in musicology, identifies essential characteristics of genres/eras
 */

import { BaseAgent } from './base-agent.js';

export class MusicHistoryAgent extends BaseAgent {
  constructor(anthropic) {
    super('music_history', anthropic);
  }

  async execute(userPrompt, previousOutputs = {}) {
    const genreContext = previousOutputs.creative_genre_name || {};

    const systemPrompt = `You are a musicology and music history expert. Your task is to identify the true uniqueness and noteworthiness within any genre, time period, artist, composer, era, record label, or producer.

Your output MUST be valid JSON with this exact structure:
{
  "classical_characteristics": {
    "harmonic_language": "Description of harmonic approach",
    "formal_structures": "Typical forms used",
    "instrumentation": "Characteristic instruments",
    "melodic_style": "Melodic characteristics",
    "historical_context": "Brief historical context"
  },
  "modern_characteristics": {
    "rhythmic_approach": "Rhythmic characteristics",
    "production_techniques": "Production/sonic characteristics",
    "textural_approach": "How textures are built",
    "characteristic_sounds": "Signature sounds/techniques",
    "cultural_context": "Cultural/scene context"
  },
  "essential_fusion_requirements": [
    "Requirement 1",
    "Requirement 2",
    "..."
  ],
  "avoid": [
    "Cliché 1 to avoid",
    "Cliché 2 to avoid",
    "..."
  ],
  "overflow_data": {
    // ANY additional historical insights, references, or context
    // that doesn't fit the structured fields above
  }
}

IMPORTANT: Use the "overflow_data" field for insights that don't fit the structured schema.
Other agents will see this data.

Be specific, insightful, and focus on what makes each influence ESSENTIAL and UNIQUE.
Output ONLY the JSON object, no other text.`;

    const prompt = `${userPrompt}

${genreContext.genre_name ? `Creative Genre Name: "${genreContext.genre_name}"
${genreContext.additional_context || ''}

` : ''}Analyze the classical and modern influences and identify their essential musical characteristics that should inform this composition.`;

    try {
      const response = await this.callLLM(systemPrompt, prompt, {
        temperature: 0.7,
        maxTokens: 4000
      });

      const parsed = this.parseJSONResponse(response);

      return this.createResponse('success', {
        classical_characteristics: parsed.classical_characteristics,
        modern_characteristics: parsed.modern_characteristics,
        essential_fusion_requirements: parsed.essential_fusion_requirements,
        avoid: parsed.avoid
      }, `Historical analysis for ${genreContext.genre_name || 'genre fusion'}`, parsed.overflow_data || {});
    } catch (error) {
      console.error('Music History Agent failed:', error);
      return this.createResponse('error', {
        error: error.message
      }, 'Failed to analyze music history context');
    }
  }
}
