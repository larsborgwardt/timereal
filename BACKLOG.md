# Backlog — offene Arbeit

Lars hat am 19. November 2026 die Umsetzung der Designprüfung und der offenen Punkte einschließlich Release beauftragt. Die Lieferpakete und Bildentscheidungen stehen im [Releaseplan](RELEASEPLAN.md).

## Kontosicherheit und Chromium-Erweiterung in 0.9.0

Die freigegebenen Bilder 13/14 sind umgesetzt: Anzeigename, bestätigte E-Mail-Änderung, Authenticator, Wiederherstellungscodes und Faktorverwaltung. Die Chromium-Erweiterung verwendet die neue vollständige Anmeldung und besitzt weiterhin eine separat widerrufbare Sitzung. [Vertrag](KONTOSICHERHEIT.md) · [Prüfbelege](nachweise/0.9.0.md).

Die Erweiterung wird als ZIP zum entpackten Laden veröffentlicht. Ein getrenntes Edge-Upload-Paket entfernt die im Partner Center abgelehnten Entwicklungsfelder. **Die Edge-Store-Veröffentlichung ist beauftragt und noch nicht fertig:** Nach dem Upload fehlen die von Microsoft vergebene Erweiterungs-ID, ihre konkrete Serverfreigabe für CORS und Anmelderücksprung sowie ein Anmeldetest der Store-Ausgabe. Es gibt keine pauschale Freigabe fremder Erweiterungs-IDs. [Upload-Anleitung](erweiterung/README.md#microsoft-partner-center). Firefox-Erweiterung und Safari/WebKit bleiben gesondert offen.

## Mailversand im Adminbereich

Von Lars beauftragt; Bildentwurf 15 freigegeben. SMTP ist im Release 0.9.0 bisher nur über `betrieb/mail-einrichten.sh` einrichtbar, obwohl die Web-App bereits Einladungen und E-Mail-Bestätigung verwendet. **Verwaltung → Mailversand** mit sicherer Passwortspeicherung, Prüfen vor Übernahme und Testmail ist in Arbeit und noch nicht ausgeliefert.

## Umfang von 0.7.0

Designkorrekturen der vorhandenen Web-App und Chromium-Erweiterung sowie **Verwaltung → Updates / Domainzugriff** sind implementiert. Prüfungen und deren Grenzen: [Designprüfung](DESIGNPRUEFUNG.md), [Betriebsvertrag](ADMIN-BETRIEB.md), [Releasebelege](nachweise/0.7.0.md). Ein bestehender Container braucht für den Betriebsdienst zunächst das Konsolenupdate auf 0.7.0. Die Veröffentlichung eines Releases aktualisiert Lars' LXC nicht automatisch.

## Benutzer und Rollen in 0.8.1

Berater, Betrieb und Administrator sowie Rollenwechsel sind implementiert. Der [Rollenvertrag](ROLLEN.md) beschreibt Kontotrennung, Sitzungswiderruf und den Schutz des letzten Administrators; [Prüfbelege](nachweise/0.8.1.md). Kontosicherheit ist im Paket 0.9.0 umgesetzt.

## Audit-Protokoll in 0.8.2

Die freigegebene Administratoransicht ist umgesetzt: Datum und Suchbegriff, Nachladen und JSON-Export. Das Protokoll erfasst die im [Audit-Vertrag](AUDIT.md) benannten Konto- und Sicherheitsereignisse. [Prüfbelege](nachweise/0.8.2.md). Das 180-Tage-Fenster begrenzt die Anzeige, nicht die physische Aufbewahrung.

## Systemkonsole in 0.8.0

Die freigegebene Konsole ist mit echter Journalquelle umgesetzt: Quelle, Level, Suche, Live-Pause, Aktualisierung und Download. API-/Berechtigungs-, Browser- und native Dienstprüfungen sind im [Releasebeleg](nachweise/0.8.0.md) dokumentiert. Der [Betriebsvertrag](ADMIN-BETRIEB.md#systemkonsole-ab-080) beschreibt die Grenzen des Journalausschnitts. Rollen und Audit sind in 0.8.1 beziehungsweise 0.8.2 ergänzt.

Speicherknappheit, ein echter `pg_dump`-Fehler und ein nicht startbarer Vorgänger wurden mit 0.8.0 im nativen Prüfgast erzwungen und geprüft; siehe Releasebeleg.

## Noch offene Betriebs- und Gerätenachweise

| Thema | Abgrenzung / nächster Nachweis |
|---|---|
| Systemlogs auf Lars’ v0.8.2 | Gemeldet: „Verbindung unterbrochen“ über die Container-IP. Der ergänzende Fehlertext fehlt; die Ursache auf dieser Instanz ist nicht belegt. Native Journalprüfungen ersetzen diese Diagnose nicht. |
| Diagnose vorübergehender 503 unter Last | Hauptzweig-CI 44553467620: erster Kapazitätsjob scheiterte beim Arbeitsstand, Wiederholung am unveränderten Commit bestand; Ursache nicht belegt. Fehlerpfad mit geheimnisfreiem Fehlercode und Zeitbezug sowie Ausgabebeleg bei vorzeitigem Lasttestabbruch ergänzen und den nächsten Fehler damit einordnen. [Releasebeleg](nachweise/0.8.2.md). |
| Proxmox-LXC-Pilot | Neue 0.7.0-Betriebsfunktionen wurden im eigenen Debian-13/systemd-Prüfgast gemessen. Update auf Lars' LXC und externer Domainaufruf erfolgen durch Lars. |
| Geräte und Hilfstechnik | VoiceOver-Ausgabe, physische Touchgeräte und Safari/WebKit sind nicht geprüft. Firefox 159 ist für den Konsolenablauf geprüft; die übrigen Ansichten und die Firefox-Erweiterung bleiben offen. |
| Aufbewahrung der Betriebsaufträge | Root-eigene Aufträge und Konfigurationssicherungen bleiben erhalten. Wartungsweg für die endlichen Bestandsgrenzen planen; keine stillschweigende Löschung. |
| Aufbewahrung der Audit-Ereignisse | Migration 8 erfasst neue Ereignisse; die Ansicht liest 180 Tage. Aufbewahrungsfrist und gesicherter Wartungsweg sind gesondert zu entscheiden, ohne automatische Löschung aus dem Lesefenster abzuleiten. |

Die Repository-Präsentation ist seit `c3999a5` auf `main` veröffentlicht und wird mit den jeweiligen Releases nachgezogen.
