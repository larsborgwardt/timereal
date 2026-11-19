# Timereal für Chrome und Edge

Die Erweiterung verwendet den bestehenden Timereal-Server. Ihr Popup bedient den gleichen Timer wie die Web-App. „Ganze App öffnen“ öffnet die mitgelieferte Oberfläche als Erweiterungsseite mit Woche, Nachweisen, Pflege und Einstellungen.

## Bauen und laden

Für den Testpilot kannst du auch `timereal-erweiterung-0.6.1.zip` aus dem [Release v0.6.1](https://github.com/larsborgwardt/timereal/releases/tag/v0.6.1) herunterladen und entpacken. Lade dann den entpackten Ordner im Browser; die ZIP-Datei selbst wird nicht als Erweiterung geladen.

Im Repository `npm ci --ignore-scripts` und `node scripts/erweiterung-bauen.mjs` ausführen. In `chrome://extensions` beziehungsweise `edge://extensions` den Entwicklermodus einschalten und **Entpackte Erweiterung laden** wählen. Ordner: `dist/erweiterung`. Das Browserleistensymbol anschließend anheften. Ein Update lädt denselben Ordner erneut; der öffentliche Schlüssel im Manifest hält die Kennung stabil. Ein privater Signaturschlüssel liegt nicht im Repository.

Unter den Erweiterungsoptionen die HTTPS-Adresse des eigenen Timereal-Servers eintragen. Erlaube den Zugriff auf diese Adresse, melde dich im geöffneten Timereal-Fenster an und bestätige „Erweiterung verbinden“. Für den lokalen Entwicklungstest ist HTTP nur auf Loopback zugelassen. Im Testnetz mit eigener Zertifizierungsstelle muss der Browser der Test-CA vertrauen.

Die Erweiterung speichert ihre Sitzung im Sitzungsspeicher des Browsers und benötigt nach einem Browserneustart eine neue Anmeldung. Ein Wechsel der konfigurierten Serveradresse sendet den alten Sitzungsschlüssel nicht an den neuen Server. Unter Einstellungen der Web-App kann die Sitzung „Browsererweiterung“ widerrufen werden.

## Verbindung und Berechtigungen

Ohne Serverantwort wird kein Wechsel automatisch nachgeholt. „Aktuellen Stand laden“ liest zuerst den gemeinsamen Timer. Die nächste Timeraktion wird ausdrücklich bestätigt. Ein Schließen des Popups hebt diesen Schutz nicht auf.

Die Erweiterung fordert `storage`, `identity` und zur Laufzeit die Berechtigung für den gewählten Server an. Es gibt keine Inhaltsskripte und keinen Zugriff auf Inhalte anderer Tabs. API-Sitzungen sind auf den Erweiterungskanal beschränkt. Die Anmeldung bindet einen kurzlebigen Einmalcode an PKCE-S256, einen zufälligen Zustand und das feste Rücksprungziel der Erweiterung.

Technische Grundlagen: [Chrome Identity](https://developer.chrome.com/docs/extensions/reference/api/identity), [Chrome Storage](https://developer.chrome.com/docs/extensions/reference/api/storage). Die Browserprobe verwendet [Playwrights Erweiterungsbetrieb mit persistentem Chromium-Kontext](https://playwright.dev/docs/chrome-extensions). Ein Store-Eintrag ist nicht Bestandteil dieser Testversion.
