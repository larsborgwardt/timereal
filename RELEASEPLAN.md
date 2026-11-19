# Timereal — beauftragter Ausbau und Auslieferung

Auftrag von Lars am 19. November 2026: Designprüfung und offene Backlogpunkte umsetzen und als Release verfügbar machen. Ausgangsstand: `4d3e1ee026fa4f13e6ec3bdf9818a18fc81a44c6`; veröffentlichter Stand: 0.6.2. Die Art der jeweiligen Prüfumgebung ist im versionsbezogenen Nachweis genannt.

## Lieferpakete

| Version | Lieferumfang | Abnahme |
|---|---|---|
| 0.7.0 | Vorhandene Designkorrekturen, Admin-Updates, Domainverwaltung, einmaliger Konsolenumstieg | Bestehende freigegebene Bilder in `ADMIN-BETRIEB.md`; Debian-13/systemd-Prüfgast, PostgreSQL und Browser; Bootstrap aus 0.6.2 und Folgesprung. Neue Betriebsfunktionen noch nicht auf einem echten Proxmox-LXC gemessen. |
| 0.8.0 | Freigegebene Systemkonsole mit Suche, Level, Live-Pause, Aktualisierung und Download | Echte Journalquelle, feste Dienste, Administrator-Websitzung, PostgreSQL-/Browser- und native Dienstprüfung |
| 0.8.1 | Benutzer- und Rollenverwaltung | Bilder 11 freigegeben (D-RELEASE-004); Rollenmatrix, Kontotrennung und Schutz des letzten Administrators |
| 0.8.2 | Lesbares Audit-Protokoll | Bilder 11 freigegeben (D-RELEASE-005); Administratoransicht, 180-Tage-Lesefenster und begrenzter Export |
| 0.9.0 | Kontoprofil und Zwei-Faktor-Anmeldung einschließlich Wiederherstellung; Erweiterung mit neuem Anmeldevertrag und weiteren Browserprüfungen | Bilder 13 freigegeben (D-RELEASE-006); Einrichtung, Replay-Schutz, Recovery und Widerruf; real geladene Erweiterung |

0.7.0 ist veröffentlicht; dessen Belege stehen in `nachweise/0.7.0.md`. Das Korrekturpaket 0.7.1 behebt den von Lars gemeldeten Aktionsabstand unter Nachweise. 0.7.2 korrigiert die manuelle Updateprüfung, die zuvor ebenfalls nur den Cache auslas. Die Systemkonsole wird als eigenes Paket 0.8.0 geliefert; Veröffentlichung und Prüfbelege stehen in `nachweise/0.8.0.md`. Benutzer und Rollen sind in 0.8.1 umgesetzt; Prüfbelege stehen in `nachweise/0.8.1.md`. Audit 0.8.2 und Kontosicherheit 0.9.0 bleiben die nächsten Pakete. Bereits vorhandene Funktionen (Passwortänderung, E-Mail, Sitzungen, Chromium-Timer) werden weiterverwendet. Browser-/Store-Veröffentlichungen mit fremden Entwicklerkonten sind vom lokal lieferbaren Erweiterungspaket zu unterscheiden.

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

## Umsetzungsfolge

Fortsetzung am 19. November 2026 auf „ok, dann weiter mit der Systemkonsole und den offenen Punkten im Backlog“: Die nach D-RELEASE-003 freigegebene Konsole erhält ein eigenes Release 0.8.0. Die eingegangenen Freigaben D-RELEASE-004 bis D-RELEASE-006 heben die Bildwartepositionen auf: Rollen folgen in 0.8.1, Audit in 0.8.2 und Profil/Kontosicherheit einschließlich Erweiterungsanmeldung in 0.9.0. Diese Lieferreihenfolge hebt keinen offenen Auftrag auf.

Zuerst den dauerhaften Betriebsauftrag mit Idempotenz, Zustandsübergängen und eingeschränktem Unix-Socket bauen. Danach die vorhandenen Update-/Proxyskripte anbinden und mit realen Diensten prüfen. Die bereits freigegebenen Verwaltungsansichten folgen diesem Vertrag. Die nächsten Pakete erhalten konkrete Rollen-/Aufbewahrungs-/Wiederherstellungsverträge; die freigegebenen Bilder 11 und 13 bleiben ihre Messlatte.

Verhalten wird durch einen zuerst fehlgeschlagenen Test eingeführt. Ein Release setzt den PostgreSQL-/Browserlauf, den Kapazitätstest und die passenden Betriebsproben voraus. Die neuen Betriebsproben verwenden einen eigenen privilegierten Debian-Docker-Prüfgast mit systemd; sie ersetzen keinen Proxmox-LXC-Nachweis. Keine Installation auf Lars' Container durch diesen Arbeitsauftrag; das ausgelieferte Update bleibt durch Lars ausführbar.

## Grenzen der Designprüfung

`DESIGNPRUEFUNG.md` beschreibt bereits korrigierte Befunde. Die dort genannten fehlenden Messungen sind nicht automatisch Codefehler. Browserengine-Prüfungen werden nach verfügbarer Laufzeit ergänzt; physische Touchgeräte und VoiceOver werden ohne entsprechendes Gerät nicht als geprüft ausgegeben.
