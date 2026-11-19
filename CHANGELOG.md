# Änderungen

## 0.8.1 — 19. November 2026

- Kontenansicht mit den Rollen Berater, Betrieb und Administrator sowie erklärten Berechtigungen. Persönliche Kunden und Zeiten bleiben getrennt.
- Betrieb erhält Zugriff auf Updates, Domainzugriff und Systemkonsole. Konten und Einladungen bleiben Administratoren vorbehalten; Verwaltungsaktionen verlangen eine Websitzung.
- Rollenwechsel widerrufen Sitzungen, lassen laufende Timer bestehen. Unveränderte Rollen widerrufen keine Sitzung. Eigene Administratorkonten und der letzte aktive Administrator sind geschützt; konkurrierende Änderungen werden vor der Sitzungsbindung serialisiert.
- Ungespeicherte Rollenauswahl bleibt bei Hintergrundaktualisierung erhalten.
- Additive Migration auf Datenbankschema 7; API 1 und Betriebsprotokoll 1 bleiben erhalten.

## 0.8.0 — 19. November 2026

- Schnelle Seitenwechsel blenden keinen Verarbeitungshinweis mehr ein; längeres Laden meldet sich nach 300 Millisekunden mit „Seite wird geladen…“.
- Prozessausgaben erhalten UTF-8-Zeichen auch bei aufgeteilten Datenblöcken.
- Native Updateproben für Speicherknappheit, fehlgeschlagene Datenbanksicherung und einen nicht startbaren Vorgänger.
- Systemkonsole unter Verwaltung → Systemlogs: echte Journalmeldungen von Anwendung, Betriebsdienst und HTTPS mit Quelle, Level und Freitextsuche.
- Liveanzeige mit Pause, unabhängig schaltbarem automatischem Scrollen, manueller Aktualisierung und Download des angezeigten Stands. Eine pausierte Anzeige bleibt auch bei Fensterwechsel pausiert.
- Begrenzter Abruf der letzten 500 Einträge aus 24 Stunden. Fehler bleiben sichtbar; der zuletzt erfolgreich geladene Stand wird als solcher angezeigt.
- Zugriff über aktive Administrator-Websitzungen; feste Dienstauswahl über den Betriebsdienst. Erkannte Zugangsdaten und strukturierte Anfragefelder werden vor Suche, Anzeige und Download entfernt; Logtext wird nicht als HTML ausgeführt.
- Start- und Abschlussereignisse unterscheiden info, success und complete; Journalprioritäten liefern zusätzlich warn, error, debug und fatal.
- API-Version 1, Datenbankschema 6 und Betriebsprotokoll 1 bleiben kompatibel. Der Betriebsdienst wird beim regulären Update mit aktualisiert. Rollen-/Audit- und Kontosicherheitsansichten sind freigegeben und folgen in eigenen Paketen.

## 0.7.2 — 19. November 2026

- „Status aktualisieren“ unter Verwaltung → Updates prüft sofort bei GitHub auf ein neueres stabiles Release. Der bisherige Knopf lieferte bis zu sechs Stunden lang nur den zwischengespeicherten Stand.
- Footer und Verwaltung übernehmen das neue Prüfergebnis. Eine bereits laufende Hintergrundabfrage überschreibt es nicht; während der Prüfung ist deren Fortschritt erkennbar.
- Manuelle Prüfungen sind Administrator-Websitzungen vorbehalten und auf einen Versuch je Minute pro Serverprozess begrenzt. Netzfehler und deaktivierte Prüfungen bleiben erkennbar.
- API-Version 1, Datenbankschema 6 und Betriebsprotokoll 1 bleiben unverändert. Bei 0.7.0/0.7.1 leert ein einmaliger Dienstneustart den bisherigen Cache, damit das Update sofort angeboten wird.

## 0.7.1 — 19. November 2026

- „Filter zurücksetzen“ und „Zeit nachtragen“ unter Nachweise stehen mit Abstand in einer gemeinsamen Aktionsgruppe. Auf schmalen Bildschirmen brechen sie mit Abstand um.
- Die Browserprüfung kontrolliert zusätzlich den Abstand benachbarter Aktionsbuttons, auch bei verdoppelter Schrift und in der Erweiterung. Navigationsregister sind gesondert behandelt.
- API-Version 1, Datenbankschema 6 und Betriebsprotokoll 1 bleiben unverändert; Update von 0.7.0 über Verwaltung → Updates.

