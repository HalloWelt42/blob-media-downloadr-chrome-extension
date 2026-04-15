// SPDX-License-Identifier: LicenseRef-BlobMediaDownloadr-NC-2.0
// Copyright (c) 2026 HalloWelt42

import { renderFilename, DEFAULT_PATTERN } from '../lib/filename.js';

let currentPattern = DEFAULT_PATTERN;

async function loadPattern() {
  try {
    const raw = await chrome.storage.sync.get('options');
    const p = raw && raw.options && raw.options.filenamePattern;
    currentPattern = (typeof p === 'string' && p.trim()) ? p : DEFAULT_PATTERN;
  } catch (_e) {
    currentPattern = DEFAULT_PATTERN;
  }
}

const el = {
  filterBar: document.getElementById('filter-bar'),
  empty: document.getElementById('empty-state'),
  list: document.getElementById('blob-list'),
  btnRefresh: document.getElementById('btn-refresh'),
  btnClear: document.getElementById('btn-clear'),
  btnOptions: document.getElementById('btn-options'),
  linkDonate: document.getElementById('link-donate'),
  toast: document.getElementById('toast')
};

let activeTabId = null;
let currentFilter = 'all';
let pollTimer = null;

function t(key, subs) {
  try {
    return chrome.i18n.getMessage(key, subs) || key;
  } catch (_e) {
    return key;
  }
}

function showToast(message, variant) {
  if (!el.toast) return;
  el.toast.textContent = message;
  el.toast.className = 'toast show' + (variant ? ' ' + variant : '');
  setTimeout(() => {
    el.toast.className = 'toast';
  }, 2400);
}

function formatSize(bytes) {
  if (!Number.isFinite(bytes) || bytes <= 0) return '0 ' + t('unitBytes');
  const units = ['unitBytes', 'unitKilobytes', 'unitMegabytes', 'unitGigabytes'];
  let n = bytes;
  let i = 0;
  while (n >= 1024 && i < units.length - 1) {
    n /= 1024;
    i++;
  }
  const v = n >= 10 || i === 0 ? Math.round(n) : n.toFixed(1);
  return v + ' ' + t(units[i]);
}

function formatTime(ts) {
  if (!ts) return '';
  const d = new Date(ts);
  const hh = String(d.getHours()).padStart(2, '0');
  const mm = String(d.getMinutes()).padStart(2, '0');
  return hh + ':' + mm;
}

function hostLabel(host, pageTitle) {
  const titleShown =
    pageTitle && pageTitle.trim() ? pageTitle : t('listUnknownTitle');
  if (host) {
    return host + ' \u2022 ' + titleShown;
  }
  return titleShown;
}

function mimeLabel(mime, kind) {
  if (mime) return mime;
  return kind === 'mse' ? t('kindMse') : t('kindBlob');
}

async function getActiveTab() {
  const [tab] = await chrome.tabs.query({
    active: true,
    currentWindow: true
  });
  return tab || null;
}

async function fetchState() {
  if (activeTabId == null) return { items: [] };
  return new Promise((resolve) => {
    chrome.runtime.sendMessage(
      { type: 'POPUP_GET_STATE', tabId: activeTabId },
      (resp) => {
        if (chrome.runtime.lastError) {
          resolve({ items: [] });
        } else {
          resolve(resp || { items: [] });
        }
      }
    );
  });
}

function applyFilter(items) {
  if (currentFilter === 'all') return items;
  return items.filter((i) => i.category === currentFilter);
}

function renderList(items) {
  const filtered = applyFilter(items);

  if (!items.length) {
    el.empty.classList.remove('hidden');
    el.list.classList.add('hidden');
    el.empty.querySelector('p').textContent = t('popupEmpty');
    el.empty.querySelector('.hint').textContent = t('popupEmptyHint');
    return;
  }

  if (!filtered.length) {
    el.empty.classList.remove('hidden');
    el.list.classList.add('hidden');
    el.empty.querySelector('p').textContent = t('popupEmpty');
    el.empty.querySelector('.hint').textContent = '';
    return;
  }

  el.empty.classList.add('hidden');
  el.list.classList.remove('hidden');
  el.list.textContent = '';

  for (const item of filtered) {
    el.list.appendChild(renderCard(item));
  }
}

