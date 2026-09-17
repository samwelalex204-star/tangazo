'use strict';
/**
 * TANGAZO self-check. Runs without Electron and without an API key.
 *   node tools/check.js
 * Exercises the store, the brand brain, every agent prompt, the calendar
 * normaliser, every exporter, the webhook payload and the JSON repair.
 */

const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');

let pass = 0, fail = 0;
function test(name, fn) {
  try { fn(); pass++; console.log('  ok   ' + name); }
  catch (err) { fail++; console.log('  FAIL ' + name + '\n       ' + err.message); }
}

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'tangazo-check-'));

const store = require('../src/core/store');
const brands = require('../src/core/brands');
const agents = require('../src/core/agents');
const pipeline = require('../src/core/pipeline');
const exporters = require('../src/core/exporters');
const publisher = require('../src/core/publisher');
const claude = require('../src/core/claude');
const openai = require('../src/core/openai');
const llm = require('../src/core/llm');

console.log('\nTANGAZO self-check\n');

/* ------------------------------------------------------------------ store */
console.log('store');
store.init(tmp, null);

test('starts empty', () => {
  assert.strictEqual(store.getDb().brands.length, 0);
});

let zora;
test('inserts and reads back a brand', () => {
  zora = store.insert('brands', brands.zoraSeed());
  assert.ok(zora.id);
  assert.strictEqual(store.find('brands').length, 1);
  assert.strictEqual(store.findOne('brands', zora.id).name, 'Zora Holdings');
});

test('updates a brand', () => {
  const u = store.update('brands', zora.id, { tagline: 'changed' });
  assert.strictEqual(u.tagline, 'changed');
  assert.ok(u.updatedAt);
});

test('persists to disk and reloads', () => {
  store.loadDb();
  assert.strictEqual(store.find('brands').length, 1);
  assert.strictEqual(store.findOne('brands', zora.id).tagline, 'changed');
});

test('survives a corrupted file', () => {
  fs.writeFileSync(path.join(tmp, 'tangazo.json'), '{ this is not json');
  const db = store.loadDb();
  assert.ok(Array.isArray(db.brands));
  // restore for the rest of the run
  store.saveDb(Object.assign(db, { brands: [zora] }));
});

test('settings round-trip without safeStorage', () => {
  store.saveSettings({
    providers: { anthropic: { apiKey: 'sk-ant-test', model: 'claude-sonnet-4-5' } },
    webhookUrl: 'https://example.com/hook'
  });
  const s = store.getSettings();
  assert.strictEqual(s.providers.anthropic.apiKey, 'sk-ant-test');
  assert.strictEqual(s.webhookUrl, 'https://example.com/hook');
});

test('saving one provider does not wipe another', () => {
  store.saveSettings({ providers: { openai: { apiKey: 'sk-openai-test', model: 'gpt-4.1' } } });
  const s = store.getSettings();
  assert.strictEqual(s.providers.openai.apiKey, 'sk-openai-test');
  assert.strictEqual(s.providers.anthropic.apiKey, 'sk-ant-test', 'the Claude key was lost');
});

test('both keys survive a reload from disk', () => {
  store.loadSettings();
  const s = store.getSettings();
  assert.strictEqual(s.providers.anthropic.apiKey, 'sk-ant-test');
  assert.strictEqual(s.providers.openai.apiKey, 'sk-openai-test');
});

test('switching the active provider keeps every key', () => {
  store.saveSettings({ provider: 'openai' });
  const s = store.getSettings();
  assert.strictEqual(s.provider, 'openai');
  assert.strictEqual(s.providers.anthropic.apiKey, 'sk-ant-test');
  store.saveSettings({ provider: 'anthropic' });
});

test('an unknown provider falls back instead of breaking', () => {
  store.saveSettings({ provider: 'nonsense-provider' });
  assert.strictEqual(store.getSettings().provider, 'anthropic');
});

