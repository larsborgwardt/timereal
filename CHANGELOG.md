# Änderungen

## 0.2.0 — 19. November 2026

- Versionsauskunft unter `/api/v1/version`.
- Update auf einen festen Git-Tag mit vorheriger Prüfung, getrenntem Build, Datenbanksicherung und Umschaltung des Anwendungsdiensts.
- Rückkehr zur vorherigen Anwendung bei fehlgeschlagenem Start; keine automatische Überschreibung der Datenbank durch einen alten Dump.
- Der Bootstrap für den bestehenden 0.1-Piloten erhält Daten, Konfiguration und Test-CA.

## 0.1.0 — Timerpilot

Kunden und Buchungsziele, gemeinsamer Timer auf mehreren Geräten, Pause und Stopp, Leistungstexte, Historie und manuelle Übernahme. Native Installation im Debian-13-LXC mit PostgreSQL, HTTPS und täglicher lokaler Sicherung.
