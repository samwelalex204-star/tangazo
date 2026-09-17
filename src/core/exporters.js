'use strict';
/**
 * TANGAZO - exports.
 * Getting the campaign OUT of the app: scheduler CSVs, a calendar file, and a
 * full human-readable campaign pack.
 */

function csvCell(v) {
  const s = v === null || v === undefined ? '' : String(v);
  return '"' + s.replace(/"/g, '""') + '"';
}

function toCsv(headers, rows) {
  const out = [headers.map(csvCell).join(',')];
  for (const r of rows) out.push(headers.map(h => csvCell(r[h])).join(','));
  return out.join('\r\n');
}

function fullCaption(slot) {
  const tags = (slot.hashtags || []).join(' ');
  return [slot.caption, tags].filter(Boolean).join('\n\n');
}

/* ------------------------------------------------------------ scheduler CSV */

/** Publer bulk CSV. Also imports cleanly into most schedulers. */
function publerCsv(slots) {
  const headers = ['Date', 'Time', 'Content', 'Link', 'Media URL', 'Platform', 'Labels'];
  const rows = slots.map(s => ({
    'Date': s.date,
    'Time': s.time,
    'Content': fullCaption(s),
    'Link': '',
    'Media URL': '',
    'Platform': s.channel,
    'Labels': [s.pillar, s.persona].filter(Boolean).join(' / ')
  }));
  return toCsv(headers, rows);
}

/** Buffer / Hootsuite style: one row per post, ISO datetime. */
function bufferCsv(slots) {
  const headers = ['Profile', 'Scheduled Date', 'Text', 'Media URL'];
  const rows = slots.map(s => ({
    'Profile': s.channel,
    'Scheduled Date': s.date + ' ' + s.time,
    'Text': fullCaption(s),
    'Media URL': ''
  }));
  return toCsv(headers, rows);
}

/** Metricool bulk upload. */
function metricoolCsv(slots) {
  const headers = ['text', 'date', 'hour', 'networks', 'image', 'link'];
  const rows = slots.map(s => ({
    text: fullCaption(s),
    date: s.date,
    hour: s.time,
    networks: metricoolNetwork(s.channel),
    image: '',
    link: ''
  }));
  return toCsv(headers, rows);
}

function metricoolNetwork(ch) {
  const map = { instagram: 'instagram', facebook: 'facebook', tiktok: 'tiktok', linkedin: 'linkedin', twitter: 'twitter' };
  return map[(ch || '').toLowerCase()] || ch;
}

/** The full working sheet - everything, for review in Excel. */
function masterCsv(slots) {
  const headers = ['day', 'date', 'time', 'channel', 'format', 'pillar', 'persona', 'title', 'hook', 'caption', 'hashtags', 'cta', 'visualBrief', 'status'];
  const rows = slots.map(s => Object.assign({}, s, {
    hashtags: (s.hashtags || []).join(' '),
    onScreenText: undefined
  }));
  return toCsv(headers, rows);
}

/* -------------------------------------------------------------------- ICS */

function icsEscape(s) {
  return String(s || '').replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\r?\n/g, '\\n');
}

function icsStamp(dateStr, timeStr) {
  const [y, m, d] = dateStr.split('-');
  const [hh, mm] = (timeStr || '09:00').split(':');
  return `${y}${m}${d}T${hh}${mm}00`;
}