test('settings from the single-provider version are migrated', () => {
  const fs2 = require('fs');
  fs2.writeFileSync(path.join(tmp, 'settings.json'), JSON.stringify({
    apiKey: 'sk-ant-legacy', model: 'claude-3-5-sonnet', maxTokens: 4000, webhookUrl: 'https://old.example/hook'
  }));
  const s = store.loadSettings();
  assert.strictEqual(s.providers.anthropic.apiKey, 'sk-ant-legacy', 'legacy key not carried over');
  assert.strictEqual(s.providers.anthropic.model, 'claude-3-5-sonnet', 'legacy model not carried over');
  assert.strictEqual(s.maxTokens, 4000);
  assert.strictEqual(s.webhookUrl, 'https://old.example/hook');
  assert.ok(!('apiKey' in s), 'legacy top-level key should be removed');
  assert.ok(s.providers.openai, 'openai provider missing after migration');
  // restore for later tests
  store.saveSettings({ providers: { anthropic: { apiKey: 'sk-ant-test' }, openai: { apiKey: 'sk-openai-test' } } });
});

test('removes records', () => {
  const junk = store.insert('content', { title: 'x' });
  assert.ok(store.remove('content', junk.id));
  assert.strictEqual(store.find('content').length, 0);
});

/* ------------------------------------------------------------ brand brain */
console.log('\nbrand brain');

test('blank brand has every section', () => {
  const b = brands.blankBrand('Test');
  ['colors', 'fonts', 'tone', 'products', 'personas', 'channels', 'hashtagSets'].forEach(k =>
    assert.ok(k in b, 'missing ' + k));
});

test('Zora seed is populated', () => {
  const b = brands.zoraSeed();
  assert.ok(b.products.length >= 5);
  assert.ok(b.personas.length >= 4);
  assert.ok(b.colors.length >= 3);
  assert.ok(b.voiceRules.length >= 3);
});

test('brandBrief renders the real detail', () => {
  const brief = brands.brandBrief(brands.zoraSeed());
  assert.ok(brief.includes('Zora Holdings'));
  assert.ok(brief.includes('Embossed steel door panels'));
  assert.ok(brief.includes('Hardware shop owner'));
  assert.ok(brief.includes('#C9A227'));
  assert.ok(brief.length > 1500, 'brief too short: ' + brief.length);
});

test('brandBrief tolerates an empty brand', () => {
  const brief = brands.brandBrief(brands.blankBrand('Bare'));
  assert.ok(brief.includes('Bare'));
});

test('activeChannels skips disabled ones', () => {
  const b = brands.blankBrand('x');
  b.channels.tiktok.active = false;
  const list = brands.activeChannels(b);
  assert.ok(!list.includes('tiktok'));
  assert.ok(list.includes('instagram'));
});

/* ----------------------------------------------------------------- agents */
console.log('\nagents');

test('ten agents are registered', () => {
  assert.strictEqual(agents.AGENT_ORDER.length, 10);
  agents.AGENT_ORDER.forEach(id => assert.ok(agents.AGENTS[id], 'missing ' + id));
});

test('every agent builds a prompt with the brand embedded', () => {
  const b = brands.zoraSeed();
  const sample = {
    goal: 'g', brief: 'b', topic: 't', subject: 's', theme: 'th',
    offer: 'o', data: 'd', asset: 'a', segments: 'x', competitors: 'c',
    count: 5, days: 30
  };
  for (const id of agents.AGENT_ORDER) {
    const { system, prompt } = agents.buildPrompt(id, b, sample);
    assert.ok(system.includes('BRAND BRIEF'), id + ': no brand brief');
    assert.ok(system.includes('Zora Holdings'), id + ': brand missing');
    assert.ok(prompt.includes('Return JSON') || prompt.includes('Return JSON:'), id + ': no JSON contract');
    assert.ok(prompt.length > 150, id + ': prompt too short');
  }
});

test('unknown agent throws', () => {
  assert.throws(() => agents.buildPrompt('nope', brands.zoraSeed(), {}));
});

test('listAgents exposes inputs for the UI', () => {
  const list = agents.listAgents();
  assert.strictEqual(list.length, 10);
  list.forEach(a => {
    assert.ok(a.name && a.blurb && Array.isArray(a.inputs));
    a.inputs.forEach(i => assert.ok(i.key && i.label && i.type));
  });
});

/* --------------------------------------------------------------- pipeline */
console.log('\npipeline');

