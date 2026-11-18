# Änderungen

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
