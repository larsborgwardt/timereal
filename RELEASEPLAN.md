# Timereal — beauftragter Ausbau und Auslieferung

Auftrag von Lars am 19. November 2026: Designprüfung und offene Backlogpunkte umsetzen und als Release verfügbar machen. Ausgangsstand bei Auftragserteilung: `4d3e1ee026fa4f13e6ec3bdf9818a18fc81a44c6`, damals veröffentlichtes Release 0.6.2. Die Art der jeweiligen Prüfumgebung ist im versionsbezogenen Nachweis genannt.

## Lieferpakete

| Version | Lieferumfang | Abnahme |
|---|---|---|
| 0.7.0 | Vorhandene Designkorrekturen, Admin-Updates, Domainverwaltung, einmaliger Konsolenumstieg | Bestehende freigegebene Bilder in `ADMIN-BETRIEB.md`; Debian-13/systemd-Prüfgast, PostgreSQL und Browser; Bootstrap aus 0.6.2 und Folgesprung. Neue Betriebsfunktionen noch nicht auf einem echten Proxmox-LXC gemessen. |
| 0.8.0 | Freigegebene Systemkonsole mit Suche, Level, Live-Pause, Aktualisierung und Download | Echte Journalquelle, feste Dienste, Administrator-Websitzung, PostgreSQL-/Browser- und native Dienstprüfung |
| 0.8.1 | Benutzer- und Rollenverwaltung | Bilder 11 freigegeben (D-RELEASE-004); Rollenmatrix, Kontotrennung und Schutz des letzten Administrators |
| 0.8.2 | Lesbares Audit-Protokoll | Bilder 11 freigegeben (D-RELEASE-005); Administratoransicht, 180-Tage-Lesefenster und begrenzter Export |
| 0.9.0 | Kontoprofil und Zwei-Faktor-Anmeldung einschließlich Wiederherstellung; Erweiterung mit neuem Anmeldevertrag und weiteren Browserprüfungen | Bilder 13 freigegeben (D-RELEASE-006); Einrichtung, Replay-Schutz, Recovery und Widerruf; real geladene Erweiterung |
| 0.9.1 | Microsoft-Edge-Store-Anmeldung mit konkreter CRX-ID und getrenntem Upload-ZIP | PostgreSQL-/PKCE-Grenzfälle und Browserlauf mit öffentlichem Microsoft-Schlüssel; signierte Store-Installation folgt nach Veröffentlichung |
| 0.9.2 | Gemeinsames Favicon und Symbol für Erweiterung und Store | Entwurf 16 freigegeben (D-RELEASE-011); HTTP-, Paket- und Browserprüfung |
| 0.9.3 | Persönlicher Excel-Export und Ursachenanzeige beim Domainrückbau | Entwurf 17 freigegeben (D-RELEASE-012); PostgreSQL, Browserdownload und Betriebsproben |
| 0.9.4 | Ein-Klick-Updates mit horizontalem Fortschrittsbalken; Domain speichern ohne erneutes Passwort und automatische Zugangserkennung | Entwurf 18 freigegeben (D-RELEASE-014); [Prüfbelege](nachweise/0.9.4.md) |
| 0.9.5 | Domain zusätzlich zur lokalen Adresse ohne Frist und Rücknahme; Fehlerantwort 421 für nicht eingerichtete Hostnamen, kein HTTP/3; Anmeldegrenze je Absender | Auftrag D-RELEASE-015; PostgreSQL-, Browser- und native Betriebsproben; [Prüfbelege](nachweise/0.9.5.md). Auf Lars’ LXC und über den öffentlichen Proxy nicht gemessen. |
| 0.9.6 | Offene Audit-Befunde vom 20.11.: Passwortanforderung ohne Zeitverrat, Argon2id für neue Passwörter, Wächter für HTML-Einfügungen, Format- und Abhängigkeitsprüfung, signierte Release-Tags mit Bau ohne root, native Proxy-/Domainprobe in der CI | Auftrag D-RELEASE-016; PostgreSQL-, Browser-, Last- und native Betriebsproben; [Prüfbelege](nachweise/0.9.6.md). Erstes signiertes Release; die Signaturprüfung greift ab dem Update nach 0.9.6. |
| 0.9.7 | Verwaltung → Mailversand (Entwurf 15) | D-RELEASE-009 freigegeben, D-RELEASE-017; PostgreSQL-, Browser- und native Betriebsproben; [Prüfbelege](nachweise/0.9.7.md) |
| 0.10.0 | Material 3 mit Material Web, erster Teil (Entwurf 19): Farbschema, Typografie, Schaltflächen, Eingabefelder und Auswahllisten | D-RELEASE-017, D-RELEASE-018; PostgreSQL-, Browser- und native Betriebsproben; [Prüfbelege](nachweise/0.10.0.md). Navigation, Register, Karten, Listen, Dialoge und die Erweiterungsseiten folgen. |