test('nextMonday lands on a Monday', () => {
  for (let i = 0; i < 14; i++) {
    const d = new Date(2026, 8, 1 + i);
    assert.strictEqual(pipeline.nextMonday(d).getDay(), 1);
  }
});

test('normaliseSlot fills a missing date from the day number', () => {
  const start = new Date('2026-09-21T09:00:00');
  const s = pipeline.normaliseSlot({ day: 5, channel: 'TikTok', caption: 'hi' }, start);
  assert.strictEqual(s.date, '2026-09-25');
  assert.strictEqual(s.channel, 'tiktok');
  assert.strictEqual(s.time, '09:00');
});

test('normaliseSlot repairs sloppy times', () => {
  const start = new Date('2026-09-21T09:00:00');
  assert.strictEqual(pipeline.normaliseSlot({ day: 1, time: '7pm' }, start).time, '07:00');
  assert.strictEqual(pipeline.normaliseSlot({ day: 1, time: '19.30' }, start).time, '19:30');
  assert.strictEqual(pipeline.normaliseSlot({ day: 1, time: 'lunchtime' }, start).time, '09:00');
  assert.strictEqual(pipeline.normaliseSlot({ day: 1, time: '99:99' }, start).time, '23:59');
});

test('normaliseSlot splits string hashtags', () => {
  const s = pipeline.normaliseSlot({ day: 1, hashtags: '#a #b #c' }, new Date());
  assert.deepStrictEqual(s.hashtags, ['#a', '#b', '#c']);
});

/* ------------------------------------------------------------ json repair */
console.log('\njson handling');

test('parses clean json', () => {
  assert.deepStrictEqual(claude.parseJsonLoose('{"a":1}'), { a: 1 });
});

test('strips code fences', () => {
  assert.deepStrictEqual(claude.parseJsonLoose('```json\n{"a":1}\n```'), { a: 1 });
});

test('ignores trailing prose', () => {
  assert.deepStrictEqual(claude.parseJsonLoose('{"a":1}\n\nHope that helps!'), { a: 1 });
});

test('repairs a truncated array of objects', () => {
  const broken = '{"posts":[{"caption":"one"},{"caption":"two"},{"capt';
  const out = claude.parseJsonLoose(broken);
  assert.ok(Array.isArray(out.posts));
  assert.strictEqual(out.posts.length, 2);
  assert.strictEqual(out.posts[1].caption, 'two');
});

test('repairs truncation inside a string', () => {
  const broken = '{"posts":[{"caption":"a long caption that got cut o';
  const out = claude.parseJsonLoose(broken);
  assert.ok(Array.isArray(out.posts));
});

test('throws clearly on total garbage', () => {
  assert.throws(() => claude.parseJsonLoose('not json at all'), /not valid JSON/);
});

/* ------------------------------------------------------------- providers */
console.log('\nproviders');

test('three providers are offered', () => {
  const list = llm.listProviders();
  assert.strictEqual(list.length, 3);
  assert.deepStrictEqual(list.map(p => p.id).sort(), ['anthropic', 'compatible', 'openai']);
  list.forEach(p => assert.ok(p.name && typeof p.needsBaseUrl === 'boolean'));
});

test('activeConfig reads the active provider', () => {
  const s = {
    provider: 'openai',
    providers: { anthropic: { apiKey: 'a', model: 'am' }, openai: { apiKey: 'o', model: 'om' } }
  };
  const c = llm.activeConfig(s);
  assert.strictEqual(c.id, 'openai');
  assert.strictEqual(c.apiKey, 'o');
  assert.strictEqual(c.model, 'om');
});

test('activeConfig falls back to the provider default model', () => {
  const c = llm.activeConfig({ provider: 'anthropic', providers: { anthropic: { apiKey: 'a' } } });
  assert.strictEqual(c.model, 'claude-sonnet-4-5');
});

test('a missing key is reported with the provider named', () => {
  assert.throws(
    () => llm.assertReady({ provider: 'openai', providers: { openai: { apiKey: '', model: 'gpt-4.1' } } }),
    /OpenAI/
  );
});

