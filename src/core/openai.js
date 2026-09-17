'use strict';
/**
 * TANGAZO - OpenAI driver (also drives any OpenAI-compatible endpoint:
 * OpenRouter, DeepSeek, Groq, Together, a local server, ...).
 *
 * Runs in the Electron main process. Shares the JSON repair logic with the
 * Anthropic driver so a truncated reply is salvaged the same way either way.
 */

const { parseJsonLoose, ApiError } = require('./claude');

const DEFAULT_BASE = 'https://api.openai.com/v1';

function chatUrl(baseUrl) {
  const base = (baseUrl || DEFAULT_BASE).replace(/\/+$/, '');
  // Accept either ".../v1" or the full ".../v1/chat/completions"
  if (/\/chat\/completions$/.test(base)) return base;
  return base + '/chat/completions';
}

/**
 * @param {object} opts
 * @param {string} opts.apiKey
 * @param {string} opts.model
 * @param {string} [opts.system]
 * @param {string} opts.prompt
 * @param {number} [opts.maxTokens]
 * @param {number} [opts.temperature]
 * @param {string} [opts.baseUrl]   for OpenAI-compatible providers
 * @param {boolean} [opts.json]     ask the API to guarantee valid JSON
 */
async function complete(opts) {
  const {
    apiKey, model, system, prompt,
    maxTokens = 8000, temperature = 1,
    baseUrl = null, json = false, signal = null
  } = opts;

  if (!apiKey) throw new ApiError('No API key set. Open Settings and paste your key.', 0, null);
  if (!model) throw new ApiError('No model set. Open Settings and enter a model name.', 0, null);

  const messages = [];
  if (system) messages.push({ role: 'system', content: system });
  messages.push({ role: 'user', content: prompt });

  // Model families differ on two parameters, and the API rejects the wrong one
  // outright. Rather than maintain a list of which model wants which - a list
  // that goes stale every few months - start with the common form and let the
  // error tell us to switch.
  const variants = [
    { tokenField: 'max_tokens', sendTemperature: true },
    { tokenField: 'max_completion_tokens', sendTemperature: true },
    { tokenField: 'max_completion_tokens', sendTemperature: false }
  ];

  let lastErr = null;

  for (let v = 0; v < variants.length; v++) {
    const variant = variants[v];
    const body = { model, messages };
    body[variant.tokenField] = maxTokens;
    if (variant.sendTemperature) body.temperature = temperature;
    if (json) body.response_format = { type: 'json_object' };

    try {
      return await send(body, apiKey, baseUrl, signal);
    } catch (err) {
      lastErr = err;
      const m = String(err.message || '').toLowerCase();

      // "Unsupported parameter: 'max_tokens' ... use 'max_completion_tokens'"
      if (v === 0 && /max_completion_tokens|unsupported parameter.*max_tokens/.test(m)) continue;
      // "Unsupported value: 'temperature' does not support 0.7 ..."
      if (v === 1 && /temperature/.test(m) && /unsupported|does not support|not supported/.test(m)) continue;
      // response_format unsupported on some compatible endpoints - retry without it
      if (json && /response_format|json_object/.test(m)) {
        return complete(Object.assign({}, opts, { json: false }));
      }
      throw err;
    }
  }

  throw lastErr;
}

async function send(body, apiKey, baseUrl, signal, tryNo) {
  tryNo = tryNo || 0;
  let res;
  try {
    res = await fetch(chatUrl(baseUrl), {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'authorization': 'Bearer ' + apiKey
      },
      body: JSON.stringify(body),
      signal
    });
  } catch (netErr) {
    if (netErr.name === 'AbortError') throw netErr;
    throw new ApiError('Network error reaching the API: ' + netErr.message, 0, null);
  }

  if ((res.status === 429 || res.status >= 500) && tryNo < 4) {
    const wait = Math.min(30000, 1500 * Math.pow(2, tryNo));
    await new Promise(r => setTimeout(r, wait));
    return send(body, apiKey, baseUrl, signal, tryNo + 1);
  }

  const text = await res.text();
  if (!res.ok) {
    let msg = 'API error ' + res.status;
    try {
      const j = JSON.parse(text);
      if (j.error && j.error.message) msg = j.error.message;
      else if (j.message) msg = j.message;
    } catch (_) { if (text) msg += ': ' + text.slice(0, 400); }
    throw new ApiError(msg, res.status, text);
  }

  let json;
  try { json = JSON.parse(text); }
  catch (_) { throw new ApiError('The API returned a response that is not JSON.', res.status, text.slice(0, 400)); }

  const choice = (json.choices || [])[0];
  if (!choice) throw new ApiError('The API returned no completion.', res.status, text.slice(0, 400));

  const content = choice.message && choice.message.content;
  if (typeof content === 'string') return content;
  // Some compatible endpoints return content as an array of parts.
  if (Array.isArray(content)) {
    return content.map(p => (typeof p === 'string' ? p : (p.text || ''))).join('');
  }
  if (choice.finish_reason === 'length') {
    throw new ApiError('The reply was cut off before any text came back. Lower "Max tokens per call" or ask for less content.', res.status, null);
  }
  return '';
}

async function completeJson(opts) {
  const raw = await complete(Object.assign({}, opts, { json: true }));
  return parseJsonLoose(raw);
}

async function testKey(apiKey, model, baseUrl) {
  const reply = await complete({
    apiKey,
    model: model || 'gpt-4.1',
    prompt: 'Reply with exactly the word: OK',
    maxTokens: 16,
    temperature: 0,
    baseUrl
  });
  return { ok: /ok/i.test(reply), reply: String(reply).trim() };
}

module.exports = { complete, completeJson, testKey, chatUrl, DEFAULT_BASE };
