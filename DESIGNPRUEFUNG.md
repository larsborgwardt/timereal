# Apple-Design-Prüfung von Timereal

Auftrag von Lars am 19. November 2026: den Apple-Design-Skill auch für die komplette App anwenden. Die bestehende Web-App und Chromium-Erweiterung wurden im Browser geprüft und die unten genannten Befunde korrigiert. Die Korrekturen gehören zu 0.7.0. Updates und Domainzugriff sind nach ihrer Bildfreigabe implementiert und zusätzlich geprüft; ältere freigegebene Bilder bleiben für ihre jeweiligen Abläufe maßgeblich. Die Rollen-, Audit- und Kontosicherheitsbilder sind nach D-RELEASE-004 bis D-RELEASE-006 freigegeben; ihre Umsetzung und Prüfung stehen in den nachfolgenden Paketnachträgen. Die nach D-RELEASE-003 freigegebene Systemkonsole ist in 0.8.0 implementiert; ihre Prüfung steht im Nachtrag unten.

## Methode und Abgrenzung

Gelesene Skillquelle: `/home/hermes/.agents/skills/idb-apple-design/SKILL.md` und das dort verlinkte Original unter `/home/hermes/.local/share/idb-skills/upstream/ff4ebddf0488598723a82bfdce1afb04de0b1c44/apple-design/SKILL.md`. Angewendet werden Webprinzipien aus Accessibility, Layout, Typografie, Farbe, Buttons, Loading, Progress Indicators, Writing und Cross-platform. Native Apple-Menüs, Apple Pay und Glass-Effekte sind keine Anforderungen an diese Browseranwendung.

Die Bestandsaufnahme unterscheidet Quellbefund, im Browser erreichten Zustand und tatsächlichen Sichtnachweis. Ein freigegebenes Bild oder grüner Build ersetzt keinen Funktions- oder Sichtnachweis. Fehler im bestehenden Bedienvertrag werden korrigiert; eine zusätzliche grundlegende Neugestaltung wird nicht still aus dem Prüfauftrag abgeleitet.

## Ergebnis und Prüfumfang

Die bisherige Prüfung bestätigte Lesbarkeit, Umbruch und Erreichbarkeit der unten benannten Zustände. Das ursprüngliche Gesamturteil „gut“ war zu pauschal: Lars fand anschließend unter Nachweise direkt aneinanderstoßende Aktionsbuttons. Deren Abstand war weder in der Geometrieprobe enthalten noch in der Sichtprüfung ausreichend beurteilt. Die Ergänzung zu 0.7.1 unten hält diese Prüflücke fest. Timereal behält Systemschrift, zurückhaltende Farbe und die getrennten Karten für laufende Arbeit, Buchungsziel und Tagesverlauf.

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
| Updates und Domainzugriff, Administrator-Websitzung | Vorbereitung, Ergebnis, Domainentwurf, Eingabenerhalt, Passwortfehler, Verbindungsverlust und erneutes Laden; Layout bei kleiner Breite und großer Schrift | `tests/betrieb-browser.mjs` mit echter API, PostgreSQL und dauerhaftem Auftragsbuch, ersetztem privilegiertem Ausführungsschritt; echte Dienste zusätzlich in `tests/betrieb-native-release.sh` |

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

Keine verbleibenden Befunde in der ausgeführten Geometrie-/Beschriftungsmatrix. Offen gemessen bleiben VoiceOver-Sprachausgabe, physische Touchgeräte, Safari/WebKit und Firefox; weder WCAG-Zertifizierung noch native Apple-Konformität werden behauptet. Native Datumsfelder folgen der Browser-/Betriebssystemlokalisierung; in den Linux-Chromium-Aufnahmen zeigen sie teils englische Datumssegmente trotz deutschem Seitenkontext. Eigene Datumsanzeigen sind deutsch. Auf Lars' LXC wurde nichts installiert; dort gilt weiter die tatsächlich installierte Version. Die neue Betriebsverwaltung für 0.7.0 wurde zusätzlich geprüft; Details folgen unten.

## Bereits ausgeführte Prüfung am neuen Entwurf

