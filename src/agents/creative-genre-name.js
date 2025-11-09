/**
 * Creative Genre Name Agent
 * Step 2: Creates a unique genre name from classical and modern influences
 */

import { BaseAgent } from './base-agent.js';

export class CreativeGenreNameAgent extends BaseAgent {
  constructor(anthropic) {
    super('creative_genre_name', anthropic);
  }

  async execute(userPrompt, previousOutputs = {}) {
    const systemPrompt = `You are a creative music genre naming expert. Your task is to create innovative, evocative genre names by blending classical and modern musical influences.

Your output MUST be valid JSON with this exact structure:
{
  "genre_name": "The creative genre name you invented",
  "classical_influence": "The classical genre/era/composer",
  "modern_influence": "The modern genre/artist/label",
  "portmanteau_explanation": "Brief explanation of how you created the name",
  "overflow_data": {
    // ANY additional insights, ideas, or context you think is important
    // but doesn't fit the above structured fields
  }
}

Guidelines for creating genre names:
- Use portmanteaus, blends, or evocative combinations
- The name should hint at both influences
- Be creative and bold - avoid obvious combinations
- Examples: "Symphobreaks" (Symphony + Breakbeats), "Bachstep" (Bach + Dubstep), "Chopwave" (Chopin + Vaporwave)

Output ONLY the JSON object, no other text.`;

    const prompt = `${userPrompt}

Based on the above request, create a unique and compelling genre name that captures the fusion of classical and modern influences.`;

    try {
      const response = await this.callLLM(systemPrompt, prompt, {
        temperature: 0.9, // Higher temperature for creativity
        maxTokens: 2000
      });

      const parsed = this.parseJSONResponse(response);

      return this.createResponse('success', {
        genre_name: parsed.genre_name,
        classical_influence: parsed.classical_influence,
        modern_influence: parsed.modern_influence,
        portmanteau_explanation: parsed.portmanteau_explanation
      }, '', parsed.overflow_data || {});
    } catch (error) {
      console.error('Creative Genre Name Agent failed:', error);
      return this.createResponse('error', {
        error: error.message
      }, 'Failed to generate creative genre name');
    }
  }
}
