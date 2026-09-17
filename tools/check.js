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
  store.saveSettings({ model: 'claude-sonnet-4-5', apiKey: 'sk-test-123', webhookUrl: 'https://example.com/hook' });
  const s = store.getSettings();
  assert.strictEqual(s.apiKey, 'sk-test-123');
  assert.strictEqual(s.webhookUrl, 'https://example.com/hook');
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

  try { fs.rmSync(tmp, { recursive: true, force: true }); } catch (_) {}
  console.log('\n' + pass + ' passed, ' + fail + ' failed\n');
  process.exit(fail ? 1 : 0);
})();