Die HTML-Vorlage `mockups/10-admin-betrieb.html` wurde in Chromium mit 320, 390 und 1120 Pixeln sowie 100 und 200 % Textgröße gerendert. Der erste Lauf fand bei 320 Pixeln und 200 % Schrift horizontalen Überlauf (345 statt 320 Pixel); Umbruch im Entwurf korrigiert. Der anschließende Lauf war grün für die Zustände Updates, bereit, Neustart, Domain, Domain geprüft, Bestätigung, Erfolg und Rücknahme. Geprüfte Link-/Eingabeflächen sind mindestens 44 Pixel hoch. Das misst die damalige Entwurfsvorlage. Der Betriebsdienst wurde anschließend separat implementiert und geprüft.

Eigenes Qualitätsurteil am Einzelbild: ruhige, bestehende Systemschrift und Aktionsfarbe; klarer Hauptschritt pro Ansicht; Rückmeldung am Arbeitsgegenstand; seitliche Betriebsinformationen werden auf dem Smartphone unter dem Formular angeordnet. Die Screenshots wurden einzeln in Gerätebreite betrachtet. Die aktuelle Vorlage ist als Bauziel brauchbar. Live-Screenreader-Ausgabe und physische Touchgeräte wurden damit nicht geprüft.

## Ergänzung für die implementierte Betriebsverwaltung

Der Gesamtlauf für Paketversion 0.7.0 am 19. November 2026 (`BROWSER_TEST=1 CHROMIUM_PATH=/home/hermes/.cache/ms-playwright/chromium-1255/chrome-linux64/chrome SCREENSHOT_DIR=/tmp/timereal-070-abschluss npm test`) endete mit Exit 0. [Ausgabe](nachweise/betrieb-2026-11-19/gesamtpruefung.txt), [Abdeckung](nachweise/betrieb-2026-11-19/abdeckung.json) und [Geometrie-/Semantikergebnis](nachweise/betrieb-2026-11-19/ergebnis.json) stammen aus diesem Lauf. Die Abdeckungsprüfung erzeugt auch die Verwaltungsunterbereiche aus dem HTML und vergleicht sie mit den erreichten Ansichten.

Die [Updateansicht](nachweise/betrieb-2026-11-19/updates-desktop.png) und der [Domainwechsel mobil](nachweise/betrieb-2026-11-19/domain-mobil.png) zeigen die programmierte Oberfläche. Versionsziele und Serveradressen sind kontrollierte Testwerte; der privilegierte Betriebsschritt ist in dieser Browserprobe ersetzt. Im Bild geprüft: eine klare nächste Aktion, sichtbare Herkunft des Auftrags, Platz für längere Kontonamen, Passwortbeschriftung und mobile Anordnung. Die echte Dienstumschaltung ist gesondert im [Betriebsnachweis](nachweise/0.7.0.md) belegt.

Zusätzliche Korrekturen nach roten Proben: Verbindungsfehler verschwindet nach erfolgreicher Statusaktualisierung; Auftrag nennt Ausgangs-/Zielversion und das veranlassende Konto; Betriebsaktionen werden in der Erweiterung nicht angeboten. Hintergrundabfragen ändern Texte nur bei geändertem Inhalt und ersetzen keine Formulareingaben. Die Betriebsansichten wurden mit normaler und verdoppelter Schrift geprüft. Das bleibt eine Selbstprüfung und kein unabhängiges Audit.

Der überarbeitete Konsolenentwurf in `mockups/11-konten-und-protokolle.html` wurde bei 320, 390 und 1120 Pixeln mit normaler und verdoppelter Schrift geprüft. Zu schmal gedrückte Aktionsbuttons wurden korrigiert. Die Bilder 12 zeigen diesen Entwurf; Lars hat sie mit D-RELEASE-003 freigegeben. Die später implementierte Ansicht wird im Nachtrag für 0.8.0 getrennt gemessen.

## Systemkonsole 0.8.0

