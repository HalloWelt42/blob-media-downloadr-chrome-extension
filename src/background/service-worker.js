// SPDX-License-Identifier: LicenseRef-BlobMediaDownloadr-NC-2.0
// Copyright (c) 2026 HalloWelt42
//
// Service-Worker (MV3 module). Zentraler Message-Hub:
//   - Empfängt BLOB_FOUND / BLOB_UPDATE / BLOB_REVOKED vom Detector
//   - Beantwortet POPUP_*-Anfragen des Popups
//   - Sendet DOWNLOAD_BLOB / REVOKE_BLOB an den jeweiligen Tab
//   - Pflegt das Toolbar-Badge pro Tab
//   - Startet Auto-Download nach Options

import { categoryForMime } from '../lib/mime-ext.js';
import { renderFilename, DEFAULT_PATTERN } from '../lib/filename.js';

/** Map<tabId, Map<url, BlobMeta>> */
const tabBlobs = new Map();
/** Pro Tab einen laufenden Download-Index */
const tabIndex = new Map();
/** Merker, welche URLs wir im Auto-Download schon angestoßen haben */
const autoDownloaded = new Map(); // tabId -> Set<url>

const DEFAULT_OPTIONS = {
  filenamePattern: DEFAULT_PATTERN,
  autoDownload: 'off',
  autoDownloadTypes: {
    audio: true,
    video: true,
    image: false,
    document: false
  },
  autoDownloadMinSizeKb: 50,
  mseOnlyFinal: true,
  hostWhitelist: [],
  hostBlacklist: []
};

async function loadOptions() {
  try {
    const raw = await chrome.storage.sync.get('options');
    const stored = raw && raw.options ? raw.options : {};
    return Object.assign({}, DEFAULT_OPTIONS, stored, {
      autoDownloadTypes: Object.assign(
        {},
        DEFAULT_OPTIONS.autoDownloadTypes,
        stored.autoDownloadTypes || {}
      )
    });
  } catch (_e) {
    return Object.assign({}, DEFAULT_OPTIONS);
  }
}

/**
 * Sichere Variante von chrome.tabs.sendMessage: konsumiert chrome.runtime.lastError
 * im Callback, damit Chrome keine "Uncaught (in promise)"-Warnung fuer geschlossene
 * Tabs loggt. Gibt immer ein Result-Objekt zurueck, wirft nie.
 */
function sendToTab(tabId, message) {
  return new Promise((resolve) => {
    try {
      chrome.tabs.sendMessage(tabId, message, (response) => {
        // Zugriff auf lastError signalisiert dem Browser "behandelt"
        const err = chrome.runtime.lastError;
        if (err) {
          resolve({ ok: false, error: err.message || 'unknown' });
          return;
        }
        resolve({ ok: true, response });
      });
    } catch (e) {
      resolve({ ok: false, error: String(e && e.message ? e.message : e) });
    }
  });
}

function hostMatches(host, rules) {
  if (!Array.isArray(rules) || !rules.length) return false;
  const h = (host || '').toLowerCase();
  for (const raw of rules) {
    const r = String(raw || '').toLowerCase().trim();
    if (!r) continue;
    if (h === r) return true;
    if (h.endsWith('.' + r)) return true;
    if (r.startsWith('*.') && (h === r.slice(2) || h.endsWith(r.slice(1)))) {
      return true;
    }
  }
  return false;
}

function ensureTab(tabId) {
  if (!tabBlobs.has(tabId)) tabBlobs.set(tabId, new Map());
  return tabBlobs.get(tabId);
}

function bumpIndex(tabId) {
  const n = (tabIndex.get(tabId) || 0) + 1;
  tabIndex.set(tabId, n);
  return n;
}

function updateBadge(tabId) {
  const m = tabBlobs.get(tabId);
  const count = m ? m.size : 0;
  const text = count > 0 ? String(count) : '';
  try {
    chrome.action.setBadgeText({ tabId, text });
    if (count > 0) {
      chrome.action.setBadgeBackgroundColor({ tabId, color: '#d97706' });
      if (chrome.action.setBadgeTextColor) {
        chrome.action.setBadgeTextColor({ tabId, color: '#ffffff' });
      }
    }
  } catch (_e) {
    /* tab evtl. weg */
  }
}

