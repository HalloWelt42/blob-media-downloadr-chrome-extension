// SPDX-License-Identifier: LicenseRef-BlobMediaDownloadr-NC-2.0
// Copyright (c) 2026 HalloWelt42
//
// MAIN-world-Hook. Läuft direkt im Seiten-Kontext und hookt:
//   - URL.createObjectURL / URL.revokeObjectURL
//   - MediaSource.prototype.addSourceBuffer
//   - SourceBuffer.prototype.appendBuffer
//   - MediaSource.prototype.endOfStream
//
// Kommunikation mit dem ISOLATED-world-Detector ausschließlich über
// window.postMessage mit dem Namespace-Marker "__BMBD__".
//
// Bytes (Blobs, SourceBuffer-Chunks) verlassen diesen Kontext nicht.
// Nur Metadaten (URL, Typ, Größe) werden gepostet.

(function () {
  'use strict';

  if (window.__BMBD_HOOK_INSTALLED__) return;
  window.__BMBD_HOOK_INSTALLED__ = true;

  var NS = '__BMBD__';
  // Debug kann per DevTools-Konsole aktiviert werden:
  //   window.__BMBD_DEBUG__ = true
  // Dann loggt der Hook Capture, Revoke, Finalize und Download mit Groessen.
  function dbg() {
    if (window.__BMBD_DEBUG__) {
      try { console.log.apply(console, ['[BMBD]'].concat([].slice.call(arguments))); } catch (_e) {}
    }
  }

  // Original-Referenzen sichern, bevor Seiten-Code sie evtl. ersetzt
  var origCreateObjectURL = URL.createObjectURL;
  var origRevokeObjectURL = URL.revokeObjectURL;
  var hasMediaSource =
    typeof window.MediaSource !== 'undefined' &&
    typeof MediaSource.prototype.addSourceBuffer === 'function';

  var origAddSourceBuffer = hasMediaSource
    ? MediaSource.prototype.addSourceBuffer
    : null;
  var origEndOfStream = hasMediaSource
    ? MediaSource.prototype.endOfStream
    : null;

  // MAP: blobUrl -> { kind, blob?, mediaSource?, mimeType, size, createdAt }
  var blobs = new Map();
  // MAP: MediaSource-Instance -> {
  //   url, mimeType, buffers: Array<Uint8Array-Chunk[]>, buffersMime[],
  //   totalSize, isFinal, progressThrottle
  // }
  var msMap = new Map();
  // Map der SourceBuffer zu seiner MediaSource (für MIME-Lookup auf appendBuffer)
  var sbToMs = new WeakMap();
  // MIME-Type pro SourceBuffer (wird beim addSourceBuffer gesetzt)
  var sbMime = new WeakMap();

  function post(type, payload) {
    try {
      window.postMessage(Object.assign({ __ns: NS, type: type }, payload), '*');
    } catch (_e) {
      /* ignorieren */
    }
  }

  function bytesOfChunk(chunk) {
    if (chunk && typeof chunk.byteLength === 'number') return chunk.byteLength;
    return 0;
  }

  // URL.createObjectURL hooken
  URL.createObjectURL = function (obj) {
    var url = origCreateObjectURL.apply(URL, arguments);

    try {
      if (obj instanceof Blob) {
        blobs.set(url, {
          kind: 'blob',
          blob: obj,
          mimeType: obj.type || '',
          size: obj.size,
          createdAt: Date.now()
        });
        dbg('Blob erfasst', obj.type, obj.size, 'Bytes, URL:', url);
        post('BLOB_CAPTURED', {
          url: url,
          mimeType: obj.type || '',
          size: obj.size
        });
      } else if (hasMediaSource && obj instanceof MediaSource) {
        msMap.set(obj, {
          url: url,
          mimeType: '',
          buffers: [],
          buffersMime: [],
          totalSize: 0,
          isFinal: false,
          progressThrottle: 0
        });
        blobs.set(url, {
          kind: 'mse',
          mediaSource: obj,
          mimeType: '',
          size: 0,
          createdAt: Date.now()
        });
        post('MSE_CAPTURED', {
          url: url,
          mimeType: '',
          size: 0
        });
      }
    } catch (_e) {
      /* ignorieren */
    }

    return url;
  };

  // URL.revokeObjectURL hooken.
  // Wichtig: wir entfernen den Eintrag NICHT aus blobs, wir markieren ihn nur.
  // Das Blob-Objekt bleibt damit erreichbar und wir koennen beim Download eine
  // frische blob:-URL daraus erzeugen. Ohne das liefert <a download> auf eine
  // revoked-URL 0 Byte (typisches Verhalten z.B. bei Messenger-Sprachnachrichten).
  URL.revokeObjectURL = function (url) {
    try {
      if (blobs.has(url)) {
        var meta = blobs.get(url);
        meta.revoked = true;
        // MSE kann nach Revoke nicht mehr weiter wachsen -- finalisieren wenn noch nicht geschehen.
        if (meta.kind === 'mse' && meta.mediaSource) {
          var msEntry = msMap.get(meta.mediaSource);
          if (msEntry) msEntry.isFinal = true;
        }
      }
    } catch (_e) {
      /* ignorieren */
    }
    return origRevokeObjectURL.apply(URL, arguments);
  };

  // MediaSource.prototype.addSourceBuffer hooken
  if (hasMediaSource) {
    MediaSource.prototype.addSourceBuffer = function (mime) {
      var sb = origAddSourceBuffer.apply(this, arguments);
      try {
        var msEntry = msMap.get(this);
        if (msEntry) {
          // Primären MIME-Type für den MediaSource-Eintrag festlegen
          // (Video-Buffer zuerst, falls vorhanden, sonst Audio)
          if (!msEntry.mimeType || /^video\//.test(mime)) {
            msEntry.mimeType = typeof mime === 'string' ? mime : '';
          }
          var blobMeta = blobs.get(msEntry.url);
          if (blobMeta) blobMeta.mimeType = msEntry.mimeType;

          // Chunk-Array pro SourceBuffer anlegen
          var bufferIndex = msEntry.buffers.length;
          msEntry.buffers.push([]);
          msEntry.buffersMime.push(typeof mime === 'string' ? mime : '');
          sbToMs.set(sb, { ms: this, bufferIndex: bufferIndex });
          sbMime.set(sb, typeof mime === 'string' ? mime : '');

          // appendBuffer für diesen SourceBuffer hooken
          hookAppendBuffer(sb);
        }
      } catch (_e) {
        /* ignorieren */
      }
      return sb;
    };

    MediaSource.prototype.endOfStream = function () {
      try {
        var msEntry = msMap.get(this);
        if (msEntry) {
          msEntry.isFinal = true;
          var blobMeta = blobs.get(msEntry.url);
          if (blobMeta) {
            blobMeta.size = msEntry.totalSize;
          }
          post('MSE_FINALIZED', {
            url: msEntry.url,
            size: msEntry.totalSize,
            mimeType: msEntry.mimeType
          });
        }
      } catch (_e) {
        /* ignorieren */
      }
      return origEndOfStream.apply(this, arguments);
    };
  }

  function hookAppendBuffer(sb) {
    var origAppend = sb.appendBuffer;
    if (!origAppend || sb.__BMBD_HOOKED__) return;
    sb.__BMBD_HOOKED__ = true;

    sb.appendBuffer = function (data) {
      try {
        var info = sbToMs.get(this);
        if (info) {
          var msEntry = msMap.get(info.ms);
          if (msEntry && !msEntry.isFinal) {
            // Chunk als Uint8Array-Kopie speichern -- ArrayBuffer/TypedArray
            // werden vom Browser weiter genutzt und könnten uns nichts sagen
            // wenn sie später detach'd werden. Sicherer: einmal kopieren.
            var u8 = chunkToUint8(data);
            if (u8 && u8.byteLength > 0) {
              msEntry.buffers[info.bufferIndex].push(u8);
              msEntry.totalSize += u8.byteLength;

              var blobMeta = blobs.get(msEntry.url);
              if (blobMeta) blobMeta.size = msEntry.totalSize;

              // Progress-Throttle (max 1 Meldung pro 500 ms)
              var now = Date.now();
              if (now - msEntry.progressThrottle > 500) {
                msEntry.progressThrottle = now;
                post('MSE_PROGRESS', {
                  url: msEntry.url,
                  size: msEntry.totalSize,
                  mimeType: msEntry.mimeType
                });
              }
            }
          }
        }
      } catch (_e) {
        /* ignorieren, Originalaufruf darf nicht scheitern */
      }
      return origAppend.apply(this, arguments);
    };
  }

  function chunkToUint8(data) {
    if (!data) return null;
    if (data instanceof Uint8Array) {
      // Kopie, weil data.buffer detach'd werden könnte
      return new Uint8Array(data);
    }
    if (data instanceof ArrayBuffer) {
      return new Uint8Array(data.slice(0));
    }
    if (ArrayBuffer.isView(data)) {
      return new Uint8Array(
        data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength)
      );
    }
    return null;
  }

  // Finalisierungs-Request vom Detector: aus dem gespeicherten Blob bzw. den
  // gesammelten MSE-Chunks eine frische blob:-URL erzeugen und zuruecksenden.
  window.addEventListener('message', function (ev) {
    if (ev.source !== window) return;
    var data = ev.data;
    if (!data || data.__ns !== NS) return;

    if (data.type === 'MSE_FINALIZE_REQUEST' && data.url) {
      finalizeMse(data.url, data.requestId);
    } else if (data.type === 'BLOB_FINALIZE_REQUEST' && data.url) {
      finalizeBlob(data.url, data.requestId);
    } else if (data.type === 'DOWNLOAD_HERE' && data.url) {
      // Download direkt im Seiten-Kontext ausloesen, dort wo der Blob lebt.
      // Das umgeht Cross-Frame-/Cross-Origin- und Revoke-Probleme, die
      // ISOLATED-world-Downloads regelmaessig mit 0-Byte-Dateien bestraften.
      downloadHere(data.url, data.kind || 'blob', data.filename || 'download.bin', data.requestId);
    } else if (data.type === 'BLOB_REVOKE_REQUEST' && data.url) {
      // User hat einen Eintrag wirklich entfernt: jetzt endgueltig aufraeumen.
      try {
        var meta = blobs.get(data.url);
        if (meta) {
          if (meta.kind === 'mse' && meta.mediaSource) {
            msMap.delete(meta.mediaSource);
          }
          blobs.delete(data.url);
        }
        origRevokeObjectURL.call(URL, data.url);
      } catch (_e) {
        /* ignorieren */
      }
    }
  });

  function downloadHere(url, kind, filename, requestId) {
    var meta = blobs.get(url);
    dbg('DOWNLOAD_HERE', kind, 'url:', url, 'meta:', meta ? {
      size: meta.size,
      mime: meta.mimeType,
      hasBlobRef: !!meta.blob,
      revoked: !!meta.revoked
    } : 'nichts bekannt');

    // 1) Frischen Blob/URL aus dem gespeicherten Objekt bauen.
    var resolved = null;
    try {
      if (kind === 'mse') {
        resolved = buildMseBlobUrl(url);
      } else {
        resolved = buildBlobUrl(url);
      }
    } catch (e) {
      dbg('Finalize-Fehler:', e);
      post('DOWNLOAD_HERE_RESULT', {
        requestId: requestId,
        ok: false,
        error: String(e && e.message ? e.message : e)
      });
      return;
    }

    if (!resolved || !resolved.url) {
      dbg('Kein Finalize moeglich, fallback auf Original-URL');
      resolved = { url: url, size: 0 };
    } else {
      dbg('Frische URL fuer Download:', resolved.url, 'Groesse:', resolved.size);
    }

    try {
      var a = document.createElement('a');
      a.href = resolved.url;
      a.download = filename;
      a.rel = 'noopener';
      a.style.display = 'none';
      (document.body || document.documentElement).appendChild(a);
      a.click();
      setTimeout(function () {
        if (a.parentNode) a.parentNode.removeChild(a);
      }, 100);
      post('DOWNLOAD_HERE_RESULT', {
        requestId: requestId,
        ok: true,
        size: resolved.size || 0,
        resolvedUrl: resolved.url
      });
    } catch (e) {
      post('DOWNLOAD_HERE_RESULT', {
        requestId: requestId,
        ok: false,
        error: String(e && e.message ? e.message : e)
      });
    }
  }

  function buildBlobUrl(url) {
    var meta = blobs.get(url);
    if (!meta || meta.kind !== 'blob' || !meta.blob) return null;
    var newUrl = origCreateObjectURL.call(URL, meta.blob);
    blobs.set(newUrl, {
      kind: 'blob',
      blob: meta.blob,
      mimeType: meta.mimeType,
      size: meta.blob.size,
      createdAt: Date.now()
    });
    return { url: newUrl, size: meta.blob.size };
  }

  function buildMseBlobUrl(url) {
    var meta = blobs.get(url);
    if (!meta || meta.kind !== 'mse' || !meta.mediaSource) return null;
    var msEntry = msMap.get(meta.mediaSource);
    if (!msEntry) return null;
    var bufIndex = pickPrimaryBuffer(msEntry);
    var chunks = msEntry.buffers[bufIndex] || [];
    var mime = msEntry.buffersMime[bufIndex] || msEntry.mimeType || '';
    if (!chunks.length) return null;
    var blob = new Blob(chunks, { type: mime });
    var newUrl = origCreateObjectURL.call(URL, blob);
    blobs.set(newUrl, {
      kind: 'blob',
      blob: blob,
      mimeType: mime,
      size: blob.size,
      createdAt: Date.now()
    });
    return { url: newUrl, size: blob.size };
  }

  function finalizeBlob(url, requestId) {
    var meta = blobs.get(url);
    if (!meta || meta.kind !== 'blob' || !meta.blob) {
      post('FINALIZED_URL', {
        requestId: requestId,
        sourceUrl: url,
        url: null,
        error: 'not-found'
      });
      return;
    }
    try {
      // Frische URL aus dem noch gehaltenen Blob-Objekt. Funktioniert auch
      // nachdem die Original-URL per revokeObjectURL ungueltig wurde.
      var newUrl = origCreateObjectURL.call(URL, meta.blob);
      blobs.set(newUrl, {
        kind: 'blob',
        blob: meta.blob,
        mimeType: meta.mimeType,
        size: meta.blob.size,
        createdAt: Date.now()
      });
      post('FINALIZED_URL', {
        requestId: requestId,
        sourceUrl: url,
        url: newUrl,
        mimeType: meta.mimeType || meta.blob.type || '',
        size: meta.blob.size
      });
    } catch (e) {
      post('FINALIZED_URL', {
        requestId: requestId,
        sourceUrl: url,
        url: null,
        error: String(e && e.message ? e.message : e)
      });
    }
  }

  function finalizeMse(url, requestId) {
    var meta = blobs.get(url);
    if (!meta || meta.kind !== 'mse' || !meta.mediaSource) {
      post('FINALIZED_URL', {
        requestId: requestId,
        sourceUrl: url,
        url: null,
        error: 'not-found'
      });
      return;
    }
    var ms = meta.mediaSource;
    var msEntry = msMap.get(ms);
    if (!msEntry) {
      post('FINALIZED_URL', {
        requestId: requestId,
        sourceUrl: url,
        url: null,
        error: 'no-entry'
      });
      return;
    }

    try {
      // Primären Buffer wählen: Video bevorzugt, sonst größter Buffer.
      // Fragmentierte MP4/WebM-Player liefern typischerweise einen
      // Video-Buffer, der allein abspielbar ist (enthält init + media),
      // oder einen kombinierten Buffer.
      var bufIndex = pickPrimaryBuffer(msEntry);
      var chunks = msEntry.buffers[bufIndex] || [];
      var mime = msEntry.buffersMime[bufIndex] || msEntry.mimeType || '';
      if (!chunks.length) {
        post('FINALIZED_URL', {
          requestId: requestId,
          sourceUrl: url,
          url: null,
          error: 'empty'
        });
        return;
      }
      var blob = new Blob(chunks, { type: mime });
      var newUrl = origCreateObjectURL.call(URL, blob);

      blobs.set(newUrl, {
        kind: 'blob',
        blob: blob,
        mimeType: mime,
        size: blob.size,
        createdAt: Date.now()
      });
      post('FINALIZED_URL', {
        requestId: requestId,
        sourceUrl: url,
        url: newUrl,
        mimeType: mime,
        size: blob.size
      });
    } catch (e) {
      post('FINALIZED_URL', {
        requestId: requestId,
        sourceUrl: url,
        url: null,
        error: String(e && e.message ? e.message : e)
      });
    }
  }

  function pickPrimaryBuffer(msEntry) {
    // Video-Buffer bevorzugen, sonst der mit den meisten Bytes
    var idx = -1;
    var bestSize = -1;
    for (var i = 0; i < msEntry.buffers.length; i++) {
      var mime = msEntry.buffersMime[i] || '';
      var size = 0;
      var chunks = msEntry.buffers[i];
      for (var j = 0; j < chunks.length; j++) size += chunks[j].byteLength;
      if (/^video\//.test(mime)) return i;
      if (size > bestSize) {
        bestSize = size;
        idx = i;
      }
    }
    return idx >= 0 ? idx : 0;
  }
})();
