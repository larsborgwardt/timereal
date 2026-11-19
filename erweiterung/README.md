# Timereal für Chrome und Edge

Die Erweiterung verwendet den bestehenden Timereal-Server. Ihr Popup bedient den gleichen Timer wie die Web-App. „Ganze App öffnen“ öffnet die mitgelieferte Oberfläche als Erweiterungsseite mit Woche, Nachweisen, Pflege und Einstellungen.

## Bauen und laden

### Microsoft Partner Center

Für **Packages → Upload package** das Paket **`timereal-erweiterung-0.9.2-edge-store.zip`** verwenden. Das bisherige `timereal-erweiterung-0.9.0.zip` ist das Entwicklungspaket zum entpackten Laden und wird wegen seines `key`-Feldes vom Partner Center zurückgewiesen.

Das Upload-Paket wird mit dem folgenden Befehl erstellt (Node.js 24 und `zip` erforderlich):

```bash
node scripts/erweiterung-bauen.mjs --target edge-store --zip
```

Ergebnis unter `dist/`: ZIP und zugehörige SHA256-Datei. `manifest.json` liegt direkt an der ZIP-Wurzel. Der Build entfernt `key` und `update_url` nur aus dem Store-Paket; das Quellmanifest für die Entwicklung bleibt erhalten. Die Erweiterung trägt Version 0.9.2. Der Server muss für die Store-Anmeldung mindestens Version 0.9.1 verwenden.

**Store-Anmeldung ab Server 0.9.1:** Die von Microsoft vergebene CRX-ID lautet `lidpjdoofliniabfnkljpfadffmjockd`. Diese Kennung ist für CORS und den eigenen Anmelderücksprung `https://lidpjdoofliniabfnkljpfadffmjockd.chromiumapp.org/timereal` freigeschaltet. Die Entwicklungs-ID bleibt separat unterstützt. Produkt-ID (GUID) und Store-ID werden nicht als Browserkennung verwendet.

Zuerst den Timereal-Server auf 0.9.2 aktualisieren. Danach das Edge-Store-ZIP im bestehenden Timereal-Eintrag hochladen. Ein dort bereits angenommenes Edge-Store-Paket 0.9.0 kann ebenfalls mit Server 0.9.1 verbunden werden; der Anmeldefehler lag auf der Serverseite. Das lokale Entwicklungspaket bleibt für den Store ungeeignet.

Die Anmeldung einschließlich zweitem Faktor, Timerwechsel und Sitzungswiderruf ist in Chromium mit Microsofts öffentlichem Schlüssel und der echten CRX-ID geprüft. Dafür erhält nur eine entpackte Wegwerf-Testkopie den öffentlichen Schlüssel; das Upload-ZIP enthält weiterhin kein `key`. Microsofts signierte Store-Installation wird nach Veröffentlichung separat geprüft.