test('an OpenAI-compatible provider must have a base URL', () => {
  assert.throws(
    () => llm.assertReady({ provider: 'compatible', providers: { compatible: { apiKey: 'k', model: 'm', baseUrl: '' } } }),
    /base URL/
  );
  assert.doesNotThrow(
    () => llm.assertReady({ provider: 'compatible', providers: { compatible: { apiKey: 'k', model: 'm', baseUrl: 'https://x/v1' } } })
  );
});

test('describe names the engine for the UI', () => {
  const d = llm.describe({ provider: 'openai', providers: { openai: { apiKey: 'o', model: 'gpt-4.1' } } });
  assert.strictEqual(d.provider, 'openai');
  assert.strictEqual(d.model, 'gpt-4.1');
  assert.strictEqual(d.hasKey, true);
  assert.ok(/OpenAI/.test(d.providerName));
});

test('base URLs are normalised', () => {
  assert.strictEqual(openai.chatUrl(null), 'https://api.openai.com/v1/chat/completions');
  assert.strictEqual(openai.chatUrl('https://openrouter.ai/api/v1'), 'https://openrouter.ai/api/v1/chat/completions');
  assert.strictEqual(openai.chatUrl('https://openrouter.ai/api/v1/'), 'https://openrouter.ai/api/v1/chat/completions');
  assert.strictEqual(openai.chatUrl('https://x.y/v1/chat/completions'), 'https://x.y/v1/chat/completions');
});

/* -------------------------------------------- provider calls, mocked wire */

const realFetch = global.fetch;
function mockFetch(handler) { global.fetch = handler; }
function restoreFetch() { global.fetch = realFetch; }

function okChat(text) {
  return {
    ok: true, status: 200,
    text: async () => JSON.stringify({ choices: [{ message: { content: text }, finish_reason: 'stop' }] })
  };
}

/* --------------------------------------------------------------- exports */
console.log('\nexports');

const cal = [
  { day: 1, date: '2026-09-21', time: '09:00', channel: 'instagram', format: 'carousel', pillar: 'Proof', persona: 'Homeowner', title: 'Pattern reveal', hook: 'Your door is the first thing people see', caption: 'Line one\nLine two with a "quote" and a comma, here', hashtags: ['#Tanzania', '#Milango'], cta: 'WhatsApp us', visualBrief: 'Gold panel, hard light', status: 'draft' },
  { day: 2, date: '2026-09-22', time: '19:30', channel: 'tiktok', format: 'reel', pillar: 'Education', persona: 'Fundi', title: 'Install in 60s', hook: 'Fundi, watch this', caption: 'Install clip', hashtags: ['#Fundi'], cta: 'Call us', visualBrief: 'Install timelapse', status: 'draft' }
];

test('master CSV escapes quotes and commas', () => {
  const csv = exporters.masterCsv(cal);
  const lines = csv.split('\r\n');
  assert.strictEqual(lines.length, 3);
  assert.ok(csv.includes('""quote""'), 'quotes not escaped');
  assert.ok(lines[0].startsWith('"day"'));
});

test('Publer CSV has the right headers and rows', () => {
  const csv = exporters.publerCsv(cal);
  assert.ok(csv.startsWith('"Date","Time","Content"'));
  assert.strictEqual(csv.split('\r\n').length, 3);
  assert.ok(csv.includes('#Tanzania #Milango'), 'hashtags not appended');
});

test('Buffer CSV joins date and time', () => {
  assert.ok(exporters.bufferCsv(cal).includes('2026-09-22 19:30'));
});

test('Metricool CSV maps networks', () => {
  const csv = exporters.metricoolCsv(cal);
  assert.ok(csv.startsWith('"text","date","hour","networks"'));
  assert.ok(csv.includes('"tiktok"'));
});

test('ICS is well formed', () => {
  const ics = exporters.toIcs(cal, 'Test campaign');
  assert.ok(ics.startsWith('BEGIN:VCALENDAR'));
  assert.ok(ics.trimEnd().endsWith('END:VCALENDAR'));
  assert.strictEqual((ics.match(/BEGIN:VEVENT/g) || []).length, 2);
  assert.ok(ics.includes('DTSTART:20260921T090000'));
  assert.ok(ics.includes('\\n'), 'newlines not escaped');
});

