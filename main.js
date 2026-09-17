'use strict';
/**
 * TANGAZO - Electron main process.
 * Owns the data, the API key and every network call. The renderer only asks.
 */

const { app, BrowserWindow, ipcMain, dialog, shell, safeStorage, Menu } = require('electron');
const path = require('path');
const fs = require('fs');

const store = require('./src/core/store');
const brands = require('./src/core/brands');
const agents = require('./src/core/agents');
const pipeline = require('./src/core/pipeline');
const exporters = require('./src/core/exporters');
const publisher = require('./src/core/publisher');
const llm = require('./src/core/llm');

let win = null;
let running = null; // AbortController for the in-flight generation

/* ------------------------------------------------------------------ window */

function createWindow() {
  win = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 1040,
    minHeight: 640,
    backgroundColor: '#14171c',
    show: false,
    title: 'TANGAZO',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false
    }
  });

  win.once('ready-to-show', () => win.show());
  win.loadFile(path.join(__dirname, 'src', 'renderer', 'index.html'));

  // external links open in the real browser, never inside the app
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:\/\//i.test(url)) shell.openExternal(url);
    return { action: 'deny' };
  });

  const template = [
    {
      label: 'File',
      submenu: [
        { label: 'Open data folder', click: () => shell.openPath(store.dataDir()) },
        { type: 'separator' },
        { role: 'quit' }
      ]
    },
    { label: 'Edit', submenu: [{ role: 'undo' }, { role: 'redo' }, { type: 'separator' }, { role: 'cut' }, { role: 'copy' }, { role: 'paste' }, { role: 'selectAll' }] },
    { label: 'View', submenu: [{ role: 'reload' }, { role: 'toggleDevTools' }, { type: 'separator' }, { role: 'resetZoom' }, { role: 'zoomIn' }, { role: 'zoomOut' }, { type: 'separator' }, { role: 'togglefullscreen' }] }
  ];
  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}

/* -------------------------------------------------------------------- boot */

function firstRunSeed() {
  const db = store.getDb();
  if (!db.brands.length) {
    const zora = store.insert('brands', brands.zoraSeed());
    db.activeBrandId = zora.id;
    store.saveDb();
  }
  if (!db.activeBrandId && db.brands.length) {
    db.activeBrandId = db.brands[0].id;
    store.saveDb();
  }
}

app.whenReady().then(() => {
  store.init(app.getPath('userData'), safeStorage);
  firstRunSeed();

  publisher.setLogger(entry => {
    if (win && !win.isDestroyed()) win.webContents.send('publisher:log', entry);
  });
  publisher.start(60000);

  createWindow();

  if (process.env.TANGAZO_SMOKE) runSmokeTest();

  app.on('activate', () => { if (BrowserWindow.getAllWindows().length === 0) createWindow(); });
});

/**
 * Headless boot check used by `npm run smoke`. Loads the real window, walks
 * every view, and reports any renderer error. Never runs in normal use.
 */
function runSmokeTest() {
  const errors = [];
  win.webContents.on('console-message', (_e, level, message) => {
    if (level >= 2) errors.push(message);
  });
  win.webContents.on('render-process-gone', (_e, details) => {
    errors.push('renderer crashed: ' + JSON.stringify(details));
  });

  win.webContents.once('did-finish-load', async () => {
    const views = ['dashboard', 'campaign', 'agents', 'calendar', 'queue', 'library', 'brain', 'settings'];
    try {
      await new Promise(r => setTimeout(r, 1200));
      for (const v of views) {
        // A view is healthy if it rendered real markup OR a deliberate empty state.
        const r = await win.webContents.executeJavaScript(
          `(async () => { document.querySelector('.nav-item[data-view="${v}"]').click();
            await new Promise(r => setTimeout(r, 450));
            const el = document.querySelector('#view');
            return { len: el.innerHTML.length, empty: !!el.querySelector('.empty') }; })()`
        );
        const ok = r.len >= 400 || (r.empty && r.len >= 80);
        console.log('SMOKE view ' + v + ': ' + r.len + ' chars' + (r.empty ? ' (empty state)' : '') + (ok ? '' : '  <-- DID NOT RENDER'));
        if (!ok) errors.push('view "' + v + '" rendered nothing usable');
      }
      // open one agent modal
      const modalLen = await win.webContents.executeJavaScript(
        `(async () => { document.querySelector('.nav-item[data-view="agents"]').click();
          await new Promise(r => setTimeout(r, 300));
          document.querySelector('.agent-card').click();
          await new Promise(r => setTimeout(r, 300));
          return document.querySelector('#modalBody').innerHTML.length; })()`
      );
      console.log('SMOKE agent modal: ' + modalLen + ' chars');
      if (modalLen < 200) errors.push('agent modal did not render');
    } catch (err) {
      errors.push('smoke run threw: ' + err.message);
    }

    if (errors.length) {
      console.log('SMOKE FAILED:\n' + errors.map(e => '  - ' + e).join('\n'));
      app.exit(1);
    } else {
      console.log('SMOKE OK - all views rendered, no renderer errors');
      app.exit(0);
    }
  });
}