function renderCard(item) {
  const card = document.createElement('div');
  card.className = 'blob-card';
  if (item.kind === 'mse' && !item.isFinal) card.classList.add('is-live');

  // Zeile 1: Kategorie-Badge, MIME, Größe, Live-/Final-Label
  const top = document.createElement('div');
  top.className = 'blob-top';

  const badge = document.createElement('span');
  badge.className = 'blob-badge cat-' + (item.category || 'other');
  const catKey = 'filter' + cap(item.category || 'other');
  badge.textContent = t(catKey);
  top.appendChild(badge);

  const mime = document.createElement('span');
  mime.className = 'blob-mime';
  mime.textContent = mimeLabel(item.mimeType, item.kind);
  mime.title = mime.textContent;
  top.appendChild(mime);

  const size = document.createElement('span');
  size.className = 'blob-size';
  size.textContent = formatSize(item.size);
  top.appendChild(size);

  if (item.kind === 'mse' && !item.isFinal) {
    const liveWrap = document.createElement('span');
    liveWrap.className = 'live-label';
    const dot = document.createElement('span');
    dot.className = 'blob-live-dot';
    liveWrap.appendChild(dot);
    liveWrap.appendChild(document.createTextNode(t('listLive')));
    top.appendChild(liveWrap);
  } else if (item.kind === 'mse' && item.isFinal) {
    const finalLabel = document.createElement('span');
    finalLabel.className = 'final-label';
    finalLabel.textContent = t('listFinal');
    top.appendChild(finalLabel);
  }

  card.appendChild(top);

  // Zeile 2: Quelle und Zeit
  const meta = document.createElement('div');
  meta.className = 'blob-meta';
  const src = document.createElement('span');
  src.className = 'source';
  src.textContent = hostLabel(item.host, item.pageTitle);
  src.title = src.textContent;
  meta.appendChild(src);
  const time = document.createElement('span');
  time.className = 'time';
  time.textContent = formatTime(item.capturedAt);
  meta.appendChild(time);
  card.appendChild(meta);

  // Zeile 3: vorschaubarer Dateiname (damit man vor Download weiss, was landet)
  const fname = document.createElement('div');
  fname.className = 'blob-filename';
  const predictedName = renderFilename({
    host: item.host,
    title: item.pageTitle,
    mimeType: item.mimeType,
    index: item.indexInTab,
    date: new Date(item.capturedAt || Date.now()),
    pattern: currentPattern
  });
  fname.textContent = predictedName;
  fname.title = predictedName;
  card.appendChild(fname);

  // Zeile 3: Buttons
  const actions = document.createElement('div');
  actions.className = 'blob-actions';

  const download = document.createElement('button');
  download.className = 'blob-btn primary';
  download.type = 'button';
  download.title = t('tooltipDownload');
  download.innerHTML =
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>';
  const dlLabel = document.createElement('span');
  dlLabel.textContent = t('listDownload');
  download.appendChild(dlLabel);
  download.addEventListener('click', () => onDownload(item, download));
  actions.appendChild(download);

  const remove = document.createElement('button');
  remove.className = 'blob-btn danger';
  remove.type = 'button';
  remove.title = t('tooltipRemove');
  remove.innerHTML =
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><path d="M10 11v6"/><path d="M14 11v6"/><path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/></svg>';
  const rmLabel = document.createElement('span');
  rmLabel.textContent = t('listRemove');
  remove.appendChild(rmLabel);
  remove.addEventListener('click', () => onRemove(item, remove));
  actions.appendChild(remove);

  card.appendChild(actions);
  return card;
}

function cap(s) {
  if (!s) return '';
  return s.charAt(0).toUpperCase() + s.slice(1);
}

async function onDownload(item, btn) {
  btn.disabled = true;
  try {
    const resp = await new Promise((resolve) => {
      chrome.runtime.sendMessage(
        {
          type: 'POPUP_REQUEST_DOWNLOAD',
          tabId: activeTabId,
          url: item.url
        },
        (r) => resolve(r || { ok: false, error: 'no-response' })
      );
    });
    if (resp.ok) {
      showToast(t('toastDownloadStarted'), 'success');
    } else {
      showToast(t('toastSourceGone'), 'error');
    }
  } finally {
    btn.disabled = false;
  }
}

async function onRemove(item, btn) {
  btn.disabled = true;
  await new Promise((resolve) => {
    chrome.runtime.sendMessage(
      {
        type: 'POPUP_REMOVE_ITEM',
        tabId: activeTabId,
        url: item.url
      },
      () => resolve()
    );
  });
  showToast(t('toastRemoved'));
  refresh();
}

async function onClear() {
  await new Promise((resolve) => {
    chrome.runtime.sendMessage(
      { type: 'POPUP_CLEAR', tabId: activeTabId },
      () => resolve()
    );
  });
  showToast(t('toastCleared'));
  refresh();
}

async function refresh() {
  const state = await fetchState();
  renderList(state.items || []);
}

function onFilterClick(ev) {
  const target = ev.target.closest('.filter-pill');
  if (!target) return;
  const filter = target.dataset.filter;
  if (!filter || filter === currentFilter) return;
  currentFilter = filter;
  for (const btn of el.filterBar.querySelectorAll('.filter-pill')) {
    btn.classList.toggle('active', btn.dataset.filter === filter);
  }
  refresh();
}

async function init() {
  await loadPattern();
  const tab = await getActiveTab();
  if (tab) activeTabId = tab.id;

  el.filterBar.addEventListener('click', onFilterClick);
  el.btnRefresh.addEventListener('click', () => {
    el.btnRefresh.classList.add('spin-once');
    setTimeout(() => el.btnRefresh.classList.remove('spin-once'), 500);
    refresh();
  });
  el.btnClear.addEventListener('click', onClear);
  el.btnOptions.addEventListener('click', () => {
    try {
      chrome.runtime.openOptionsPage();
    } catch (_e) {
      /* ignorieren */
    }
  });
  el.linkDonate.addEventListener('click', () => {
    const url = chrome.runtime.getURL('src/pages/donate.html');
    chrome.tabs.create({ url });
  });

  await refresh();
  // Alle 1.5s Polling, damit MSE-Fortschritt und Auto-Updates gezeigt werden
  pollTimer = setInterval(refresh, 1500);
}

window.addEventListener('beforeunload', () => {
  if (pollTimer) clearInterval(pollTimer);
});

init();
