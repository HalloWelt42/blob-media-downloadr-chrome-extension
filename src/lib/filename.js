// SPDX-License-Identifier: LicenseRef-BlobMediaDownloadr-NC-2.0
// Copyright (c) 2026 HalloWelt42
//
// Dateinamen-Muster ausrollen. Unterstützt die Tokens:
//   {host}   -> Host der Quelle (bereinigt)
//   {date}   -> YYYYMMDD
//   {time}   -> HHMMSS
//   {mime}   -> MIME-Type (Slash -> -)
//   {ext}    -> Datei-Endung (ohne Punkt)
//   {index}  -> laufender Index im Tab (3-stellig)
//   {title}  -> Seitentitel (bereinigt)

import { extForMime } from './mime-ext.js';

export const DEFAULT_PATTERN = '{host}-{date}-{time}-{index}.{ext}';

/**
 * Entfernt oder ersetzt Zeichen, die im Dateisystem Probleme machen.
 * @param {string} s
 * @param {number} [maxLen]
 */
function sanitize(s, maxLen) {
  if (typeof s !== 'string') s = String(s || '');
  s = s.replace(/[\u0000-\u001f\u007f]/g, '');
  s = s.replace(/[\\/:*?"<>|]+/g, '-');
  s = s.replace(/\s+/g, ' ').trim();
  s = s.replace(/^[-._\s]+|[-._\s]+$/g, '');
  if (!s) s = 'file';
  if (maxLen && s.length > maxLen) s = s.slice(0, maxLen).replace(/[-._\s]+$/g, '');
  return s;
}

function pad(n, width) {
  var s = String(n);
  while (s.length < width) s = '0' + s;
  return s;
}

/**
 * @param {object} ctx
 * @param {string} ctx.host
 * @param {string} ctx.title
 * @param {string} ctx.mimeType
 * @param {number} ctx.index
 * @param {Date}   [ctx.date]
 * @param {string} [ctx.pattern]
 */
export function renderFilename(ctx) {
  var now = ctx.date instanceof Date ? ctx.date : new Date();
  var y = now.getFullYear();
  var mo = pad(now.getMonth() + 1, 2);
  var d = pad(now.getDate(), 2);
  var hh = pad(now.getHours(), 2);
  var mm = pad(now.getMinutes(), 2);
  var ss = pad(now.getSeconds(), 2);

  var tokens = {
    host: sanitize(ctx.host || 'site', 50),
    title: sanitize(ctx.title || '', 80),
    mime: sanitize((ctx.mimeType || 'application-octet-stream').replace(/\//g, '-'), 40),
    ext: extForMime(ctx.mimeType || ''),
    index: pad(ctx.index || 1, 3),
    date: '' + y + mo + d,
    time: '' + hh + mm + ss
  };

  var pattern = typeof ctx.pattern === 'string' && ctx.pattern.trim()
    ? ctx.pattern
    : DEFAULT_PATTERN;

  var result = pattern.replace(/\{(\w+)\}/g, function (_, key) {
    return Object.prototype.hasOwnProperty.call(tokens, key) ? tokens[key] : '';
  });

  // Nochmal säubern und Länge deckeln (Chrome-Downloads mag keine zu langen Namen)
  result = sanitize(result, 180);
  // Falls die Endung verloren ging, drankleben
  if (tokens.ext && !result.toLowerCase().endsWith('.' + tokens.ext)) {
    result = result + '.' + tokens.ext;
  }
  return result;
}
