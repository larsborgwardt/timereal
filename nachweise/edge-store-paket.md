# Edge-Upload-Paket: Korrektur vom 19. November 2026

Ausgangsstand: `b858f9f0e72df0db829f3e40a0d33965afb5022c` (0.9.0). Lars meldete im Microsoft Partner Center: „The manifest shouldn't contain the keyfield. Line: 0 Cloumn: 0“. Das bisherige FTP-ZIP enthält tatsächlich `key` und ist ein Entwicklungspaket. Die vorherige Bereitstellung hatte den geforderten Store-Upload nicht qualifiziert.

Der Build besitzt nun getrennte Ziele `development` und `edge-store`. Das Store-ZIP entfernt `key` und `update_url`, legt das Manifest an der ZIP-Wurzel ab und liefert eine SHA256-Datei. Der Standardaufruf behält den bisherigen Entwicklungsordner und dessen stabile Kennung. Keine Änderung an Anwendung, Datenbankschema oder Berechtigungsumfang.

## Prüfungen

| Kommando | Ergebnis |
|---|---|
| `node --test tests/erweiterung-paket.test.mjs` vor Produktänderung | Exit 1: verlangtes Edge-ZIP wird noch nicht erzeugt. |
| `node --test tests/erweiterung-paket.test.mjs` nach Produktänderung | Exit 0: Manifest im echten ZIP geprüft; Entwicklungsfelder fehlen, Laufzeitdateien und Prüfsumme passen; erneuter Build nimmt keine alten Ausgabedateien auf; Entwicklungsmanifest und Quellmanifest bleiben erhalten; ungültige Argumente werden abgelehnt. |
| `node scripts/erweiterung-bauen.mjs --target edge-store --zip` | Exit 0: gesondertes Upload-ZIP erstellt. |
| `node tests/erweiterung-store-browser.mjs` | Exit 0: genau dieses ZIP entpackt und in Chromium geladen; Hintergrunddienst, Optionen und Popup starten. Die Kennung unterscheidet sich von der Entwicklungs-ID. |
| `BROWSER_TEST=1 npm test` | Exit 0: vorhandene Datenbank-, API-, Betriebs- und Browserprüfungen einschließlich vollständiger Anmeldung der Entwicklungserweiterung bestanden. Eine zuvor separat angelegte Wegwerf-Datenbank hatte noch kein App-Rollenpasswort (28P01); der reguläre Testeinstieg richtet diese Voraussetzung ein. |
| `npm run build` und `git diff --check` | Exit 0. |

Das FTP-Paket liegt unter `/srv/ftp-upload/drop/timereal-erweiterung-0.9.0-edge-store.zip` (SHA256 `df3f003db454881b8068987cf6093e15643f2b8d5847376ef78dfb87a1845195`). Paket und Prüfsumme wurden zurückgelesen und synchronisiert; Lesbarkeit als FTP-Nutzer `lars` geprüft. Ein Inhaltsvergleich per Python `zipfile` mit dem vorherigen FTP-ZIP ergab Änderungen an `manifest.json` und `README.md`; die ausführbaren Dateien sind bytegleich. Der Manifestvergleich ergibt genau das alte Manifest nach Entfernung von `key`.

Die GitHub-Prüfung führt Pakettest, Build und Browserstart aus und stellt das Store-ZIP als eigenes Artefakt bereit. Der lokale Browserstart prüft Chromium, nicht eine Microsoft-Zertifizierung oder eine Anmeldung über die noch unbekannte Store-ID. Der erste Browser-Testlauf scheiterte an einer fehlerhaften URL-Bildung im Test (`URL.origin` liefert für das Erweiterungsschema `null`); der Test verwendet danach Protokoll und Host. Produktcode war davon nicht betroffen.

## Offener Integrationsnachweis

`src/erweiterung.ts` und `src/app.ts` begrenzen CORS und Redirects weiterhin auf die bekannte Entwicklungs-ID. Microsofts eigene Erweiterungs-ID muss vor Veröffentlichung aufgenommen und der vollständige Anmeldeablauf damit geprüft werden. Die ID wurde bei Lars angefragt. Ohne sie wird das Paket als Upload-Korrektur, nicht als vollständig verbundene Store-Ausgabe übergeben.