function clearTab(tabId) {
  tabBlobs.delete(tabId);
  tabIndex.delete(tabId);
  autoDownloaded.delete(tabId);
  try {
    chrome.action.setBadgeText({ tabId, text: '' });
  } catch (_e) {
    /* ignorieren */
  }
}

async function handleBlobFound(msg, tabId) {
  const map = ensureTab(tabId);
  if (map.has(msg.url)) {
    // Schon bekannt, nur aktualisieren
    const prev = map.get(msg.url);
    prev.size = Math.max(prev.size, msg.size || 0);
    prev.mimeType = msg.mimeType || prev.mimeType;
    prev.isFinal = !!msg.isFinal || prev.isFinal;
    prev.updatedAt = Date.now();
  } else {
    map.set(msg.url, {
      kind: msg.kind || 'blob',
      url: msg.url,
      mimeType: msg.mimeType || '',
      category: categoryForMime(msg.mimeType || ''),
      size: msg.size || 0,
      isFinal: msg.kind === 'blob' ? true : !!msg.isFinal,
      capturedAt: msg.capturedAt || Date.now(),
      updatedAt: Date.now(),
      pageTitle: msg.pageTitle || '',
      host: msg.host || '',
      pageUrl: msg.pageUrl || '',
      indexInTab: bumpIndex(tabId)
    });
  }
  updateBadge(tabId);

  await maybeAutoDownload(tabId, map.get(msg.url));
}

async function handleBlobUpdate(msg, tabId) {
  const map = tabBlobs.get(tabId);
  if (!map || !map.has(msg.url)) return;
  const meta = map.get(msg.url);
  if (typeof msg.size === 'number') meta.size = Math.max(meta.size, msg.size);
  if (msg.mimeType) {
    meta.mimeType = msg.mimeType;
    meta.category = categoryForMime(msg.mimeType);
  }
  if (msg.isFinal) meta.isFinal = true;
  meta.updatedAt = Date.now();

  if (msg.isFinal) {
    await maybeAutoDownload(tabId, meta);
  }
}

function handleBlobRevoked(msg, tabId) {
  const map = tabBlobs.get(tabId);
  if (!map) return;
  map.delete(msg.url);
  const done = autoDownloaded.get(tabId);
  if (done) done.delete(msg.url);
  updateBadge(tabId);
}

async function maybeAutoDownload(tabId, meta) {
  if (!meta) return;
  const opts = await loadOptions();
  if (opts.autoDownload === 'off') return;
  // Nur vollständige Blobs auto-downloaden (MSE muss final sein, wenn Option aktiv)
  if (meta.kind === 'mse') {
    if (opts.mseOnlyFinal && !meta.isFinal) return;
  }
  // Schon angestoßen?
  if (!autoDownloaded.has(tabId)) autoDownloaded.set(tabId, new Set());
  const done = autoDownloaded.get(tabId);
  if (done.has(meta.url)) return;

  // Host-Filter
  if (hostMatches(meta.host, opts.hostBlacklist)) return;
  if (opts.hostWhitelist && opts.hostWhitelist.length) {
    if (!hostMatches(meta.host, opts.hostWhitelist)) return;
  }

  // Typ-Filter
  if (opts.autoDownload === 'byType') {
    const enabled = opts.autoDownloadTypes || {};
    if (!enabled[meta.category]) return;
  }

  // Mindest-Größe
  const minBytes = Math.max(0, (opts.autoDownloadMinSizeKb || 0) * 1024);
  if (meta.size < minBytes) return;

  done.add(meta.url);
  await startDownload(tabId, meta, opts);
}