Die Selbstprüfung verwendet die oben genannten Skillquellen und die HIG-Abschnitte `accessibility.md › Vision / Mobility`, `layout.md › Best practices`, `scroll-views.md`, `search-fields.md`, `loading.md`, `feedback.md` sowie die für Web übersetzten Typografie-/Farbprinzipien. Maßstab bleiben die freigegebenen Bilder 12. Ein dunkler, monospaced Journalbereich ist hier eine bewusste Konsolendarstellung innerhalb der vorhandenen hellen App, kein neues appweites Farbsystem.

`tests/systemkonsole-browser.mjs` erreicht die Konsole, gefilterte und leere Ergebnisse, eine unterbrochene Verbindung und die Wiederherstellung. Sie prüft Live-Pause einschließlich Fensterfokus, manuelle Aktualisierung, Leseposition, echten Textdownload, Text statt HTML und das Leeren beim Abmelden. Der Tastaturweg führt über Aktualisieren und Herunterladen in die Konsole; Pfeiltasten scrollen deren Inhalt. Der gemeinsame Geometrieprüfer misst Beschriftung, mindestens 44 CSS-Pixel große Bedienflächen, Aktionsabstände und äußeren Überlauf bei 320/390/1280 Pixeln und normaler/verdoppelter Schrift. Journalzeilen dürfen innerhalb des benannten, per Tastatur erreichbaren Bereichs horizontal scrollen. Die Seite selbst bleibt im Viewport.

Die Browserprobe fand zuerst die fehlende Ansicht, später den unerwünschten erneuten Abruf beim Fensterwechsel trotz Pause. Nach der Korrektur waren diese Proben grün. Ein anfänglich zu enger Labelselektor und eine zu frühe Abmeldeassertion waren Testaufbaufehler und werden nicht als Produktbefunde gezählt. Der native Journalnachweis ist getrennt von den kontrollierten Browserdaten.

Die [Desktopaufnahme](nachweise/systemkonsole-2026-11-19/desktop.png) und [Mobilaufnahme](nachweise/systemkonsole-2026-11-19/mobil.png) wurden einzeln angesehen. Filter stehen vor den Logaktionen, die beiden Download-/Aktualisierungsschaltflächen bleiben getrennt, der Status ist als Text lesbar und Level haben zusätzlich zur Farbe einen Namen. Die [Kontrastberechnung](nachweise/systemkonsole-2026-11-19/kontrast.json) verwendet die tatsächlichen Farbwerte der Konsolenregeln in `web/app.css`; sie misst keine systemseitig erzwungene Kontrastdarstellung. VoiceOver-Sprachausgabe, physische Touchgeräte und andere Browserengines bleiben offen. Prüfkommandos, Ergebnisse und Auslieferungsstand: [Releasebeleg 0.8.0](nachweise/0.8.0.md).

## Nachprüfung der Aktionsabstände für 0.7.1

Lars meldete am 19. November 2026 den fehlenden Abstand zwischen „Filter zurücksetzen“ und „Zeit nachtragen“ und wies darauf hin, dass die Designprüfung ihn hätte finden müssen. Das trifft zu: `accessibility.md › Mobility` bewertet den Abstand zwischen Bedienelementen ebenso wichtig wie deren Größe; `layout.md › Visual hierarchy` verlangt erkennbare Gruppierung.

Die beiden Buttons erhalten die vorhandene Aktionsgruppe mit 16 CSS-Pixeln Abstand und flexiblem Zeilenumbruch. Die zusätzliche Browserprobe misst sichtbare Aktionsbuttons innerhalb desselben Elterncontainers in den erreichten Ansichten. Sie meldet Abstände unter 8 CSS-Pixeln; das ist ein gewählter Projektprüfwert, kein behaupteter Apple-Grenzwert. Navigation und Register sind ausgenommen, weil sie eine zusammenhängende Auswahl bilden können. Beziehungen über Containergrenzen, die visuelle Gruppierung und die Angemessenheit größerer Abstände bleiben Gegenstand der Sichtprüfung.

