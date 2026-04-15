# Browser Media Blob Downloadr

Eine Chrome-Erweiterung, die beliebige `blob:`-URLs aus dem Browser erfasst und als Datei speichert -- inklusive Streaming-Videos, die per MediaSource Extensions ausgeliefert werden. Alles passiert lokal, ohne Cloud, ohne Telemetrie.

## Funktionen

- Automatische Erfassung aller Blob-URLs, die eine Webseite erzeugt (`URL.createObjectURL`-Hook in der MAIN world)
- MediaSource-Capture: Chunks werden beim `SourceBuffer.appendBuffer` gesammelt, die Live-Größe wird im Popup angezeigt, nach `endOfStream()` kann der vollständige Blob heruntergeladen werden
- DOM-Fallback: Erfasst auch `<video|audio|img|source|a>` mit `blob:`-URL, die vor der Hook-Injektion entstanden sind
- Popup mit Filter-Pills (Audio, Video, Bild, Dokument, Sonstige) und MIME-/Größen-Badge pro Eintrag
- Dateinamen-Muster mit Platzhaltern (`{host}`, `{date}`, `{time}`, `{mime}`, `{ext}`, `{index}`, `{title}`)
- Optionaler Auto-Download (Aus / Alle Typen / Nach Typ) mit Mindest-Größe
- Host-Whitelist/Blacklist (ein Eintrag pro Zeile)
- 20 Sprachen, Dark- und Light-Mode nach Systemeinstellung
- Keine externen Dienste, keine Drittanbieter-Bibliotheken

## Installation

### Entwicklermodus

1. `chrome://extensions` öffnen
2. Entwicklermodus aktivieren
3. "Entpackte Erweiterung laden" -> Projektordner `blob-media-downloadr/` auswählen

### Chrome Web Store

Wird nachgereicht, sobald die Erweiterung eingereicht und geprüft ist.

## Verwendung

1. Irgendeine Seite besuchen, die Medien als Blob ausliefert (z.B. Audio-Player, Voice-Messages, eingebettete Videos)
2. Auf das Extension-Icon klicken -> die Blobs der aktuellen Seite erscheinen im Popup
3. Pro Eintrag "Herunterladen" anklicken; MediaSource-Einträge werden dabei aus den gesammelten Chunks zusammengesetzt
4. Optional: Über die Einstellungen Auto-Download aktivieren

## Projektstruktur

```
manifest.json             Manifest V3
_locales/                 20 Sprachen
assets/icons/             PNG-Icons (16, 32, 48, 128) plus SVG-Quelle
shared/i18n.js            DOM-Translate-Helper
src/background/           Service-Worker (Tab-State, Downloads, Badge)
src/content/              blob-hook.js (MAIN) und blob-detector.js (ISOLATED)
src/lib/                  MIME-Mapping und Dateinamen-Muster
src/popup/                Popup-UI
src/pages/                Optionen, Spendenseite, gemeinsame Styles
docs/                     Architektur und Sicherheit
```

## Datenschutz

Keine Telemetrie, keine Tracker, keine externen Netzwerkverbindungen. Alle Daten bleiben im Browser. Details in [PRIVACY.md](PRIVACY.md).

## Berechtigungen

- `downloads` -- optional für `chrome.downloads.download` (Fallback). Der eigentliche Download läuft per `<a download>` im Tab.
- `activeTab` -- um Titel und URL des aktiven Tabs als Dateinamens-Token zu nutzen
- `storage` -- Einstellungen in `chrome.storage.sync`
- `scripting` -- Injektion des MAIN-world-Hooks
- Hostberechtigung `*://*/*` -- universelle Blob-Erfassung

## Lizenz

CC BY-NC-ND 4.0 mit Zusatzbestimmungen (Non-Commercial License v2.0). Siehe [LICENSE](LICENSE).

## Unterstützen

Keine Werbung, keine Paywall. Wenn dir die Erweiterung hilft, findest du über das Herz im Popup eine Spenden-Seite mit Ko-fi und Krypto-Adressen.
