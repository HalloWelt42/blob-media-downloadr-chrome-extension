// SPDX-License-Identifier: LicenseRef-BlobMediaDownloadr-NC-2.0
// Copyright (c) 2026 HalloWelt42
//
// Options-Seite. Lädt und speichert Einstellungen in chrome.storage.sync.

import { DEFAULT_PATTERN } from '../lib/filename.js';

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

const el = {
  form: document.getElementById('options-form'),
  pattern: document.getElementById('opt-filename-pattern'),
  autoMode: document.getElementById('opt-auto-mode'),
  typeGroup: document.getElementById('type-group'),
  typeAudio: document.getElementById('opt-type-audio'),
  typeVideo: document.getElementById('opt-type-video'),
  typeImage: document.getElementById('opt-type-image'),
  typeDocument: document.getElementById('opt-type-document'),
  minSize: document.getElementById('opt-min-size'),
  mseOnlyFinal: document.getElementById('opt-mse-only-final'),
  whitelist: document.getElementById('opt-whitelist'),
  blacklist: document.getElementById('opt-blacklist'),
  btnReset: document.getElementById('btn-reset'),
  toast: document.getElementById('toast')
};

function t(key) {
  try {
    return chrome.i18n.getMessage(key) || key;
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
  }, 2200);
}

function applyToForm(opts) {
  el.pattern.value = opts.filenamePattern || DEFAULT_PATTERN;
  el.autoMode.value = opts.autoDownload || 'off';
  const types = opts.autoDownloadTypes || {};
  el.typeAudio.checked = !!types.audio;
  el.typeVideo.checked = !!types.video;
  el.typeImage.checked = !!types.image;
  el.typeDocument.checked = !!types.document;
  el.minSize.value = Number.isFinite(opts.autoDownloadMinSizeKb)
    ? opts.autoDownloadMinSizeKb
    : 50;
  el.mseOnlyFinal.checked = opts.mseOnlyFinal !== false;
  el.whitelist.value = Array.isArray(opts.hostWhitelist)
    ? opts.hostWhitelist.join('\n')
    : '';
  el.blacklist.value = Array.isArray(opts.hostBlacklist)
    ? opts.hostBlacklist.join('\n')
    : '';
  updateTypeGroupVisibility();
}

function readFromForm() {
  const pattern = (el.pattern.value || '').trim() || DEFAULT_PATTERN;
  const autoDownload = el.autoMode.value;
  const autoDownloadTypes = {
    audio: el.typeAudio.checked,
    video: el.typeVideo.checked,
    image: el.typeImage.checked,
    document: el.typeDocument.checked
  };
  const minSize = Math.max(0, parseInt(el.minSize.value, 10) || 0);
  const mseOnlyFinal = el.mseOnlyFinal.checked;
  const hostWhitelist = splitLines(el.whitelist.value);
  const hostBlacklist = splitLines(el.blacklist.value);
  return {
    filenamePattern: pattern,
    autoDownload,
    autoDownloadTypes,
    autoDownloadMinSizeKb: minSize,
    mseOnlyFinal,
    hostWhitelist,
    hostBlacklist
  };
}

function splitLines(text) {
  if (!text) return [];
  return text
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l.length > 0);
}

function updateTypeGroupVisibility() {
  const show = el.autoMode.value === 'byType';
  el.typeGroup.classList.toggle('is-hidden', !show);
}

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

async function saveOptions(opts) {
  await chrome.storage.sync.set({ options: opts });
}

async function onSubmit(ev) {
  ev.preventDefault();
  const opts = readFromForm();
  await saveOptions(opts);
  showToast(t('optionsSavedToast'), 'success');
}

async function onReset() {
  applyToForm(DEFAULT_OPTIONS);
  await saveOptions(DEFAULT_OPTIONS);
  showToast(t('optionsResetToast'), 'success');
}

async function init() {
  const opts = await loadOptions();
  applyToForm(opts);
  el.form.addEventListener('submit', onSubmit);
  el.btnReset.addEventListener('click', onReset);
  el.autoMode.addEventListener('change', updateTypeGroupVisibility);
}

init();
