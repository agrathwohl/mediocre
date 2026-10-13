/**
 * Shared LLM client utilities
 * Extracted from claude.js during Phase 6 modularization
 * @module llm-client
 */

import { createAnthropic } from "@ai-sdk/anthropic";
import { wrapLanguageModel, defaultSettingsMiddleware } from "ai";
import { createOpenAI } from "@ai-sdk/openai";
import { Agent, fetch as undiciFetch } from "undici";
import { homedir } from "os";
import fs from "fs";
import path from "path";
import { writeFailure, trace } from "../agents/shared/utils.js";

let _customConfig = null;
let _llamaServerURL = null;
let _abc2midiBinary = null;

/**
 * Set a custom abc2midi binary path (for forked builds like Pneuma).
 * @param {string} path - Path to the abc2midi binary
 */
export function setAbc2midiBinary(path) {
  _abc2midiBinary = path;
}

/** Get the configured abc2midi binary path */
export function getAbc2midiBinary() {
  // Precedence: --abc2midi flag > MEDIOCRE_ABC2MIDI > legacy ABC2MIDI_BIN > stock 'abc2midi'.
  // Read the env lazily so it resolves after dotenv.config() regardless of import order.
  const bin = _abc2midiBinary || process.env.MEDIOCRE_ABC2MIDI || process.env.ABC2MIDI_BIN || 'abc2midi';
  return bin.startsWith('~/') ? homedir() + bin.slice(1) : bin;
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

let _callCount = 0;

const unifiedFinish = (fr) => (fr && typeof fr === 'object' ? (fr.unified ?? JSON.stringify(fr)) : fr);
const tokenTotal = (v) => (v && typeof v === 'object' ? v.total : v);
const rawFinish = (fr) => (fr && typeof fr === 'object' ? fr.raw : undefined);
// in / cache read / cache write / out / reasoning, from the provider's extended usage
const usageText = (u) => `in: ${tokenTotal(u?.inputTokens)} (cache read: ${u?.inputTokens?.cacheRead ?? '?'}, cache write: ${u?.inputTokens?.cacheWrite ?? '?'}, uncached: ${u?.inputTokens?.noCache ?? '?'}), out: ${tokenTotal(u?.outputTokens)} (text: ${u?.outputTokens?.text ?? '?'}, reasoning: ${u?.outputTokens?.reasoning ?? '?'})`;

/**
 * Middleware on EVERY model call: records finish reason, tokens, time, errors and
 * empty replies to ./logs/model-calls.jsonl and ./failures/, and turns off the SDK's automatic retries.
 */
function recordingMiddleware(modelId) {
  const log = (entry) => {
    fs.mkdirSync(path.join(process.cwd(), 'logs'), { recursive: true });
    fs.appendFileSync(path.join(process.cwd(), 'logs', 'model-calls.jsonl'), JSON.stringify({ time: new Date().toISOString(), model: modelId, ...entry }) + '\n');
  };

  const recordEnd = (id, kind, startedAt, finishReason, usage, text, reasoning, toolCalls, errors) => {
    const seconds = (Date.now() - startedAt) / 1000;
    const finish = unifiedFinish(finishReason);
    const raw = rawFinish(finishReason);
    console.log(`[${modelId} call ${id}] ${kind} finish: ${finish} (raw: ${raw}) ${usageText(usage)} in ${seconds.toFixed(0)}s`);
    log({ call: id, kind, finish, rawFinishReason: raw, usage, seconds, textChars: text.length, reasoningChars: reasoning.length, toolCalls, errors });
    trace(`\n===== [${modelId} call ${id}] finish: ${finish} (raw: ${raw}) ${usageText(usage)} ${seconds.toFixed(0)}s =====\n`);
    const emptyReply = finish === 'stop' && text.length === 0 && toolCalls === 0;
    if (!['stop', 'tool-calls'].includes(finish) || emptyReply || errors.length > 0) {
      console.warn(`⚠️ [${modelId} call ${id}] did not end normally (finish: ${finish}${emptyReply ? ', empty reply' : ''})`);
      writeFailure(`${modelId}-call${id}`, { kind, finishReason: finish, rawFinishReason: raw, usage, seconds, text, reasoning, toolCalls, errors });
    }
  };

  const recordError = (id, kind, startedAt, error) => {
    const seconds = (Date.now() - startedAt) / 1000;
    console.error(`❌ [${modelId} call ${id}] ${kind} failed after ${seconds.toFixed(0)}s: ${error?.message}`);
    log({ call: id, kind, seconds, error: error?.message, statusCode: error?.statusCode });
    trace(`\n!!!!! [${modelId} call ${id}] ${kind} FAILED after ${seconds.toFixed(0)}s: ${error?.message}\n`);
    writeFailure(`${modelId}-call${id}-error`, {
      kind, seconds, name: error?.name, error: error?.message, statusCode: error?.statusCode,
      wasRetryable: error?.isRetryable, url: error?.url,
      responseBody: typeof error?.responseBody === 'string' ? error.responseBody.slice(0, 5000) : error?.responseBody,
      stack: error?.stack,
    });
    if (error && typeof error === 'object') error.isRetryable = false; // no automatic retries
  };

  return {
    specificationVersion: 'v3',
    wrapGenerate: async ({ doGenerate }) => {
      const id = ++_callCount;
      const startedAt = Date.now();
      let result;
      try {
        result = await doGenerate();
      } catch (error) {
        recordError(id, 'generate', startedAt, error);
        throw error;
      }
      const parts = result.content || [];
      trace(`\n===== [${modelId} call ${id}] generate =====\n`);
      for (const p of parts) {
        if (p.type === 'reasoning') trace(`--- thinking ---\n${p.text}\n`);
        else if (p.type === 'text') trace(`--- text ---\n${p.text}\n`);
        else if (p.type === 'tool-call') trace(`--- tool call: ${p.toolName} ${p.input}\n`);
      }
      recordEnd(id, 'generate', startedAt, result.finishReason, result.usage,
        parts.filter(p => p.type === 'text').map(p => p.text).join(''),
        parts.filter(p => p.type === 'reasoning').map(p => p.text).join(''),
        parts.filter(p => p.type === 'tool-call').length, []);
      return result;
    },
    wrapStream: async ({ doStream }) => {
      const id = ++_callCount;
      const startedAt = Date.now();
      let result;
      try {
        result = await doStream();
      } catch (error) {
        recordError(id, 'stream', startedAt, error);
        throw error;
      }
      let text = '', reasoning = '', toolCalls = 0, finishReason = null, usage = null;
      trace(`\n===== [${modelId} call ${id}] stream =====\n`);
      const errors = [];
      const stream = result.stream.pipeThrough(new TransformStream({
        transform(part, controller) {
          if (part.type === 'text-delta') { text += part.delta ?? ''; trace(part.delta ?? ''); }
          else if (part.type === 'reasoning-delta') { reasoning += part.delta ?? ''; trace(part.delta ?? ''); }
          else if (part.type === 'reasoning-start') trace('\n--- thinking ---\n');
          else if (part.type === 'text-start') trace('\n--- text ---\n');
          else if (part.type === 'tool-call') { toolCalls++; trace(`\n--- tool call: ${part.toolName} ${part.input}\n`); }
          else if (part.type === 'finish') { finishReason = part.finishReason; usage = part.usage; }
          else if (part.type === 'error') { errors.push(String(part.error?.message ?? JSON.stringify(part.error))); trace(`\n!!! stream error: ${errors[errors.length - 1]}\n`); }
          controller.enqueue(part);
        },
        flush() {
          recordEnd(id, 'stream', startedAt, finishReason ?? 'no-finish-event', usage, text, reasoning, toolCalls, errors);
        },
      }));
      return { ...result, stream };
    },
  };
}

export function getAnthropic() {
  // If llama-server is configured, use Chat Completions API directly.
  // AI SDK v6 defaults to /v1/responses (Responses API), but llama-server only
  // implements /v1/chat/completions. Returning openaiProvider.chat() forces the
  // SDK to use Chat Completions for both generateText and streamText.
  if (_llamaServerURL) {
    const llamaBase = _llamaServerURL;
    const openaiProvider = createOpenAI({
      baseURL: llamaBase,
      apiKey: 'not-needed',
      fetch: async (url, init) => {
        const agent = new Agent({ headersTimeout: 0, bodyTimeout: 0 });
        let body;
        try { body = init?.body ? JSON.parse(init.body) : null; } catch { body = null; }

        // streamText sends stream:true — pass through directly so the SDK gets real SSE.
        if (!body || body.stream) {
          return undiciFetch(url, { ...init, dispatcher: agent });
        }

        // generateText sends stream:false — force streaming to avoid blocking the server
        // slot on dropped connections, then reassemble into a plain JSON response.
        body.stream = true;
        const tokenLimit = body.max_tokens || body.max_completion_tokens;
        if (tokenLimit && tokenLimit > 0) body.n_predict = tokenLimit;
        const response = await undiciFetch(url, { ...init, body: JSON.stringify(body), dispatcher: agent });
        if (!response.ok) return response;
        const json = await _parseOpenAISSE(response);
        return new Response(JSON.stringify(json), {
          status: 200,
          statusText: 'OK',
          headers: { 'content-type': 'application/json' },
        });
      },
    });
    // .chat() bypasses the Responses API path entirely — uses /v1/chat/completions
    return (modelId, opts) => wrapLanguageModel({ model: openaiProvider.chat(modelId, opts), middleware: recordingMiddleware(modelId) });
  }

  const apiKey = _customConfig?.apiKey || process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    throw new Error(
      "Anthropic API key not found. Set ANTHROPIC_API_KEY in your environment variables.",
    );
  }

  const opts = { apiKey };

  // Non-streaming Opus 5.5 turns send no headers until done; undici's default 300s headers timeout kills them.
  const noTimeoutAgent = new Agent({ headersTimeout: 0, bodyTimeout: 0 });
  opts.fetch = (url, init) => undiciFetch(url, { ...init, dispatcher: noTimeoutAgent });

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

  const anthropic = createAnthropic(opts);
  // Opus 5.5 always thinks; effort is the only depth control and its API default is `medium`.
  return (modelId, settings) => {
    const model = anthropic(modelId, settings);
    // Top-level cache_control = automatic prompt caching: each request caches up to its newest
    // block, so every step of a tool loop reads the earlier conversation from cache.
    const anthropicDefaults = { cacheControl: { type: 'ephemeral' } };
    if (modelId.includes('claude-opus-5-5')) {
      Object.assign(anthropicDefaults, { effort: 'medium', thinking: { type: 'adaptive', display: 'summarized' } });
    }
    return wrapLanguageModel({
      model,
      middleware: [defaultSettingsMiddleware({ settings: { providerOptions: { anthropic: anthropicDefaults } } }), recordingMiddleware(modelId)],
    });
  };
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

/**
 * Consume an OpenAI-compatible SSE stream and return a plain non-streaming response object.
 */
async function _parseOpenAISSE(response) {
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  let content = '';
  let promptTokens = 0, completionTokens = 0;
  let finishReason = null, model = '';

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
      let chunk;
      try { chunk = JSON.parse(raw); } catch (_) { continue; }

      if (chunk.model) model = chunk.model;
      const delta = chunk.choices?.[0]?.delta?.content;
      if (delta) content += delta;
      if (chunk.choices?.[0]?.finish_reason) finishReason = chunk.choices[0].finish_reason;
      if (chunk.usage) {
        promptTokens = chunk.usage.prompt_tokens ?? promptTokens;
        completionTokens = chunk.usage.completion_tokens ?? completionTokens;
      }
    }
  }

  return {
    id: `chatcmpl-local`,
    object: 'chat.completion',
    model,
    choices: [{ index: 0, message: { role: 'assistant', content }, finish_reason: finishReason }],
    usage: { prompt_tokens: promptTokens, completion_tokens: completionTokens, total_tokens: promptTokens + completionTokens },
  };
}


export function getModel(defaultModel) {
  // llama-server serves a single model; use a generic identifier
  if (_llamaServerURL) return _customConfig?.model || 'local-model';
  return _customConfig?.model || defaultModel;
}

const KNOWN_ANTHROPIC_MODELS = ['claude-opus-4-8', 'claude-opus-4-7', 'claude-opus-4-6', 'claude-sonnet-4-6', 'claude-haiku-4-5'];

export function supportsAnthropicSamplingParams(defaultModel = 'claude-opus-5-5') {
  if (_llamaServerURL) return true;
  return KNOWN_ANTHROPIC_MODELS.some(m => getModel(defaultModel).includes(m));
}

/** Returns true only for models that support Anthropic context management features. */
export function supportsContextManagement() {
  if (_llamaServerURL) return false;  // llama-server doesn't support cache control
  return !getModel('claude-opus-5-5').includes('haiku');
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
