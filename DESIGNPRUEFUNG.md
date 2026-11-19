# Apple-Design-Prüfung von Timereal

Auftrag von Lars am 19. November 2026: den Apple-Design-Skill auch für die komplette App anwenden. Die bestehende Web-App und Chromium-Erweiterung wurden im Browser geprüft und die unten genannten Befunde korrigiert. Die Änderungen liegen im Arbeitszweig für das nächste Lieferpaket; sie sind noch kein veröffentlichtes Release. Die neuen Verwaltungsfunktionen für Updates und Domainzugriff sind weiterhin geplant. Ihre Bildfreigabe ist erteilt; ältere freigegebene Bilder bleiben für ihre jeweiligen Abläufe maßgeblich.

## Methode und Abgrenzung

Gelesene Skillquelle: `/home/hermes/.agents/skills/idb-apple-design/SKILL.md` und das dort verlinkte Original unter `/home/hermes/.local/share/idb-skills/upstream/ff4ebddf0488598723a82bfdce1afb04de0b1c44/apple-design/SKILL.md`. Angewendet werden Webprinzipien aus Accessibility, Layout, Typografie, Farbe, Buttons, Loading, Progress Indicators, Writing und Cross-platform. Native Apple-Menüs, Apple Pay und Glass-Effekte sind keine Anforderungen an diese Browseranwendung.

Die Bestandsaufnahme unterscheidet Quellbefund, im Browser erreichten Zustand und tatsächlichen Sichtnachweis. Ein freigegebenes Bild oder grüner Build ersetzt keinen Funktions- oder Sichtnachweis. Fehler im bestehenden Bedienvertrag werden korrigiert; eine zusätzliche grundlegende Neugestaltung wird nicht still aus dem Prüfauftrag abgeleitet.

## Ergebnis und Prüfumfang

Bewertung der geprüften Bestandsoberfläche: **gut**. Timereal bleibt eine ruhige Arbeitsanwendung mit lesbarer Systemschrift, klaren Timeraktionen und zurückhaltender Farbe. Die auffällige Timeranzeige dient der eigentlichen Arbeit; dekorative Zusätze würden dabei nicht helfen. Die getrennten Karten für laufende Arbeit, Buchungsziel und Tagesverlauf bleiben erhalten. Das ist eine eigene Gestaltungsbewertung am gerenderten Bild, kein automatischer Konformitätsnachweis.

Die folgende Matrix unterscheidet Geometrie-/Semantikproben von Funktionsproben. `tests/hilfe/design.mjs` misst die erreichten Ansichten bei 320, 390 und 1280 CSS-Pixeln und normaler bzw. verdoppelter Schrift; das Erweiterungspopup bei seiner Breite von 380 Pixeln. Die Footerprobe verwendet zusätzlich 1120 Pixel. Tabellen dürfen in ihrem eigenen Bereich horizontal scrollen. Das ist eine Prüfung vergrößerter Schrift, kein Test jeder Browser-Zoomstufe.

