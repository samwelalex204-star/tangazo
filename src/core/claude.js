'use strict';
/**
 * TANGAZO - Claude API client.
 * Runs in the Electron main process so the API key never touches the renderer
 * and there is no browser CORS to fight with.
 */

const API_URL = 'https://api.anthropic.com/v1/messages';
const API_VERSION = '2023-06-01';

class ApiError extends Error {
  constructor(message, status, body) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.body = body;
  }
}

/**
 * Send one message to Claude.
 * @param {object} opts
 * @param {string} opts.apiKey
 * @param {string} opts.model
 * @param {string} opts.system        system prompt
 * @param {string} opts.prompt        user message
 * @param {number} [opts.maxTokens]
 * @param {number} [opts.temperature]
 * @param {string} [opts.prefill]     assistant prefill, e.g. '{' to force JSON
 * @returns {Promise<string>} the text of the reply (prefill prepended)
 */
async function complete(opts) {
  const {
    apiKey, model, system, prompt,
    maxTokens = 8000, temperature = 1, prefill = null, signal = null
  } = opts;

  if (!apiKey) throw new ApiError('No Anthropic API key set. Open Settings and paste your key.', 0, null);

  const messages = [{ role: 'user', content: prompt }];
  if (prefill) messages.push({ role: 'assistant', content: prefill });

  const body = {
    model,
    max_tokens: maxTokens,
    temperature,
    messages
  };
  if (system) body.system = system;

  const attempt = async (tryNo) => {
    let res;
    try {
      res = await fetch(API_URL, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'x-api-key': apiKey,
          'anthropic-version': API_VERSION
        },
        body: JSON.stringify(body),
        signal
      });
    } catch (netErr) {
      if (netErr.name === 'AbortError') throw netErr;
      throw new ApiError('Network error reaching the Claude API: ' + netErr.message, 0, null);
    }

    if (res.status === 429 || res.status >= 500) {
      if (tryNo < 4) {
        const wait = Math.min(30000, 1500 * Math.pow(2, tryNo));
        await new Promise(r => setTimeout(r, wait));
        return attempt(tryNo + 1);
      }
    }

    const text = await res.text();
    if (!res.ok) {
      let msg = 'Claude API error ' + res.status;
      try {
        const j = JSON.parse(text);
        if (j.error && j.error.message) msg = j.error.message;
      } catch (_) { if (text) msg += ': ' + text.slice(0, 400); }
      throw new ApiError(msg, res.status, text);
    }

    const json = JSON.parse(text);
    const out = (json.content || [])
      .filter(b => b.type === 'text')
      .map(b => b.text)
      .join('');
    return (prefill || '') + out;
  };

  return attempt(0);
}

/**
 * Ask Claude for JSON and parse it reliably.
 * Uses an assistant prefill so the reply starts inside the object, then repairs
 * the common failure modes (fences, trailing prose, truncation).
 */
async function completeJson(opts) {
  const raw = await complete(Object.assign({}, opts, { prefill: '{' }));
  return parseJsonLoose(raw);
}

function parseJsonLoose(raw) {
  let s = String(raw).trim();

  // strip code fences if the model added them anyway
  s = s.replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/i, '').trim();

  try { return JSON.parse(s); } catch (_) {}

  // take from the first { to the last }
  const first = s.indexOf('{');
  const last = s.lastIndexOf('}');
  if (first !== -1 && last > first) {
    const slice = s.slice(first, last + 1);
    try { return JSON.parse(slice); } catch (_) {}
  }

  // try to close an object that got truncated mid-generation
  const repaired = repairTruncatedJson(s);
  if (repaired) {
    try { return JSON.parse(repaired); } catch (_) {}
  }

  const err = new Error('Claude returned something that is not valid JSON. Try again, or lower the amount of content requested.');
  err.raw = s.slice(0, 2000);
  throw err;
}

function repairTruncatedJson(s) {
  const start = s.indexOf('{');
  if (start === -1) return null;
  let out = '';
  let depth = 0;
  let inStr = false;
  let esc = false;
  let lastSafe = -1;

  for (let i = start; i < s.length; i++) {
    const c = s[i];
    out += c;
    if (inStr) {
      if (esc) esc = false;
      else if (c === '\\') esc = true;
      else if (c === '"') inStr = false;
      continue;
    }
    if (c === '"') { inStr = true; continue; }
    if (c === '{' || c === '[') depth++;
    else if (c === '}' || c === ']') { depth--; if (depth === 0) lastSafe = out.length; }
    else if (c === ',' && depth > 0) lastSafe = out.length - 1;
  }

  if (depth <= 0) return out;

  // Drop the half-written tail back to the last position that was structurally
  // safe (end of a complete element, or just before a separating comma).
  if (lastSafe > 0) out = out.slice(0, lastSafe);

  // Re-scan the trimmed text to see what is genuinely still open. Do not reuse
  // the state from the first pass - the tail it described has just been cut off.
  const stack = [];
  let open = false, escaped = false;
  for (const c of out) {
    if (open) {
      if (escaped) escaped = false;
      else if (c === '\\') escaped = true;
      else if (c === '"') open = false;
      continue;
    }
    if (c === '"') open = true;
    else if (c === '{') stack.push('}');
    else if (c === '[') stack.push(']');
    else if (c === '}' || c === ']') stack.pop();
  }
  if (open) out += '"';
  out = out.replace(/,\s*$/, '');
  while (stack.length) out += stack.pop();
  return out;
}

async function testKey(apiKey, model) {
  const reply = await complete({
    apiKey,
    model: model || 'claude-sonnet-4-5',
    prompt: 'Reply with exactly the word: OK',
    maxTokens: 16,
    temperature: 0
  });
  return { ok: /ok/i.test(reply), reply: reply.trim() };
}

module.exports = { complete, completeJson, parseJsonLoose, testKey, ApiError };
