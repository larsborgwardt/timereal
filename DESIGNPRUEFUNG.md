# Apple-Design-Prüfung von Timereal

Auftrag von Lars am 19. November 2026: den Apple-Design-Skill auch für die komplette App anwenden. Die Prüfung begleitet Version 0.7.0. Die Bildfreigabe für Updates und Domainzugriff ist erteilt; ältere freigegebene Bilder bleiben für ihre jeweiligen Abläufe maßgeblich.

## Methode und Abgrenzung

Gelesene Skillquelle: `/home/hermes/.agents/skills/idb-apple-design/SKILL.md` und das dort verlinkte Original unter `/home/hermes/.local/share/idb-skills/upstream/ff4ebddf0488598723a82bfdce1afb04de0b1c44/apple-design/SKILL.md`. Angewendet werden Webprinzipien aus Accessibility, Layout, Typografie, Farbe, Buttons, Loading, Progress Indicators, Writing und Cross-platform. Native Apple-Menüs, Apple Pay und Glass-Effekte sind keine Anforderungen an diese Browseranwendung.

Die Bestandsaufnahme unterscheidet Quellbefund, im Browser erreichten Zustand und tatsächlichen Sichtnachweis. Ein freigegebenes Bild oder grüner Build ersetzt keinen Funktions- oder Sichtnachweis. Fehler im bestehenden Bedienvertrag werden korrigiert; eine zusätzliche grundlegende Neugestaltung wird nicht still aus dem Prüfauftrag abgeleitet.

## Prüfumfang

| Bereich | Zustände / Bedienung | Stand |
|---|---|---|
| Anmeldung und Wiederherstellung | Leere Eingaben, falsche Daten, laufende Anfrage, Einladung, Rücksetzlink | Prüfung ausstehend |
| Heute und Timer | Kein Timer, laufend, pausiert, Stoppen, Sofortstart, interne Zeit | Prüfung ausstehend |
| Buchungsziele | Anlegen, auswählen, suchen, bearbeiten, Kunde wechseln | Prüfung ausstehend |
| Tagesverlauf | Leerer Tag, abgeschlossene Zeit, Nachtrag, Korrektur, Unterbrechung, Storno | Prüfung ausstehend |
| Woche | Leere und gefüllte Woche, Navigation, Summen, Nacharbeit | Prüfung ausstehend |
| Nachweise und Historie | Filter, leeres Ergebnis, Übernahme, Übertragungsvergleich, Rücksetzen | Prüfung ausstehend |
| Einstellungen und Konto | Profil, Passwort, Rundungsausgabe, Sitzungen, Widerruf | Prüfung ausstehend |
| Verwaltung | Berater, Einladungen, Sperren, Versandfehler | Prüfung ausstehend |
| Updates und Domainzugriff | Vorbereitung, Passwortbestätigung, Neustart, Fehler, neue Origin, Rückkehr | Bildvorlage geprüft; Implementierung ausstehend |
| Browsererweiterung | Verbindung, Autorisierung, Popup, Vollansicht, offline, abgelaufene Sitzung | Prüfung ausstehend |

Je erreichtem Zustand werden nach Relevanz Laptop- und Smartphonebreite, 200 % Textgröße, sichtbarer Fokus, Beschriftung, Status ohne reine Farbcodierung und Bedienflächen geprüft. Die abschließende Matrix nennt den ausgeführten Test oder Sichtbeleg und offene Grenzen. Bis dahin bleibt der Gesamtstatus offen.

## Bereits ausgeführte Prüfung am neuen Entwurf

Die HTML-Vorlage `mockups/10-admin-betrieb.html` wurde in Chromium mit 320, 390 und 1120 Pixeln sowie 100 und 200 % Textgröße gerendert. Der erste Lauf fand bei 320 Pixeln und 200 % Schrift horizontalen Überlauf (345 statt 320 Pixel); Umbruch im Entwurf korrigiert. Der anschließende Lauf war grün für die Zustände Updates, bereit, Neustart, Domain, Domain geprüft, Bestätigung, Erfolg und Rücknahme. Geprüfte Link-/Eingabeflächen sind mindestens 44 Pixel hoch. Das misst den Entwurf, nicht den noch fehlenden Betriebsdienst.

Eigenes Qualitätsurteil am Einzelbild: ruhige, bestehende Systemschrift und Aktionsfarbe; klarer Hauptschritt pro Ansicht; Rückmeldung am Arbeitsgegenstand; seitliche Betriebsinformationen werden auf dem Smartphone unter dem Formular angeordnet. Die Screenshots wurden einzeln in Gerätebreite betrachtet. Die aktuelle Vorlage ist als Bauziel brauchbar. Live-Screenreader-Ausgabe und physische Touchgeräte wurden damit nicht geprüft.
