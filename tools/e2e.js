'use strict';
/**
 * Full campaign pipeline run against a mock Claude API.
 * Verifies the six stages chain correctly, the calendar is generated in chunks
 * and stitched back together with correct dates, and a truncated reply from the
 * model still produces a usable campaign. No API key, no network.
 *
 *   node tools/e2e.js
 */

const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');

const store = require('../src/core/store');
const brands = require('../src/core/brands');
const pipeline = require('../src/core/pipeline');
const exporters = require('../src/core/exporters');

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'tangazo-e2e-'));
store.init(tmp, null);

/* --------------------------------------------------------- mock the model */

const seen = [];           // every prompt the pipeline sent
let truncateNext = false;  // simulate a cut-off reply once

function reply(prompt) {
  // Calendar chunks: the prompt names an explicit day range.
  const range = prompt.match(/ONLY generate DAY (\d+) THROUGH DAY (\d+)/);
  if (range) {
    const from = Number(range[1]), to = Number(range[2]);
    const rows = [];
    for (let d = from; d <= to; d++) {
      rows.push({
        day: d,
        channel: ['instagram', 'facebook', 'tiktok', 'linkedin'][d % 4],
        time: d % 3 === 0 ? '7pm' : '09:00',          // deliberately sloppy
        format: 'single image',
        title: 'Slot ' + d,
        hook: 'Hook for day ' + d,
        caption: 'Caption for day ' + d,
        hashtags: '#Tanzania #Milango',                // deliberately a string
        cta: 'WhatsApp us'
      });
    }
    const json = JSON.stringify({ calendar: rows });
    return truncateNext ? (truncateNext = false, json.slice(0, json.length - 40)) : json;
  }

  if (/"posts"/.test(prompt) || /Write the posts/.test(prompt)) {
    return JSON.stringify({ posts: [{ channel: 'instagram', caption: 'x' }] });
  }
  if (/"prompts"/.test(prompt)) {
    return JSON.stringify({ prompts: [{ title: 'Hero', kind: 'product photo', aspect: '4:5', imagePrompt: 'gold panel' }] });
  }
  if (/"ads"/.test(prompt)) {
    return JSON.stringify({ ads: [{ concept: 'Stock now', platform: 'Meta', headlines: ['In stock today'], primaryTexts: ['400 panels landed.'], cta: 'Send Message' }] });
  }
  if (/"personas"/.test(prompt)) {
    return JSON.stringify({ personas: [{ name: 'Fundi', coreMessage: 'In stock in Dar' }] });
  }
  if (/"campaignName"/.test(prompt)) {
    return JSON.stringify({
      campaignName: 'Panel Drop',
      bigIdea: 'The doors landed',
      audiences: [{ persona: 'Fundi', channel: 'tiktok', share: '40%', message: 'stock now' }],
      phases: [{ phase: 'Launch', days: '1-7', goal: 'awareness', keyMessage: 'it landed' }],
      whatsappSequence: [{ day: 1, segment: 'shops', message: 'Habari, panels zimefika.' }],
      salesScripts: [{ scenario: 'walk-in', script: 'Karibu' }],
      faqs: [{ q: 'Will it rust?', a: 'Coated steel.' }]
    });
  }
  // strategist
  return JSON.stringify({
    objective: 'Sell 400 panels in 30 days',
    positioning: 'The stocked source',
    bigIdea: { name: 'Panel Drop', premise: 'It landed' },
    messagingPillars: [{ pillar: 'Stock', proof: 'in country' }],
    offer: { hook: 'Trade price on 10+', mechanic: '10% off at 10 units' },
    channelPlan: [{ channel: 'facebook', role: 'trade reach' }]
  });
}

/**
 * One mock standing in for both wire formats, so the pipeline is proven to work
 * the same whether it is talking to Claude or to ChatGPT.
 */