## 0.7.0 — 19. November 2026

- Apple-Design-Prüfung der bestehenden Web-App und Chromium-Erweiterung mit dauerhaft mitlaufenden Browserproben.
- Lange Kunden-/Ticketnamen, vergrößerte Schrift und mobile Formulare passen in den verfügbaren Bereich; Dialogaktionen bleiben beim Scrollen erreichbar.
- Tastaturfokus und ungespeicherte Profileinstellungen bleiben bei Hintergrundaktualisierungen erhalten. Während einer Speicherung neu geschriebene Änderungen bleiben als Entwurf erkennbar.
- Benannte Dialoge, sichtbare Verarbeitung, verständliche Verbindungsfehler der Erweiterungsanmeldung und textliche Änderungskennzeichnung im Buchungsvergleich.
- Einladungsbutton bleibt ohne Mailkonfiguration gesperrt; Rücksetzlinks funktionieren auch im bereits geöffneten Tab.
- Updates im Adminbereich: konkretes stabiles Release vorbereiten, nach Passwortprüfung sichern und installieren; Fortschritt und Ergebnis überleben das Schließen des Browsers.
- Domainzugriff im Adminbereich: eigenen DNS-Namen prüfen und übernehmen; neue Anmeldung und Bestätigung innerhalb von drei Minuten, sonst automatische Rückkehr zur bisherigen Konfiguration.
- Getrennter root-eigener Betriebsdienst mit lokalem Unix-Socket, festem Auftragsprotokoll, gemeinsamem Betriebslock und dauerhaften Wiederholungsschlüsseln.
- Wiederanlauf nach abgebrochenem Dienstwechsel; fehlgeschlagener Bootstrap stellt den bisherigen Betriebsdienst wieder her. Keine automatische Rücksicherung alter Datenbankstände.
- Bestehende Installationen richten den Betriebsdienst einmalig über das Konsolenupdate ein. Betriebsaktionen bleiben Websitzungen von Administratoren vorbehalten; die Erweiterung blendet diese Bereiche aus.
- API-Version 1 und Datenbankschema 6 bleiben unverändert; Webupdates prüfen Betriebsprotokoll 1. Rollen-/Audit-/Systemlog- und 2FA-Ausbau folgen gemäß Backlog nach Bildfreigabe.

## 0.6.2 — 19. November 2026

- Footer mit installierter Version, GitHub-Link und Hinweis auf neuere stabile Releases.
- Serverseitige Updateprüfung mit gemeinsamem Cache, Zeitlimit, Fehlerzustand und Abschaltmöglichkeit.
- Domainneutraler Konfigurationspatch für vorhandene externe Nginx-Proxys; Prüfmodus, Sicherung und Rückkehr bei Fehlern.
- Anmeldeüberschrift bleibt bei schmaler Ansicht und vergrößerter Schrift im sichtbaren Bereich.
- Erweiterungsanmeldung wird erst bedienbar, wenn ihre gespeicherten Einstellungen geladen sind; frühe Eingaben werden nicht überschrieben.
- Vergleich mit Gotify, Uptime Kuma, Paperless-ngx und BookStack dokumentiert; weitere Benutzer-/Rollen-, Audit-, Systemlog-, Konto-/2FA- und Erweiterungsthemen im Backlog.
- API-Version 1 und Datenbankschema 6 bleiben unverändert.

## 0.6.1 — 19. November 2026

- Installation und Update zeigen die Browser-Adresse mit ausdrücklichem Port; HTTPS-Port 443 und interner Port 3040 werden erklärt.
- Nummerierte Phasen, Versionsvergleich, Hinweise auf die Dienstunterbrechung sowie Pfade für Sicherung und Migrationsprotokoll.
- Abbrüche nennen die betroffene Phase, den Exitcode und einen Diagnosebefehl. Der Updater meldet das Ergebnis der Wiederherstellung des vorherigen Diensts.
- Installationshilfe ohne Systemzugriff; der Update-Prüfmodus zeigt Adresse und nächsten Befehl, ohne den Dienst anzuhalten.
- Patchversion bei unverändertem Datenbankschema 6 und API-Version 1.

## 0.6.0 — 19. November 2026

