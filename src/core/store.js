'use strict';
/**
 * TANGAZO - local persistence.
 * Everything lives in plain JSON inside the app's userData folder so the app
 * has zero native dependencies and the user can back up / inspect their data.
 *
 *   <userData>/tangazo.json      brands, campaigns, content, queue, analytics
 *   <userData>/settings.json     api key (encrypted when the OS allows), model, webhook
 */

const fs = require('fs');
const path = require('path');

let DATA_DIR = null;
let safeStorage = null;

const EMPTY_DB = {
  version: 1,
  brands: [],
  activeBrandId: null,
  campaigns: [],
  content: [],
  queue: [],
  results: [],
  research: []
};

/**
 * Each provider keeps its own key and model, so switching between Claude and
 * ChatGPT never means re-pasting a key. `provider` names the active one.
 */
const DEFAULT_SETTINGS = {
  provider: 'anthropic',
  providers: {
    anthropic:  { apiKey: '', model: 'claude-sonnet-4-5', baseUrl: '' },
    openai:     { apiKey: '', model: 'gpt-4.1',           baseUrl: '' },
    compatible: { apiKey: '', model: '',                  baseUrl: '' }
  },
  maxTokens: 8000,
  webhookUrl: '',
  webhookSecret: '',
  autoPublish: false,
  timezone: 'Africa/Dar_es_Salaam'
};

function init(dataDir, safeStorageApi) {
  DATA_DIR = dataDir;
  safeStorage = safeStorageApi || null;
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
  return { db: loadDb(), settings: loadSettings() };
}

function dbPath() { return path.join(DATA_DIR, 'tangazo.json'); }
function settingsPath() { return path.join(DATA_DIR, 'settings.json'); }

function readJson(file, fallback) {
  try {
    if (!fs.existsSync(file)) return JSON.parse(JSON.stringify(fallback));
    const raw = fs.readFileSync(file, 'utf8');
    if (!raw.trim()) return JSON.parse(JSON.stringify(fallback));
    return Object.assign(JSON.parse(JSON.stringify(fallback)), JSON.parse(raw));
  } catch (err) {
    // Never lose a corrupted file - move it aside so the user can recover it.
    try { fs.renameSync(file, file + '.broken-' + Date.now()); } catch (_) {}
    return JSON.parse(JSON.stringify(fallback));
  }
}

function writeJsonAtomic(file, data) {
  const tmp = file + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(data, null, 2), 'utf8');
  fs.renameSync(tmp, file);
}

/* ---------------------------------------------------------------- database */

let _db = null;

function loadDb() {
  _db = readJson(dbPath(), EMPTY_DB);
  if (!Array.isArray(_db.brands)) _db.brands = [];
  return _db;
}

function getDb() {
  if (!_db) loadDb();
  return _db;
}

function saveDb(next) {
  if (next) _db = next;
  writeJsonAtomic(dbPath(), _db);
  return _db;
}

/* ---------------------------------------------------------------- settings */

let _settings = null;

function canEncrypt() {
  try { return !!(safeStorage && safeStorage.isEncryptionAvailable()); }
  catch (_) { return false; }
}

function decrypt(b64) {
  if (!b64 || !canEncrypt()) return '';
  try { return safeStorage.decryptString(Buffer.from(b64, 'base64')); }
  catch (_) { return ''; }
}

function loadSettings() {
  const raw = readJson(settingsPath(), DEFAULT_SETTINGS);

  // The file's `providers` object replaces the default wholesale, so fill in any
  // provider the file predates rather than losing it.
  raw.providers = Object.assign({}, DEFAULT_SETTINGS.providers, raw.providers || {});
  for (const id of Object.keys(DEFAULT_SETTINGS.providers)) {
    raw.providers[id] = Object.assign({}, DEFAULT_SETTINGS.providers[id], raw.providers[id] || {});
  }

  // Migrate the single-provider layout used before multi-provider support.
  const legacyKey = raw.apiKeyEncrypted ? decrypt(raw.apiKeyEncrypted) : (raw.apiKey || '');
  if (legacyKey && !raw.providers.anthropic.apiKey && !raw.providers.anthropic.apiKeyEncrypted) {
    raw.providers.anthropic.apiKey = legacyKey;
    if (raw.model) raw.providers.anthropic.model = raw.model;
  }
  delete raw.apiKey;
  delete raw.apiKeyEncrypted;
  delete raw.model;

  // Decrypt each provider's stored key.
  for (const id of Object.keys(raw.providers)) {
    const p = raw.providers[id];
    if (p.apiKeyEncrypted) {
      p.apiKey = decrypt(p.apiKeyEncrypted);
      delete p.apiKeyEncrypted;
    }
  }

  if (!raw.provider || !raw.providers[raw.provider]) raw.provider = DEFAULT_SETTINGS.provider;

  _settings = raw;
  return _settings;
}

function getSettings() {
  if (!_settings) loadSettings();
  return _settings;
}

/**
 * Merge a patch into settings and persist. `providers` is merged per provider,
 * so saving one provider's key never blanks another's.
 */
function saveSettings(patch) {
  const current = getSettings();
  const next = Object.assign({}, current, patch || {});

  next.providers = Object.assign({}, current.providers);
  if (patch && patch.providers) {
    for (const id of Object.keys(patch.providers)) {
      next.providers[id] = Object.assign({}, current.providers[id] || {}, patch.providers[id]);
    }
  }
  if (!next.providers[next.provider]) next.provider = DEFAULT_SETTINGS.provider;

  // Keys are encrypted at rest when the OS offers it; plain text otherwise, so
  // the app still works on machines where safeStorage is unavailable.
  const onDisk = Object.assign({}, next, { providers: {} });
  for (const id of Object.keys(next.providers)) {
    const p = Object.assign({}, next.providers[id]);
    if (p.apiKey && canEncrypt()) {
      p.apiKeyEncrypted = safeStorage.encryptString(p.apiKey).toString('base64');
      p.apiKey = '';
    } else {
      delete p.apiKeyEncrypted;
    }
    onDisk.providers[id] = p;
  }

  writeJsonAtomic(settingsPath(), onDisk);
  _settings = next;
  return next;
}

/* ------------------------------------------------------------- collections */

function uid(prefix) {
  return (prefix || 'id') + '_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}

function insert(collection, record) {
  const db = getDb();
  if (!Array.isArray(db[collection])) db[collection] = [];
  const row = Object.assign({ id: uid(collection.slice(0, 3)), createdAt: new Date().toISOString() }, record);
  db[collection].push(row);
  saveDb();
  return row;
}

function update(collection, id, patch) {
  const db = getDb();
  const list = db[collection] || [];
  const i = list.findIndex(r => r.id === id);
  if (i === -1) return null;
  list[i] = Object.assign({}, list[i], patch, { updatedAt: new Date().toISOString() });
  saveDb();
  return list[i];
}

function remove(collection, id) {
  const db = getDb();
  const list = db[collection] || [];
  const i = list.findIndex(r => r.id === id);
  if (i === -1) return false;
  list.splice(i, 1);
  saveDb();
  return true;
}

function find(collection, predicate) {
  const list = getDb()[collection] || [];
  return predicate ? list.filter(predicate) : list.slice();
}

function findOne(collection, id) {
  return (getDb()[collection] || []).find(r => r.id === id) || null;
}

module.exports = {
  init, getDb, saveDb, loadDb,
  getSettings, saveSettings, loadSettings,
  insert, update, remove, find, findOne, uid,
  dataDir: () => DATA_DIR,
  DEFAULT_SETTINGS
};