0.7.0 ist veröffentlicht; dessen Belege stehen in `nachweise/0.7.0.md`. Das Korrekturpaket 0.7.1 behebt den von Lars gemeldeten Aktionsabstand unter Nachweise. 0.7.2 korrigiert die manuelle Updateprüfung, die zuvor ebenfalls nur den Cache auslas. Die Systemkonsole wird als eigenes Paket 0.8.0 geliefert; Veröffentlichung und Prüfbelege stehen in `nachweise/0.8.0.md`. Benutzer und Rollen sind in 0.8.1 umgesetzt; Prüfbelege stehen in `nachweise/0.8.1.md`. Audit ist in 0.8.2 umgesetzt; Prüfbelege stehen in `nachweise/0.8.2.md`. Kontosicherheit 0.9.0 ist implementiert; der Releasebeleg `nachweise/0.9.0.md` hält die abschließenden Prüfungen fest. Bereits vorhandene Funktionen (Passwortänderung, E-Mail, Sitzungen, Chromium-Timer) werden weiterverwendet. Browser-/Store-Veröffentlichungen mit fremden Entwicklerkonten sind vom lokal lieferbaren Erweiterungspaket zu unterscheiden.

## Entscheidungsjournal

### D-RELEASE-001 — Neue Ansichten zuerst ändern, 19. November 2026

Lars beantwortet die Bildfrage zu `mockups/11-konten-und-protokolle.html` mit **„Bildentwürfe zuerst ändern“**. Die Entwürfe für Konten/Rollen, Audit-Protokoll, Systemlogs und Kontosicherheit sind damit nicht zur Implementierung freigegeben. Die Nachfrage nach konkreten Änderungen ist gestellt. Diese neuen Oberflächen warten auf den überarbeiteten Bildentwurf und dessen Freigabe. Der bereits freigegebene Umfang von 0.7.0 läuft weiter. Der Ausbauauftrag als Ganzes ist damit nicht aufgehoben.

### D-RELEASE-002 — Systemlog als Konsole, 19. November 2026

Lars konkretisiert die Änderung: **„systemlog soll die cli zeigen wie beim nginx-proxy-manager“**. Der neue Logbereich zeigt fortlaufende Monospace-Zeilen mit Zeit, Quelle, Level und Meldung sowie Liveanzeige, Suche, Aktualisierung und Download. Das ist eine Ansicht der Systemausgabe; eine frei ausführbare Shell wird aus diesem Logwunsch nicht abgeleitet. Die überarbeiteten Bilder `mockups/12-systemkonsole-desktop.png` und `mockups/12-systemkonsole-mobil.png` wurden vorgelegt; ihre Freigabe folgt in D-RELEASE-003.

### D-RELEASE-003 — Konsolenansicht freigegeben, 19. November 2026

Lars bestätigt die Bilder 12 für Laptop und Smartphone mit **„Konsolenansicht freigeben (empfohlen)“**. Damit ist die Konsolenansicht zur Umsetzung freigegeben. Die übrigen neuen Ansichten für Rollen, Audit und Kontosicherheit erhalten dadurch keine Bildfreigabe. Der danach gemeldete Abstandsfehler unter Nachweise wird zuerst als Korrekturpaket 0.7.1 ausgeliefert; die Systemkonsole bleibt beauftragt.

### D-RELEASE-004 — Rollenansicht freigegeben, 19. November 2026

Lars bestätigt die Kontenbilder 11 für Laptop und Smartphone mit **„Rollenansicht freigeben (empfohlen)“**. Berater, Betrieb und Administrator werden umgesetzt; persönliche Kunden und Zeiten bleiben getrennt. Damit ist die Bildwarteposition aus D-RELEASE-001 für diesen Bereich aufgehoben. Geplantes Folgepaket: 0.8.1.

### D-RELEASE-005 — Audit-Ansicht freigegeben, 19. November 2026

