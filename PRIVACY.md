# Datenschutz / Privacy

## Deutsch

### Überblick

Browser Media Blob Downloadr verarbeitet ausschließlich lokal im Browser. Es werden keine Daten an externe Server gesendet, kein Tracking, keine Telemetrie, keine Analytics.

### Welche Daten werden verarbeitet?

Die Erweiterung beobachtet im Kontext der jeweils besuchten Seite:

- `URL.createObjectURL` und `URL.revokeObjectURL`-Aufrufe (Hook in der MAIN world)
- `MediaSource.addSourceBuffer` sowie `SourceBuffer.appendBuffer` (MediaSource-Capture)
- DOM-Elemente mit `blob:`-URL im Attribut `src` oder `href` (Fallback-Scan)

Erfasst werden jeweils nur Metadaten: URL der Blob-Referenz, MIME-Type, Größe, Zeitstempel sowie Titel und Host der Quellseite. Die eigentlichen Bytes verlassen nie den Tab-Kontext, in dem sie entstanden sind. Sie werden nicht über Nachrichten verschickt und nicht in Speicherbereichen außerhalb des Tabs abgelegt.

### Externe Netzwerkanfragen

Keine. Die Erweiterung spricht keinen Server an. Die Spendenseite verlinkt auf Ko-fi und zeigt Crypto-Adressen -- diese Links werden erst beim Klick vom Nutzer aufgerufen.

### Datenspeicherung und Löschung

- **Einstellungen** werden in `chrome.storage.sync` gehalten (z.B. Dateinamen-Muster, Auto-Download-Modus, Host-Regeln). Werden per Chrome-Sync zwischen eigenen Geräten synchronisiert, verlassen aber nicht Chromes eigene Sync-Infrastruktur.
- **Erfasste Blobs** existieren ausschließlich im Speicher des Service-Workers und werden beim Schließen des Tabs, bei Navigation innerhalb des Tabs oder beim Entladen der Erweiterung entfernt.
- **Keine Cookies** oder sonstige persistente Nutzerspuren.

### Berechtigungen

| Berechtigung       | Zweck                                                                  |
| ------------------ | ---------------------------------------------------------------------- |
| `downloads`        | Optionaler Fallback-Download über die Chrome-Download-API              |
| `activeTab`        | Titel und URL des aktiven Tabs als Dateinamens-Token                   |
| `storage`          | Einstellungen speichern                                                |
| `scripting`        | MAIN-world-Hook in den Tab injizieren                                  |
| `*://*/*`          | Blob-Erfassung auf beliebigen Seiten (universeller Blob-Grabber)       |

### Kontakt

Fragen oder Anliegen bitte als Issue im öffentlichen Repository:
<https://github.com/HalloWelt42/blob-media-downloadr-chrome-extension>

---

## English

### Overview

Browser Media Blob Downloadr processes data exclusively in the local browser. No data is sent to external servers; no tracking, no telemetry, no analytics.

### Which data is processed?

Within the context of the visited page, the extension observes:

- Calls to `URL.createObjectURL` and `URL.revokeObjectURL` (MAIN-world hook)
- `MediaSource.addSourceBuffer` and `SourceBuffer.appendBuffer` (MediaSource capture)
- DOM elements with a `blob:` URL in `src` or `href` (fallback scan)

Only metadata is captured: blob URL, MIME type, size, timestamp, page title and host. The bytes themselves never leave the tab context they were created in. They are not sent over messages and not stored outside the tab.

### External network traffic

None. The extension does not contact any server. The donation page links to Ko-fi and displays crypto addresses; these links open only if the user clicks them.

### Storage and deletion

- **Settings** are stored in `chrome.storage.sync` (file name pattern, auto-download mode, host rules). Synced across the user's own devices via Chrome sync only.
- **Captured blobs** live solely in the service-worker memory. They are removed when the tab closes, when the tab navigates, or when the extension is unloaded.
- **No cookies** or other persistent user identifiers.

### Permissions

| Permission       | Purpose                                                         |
| ---------------- | --------------------------------------------------------------- |
| `downloads`      | Optional fallback via the Chrome Downloads API                  |
| `activeTab`      | Active tab title and URL used as filename tokens                |
| `storage`        | Persists settings                                               |
| `scripting`      | Inject the MAIN-world hook into the page                        |
| `*://*/*`        | Universal blob capture on arbitrary sites                       |

### Contact

Questions or concerns: please file an issue on the public repository:
<https://github.com/HalloWelt42/blob-media-downloadr-chrome-extension>
