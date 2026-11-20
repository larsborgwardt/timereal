# Änderungen

## 0.9.7 — 20. November 2026

- **Verwaltung → Mailversand** (Entwurf 15): Administratoren richten SMTP-Server, Port, Verschlüsselung, Absender und Anmeldung direkt in der App ein. Die Verbindung wird vor dem Speichern geprüft; bei einem Fehler bleiben die bisherigen Einstellungen erhalten. Bestätigung mit dem eigenen Timereal-Passwort; das gespeicherte SMTP-Passwort wird nie angezeigt. Testmail an eine beliebige Adresse. Änderungen gelten ohne Neustart.
- Der Konsolenweg `betrieb/mail-einrichten.sh` bleibt verfügbar.
- API 1 und Datenbankschema 10 bleiben erhalten. Zuerst den Server aktualisieren; die Erweiterung ändert sich nur in der Versionsnummer. [Prüfbelege](nachweise/0.9.7.md).

## 0.9.6 — 20. November 2026

- Updates: Release-Tags sind ab 0.9.6 mit einem SSH-Schlüssel signiert (`betrieb/release-signierer`). Der Betriebsdienst einer installierten 0.9.6 installiert nur Tags, die mit dem Schlüssel der bereits installierten Version signiert sind; die Prüfung greift deshalb ab dem Update nach 0.9.6. Bau und Tests eines neuen Stands laufen nicht mehr als root, sondern unter `timereal_build`. Für den Konsolenweg prüft `tag-pruefen.mjs` die Signatur. Auf GitHub schützt eine Regel Release-Tags vor Verschieben und Löschen.
- CI: Format- und Abhängigkeitsprüfung, wöchentliche Abhängigkeitsprüfung, Wächter für HTML-Einfügungen und eine frische Installation mit Proxy- und Domainprobe in einem Debian-13/systemd-Container.
- Passwörter: Neue und geänderte Passwörter werden mit Argon2id (m=19 MiB, t=2, p=1) gespeichert, der Erstwahl des OWASP Password Storage Cheat Sheet; bisher scrypt mit p=1 unterhalb der OWASP-Empfehlung. Der Hash trägt seine Parameter. Bestehende Passwörter bleiben gültig und werden beim nächsten Passwortwechsel umgestellt. Eine Anmeldung kostet etwa so viel Rechenzeit wie bisher. Benötigt Node.js ab 24.7; Installationen verwenden 24.22.3.
- Passwort zurücksetzen: Die Anfrage wird beantwortet, bevor die Mail versendet wird. Bisher wartete nur die Anfrage für ein vorhandenes Konto auf den Mailserver; die Antwortzeit verriet so, ob ein Konto existiert.
- API 1 und Datenbankschema 10 bleiben erhalten. Zuerst den Server aktualisieren; die Erweiterung ändert sich nur in der Versionsnummer. [Prüfbelege](nachweise/0.9.6.md).

## 0.9.5 — 20. November 2026

- Domainzugriff: Die Domain kommt zur Container-IP hinzu, statt sie zu ersetzen. Die Anmeldung über die lokale Adresse bleibt möglich; Bestätigungsfrist und automatische Rücknahme nach drei Minuten entfallen.
- Nicht eingerichtete Hostnamen erhalten den Fehler 421 mit `Cache-Control: no-store` statt einer leeren Erfolgsantwort. HTTP/3 wird nicht mehr angekündigt.
- Betriebsdienst, `proxy-einrichten.sh` und `install.sh` verwenden dieselbe HTTPS-Vorlage. Die Vorlage bis 0.9.4 wird weiter erkannt; nach dem Update die Domain einmal erneut speichern.
- Anmeldung: Viele Fehlversuche eines Absenders sperren nicht mehr die Anmeldung aller. Das Kontingent gilt je Absender; ein voller Zählerspeicher verdrängt den ältesten Eintrag, statt jede weitere Anmeldung abzuweisen.
- API 1 und Datenbankschema 10 bleiben erhalten. Zuerst den Server aktualisieren; die Erweiterung ändert sich nur in der Versionsnummer. [Prüfbelege](nachweise/0.9.5.md).

## 0.9.4 — 20. November 2026

- Gitleaks prüft die Git-Historie auf eingecheckte Zugangsdaten. Der automatische Lastprofil-Job entfällt; Lastmessungen bleiben manuell möglich.
- Updates starten mit einem Klick; Vorbereitung, Datensicherung und Installation laufen auf dem Server weiter. Ein horizontaler Fortschrittsbalken zeigt die tatsächlichen Phasen.
- Domain speichern prüft und übernimmt die Konfiguration in einem Auftrag. Der angemeldete Zugriff über die neue Adresse wird automatisch erkannt.
- Erneute Passworteingabe und manueller Bestätigungsklick entfallen für diese Betriebsaktionen. Betriebsrolle, Websitzung, Herkunftsprüfung und wiederholbare Auftragsschlüssel bleiben erforderlich.
- Eine vorgehende Geräteuhr kann den Domainzugriff nicht mehr durch einen abgelaufenen lokalen Countdown blockieren. Bei einem blockierenden Domainauftrag erklärt die Updateansicht den Grund.
- API 1 und Datenbankschema 10 bleiben erhalten. Hinweise zum einmaligen Umstieg aus einer gesperrten Altversion stehen in der Betriebsanleitung.