function toIcs(slots, calendarName) {
  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//TANGAZO//Marketing Calendar//EN',
    'CALSCALE:GREGORIAN',
    'X-WR-CALNAME:' + icsEscape(calendarName || 'TANGAZO campaign')
  ];
  slots.forEach((s, i) => {
    const start = icsStamp(s.date, s.time);
    const endH = String(Math.min(23, Number((s.time || '09:00').split(':')[0]) + 0)).padStart(2, '0');
    const endM = String(Math.min(59, Number((s.time || '09:00').split(':')[1] || 0) + 30)).padStart(2, '0');
    const end = icsStamp(s.date, endH + ':' + endM);
    lines.push(
      'BEGIN:VEVENT',
      'UID:tangazo-' + i + '-' + start + '@tangazo',
      'DTSTAMP:' + start,
      'DTSTART:' + start,
      'DTEND:' + end,
      'SUMMARY:' + icsEscape(s.channel.toUpperCase() + ' - ' + (s.title || s.hook || s.format)),
      'DESCRIPTION:' + icsEscape(fullCaption(s) + (s.visualBrief ? '\n\nVISUAL: ' + s.visualBrief : '')),
      'END:VEVENT'
    );
  });
  lines.push('END:VCALENDAR');
  return lines.join('\r\n');
}

/* ------------------------------------------------------------ campaign pack */

function h(n, text) { return '\n' + '#'.repeat(n) + ' ' + text + '\n'; }
function bullets(arr, fn) { return (arr || []).map(x => '- ' + (fn ? fn(x) : x)).join('\n') + '\n'; }

