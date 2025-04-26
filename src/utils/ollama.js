/**
 * Utility functions for Ollama integration
 */

import { config } from './config.js';

/**
 * Get the Ollama API endpoint URL
 * @returns {string} The Ollama API endpoint URL
 */
export function getOllamaEndpoint() {
  return config.get('ollamaEndpoint');
}

/**
 * Generate text using Ollama
 * @param {Object} options - Generation options
 * @param {string} options.model - The Ollama model to use
 * @param {string} options.system - System prompt
 * @param {string} options.prompt - User prompt
 * @param {number} [options.temperature=0.7] - Temperature for generation
 * @param {number} [options.maxTokens] - Maximum tokens to generate
 * @returns {Promise<{text: string}>} The generated text
 */
export async function generateTextWithOllama(options) {
  const endpoint = getOllamaEndpoint();
  
  if (!endpoint) {
    throw new Error('Ollama endpoint not configured. Please set OLLAMA_ENDPOINT in your environment variables or configuration.');
  }

  const generateEndpoint = `${endpoint}/api/generate`;
  
  const body = {
    model: options.model,
    prompt: options.prompt,
    system: options.system,
    options: {
      temperature: options.temperature || 0.7,
      num_predict: options.maxTokens || 4096
    },
    stream: false
  };

  try {
    const response = await fetch(generateEndpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      const errorData = await response.text();
      throw new Error(`Ollama API error (${response.status}): ${errorData}`);
    }

    const data = await response.json();
    return { text: data.response };
  } catch (error) {
    console.error('Error calling Ollama API:', error.message);
    throw error;
  }
}

/**
 * List available models from Ollama
 * @returns {Promise<Array<string>>} List of available model names
 */
export async function listOllamaModels() {
  const endpoint = getOllamaEndpoint();
  
  if (!endpoint) {
    throw new Error('Ollama endpoint not configured. Please set OLLAMA_ENDPOINT in your environment variables or configuration.');
  }

  try {
    const response = await fetch(`${endpoint}/api/tags`);
    
    if (!response.ok) {
      const errorData = await response.text();
      throw new Error(`Ollama API error (${response.status}): ${errorData}`);
    }

    const data = await response.json();
    return data.models.map(model => model.name);
  } catch (error) {
    console.error('Error listing Ollama models:', error.message);
    throw error;
  }
}