test('campaign pack renders every section it is given', () => {
  const campaign = {
    name: 'Panel Drop',
    data: {
      brief: '400 panels', days: 30, startDate: '2026-09-21', endDate: '2026-10-20',
      calendar: cal,
      strategy: { situation: 's', objective: 'Sell 400 panels', positioning: 'p', bigIdea: { name: 'Drop', premise: 'x' }, messagingPillars: [{ pillar: 'Stock', proof: 'in country' }], kpis: [{ metric: 'leads', target: '200' }], quickWins: ['post today'] },
      campaign: {
        campaignName: 'Panel Drop',
        phases: [{ phase: 'Launch', days: '1-7', goal: 'awareness', keyMessage: 'it landed' }],
        audiences: [{ persona: 'Fundi', channel: 'tiktok', share: '40%', message: 'stock now' }],
        assetsNeeded: [{ asset: 'panel photos', quantity: 12, owner: 'design' }],
        whatsappSequence: [{ day: 1, segment: 'shops', message: 'Habari, panels zimefika.' }],
        salesScripts: [{ scenario: 'walk-in', script: 'Karibu...' }],
        faqs: [{ q: 'Will it rust?', a: 'Coated steel.' }],
        successMetrics: [{ metric: 'sales', target: '400' }]
      },
      creatives: { prompts: [{ title: 'Hero', kind: 'product photo', aspect: '4:5', imagePrompt: 'a gold embossed steel door panel', headline: 'It landed' }] },
      ads: { ads: [{ concept: 'Stock now', platform: 'Meta', objective: 'messages', audience: { locations: ['Dar es Salaam'], interests: ['construction'] }, headlines: ['In stock today'], primaryTexts: ['400 panels just landed.'], cta: 'Send Message', landingOrDestination: 'WhatsApp', creativeBrief: 'panel close-up' }] }
    }
  };
  const md = exporters.campaignPack(campaign, brands.zoraSeed());
  ['Panel Drop', 'Sell 400 panels', 'Content calendar', 'Full captions', 'Creative prompts',
   'Ad sets', 'WhatsApp sequence', 'Sales scripts', 'Customer FAQs'].forEach(section =>
    assert.ok(md.includes(section), 'pack missing: ' + section));
  assert.ok(md.includes('| 1 | 2026-09-21 |'), 'calendar table row missing');
});

test('whatsapp export produces copyable blocks', () => {
  const txt = exporters.whatsappTxt({ data: { campaign: { whatsappSequence: [{ day: 1, segment: 'shops', message: 'Habari' }] } } });
  assert.ok(txt.includes('=== DAY 1 - shops ==='));
  assert.ok(txt.includes('Habari'));
});

test('exporters survive an empty campaign', () => {
  assert.doesNotThrow(() => {
    exporters.masterCsv([]);
    exporters.publerCsv([]);
    exporters.toIcs([], 'empty');
    exporters.campaignPack({ name: 'Empty', data: {} }, null);
    exporters.whatsappTxt({ data: {} });
  });
});

/* -------------------------------------------------------------- publisher */
console.log('\npublisher');

test('enqueue turns calendar slots into queue rows', () => {
  const rows = publisher.enqueue(cal, { campaignId: 'c1', brandId: zora.id, brandName: 'Zora Holdings', campaignName: 'Panel Drop' });
  assert.strictEqual(rows.length, 2);
  assert.strictEqual(rows[0].status, 'queued');
  assert.strictEqual(rows[0].attempts, 0);
  assert.ok(rows[0].scheduledAt.includes('2026-09-21'));
  assert.strictEqual(store.find('queue').length, 2);
});

test('webhook payload carries everything the scheduler needs', () => {
  const item = store.find('queue')[0];
  const p = publisher.payloadFor(item);
  ['id', 'source', 'brand', 'channel', 'scheduledAt', 'caption', 'hashtags', 'text', 'mediaUrl'].forEach(k =>
    assert.ok(k in p, 'payload missing ' + k));
  assert.strictEqual(p.source, 'TANGAZO');
  assert.ok(p.text.includes('#Tanzania'), 'hashtags not in text');
});