app.on('window-all-closed', () => { publisher.stop(); if (process.platform !== 'darwin') app.quit(); });

/* --------------------------------------------------------------- ipc: app */

const MASK = '••••••••';

/** Never hand a real key to the renderer - it only needs to know one exists. */
function maskedSettings() {
  const s = store.getSettings();
  const providers = {};
  for (const id of Object.keys(s.providers || {})) {
    const p = s.providers[id];
    providers[id] = {
      model: p.model || '',
      baseUrl: p.baseUrl || '',
      hasKey: !!p.apiKey,
      apiKey: p.apiKey ? MASK : ''
    };
  }
  const active = llm.describe(s);
  return Object.assign({}, s, {
    providers,
    hasApiKey: active.hasKey,
    activeProviderName: active.providerName,
    activeModel: active.model,
    providerList: llm.listProviders()
  });
}

function handle(channel, fn) {
  ipcMain.handle(channel, async (_evt, payload) => {
    try {
      return { ok: true, data: await fn(payload || {}) };
    } catch (err) {
      return { ok: false, error: err.message || String(err), raw: err.raw || null };
    }
  });
}

handle('app:bootstrap', async () => {
  const db = store.getDb();
  return {
    brands: db.brands,
    activeBrandId: db.activeBrandId,
    settings: maskedSettings(),
    agents: agents.listAgents(),
    campaigns: db.campaigns.map(c => ({
      id: c.id, name: c.name, brandId: c.brandId, createdAt: c.createdAt,
      days: c.data && c.data.days, startDate: c.data && c.data.startDate,
      posts: (c.data && c.data.calendar || []).length
    })),
    content: db.content.slice(-60).reverse(),
    queueCount: db.queue.length,
    version: app.getVersion(),
    dataDir: store.dataDir()
  };
});

/* ------------------------------------------------------------- ipc: brands */

handle('brand:list', async () => store.find('brands'));
handle('brand:get', async ({ id }) => store.findOne('brands', id));
handle('brand:create', async ({ name, seed }) => {
  const b = store.insert('brands', seed === 'zora' ? brands.zoraSeed() : brands.blankBrand(name));
  const db = store.getDb();
  if (!db.activeBrandId) { db.activeBrandId = b.id; store.saveDb(); }
  return b;
});
handle('brand:save', async ({ id, brand }) => store.update('brands', id, brand));
handle('brand:delete', async ({ id }) => {
  const ok = store.remove('brands', id);
  const db = store.getDb();
  if (db.activeBrandId === id) { db.activeBrandId = db.brands[0] ? db.brands[0].id : null; store.saveDb(); }
  return ok;
});
handle('brand:setActive', async ({ id }) => {
  const db = store.getDb();
  db.activeBrandId = id;
  store.saveDb();
  return id;
});
handle('brand:blank', async () => brands.blankBrand('New brand'));
handle('brand:brief', async ({ id }) => brands.brandBrief(store.findOne('brands', id)));

/* ------------------------------------------------------------ ipc: settings */

handle('settings:get', async () => maskedSettings());
handle('settings:providers', async () => llm.listProviders());

handle('settings:save', async (patch) => {
  const clean = Object.assign({}, patch || {});

  // The renderer sends back the mask for any key the user did not retype.
  // Dropping those preserves the stored key instead of wiping it.
  if (clean.providers) {
    const providers = {};
    for (const id of Object.keys(clean.providers)) {
      const p = Object.assign({}, clean.providers[id]);
      if (p.apiKey === MASK || p.apiKey === '') delete p.apiKey;
      delete p.hasKey;
      providers[id] = p;
    }
    clean.providers = providers;
  }

  const s = store.saveSettings(clean);
  if (s.autoPublish) publisher.start(60000); else publisher.stop();
  return maskedSettings();
});

handle('settings:testKey', async ({ provider, apiKey, model, baseUrl }) => {
  const s = store.getSettings();
  const id = provider || s.provider;
  const stored = (s.providers && s.providers[id]) || {};
  return llm.testKey({
    provider: id,
    apiKey: (apiKey && apiKey !== MASK) ? apiKey : stored.apiKey,
    model: model || stored.model,
    baseUrl: baseUrl || stored.baseUrl
  });
});
handle('settings:testWebhook', async ({ url, secret }) => {
  const s = store.getSettings();
  return publisher.testWebhook(url || s.webhookUrl, secret !== undefined ? secret : s.webhookSecret);
});

