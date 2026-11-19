# Versionsplan und Aktualisierung

## Auftrag und Ausgangspunkt

Lars beauftragt am 18. November 2026 die Umsetzung der offenen Funktionen mit Versionen und einem Updateweg für seinen bestehenden Test-LXC. Ausgangspunkt ist Version 0.1.0, Commit `5e2f840b07f3676b7d7d832f7fa35d0c3e1ccfd8` auf `feature/zeiterfassung-lxc`. Die bisherige Zurückstellung der Zusatzfunktionen endet mit diesem Umsetzungsauftrag. Die Bildfreigabe neuer Ansichten bleibt ein eigener Abnahmeschritt.

## Lieferfolge

| Version | Liefergegenstand | Abnahme |
|---|---|---|
| 0.2.0 | Versionierter Updateweg, Versionsauskunft, Sicherung vor Migration, getrennt gebautes Release, Rückkehr zur vorherigen Anwendung bei Startfehler | Bestehende 0.1-Datenbank mit Konto, Timer, abgeschlossenen Zeiten und Übertragungsstand aktualisieren; Inhalte erhalten, Wiederholung folgenlos, Fehler vor Umschaltung lässt alten Dienst nutzbar |
| 0.3.0 | Adminbereich, Einladungen mit SMTP, erneut senden/widerrufen, Annahme mit eigenem Passwort, Passwortzurücksetzung, Passwortwechsel, persönliche Sitzungsverwaltung | Zwei normale Konten und Admin; Admin sieht Kontometadaten ohne fremde Kundenzeiten; abgelaufener/verbrauchter/widerrufener Link scheitert, Sperre beendet Timer und Sitzungen |
| 0.4.0 | Sofortstart, interne Zeit, Nachtrag/Korrektur, Unterbrechung, Storno, vollständiger Übertragungsvergleich, Wochenübersicht, Kunden-/Zielpflege, Einstellungen und Historienreset | Realer Browserablauf einschließlich 20/12/28-Minuten-Aufteilung, gemeinsam verschobenen Grenzen, Zeitzonen-/Tageswechsel und Änderung eines bereits übertragenen Nachweises |
| 0.5.0 | Browsererweiterung für Chromium (Chrome/Edge), gemeinsame Timer-/Notizbedienung, eigene widerrufbare Sitzung, bewusste Wiederaufnahme nach Verbindungsverlust; Einrichtung öffentlichen HTTPS-Zugangs und verschlüsselter externer Sicherung | App-Tab geschlossen, Popup wechselt Kunde, Smartphone zeigt Änderung; fremde Rücksprungadresse und wiederholter Autorisierungscode scheitern; Rücksicherung aus externem Sicherungsbestand |
| 0.6.0 | Betrieb für 100 gleichzeitig aktive Nutzer, endliche Datenbankwartezeiten, reproduzierbarer Lastnachweis und Ressourcenplanung | 100 echte Konten mit 500.000 Abschnitten, parallele Timeraktionen und Fremdzugriffe, Erholung nach Pool-/Sperrengpass; [Abnahmevertrag](KAPAZITAET.md) |
| 0.6.1 | Verständliche Installations- und Updateausgabe mit Browser-Adresse einschließlich Port | Reale Erstinstallation, Update und Wiederholung im getrennten Debian-Prüfgast; Adresse aus Konfiguration, Fehlerphase, Sicherungspfad und Rückkehr nach Startfehler prüfen |
| 0.6.2 | Versionsfooter, Updatehinweis, konfigurierbare Proxy-Domain und abgesicherter Start der Erweiterungsanmeldung | Cache-/Fehlerproben, mobile und vergrößerte Darstellung, echtes Update von 0.6.1 und Domainwechsel im Prüfgast |

Die Versionsnummer beschreibt ein geprüftes Lieferpaket. Fehlerkorrekturen erhöhen die dritte Stelle. Ein Git-Tag `vX.Y.Z` wird nach den Prüfungen angelegt und anschließend nicht verschoben. Die API bleibt unter `/api/v1`; ein zusätzlicher Endpunkt ändert nicht deren Hauptversion. Eine spätere inkompatible Schnittstelle bekommt einen eigenen Pfad.

## Updatevertrag für den bestehenden Pilot

