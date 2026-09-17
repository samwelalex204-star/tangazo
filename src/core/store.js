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

const DEFAULT_SETTINGS = {
  apiKey: '',
  apiKeyEncrypted: null,
  model: 'claude-sonnet-4-5',
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

function loadSettings() {
  const raw = readJson(settingsPath(), DEFAULT_SETTINGS);
  // Decrypt the key if it was stored encrypted.
  if (raw.apiKeyEncrypted && safeStorage && safeStorage.isEncryptionAvailable()) {
    try {
      raw.apiKey = safeStorage.decryptString(Buffer.from(raw.apiKeyEncrypted, 'base64'));
    } catch (_) { raw.apiKey = ''; }
  }
  _settings = raw;
  return _settings;
}

function getSettings() {
  if (!_settings) loadSettings();
  return _settings;
}

function saveSettings(patch) {
  const s = Object.assign(getSettings(), patch || {});
  const onDisk = Object.assign({}, s);
  if (s.apiKey && safeStorage && safeStorage.isEncryptionAvailable()) {
    onDisk.apiKeyEncrypted = safeStorage.encryptString(s.apiKey).toString('base64');
    onDisk.apiKey = '';
  } else {
    onDisk.apiKeyEncrypted = null;
  }
  writeJsonAtomic(settingsPath(), onDisk);
  _settings = s;
  return s;
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
  getSettings, saveSettings,
  insert, update, remove, find, findOne, uid,
  dataDir: () => DATA_DIR,
  DEFAULT_SETTINGS
};