Der unveränderte Produktstand 0.7.0 scheiterte mit der ergänzten Probe für Übernahme und Historie bei 320, 390 und 1280 Pixeln mit normaler und verdoppelter Schrift. Die betroffenen Buttons waren in der Aufnahme sichtbar aneinandergefügt. Der Releasebeleg zu 0.7.1 dokumentiert den anschließenden Lauf und die geprüften Bilder. Der frühere grüne Testlauf wird nicht nachträglich als Abstandsprüfung ausgegeben.

Konsolennachprüfung: Firefox 159.0 besteht den Ablauf mit Filtern, Live-Pause, Tastatur, manueller Leseposition bei neuen Zeilen, Download, Leer-/Fehlerzustand und den Bildschirm-/Schriftgrößenproben. Die Tastaturscroll-Animation wird im Test vor der getrennten Lesepositionsprobe abgewartet; ohne Timereal-Code ließ sich die zuvor gemessene Verschiebung ebenfalls reproduzieren. Das ist kein Firefox-Nachweis für die übrigen Ansichten.

## Seitenwechsel ohne aufblitzenden Verarbeitungstext (0.8.0)

Lars meldete den kurz sichtbaren Text unter der Navigation beim Wechsel von Heute nach Woche. Der zuerst rote Browsertest bestätigt die unmittelbare Anzeige. Die gemeinsame Bedienhülle unterscheidet jetzt Navigation und schreibende Aktionen: Navigation zeigt erst nach 300 Millisekunden „Seite wird geladen…“; der Timer wird bei Erfolg und Fehler beendet. Vorhandene Speicherrückmeldungen bleiben unmittelbar. Geprüft mit echter Oberfläche/API/PostgreSQL und angehaltenen Netzantworten: schneller Wechsel (einschließlich DOM-Beobachtung zwischen den Messpunkten), längerer Abruf, Fehler, kein verspäteter Hinweis und bestehende Speicherrückmeldungen im vollständigen Browserlauf. Apple-Referenz `references/hig/loading.md`, Abschnitte Best practices/Showing progress: Ladevorgänge sollen den Ablauf nicht stören und bei merklicher Wartezeit Rückmeldung geben. Die gewählte 300-ms-Grenze ist eine Umsetzung für Timereal, keine zitierte Apple-Vorgabe.

## Konten und Rollen 0.8.1

Messlatte sind die mit D-RELEASE-004 freigegebenen Bilder 11. Die Umsetzung stellt Rollenwahl und Kontosperre neben Kontoname und Status; die Erklärung steht auf dem Laptop daneben, mobil darunter. Bestehende Einladungen bleiben darunter erreichbar. Die Bilder enthalten eine beispielhafte Zwei-Faktor-Statuszeile; diese folgt erst mit der echten Kontosicherheitsfunktion. Der Auditbereich folgt in 0.8.2.

Angewandt: `idb-apple-design` mit Upstream-Methodik Accessibility, Platform conventions, Visual design/craft sowie Loading. Die vorhandene Geometrieprobe prüft 1280/390/320 Pixel, reguläre und verdoppelte Schrift, Trefferflächen, Feldbeschriftung, Abstände und Seitenüberlauf. Der Browserlauf misst außerdem Erhalt ungespeicherter Auswahl beim echten Hintergrundabruf, Speichern, eigene Kontosperre und Betriebseinstieg ohne administrative Kontenabrufe. Bilder der Desktop- und Mobilansicht sind einzeln geprüft: die Aktionsbuttons bleiben getrennt, lange Kontonamen umbrechen, die Rollenhilfe ist erreichbar. Kein Nachweis physischer Touchgeräte oder gesprochener VoiceOver-Ausgabe. Belege: [0.8.1](nachweise/0.8.1.md).

## Audit-Protokoll 0.8.2

Maßstab sind die mit D-RELEASE-005 freigegebenen Auditbilder 11. Die Selbstprüfung verwendet die Apple-Methodik mit `loading.md` und `lists-and-tables.md`. Filter, Zeitstempel, Ereignistitel und handelndes/betroffenes Konto bleiben auch schmal lesbar; die Aktionsgruppe bricht mit Abstand um. Fehlende Trennlinien durch nicht definierte Farbvariablen wurden vor Veröffentlichung auf die bestehende Palette korrigiert. Die endgültigen Desktop- und Mobilbilder wurden einzeln angesehen.

