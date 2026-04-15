# Nutzungsbedingungen / Terms of Use

## Deutsch

### 1. Zweck der Erweiterung

Browser Media Blob Downloadr ist ein Werkzeug, um Blob-Referenzen (`blob:`-URLs) auf der aktuell geöffneten Webseite zu erfassen und deren Inhalte als lokale Datei abzuspeichern. Alle Verarbeitungsschritte finden im Browser statt.

### 2. Verantwortung der Nutzenden

Die Verantwortung für die Rechtmäßigkeit der lokalen Speicherung von Medieninhalten liegt bei den Nutzenden. Das betrifft insbesondere Urheber-, Lizenz- und Persönlichkeitsrechte. Die Erweiterung umgeht keine technischen Schutzmaßnahmen (DRM); sie greift ausschließlich bereits vom Browser bereitgestellte Blob-Daten ab.

### 3. Technische Einschränkungen

- Seiten mit strenger Content Security Policy können die Injektion des MAIN-world-Hooks blockieren.
- DRM-geschützte Medien werden vom Browser nicht als frei verfügbare Blob-Bytes bereitgestellt und sind daher nicht erfassbar.
- MediaSource-Streams werden in dem Container-Format gespeichert, in dem sie der Player konsumiert (üblicherweise fragmentiertes MP4 oder WebM); es findet keine Re-Muxung statt.

### 4. Keine Gewährleistung

Die Software wird "wie sie ist" bereitgestellt. Es besteht keine Gewähr für Funktionsumfang, Stabilität oder Verfügbarkeit.

### 5. Haftungsausschluss

Für direkte oder indirekte Schäden, die aus der Nutzung entstehen, wird keine Haftung übernommen, soweit gesetzlich zulässig.

### 6. Lizenz

Die Nutzungsbedingungen ergänzen die Lizenz in [LICENSE](LICENSE). Im Konfliktfall hat der dort vereinbarte Text Vorrang.

### 7. Änderungen

Diese Bedingungen können angepasst werden. Die jeweils aktuelle Fassung ist Teil des Repositorys.

### 8. Kontakt

Fragen oder Anliegen: GitHub-Issues unter
<https://github.com/HalloWelt42/blob-media-downloadr-chrome-extension>

---

## English

### 1. Purpose

Browser Media Blob Downloadr is a tool to observe blob references (`blob:` URLs) on the currently open web page and save their contents as a local file. All processing happens within the browser.

### 2. Responsibility of users

Users are responsible for ensuring that any local saving of media is lawful, particularly regarding copyright, licensing and personal-rights constraints. The extension does not bypass technical protection measures (DRM); it only reads blob data already provided by the browser.

### 3. Technical limitations

- Pages with strict Content Security Policy may block the MAIN-world hook injection.
- DRM-protected media is not exposed as free blob bytes by the browser and therefore cannot be captured.
- MediaSource streams are saved in the container format the player consumes (typically fragmented MP4 or WebM); no re-muxing is performed.

### 4. No warranty

The software is provided "as is". No warranty is given regarding functionality, stability or availability.

### 5. Disclaimer

To the extent permitted by law, no liability is assumed for direct or indirect damages arising from the use of this software.

### 6. License

These terms supplement the [LICENSE](LICENSE). In case of conflict, the license text prevails.

### 7. Changes

These terms may be updated. The current version is part of the repository.

### 8. Contact

Questions or concerns: file a GitHub issue at
<https://github.com/HalloWelt42/blob-media-downloadr-chrome-extension>