Lars bestätigt die Auditbilder 11 mit **„Audit-Ansicht freigeben (empfohlen)“**. Der vorgelegte Vertrag gilt: Administratoren sehen und exportieren Sicherheits- und Verwaltungsereignisse der letzten 180 Tage; Buchungstexte und Passwörter werden darin nicht abgelegt. Damit ist die Bildwarteposition aus D-RELEASE-001 für diesen Bereich aufgehoben. Geplantes Folgepaket: 0.8.2.

### D-RELEASE-006 — Profil und Kontosicherheit freigegeben, 19. November 2026

Lars bestätigt die überarbeiteten Bilder 13 (Kontoübersicht, mobile Authenticator-Einrichtung, Wiederherstellungscodes) mit **„Bildentwürfe freigeben (empfohlen)“**. Diese Vorlage ersetzt den bisherigen Kontosicherheitsentwurf. Damit ist die Bildwarteposition aus D-RELEASE-001 für diesen Bereich aufgehoben. Geplantes Folgepaket: 0.9.0 mit angepasster Erweiterungsanmeldung.

### D-RELEASE-007 — Ergänzende Zwei-Faktor-Bilder freigegeben, 19. November 2026

Lars bestätigt mit **„Ergänzende Bilder freigeben (empfohlen)“** die [Anmeldung](mockups/14-anmeldung-390.png), [Wiederherstellungsanmeldung](mockups/14-wiederherstellung-390.png), [Verwaltung](mockups/14-verwaltung-1280.png) und [Ausschaltbestätigung](mockups/14-bestaetigung-390.png). Die Freigabe von Bildern 13 bleibt gültig. Damit ist die ergänzende Bildwarteposition aufgehoben. Die [technische Vorbereitung](KONTOSICHERHEIT.md) beschreibt den Anmeldevertrag, die Sicherung der Schlüssel und die vorgesehenen Prüfungen. Sie ist kein Implementierungsnachweis.

## Umsetzungsfolge

Fortsetzung am 19. November 2026 auf „ok, dann weiter mit der Systemkonsole und den offenen Punkten im Backlog“: Die nach D-RELEASE-003 freigegebene Konsole erhält ein eigenes Release 0.8.0. Die eingegangenen Freigaben D-RELEASE-004 bis D-RELEASE-006 heben die Bildwartepositionen auf: Rollen folgen in 0.8.1, Audit in 0.8.2 und Profil/Kontosicherheit einschließlich Erweiterungsanmeldung in 0.9.0. Diese Lieferreihenfolge hebt keinen offenen Auftrag auf.

Zuerst den dauerhaften Betriebsauftrag mit Idempotenz, Zustandsübergängen und eingeschränktem Unix-Socket bauen. Danach die vorhandenen Update-/Proxyskripte anbinden und mit realen Diensten prüfen. Die bereits freigegebenen Verwaltungsansichten folgen diesem Vertrag. Die nächsten Pakete erhalten konkrete Rollen-/Aufbewahrungs-/Wiederherstellungsverträge; die freigegebenen Bilder 11 und 13 bleiben ihre Messlatte.

Verhalten wird durch einen zuerst fehlgeschlagenen Test eingeführt. Ein Release setzt den PostgreSQL-/Browserlauf, den Kapazitätstest und die passenden Betriebsproben voraus. Die neuen Betriebsproben verwenden einen eigenen privilegierten Debian-Docker-Prüfgast mit systemd; sie ersetzen keinen Proxmox-LXC-Nachweis. Keine Installation auf Lars' Container durch diesen Arbeitsauftrag; das ausgelieferte Update bleibt durch Lars ausführbar.

## Grenzen der Designprüfung

`DESIGNPRUEFUNG.md` beschreibt bereits korrigierte Befunde. Die dort genannten fehlenden Messungen sind nicht automatisch Codefehler. Browserengine-Prüfungen werden nach verfügbarer Laufzeit ergänzt; physische Touchgeräte und VoiceOver werden ohne entsprechendes Gerät nicht als geprüft ausgegeben.

### D-RELEASE-008 — v0.9.0 fortsetzen, 19. November 2026

Lars beauftragt mit **„weiter mit v0.9.0“** die Fortsetzung des freigegebenen Pakets. Profil, Faktorverwaltung, vollständige Anmeldung und Chromium-Anmeldung werden zusammen ausgeliefert. Die bestehenden Bildfreigaben D-RELEASE-006/007 bleiben gültig. Sein LXC wird durch diese Veröffentlichung nicht automatisch aktualisiert.

### D-RELEASE-009 — Mailversand im Adminbereich freigegeben, 19. November 2026

