# Sicherheitsbetrachtung

## Vertrauensgrenzen

- **MAIN world:** Der Hook läuft im selben Kontext wie das Seiten-Skript. Er kann nichts tun, was das Seiten-Skript nicht ebenfalls könnte. Ausgehende Kommunikation passiert ausschließlich über `window.postMessage` mit dem Namespace `__BMBD__`.
- **ISOLATED world (Content-Script):** Hat Zugriff auf den `chrome.*`-Namespace, kann aber keine Seiten-Variablen direkt lesen. Die Seite kann `window.postMessage`-Nachrichten fälschen, aber das Content-Script filtert streng auf `__ns === '__BMBD__'` und verwendet nur dokumentierte Felder. Der Detector führt keine Code-Injektion aufgrund Message-Inhalten durch.
- **Service-Worker:** Kein direkter Code-Kontakt mit Seiten-Daten. Empfängt nur Metadaten von Content-Scripts. Verifiziert bei jedem `POPUP_REQUEST_DOWNLOAD`, dass der Eintrag im State bekannt ist, bevor er den Download anstößt.

## Content Security Policy

Die Erweiterung setzt für Extension-Seiten:

```
script-src 'self'; object-src 'self'; img-src 'self' https: data:;
```

Kein `unsafe-eval`, kein `wasm-unsafe-eval`, keine Remote-Skripte. Das Popup und die Options-Seite lösen ausschließlich lokale JS-Module.

## Keine Remote-Ausführung

- Keine eingebetteten oder heruntergeladenen JS/Wasm-Binärdateien
- Keine externen Netzwerkanfragen aus der Erweiterung
- Die Spendenseite öffnet externe Links nur nach Nutzer-Klick

## Umgang mit Blob-Bytes

- Bytes bleiben im MAIN-world-Kontext der Seite, die sie erzeugt hat
- MSE-Chunks werden in Seiten-RAM gehalten, ohne an Content-Script oder Service-Worker weitergereicht zu werden
- Download erfolgt per `<a download>.click()` im Tab -- dasselbe Pattern, das der Browser selbst nutzt
- `chrome.runtime.sendMessage` wird nie mit Binärnutzlasten belastet (Limit ~64 MB, aber wir senden schlicht keine)

## Angriffsflächen und Gegenmaßnahmen

| Risiko                                                         | Gegenmaßnahme                                                                |
| -------------------------------------------------------------- | ---------------------------------------------------------------------------- |
| Seite fälscht postMessage, um den Hook/Detector zu manipulieren | Namespace-Filter `__BMBD__`; nur bekannte `type`-Werte verarbeitet; keine DOM-Schreibaktion abhängig von Nachrichtinhalt |
| Seite überschreibt `URL.createObjectURL` nach unserer Hookung | Original-Referenz wird bei Script-Start eingefroren; nachfolgende Seiten-Patches umgehen den Hook nur für neue Aufrufe -- Sicherheitsrisiko ist keiner, nur Funktionsverlust |
| Nicht-vertrauenswürdiges Content-Script anderer Extensions     | Sendet auf `chrome.runtime.onMessage`-Ebene nur, wenn `sender.tab` gesetzt ist; Nachrichten ohne Tab-ID werden ignoriert |
| Verlust des State im Service-Worker (MV3-Sleep)                | In-Memory-State wird bewusst nicht persistiert; Blobs sind an den Tab gebunden und nach Neuladen ohnehin ungültig |
| Host-Whitelist/Blacklist-Fehlbedienung                         | Host-Regeln greifen nur für Auto-Download; manuelle Downloads bleiben möglich |

## Berechtigungs-Minimalprinzip

- Keine `offscreen`, keine `declarativeNetRequest`, keine `cookies`, keine `webRequest`
- `downloads` ist optional und wird im aktuellen Code nicht benötigt (Download läuft über `<a download>`), wird aber vorgehalten, um bei Bedarf einen alternativen Download-Pfad nutzen zu können
- `host_permissions: *://*/*` ist technisch erforderlich, weil Blobs auf beliebigen Domains entstehen können; es werden keine Seiteninhalte gelesen und keine Cookies gesetzt

## Meldung von Sicherheitsproblemen

Bitte per GitHub-Issue oder direkt an <my@jobmagnetix.de>. Keine vertraulichen Daten in öffentliche Issues einstellen.