/* -------------------------------------------------------------- ipc: agents */

handle('agent:list', async () => agents.listAgents());

handle('agent:run', async ({ agentId, brandId, input, save }) => {
  const brand = store.findOne('brands', brandId) || store.findOne('brands', store.getDb().activeBrandId);
  if (!brand) throw new Error('No brand selected. Create a brand first.');
  const settings = store.getSettings();
  llm.assertReady(settings);

  running = new AbortController();
  try {
    const data = await pipeline.runAgent({
      agentId, brand, input, settings, signal: running.signal
    });
    const row = save === false ? null : store.insert('content', {
      agentId,
      agentName: agents.AGENTS[agentId].name,
      brandId: brand.id,
      brandName: brand.name,
      title: input.topic || input.goal || input.brief || input.subject || input.offer || input.theme || input.asset || agents.AGENTS[agentId].name,
      engine: llm.describe(settings),
      input,
      data
    });
    return { data, saved: row };
  } finally {
    running = null;
  }
});

handle('agent:cancel', async () => {
  if (running) { running.abort(); running = null; return true; }
  return false;
});

/* ----------------------------------------------------------- ipc: campaigns */

handle('campaign:run', async ({ brandId, input }) => {
  const brand = store.findOne('brands', brandId) || store.findOne('brands', store.getDb().activeBrandId);
  if (!brand) throw new Error('No brand selected. Create a brand first.');
  const settings = store.getSettings();
  llm.assertReady(settings);

  running = new AbortController();
  const send = (p) => { if (win && !win.isDestroyed()) win.webContents.send('campaign:progress', p); };

  try {
    const data = await pipeline.runCampaign({
      brand, input, settings, onProgress: send, signal: running.signal
    });
    const row = store.insert('campaigns', {
      name: (data.campaign && data.campaign.campaignName) || ('Campaign ' + new Date().toLocaleDateString()),
      brandId: brand.id,
      brandName: brand.name,
      engine: llm.describe(settings),
      data
    });
    send({ index: 6, total: 6, label: 'Done', status: 'complete' });
    return row;
  } finally {
    running = null;
  }
});

handle('campaign:list', async () => store.find('campaigns').map(c => ({
  id: c.id, name: c.name, brandId: c.brandId, brandName: c.brandName, createdAt: c.createdAt,
  days: c.data && c.data.days, startDate: c.data && c.data.startDate, endDate: c.data && c.data.endDate,
  posts: ((c.data && c.data.calendar) || []).length
})));
handle('campaign:get', async ({ id }) => store.findOne('campaigns', id));
handle('campaign:delete', async ({ id }) => store.remove('campaigns', id));
handle('campaign:updateSlot', async ({ id, index, patch }) => {
  const c = store.findOne('campaigns', id);
  if (!c) throw new Error('Campaign not found');
  c.data.calendar[index] = Object.assign({}, c.data.calendar[index], patch);
  store.saveDb();
  return c.data.calendar[index];
});

/* --------------------------------------------------------------- ipc: queue */

handle('queue:list', async ({ status } = {}) => {
  const rows = store.find('queue', q => !status || q.status === status);
  return rows.sort((a, b) => new Date(a.scheduledAt) - new Date(b.scheduledAt));
});
handle('queue:enqueue', async ({ campaignId }) => {
  const c = store.findOne('campaigns', campaignId);
  if (!c) throw new Error('Campaign not found');
  const already = store.find('queue', q => q.campaignId === campaignId);
  if (already.length) throw new Error('This campaign is already in the publishing queue (' + already.length + ' posts). Clear it first if you want to re-queue.');
  return publisher.enqueue(c.data.calendar || [], {
    campaignId: c.id, brandId: c.brandId, brandName: c.brandName, campaignName: c.name
  });
});
handle('queue:publishNow', async ({ id }) => publisher.publishNow(id));
handle('queue:update', async ({ id, patch }) => store.update('queue', id, patch));
handle('queue:remove', async ({ id }) => store.remove('queue', id));
handle('queue:clear', async ({ campaignId }) => {
  const db = store.getDb();
  const before = db.queue.length;
  db.queue = db.queue.filter(q => campaignId ? q.campaignId !== campaignId : false);
  store.saveDb();
  return before - db.queue.length;
});
handle('queue:tick', async () => publisher.tick());

/* ------------------------------------------------------------- ipc: content */