async function startDownload(tabId, meta, optsMaybe) {
  const opts = optsMaybe || (await loadOptions());
  const filename = renderFilename({
    host: meta.host,
    title: meta.pageTitle,
    mimeType: meta.mimeType,
    index: meta.indexInTab,
    pattern: opts.filenamePattern
  });
  const result = await sendToTab(tabId, {
    type: 'DOWNLOAD_BLOB',
    url: meta.url,
    kind: meta.kind,
    filename
  });
  if (!result.ok) {
    return { ok: false, error: result.error };
  }
  return { ok: true, filename };
}

function serializeState(tabId) {
  const map = tabBlobs.get(tabId);
  if (!map) return { items: [] };
  const items = [];
  for (const meta of map.values()) {
    items.push({
      kind: meta.kind,
      url: meta.url,
      mimeType: meta.mimeType,
      category: meta.category,
      size: meta.size,
      isFinal: meta.isFinal,
      capturedAt: meta.capturedAt,
      updatedAt: meta.updatedAt,
      pageTitle: meta.pageTitle,
      host: meta.host,
      pageUrl: meta.pageUrl,
      indexInTab: meta.indexInTab
    });
  }
  // Neueste zuerst
  items.sort((a, b) => b.capturedAt - a.capturedAt);
  return { items };
}

// Haupt-Listener
chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (!msg || !msg.type) return;
  const fromTabId = sender && sender.tab ? sender.tab.id : null;

  switch (msg.type) {
    case 'BLOB_FOUND':
      if (fromTabId != null) handleBlobFound(msg, fromTabId);
      return false;
    case 'BLOB_UPDATE':
      if (fromTabId != null) handleBlobUpdate(msg, fromTabId);
      return false;
    case 'BLOB_REVOKED':
      if (fromTabId != null) handleBlobRevoked(msg, fromTabId);
      return false;

    case 'POPUP_GET_STATE':
      (async () => {
        const tabId = msg.tabId;
        sendResponse(serializeState(tabId));
      })();
      return true;

    case 'POPUP_REQUEST_DOWNLOAD':
      (async () => {
        const map = tabBlobs.get(msg.tabId);
        if (!map || !map.has(msg.url)) {
          sendResponse({ ok: false, error: 'not-found' });
          return;
        }
        const meta = map.get(msg.url);
        const result = await startDownload(msg.tabId, meta);
        sendResponse(result);
      })();
      return true;

    case 'POPUP_REMOVE_ITEM':
      (async () => {
        const map = tabBlobs.get(msg.tabId);
        if (!map) {
          sendResponse({ ok: false });
          return;
        }
        if (map.has(msg.url)) {
          map.delete(msg.url);
          const done = autoDownloaded.get(msg.tabId);
          if (done) done.delete(msg.url);
          await sendToTab(msg.tabId, {
            type: 'REVOKE_BLOB',
            url: msg.url
          });
          updateBadge(msg.tabId);
        }
        sendResponse({ ok: true });
      })();
      return true;

    case 'POPUP_CLEAR':
      (async () => {
        const map = tabBlobs.get(msg.tabId);
        if (map) {
          // Alle URLs revoken
          const urls = Array.from(map.keys());
          map.clear();
          autoDownloaded.delete(msg.tabId);
          for (const url of urls) {
            await sendToTab(msg.tabId, { type: 'REVOKE_BLOB', url });
          }
          updateBadge(msg.tabId);
        }
        sendResponse({ ok: true });
      })();
      return true;

    case 'POPUP_OPEN_OPTIONS':
      chrome.runtime.openOptionsPage();
      sendResponse({ ok: true });
      return false;

    default:
      return false;
  }
});

// Tab-Lifecycle: wenn ein Tab schliesst, State aufräumen.
chrome.tabs.onRemoved.addListener((tabId) => clearTab(tabId));

// Navigation innerhalb eines Tabs: alte Blobs sind ohnehin ungültig,
// weil sie zum vorherigen Dokument gehörten. Wir räumen auf.
chrome.tabs.onUpdated.addListener((tabId, info) => {
  if (info.status === 'loading') {
    clearTab(tabId);
  }
});

// Beim Wechsel zwischen Tabs sicherstellen, dass das Badge stimmt.
chrome.tabs.onActivated.addListener((info) => updateBadge(info.tabId));
