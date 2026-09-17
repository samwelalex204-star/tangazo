'use strict';
/**
 * TANGAZO - the multi-agent campaign pipeline.
 *
 *   Brand Brain
 *        |
 *   Strategist  ->  Campaign Manager
 *                        |
 *        +---------------+---------------+---------------+
 *        |               |               |               |
 *   Social Manager   Creative Dir      Ad Agent      Repurposing
 *   (30-day cal)     (image/video)     (ad sets)     (extra content)
 *
 * Each stage feeds the next through the prompt, so the calendar knows the
 * campaign phases and the creatives know the calendar.
 */

const claude = require('./claude');
const { buildPrompt, systemFor } = require('./agents');

function nextMonday(from) {
  const d = from ? new Date(from) : new Date();
  d.setHours(9, 0, 0, 0);
  const day = d.getDay();            // 0 Sun .. 6 Sat
  const add = day === 1 ? 0 : (8 - day) % 7;
  d.setDate(d.getDate() + add);
  return d;
}

function isoDate(d) {
  const p = n => String(n).padStart(2, '0');
  return d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate());
}

function addDays(date, n) {
  const d = new Date(date);
  d.setDate(d.getDate() + n);
  return d;
}

/**
 * Run a single agent.
 */
async function runAgent({ agentId, brand, input, settings, signal }) {
  const { system, prompt } = buildPrompt(agentId, brand, input);
  const data = await claude.completeJson({
    apiKey: settings.apiKey,
    model: settings.model,
    maxTokens: settings.maxTokens || 8000,
    system,
    prompt,
    signal
  });
  return data;
}

/**
 * Full campaign build. Calls back with progress so the UI can show each stage.
 * @param {function} onProgress ({stage, index, total, label, status})
 */