function campaignPack(campaign, brand) {
  const c = campaign.data || campaign;
  const L = [];
  L.push('# ' + ((c.campaign && c.campaign.campaignName) || campaign.name || 'Campaign'));
  L.push('\n**Brand:** ' + (brand ? brand.name : '-') + '  ');
  L.push('**Period:** ' + (c.startDate || '') + ' to ' + (c.endDate || '') + ' (' + (c.days || '') + ' days)  ');
  L.push('**Brief:** ' + (c.brief || ''));

  const s = c.strategy || {};
  if (s.objective) {
    L.push(h(2, 'Strategy'));
    L.push('**Situation:** ' + (s.situation || '') + '\n');
    L.push('**Objective:** ' + (s.objective || '') + '\n');
    L.push('**Positioning:** ' + (s.positioning || '') + '\n');
    if (s.bigIdea) L.push('**Big idea - ' + (s.bigIdea.name || '') + ':** ' + (s.bigIdea.premise || '') + '\n');
    if (s.messagingPillars) {
      L.push(h(3, 'Messaging pillars'));
      L.push(bullets(s.messagingPillars, p => '**' + p.pillar + '** - ' + (p.proof || '')));
    }
    if (s.kpis) {
      L.push(h(3, 'KPIs'));
      L.push(bullets(s.kpis, k => k.metric + ': ' + k.target + (k.howMeasured ? ' (' + k.howMeasured + ')' : '')));
    }
    if (s.quickWins) { L.push(h(3, 'First 72 hours')); L.push(bullets(s.quickWins)); }
  }

  const cm = c.campaign || {};
  if (cm.phases) {
    L.push(h(2, 'Campaign phases'));
    L.push(bullets(cm.phases, p => '**' + p.phase + '** (days ' + p.days + ') - ' + (p.goal || '') + ' | ' + (p.keyMessage || '')));
  }
  if (cm.audiences) {
    L.push(h(2, 'Audiences'));
    L.push(bullets(cm.audiences, a => '**' + a.persona + '** (' + (a.channel || '') + ', ' + (a.share || '') + ') - ' + (a.message || '')));
  }
  if (cm.assetsNeeded) {
    L.push(h(2, 'Assets to produce'));
    L.push(bullets(cm.assetsNeeded, a => a.asset + ' x' + (a.quantity || 1) + ' - ' + (a.owner || '')));
  }

  if ((c.calendar || []).length) {
    L.push(h(2, 'Content calendar'));
    L.push('\n| Day | Date | Time | Channel | Format | Hook |');
    L.push('|---|---|---|---|---|---|');
    c.calendar.forEach(p => {
      L.push('| ' + p.day + ' | ' + p.date + ' | ' + p.time + ' | ' + p.channel + ' | ' + p.format + ' | ' + String(p.hook || p.title || '').replace(/\|/g, '/').slice(0, 70) + ' |');
    });
    L.push(h(2, 'Full captions'));
    c.calendar.forEach(p => {
      L.push(h(3, 'Day ' + p.day + ' - ' + p.channel.toUpperCase() + ' - ' + p.time));
      L.push('*' + p.format + (p.persona ? ' - for ' + p.persona : '') + '*\n');
      L.push('```\n' + fullCaption(p) + '\n```\n');
      if (p.visualBrief) L.push('**Visual:** ' + p.visualBrief + '\n');
      if (p.cta) L.push('**CTA:** ' + p.cta + '\n');
    });
  }

  const cr = (c.creatives && c.creatives.prompts) || [];
  if (cr.length) {
    L.push(h(2, 'Creative prompts'));
    cr.forEach(p => {
      L.push(h(3, p.title || p.kind));
      L.push('**Aspect:** ' + (p.aspect || '') + ' | **For:** ' + (p.useFor || '') + '\n');
      L.push('**Prompt:**\n```\n' + (p.imagePrompt || '') + '\n```\n');
      if (p.negativePrompt) L.push('**Avoid:** ' + p.negativePrompt + '\n');
      if (p.headline) L.push('**Headline on creative:** ' + p.headline + '\n');
      if (p.layout) L.push('**Layout:** ' + p.layout + '\n');
    });
  }

  const ads = (c.ads && c.ads.ads) || [];
  if (ads.length) {
    L.push(h(2, 'Ad sets'));
    ads.forEach(a => {
      L.push(h(3, a.concept + ' (' + (a.platform || '') + ')'));
      L.push('**Objective:** ' + (a.objective || '') + ' | **Budget:** ' + (a.suggestedDailyBudget || '') + '\n');
      const aud = a.audience || {};
      L.push('**Audience:** ' + [(aud.locations || []).join(', '), aud.ageRange, (aud.interests || []).join(', '), (aud.jobTitles || []).join(', ')].filter(Boolean).join(' | ') + '\n');
      L.push('**Headlines:**\n' + bullets(a.headlines));
      L.push('**Primary text:**\n' + bullets(a.primaryTexts));
      L.push('**CTA:** ' + (a.cta || '') + ' -> ' + (a.landingOrDestination || '') + '\n');
      L.push('**Creative:** ' + (a.creativeBrief || '') + '\n');
      L.push('**Testing:** ' + (a.whatWeAreTesting || '') + '\n');
    });
  }

  if (cm.whatsappSequence) {
    L.push(h(2, 'WhatsApp sequence'));
    cm.whatsappSequence.forEach(w => {
      L.push('**Day ' + w.day + ' - ' + (w.segment || '') + '**\n');
      L.push('```\n' + (w.message || '') + '\n```\n');
    });
  }
  if (cm.salesScripts) {
    L.push(h(2, 'Sales scripts'));
    cm.salesScripts.forEach(sc => {
      L.push('**' + sc.scenario + '**\n');
      L.push('```\n' + (sc.script || '') + '\n```\n');
    });
  }
  if (cm.faqs) {
    L.push(h(2, 'Customer FAQs'));
    cm.faqs.forEach(f => L.push('**Q: ' + f.q + '**  \nA: ' + f.a + '\n'));
  }
  if (cm.successMetrics) {
    L.push(h(2, 'Success metrics'));
    L.push(bullets(cm.successMetrics, m => m.metric + ': ' + m.target));
  }

  L.push('\n---\n*Generated by TANGAZO. Check every price, stock figure and claim before publishing.*\n');
  return L.join('\n');
}

/** WhatsApp broadcast text file - one message per block, easy to copy. */
function whatsappTxt(campaign) {
  const c = campaign.data || campaign;
  const seq = (c.campaign && c.campaign.whatsappSequence) || [];
  return seq.map(w => '=== DAY ' + w.day + ' - ' + (w.segment || '') + ' ===\n\n' + (w.message || '') + '\n').join('\n');
}

module.exports = {
  toCsv, publerCsv, bufferCsv, metricoolCsv, masterCsv, toIcs,
  campaignPack, whatsappTxt, fullCaption
};