Der Browserlauf erreicht Liste, leeren Zustand und Abruffehler mit erhaltenem alten Stand bei 1280/390/320 Pixeln und regulärer/verdoppelter Schrift. Nachladen, JSON-Download und Leeren bei Abmeldung sind geprüft. Ein ergänzter Tastaturweg öffnet die Ansicht per Eingabetaste und erreicht die Suchaktion über Tab. Die native Datumseingabe bleibt browserabhängig; VoiceOver-Sprachausgabe und physische Geräte sind nicht geprüft. [Releasebeleg und Bilder](nachweise/0.8.2.md).

## Kontosicherheit 0.9.0

Maßstab: freigegebene Zielbilder 13/14, D-RELEASE-006/007. Verwendet wurden `/home/hermes/.agents/skills/idb-apple-design/SKILL.md`, dessen lokale Upstream-Methodik und die HIG-Referenzen `accessibility.md › Mobility`, `entering-data.md › Best practices` und `loading.md › Showing progress`. Für Timereal gelten daraus Webprinzipien zu Eingabe, Abstand, Rückmeldung und Erreichbarkeit; native Apple-Konventionen werden nicht behauptet.

`tests/mfa-browser.mjs` durchläuft Profiländerung und Mailbestätigung, Einrichtung, QR, Codebestätigung, Wiederherstellungscodes, Abmelden, vollständige Anmeldung, Wiederherstellung und Ausschalten. Die gemeinsame Geometrieprobe misst 1280/390/320 Pixel und normale/verdoppelte Schrift. `tests/erweiterung-browser.mjs` führt den zweiten Faktor in einer real geladenen Chromium-Erweiterung aus; die vorhandene Navigationsprobe prüft schnelle und verzögerte Übergänge. Der [Gesamtlauf](nachweise/kontosicherheit-2026-11-19/gesamt-gruen.txt) bestand mit Exit 0; [Abdeckungsmatrix](nachweise/kontosicherheit-2026-11-19/abdeckung.json).

Die Prüfung fand einen bei schmaler Ansicht und großer Schrift nicht sichtbaren Schließen-Button der Sitzungsliste. Der Dialog verwendet nun eine erreichbare Aktionsleiste. Nach dem Widerruf einer Erweiterungssitzung wurde außerdem irrtümlich das Web-Anmeldeformular sichtbar; die Rückkehr zur Anmeldung berücksichtigt jetzt den Erweiterungskanal. Beide Fälle sind im abschließenden Gesamtlauf grün. Ein falscher Testselektor für den neu angeordneten Sitzungseinstieg war dagegen ein Testaufbaufehler.

Die tatsächlichen Bilder [Konto](nachweise/kontosicherheit-2026-11-19/profil-1280.png), [Anmeldung mobil](nachweise/kontosicherheit-2026-11-19/anmeldung-390.png) und [Faktorverwaltung mobil](nachweise/kontosicherheit-2026-11-19/verwaltung-390.png) wurden einzeln angesehen. Das Konto bündelt Profil, Passwort, Faktor und Geräte in klar beschrifteten Bereichen. Bei der Anmeldung steht die Codeeingabe zuerst; Rückweg und Wiederherstellung bleiben getrennte Aktionen. In der Faktorverwaltung sind verfügbare Codes als Text benannt, lange Aktionsbeschriftungen umbrechen mit Abstand. Die ruhige Systemschrift und vorhandene Aktionsfarbe passen zur Zeiterfassung. Kein zusätzlicher Designentscheid erforderlich.

Das ist eine Selbstprüfung am Browser. VoiceOver-Sprachausgabe, physische Touchgeräte, Safari/WebKit und ein eigener Edge-Lauf bleiben offen. Der Erweiterungsnachweis gilt für Chromium; ein freigegebenes Mockup oder eine gemeinsame Engine ersetzt diese weiteren Laufzeiten nicht. Betriebs- und Sicherheitsgrenzen: [Releasebeleg](nachweise/0.9.0.md).
