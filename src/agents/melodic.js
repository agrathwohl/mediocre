/**
 * Melodic Agent
 * Step 5: Creates melodic themes and motifs
 */

import { BaseAgent } from './base-agent.js';

export class MelodicAgent extends BaseAgent {
  constructor(anthropic) {
    super('melodic', anthropic);
  }

  async execute(userPrompt, previousOutputs = {}) {
    const genreContext = previousOutputs.creative_genre_name || {};
    const historyContext = previousOutputs.music_history || {};
    const arrangementContext = previousOutputs.arrangement || {};
    const formContext = previousOutputs.compositional_form || {};

    const systemPrompt = `You are a melodic composition expert. Your task is to create compelling melodic themes and motifs that work within the established structure and arrangement.

Your output MUST be valid JSON with this exact structure:
{
  "primary_theme": {
    "description": "Character of the main melodic theme",
    "contour": "ascending/descending/arch/etc",
    "interval_characteristics": "Interval relationships",
    "rhythmic_character": "Rhythmic qualities"
  },
  "secondary_themes": [
    {
      "description": "Character of secondary theme",
      "relationship_to_primary": "How it relates to primary theme"
    }
  ],
  "motifs": [
    {
      "name": "Motif A",
      "description": "Short melodic cell description",
      "usage": "Where/how this motif appears"
    }
  ],
  "melodic_development_strategy": "How melodies develop across sections",
  "voice_melodic_assignments": {
    "voice_1": "Primary melody carrier",
    "voice_2": "Counter-melody and harmonic support",
    "voice_3": "Bass line with melodic interest"
  }
}

Guidelines:
- Create melodies that reflect BOTH classical and modern influences
- Consider the vocal range and characteristics of each instrument
- Think about melodic development and variation across sections
- Melodies should be memorable but not cliché
- Consider how melodies interact between voices

Output ONLY the JSON object, no other text.`;

    const prompt = `${userPrompt}

${genreContext.genre_name ? `Genre: "${genreContext.genre_name}"
` : ''}${formContext.sections ? `Structural Sections: ${JSON.stringify(formContext.sections.map(s => ({name: s.name, measures: s.measures})), null, 2)}
Key: ${formContext.key}
` : ''}${arrangementContext.voices ? `Voices: ${JSON.stringify(arrangementContext.voices.map(v => ({voice: v.voice_number, instrument: v.instrument_name, role: v.role})), null, 2)}
` : ''}${historyContext.classical_characteristics ? `Classical Melodic Style: ${historyContext.classical_characteristics.melodic_style}
` : ''}
Create melodic themes and motifs for this composition.`;

    try {
      const response = await this.callLLM(systemPrompt, prompt, {
        temperature: 0.8,
        maxTokens: 16000  // Increased to handle detailed responses
      });

      const parsed = this.parseJSONResponse(response);

      return this.createResponse('success', {
        primary_theme: parsed.primary_theme,
        secondary_themes: parsed.secondary_themes,
        motifs: parsed.motifs,
        melodic_development_strategy: parsed.melodic_development_strategy,
        voice_melodic_assignments: parsed.voice_melodic_assignments
      }, `Melodic themes and motifs designed`);
    } catch (error) {
      console.error('Melodic Agent failed:', error);
      return this.createResponse('error', {
        error: error.message
      }, 'Failed to create melodic content');
    }
  }
}