## 0.9.3 — 19. November 2026

- Nachweise als echte Excel-Datei (`.xlsx`) herunterladen: gewählter Zeitraum, Suche und Ansicht, persönliche Daten, numerische Stunden/Dauer und erhaltene führende Nullen. Der Export verändert den Übernahmestatus nicht.
- Fehler statt stiller Kürzung bei mehr als 5.000 passenden Abschnitten; erklärende Exportangaben in einem zweiten Tabellenblatt.
- Domainrückbau nennt den fehlgeschlagenen Prüfschritt und sichere Diagnosehinweise direkt im Auftrag und im Systemlog. Der konkrete sofortige Rückbau auf Lars’ Instanz ist damit noch nicht als behoben nachgewiesen.
- Schema 10 und API 1 bleiben erhalten. Zuerst Server, danach Erweiterung aktualisieren. [Prüfbelege](nachweise/0.9.3.md).

## 0.9.2 — 19. November 2026

- Gemeinsames freigegebenes Timereal-Symbol als Favicon der Web-App, im Anmeldefenster und in der Browsererweiterung.
- PNG-Symbole für Browserleiste und Erweiterungsverwaltung; ICO für Browser-Tabs und Touch-Symbol für Lesezeichen.
- Separates 300-Pixel-Logo für das Feld „Extension logo“ im Microsoft Partner Center.
- Edge-Upload-ZIP weiterhin ohne `key` und `update_url`. Serverupdate und Erweiterungspaket werden getrennt installiert; Schema 10 und API 1 bleiben unverändert. [Prüfbelege](nachweise/0.9.2.md).

## 0.9.1 — 19. November 2026

- Anmeldung der offiziellen Microsoft-Edge-Erweiterung anhand ihrer konkreten CRX-ID freigeschaltet; Entwicklungskennung bleibt unterstützt.
- Herkunft und Rücksprungziel werden beim Codeaustausch als Paar geprüft; Einmalcodes bleiben an PKCE und das ursprünglich freigegebene Ziel gebunden.
- Edge-Upload-ZIP ohne `key` und `update_url`; Browserprobe mit Microsofts öffentlichem Schlüssel und echter CRX-ID.
- Schema 10 und API 1 bleiben unverändert. Server zuerst aktualisieren; ein bereits hochgeladenes Edge-Store-Paket 0.9.0 bleibt verwendbar. [Prüfbelege und Grenzen](nachweise/0.9.1.md).

## 0.9.0 — 19. November 2026

- Anzeigename und E-Mail-Bestätigung im eigenen Konto; Name auch ohne eingerichteten Mailversand bearbeitbar.
- Authenticator-Einrichtung mit lokal erzeugtem QR-Code, einmaligen Wiederherstellungscodes und Passwortbestätigung bei Faktoränderungen.
- Begrenzte Teilanmeldung, Schutz vor wiederverwendeten Codes und atomarer Verbrauch bei parallelen Geräten; Passwortreset behält den Faktor bei.
- Gemeinsamer zweiter Anmeldeschritt für Web-App und Chromium-Erweiterung; separat widerrufbare Sitzung bleibt erhalten.
- Dauerhafter Schlüssel außerhalb des Releasebaums, tägliche Sicherung als geschütztes Paket und Schlüsselprüfung bei externer Rücksicherung.
- Neue Audit-Ereignisse für Faktorverwaltung und Wiederherstellungsverwendung ohne Geheimnisse.
- Datenbankschema 10, API-Version 1. Server zuerst aktualisieren, anschließend Erweiterung 0.9.0 laden. [Prüfbelege und Grenzen](nachweise/0.9.0.md).

## 0.8.2 — 19. November 2026

- Audit-Protokoll unter Verwaltung: Konto-, Rollen-, Sperr-, Passwort-, E-Mail-, Einladungs- und Sitzungsereignisse; fehlgeschlagene Anmeldungen ohne Speicherung unbekannter eingegebener Namen.
- Administrator-Websitzung erforderlich. Filter nach Datum in der eigenen Zeitzone und Suchtext, Nachladen und JSON-Export mit sichtbarer Begrenzung.
- Ereignisse der Datenänderungen werden in derselben Datenbanktransaktion gespeichert; Zurückrollen und unveränderte Werte erzeugen keinen Änderungserfolg.
- Protokoll ohne Passwort-, Link- oder Sitzungsschlüssel und ohne Buchungstexte. Das 180-Tage-Lesefenster ist keine automatische Löschregel.
- Additive Migration auf Schema 8; API 1 und Betriebsprotokoll 1 bleiben kompatibel. Vorhandene lange Kontonamen bleiben unterstützt.

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
