'use strict';
/**
 * TANGAZO - model router.
 *
 * Every agent and the campaign pipeline call this, never a vendor directly, so
 * switching provider changes nothing downstream. Each provider keeps its own
 * key and model, so you can flip between them without re-pasting anything.
 */

const anthropic = require('./claude');
const openai = require('./openai');

const PROVIDERS = {
  anthropic: {
    id: 'anthropic',
    name: 'Anthropic (Claude)',
    driver: anthropic,
    defaultModel: 'claude-sonnet-4-5',
    keyUrl: 'https://console.anthropic.com/settings/keys',
    keyHint: 'Starts with sk-ant-',
    modelHint: 'e.g. claude-sonnet-4-5, claude-opus-4-1, claude-haiku-4-5',
    needsBaseUrl: false
  },
  openai: {
    id: 'openai',
    name: 'OpenAI (ChatGPT)',
    driver: openai,
    defaultModel: 'gpt-4.1',
    keyUrl: 'https://platform.openai.com/api-keys',
    keyHint: 'Starts with sk-',
    modelHint: 'e.g. gpt-4.1, gpt-4o, gpt-4o-mini',
    needsBaseUrl: false
  },
  compatible: {
    id: 'compatible',
    name: 'Other (OpenAI-compatible)',
    driver: openai,
    defaultModel: '',
    keyUrl: '',
    keyHint: 'Whatever key that service issued you',
    modelHint: 'The exact model id that service expects',
    baseUrlHint: 'e.g. https://openrouter.ai/api/v1  ·  https://api.deepseek.com/v1  ·  https://api.groq.com/openai/v1',
    needsBaseUrl: true
  }
};

const DEFAULT_PROVIDER = 'anthropic';

function listProviders() {
  return Object.keys(PROVIDERS).map(id => {
    const p = PROVIDERS[id];
    return {
      id,
      name: p.name,
      defaultModel: p.defaultModel,
      keyUrl: p.keyUrl,
      keyHint: p.keyHint,
      modelHint: p.modelHint,
      baseUrlHint: p.baseUrlHint || '',
      needsBaseUrl: p.needsBaseUrl
    };
  });
}

/** Pull the active provider's config out of the settings object. */
function activeConfig(settings, overrideProviderId) {
  const id = overrideProviderId || settings.provider || DEFAULT_PROVIDER;
  const spec = PROVIDERS[id];
  if (!spec) throw new Error('Unknown provider: ' + id);
  const cfg = (settings.providers && settings.providers[id]) || {};
  return {
    id,
    spec,
    apiKey: cfg.apiKey || '',
    model: cfg.model || spec.defaultModel,
    baseUrl: cfg.baseUrl || null
  };
}

function describe(settings) {
  const c = activeConfig(settings);
  return { provider: c.id, providerName: c.spec.name, model: c.model, hasKey: !!c.apiKey };
}

function assertReady(settings) {
  const c = activeConfig(settings);
  if (!c.apiKey) {
    throw new Error('No API key set for ' + c.spec.name + '. Open Settings and paste your key, or switch provider.');
  }
  if (!c.model) {
    throw new Error('No model set for ' + c.spec.name + '. Open Settings and enter a model name.');
  }
  if (c.spec.needsBaseUrl && !c.baseUrl) {
    throw new Error('This provider needs an API base URL. Open Settings and enter it.');
  }
  return c;
}

/** Plain text completion through whichever provider is active. */
async function complete(settings, opts) {
  const c = assertReady(settings);
  return c.spec.driver.complete(Object.assign({}, opts, {
    apiKey: c.apiKey,
    model: c.model,
    baseUrl: c.baseUrl
  }));
}

/** JSON completion. Each driver uses its own trick to guarantee valid JSON. */
async function completeJson(settings, opts) {
  const c = assertReady(settings);
  return c.spec.driver.completeJson(Object.assign({}, opts, {
    apiKey: c.apiKey,
    model: c.model,
    baseUrl: c.baseUrl
  }));
}

/** Test a key without saving it as the active provider. */
async function testKey({ provider, apiKey, model, baseUrl }) {
  const spec = PROVIDERS[provider || DEFAULT_PROVIDER];
  if (!spec) throw new Error('Unknown provider: ' + provider);
  if (!apiKey) throw new Error('Paste an API key first.');
  return spec.driver.testKey(apiKey, model || spec.defaultModel, baseUrl || null);
}

module.exports = {
  PROVIDERS, DEFAULT_PROVIDER,
  listProviders, activeConfig, describe, assertReady,
  complete, completeJson, testKey
};