Die lokalen Paket- und Chromium-Startprüfungen sind keine Bestätigung der Microsoft-Zertifizierung. Store-Beschreibung, Datenschutzangaben, Logo, Berechtigungsbegründungen und Prüfanweisungen werden im Partner Center ergänzt. Grundlage: [Microsofts Veröffentlichungsanleitung](https://learn.microsoft.com/en-us/microsoft-edge/extensions/publish/publish-extension) und [Portierung nach Edge](https://learn.microsoft.com/en-us/microsoft-edge/extensions/developer-guide/port-chrome-extension).

### Logo im Partner Center

Das Release enthält zusätzlich `timereal-store-logo-300.png`. Lade diese Datei bei **Store listings → Sprache → Extension logo** hoch. Sie ist 300 × 300 Pixel groß und enthält das von Lars freigegebene Timereal-Symbol. Das ZIP enthält die kleineren PNG-Symbole für Browserleiste und Erweiterungsverwaltung bereits. Das Logo wird separat hochgeladen, nicht als Erweiterungspaket.

### Entpacktes Entwicklungspaket

Für den Testpilot kannst du auch `timereal-erweiterung-0.9.2-entwicklung.zip` aus dem [Release v0.9.2](https://github.com/larsborgwardt/timereal/releases/tag/v0.9.2) herunterladen und entpacken. Lade dann den entpackten Ordner im Browser; die ZIP-Datei selbst wird nicht als Erweiterung geladen.

Im Repository `npm ci --ignore-scripts` und `node scripts/erweiterung-bauen.mjs` ausführen. In `chrome://extensions` beziehungsweise `edge://extensions` den Entwicklermodus einschalten und **Entpackte Erweiterung laden** wählen. Ordner: `dist/erweiterung`. Das Browserleistensymbol anschließend anheften. Ein Update lädt denselben Ordner erneut; der öffentliche Schlüssel im Manifest hält die Kennung stabil. Ein privater Signaturschlüssel liegt nicht im Repository.

Unter den Erweiterungsoptionen die HTTPS-Adresse des eigenen Timereal-Servers eintragen. Erlaube den Zugriff auf diese Adresse, melde dich im geöffneten Timereal-Fenster an und bestätige „Erweiterung verbinden“. Für den lokalen Entwicklungstest ist HTTP nur auf Loopback zugelassen. Im Testnetz mit eigener Zertifizierungsstelle muss der Browser der Test-CA vertrauen.

Die Erweiterung speichert ihre Sitzung im Sitzungsspeicher des Browsers und benötigt nach einem Browserneustart eine neue Anmeldung. Ein Wechsel der konfigurierten Serveradresse sendet den alten Sitzungsschlüssel nicht an den neuen Server. Unter Einstellungen der Web-App kann die Sitzung „Browsererweiterung“ widerrufen werden.

Updates und Domainwechsel des Servers werden über eine Administrator-Websitzung in der Web-App ausgeführt. Diese Betriebsbereiche werden in der Erweiterungsseite ausgeblendet.

## Verbindung und Berechtigungen

Ohne Serverantwort wird kein Wechsel automatisch nachgeholt. „Aktuellen Stand laden“ liest zuerst den gemeinsamen Timer. Die nächste Timeraktion wird ausdrücklich bestätigt. Ein Schließen des Popups hebt diesen Schutz nicht auf.

Die Erweiterung fordert `storage`, `identity` und zur Laufzeit die Berechtigung für den gewählten Server an. Es gibt keine Inhaltsskripte und keinen Zugriff auf Inhalte anderer Tabs. API-Sitzungen sind auf den Erweiterungskanal beschränkt. Die Anmeldung bindet einen kurzlebigen Einmalcode an PKCE-S256, einen zufälligen Zustand und das feste Rücksprungziel der Erweiterung.

Technische Grundlagen: [Chrome Identity](https://developer.chrome.com/docs/extensions/reference/api/identity), [Chrome Storage](https://developer.chrome.com/docs/extensions/reference/api/storage). Die Browserprobe verwendet [Playwrights Erweiterungsbetrieb mit persistentem Chromium-Kontext](https://playwright.dev/docs/chrome-extensions). Der Store-Weg und die Server-Mindestversion sind oben beschrieben.

## Anmeldung mit zweitem Faktor

Ab Server 0.9.0 fragt das Verbindungsfenster bei eingeschaltetem Faktor nach dem Authenticator-Code oder einem unbenutzten Wiederherstellungscode. Erst danach kannst du die Erweiterung freigeben. Ein abgebrochener Anmeldeversuch ersetzt keine bestehende Verbindung. Die Einrichtung und Verwaltung des Faktors erfolgt in der Web-App. Nach Aktivierung, Codeerneuerung oder Ausschalten musst du die Erweiterung erneut verbinden. Server zuerst aktualisieren; danach den entpackten Erweiterungsordner ersetzen und in der Erweiterungsverwaltung neu laden.
