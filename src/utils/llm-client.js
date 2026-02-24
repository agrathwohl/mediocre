/**
 * Shared LLM client utilities
 * Extracted from claude.js during Phase 6 modularization
 * @module llm-client
 */

import { createAnthropic } from "@ai-sdk/anthropic";

/**
 * Creates a custom Anthropic instance with the provided API key
 * @returns {object} The Anthropic provider instance
 */
export function getAnthropic() {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    throw new Error(
      "Anthropic API key not found. Set ANTHROPIC_API_KEY in your environment variables.",
    );
  }

  return createAnthropic({
    apiKey,
  });
}

/**
 * Strip markdown code fences from LLM output
 * @param {string} text - Text that may contain markdown code fences
 * @returns {string} Text with code fences removed
 */
export function stripMarkdownCodeFences(text) {
  const trimmed = text.trim();
  if (trimmed.startsWith("```")) {
    return trimmed.replace(/^```[a-z]*\n?/g, "").replace(/\n?```$/g, "");
  }
  return trimmed;
}
