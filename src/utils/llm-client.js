/**
 * Shared LLM client utilities
 * Extracted from claude.js during Phase 6 modularization
 * @module llm-client
 */

import { createAnthropic } from "@ai-sdk/anthropic";
import { createOpenAI } from "@ai-sdk/openai";

let _customConfig = null;
let _llamaServerURL = null;
let _abc2midiBinary = 'abc2midi';

/**
 * Set a custom abc2midi binary path (for forked builds like Pneuma).
 * @param {string} path - Path to the abc2midi binary
 */
export function setAbc2midiBinary(path) {
  _abc2midiBinary = path;
}

/** Get the configured abc2midi binary path */
export function getAbc2midiBinary() {
  return _abc2midiBinary;
}


export function setAnthropicConfig({ apiKey, baseURL, model }) {
  _customConfig = { apiKey, baseURL, model };
}

/**
 * Configure llama-server (OpenAI-compatible) as the LLM provider.
 * When set, getAnthropic() returns an OpenAI-compatible provider instead.
 * @param {string} url - Base URL for the OpenAI-compatible API (e.g. http://localhost:8001/v1)
 */
export function setLlamaServer(url) {
  // Normalize: ensure /v1 suffix for OpenAI-compatible endpoints
  _llamaServerURL = url.replace(/\/+$/, '');
  if (!_llamaServerURL.endsWith('/v1')) {
    _llamaServerURL += '/v1';
  }
}

/** Returns true if --llama-server is active */
export function isLlamaServer() {
  return !!_llamaServerURL;
}

export function getAnthropic() {
  // If llama-server is configured, return OpenAI-compatible provider
  if (_llamaServerURL) {
    return createOpenAI({
      baseURL: _llamaServerURL,
      apiKey: 'not-needed',  // llama-server doesn't require an API key
    });
  }

  const apiKey = _customConfig?.apiKey || process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    throw new Error(
      "Anthropic API key not found. Set ANTHROPIC_API_KEY in your environment variables.",
    );
  }

  const opts = { apiKey };

  if (_customConfig?.baseURL) {
    opts.baseURL = _customConfig.baseURL;

    // Proxy fetch wrapper:
    //  1. Forces streaming on non-streaming requests so Cloudflare doesn't
    //     kill the connection while a thinking model is still generating.
    //  2. Parses the SSE stream and reconstructs a plain JSON response,
    //     dropping thinking blocks (proxy models omit the `signature` field
    //     that @ai-sdk/anthropic's Zod schema requires).
    opts.fetch = async (url, init) => {
      let wasNonStreaming = false;

      if (init?.body) {
        try {
          const body = JSON.parse(init.body);
          if (!body.stream) {
            if (!body.max_tokens || body.max_tokens < 16000) body.max_tokens = 16000;
            body.stream = true;
            wasNonStreaming = true;
            init = { ...init, body: JSON.stringify(body) };
          }
        } catch (_) { /* not JSON */ }
      }

      const response = await fetch(url, init);

      // Pass through error responses and already-streaming SDK requests unchanged.
      if (!wasNonStreaming || !response.ok) return response;

      // Reconstruct as non-streaming JSON, discarding thinking blocks.
      const json = await _parseAnthropicSSE(response);
      return new Response(JSON.stringify(json), {
        status: 200,
        statusText: 'OK',
        headers: { 'content-type': 'application/json' },
      });
    };
  }

  return createAnthropic(opts);
}

/**
 * Consume an Anthropic SSE stream and return a plain non-streaming response object.
 * Thinking blocks are intentionally excluded — proxy models omit `signature`.
 */
async function _parseAnthropicSSE(response) {
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  let msgId = '', msgModel = '', stopReason = null;
  let inputTokens = 0, outputTokens = 0;
  const blocks = new Map(); // index → { type, content }

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split('\n');
    buffer = lines.pop() ?? '';

    for (const line of lines) {
      if (!line.startsWith('data: ')) continue;
      const raw = line.slice(6).trim();
      if (!raw || raw === '[DONE]') continue;
      let ev;
      try { ev = JSON.parse(raw); } catch (_) { continue; }

      switch (ev.type) {
        case 'message_start':
          msgId = ev.message?.id ?? '';
          msgModel = ev.message?.model ?? '';
          inputTokens = ev.message?.usage?.input_tokens ?? 0;
          break;
        case 'content_block_start': {
          const cb = ev.content_block ?? {};
          if (cb.type === 'tool_use') {
            blocks.set(ev.index, { type: 'tool_use', id: cb.id ?? '', name: cb.name ?? '', content: '' });
          } else {
            blocks.set(ev.index, { type: cb.type ?? 'text', content: '' });
          }
          break;
        }
        case 'content_block_delta': {
          const b = blocks.get(ev.index);
          if (b) {
            if (ev.delta?.type === 'text_delta') b.content += ev.delta.text ?? '';
            else if (ev.delta?.type === 'input_json_delta') b.content += ev.delta.partial_json ?? '';
            // thinking_delta intentionally ignored
          }
          break;
        }
        case 'message_delta':
          stopReason = ev.delta?.stop_reason ?? null;
          outputTokens = ev.usage?.output_tokens ?? 0;
          break;
      }
    }
  }

  return {
    id: msgId,
    type: 'message',
    role: 'assistant',
    content: [...blocks.entries()]
      .sort(([a], [b]) => a - b)
      .filter(([, b]) => b.type !== 'thinking')
      .map(([, b]) => {
        if (b.type === 'tool_use') {
          let input;
          try { input = JSON.parse(b.content); } catch (_) { input = {}; }
          return { type: 'tool_use', id: b.id, name: b.name, input };
        }
        return { type: 'text', text: b.content };
      }),
    model: msgModel,
    stop_reason: stopReason,
    stop_sequence: null,
    usage: { input_tokens: inputTokens, output_tokens: outputTokens },
  };
}

export function getModel(defaultModel) {
  // llama-server serves a single model; use a generic identifier
  if (_llamaServerURL) return _customConfig?.model || 'local-model';
  return _customConfig?.model || defaultModel;
}

/** Returns true only for models that support Anthropic context management features. */
export function supportsContextManagement() {
  if (_llamaServerURL) return false;  // llama-server doesn't support cache control
  return !getModel('claude-sonnet-4-6').includes('haiku');
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
