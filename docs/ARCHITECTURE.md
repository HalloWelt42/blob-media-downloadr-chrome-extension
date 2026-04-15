# Architektur

## Überblick

Die Erweiterung folgt einer Drei-Schichten-Struktur:

```
 Webseite (MAIN world)             <--- blob-hook.js
   |  window.postMessage (Namespace __BMBD__)
   v
 Content-Script (ISOLATED world)   <--- blob-detector.js
   |  chrome.runtime.sendMessage
   v
 Service-Worker (MV3 module)       <--- service-worker.js
   |
   +-> Popup (chrome.runtime.sendMessage)
   +-> Options (chrome.storage.sync)
   +-> chrome.action.setBadgeText
```

Bytes (Blobs, SourceBuffer-Chunks) verbleiben immer im MAIN-world-Kontext der Seite. Über Messages werden ausschließlich Metadaten übertragen: URL-Referenzen, MIME, Größe, Zeitstempel.

## blob-hook.js (MAIN world)

Wird vom Detector per `<script src="chrome-extension://...">` so früh wie möglich (document_start) injiziert. Hookt:

- `URL.createObjectURL(blob)` -- identifiziert Blob-Arg und postet `BLOB_CAPTURED`
- `URL.createObjectURL(mediaSource)` -- identifiziert MediaSource, hält eigenen Tracking-Eintrag, postet `MSE_CAPTURED`
- `URL.revokeObjectURL(url)` -- postet `BLOB_REVOKED`
- `MediaSource.prototype.addSourceBuffer(mime)` -- patcht den neu erzeugten SourceBuffer
- `SourceBuffer.prototype.appendBuffer(chunk)` -- Chunks in einem pro-SourceBuffer-Array sammeln, gedrosseltes `MSE_PROGRESS` senden
- `MediaSource.prototype.endOfStream()` -- postet `MSE_FINALIZED`

Auf Wunsch des Detectors (`MSE_FINALIZE_REQUEST`) wird aus den Chunks ein neuer Blob erzeugt (Video-Buffer bevorzugt, sonst größter), eine neue blob-URL im selben Kontext generiert und per `MSE_FINALIZED_URL` zurückgemeldet.

## blob-detector.js (ISOLATED world)

- Injiziert den Hook (Web-accessible resource)
- Lauscht auf Messages aus der MAIN world, filtert per Namespace `__BMBD__`
- Scannt zusätzlich den DOM nach `blob:`-URLs in Media-Elementen und Download-Links (Fallback)
- Meldet an den Service-Worker: `BLOB_FOUND` (neuer Eintrag), `BLOB_UPDATE` (Size/Final-Flag), `BLOB_REVOKED`
- Führt `DOWNLOAD_BLOB`-Requests lokal aus, indem ein `<a href=blobUrl download=filename>` erzeugt, geklickt und entfernt wird -- so läuft der Download GB-sicher aus dem richtigen Kontext und trifft nicht die 64-MB-Serialisierungsgrenze des Runtime-Messaging.

## service-worker.js

- Hält `Map<tabId, Map<url, BlobMeta>>` im Speicher
- Aktualisiert das Toolbar-Badge (`chrome.action.setBadgeText`) pro Tab
- Räumt State auf bei `chrome.tabs.onRemoved` und `chrome.tabs.onUpdated` (Status `loading`)
- Beantwortet Popup-Anfragen: Liste abfragen, Download auslösen, Eintrag entfernen, alle entfernen
- Prüft nach jedem `BLOB_FOUND`/`BLOB_UPDATE`, ob Auto-Download greifen soll (Modus, Mindestgröße, Host-Regeln, MIME-Kategorie)
- Rendert Dateinamen mit `src/lib/filename.js`

Der Service-Worker ist flüchtig (MV3); der State wird nicht persistiert. Das ist vertretbar, weil erfasste Blobs beim Tab-Neuladen ohnehin verfallen.

## Popup (src/popup/)

- Baut die Liste der Einträge des aktuellen Tabs
- Filter-Pills verändern nur die Ansicht, nicht den State
- Pollt alle 1,5 s den Service-Worker, damit MSE-Fortschritt und Auto-Updates im UI landen
- Footer-Pills verlinken auf Datenschutz, Donate-Seite und GitHub

## Options (src/pages/options.*)

- Lädt und speichert Einstellungen in `chrome.storage.sync`
- Felder: Dateinamen-Muster, Auto-Download-Modus, Typ-Auswahl (byType), Mindestgröße, MSE-Final-Flag, Host-Whitelist/Blacklist

## Design-System

- CSS-Variablen aus `src/pages/page-common.css` (Dark-first, Light-Mode über `prefers-color-scheme`)
- Akzentfarbe Orange `#d97706`, identisch mit dem Schwesterprojekt
- Keine Inline-Styles, keine Remote-CSS, konform zur Manifest-V3-CSP (`script-src 'self'; object-src 'self'; img-src 'self' https: data:;`)

## i18n

- 20 Locales unter `_locales/<lang>/messages.json`
- 75 Keys, identisch verteilt, `appDescription` in jeder Sprache <= 132 Zeichen (Google-Limit)
- DOM-Helper `shared/i18n.js` füllt `data-i18n*`-Attribute beim Laden

## Nicht enthalten (bewusst)

- Kein ffmpeg.wasm und kein Offscreen-Document -- Blobs sind fertig kodiert
- Kein declarativeNetRequest und keine Webrequest-Manipulation
- Keine Cookies-/Webrequest-Permissions