| Einstieg / Rolle | Erreichter Zustand und geprüfter Kanal | Ausgeführter Träger / Grenze |
|---|---|---|
| `/`, abgemeldet | Anmeldung, falsches Passwort, Rücksetzanforderung, Rücksetzlink und ungültiger Link; Layout, Beschriftungen, benannte Dialoge, Fehlermeldung | `tests/design-browser.mjs`; Einladungsannahme und Passwortabweichung zusätzlich `tests/konten-browser.mjs` |
| Heute, angemeldetes Konto | Kein Timer, vorläufige/interne/zugeordnete Arbeit, Pause, Stoppen, Kundenwechsel; Layout, Tastaturfokus und echte API-Ergebnisse | `tests/design-browser.mjs`, `tests/browser.mjs`, `tests/arbeitsablauf-browser.mjs` |
| Buchungsziele, eigenes Konto | Neues Ziel, Bearbeitung, leere Suche, lange ungetrennte Namen; Umbruch, Eingaben und Speicherweg | `tests/design-browser.mjs`, `tests/arbeitsablauf-browser.mjs` |
| Tagesverlauf / Nachweise | Nachtrag, Korrektur, Unterbrechung mit Vorschau, Übernahme und Vergleich; Dialoggeometrie, erreichbare Aktionen, Änderungskennzeichnung, tatsächliche Aufteilung | `tests/arbeitsablauf-browser.mjs`; Storno wird funktional mit nativer Browserbestätigung geprüft |
| Woche | Leere/gefüllte Ansicht, Navigation und Summen; Layout, Datumsformat und API-Ergebnisse | `tests/design-browser.mjs`, `tests/arbeitsablauf-browser.mjs`; Zeitumstellung zusätzlich fachlich geprüft |
| Historie | Gefilterte/ungefilterte Ansicht, zurückgesetzter Filter und bestehende Buchungen | `tests/design-browser.mjs`, `tests/arbeitsablauf-browser.mjs` |
| Einstellungen, eigenes Konto | Profil, Zeiteinstellungen, Passwortfelder, Sitzungen; Layout, neue Eingaben während Aktualisierung/Speicherung, Speicherbestätigung und Widerruf | `tests/design-browser.mjs`, `tests/konten-browser.mjs`; Passwortwechsel zusätzlich API-Test |
| Verwaltung, Administrator | Berater und Einladungen, fehlende Mailkonfiguration, Annahme und Sperren; Layout und echte SMTP-/API-Abläufe | `tests/design-browser.mjs`, `tests/konten-browser.mjs`; normale Berater werden separat über die bestehenden Berechtigungstests geprüft |
| Footer, abgemeldet/angemeldet | Version, Updateangebot, Abruffehler und abgeschaltete Prüfung; Umbruch, Tastatur und ausgehende Anfragen | `tests/footer-browser.mjs` |
| `/erweiterung-anmelden.html` | Anmeldung, Freigabe, unterbrochene Anfrage und erneuter Versuch; Geometrie, verständlicher Fehler und sichtbare Verarbeitung | `tests/erweiterung-browser.mjs`; Authentifizierung am echten Testserver |
| Erweiterung: Einstellungen, Popup und Vollansicht | Serververbindung, gemeinsamer Timer, Notizdialog, Offlinezustand, verlorene Antwort und widerrufene Sitzung | `tests/erweiterung-browser.mjs`; echte Chromium-Erweiterung, App-Tab wird geschlossen |
| Updates und Domainzugriff | Freigegebene Entwurfszustände einschließlich Bestätigung und Rücknahme | Nur HTML-Bildvorlage geprüft; der Betriebsdienst und diese produktiven Ansichten sind noch nicht implementiert |

`tests/design-abdeckung.mjs` erzeugt die Eingänge unabhängig aus `web/index.html` und dem Erweiterungsmanifest. Seine Differenz gegen die tatsächlich gemessenen Ansichten ist im abgeschlossenen Gesamtlauf leer. [Maschinenlesbare Matrix](nachweise/design-2026-11-19/abdeckung.json), [Bedienergebnis](nachweise/design-2026-11-19/ergebnis.json). Der Abgleich beweist die Abdeckung dieser Einstiege und Dialoge, nicht jede denkbare Zustandskombination.

## Korrigierte Befunde