Auf „Wo kann ich die SMTP-Daten eintragen? Das sollte direkt im Adminbereich möglich sein.“ bestätigt Lars die Bilder `mockups/15-mailversand-desktop.png`, `mockups/15-mailversand-mobil.png` und `mockups/15-mailversand-gespeichert.png` mit **„Bildentwurf freigeben (empfohlen)“**. Die Umsetzung umfasst SMTP-Einstellungen, Prüfung vor Übernahme, geschützte Passwortspeicherung und Testmail. Sie ist in Arbeit, noch nicht veröffentlicht. Die anschließende Korrektur des Microsoft-Upload-Pakets wird getrennt bearbeitet und hebt diesen Auftrag nicht auf.

### D-RELEASE-010 — Microsoft-Kennung geliefert, 19. November 2026

Lars meldet **„Extension_identify.txt steht im ftp drop“**. Die Datei liegt als `Extension_identity.txt` vor und enthält die öffentliche CRX-ID sowie den öffentlichen Schlüssel. Die Kennung wird für die bereits beauftragte Store-Anmeldung verwendet. Store-ID und Produkt-ID werden nicht als Browserkennung übernommen. Paket 0.9.1 ergänzt die Serverfreigabe; die Bildfreigaben bleiben unverändert. Der SMTP-Ausbau aus D-RELEASE-009 im laufenden Arbeitsbaum bleibt beauftragt.

### D-RELEASE-011 — Favicon und Erweiterungssymbol freigegeben, 19. November 2026

Lars bestätigt den Entwurf `mockups/16-icons-vorschau.png` für Favicon, Browsererweiterung und Store mit **„Icon wie gezeigt übernehmen (empfohlen)“**. Das freigegebene Symbol wird in Version 0.9.2 eingebunden. Ein separates PNG ist für das Logo-Feld im Partner Center vorgesehen. Das Serverupdate installiert keine Erweiterung auf dem Endgerät; das neue Erweiterungspaket wird separat geladen beziehungsweise im Store eingereicht. Der SMTP-Ausbau aus D-RELEASE-009 bleibt beauftragt.

### D-RELEASE-012 — Excel-Nachweise freigegeben, 19. November 2026

Lars beauftragt „die nachweise sollte als excel-datei exportiert werden“ und bestätigt die Bilder `mockups/17-excel-desktop.png` und `mockups/17-excel-mobil.png` mit **„Bildentwurf freigeben (empfohlen)“**. Der Knopf exportiert Zeitraum, Suche und Ansicht. Der Übernahmestatus wird nicht verändert. Umsetzung für 0.9.3; Vertrag in [NACHWEIS-EXPORT.md](NACHWEIS-EXPORT.md).

### D-RELEASE-013 — Sofortige Domainrücknahme untersuchen, 19. November 2026

Lars meldet „der domainwechsel wird immer zurückgenommen“, konkret „Sofort nach Übernehmen“. Sein Protokoll zeigt Dienststarts und danach nur „WARN Domainwechsel zurückgenommen“. Öffentlich lesbare Versionsdaten des Containers nennen 0.9.2. Die fehlende Ursachenanzeige wird korrigiert; daraus folgt keine Behauptung, der konkrete Instanzfehler sei behoben. Es erfolgt keine Installation oder Konfigurationsänderung auf seinem LXC.

## D-RELEASE-014 — Einfachere Betriebsaktionen und Fortschrittsbalken

20.11.2026: Lars beanstandet wiederholte Passwortabfragen und Bestätigungen bei Domainzugriff und Updates. Er ergänzt „Beim Update hätte ich auch gerne ein Fortschritts Diagramm als Balken horizontal“ und gibt `mockups/18-betrieb-390.png` sowie `mockups/18-betrieb-1280.png` mit **„Entwurf umsetzen (empfohlen)“** frei. Version 0.9.4 bündelt Vorbereitung/Installation und Domainprüfung/Übernahme jeweils in einem Auftrag; der neue Domainzugriff wird automatisch erkannt. Die aktive Betriebs-Websitzung bleibt erforderlich. Die bestehenden Sicherungen und Rücknahmen bleiben technische Bestandteile.

Ergänzung vom 20.11.2026: Lars entscheidet „Das Lastprofil finde ich unnötig, wichtiger ist gitleaks“. Der automatische Kapazitätsjob entfällt zugunsten einer Gitleaks-Prüfung der Git-Historie mit redigierter Ausgabe. `tests/last.sh` bleibt für gezielte manuelle Messungen verfügbar; PostgreSQL-/Browser-Funktionstests bleiben Teil der Releaseprüfung.

