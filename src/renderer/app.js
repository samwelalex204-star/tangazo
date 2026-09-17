'use strict';
/* TANGAZO renderer */

const api = window.tangazo;

const S = {
  brands: [], activeBrandId: null, settings: {}, agents: [], campaigns: [],
  view: 'dashboard', campaign: null, queue: [], content: [],
  busy: false, progress: [], lastError: null, editBrand: null, brainTab: 'identity'
};

/* ------------------------------------------------------------------ utils */

const $ = s => document.querySelector(s);
const view = () => $('#view');

function esc(s) {
  return String(s === null || s === undefined ? '' : s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

function toast(msg, kind) {
  const t = $('#toast');
  t.textContent = msg;
  t.className = 'toast show ' + (kind || '');
  clearTimeout(toast._t);
  toast._t = setTimeout(() => { t.className = 'toast ' + (kind || ''); }, kind === 'err' ? 6500 : 3200);
}

async function call(fn, payload) {
  const res = await fn(payload);
  if (!res.ok) { toast(res.error, 'err'); throw new Error(res.error); }
  return res.data;
}

async function tryCall(fn, payload) {
  try { return await call(fn, payload); } catch (_) { return null; }
}

function activeBrand() { return S.brands.find(b => b.id === S.activeBrandId) || null; }

function fmtDate(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  return d.toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' });
}

function fmtDateTime(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  return d.toLocaleString(undefined, { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
}

function copy(text) {
  navigator.clipboard.writeText(text).then(
    () => toast('Copied'),
    () => toast('Could not copy', 'err')
  );
}

function modal(title, html) {
  $('#modalTitle').textContent = title;
  $('#modalBody').innerHTML = html;
  $('#modal').classList.remove('hidden');
}
function closeModal() { $('#modal').classList.add('hidden'); }

/* ------------------------------------------------------------------- boot */

async function boot() {
  const data = await call(api.bootstrap);
  S.brands = data.brands;
  S.activeBrandId = data.activeBrandId;
  S.settings = data.settings;
  S.agents = data.agents;
  S.campaigns = data.campaigns;
  $('#verText').textContent = 'v' + data.version;
  renderBrandSelect();
  updateStatus();
  render();
}

function updateStatus() {
  const el = $('#statusDot');
  const txt = $('#statusText');
  if (!S.settings.hasApiKey) {
    el.className = 'status bad';
    txt.textContent = 'No API key';
  } else if (S.settings.autoPublish && S.settings.webhookUrl) {
    el.className = 'status ok';
    txt.textContent = 'Auto-publish on';
  } else {
    el.className = 'status ok';
    txt.textContent = 'Ready';
  }
}

function renderBrandSelect() {
  const sel = $('#brandSelect');
  sel.innerHTML = S.brands.map(b =>
    `<option value="${esc(b.id)}" ${b.id === S.activeBrandId ? 'selected' : ''}>${esc(b.name)}</option>`
  ).join('') + '<option value="__new">+ New brand…</option>';
}

/* ------------------------------------------------------------------- nav */

document.addEventListener('click', async (e) => {
  const nav = e.target.closest('.nav-item');
  if (nav) {
    document.querySelectorAll('.nav-item').forEach(n => n.classList.toggle('active', n === nav));
    S.view = nav.dataset.view;
    render();
    return;
  }
  const act = e.target.closest('[data-act]');
  if (act) { handleAction(act.dataset.act, act.dataset, act, e); }
});

$('#modalClose').addEventListener('click', closeModal);
$('#modal').addEventListener('click', e => { if (e.target.id === 'modal') closeModal(); });

$('#brandSelect').addEventListener('change', async (e) => {
  if (e.target.value === '__new') {
    const name = prompt('Brand name');
    renderBrandSelect();
    if (!name) return;
    const b = await call(api.brand.create, { name });
    S.brands.push(b);
    await call(api.brand.setActive, { id: b.id });
    S.activeBrandId = b.id;
    renderBrandSelect();
    S.view = 'brain';
    document.querySelectorAll('.nav-item').forEach(n => n.classList.toggle('active', n.dataset.view === 'brain'));
    render();
    return;
  }
  S.activeBrandId = e.target.value;
  await call(api.brand.setActive, { id: S.activeBrandId });
  S.editBrand = null;
  render();
});

/* --------------------------------------------------------------- routing */

function render() {
  const v = {
    dashboard: viewDashboard,
    campaign: viewCampaign,
    agents: viewAgents,
    calendar: viewCalendar,
    queue: viewQueue,
    library: viewLibrary,
    brain: viewBrain,
    settings: viewSettings
  }[S.view] || viewDashboard;
  v();
}

/* ------------------------------------------------------------- dashboard */

async function viewDashboard() {
  const b = activeBrand();
  S.campaigns = await tryCall(api.campaign.list) || [];
  const q = await tryCall(api.queue.list) || [];
  S.queue = q;
  const posts = S.campaigns.reduce((n, c) => n + (c.posts || 0), 0);
  const queued = q.filter(x => x.status === 'queued').length;
  const sent = q.filter(x => x.status === 'sent').length;

  const next = q.filter(x => x.status === 'queued')
    .sort((a, b2) => new Date(a.scheduledAt) - new Date(b2.scheduledAt)).slice(0, 5);

  view().innerHTML = `
    <div class="page-head">
      <h1>${esc(b ? b.name : 'No brand')}</h1>
      <p>${esc(b ? (b.oneLiner || b.tagline || 'Add a one-liner in the Brand Brain.') : 'Create a brand to get started.')}</p>
    </div>

    ${!S.settings.hasApiKey ? `<div class="err-note">
      <strong>No API key yet.</strong> TANGAZO needs an Anthropic API key to think.
      Open <a href="#" data-act="go" data-view="settings" class="gold">Settings</a> and paste it — nothing generates until you do.
    </div>` : ''}

    <div class="grid c4">
      <div class="stat"><div class="n">${S.campaigns.length}</div><div class="l">Campaigns</div></div>
      <div class="stat"><div class="n">${posts}</div><div class="l">Posts written</div></div>
      <div class="stat"><div class="n">${queued}</div><div class="l">Queued</div></div>
      <div class="stat"><div class="n">${sent}</div><div class="l">Published</div></div>
    </div>

    <h2 class="sec">Start something</h2>
    <div class="grid c3">
      <div class="agent-card" data-act="go" data-view="campaign">
        <div class="n">FULL PIPELINE</div>
        <h3>Run a campaign</h3>
        <p>One brief in. Strategy, 30-day calendar, captions, creative prompts, ad sets, WhatsApp and sales scripts out.</p>
      </div>
      <div class="agent-card" data-act="go" data-view="agents">
        <div class="n">SINGLE AGENT</div>
        <h3>Use one agent</h3>
        <p>Just need captions, or ad copy, or 15 pieces from one video? Call the specialist directly.</p>
      </div>
      <div class="agent-card" data-act="go" data-view="brain">
        <div class="n">FOUNDATION</div>
        <h3>Tune the Brand Brain</h3>
        <p>Colours, tone, products, personas, banned words. Everything the agents read before they write.</p>
      </div>
    </div>

    <h2 class="sec">Recent campaigns</h2>
    ${S.campaigns.length ? S.campaigns.slice(-6).reverse().map(c => `
      <div class="list-item">
        <div>
          <h4>${esc(c.name)}</h4>
          <div class="meta">${esc(c.brandName || '')} · ${c.posts || 0} posts · ${esc(c.startDate || '')} → ${esc(c.endDate || '')}</div>
        </div>
        <div class="btn-row">
          <button class="btn sm" data-act="openCampaign" data-id="${esc(c.id)}">Open</button>
        </div>
      </div>`).join('') : `<div class="empty"><h3>No campaigns yet</h3><p>Run your first one from “New campaign”.</p></div>`}

    ${next.length ? `<h2 class="sec">Going out next</h2>
      <div class="tbl-wrap"><table>
        <tr><th>When</th><th>Channel</th><th>Post</th></tr>
        ${next.map(x => `<tr>
          <td class="small dim">${esc(fmtDateTime(x.scheduledAt))}</td>
          <td><span class="tag ${esc(x.channel)}">${esc(x.channel)}</span></td>
          <td class="small">${esc(String(x.caption || '').slice(0, 90))}…</td>
        </tr>`).join('')}
      </table></div>` : ''}
  `;
}

/* -------------------------------------------------------------- campaign */

function viewCampaign() {
  const b = activeBrand();
  const today = new Date().toISOString().slice(0, 10);

  view().innerHTML = `
    <div class="page-head">
      <h1>New campaign</h1>
      <p>Describe what is happening in the business. Six agents run in sequence and hand you a complete campaign.</p>
    </div>

    <div class="card">
      <div class="field">
        <label>Campaign brief</label>
        <textarea id="cBrief" rows="4" placeholder="We have 400 embossed door panels arriving. Create a 30-day campaign targeting hardware shops, contractors and homeowners in Tanzania.">${esc(b && b.goals ? '' : '')}</textarea>
        <div class="hint">Be concrete: what is arriving, what must be sold, by when, to whom.</div>
      </div>
      <div class="row">
        <div class="field"><label>Length (days)</label><input type="number" id="cDays" value="30" min="7" max="90"></div>
        <div class="field"><label>Start date</label><input type="date" id="cStart" value="${today}"></div>
        <div class="field"><label>Ad budget (optional)</label><input type="text" id="cBudget" placeholder="TZS 50,000/day"></div>
      </div>
      <div class="field">
        <label>Channels</label>
        <div class="chips" id="cChannels">
          ${['instagram', 'facebook', 'tiktok', 'linkedin'].map(c =>
            `<div class="chip on" data-act="chip" data-ch="${c}">${c}</div>`).join('')}
        </div>
      </div>
      <div class="btn-row">
        <button class="btn primary" data-act="runCampaign" ${S.busy ? 'disabled' : ''}>Run the department</button>
        ${S.busy ? '<button class="btn danger" data-act="cancel">Cancel</button>' : ''}
      </div>
      <div class="hint" style="margin-top:9px">Takes 3–6 minutes and roughly 60–120k tokens of your API credit for a 30-day campaign.</div>
    </div>

    <div id="progressBox"></div>
  `;
}

function renderProgress() {
  const box = $('#progressBox');
  if (!box) return;
  if (!S.progress.length) { box.innerHTML = ''; return; }
  const done = S.progress.filter(p => p.status === 'done' || p.status === 'complete').length;
  const total = S.progress[0] ? S.progress[0].total : 6;
  box.innerHTML = `
    <div class="card" style="margin-top:14px">
      <h2 class="sec" style="margin-top:0">Working</h2>
      <div class="bar"><div style="width:${Math.round(done / total * 100)}%"></div></div>
      <div class="steps">
        ${S.progress.map(p => `<div class="step ${p.status === 'done' || p.status === 'complete' ? 'done' : 'running'}">
          <span class="bullet">${p.status === 'done' || p.status === 'complete' ? '✓' : ''}</span>${esc(p.label)}
        </div>`).join('')}
      </div>
    </div>`;
}

api.on.campaignProgress(p => {
  const i = S.progress.findIndex(x => x.label === p.label);
  if (i >= 0) S.progress[i] = p; else S.progress.push(p);
  renderProgress();
});

api.on.publisherLog(entry => toast(entry.message, entry.level === 'error' ? 'err' : 'ok'));

/* ---------------------------------------------------------------- agents */

function viewAgents() {
  view().innerHTML = `
    <div class="page-head">
      <h1>Agents</h1>
      <p>Ten specialists. Each one reads the Brand Brain before it writes a word.</p>
    </div>
    <div class="grid c3">
      ${S.agents.map((a, i) => `
        <div class="agent-card" data-act="openAgent" data-id="${esc(a.id)}">
          <div class="n">${String(i + 1).padStart(2, '0')}</div>
          <h3>${esc(a.name)}</h3>
          <p>${esc(a.blurb)}</p>
        </div>`).join('')}
    </div>
  `;
}

function openAgent(id) {
  const a = S.agents.find(x => x.id === id);
  if (!a) return;
  const channels = ['instagram', 'facebook', 'tiktok', 'linkedin'];

  const fields = a.inputs.map(f => {
    if (f.type === 'textarea') {
      return `<div class="field"><label>${esc(f.label)}</label>
        <textarea id="in_${f.key}" rows="4" placeholder="${esc(f.placeholder || '')}"></textarea></div>`;
    }
    if (f.type === 'select') {
      return `<div class="field"><label>${esc(f.label)}</label><select id="in_${f.key}">
        ${f.options.map(o => `<option ${o === f.default ? 'selected' : ''}>${esc(o)}</option>`).join('')}
      </select></div>`;
    }
    if (f.type === 'channels') {
      return `<div class="field"><label>${esc(f.label)}</label>
        <div class="chips" id="in_${f.key}">
          ${channels.map(c => `<div class="chip on" data-act="chip" data-ch="${c}">${c}</div>`).join('')}
        </div></div>`;
    }
    if (f.type === 'number') {
      return `<div class="field"><label>${esc(f.label)}</label>
        <input type="number" id="in_${f.key}" value="${f.default || 10}"></div>`;
    }
    if (f.type === 'date') {
      return `<div class="field"><label>${esc(f.label)}</label>
        <input type="date" id="in_${f.key}" value="${new Date().toISOString().slice(0, 10)}"></div>`;
    }
    return `<div class="field"><label>${esc(f.label)}</label>
      <input type="text" id="in_${f.key}" placeholder="${esc(f.placeholder || '')}"></div>`;
  }).join('');

  modal(a.name, `
    <p class="muted small" style="margin-top:-6px">${esc(a.blurb)}</p>
    <div class="divider"></div>
    ${fields}
    <div class="btn-row">
      <button class="btn primary" data-act="runAgent" data-id="${esc(a.id)}">Run agent</button>
      <button class="btn ghost" data-act="closeModal">Cancel</button>
    </div>
    <div id="agentOut"></div>
  `);
}

function collectInputs(agent) {
  const input = {};
  for (const f of agent.inputs) {
    const el = document.getElementById('in_' + f.key);
    if (!el) continue;
    if (f.type === 'channels') {
      input[f.key] = Array.from(el.querySelectorAll('.chip.on')).map(c => c.dataset.ch);
    } else {
      input[f.key] = el.value;
    }
    if (f.required && !String(input[f.key] || '').trim()) {
      throw new Error(f.label + ' is required');
    }
  }
  return input;
}

/* ------------------------------------------------------- result rendering */

function renderResult(data) {
  if (!data || typeof data !== 'object') return `<div class="pre">${esc(JSON.stringify(data, null, 2))}</div>`;

  if (Array.isArray(data.posts)) return renderPosts(data.posts);
  if (Array.isArray(data.pieces)) return renderPosts(data.pieces.map(p => Object.assign({}, p, { format: p.format, visualBrief: p.editNotes })));
  if (Array.isArray(data.calendar)) return renderCalendarTable(data.calendar);
  if (Array.isArray(data.prompts)) return renderPrompts(data.prompts);
  if (Array.isArray(data.ads)) return renderAds(data.ads);
  if (Array.isArray(data.personas)) return renderPersonas(data.personas);
  return renderGeneric(data);
}

function renderPosts(posts) {
  return posts.map((p, i) => `
    <div class="card" style="margin-top:12px">
      <div class="btn-row" style="justify-content:space-between;margin-bottom:9px">
        <div>
          <span class="tag ${esc((p.channel || '').toLowerCase())}">${esc(p.channel || '')}</span>
          <span class="small dim" style="margin-left:8px">${esc(p.format || '')}${p.persona ? ' · ' + esc(p.persona) : ''}</span>
        </div>
        <button class="btn sm" data-act="copyIdx" data-idx="${i}">Copy</button>
      </div>
      ${p.hook ? `<div class="small gold" style="margin-bottom:7px">HOOK: ${esc(p.hook)}</div>` : ''}
      <div class="cap" id="cap_${i}">${esc(p.caption || '')}${(p.hashtags || []).length ? '\n\n' + esc((p.hashtags || []).join(' ')) : ''}</div>
      ${p.cta ? `<div class="small" style="margin-top:8px"><span class="dim">CTA:</span> ${esc(p.cta)}</div>` : ''}
      ${p.visualBrief ? `<div class="small" style="margin-top:6px"><span class="dim">Visual:</span> ${esc(p.visualBrief)}</div>` : ''}
      ${(p.onScreenText || []).length ? `<div class="small" style="margin-top:6px"><span class="dim">On screen:</span> ${esc((p.onScreenText || []).join(' / '))}</div>` : ''}
      ${p.bestTime ? `<div class="small dim" style="margin-top:6px">Best time: ${esc(p.bestTime)}</div>` : ''}
    </div>`).join('');
}

function renderCalendarTable(cal) {
  return `<div class="tbl-wrap" style="margin-top:12px"><table>
    <tr><th>Day</th><th>Date</th><th>Time</th><th>Channel</th><th>Format</th><th>Hook</th><th></th></tr>
    ${cal.map((p, i) => `<tr>
      <td>${esc(p.day)}</td><td class="small">${esc(p.date)}</td><td class="small">${esc(p.time)}</td>
      <td><span class="tag ${esc((p.channel || '').toLowerCase())}">${esc(p.channel)}</span></td>
      <td class="small dim">${esc(p.format)}</td>
      <td class="small">${esc(String(p.hook || p.title || '').slice(0, 70))}</td>
      <td><button class="btn sm" data-act="showSlot" data-idx="${i}">View</button></td>
    </tr>`).join('')}
  </table></div>`;
}

function renderPrompts(prompts) {
  return prompts.map((p, i) => `
    <div class="card" style="margin-top:12px">
      <div class="btn-row" style="justify-content:space-between;margin-bottom:8px">
        <h4 style="margin:0">${esc(p.title || p.kind || 'Creative')}</h4>
        <button class="btn sm" data-act="copyIdx" data-idx="${i}">Copy prompt</button>
      </div>
      <div class="small dim" style="margin-bottom:8px">${esc(p.kind || '')} · ${esc(p.aspect || '')}${p.useFor ? ' · for ' + esc(p.useFor) : ''}</div>
      <div class="cap" id="cap_${i}">${esc(p.imagePrompt || '')}</div>
      ${p.negativePrompt ? `<div class="small" style="margin-top:7px"><span class="dim">Avoid:</span> ${esc(p.negativePrompt)}</div>` : ''}
      ${p.headline ? `<div class="small" style="margin-top:6px"><span class="dim">Headline:</span> ${esc(p.headline)}</div>` : ''}
      ${p.layout ? `<div class="small" style="margin-top:6px"><span class="dim">Layout:</span> ${esc(p.layout)}</div>` : ''}
      ${p.shotNotes ? `<div class="small" style="margin-top:6px"><span class="dim">Shot:</span> ${esc(p.shotNotes)}</div>` : ''}
    </div>`).join('');
}

function renderAds(ads) {
  return ads.map((a, i) => `
    <div class="card" style="margin-top:12px">
      <h4 style="margin:0 0 4px">${esc(a.concept || 'Ad set ' + (i + 1))}</h4>
      <div class="small dim" style="margin-bottom:10px">${esc(a.platform || '')} · ${esc(a.objective || '')} · ${esc(a.suggestedDailyBudget || '')}</div>
      <div class="small" style="margin-bottom:8px"><span class="dim">Audience:</span>
        ${esc([(a.audience && a.audience.locations || []).join(', '), a.audience && a.audience.ageRange, (a.audience && a.audience.interests || []).join(', '), (a.audience && a.audience.jobTitles || []).join(', ')].filter(Boolean).join(' | '))}</div>
      <div class="small dim" style="margin:10px 0 5px">HEADLINES</div>
      <div class="cap">${esc((a.headlines || []).join('\n'))}</div>
      <div class="small dim" style="margin:10px 0 5px">PRIMARY TEXT</div>
      <div class="cap">${esc((a.primaryTexts || []).join('\n\n---\n\n'))}</div>
      <div class="small" style="margin-top:9px"><span class="dim">CTA:</span> ${esc(a.cta || '')} → ${esc(a.landingOrDestination || '')}</div>
      ${a.creativeBrief ? `<div class="small" style="margin-top:6px"><span class="dim">Creative:</span> ${esc(a.creativeBrief)}</div>` : ''}
      ${a.whatWeAreTesting ? `<div class="small" style="margin-top:6px"><span class="dim">Testing:</span> ${esc(a.whatWeAreTesting)}</div>` : ''}
    </div>`).join('');
}

function renderPersonas(personas) {
  return personas.map(p => `
    <div class="card" style="margin-top:12px">
      <h4 style="margin:0 0 3px">${esc(p.name || '')}</h4>
      <div class="small dim" style="margin-bottom:9px">${esc(p.role || '')}</div>
      ${p.coreMessage ? `<div class="inline-note" style="margin-bottom:11px">${esc(p.coreMessage)}</div>` : ''}
      ${p.buyingTrigger ? `<div class="small" style="margin-bottom:6px"><span class="dim">Buying trigger:</span> ${esc(p.buyingTrigger)}</div>` : ''}
      ${(p.decisionCriteria || []).length ? `<div class="small" style="margin-bottom:6px"><span class="dim">Decides on:</span> ${esc((p.decisionCriteria || []).join(', '))}</div>` : ''}
      ${(p.painPoints || []).length ? `<div class="small" style="margin-bottom:6px"><span class="dim">Pains:</span> ${esc((p.painPoints || []).join(' · '))}</div>` : ''}
      ${(p.objections || []).length ? `<div class="small dim" style="margin:9px 0 4px">OBJECTIONS</div>
        <div class="cap">${esc((p.objections || []).map(o => (o.objection || '') + '\n→ ' + (o.response || '')).join('\n\n'))}</div>` : ''}
      ${(p.hookExamples || []).length ? `<div class="small dim" style="margin:9px 0 4px">HOOKS</div>
        <div class="cap">${esc((p.hookExamples || []).join('\n'))}</div>` : ''}
      ${p.wrongMove ? `<div class="small" style="margin-top:8px"><span class="dim">Never:</span> ${esc(p.wrongMove)}</div>` : ''}
    </div>`).join('');
}

function humanKey(k) {
  return k.replace(/([A-Z])/g, ' $1').replace(/^./, c => c.toUpperCase()).trim();
}

function renderGeneric(obj, depth) {
  depth = depth || 0;
  if (obj === null || obj === undefined || obj === '') return '';
  if (typeof obj !== 'object') return `<div class="small">${esc(obj)}</div>`;

  if (Array.isArray(obj)) {
    if (!obj.length) return '';
    if (typeof obj[0] !== 'object') {
      return '<ul class="small" style="margin:4px 0 10px;padding-left:18px;line-height:1.7">' +
        obj.map(x => `<li>${esc(x)}</li>`).join('') + '</ul>';
    }
    return obj.map(o => `<div class="repeat-item">${renderGeneric(o, depth + 1)}</div>`).join('');
  }

  return Object.keys(obj).map(k => {
    const v = obj[k];
    if (v === null || v === undefined || v === '' || (Array.isArray(v) && !v.length)) return '';
    const label = humanKey(k);
    if (typeof v === 'object') {
      return `<div style="margin-bottom:${depth ? 8 : 16}px">
        <div class="small dim" style="text-transform:uppercase;letter-spacing:.6px;margin-bottom:5px">${esc(label)}</div>
        ${renderGeneric(v, depth + 1)}</div>`;
    }
    return `<div class="small" style="margin-bottom:5px"><span class="dim">${esc(label)}:</span> ${esc(v)}</div>`;
  }).join('');
}

/* -------------------------------------------------------------- calendar */

async function viewCalendar() {
  S.campaigns = await tryCall(api.campaign.list) || [];
  if (!S.campaigns.length) {
    view().innerHTML = `<div class="page-head"><h1>Calendar</h1></div>
      <div class="empty"><h3>No campaigns yet</h3><p>Run a campaign and its calendar appears here.</p></div>`;
    return;
  }
  const id = S.currentCampaignId || S.campaigns[S.campaigns.length - 1].id;
  S.currentCampaignId = id;
  const c = await call(api.campaign.get, { id });
  S.campaign = c;
  const cal = (c.data && c.data.calendar) || [];

  view().innerHTML = `
    <div class="page-head">
      <h1>${esc(c.name)}</h1>
      <p>${cal.length} posts · ${esc(c.data.startDate || '')} → ${esc(c.data.endDate || '')} · ${esc(c.brandName || '')}</p>
    </div>

    <div class="field" style="max-width:420px">
      <label>Campaign</label>
      <select id="campSelect">
        ${S.campaigns.map(x => `<option value="${esc(x.id)}" ${x.id === id ? 'selected' : ''}>${esc(x.name)} (${x.posts} posts)</option>`).join('')}
      </select>
    </div>

    <div class="btn-row" style="margin-bottom:18px">
      <button class="btn primary" data-act="queueCampaign" data-id="${esc(id)}">Send to publishing queue</button>
      <button class="btn" data-act="exportMenu" data-id="${esc(id)}">Export…</button>
      <button class="btn" data-act="viewPack" data-id="${esc(id)}">Campaign pack</button>
      <button class="btn danger sm" data-act="deleteCampaign" data-id="${esc(id)}">Delete</button>
    </div>

    <div class="tabs">
      ${['Calendar', 'Strategy', 'Creative', 'Ads', 'WhatsApp', 'Scripts & FAQ'].map((t, i) =>
        `<button class="tab ${i === 0 ? 'on' : ''}" data-act="campTab" data-tab="${i}">${t}</button>`).join('')}
    </div>
    <div id="campBody"></div>
  `;

  $('#campSelect').addEventListener('change', async e => {
    S.currentCampaignId = e.target.value;
    viewCalendar();
  });

  campTab(0);
}

function campTab(n) {
  const c = S.campaign;
  const d = c.data || {};
  const body = $('#campBody');
  document.querySelectorAll('.tab').forEach((t, i) => t.classList.toggle('on', i === Number(n)));

  if (Number(n) === 0) {
    body.innerHTML = renderCalendarTable(d.calendar || []);
  } else if (Number(n) === 1) {
    body.innerHTML = `<div class="card">${renderGeneric(d.strategy || {})}</div>
      <div class="card">${renderGeneric(d.campaign || {})}</div>`;
  } else if (Number(n) === 2) {
    body.innerHTML = renderPrompts((d.creatives && d.creatives.prompts) || []);
  } else if (Number(n) === 3) {
    body.innerHTML = renderAds((d.ads && d.ads.ads) || []);
  } else if (Number(n) === 4) {
    const seq = (d.campaign && d.campaign.whatsappSequence) || [];
    body.innerHTML = seq.length ? seq.map((w, i) => `
      <div class="card" style="margin-top:12px">
        <div class="btn-row" style="justify-content:space-between;margin-bottom:8px">
          <div><strong>Day ${esc(w.day)}</strong> <span class="small dim">${esc(w.segment || '')}</span></div>
          <button class="btn sm" data-act="copyIdx" data-idx="${i}">Copy</button>
        </div>
        <div class="cap" id="cap_${i}">${esc(w.message || '')}</div>
      </div>`).join('') : '<div class="empty"><p>No WhatsApp sequence in this campaign.</p></div>';
  } else {
    const cm = d.campaign || {};
    body.innerHTML = `
      ${(cm.salesScripts || []).map(s => `<div class="card" style="margin-top:12px">
        <h4 style="margin:0 0 8px">${esc(s.scenario || '')}</h4>
        <div class="cap">${esc(s.script || '')}</div></div>`).join('')}
      ${(cm.faqs || []).length ? `<div class="card" style="margin-top:12px"><h4 style="margin:0 0 10px">Customer FAQs</h4>
        ${cm.faqs.map(f => `<div style="margin-bottom:12px">
          <div style="font-weight:600;margin-bottom:3px">${esc(f.q)}</div>
          <div class="small muted">${esc(f.a)}</div></div>`).join('')}</div>` : ''}`;
  }
}

/* ----------------------------------------------------------------- queue */

async function viewQueue() {
  S.queue = await tryCall(api.queue.list) || [];
  const s = S.settings;
  const counts = {
    queued: S.queue.filter(q => q.status === 'queued').length,
    sent: S.queue.filter(q => q.status === 'sent').length,
    failed: S.queue.filter(q => q.status === 'failed').length
  };

  view().innerHTML = `
    <div class="page-head">
      <h1>Publishing</h1>
      <p>TANGAZO fires each scheduled post at a webhook you control. Make.com, Zapier or n8n does the actual posting — they already hold the approved Meta, TikTok and LinkedIn connections, so you skip weeks of app review.</p>
    </div>

    ${!s.webhookUrl ? `<div class="inline-note">
      <strong>No webhook connected.</strong> Open Settings, paste a Make.com or Zapier webhook URL, and turn on Auto-publish.
      Until then you can still export the calendar as a CSV and bulk-upload it to any scheduler.
    </div>` : `<div class="inline-note">
      Auto-publish is <strong>${s.autoPublish ? 'ON' : 'OFF'}</strong> · posts fire while TANGAZO is running.
      ${s.autoPublish ? '' : ' Turn it on in Settings.'}
    </div>`}

    <div class="grid c3">
      <div class="stat"><div class="n">${counts.queued}</div><div class="l">Queued</div></div>
      <div class="stat"><div class="n">${counts.sent}</div><div class="l">Sent</div></div>
      <div class="stat"><div class="n" style="color:${counts.failed ? 'var(--red)' : 'inherit'}">${counts.failed}</div><div class="l">Failed</div></div>
    </div>

    <div class="btn-row" style="margin:18px 0">
      <button class="btn" data-act="tickNow">Run scheduler now</button>
      <button class="btn danger sm" data-act="clearQueue">Clear queue</button>
    </div>

    ${S.queue.length ? `<div class="tbl-wrap"><table>
      <tr><th>Scheduled</th><th>Channel</th><th>Post</th><th>Status</th><th></th></tr>
      ${S.queue.map(q => `<tr>
        <td class="small dim">${esc(fmtDateTime(q.scheduledAt))}</td>
        <td><span class="tag ${esc(q.channel)}">${esc(q.channel)}</span></td>
        <td class="small">${esc(String(q.caption || '').slice(0, 80))}…${q.lastError ? `<div class="small" style="color:var(--red);margin-top:4px">${esc(q.lastError)}</div>` : ''}</td>
        <td><span class="tag ${esc(q.status)}">${esc(q.status)}</span></td>
        <td><div class="btn-row">
          ${q.status !== 'sent' ? `<button class="btn sm" data-act="publishNow" data-id="${esc(q.id)}">Send now</button>` : ''}
          <button class="icon-btn" data-act="removeQueue" data-id="${esc(q.id)}">✕</button>
        </div></td>
      </tr>`).join('')}
    </table></div>` : `<div class="empty"><h3>Queue is empty</h3><p>Open a campaign calendar and press “Send to publishing queue”.</p></div>`}
  `;
}

/* --------------------------------------------------------------- library */

async function viewLibrary() {
  S.content = await tryCall(api.content.list, {}) || [];
  view().innerHTML = `
    <div class="page-head">
      <h1>Library</h1>
      <p>Everything the agents have produced, newest first.</p>
    </div>
    ${S.content.length ? S.content.map(c => `
      <div class="list-item">
        <div>
          <h4>${esc(c.title || c.agentName)}</h4>
          <div class="meta">${esc(c.agentName)} · ${esc(c.brandName || '')} · ${esc(fmtDate(c.createdAt))}</div>
        </div>
        <div class="btn-row">
          <button class="btn sm" data-act="openContent" data-id="${esc(c.id)}">Open</button>
          <button class="icon-btn" data-act="deleteContent" data-id="${esc(c.id)}">✕</button>
        </div>
      </div>`).join('') : `<div class="empty"><h3>Nothing yet</h3><p>Run an agent and its output lands here.</p></div>`}
  `;
}

/* ----------------------------------------------------------- brand brain */

function brandDraft() {
  if (!S.editBrand || S.editBrand.id !== S.activeBrandId) {
    S.editBrand = JSON.parse(JSON.stringify(activeBrand() || {}));
  }
  return S.editBrand;
}

function viewBrain() {
  const b = brandDraft();
  if (!b || !b.id) {
    view().innerHTML = `<div class="empty"><h3>No brand</h3><p>Pick “+ New brand” at the top left.</p></div>`;
    return;
  }

  const tabs = [
    ['identity', 'Identity'], ['voice', 'Voice'], ['visual', 'Visual'],
    ['products', 'Products'], ['personas', 'Personas'], ['channels', 'Channels'], ['rules', 'Rules & goals']
  ];

  view().innerHTML = `
    <div class="page-head">
      <h1>Brand Brain</h1>
      <p>The agents read this before every generation. The more real detail here, the less generic everything downstream becomes.</p>
    </div>

    <div class="tabs">
      ${tabs.map(([k, l]) => `<button class="tab ${S.brainTab === k ? 'on' : ''}" data-act="brainTab" data-tab="${k}">${l}</button>`).join('')}
    </div>

    <div id="brainBody"></div>

    <div class="btn-row" style="margin-top:20px">
      <button class="btn primary" data-act="saveBrand">Save brand</button>
      <button class="btn" data-act="previewBrief">Preview what agents see</button>
      <button class="btn danger sm" data-act="deleteBrand">Delete brand</button>
    </div>
  `;
  brainBody();
}

function txt(path, label, opts) {
  const b = brandDraft();
  const v = path.split('.').reduce((o, k) => (o || {})[k], b) || '';
  const o = opts || {};
  if (o.area) {
    return `<div class="field"><label>${esc(label)}</label>
      <textarea data-bind="${path}" rows="${o.rows || 3}" placeholder="${esc(o.ph || '')}">${esc(v)}</textarea>
      ${o.hint ? `<div class="hint">${esc(o.hint)}</div>` : ''}</div>`;
  }
  return `<div class="field"><label>${esc(label)}</label>
    <input type="text" data-bind="${path}" value="${esc(v)}" placeholder="${esc(o.ph || '')}">
    ${o.hint ? `<div class="hint">${esc(o.hint)}</div>` : ''}</div>`;
}

function lines(path, label, hint) {
  const b = brandDraft();
  const arr = path.split('.').reduce((o, k) => (o || {})[k], b) || [];
  return `<div class="field"><label>${esc(label)}</label>
    <textarea data-bind-lines="${path}" rows="4">${esc((arr || []).join('\n'))}</textarea>
    <div class="hint">${esc(hint || 'One per line.')}</div></div>`;
}

function brainBody() {
  const b = brandDraft();
  const body = $('#brainBody');
  if (!body) return;
  const t = S.brainTab;

  if (t === 'identity') {
    body.innerHTML = `<div class="card">
      ${txt('name', 'Brand name')}
      ${txt('legalName', 'Legal name')}
      ${txt('tagline', 'Tagline')}
      ${txt('oneLiner', 'One-liner — what the business actually sells', { area: true, rows: 2 })}
      <div class="row">${txt('city', 'City')}${txt('country', 'Country')}${txt('currency', 'Currency')}</div>
      ${lines('languages', 'Languages', 'One per line. The agents will mix them the way your market speaks.')}
      ${txt('positioning', 'Positioning — the one sentence everything leans on', { area: true, rows: 2 })}
      ${lines('differentiators', 'Differentiators')}
      ${lines('proofPoints', 'Proof points', 'Facts you can actually stand behind. Agents may only use these.')}
    </div>`;
  } else if (t === 'voice') {
    body.innerHTML = `<div class="card">
      ${txt('tone', 'Tone of voice', { area: true, rows: 3, ph: 'Confident, practical, respectful. Talks like a supplier who knows the trade.' })}
      ${lines('voiceRules', 'Voice rules', 'Hard rules the agents must obey. One per line.')}
      ${lines('bannedWords', 'Banned words', 'Words that must never appear. One per line.')}
      ${lines('slogans', 'Slogans')}
      ${txt('cta', 'Default call to action')}
    </div>`;
  } else if (t === 'visual') {
    body.innerHTML = `<div class="card">
      <div class="field"><label>Colours</label>
        <div id="colorList">${(b.colors || []).map((c, i) => `
          <div class="repeat-item">
            <button class="icon-btn del" data-act="delRepeat" data-path="colors" data-idx="${i}">✕</button>
            <div class="row">
              <div class="field" style="margin:0"><label>Name</label><input type="text" data-bind="colors.${i}.name" value="${esc(c.name)}"></div>
              <div class="field" style="margin:0"><label>Hex</label><input type="text" data-bind="colors.${i}.hex" value="${esc(c.hex)}"></div>
              <div class="field" style="margin:0"><label>Used for</label><input type="text" data-bind="colors.${i}.use" value="${esc(c.use || '')}"></div>
            </div>
          </div>`).join('')}</div>
        <button class="btn sm" data-act="addRepeat" data-path="colors">+ Add colour</button>
      </div>
      <div class="divider"></div>
      <div class="row">${txt('fonts.heading', 'Heading font')}${txt('fonts.body', 'Body font')}</div>
      ${txt('logoNotes', 'Logo rules', { area: true, rows: 2, ph: 'Where it sits, clear space, what must never be done to it' })}
      ${txt('visualStyle', 'Visual style', { area: true, rows: 3 })}
      ${txt('photographyStyle', 'Photography / video style', { area: true, rows: 3 })}
    </div>`;
  } else if (t === 'products') {
    body.innerHTML = `<div class="card">
      <div id="productList">${(b.products || []).map((p, i) => `
        <div class="repeat-item">
          <button class="icon-btn del" data-act="delRepeat" data-path="products" data-idx="${i}">✕</button>
          <div class="row">
            <div class="field" style="margin:0"><label>Product</label><input type="text" data-bind="products.${i}.name" value="${esc(p.name)}"></div>
            <div class="field" style="margin:0"><label>Price</label><input type="text" data-bind="products.${i}.price" value="${esc(p.price || '')}"></div>
            <div class="field" style="margin:0"><label>Unit</label><input type="text" data-bind="products.${i}.unit" value="${esc(p.unit || '')}"></div>
          </div>
          <div class="field" style="margin:10px 0 0"><label>Description</label>
            <textarea data-bind="products.${i}.description" rows="2">${esc(p.description || '')}</textarea></div>
        </div>`).join('')}</div>
      <button class="btn sm" data-act="addRepeat" data-path="products">+ Add product</button>
    </div>`;
  } else if (t === 'personas') {
    body.innerHTML = `<div class="card">
      <div id="personaList">${(b.personas || []).map((p, i) => `
        <div class="repeat-item">
          <button class="icon-btn del" data-act="delRepeat" data-path="personas" data-idx="${i}">✕</button>
          <div class="row">
            <div class="field" style="margin:0"><label>Persona</label><input type="text" data-bind="personas.${i}.name" value="${esc(p.name)}"></div>
            <div class="field" style="margin:0"><label>Best channel</label><input type="text" data-bind="personas.${i}.channel" value="${esc(p.channel || '')}"></div>
          </div>
          <div class="field" style="margin:10px 0 0"><label>Who they are</label><input type="text" data-bind="personas.${i}.role" value="${esc(p.role || '')}"></div>
          <div class="field" style="margin:10px 0 0"><label>Pain points</label><textarea data-bind="personas.${i}.painPoints" rows="2">${esc(p.painPoints || '')}</textarea></div>
          <div class="field" style="margin:10px 0 0"><label>Buying triggers</label><textarea data-bind="personas.${i}.triggers" rows="2">${esc(p.triggers || '')}</textarea></div>
          <div class="field" style="margin:10px 0 0"><label>Objections</label><textarea data-bind="personas.${i}.objections" rows="2">${esc(p.objections || '')}</textarea></div>
          <div class="field" style="margin:10px 0 0"><label>Core message</label><textarea data-bind="personas.${i}.message" rows="2">${esc(p.message || '')}</textarea></div>
        </div>`).join('')}</div>
      <button class="btn sm" data-act="addRepeat" data-path="personas">+ Add persona</button>
      <div class="divider"></div>
      <div id="compList">${(b.competitors || []).map((c, i) => `
        <div class="repeat-item">
          <button class="icon-btn del" data-act="delRepeat" data-path="competitors" data-idx="${i}">✕</button>
          <div class="row">
            <div class="field" style="margin:0"><label>Competitor</label><input type="text" data-bind="competitors.${i}.name" value="${esc(c.name)}"></div>
            <div class="field" style="margin:0"><label>Handle</label><input type="text" data-bind="competitors.${i}.handle" value="${esc(c.handle || '')}"></div>
          </div>
          <div class="field" style="margin:10px 0 0"><label>Notes</label><textarea data-bind="competitors.${i}.notes" rows="2">${esc(c.notes || '')}</textarea></div>
        </div>`).join('')}</div>
      <button class="btn sm" data-act="addRepeat" data-path="competitors">+ Add competitor</button>
    </div>`;
  } else if (t === 'channels') {
    const ch = b.channels || {};
    body.innerHTML = `<div class="card">
      ${Object.keys(ch).map(k => `
        <div class="repeat-item">
          <div class="row">
            <div class="field" style="margin:0"><label>${esc(k)}</label>
              <input type="text" data-bind="channels.${k}.${k === 'whatsapp' ? 'number' : 'handle'}"
                value="${esc(ch[k][k === 'whatsapp' ? 'number' : 'handle'] || '')}" placeholder="${k === 'whatsapp' ? '+255…' : '@handle'}"></div>
            <div class="field" style="margin:0"><label>Active</label>
              <select data-bind="channels.${k}.active">
                <option value="true" ${ch[k].active !== false ? 'selected' : ''}>Yes</option>
                <option value="false" ${ch[k].active === false ? 'selected' : ''}>No</option>
              </select></div>
          </div>
          <div class="field" style="margin:10px 0 0"><label>What this channel is for</label>
            <textarea data-bind="channels.${k}.notes" rows="2">${esc(ch[k].notes || '')}</textarea></div>
        </div>`).join('')}
      ${txt('postingCadence', 'Posting cadence')}
      <div class="divider"></div>
      <div id="hashList">${(b.hashtagSets || []).map((h, i) => `
        <div class="repeat-item">
          <button class="icon-btn del" data-act="delRepeat" data-path="hashtagSets" data-idx="${i}">✕</button>
          <div class="field" style="margin:0"><label>Set name</label><input type="text" data-bind="hashtagSets.${i}.name" value="${esc(h.name)}"></div>
          <div class="field" style="margin:10px 0 0"><label>Tags</label>
            <textarea data-bind-words="hashtagSets.${i}.tags" rows="2">${esc((h.tags || []).join(' '))}</textarea></div>
        </div>`).join('')}</div>
      <button class="btn sm" data-act="addRepeat" data-path="hashtagSets">+ Add hashtag set</button>
    </div>`;
  } else {
    body.innerHTML = `<div class="card">
      ${txt('complianceNotes', 'Compliance rules — what must never be claimed', { area: true, rows: 3 })}
      ${txt('goals', 'Business goals', { area: true, rows: 3, ph: 'What this marketing is actually for' })}
    </div>`;
  }

  // live binding
  body.querySelectorAll('[data-bind]').forEach(el => {
    el.addEventListener('input', () => setPath(brandDraft(), el.dataset.bind, coerce(el.value)));
    el.addEventListener('change', () => setPath(brandDraft(), el.dataset.bind, coerce(el.value)));
  });
  body.querySelectorAll('[data-bind-lines]').forEach(el => {
    el.addEventListener('input', () => setPath(brandDraft(), el.dataset.bindLines,
      el.value.split('\n').map(s => s.trim()).filter(Boolean)));
  });
  body.querySelectorAll('[data-bind-words]').forEach(el => {
    el.addEventListener('input', () => setPath(brandDraft(), el.dataset.bindWords,
      el.value.split(/\s+/).map(s => s.trim()).filter(Boolean)));
  });
}

function coerce(v) {
  if (v === 'true') return true;
  if (v === 'false') return false;
  return v;
}

function setPath(obj, path, value) {
  const parts = path.split('.');
  let cur = obj;
  for (let i = 0; i < parts.length - 1; i++) {
    const k = parts[i];
    if (cur[k] === undefined || cur[k] === null) cur[k] = /^\d+$/.test(parts[i + 1]) ? [] : {};
    cur = cur[k];
  }
  cur[parts[parts.length - 1]] = value;
}

const REPEAT_TEMPLATES = {
  colors: { name: '', hex: '#000000', use: '' },
  products: { name: '', description: '', price: '', unit: '', hero: false },
  personas: { name: '', role: '', painPoints: '', triggers: '', objections: '', channel: '', message: '' },
  competitors: { name: '', handle: '', notes: '' },
  hashtagSets: { name: '', tags: [] }
};

/* -------------------------------------------------------------- settings */

function viewSettings() {
  const s = S.settings;
  view().innerHTML = `
    <div class="page-head">
      <h1>Settings</h1>
      <p>Your API key stays on this machine, encrypted by Windows where available. Nothing is sent anywhere except Anthropic and your own webhook.</p>
    </div>

    <div class="card">
      <h2 class="sec" style="margin-top:0">Claude API</h2>
      <div class="field">
        <label>Anthropic API key</label>
        <input type="password" id="setKey" value="${esc(s.apiKey || '')}" placeholder="sk-ant-...">
        <div class="hint">Get one at console.anthropic.com → API Keys. This is billed separately from a Claude subscription.
          <a href="#" data-act="openUrl" data-url="https://console.anthropic.com/settings/keys" class="gold">Open console</a></div>
      </div>
      <div class="row">
        <div class="field"><label>Model</label><input type="text" id="setModel" value="${esc(s.model || '')}"></div>
        <div class="field"><label>Max tokens per call</label><input type="number" id="setMax" value="${esc(s.maxTokens || 8000)}"></div>
      </div>
      <div class="btn-row">
        <button class="btn" data-act="testKey">Test connection</button>
      </div>
    </div>

    <div class="card">
      <h2 class="sec" style="margin-top:0">Auto-publishing</h2>
      <div class="inline-note">
        Instagram, Facebook, TikTok and LinkedIn all require business verification and app review before
        software may post for you. Rather than make you wait weeks for that, TANGAZO posts each scheduled
        item to a webhook you own. Make.com, Zapier and n8n already hold approved connections to all four
        platforms — they do the posting, you keep control.
        <br><br><strong>Setup:</strong> create a Custom Webhook in Make.com (or Catch Hook in Zapier) → paste the URL below →
        in your scenario, route on the <code>channel</code> field and map <code>text</code> to the post body and <code>mediaUrl</code> to the image.
      </div>
      <div class="field">
        <label>Webhook URL</label>
        <input type="text" id="setHook" value="${esc(s.webhookUrl || '')}" placeholder="https://hook.eu2.make.com/...">
      </div>
      <div class="field">
        <label>Shared secret (optional)</label>
        <input type="text" id="setSecret" value="${esc(s.webhookSecret || '')}" placeholder="Used to sign each request as x-tangazo-signature">
      </div>
      <div class="field">
        <label>Auto-publish</label>
        <select id="setAuto">
          <option value="false" ${!s.autoPublish ? 'selected' : ''}>Off — I will send manually</option>
          <option value="true" ${s.autoPublish ? 'selected' : ''}>On — fire posts at their scheduled time</option>
        </select>
        <div class="hint">Posts only fire while TANGAZO is open. Leave it running, or use the CSV export with a cloud scheduler instead.</div>
      </div>
      <div class="btn-row">
        <button class="btn" data-act="testHook">Send test to webhook</button>
      </div>
    </div>

    <div class="card">
      <h2 class="sec" style="margin-top:0">Data</h2>
      <div class="btn-row">
        <button class="btn primary" data-act="saveSettings">Save settings</button>
        <button class="btn" data-act="openData">Open data folder</button>
        <button class="btn" data-act="backup">Back up everything</button>
        <button class="btn" data-act="restore">Restore from backup</button>
      </div>
    </div>
  `;
}

/* ---------------------------------------------------------------- actions */

async function handleAction(act, d, el, ev) {
  ev.preventDefault();

  switch (act) {

    case 'go': {
      S.view = d.view;
      document.querySelectorAll('.nav-item').forEach(n => n.classList.toggle('active', n.dataset.view === d.view));
      render();
      break;
    }

    case 'chip': el.classList.toggle('on'); break;

    case 'closeModal': closeModal(); break;

    case 'openUrl': await api.shell.openExternal({ url: d.url }); break;

    /* ---- campaign --------------------------------------------------- */
    case 'runCampaign': {
      const brief = $('#cBrief').value.trim();
      if (!brief) { toast('Write a campaign brief first', 'err'); return; }
      S.busy = true;
      S.progress = [];
      el.disabled = true;
      el.textContent = 'Working…';
      try {
        const input = {
          brief,
          days: Number($('#cDays').value) || 30,
          startDate: $('#cStart').value,
          budget: $('#cBudget').value,
          channels: Array.from($('#cChannels').querySelectorAll('.chip.on')).map(c => c.dataset.ch)
        };
        const row = await call(api.campaign.run, { brandId: S.activeBrandId, input });
        toast('Campaign ready: ' + row.name, 'ok');
        S.currentCampaignId = row.id;
        S.view = 'calendar';
        document.querySelectorAll('.nav-item').forEach(n => n.classList.toggle('active', n.dataset.view === 'calendar'));
        render();
      } catch (err) {
        renderProgress();
      } finally {
        S.busy = false;
      }
      break;
    }

    case 'cancel': await api.agent.cancel(); S.busy = false; toast('Cancelled'); break;

    /* ---- agents ----------------------------------------------------- */
    case 'openAgent': openAgent(d.id); break;

    case 'runAgent': {
      const agent = S.agents.find(a => a.id === d.id);
      let input;
      try { input = collectInputs(agent); }
      catch (err) { toast(err.message, 'err'); return; }
      el.disabled = true;
      el.textContent = 'Thinking…';
      $('#agentOut').innerHTML = '<div class="small dim" style="margin-top:14px">The agent is working. This usually takes 20–60 seconds.</div>';
      try {
        const res = await call(api.agent.run, { agentId: d.id, brandId: S.activeBrandId, input });
        S.lastResult = res.data;
        $('#agentOut').innerHTML = '<div class="divider"></div>' + renderResult(res.data);
        toast('Done — saved to Library', 'ok');
      } catch (err) {
        $('#agentOut').innerHTML = `<div class="err-note" style="margin-top:14px">${esc(err.message)}</div>`;
      } finally {
        el.disabled = false;
        el.textContent = 'Run agent';
      }
      break;
    }

    case 'copyIdx': {
      const node = document.getElementById('cap_' + d.idx);
      if (node) copy(node.textContent);
      break;
    }

    case 'showSlot': {
      const cal = (S.campaign && S.campaign.data.calendar) || (S.lastResult && S.lastResult.calendar) || [];
      const p = cal[Number(d.idx)];
      if (!p) return;
      modal('Day ' + p.day + ' · ' + p.channel, `
        <div class="small dim" style="margin-bottom:10px">${esc(p.date)} at ${esc(p.time)} · ${esc(p.format)}${p.persona ? ' · ' + esc(p.persona) : ''}</div>
        ${p.hook ? `<div class="small gold" style="margin-bottom:9px">HOOK: ${esc(p.hook)}</div>` : ''}
        <div class="cap" id="cap_modal">${esc(p.caption || '')}${(p.hashtags || []).length ? '\n\n' + esc((p.hashtags || []).join(' ')) : ''}</div>
        ${p.cta ? `<div class="small" style="margin-top:9px"><span class="dim">CTA:</span> ${esc(p.cta)}</div>` : ''}
        ${p.visualBrief ? `<div class="small" style="margin-top:7px"><span class="dim">Visual:</span> ${esc(p.visualBrief)}</div>` : ''}
        <div class="btn-row" style="margin-top:14px"><button class="btn" data-act="copyModal">Copy caption</button></div>`);
      break;
    }

    case 'copyModal': copy($('#cap_modal').textContent); break;

    case 'campTab': campTab(d.tab); break;

    case 'openCampaign': {
      S.currentCampaignId = d.id;
      S.view = 'calendar';
      document.querySelectorAll('.nav-item').forEach(n => n.classList.toggle('active', n.dataset.view === 'calendar'));
      render();
      break;
    }

    case 'deleteCampaign': {
      if (!confirm('Delete this campaign? This cannot be undone.')) return;
      await call(api.campaign.remove, { id: d.id });
      S.currentCampaignId = null;
      toast('Deleted');
      render();
      break;
    }

    case 'exportMenu': {
      const formats = await call(api.exports.formats);
      modal('Export campaign', `
        <p class="muted small" style="margin-top:-6px">Pick a format. CSVs import straight into Publer, Buffer, Hootsuite or Metricool for bulk scheduling.</p>
        <div class="divider"></div>
        ${formats.map(f => `<div class="list-item">
          <div><h4>${esc(f.name)}</h4><div class="meta">.${esc(f.ext)}</div></div>
          <button class="btn sm" data-act="doExport" data-id="${esc(d.id)}" data-fmt="${esc(f.id)}">Save</button>
        </div>`).join('')}`);
      break;
    }

    case 'doExport': {
      const res = await call(api.exports.campaign, { campaignId: d.id, format: d.fmt });
      if (!res.canceled) { toast('Saved to ' + res.path, 'ok'); closeModal(); }
      break;
    }

    case 'viewPack': {
      const c = await call(api.campaign.get, { id: d.id });
      modal(c.name, `<div class="pre" style="max-height:62vh">${esc(JSON.stringify(c.data, null, 2))}</div>`);
      break;
    }

    /* ---- queue ------------------------------------------------------ */
    case 'queueCampaign': {
      try {
        const rows = await call(api.queue.enqueue, { campaignId: d.id });
        toast(rows.length + ' posts queued', 'ok');
        S.view = 'queue';
        document.querySelectorAll('.nav-item').forEach(n => n.classList.toggle('active', n.dataset.view === 'queue'));
        render();
      } catch (_) {}
      break;
    }
    case 'publishNow': await tryCall(api.queue.publishNow, { id: d.id }); viewQueue(); break;
    case 'removeQueue': await tryCall(api.queue.remove, { id: d.id }); viewQueue(); break;
    case 'clearQueue': {
      if (!confirm('Clear the whole publishing queue?')) return;
      const db = await tryCall(api.queue.list);
      for (const q of db || []) await api.queue.remove({ id: q.id });
      toast('Queue cleared');
      viewQueue();
      break;
    }
    case 'tickNow': {
      const r = await tryCall(api.queue.tick);
      if (r && r.skipped) toast('Auto-publish is off, or no webhook set', 'err');
      else if (r) toast('Sent ' + r.sent + ', failed ' + r.failed, r.failed ? 'err' : 'ok');
      viewQueue();
      break;
    }

    /* ---- library ---------------------------------------------------- */
    case 'openContent': {
      const c = await call(api.content.get, { id: d.id });
      S.lastResult = c.data;
      modal(c.title || c.agentName, renderResult(c.data));
      break;
    }
    case 'deleteContent': await tryCall(api.content.remove, { id: d.id }); viewLibrary(); break;

    /* ---- brand ------------------------------------------------------ */
    case 'brainTab': S.brainTab = d.tab; viewBrain(); break;

    case 'addRepeat': {
      const b = brandDraft();
      if (!Array.isArray(b[d.path])) b[d.path] = [];
      b[d.path].push(JSON.parse(JSON.stringify(REPEAT_TEMPLATES[d.path] || {})));
      brainBody();
      break;
    }
    case 'delRepeat': {
      const b = brandDraft();
      (b[d.path] || []).splice(Number(d.idx), 1);
      brainBody();
      break;
    }

    case 'saveBrand': {
      const b = brandDraft();
      const saved = await call(api.brand.save, { id: b.id, brand: b });
      const i = S.brands.findIndex(x => x.id === b.id);
      if (i >= 0) S.brands[i] = saved;
      S.editBrand = null;
      renderBrandSelect();
      toast('Brand saved', 'ok');
      break;
    }

    case 'previewBrief': {
      await call(api.brand.save, { id: brandDraft().id, brand: brandDraft() });
      const brief = await call(api.brand.brief, { id: brandDraft().id });
      modal('What every agent reads', `<div class="pre" style="max-height:60vh">${esc(brief)}</div>`);
      break;
    }

    case 'deleteBrand': {
      if (S.brands.length <= 1) { toast('You need at least one brand', 'err'); return; }
      if (!confirm('Delete this brand and keep its campaigns? The brand profile will be gone.')) return;
      await call(api.brand.remove, { id: S.activeBrandId });
      S.brands = S.brands.filter(b => b.id !== S.activeBrandId);
      S.activeBrandId = S.brands[0].id;
      S.editBrand = null;
      renderBrandSelect();
      render();
      break;
    }

    /* ---- settings --------------------------------------------------- */
    case 'saveSettings': {
      const patch = {
        apiKey: $('#setKey').value.trim(),
        model: $('#setModel').value.trim(),
        maxTokens: Number($('#setMax').value) || 8000,
        webhookUrl: $('#setHook').value.trim(),
        webhookSecret: $('#setSecret').value.trim(),
        autoPublish: $('#setAuto').value === 'true'
      };
      S.settings = await call(api.settings.save, patch);
      updateStatus();
      toast('Settings saved', 'ok');
      break;
    }

    case 'testKey': {
      el.disabled = true; el.textContent = 'Testing…';
      try {
        await call(api.settings.save, { apiKey: $('#setKey').value.trim(), model: $('#setModel').value.trim() });
        const r = await call(api.settings.testKey, {});
        toast(r.ok ? 'Connected to Claude' : 'Reached the API but got: ' + r.reply, r.ok ? 'ok' : 'err');
        S.settings = await call(api.settings.get);
        updateStatus();
      } catch (_) {}
      el.disabled = false; el.textContent = 'Test connection';
      break;
    }

    case 'testHook': {
      el.disabled = true; el.textContent = 'Sending…';
      try {
        await call(api.settings.testWebhook, { url: $('#setHook').value.trim(), secret: $('#setSecret').value.trim() });
        toast('Test sent — check your Make/Zapier scenario', 'ok');
      } catch (_) {}
      el.disabled = false; el.textContent = 'Send test to webhook';
      break;
    }

    case 'openData': await api.shell.openPath({}); break;
    case 'backup': { const r = await tryCall(api.data.backup); if (r && !r.canceled) toast('Backed up to ' + r.path, 'ok'); break; }
    case 'restore': {
      if (!confirm('Restore will replace everything currently in TANGAZO. Continue?')) return;
      const r = await tryCall(api.data.restore);
      if (r && !r.canceled) { toast('Restored', 'ok'); await boot(); }
      break;
    }
  }
}

boot().catch(err => {
  view().innerHTML = `<div class="err-note">Failed to start: ${esc(err.message)}</div>`;
});