| Befund und Auswirkung | Änderung und Nachweis | Designbezug |
|---|---|---|
| Hoch: lange Kunden-/Ticketnamen liefen auf schmalen Ansichten aus dem Bild; Eingaben und Checkboxziele waren teils zu klein | Flexible Spalten, erlaubter Umbruch und mindestens 44 CSS-Pixel hohe Bedienflächen; rote Geometrieprobe, danach gleiche Browsermatrix grün | `accessibility.md › Vision / Mobility`, `layout.md › Best practices`; 44 CSS-Pixel sind der gewählte Webmaßstab |
| Hoch: regelmäßiges Neuladen überschrieb ungespeicherte Profileingaben; Antworten auf Speichern überschrieben zwischenzeitlich neu Geschriebenes | Entwürfe bleiben erhalten, auch bei parallel gespeichertem Nachbarformular. Eine erfolgreiche Antwort unterscheidet gespeicherte und noch ungespeicherte Änderungen. Abmelden entfernt die Entwürfe | `entering-data.md › Best practices`; verzögerte echte PATCH-Anfragen, anschließender Datenbank-/API-Abgleich |
| Hoch: Timerneuzeichnung verlor den Tastaturfokus | Fokus bleibt am passenden Bedienelement oder im zugehörigen Bereich; Navigation fokussiert die neue Überschrift und kennzeichnet die aktuelle Seite semantisch | `accessibility.md › Mobility`; echte Tabnavigation und danach ausgelöste Hintergrundaktualisierung |
| Hoch: lange Dialoge schoben Schließen/Übernehmen unter den sichtbaren Rand; Dialognamen fehlten für Hilfstechnik | Aktionsbereich bleibt beim Scrollen sichtbar, Dialoge erhalten ihre Überschrift als zugänglichen Namen | `accessibility.md › Vision / Mobility`; Browsermessung und Sichtprüfung |
| Mittel: Buchungsvergleich kennzeichnete Abweichungen allein über Farbe und verwendete technische Datum-/Dezimaldarstellung | Zusätzlich sichtbares „geändert“, Datum deutsch, Stunden mit Dezimalkomma und Einheit; auch Wochendatum vereinheitlicht | `accessibility.md › Vision`, `writing.md`; Vergleich übertragener und korrigierter Buchung |
| Mittel: während Aktionen fehlte eine sichtbare Verarbeitung; Erweiterungsanmeldung zeigte technische Verbindungsfehler weiter an | Status während der echten Anfrage, keine erfundenen Prozentwerte; verständlicher Verbindungsfehler, alter Fehler verschwindet beim erneuten Versuch | `loading.md › Showing progress`; zurückgehaltene bzw. abgebrochene reale Anfragen |
| Mittel: Einladungsbutton wurde trotz fehlender Mailkonfiguration nach dem Laden wieder freigegeben | Fachliche Sperre überlebt die allgemeine Freigabe der Bedienelemente | Eigene Bedienbewertung; Browserprobe ohne SMTP |
| Mittel: Rücksetzlink im bereits geöffneten Tab öffnete seinen Dialog nicht | Neue Hashnavigation wird verarbeitet und der Einmalwert anschließend aus der sichtbaren URL entfernt | Eigene Bedienbewertung; echte Navigation mit nachfolgender Fehler-/Dialogprobe |
| Mittel: Feldrand war auf Weiß schwach erkennbar | Randfarbe angepasst; Kontrast der Palette nachgemessen | `accessibility.md › Vision`, `color.md` |

Die Palette wurde mit `(Lhell + 0.05) / (Ldunkel + 0.05)` am 19. November 2026 nachgemessen: Feldrand `#718898` auf Weiß 3,70:1; Haupttext `#102542` 15,38:1; Nebentext `#4b6475` 6,22:1; Weiß auf Aktionsfarbe `#08796f` 5,28:1; Änderungslabel `#483719` auf `#fff6dc` 10,60:1; Fokusrand `#568dd3` auf Weiß 3,42:1. Das ist eine Palettenprüfung, kein vollständiger Kontrastscan jedes gerenderten Pixels.

## Prüfung, Belege und Grenzen

Basis vor diesem Änderungspaket: `ff68c33f663786068fbc8346c7d18c390bb107d6`. Selbstprüfung im Hauptagenten, keine unabhängige Auditfreigabe. Die vor der jeweiligen Korrektur fehlgeschlagenen Produktproben sind unter [Geometrie](nachweise/design-2026-11-19/geometrie-rot.txt), [Fokus](nachweise/design-2026-11-19/fokus-rot.txt), [Dialogaktionen](nachweise/design-2026-11-19/dialog-rot.txt), [Vergleich](nachweise/design-2026-11-19/vergleich-rot.txt), [Speichern](nachweise/design-2026-11-19/speichern-rot.txt) und [Erweiterungsanmeldung](nachweise/design-2026-11-19/anmeldung-rot.txt) erhalten. Die gespeicherte Ausgabe des Gesamtlaufs wurde lediglich um Leerzeichen am Zeilenende bereinigt; Original unter `/tmp/timereal-design-abschluss.log`. Ein anfänglich mehrdeutiger Testselektor und ein fehlerhafter Diagnosezugriff auf ein geschlossenes Testfenster zählen als Testaufbaufehler, nicht als Produktbefunde.