## D-RELEASE-015 — Domainzugriff ohne Frist und Anmeldegrenze je Absender

20.11.2026: Lars meldet „Der domainzugriff funktioniert noch nicht zuverlässig“ und beauftragt eine Sichtung des Repositorys mit Audit. Die Diagnose belegt am laufenden Container (0.9.4) eine leere Erfolgsantwort für nicht eingerichtete Hostnamen und im Code den Wechsel der einzigen zulässigen Herkunft mit Dreiminutenfrist. Zur Frage nach dem Vorgehen wählt Lars **„Umbau bauen (Recommended)“** (IP und Domain gleichzeitig zulässig, keine Frist, Fehler 421 statt leerer Antwort, HTTP/3 aus) und zur anonym füllbaren Anmelde-Drossel **„Beheben (Recommended)“**. Nach Vorlage beider Pull Requests und der drei geänderten Hinweistexte im Wortlaut beauftragt er: „weiter, versionierung nicht vergessen und dann deployn auf https://github.com/larsborgwardt/timereal“. Eine gesonderte Bildfreigabe mit Entwurfsnummer gibt es zu diesem Paket nicht; es entstehen keine neuen Bedienelemente. Version 0.9.5 bündelt beide Änderungen. Nicht Teil des Pakets: ein Weg, eine eingerichtete Domain in der Verwaltung zu entfernen, signierte Updates und native Betriebsproben in der CI.

## D-RELEASE-016 — Offene Audit-Befunde umsetzen

20.11.2026: Auf die Frage nach den offenen Themen des Audit-Laufs `2026-11-20_08-06-55` beauftragt Lars: „befunden umsetzen bitte“. Entscheide per Auswahl: Signierschlüssel für Release-Tags auf dem Steuerrechner samt GitHub-Regel gegen Verschieben und Löschen von Tags (**„Schlüssel hier (Recommended)“**); Veröffentlichung als 0.9.6 nach grüner CI (**„Als 0.9.6 veröffentlichen (Recommended)“**). Zum Passwort-Hash wählte Lars zunächst scrypt mit p=5 für neue Passwörter. Der Lasttest damit verfehlte das Kapazitätsziel (Anmeldesturm p95 13,5 s statt unter 8 s); auf die erneute Vorlage entscheidet Lars **„Argon2id für neue (Recommended)“** (m=19 MiB, t=2, p=1; bestehende Hashes bleiben bis zum nächsten Passwortwechsel gültig). Keine neuen Bedienelemente; zwei Werte der Oberfläche werden zusätzlich maskiert, ohne sichtbare Änderung. Die Mailversand-Arbeit im Hauptbaum ist nicht Teil dieses Releases.

## D-RELEASE-017 — Mailversand vor Material Web, 20. November 2026

Lars gibt Entwurf 19 (Material 3 mit Material Web, `mockups/19-material/` auf dem Zweig `entwurf/material-web`) mit **„Entwurf freigeben“** frei und wählt **„Material Web, Richtlinie bleibt (Recommended)“**: Die Bibliothek wird gebündelt, die Inhaltsrichtlinie bleibt unverändert, Karten entstehen mit eigenen Stilen statt aus dem experimentellen Bereich. Auslieferung als ein Release 0.10.0 (**„Ein Release 0.10.0 (Recommended)“**). Vorher wird der Mailversand aus D-RELEASE-009 abgeschlossen und ausgeliefert (**„Mailversand zuerst (Recommended)“**). Die unfertige Mail-Arbeit stammte aus einer Codex-Sitzung; Lars entscheidet **„Claude übernimmt (Recommended)“**. Die Passwortbestätigung beim Speichern folgt dem freigegebenen Entwurf 15; sie schützt davor, dass eine fremde Sitzung Einladungs- und Rücksetzlinks über einen eigenen Mailserver umleitet.

## D-RELEASE-018 — Material Web in Teilen ausliefern, 20. November 2026

Nach Abschnitt 1–3 von Entwurf 19 (Fundament, Schaltflächen, Eingabefelder und Auswahllisten) entscheidet Lars: **„Release 0.10.0 jetzt machen“**. Damit weicht die Auslieferung von „ein Release 0.10.0“ aus D-RELEASE-017 ab: 0.10.0 enthält diese drei Abschnitte. Navigation und Register, Karten und Listen, Dialoge sowie die Erweiterungsseiten folgen in einem späteren Release.