async function runCampaign({ brand, input, settings, onProgress, signal }) {
  const report = (i, total, label, status, extra) =>
    onProgress && onProgress(Object.assign({ index: i, total, label, status }, extra || {}));

  const days = Number(input.days) || 30;
  const start = input.startDate ? new Date(input.startDate + 'T09:00:00') : nextMonday();
  const startIso = isoDate(start);
  const endIso = isoDate(addDays(start, days - 1));

  const sys = systemFor(brand);
  const ask = async (prompt, maxTokens) => claude.completeJson({
    apiKey: settings.apiKey,
    model: settings.model,
    maxTokens: maxTokens || settings.maxTokens || 8000,
    system: sys,
    prompt,
    signal
  });

  const TOTAL = 6;
  const out = { brief: input.brief, days, startDate: startIso, endDate: endIso };

  /* 1 - strategy ---------------------------------------------------------- */
  report(1, TOTAL, 'Marketing Strategist: reading the goal', 'running');
  out.strategy = await runAgent({
    agentId: 'strategist', brand, settings, signal,
    input: { goal: input.brief, budget: input.budget, horizon: days + ' days' }
  });
  report(1, TOTAL, 'Marketing Strategist', 'done');

  /* 2 - campaign backbone ------------------------------------------------- */
  report(2, TOTAL, 'Campaign Manager: building the campaign spine', 'running');
  const stratSummary = JSON.stringify({
    objective: out.strategy.objective,
    positioning: out.strategy.positioning,
    bigIdea: out.strategy.bigIdea,
    messagingPillars: out.strategy.messagingPillars,
    offer: out.strategy.offer,
    channelPlan: out.strategy.channelPlan
  });
  const campPrompt = buildPrompt('campaign', brand, {
    brief: input.brief, days, startDate: startIso
  }).prompt + `

The strategist has already decided the following. Build on it, do not contradict it:
${stratSummary}`;
  out.campaign = await ask(campPrompt);
  report(2, TOTAL, 'Campaign Manager', 'done');

  /* 3 - calendar, generated in chunks so nothing gets truncated ----------- */
  const chunkSize = 10;
  const chunks = Math.ceil(days / chunkSize);
  out.calendar = [];
  for (let c = 0; c < chunks; c++) {
    const from = c * chunkSize + 1;
    const to = Math.min(days, from + chunkSize - 1);
    report(3, TOTAL, `Social Media Manager: days ${from}-${to} of ${days}`, 'running');

    const already = out.calendar.slice(-6).map(p => `day ${p.day} ${p.channel}: ${p.title || p.hook || ''}`).join('; ');
    const calPrompt = buildPrompt('social', brand, {
      theme: input.brief, days, startDate: startIso, channels: input.channels
    }).prompt + `

ONLY generate DAY ${from} THROUGH DAY ${to} of the ${days}-day campaign.
Day 1 is ${startIso}. Compute each date accordingly.

Campaign phases to follow:
${JSON.stringify((out.campaign && out.campaign.phases) || [])}

Audiences:
${JSON.stringify((out.campaign && out.campaign.audiences) || [])}

${already ? 'Already scheduled (do not repeat these angles): ' + already : ''}`;

    const part = await ask(calPrompt);
    const rows = (part.calendar || []).map(r => normaliseSlot(r, start));
    out.calendar = out.calendar.concat(rows);
    report(3, TOTAL, `Social Media Manager: days ${from}-${to}`, 'done');
  }

  /* 4 - creative prompts -------------------------------------------------- */
  report(4, TOTAL, 'Creative Director: writing visual prompts', 'running');
  const heroSlots = out.calendar
    .filter(s => ['single image', 'carousel', 'reel', 'video'].includes((s.format || '').toLowerCase()))
    .slice(0, 12)
    .map(s => `day ${s.day} ${s.channel} ${s.format}: ${s.title || s.hook}`)
    .join('\n');
  const creativePrompt = buildPrompt('creative', brand, {
    subject: input.brief, count: 12, kind: 'mixed'
  }).prompt + `

These are the calendar slots the visuals must serve. Match your prompts to them
and put the matching day number in "useFor":
${heroSlots}`;
  out.creatives = await ask(creativePrompt);
  report(4, TOTAL, 'Creative Director', 'done');

  /* 5 - ads --------------------------------------------------------------- */
  report(5, TOTAL, 'Ad Agent: building ad sets', 'running');
  const offer = (out.strategy.offer && (out.strategy.offer.hook || out.strategy.offer.mechanic)) || input.brief;
  const adsPrompt = buildPrompt('ads', brand, {
    offer: typeof offer === 'string' ? offer : JSON.stringify(offer),
    platform: input.adPlatform || 'All',
    budget: input.budget,
    count: 4
  }).prompt + `

Campaign context: ${out.campaign.campaignName || ''} - ${out.campaign.bigIdea || ''}`;
  out.ads = await ask(adsPrompt);
  report(5, TOTAL, 'Ad Agent', 'done');

  /* 6 - personas / messaging matrix --------------------------------------- */
  report(6, TOTAL, 'Persona Agent: per-audience messaging', 'running');
  out.personas = await runAgent({
    agentId: 'persona', brand, settings, signal,
    input: { segments: ((out.campaign.audiences || []).map(a => a.persona).join(', ')), depth: 'standard' }
  });
  report(6, TOTAL, 'Persona Agent', 'done');

  return out;
}

/** Make a calendar row safe and consistent. */
function normaliseSlot(row, startDate) {
  const day = Number(row.day) || 1;
  let date = row.date;
  if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    date = isoDate(addDays(startDate, day - 1));
  }
  let time = String(row.time || '09:00').trim();
  const m = time.match(/^(\d{1,2})[:.h]?(\d{2})?/);
  if (m) {
    time = String(Math.min(23, Number(m[1]))).padStart(2, '0') + ':' + String(Math.min(59, Number(m[2] || 0))).padStart(2, '0');
  } else {
    time = '09:00';
  }
  return {
    day,
    date,
    time,
    channel: String(row.channel || 'instagram').toLowerCase().trim(),
    format: row.format || 'single image',
    pillar: row.pillar || '',
    persona: row.persona || '',
    title: row.title || '',
    hook: row.hook || '',
    caption: row.caption || '',
    hashtags: Array.isArray(row.hashtags) ? row.hashtags : (row.hashtags ? String(row.hashtags).split(/\s+/) : []),
    cta: row.cta || '',
    visualBrief: row.visualBrief || '',
    onScreenText: row.onScreenText || [],
    status: 'draft'
  };
}

module.exports = { runAgent, runCampaign, nextMonday, isoDate, addDays, normaliseSlot };