- Lars aktualisiert den bestehenden Container; eine Neuinstallation oder das Löschen der Datenbank ist nicht vorgesehen.
- Der Updatebefehl nennt eine konkrete veröffentlichte Version. Ein Prüfmodus zeigt den Ausgangsstand und das Ziel ohne Dienstunterbrechung.
- Download, Installation der gesperrten Paketversionen und TypeScript-Build erfolgen in einem neuen Releaseverzeichnis. Der laufende Anwendungsbaum wird dabei nicht bearbeitet.
- Vor der Datenbankänderung wird der Anwendungsdienst angehalten und ein überprüfter Datenbankdump geschrieben. Zugangsdaten, HTTPS-Konfiguration und Test-CA bleiben erhalten.
- Migrationen sind versioniert. Für diese Lieferfolge werden Erweiterungen so angelegt, dass der vorherige Anwendungsstand weiterläuft. Ein Datenbank-Downgrade wird nicht automatisch ausgeführt.
- Erst nach erfolgreichem Build und Migration wird der aktive Releasezeiger gewechselt. Nachprüfung umfasst Dienststart, Datenbankzugriff, Versionsnummer und API-Version.
- Schlägt die Nachprüfung fehl, wird der vorige Anwendungsstand gestartet. Sicherung und Fehlerausgabe bleiben für die Diagnose erhalten. Ein Dump wird niemals still über zwischenzeitlich erfasste Zeiten zurückgespielt.
- Nach erfolgreichem Update laden die Browser die Oberfläche neu. Ein laufender Timer liegt in PostgreSQL und bleibt zeitlich durchgehend bestehen.
- Der erste Sprung bekommt einen eigenen Bootstrap-Befehl, weil Version 0.1 noch kein Updateskript enthält. Danach lässt sich das mitgelieferte Updateskript verwenden.

## Technische Verträge der Ausbauschritte

Kontoverwaltung, Authentifizierung, Timer, Buchungsziele und Nachweise bleiben getrennte Fachmodule. HTTP-Routen prüfen Eingabeformen; fachliche Entscheidungen liegen im Modul; SQL erhält den Kontokontext aus der geprüften Sitzung. Wiederholbare Timeraufträge behalten denselben Auftragsschlüssel und konkurrierende Änderungen benötigen die gelesene Fassung.

Einladungs- und Rücksetzlinks enthalten zufällige Einmalwerte; die Datenbank speichert deren Hash und Ablauf. Erneutes Senden entwertet den vorherigen Link. SMTP meldet Zustellfehler sichtbar; ein erfolgreicher Versand wird nicht simuliert. Geheimnisse werden im Container konfiguriert und nicht ins Repository geschrieben.

Die Erweiterung erhält nur die Berechtigung für die konfigurierte Timereal-Adresse. Sie liest keine anderen Tabs aus. Die Anmeldung bindet den Einmalcode an PKCE und ein exakt zugelassenes Rücksprungziel. Offline gestartete Wechsel werden nicht still rückwirkend gebucht; nach der Verbindung wird der aktuelle Timerstand angezeigt und der Wechsel bestätigt. Größere Funktionen sind über eine eigene Erweiterungsseite erreichbar.

Öffentlicher Zugriff und externe Sicherung benötigen die tatsächliche Domain, den erreichbaren Reverse Proxy beziehungsweise Ports sowie SMTP- und Sicherungsziel-Konfiguration. Die Software liefert Einrichtung, Prüfmodus und Diagnose; die Aktivierung auf Lars' Infrastruktur und der Mailversand an echte Berater erfolgen durch Lars.

## Späterer Ausbau

Lars hat am 19. November 2026 die zusätzlichen Themen ausdrücklich für später vorgemerkt. Ihr Umfang und der vorhandene Ausgangsstand stehen im [Backlog](BACKLOG.md).

## Bildmaßstab und Auslieferungsnachweis

Die Bilder 01–05 und 07 sind freigegeben. Lars hat am 18. November 2026 auch die ergänzenden Bilder 06 und 08 mit „Bildentwürfe freigeben (empfohlen)“ zur Umsetzung freigegeben. Bild 08 zeigt Verwaltung, Woche, Einstellungen und Erweiterung mit ausdrücklich illustrativen Beispieldaten. Keine dieser Abbildungen ist ein Funktionsnachweis.

Pro Version dokumentiert `CHANGELOG.md` den tatsächlich ausgelieferten Umfang. Tests verwenden echte PostgreSQL-Rollen und für Mail einen lokalen SMTP-Empfänger. Sichtprüfungen verwenden die programmierte Oberfläche. Der bestehende LXC ist erst aktualisiert, nachdem Lars den veröffentlichten Updatebefehl dort erfolgreich ausgeführt hat.

Am 19. November 2026 hat Lars die Footerbilder 09 für Laptop und Smartphone mit „Footer wie im Bild umsetzen (empfohlen)“ freigegeben.
