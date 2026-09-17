'use strict';
/**
 * TANGAZO - publishing.
 *
 * Meta, TikTok and LinkedIn all require business verification and app review
 * before they will let software post on your behalf. That takes weeks and it
 * can be refused. So TANGAZO does not pretend to hold those keys. Instead it
 * fires each scheduled post at a webhook you control - Make.com, Zapier, n8n,
 * Pabbly or your own endpoint - and that service, which is already approved by
 * the platforms, does the posting.
 *
 * Set it up once:
 *   1. Make a "Custom Webhook" trigger in Make.com (or a "Catch Hook" in Zapier).
 *   2. Paste the URL into TANGAZO Settings.
 *   3. In Make/Zapier, route on the `channel` field to the Instagram / Facebook /
 *      TikTok / LinkedIn module and map `caption` and `mediaUrl`.
 *   4. Turn on Auto-publish.
 *
 * TANGAZO then POSTs this JSON at each post's scheduled minute:
 *   { id, brand, channel, scheduledAt, caption, hashtags, text, mediaUrl,
 *     format, campaign, cta, visualBrief }
 */

const crypto = require('crypto');
const store = require('./store');

let timer = null;
let logFn = () => {};

function setLogger(fn) { logFn = fn || (() => {}); }

/** Turn calendar slots into queue rows ready to fire. */
function enqueue(slots, meta) {
  const created = [];
  for (const s of slots) {
    const scheduledAt = new Date(s.date + 'T' + (s.time || '09:00') + ':00');
    created.push(store.insert('queue', {
      campaignId: meta.campaignId || null,
      brandId: meta.brandId || null,
      brandName: meta.brandName || '',
      campaignName: meta.campaignName || '',
      channel: s.channel,
      format: s.format || '',
      scheduledAt: scheduledAt.toISOString(),
      localDate: s.date,
      localTime: s.time,
      caption: s.caption || '',
      hashtags: s.hashtags || [],
      cta: s.cta || '',
      visualBrief: s.visualBrief || '',
      mediaUrl: '',
      status: 'queued',      // queued | sent | failed | paused
      attempts: 0,
      lastError: '',
      sentAt: null
    }));
  }
  return created;
}

function payloadFor(item) {
  const tags = (item.hashtags || []).join(' ');
  return {
    id: item.id,
    source: 'TANGAZO',
    brand: item.brandName,
    campaign: item.campaignName,
    channel: item.channel,
    format: item.format,
    scheduledAt: item.scheduledAt,
    caption: item.caption,
    hashtags: item.hashtags || [],
    text: [item.caption, tags].filter(Boolean).join('\n\n'),
    mediaUrl: item.mediaUrl || '',
    cta: item.cta || '',
    visualBrief: item.visualBrief || ''
  };
}

async function postToWebhook(item, settings) {
  const url = (settings.webhookUrl || '').trim();
  if (!url) throw new Error('No webhook URL set. Open Settings and paste your Make.com / Zapier / n8n webhook URL.');
  if (!/^https:\/\//i.test(url)) throw new Error('Webhook URL must start with https://');

  const body = JSON.stringify(payloadFor(item));
  const headers = { 'content-type': 'application/json', 'user-agent': 'TANGAZO/1.0' };
  if (settings.webhookSecret) {
    headers['x-tangazo-signature'] =
      crypto.createHmac('sha256', settings.webhookSecret).update(body).digest('hex');
  }

  const controller = new AbortController();
  const t = setTimeout(() => controller.abort(), 20000);
  try {
    const res = await fetch(url, { method: 'POST', headers, body, signal: controller.signal });
    const text = await res.text().catch(() => '');
    if (!res.ok) throw new Error('Webhook returned ' + res.status + (text ? ': ' + text.slice(0, 200) : ''));
    return text.slice(0, 500);
  } finally {
    clearTimeout(t);
  }
}

/** Fire one queued item now, whatever its schedule says. */
async function publishNow(id) {
  const item = store.findOne('queue', id);
  if (!item) throw new Error('Queue item not found');
  const settings = store.getSettings();
  try {
    const resp = await postToWebhook(item, settings);
    return store.update('queue', id, {
      status: 'sent', sentAt: new Date().toISOString(),
      attempts: (item.attempts || 0) + 1, lastError: '', response: resp
    });
  } catch (err) {
    return store.update('queue', id, {
      status: 'failed', attempts: (item.attempts || 0) + 1, lastError: err.message
    });
  }
}

/** One scheduler tick: send anything due. */
async function tick() {
  const settings = store.getSettings();
  if (!settings.autoPublish || !settings.webhookUrl) return { sent: 0, failed: 0, skipped: true };

  const now = Date.now();
  const due = store.find('queue', q =>
    q.status === 'queued' && new Date(q.scheduledAt).getTime() <= now && (q.attempts || 0) < 3
  ).sort((a, b) => new Date(a.scheduledAt) - new Date(b.scheduledAt)).slice(0, 5);

  let sent = 0, failed = 0;
  for (const item of due) {
    try {
      const resp = await postToWebhook(item, settings);
      store.update('queue', item.id, {
        status: 'sent', sentAt: new Date().toISOString(),
        attempts: (item.attempts || 0) + 1, lastError: '', response: resp
      });
      sent++;
      logFn({ level: 'ok', message: 'Published ' + item.channel + ' post scheduled ' + item.localDate + ' ' + item.localTime });
    } catch (err) {
      const attempts = (item.attempts || 0) + 1;
      store.update('queue', item.id, {
        status: attempts >= 3 ? 'failed' : 'queued',
        attempts, lastError: err.message
      });
      failed++;
      logFn({ level: 'error', message: 'Publish failed (' + attempts + '/3): ' + err.message });
    }
  }
  return { sent, failed };
}

function start(intervalMs) {
  stop();
  timer = setInterval(() => { tick().catch(e => logFn({ level: 'error', message: e.message })); }, intervalMs || 60000);
  // run one shortly after boot so a missed window catches up
  setTimeout(() => { tick().catch(() => {}); }, 8000);
}

function stop() {
  if (timer) { clearInterval(timer); timer = null; }
}

async function testWebhook(url, secret) {
  const fake = {
    id: 'test_' + Date.now(),
    brandName: 'TANGAZO test',
    campaignName: 'Connection test',
    channel: 'instagram',
    format: 'single image',
    scheduledAt: new Date().toISOString(),
    caption: 'This is a TANGAZO test message. If you can see it in Make/Zapier, the connection works.',
    hashtags: ['#tangazo', '#test'],
    cta: '',
    visualBrief: ''
  };
  const resp = await postToWebhook(fake, { webhookUrl: url, webhookSecret: secret });
  return { ok: true, response: resp };
}

module.exports = { enqueue, publishNow, tick, start, stop, testWebhook, setLogger, payloadFor };