handle('content:list', async ({ brandId, agentId } = {}) => store.find('content', c =>
  (!brandId || c.brandId === brandId) && (!agentId || c.agentId === agentId)
).reverse());
handle('content:get', async ({ id }) => store.findOne('content', id));
handle('content:delete', async ({ id }) => store.remove('content', id));

/* ------------------------------------------------------------- ipc: exports */

const EXPORTERS = {
  master:    { ext: 'csv', name: 'Full working sheet (CSV)',     fn: c => exporters.masterCsv(c.data.calendar || []) },
  publer:    { ext: 'csv', name: 'Publer bulk schedule (CSV)',   fn: c => exporters.publerCsv(c.data.calendar || []) },
  buffer:    { ext: 'csv', name: 'Buffer / Hootsuite (CSV)',     fn: c => exporters.bufferCsv(c.data.calendar || []) },
  metricool: { ext: 'csv', name: 'Metricool bulk upload (CSV)',  fn: c => exporters.metricoolCsv(c.data.calendar || []) },
  ics:       { ext: 'ics', name: 'Calendar file (ICS)',          fn: c => exporters.toIcs(c.data.calendar || [], c.name) },
  pack:      { ext: 'md',  name: 'Full campaign pack (Markdown)', fn: (c, b) => exporters.campaignPack(c, b) },
  whatsapp:  { ext: 'txt', name: 'WhatsApp messages (TXT)',      fn: c => exporters.whatsappTxt(c) },
  json:      { ext: 'json', name: 'Everything (JSON)',           fn: c => JSON.stringify(c.data, null, 2) }
};

handle('export:formats', async () => Object.keys(EXPORTERS).map(k => ({ id: k, name: EXPORTERS[k].name, ext: EXPORTERS[k].ext })));

handle('export:campaign', async ({ campaignId, format }) => {
  const c = store.findOne('campaigns', campaignId);
  if (!c) throw new Error('Campaign not found');
  const ex = EXPORTERS[format];
  if (!ex) throw new Error('Unknown export format: ' + format);
  const brand = store.findOne('brands', c.brandId);
  const content = ex.fn(c, brand);

  const safe = String(c.name).replace(/[^a-z0-9\- ]/gi, '').trim().replace(/\s+/g, '-').slice(0, 60) || 'campaign';
  const res = await dialog.showSaveDialog(win, {
    title: 'Export ' + ex.name,
    defaultPath: path.join(app.getPath('documents'), safe + '.' + ex.ext),
    filters: [{ name: ex.ext.toUpperCase(), extensions: [ex.ext] }]
  });
  if (res.canceled || !res.filePath) return { canceled: true };
  fs.writeFileSync(res.filePath, content, 'utf8');
  return { canceled: false, path: res.filePath };
});

handle('export:text', async ({ filename, content, ext }) => {
  const res = await dialog.showSaveDialog(win, {
    title: 'Save',
    defaultPath: path.join(app.getPath('documents'), filename || 'tangazo-export.' + (ext || 'txt')),
    filters: [{ name: (ext || 'txt').toUpperCase(), extensions: [ext || 'txt'] }]
  });
  if (res.canceled || !res.filePath) return { canceled: true };
  fs.writeFileSync(res.filePath, content, 'utf8');
  return { canceled: false, path: res.filePath };
});

handle('shell:openPath', async ({ target }) => shell.openPath(target || store.dataDir()));
handle('shell:openExternal', async ({ url }) => { if (/^https?:\/\//i.test(url)) shell.openExternal(url); return true; });
handle('shell:showItem', async ({ target }) => { shell.showItemInFolder(target); return true; });

/* ------------------------------------------------------------ backup/import */

handle('data:export', async () => {
  const res = await dialog.showSaveDialog(win, {
    title: 'Back up all TANGAZO data',
    defaultPath: path.join(app.getPath('documents'), 'tangazo-backup-' + new Date().toISOString().slice(0, 10) + '.json'),
    filters: [{ name: 'JSON', extensions: ['json'] }]
  });
  if (res.canceled || !res.filePath) return { canceled: true };
  fs.writeFileSync(res.filePath, JSON.stringify(store.getDb(), null, 2), 'utf8');
  return { canceled: false, path: res.filePath };
});

handle('data:import', async () => {
  const res = await dialog.showOpenDialog(win, {
    title: 'Restore TANGAZO data',
    properties: ['openFile'],
    filters: [{ name: 'JSON', extensions: ['json'] }]
  });
  if (res.canceled || !res.filePaths.length) return { canceled: true };
  const raw = JSON.parse(fs.readFileSync(res.filePaths[0], 'utf8'));
  if (!raw || !Array.isArray(raw.brands)) throw new Error('That does not look like a TANGAZO backup.');
  store.saveDb(raw);
  return { canceled: false, path: res.filePaths[0] };
});