global.fetch = async (url, opts) => {
  const body = JSON.parse(opts.body);
  const isOpenAI = !/api\.anthropic\.com/.test(String(url));

  const system = isOpenAI ? (body.messages.find(m => m.role === 'system') || {}).content : body.system;
  const prompt = isOpenAI
    ? (body.messages.filter(m => m.role === 'user').pop() || {}).content
    : body.messages[0].content;

  seen.push({ system, prompt, openai: isOpenAI });
  const text = reply(prompt);

  if (isOpenAI) {
    return {
      ok: true, status: 200,
      text: async () => JSON.stringify({ choices: [{ message: { content: text }, finish_reason: 'stop' }] })
    };
  }
  // The Anthropic client prefills '{', so the mock returns the rest.
  return {
    ok: true, status: 200,
    text: async () => JSON.stringify({ content: [{ type: 'text', text: text.replace(/^\{/, '') }] })
  };
};

function settingsFor(provider) {
  return {
    provider,
    providers: {
      anthropic: { apiKey: 'sk-ant-mock', model: 'claude-sonnet-4-5' },
      openai: { apiKey: 'sk-openai-mock', model: 'gpt-4.1' }
    },
    maxTokens: 4000
  };
}

/* ------------------------------------------------------------------- run */

(async () => {
  let pass = 0, fail = 0;
  const check = (name, fn) => {
    try { fn(); pass++; console.log('  ok   ' + name); }
    catch (e) { fail++; console.log('  FAIL ' + name + '\n       ' + e.message); }
  };

  console.log('\nTANGAZO end-to-end (mock model)\n');

  const brand = brands.zoraSeed();
  const settings = settingsFor('anthropic');
  const progress = [];

  truncateNext = true; // first calendar chunk comes back cut off

  const out = await pipeline.runCampaign({
    brand,
    input: {
      brief: '400 embossed door panels arriving. Sell them in 30 days.',
      days: 30,
      startDate: '2026-09-21',
      channels: ['instagram', 'facebook', 'tiktok', 'linkedin']
    },
    settings,
    onProgress: p => progress.push(p)
  });

  check('all six stages produced output', () => {
    ['strategy', 'campaign', 'calendar', 'creatives', 'ads', 'personas'].forEach(k =>
      assert.ok(out[k], 'missing ' + k));
  });

  check('progress was reported for every stage', () => {
    const done = progress.filter(p => p.status === 'done').length;
    assert.ok(done >= 6, 'only ' + done + ' stages reported done');
  });

  check('calendar was generated in chunks and stitched', () => {
    // 30 days at 10 per chunk = 3 calls, minus the 40 chars lost to truncation
    assert.ok(out.calendar.length >= 28, 'got ' + out.calendar.length + ' slots');
    assert.ok(out.calendar.length <= 30);
  });

  check('a truncated reply still yielded usable slots', () => {
    const firstChunk = out.calendar.filter(s => s.day <= 10);
    assert.ok(firstChunk.length >= 8, 'truncated chunk lost too much: ' + firstChunk.length);
  });

  check('dates were computed from the start date', () => {
    const d1 = out.calendar.find(s => s.day === 1);
    const d8 = out.calendar.find(s => s.day === 8);
    assert.strictEqual(d1.date, '2026-09-21');
    assert.strictEqual(d8.date, '2026-09-28');
  });

  check('sloppy times were normalised', () => {
    out.calendar.forEach(s => assert.ok(/^\d{2}:\d{2}$/.test(s.time), 'bad time: ' + s.time));
  });

  check('string hashtags became arrays', () => {
    out.calendar.forEach(s => assert.ok(Array.isArray(s.hashtags)));
  });

  check('every prompt carried the brand brief', () => {
    assert.ok(seen.length >= 8, 'only ' + seen.length + ' model calls');
    seen.forEach((c, i) => {
      assert.ok(c.system.includes('Zora Holdings'), 'call ' + i + ' lost the brand');
      assert.ok(c.system.includes('Embossed steel door panels'), 'call ' + i + ' lost the products');
    });
  });

  check('later stages were fed the earlier decisions', () => {
    const calCall = seen.find(c => /ONLY generate DAY 11/.test(c.prompt));
    assert.ok(calCall, 'second calendar chunk never ran');
    assert.ok(/Launch/.test(calCall.prompt), 'calendar was not given the campaign phases');
    assert.ok(/do not repeat these angles/i.test(calCall.prompt), 'calendar not told what was already scheduled');
    const adCall = seen.find(c => /OFFER:/.test(c.prompt));
    assert.ok(/Trade price on 10\+|Panel Drop/.test(adCall.prompt), 'ads not fed the strategy offer');
  });

  check('the result exports cleanly', () => {
    const campaign = { name: 'Panel Drop', data: out };
    const csv = exporters.publerCsv(out.calendar);
    assert.strictEqual(csv.split('\r\n').length, out.calendar.length + 1);
    const ics = exporters.toIcs(out.calendar, 'Panel Drop');
    assert.strictEqual((ics.match(/BEGIN:VEVENT/g) || []).length, out.calendar.length);
    const md = exporters.campaignPack(campaign, brand);
    assert.ok(md.includes('Sell 400 panels in 30 days'));
    assert.ok(md.includes('WhatsApp sequence'));
    assert.ok(md.length > 3000, 'pack suspiciously short: ' + md.length);
  });

  /* ---- parity: the identical pipeline, driven by ChatGPT instead -------- */
  seen.length = 0;
  const viaOpenAI = await pipeline.runCampaign({
    brand,
    input: { brief: 'Same brief, different engine.', days: 10, startDate: '2026-09-21' },
    settings: settingsFor('openai')
  });

  check('the whole pipeline runs on ChatGPT too', () => {
    ['strategy', 'campaign', 'calendar', 'creatives', 'ads', 'personas'].forEach(k =>
      assert.ok(viaOpenAI[k], 'missing ' + k));
    assert.ok(viaOpenAI.calendar.length >= 8, 'got ' + viaOpenAI.calendar.length + ' slots');
    assert.strictEqual(viaOpenAI.calendar[0].date, '2026-09-21');
  });

  check('every call used the OpenAI wire format and kept the brand', () => {
    assert.ok(seen.length >= 6, 'only ' + seen.length + ' calls');
    seen.forEach((c, i) => {
      assert.strictEqual(c.openai, true, 'call ' + i + ' did not go to OpenAI');
      assert.ok(String(c.system).includes('Zora Holdings'), 'call ' + i + ' lost the brand brief');
    });
  });

  check('output from either engine exports the same way', () => {
    const csv = exporters.publerCsv(viaOpenAI.calendar);
    assert.strictEqual(csv.split('\r\n').length, viaOpenAI.calendar.length + 1);
  });

  try { fs.rmSync(tmp, { recursive: true, force: true }); } catch (_) {}
  console.log('\n' + pass + ' passed, ' + fail + ' failed\n');
  process.exit(fail ? 1 : 0);
})().catch(err => { console.error('E2E THREW: ' + err.stack); process.exit(1); });
