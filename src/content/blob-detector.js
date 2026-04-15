// SPDX-License-Identifier: LicenseRef-BlobMediaDownloadr-NC-2.0
// Copyright (c) 2026 HalloWelt42
//
// ISOLATED-world-Content-Script.
//   - Injiziert blob-hook.js in die MAIN world (via <script src>)
//   - Lauscht auf Hook-Messages (BLOB_CAPTURED / MSE_* / FINALIZED_URL)
//   - Meldet Metadaten an den Service-Worker
//   - Scannt DOM nach <video|audio|img|source|a> mit blob:-URL (Fallback)
//   - Führt DOWNLOAD_BLOB / REVOKE_BLOB vom Service-Worker aus
//
// Wichtig: Der Hook in blob-hook.js haelt Blob-Referenzen auch nach
// URL.revokeObjectURL(). Beim Download fordern wir deshalb eine frische
// blob:-URL an, bevor wir <a download> ausloesen. Ohne das liefert ein
// Download auf eine revoked-URL 0 Byte (typisches Messenger-Verhalten).
//
// Bei content_scripts.all_frames=true laeuft dieses Script in jedem Frame.
// Der Service-Worker schickt DOWNLOAD_BLOB an alle Frames; nur der Frame,
// der die URL wirklich kennt, antwortet -- andere schweigen.