Am 19. November 2026 ausgeführt:

```bash
BROWSER_TEST=1 \
CHROMIUM_PATH=/home/hermes/.cache/ms-playwright/chromium-1255/chrome-linux64/chrome \
SCREENSHOT_DIR=/tmp/timereal-design-abschluss npm test
```

Exit 0. Der [Gesamtlauf](nachweise/design-2026-11-19/gesamtpruefung.txt) umfasst Build, echte PostgreSQL-18-Datenbank, eingeschränkte Anwendungsrolle, API-/Kontotrennung, SMTP, bestehende fachliche Browserproben sowie die Erweiterung. Die geänderten JavaScript-/HTML-/CSS-Dateien bestehen Prettier; `git diff --check` ist grün. Die neuen Browserproben und der Eingangsabgleich laufen über `tests/postgres.sh` auch in GitHub Actions. Dort werden zusätzlich PostgreSQL 17 und der bestehende Lasttest ausgeführt; deren Ergebnis gehört zum jeweiligen GitHub-Commit und wird nicht aus dem lokalen Lauf abgeleitet.

Tatsächliche Screenshots mit Daten aus der isolierten Testdatenbank: [Unterbrechung mobil](nachweise/design-2026-11-19/unterbrechung-mobil.png), [Buchungsvergleich](nachweise/design-2026-11-19/buchungsvergleich.png), [Einstellungen mobil](nachweise/design-2026-11-19/einstellungen-mobil.png), [Erweiterungspopup](nachweise/design-2026-11-19/erweiterung-popup.png). Die Modaldialoge wurden in der sichtbaren Gerätehöhe beurteilt; die vollständige Seitenaufnahme kann unterhalb des abgedunkelten Viewports weiteren Seiteninhalt zeigen. Das ist kein sichtbarer Durchgriff durch den Dialog.

Keine verbleibenden Befunde in der ausgeführten Geometrie-/Beschriftungsmatrix. Offen gemessen bleiben VoiceOver-Sprachausgabe, physische Touchgeräte, Safari/WebKit und Firefox; weder WCAG-Zertifizierung noch native Apple-Konformität werden behauptet. Native Datumsfelder folgen der Browser-/Betriebssystemlokalisierung; in den Linux-Chromium-Aufnahmen zeigen sie teils englische Datumssegmente trotz deutschem Seitenkontext. Eigene Datumsanzeigen sind deutsch. Auf Lars' LXC wurde nichts installiert; dort gilt weiter die tatsächlich installierte Version. Die neue Betriebsverwaltung für 0.7.0 erhält nach ihrer Implementierung eine eigene Funktions- und Sichtprüfung.

## Bereits ausgeführte Prüfung am neuen Entwurf

Die HTML-Vorlage `mockups/10-admin-betrieb.html` wurde in Chromium mit 320, 390 und 1120 Pixeln sowie 100 und 200 % Textgröße gerendert. Der erste Lauf fand bei 320 Pixeln und 200 % Schrift horizontalen Überlauf (345 statt 320 Pixel); Umbruch im Entwurf korrigiert. Der anschließende Lauf war grün für die Zustände Updates, bereit, Neustart, Domain, Domain geprüft, Bestätigung, Erfolg und Rücknahme. Geprüfte Link-/Eingabeflächen sind mindestens 44 Pixel hoch. Das misst den Entwurf, nicht den noch fehlenden Betriebsdienst.

Eigenes Qualitätsurteil am Einzelbild: ruhige, bestehende Systemschrift und Aktionsfarbe; klarer Hauptschritt pro Ansicht; Rückmeldung am Arbeitsgegenstand; seitliche Betriebsinformationen werden auf dem Smartphone unter dem Formular angeordnet. Die Screenshots wurden einzeln in Gerätebreite betrachtet. Die aktuelle Vorlage ist als Bauziel brauchbar. Live-Screenreader-Ausgabe und physische Touchgeräte wurden damit nicht geprüft.
