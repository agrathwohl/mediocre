/**
 * Base Agent Class
 * All music composition agents inherit from this
 */

import { generateText } from 'ai';

export class BaseAgent {
  constructor(name, anthropic) {
    this.name = name;
    this.anthropic = anthropic;
  }

  /**
   * Create standardized agent response
   */
  createResponse(status, data, additionalContext = '', overflowData = {}) {
    return {
      agent: this.name,
      timestamp: new Date().toISOString(),
      status,
      data,
      additional_context: additionalContext,
      overflow_data: overflowData  // For any insights that don't fit structured schema
    };
  }

  /**
   * Extract all previous agent outputs from context
   */
  extractPreviousOutputs(context) {
    const outputs = {};
    if (context.creative_genre_name) outputs.creative_genre_name = context.creative_genre_name;
    if (context.music_history) outputs.music_history = context.music_history;
    if (context.arrangement) outputs.arrangement = context.arrangement;
    if (context.compositional_form) outputs.compositional_form = context.compositional_form;
    if (context.melodic) outputs.melodic = context.melodic;
    if (context.timbrel) outputs.timbrel = context.timbrel;
    if (context.dynamics) outputs.dynamics = context.dynamics;
    if (context.composition) outputs.composition = context.composition;
    return outputs;
  }

  /**
   * Base execute method - override in subclasses
   */
  async execute(userPrompt, previousOutputs = {}) {
    throw new Error(`Agent ${this.name} must implement execute()`);
  }

  /**
   * Call Anthropic API with agent-specific prompt using Vercel AI SDK
   */
  async callLLM(systemPrompt, userPrompt, options = {}) {
    // Get model from the anthropic provider (Vercel AI SDK pattern)
    const modelName = options.model || 'claude-sonnet-4-5-20250929';
    const model = this.anthropic(modelName);

    // Use generateText from Vercel AI SDK
    // Default to 16000 tokens to handle detailed agent responses
    const result = await generateText({
      model,
      system: systemPrompt,
      prompt: userPrompt,
      temperature: options.temperature || 0.7,
      maxTokens: options.maxTokens || 16000
    });

    return result.text;
  }

  /**
   * Parse JSON from LLM response
   */
  parseJSONResponse(text) {
    // Try to extract JSON from markdown code blocks or raw text
    let jsonText = text;

    // Remove markdown code fences if present
    const codeBlockMatch = text.match(/```(?:json)?\s*([\s\S]*?)\s*```/);
    if (codeBlockMatch) {
      jsonText = codeBlockMatch[1];
    } else if (text.startsWith('```')) {
      // Truncated response - missing closing fence
      // Try to extract JSON starting after the opening fence
      const lines = text.split('\n');
      if (lines[0].match(/```json?/)) {
        lines.shift(); // Remove the opening fence line
        jsonText = lines.join('\n');
      }
    }

    try {
      return JSON.parse(jsonText);
    } catch (error) {
      // Check if response was truncated
      if (text.includes('```json') && !text.endsWith('```')) {
        console.error(`\n⚠️  ${this.name} response appears truncated (hit token limit)`);
        console.error(`   Response length: ${text.length} characters`);
        console.error(`   Consider increasing maxTokens or simplifying agent prompt\n`);
      }

      console.error(`Failed to parse JSON from ${this.name}:`, error.message);
      console.error('Raw text preview:', text.substring(0, 500) + '...');
      throw new Error(`${this.name} returned invalid JSON: ${error.message}`);
    }
  }
}