(function () {
  'use strict';

  var NS = '__BMBD__';

  // Hook in MAIN world einschleusen (via web_accessible_resource)
  try {
    var src = chrome.runtime.getURL('src/content/blob-hook.js');
    var scriptEl = document.createElement('script');
    scriptEl.src = src;
    scriptEl.async = false;
    scriptEl.onload = function () {
      // Script hat gelaufen, kann entfernt werden
      if (scriptEl.parentNode) scriptEl.parentNode.removeChild(scriptEl);
    };
    (document.head || document.documentElement).prepend(scriptEl);
  } catch (e) {
    // CSP kann die Injektion blocken -- DOM-Scan läuft trotzdem
  }

  // In-Memory-Register erfasster Blobs, damit Duplikate (Hook + DOM-Scan)
  // nicht mehrfach gemeldet werden.
  var seen = new Set();
  // Pending finalize-Requests (MSE -> neue Blob-URL)
  var pendingFinalize = new Map();
  var finalizeCounter = 0;

  function sendToBackground(msg) {
    try {
      chrome.runtime.sendMessage(msg, function () {
        if (chrome.runtime.lastError) {
          // Service-Worker evtl. gerade schlafend, ignorieren
        }
      });
    } catch (_e) {
      /* Kontext kann während Navigation ungültig werden */
    }
  }

  function pageMeta() {
    return {
      pageTitle: document.title || '',
      host: location.hostname || '',
      pageUrl: location.href || ''
    };
  }

  function reportBlob(kind, url, mimeType, size, isFinal, opts) {
    if (!url) return;
    var key = kind + '|' + url;
    var isWildcardMime = !mimeType || /\*/.test(mimeType);
    if (seen.has(key)) {
      // Bereits bekannt. Updates nur senden wenn wir echte neue Info haben;
      // ein DOM-Scan mit Wildcard-MIME wie "audio/*" darf NICHT den echten
      // MIME vom Hook ueberschreiben.
      if (opts && opts.fromDomScan) return;
      sendToBackground({
        type: 'BLOB_UPDATE',
        url: url,
        size: size || 0,
        mimeType: isWildcardMime ? '' : mimeType,
        isFinal: !!isFinal
      });
      return;
    }
    seen.add(key);
    var meta = pageMeta();
    sendToBackground({
      type: 'BLOB_FOUND',
      kind: kind,
      url: url,
      mimeType: isWildcardMime ? '' : mimeType,
      size: size || 0,
      isFinal: !!isFinal,
      capturedAt: Date.now(),
      pageTitle: meta.pageTitle,
      host: meta.host,
      pageUrl: meta.pageUrl
    });
  }

  // Nachrichten aus MAIN world (Hook) empfangen
  window.addEventListener('message', function (ev) {
    if (ev.source !== window) return;
    var data = ev.data;
    if (!data || data.__ns !== NS || !data.type) return;

    switch (data.type) {
      case 'BLOB_CAPTURED':
        reportBlob('blob', data.url, data.mimeType, data.size, true);
        break;
      case 'MSE_CAPTURED':
        reportBlob('mse', data.url, data.mimeType, data.size || 0, false);
        break;
      case 'MSE_PROGRESS':
        sendToBackground({
          type: 'BLOB_UPDATE',
          url: data.url,
          size: data.size || 0,
          mimeType: data.mimeType || '',
          isFinal: false
        });
        break;
      case 'MSE_FINALIZED':
        sendToBackground({
          type: 'BLOB_UPDATE',
          url: data.url,
          size: data.size || 0,
          mimeType: data.mimeType || '',
          isFinal: true
        });
        break;
      case 'FINALIZED_URL':
      case 'DOWNLOAD_HERE_RESULT':
        var handler = pendingFinalize.get(data.requestId);
        if (handler) {
          pendingFinalize.delete(data.requestId);
          handler(data);
        }
        break;
      default:
        break;
    }
  });

  function knowsUrl(url) {
    return seen.has('blob|' + url) || seen.has('mse|' + url);
  }

  // Download-Handler: vom Service-Worker an alle Frames eines Tabs geschickt.
  // Wichtig: nur der Frame, der die URL tatsaechlich kennt, antwortet. Sonst
  // antwortet der falsche Frame (mit einer blob:-URL, die er nicht aufloesen
  // kann) zuerst -- das endete in 0-Byte-Downloads bei Messengern und Playern
  // mit iframes. Unbekannte Frames kehren ohne sendResponse und ohne
  // "return true" zurueck, sodass Chrome auf den richtigen Frame wartet.
  chrome.runtime.onMessage.addListener(function (msg, _sender, sendResponse) {
    if (!msg || !msg.type) return;

    if (msg.type === 'DOWNLOAD_BLOB') {
      if (!knowsUrl(msg.url)) {
        return false; // anderer Frame ist zustaendig
      }
      handleDownload(msg)
        .then(function (result) {
          sendResponse(result);
        })
        .catch(function (err) {
          sendResponse({ ok: false, error: String(err) });
        });
      return true;
    }

    if (msg.type === 'REVOKE_BLOB') {
      if (!knowsUrl(msg.url)) {
        return false;
      }
      try {
        window.postMessage(
          { __ns: NS, type: 'BLOB_REVOKE_REQUEST', url: msg.url },
          '*'
        );
        seen.delete('blob|' + msg.url);
        seen.delete('mse|' + msg.url);
        sendResponse({ ok: true });
      } catch (e) {
        sendResponse({ ok: false, error: String(e) });
      }
      return false;
    }

    if (msg.type === 'PING') {
      sendResponse({ ok: true });
      return false;
    }
  });

  function handleDownload(msg) {
    var url = msg.url;
    var kind = msg.kind || 'blob';
    var filename = msg.filename || 'download.bin';

    // Bevorzugter Pfad: Der Hook (MAIN world) loest den Download SELBST aus.
    // Dort lebt der Blob, dort ist der richtige Kontext. Das umgeht sowohl
    // das Revoke-Problem (Hook haelt Referenz) als auch das
    // Cross-Origin-Problem (kein Frame-Hop fuer den <a download>-Click).
    return new Promise(function (resolve) {
      var requestId = 'd' + ++finalizeCounter;
      var timeout = setTimeout(function () {
        pendingFinalize.delete(requestId);
        // Fallback: selbst versuchen auf Original-URL
        triggerDownload(url, filename)
          .then(function () { resolve({ ok: true, fallback: 'timeout' }); })
          .catch(function (e) { resolve({ ok: false, error: String(e) }); });
      }, 15000);

      pendingFinalize.set(requestId, function (data) {
        clearTimeout(timeout);
        if (data && data.ok) {
          resolve({
            ok: true,
            size: data.size || 0,
            resolvedUrl: data.resolvedUrl
          });
          return;
        }
        // Hook konnte nicht liefern: versuchen wir den klassischen
        // ISOLATED-world-Download mit der Original-URL als letzten Versuch.
        triggerDownload(url, filename)
          .then(function () {
            resolve({ ok: true, fallback: (data && data.error) || 'hook-failed' });
          })
          .catch(function (e) {
            resolve({
              ok: false,
              error: (data && data.error) || String(e)
            });
          });
      });

      try {
        window.postMessage(
          {
            __ns: NS,
            type: 'DOWNLOAD_HERE',
            url: url,
            kind: kind,
            filename: filename,
            requestId: requestId
          },
          '*'
        );
      } catch (e) {
        clearTimeout(timeout);
        pendingFinalize.delete(requestId);
        resolve({ ok: false, error: String(e) });
      }
    });
  }

  function triggerDownload(url, filename) {
    return new Promise(function (resolve, reject) {
      try {
        var a = document.createElement('a');
        a.href = url;
        a.download = filename || '';
        a.rel = 'noopener';
        a.style.display = 'none';
        (document.body || document.documentElement).appendChild(a);
        a.click();
        // Kurz warten, damit der Browser den Download angestoßen hat,
        // bevor wir das Element wieder wegräumen.
        setTimeout(function () {
          if (a.parentNode) a.parentNode.removeChild(a);
          resolve();
        }, 50);
      } catch (e) {
        reject(e);
      }
    });
  }

  // DOM-Scan: Fallback für blob:-URLs, die vor Hook-Injektion entstanden
  function scanDom() {
    var nodes = document.querySelectorAll(
      'video[src^="blob:"], audio[src^="blob:"], img[src^="blob:"], source[src^="blob:"], a[href^="blob:"]'
    );
    for (var i = 0; i < nodes.length; i++) {
      var n = nodes[i];
      var url = n.getAttribute('src') || n.getAttribute('href');
      if (!url) continue;
      if (seen.has('blob|' + url) || seen.has('mse|' + url)) continue;
      var mime =
        n.tagName === 'VIDEO'
          ? 'video/*'
          : n.tagName === 'AUDIO'
            ? 'audio/*'
            : n.tagName === 'IMG'
              ? 'image/*'
              : n.tagName === 'SOURCE'
                ? n.getAttribute('type') || ''
                : '';
      reportBlob('blob', url, mime, 0, true);
    }
  }

  try {
    scanDom();
    var mo = new MutationObserver(function () {
      scanDom();
    });
    mo.observe(document.documentElement, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ['src', 'href']
    });
  } catch (_e) {
    /* ignorieren */
  }

  // Scan einmal zusätzlich nach Load (manche Apps fügen Player erst spät ein)
  if (document.readyState !== 'complete') {
    window.addEventListener('load', scanDom, { once: true });
  }
})();