async function testAsync(name, fn) {
  try { await fn(); pass++; console.log('  ok   ' + name); }
  catch (err) { fail++; console.log('  FAIL ' + name + '\n       ' + err.message); }
}

/* ----------------------------------------------------------------- wrap */

(async () => {
  await testAsync('tick does nothing while auto-publish is off', async () => {
    store.saveSettings({ autoPublish: false });
    const r = await publisher.tick();
    assert.strictEqual(r.skipped, true);
  });

  await testAsync('publishing refuses a non-https webhook', async () => {
    store.saveSettings({ autoPublish: true, webhookUrl: 'http://insecure.example.com/hook' });
    const item = store.find('queue')[0];
    const after = await publisher.publishNow(item.id);
    assert.strictEqual(after.status, 'failed');
    assert.ok(/https/.test(after.lastError), 'expected an https complaint, got: ' + after.lastError);
    store.saveSettings({ autoPublish: false, webhookUrl: '' });
  });

  await testAsync('claude client refuses to call without a key', async () => {
    await assert.rejects(
      () => claude.complete({ apiKey: '', model: 'x', prompt: 'hi' }),
      /API key/
    );
  });

  console.log('\nprovider calls (mocked)');

  await testAsync('OpenAI request carries system, user and the JSON contract', async () => {
    let seen = null, url = null;
    mockFetch(async (u, o) => { url = u; seen = JSON.parse(o.body); return okChat('{"a":1}'); });
    try {
      const out = await openai.completeJson({ apiKey: 'k', model: 'gpt-4.1', system: 'SYS', prompt: 'Return JSON' });
      assert.deepStrictEqual(out, { a: 1 });
      assert.strictEqual(url, 'https://api.openai.com/v1/chat/completions');
      assert.strictEqual(seen.model, 'gpt-4.1');
      assert.strictEqual(seen.messages[0].role, 'system');
      assert.strictEqual(seen.messages[0].content, 'SYS');
      assert.strictEqual(seen.messages[1].role, 'user');
      assert.deepStrictEqual(seen.response_format, { type: 'json_object' });
    } finally { restoreFetch(); }
  });

  await testAsync('OpenAI-compatible endpoints get the custom base URL', async () => {
    let url = null;
    mockFetch(async (u) => { url = u; return okChat('{"ok":true}'); });
    try {
      await openai.completeJson({ apiKey: 'k', model: 'deepseek-chat', prompt: 'Return JSON', baseUrl: 'https://api.deepseek.com/v1' });
      assert.strictEqual(url, 'https://api.deepseek.com/v1/chat/completions');
    } finally { restoreFetch(); }
  });

  await testAsync('retries with max_completion_tokens when max_tokens is rejected', async () => {
    const bodies = [];
    mockFetch(async (_u, o) => {
      const b = JSON.parse(o.body);
      bodies.push(b);
      if ('max_tokens' in b) {
        return {
          ok: false, status: 400,
          text: async () => JSON.stringify({ error: { message: "Unsupported parameter: 'max_tokens' is not supported with this model. Use 'max_completion_tokens' instead." } })
        };
      }
      return okChat('{"recovered":true}');
    });
    try {
      const out = await openai.completeJson({ apiKey: 'k', model: 'some-new-model', prompt: 'Return JSON' });
      assert.deepStrictEqual(out, { recovered: true });
      assert.strictEqual(bodies.length, 2);
      assert.ok('max_completion_tokens' in bodies[1]);
    } finally { restoreFetch(); }
  });

  await testAsync('drops temperature when the model refuses it', async () => {
    const bodies = [];
    mockFetch(async (_u, o) => {
      const b = JSON.parse(o.body);
      bodies.push(b);
      if ('max_tokens' in b) {
        return { ok: false, status: 400, text: async () => JSON.stringify({ error: { message: "Unsupported parameter: 'max_tokens'. Use 'max_completion_tokens'." } }) };
      }
      if ('temperature' in b) {
        return { ok: false, status: 400, text: async () => JSON.stringify({ error: { message: "Unsupported value: 'temperature' does not support 1 with this model." } }) };
      }
      return okChat('{"fine":true}');
    });
    try {
      const out = await openai.completeJson({ apiKey: 'k', model: 'reasoning-model', prompt: 'Return JSON' });
      assert.deepStrictEqual(out, { fine: true });
      assert.strictEqual(bodies.length, 3);
      assert.ok(!('temperature' in bodies[2]));
    } finally { restoreFetch(); }
  });

  await testAsync('falls back when response_format is unsupported', async () => {
    let calls = 0;
    mockFetch(async (_u, o) => {
      calls++;
      const b = JSON.parse(o.body);
      if (b.response_format) {
        return { ok: false, status: 400, text: async () => JSON.stringify({ error: { message: 'response_format is not supported by this endpoint' } }) };
      }
      return okChat('Here you go: {"plain":true}');
    });
    try {
      const out = await openai.completeJson({ apiKey: 'k', model: 'm', prompt: 'Return JSON', baseUrl: 'https://local/v1' });
      assert.deepStrictEqual(out, { plain: true });
      assert.ok(calls >= 2);
    } finally { restoreFetch(); }
  });

  await testAsync('an API error message reaches the user unchanged', async () => {
    mockFetch(async () => ({
      ok: false, status: 401,
      text: async () => JSON.stringify({ error: { message: 'Incorrect API key provided.' } })
    }));
    try {
      await assert.rejects(
        () => openai.complete({ apiKey: 'bad', model: 'gpt-4.1', prompt: 'hi' }),
        /Incorrect API key provided/
      );
    } finally { restoreFetch(); }
  });

  await testAsync('the router sends work to OpenAI when OpenAI is selected', async () => {
    let url = null;
    mockFetch(async (u) => { url = u; return okChat('{"via":"openai"}'); });
    try {
      const out = await llm.completeJson(
        { provider: 'openai', providers: { openai: { apiKey: 'k', model: 'gpt-4.1' } } },
        { system: 'S', prompt: 'Return JSON' }
      );
      assert.deepStrictEqual(out, { via: 'openai' });
      assert.ok(/api\.openai\.com/.test(url), 'went to ' + url);
    } finally { restoreFetch(); }
  });

  await testAsync('the router sends work to Anthropic when Claude is selected', async () => {
    let url = null, body = null;
    mockFetch(async (u, o) => {
      url = u; body = JSON.parse(o.body);
      return { ok: true, status: 200, text: async () => JSON.stringify({ content: [{ type: 'text', text: '"via":"anthropic"}' }] }) };
    });
    try {
      const out = await llm.completeJson(
        { provider: 'anthropic', providers: { anthropic: { apiKey: 'k', model: 'claude-sonnet-4-5' } } },
        { system: 'S', prompt: 'Return JSON' }
      );
      assert.deepStrictEqual(out, { via: 'anthropic' });
      assert.ok(/api\.anthropic\.com/.test(url), 'went to ' + url);
      assert.strictEqual(body.system, 'S');
    } finally { restoreFetch(); }
  });

  await testAsync('the same brand brief reaches whichever provider is active', async () => {
    const brand = brands.zoraSeed();
    const { system } = agents.buildPrompt('content', brand, { topic: 't', count: 2 });
    const seen = [];
    mockFetch(async (_u, o) => {
      const b = JSON.parse(o.body);
      seen.push(b.system || (b.messages && b.messages[0] && b.messages[0].content));
      return okChat('{"posts":[]}');
    });
    try {
      for (const provider of ['openai', 'anthropic']) {
        await llm.completeJson(
          { provider, providers: { openai: { apiKey: 'k', model: 'gpt-4.1' }, anthropic: { apiKey: 'k', model: 'claude-sonnet-4-5' } } },
          { system, prompt: 'Return JSON' }
        ).catch(() => {});
      }
      assert.strictEqual(seen.length, 2);
      seen.forEach(s => assert.ok(String(s).includes('Zora Holdings'), 'brand brief missing'));
    } finally { restoreFetch(); }
  });

  try { fs.rmSync(tmp, { recursive: true, force: true }); } catch (_) {}
  console.log('\n' + pass + ' passed, ' + fail + ' failed\n');
  process.exit(fail ? 1 : 0);
})();
