# Timereal — beauftragter Ausbau und Auslieferung

Auftrag von Lars am 19. November 2026: Designprüfung und offene Backlogpunkte umsetzen und als Release verfügbar machen. Ausgangsstand: `4d3e1ee026fa4f13e6ec3bdf9818a18fc81a44c6`; veröffentlichter Stand: 0.6.2. Die Art der jeweiligen Prüfumgebung ist im versionsbezogenen Nachweis genannt.

## Lieferpakete

| Version | Lieferumfang | Abnahme |
|---|---|---|
| 0.7.0 | Vorhandene Designkorrekturen, Admin-Updates, Domainverwaltung, einmaliger Konsolenumstieg | Bestehende freigegebene Bilder in `ADMIN-BETRIEB.md`; Debian-13/systemd-Prüfgast, PostgreSQL und Browser; Bootstrap aus 0.6.2 und Folgesprung. Neue Betriebsfunktionen noch nicht auf einem echten Proxmox-LXC gemessen. |
| 0.8.0 | Benutzer-/Rollenverwaltung, lesbares Audit-Protokoll, Systemlogs mit Suche, Level, Liveanzeige, Aktualisierung und Download | Rollenmatrix, Aufbewahrung und Exportgrenzen; neue Zielbilder vor dem UI-Bau; Kontotrennung und echte Journalquelle |
| 0.9.0 | Kontoprofil und Zwei-Faktor-Anmeldung einschließlich Wiederherstellung; Erweiterung mit neuem Anmeldevertrag und weiteren Browserprüfungen | Neue Zielbilder vor dem UI-Bau; Einrichtung, Replay-Schutz, Recovery und Widerruf; real geladene Erweiterung |

0.7.0 ist implementiert und wird als eigenes Lieferpaket veröffentlicht; dessen Belege stehen in `nachweise/0.7.0.md`. 0.8.0 und 0.9.0 sind Planungsziele, keine verfügbaren Releases. Bereits vorhandene Funktionen (Passwortänderung, E-Mail, Sitzungen, Chromium-Timer) werden weiterverwendet. Browser-/Store-Veröffentlichungen mit fremden Entwicklerkonten sind vom lokal lieferbaren Erweiterungspaket zu unterscheiden.

## Entscheidungsjournal

### D-RELEASE-001 — Neue Ansichten zuerst ändern, 19. November 2026

Lars beantwortet die Bildfrage zu `mockups/11-konten-und-protokolle.html` mit **„Bildentwürfe zuerst ändern“**. Die Entwürfe für Konten/Rollen, Audit-Protokoll, Systemlogs und Kontosicherheit sind damit nicht zur Implementierung freigegeben. Die Nachfrage nach konkreten Änderungen ist gestellt. Diese neuen Oberflächen warten auf den überarbeiteten Bildentwurf und dessen Freigabe. Der bereits freigegebene Umfang von 0.7.0 läuft weiter. Der Ausbauauftrag als Ganzes ist damit nicht aufgehoben.

### D-RELEASE-002 — Systemlog als Konsole, 19. November 2026

Lars konkretisiert die Änderung: **„systemlog soll die cli zeigen wie beim nginx-proxy-manager“**. Der neue Logbereich zeigt fortlaufende Monospace-Zeilen mit Zeit, Quelle, Level und Meldung sowie Liveanzeige, Suche, Aktualisierung und Download. Das ist eine Ansicht der Systemausgabe; eine frei ausführbare Shell wird aus diesem Logwunsch nicht abgeleitet. Die überarbeiteten Bilder `mockups/12-systemkonsole-desktop.png` und `mockups/12-systemkonsole-mobil.png` sind zur Freigabe vorgelegt. Die Konsolenansicht wartet wie die anderen neuen Ansichten auf die Bildfreigabe.

## Umsetzungsfolge

Zuerst den dauerhaften Betriebsauftrag mit Idempotenz, Zustandsübergängen und eingeschränktem Unix-Socket bauen. Danach die vorhandenen Update-/Proxyskripte anbinden und mit realen Diensten prüfen. Die bereits freigegebenen Verwaltungsansichten folgen diesem Vertrag. Die nächsten Pakete erhalten konkrete Rollen-/Aufbewahrungs-/Wiederherstellungsverträge und Zielbilder, bevor ihre neuen Oberflächen gebaut werden.

Verhalten wird durch einen zuerst fehlgeschlagenen Test eingeführt. Ein Release setzt den PostgreSQL-/Browserlauf, den Kapazitätstest und die passenden Betriebsproben voraus. Die neuen Betriebsproben verwenden einen eigenen privilegierten Debian-Docker-Prüfgast mit systemd; sie ersetzen keinen Proxmox-LXC-Nachweis. Keine Installation auf Lars' Container durch diesen Arbeitsauftrag; das ausgelieferte Update bleibt durch Lars ausführbar.

## Grenzen der Designprüfung

`DESIGNPRUEFUNG.md` beschreibt bereits korrigierte Befunde. Die dort genannten fehlenden Messungen sind nicht automatisch Codefehler. Browserengine-Prüfungen werden nach verfügbarer Laufzeit ergänzt; physische Touchgeräte und VoiceOver werden ohne entsprechendes Gerät nicht als geprüft ausgegeben.
