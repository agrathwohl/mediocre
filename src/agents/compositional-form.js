/**
 * Compositional Form Agent
 * Step 4b: Determines musical structure and form
 * Works IN TANDEM with Arrangement Agent
 */

import { BaseAgent } from './base-agent.js';

export class CompositionalFormAgent extends BaseAgent {
  constructor(anthropic) {
    super('compositional_form', anthropic);
  }

  async execute(userPrompt, previousOutputs = {}, collaborationContext = null) {
    const genreContext = previousOutputs.creative_genre_name || {};
    const historyContext = previousOutputs.music_history || {};
    const arrangementContext = collaborationContext; // Data from Arrangement agent

    const systemPrompt = `You are a musical form and structure expert. Your task is to design the compositional skeleton and structure of a piece.

${arrangementContext ? `COLLABORATION CONTEXT from Arrangement Agent:
${JSON.stringify(arrangementContext, null, 2)}

Consider this instrumentation when designing the structure.
` : ''}

Your output MUST be valid JSON with this exact structure:
{
  "key": "Dm",
  "time_signature": "4/4",
  "tempo": 174,
  "total_measures": 64,
  "sections": [
    {
      "name": "Intro",
      "measures": 8,
      "key": "Dm",
      "harmonic_approach": "Static tonic",
      "texture": "Sparse",
      "voices_active": [1, 2]
    }
  ],
  "form_type": "ABAB with bridge",
  "structural_notes": "Overall structural approach and flow"
}

Guidelines:
- Choose appropriate key, time signature, tempo for the genre fusion
- Create clear sections (Intro, Verse, Chorus, Bridge, Drop, Outro, etc.)
- Total 64-80 measures is ideal
- Each section should have clear purpose
- Consider dynamics and texture changes across sections
- If arrangement context is provided, ensure sections work with chosen instruments

Output ONLY the JSON object, no other text.`;

    const prompt = `${userPrompt}

${genreContext.genre_name ? `Genre: "${genreContext.genre_name}"
` : ''}${historyContext.classical_characteristics ? `Classical Characteristics: ${JSON.stringify(historyContext.classical_characteristics, null, 2)}
Modern Characteristics: ${JSON.stringify(historyContext.modern_characteristics, null, 2)}
Essential Requirements: ${JSON.stringify(historyContext.essential_fusion_requirements, null, 2)}
` : ''}
Design the compositional form and structure for this piece.`;

    try {
      const response = await this.callLLM(systemPrompt, prompt, {
        temperature: 0.7,
        maxTokens: 16000  // Increased to handle detailed responses
      });

      const parsed = this.parseJSONResponse(response);

      return this.createResponse('success', {
        key: parsed.key,
        time_signature: parsed.time_signature,
        tempo: parsed.tempo,
        total_measures: parsed.total_measures,
        sections: parsed.sections,
        form_type: parsed.form_type,
        structural_notes: parsed.structural_notes
      }, `Form: ${parsed.form_type} in ${parsed.key}, ${parsed.total_measures} measures`);
    } catch (error) {
      console.error('Compositional Form Agent failed:', error);
      return this.createResponse('error', {
        error: error.message
      }, 'Failed to create compositional form');
    }
  }
}