- Kapazitätsauslegung für 100 gleichzeitig aktive Berater mit gewachsenem persönlichem Zeitbestand.
- Gemeinsame Arbeitsstand-Anfrage für Timer, Ziele, Kunden und Profil reduziert die regelmäßigen Serveranfragen von Web-App und Erweiterung.
- Zusätzliche PostgreSQL-Indizes und gezielte Zeitraumabfragen unter aktiver Kontotrennung; unveränderte Berechnung bei Mitternacht und Zeitumstellung.
- Begrenzte Wartezeiten für Pool, Sperren und SQL; verständliche 503-Antwort bei vorübergehender Überlast und Erholung nach Verbindungsabbruch.
- Wiederholbarer HTTP-Lasttest mit Datenprüfung und Migration von Schema 5 auf 6; GitHub führt ihn als eigene Prüfung aus.

- Mailversand nach dem Speichern des Links; langsame SMTP-Antworten halten keine Kontosperre und keine Datenbanktransaktion offen.
- Ausgeliehene Datenbankverbindungen behandeln Verbindungsabbrüche ohne Prozessabsturz.
- Einladungen für verschiedene Berater funktionieren auch hinter derselben Firmen-IP; wiederholte Linkversuche bleiben begrenzt. Weiterleitungsadressen werden nur vom lokalen Proxy übernommen.
- Das Anmeldelimit zählt Großschreibungsvarianten einer E-Mail-Adresse zusammen.

## 0.5.0 — 19. November 2026

- Chromium-Erweiterung mit gemeinsamem Timer und Notizfeld, vollständiger Ansicht und separat widerrufbarer Sitzung.
- Anmeldung über PKCE, kurzlebigen Einmalcode und festes Rücksprungziel; Serverberechtigung beim Verbinden.
- Wiederaufnahme nach fehlender Antwort: aktuellen Stand laden und nächste Timeraktion bestätigen; keine still nachgeholten Offline-Wechsel.
- Einrichtung öffentlichen HTTPS mit Prüfmodus und Rückwechsel bei gescheiterter Zertifikatsprüfung.
- Verschlüsselte externe SFTP-Sicherung mit Restic, täglichem Timer, Integritätsprüfung und Rücksicherung in eine getrennte Prüfdatenbank.
- Direkter Updateweg vom ursprünglichen Pilot sowie automatisierte PostgreSQL-/Browserprüfungen auf GitHub.

## 0.4.0 — 19. November 2026

- Sofortstart ohne festes Buchungsziel, interne Zeiten und Tagesverlauf.
- Nachtragen, Korrigieren, Unterbrechungen mit Vorschau und Stornieren in der Oberfläche.
- Gegenüberstellung des zuletzt übertragenen und aktuellen Buchungsstands.
- Wochenübersicht mit Minuten je Tag, Kunde und Projekt; Aufteilung über Mitternacht und echte Dauer bei Zeitumstellung.
- Kunden-/Buchungszielpflege mit Versionskonflikten und gemeinsamem Speichern; Nachkommastellen und Prüfschwelle in den Einstellungen.
- Historienfilter zurücksetzen; die gespeicherten Buchungen bleiben erhalten.

## 0.3.0 — 19. November 2026

- Verwaltung mit Beraterkonten, Einladungen, erneutem Versand, Widerruf und Sperren.
- Einladung mit eigenem Passwort, Passwortzurücksetzung und Passwortwechsel.
- Einstellungen mit E-Mail-Adresse, Version und einzeln widerrufbaren Sitzungen.
- SMTP-Einrichtung mit Verbindungsprüfung und geschützter Konfigurationsdatei.
- Kontometadaten für Administratoren; fremde Kunden und Zeiten bleiben getrennt.

## 0.2.0 — 19. November 2026

- Versionsauskunft unter `/api/v1/version`.
- Update auf einen festen Git-Tag mit vorheriger Prüfung, getrenntem Build, Datenbanksicherung und Umschaltung des Anwendungsdiensts.
- Rückkehr zur vorherigen Anwendung bei fehlgeschlagenem Start; keine automatische Überschreibung der Datenbank durch einen alten Dump.
- Der Bootstrap für den bestehenden 0.1-Piloten erhält Daten, Konfiguration und Test-CA.

## 0.1.0 — Timerpilot

Kunden und Buchungsziele, gemeinsamer Timer auf mehreren Geräten, Pause und Stopp, Leistungstexte, Historie und manuelle Übernahme. Native Installation im Debian-13-LXC mit PostgreSQL, HTTPS und täglicher lokaler Sicherung.
