# Backlog — offene Arbeit

Lars hat am 19. November 2026 die Umsetzung der Designprüfung und der offenen Punkte einschließlich Release beauftragt. Die Lieferpakete und Bildentscheidungen stehen im [Releaseplan](RELEASEPLAN.md).

## Nächste Lieferpakete

| Version / Thema | Ziel | Stand und nächster Schritt |
|---|---|---|
| 0.9.0 — Eigenes Konto und 2FA | Profil bearbeiten und Zwei-Faktor-Anmeldung mit Wiederherstellung | Passwortwechsel, E-Mail und Sitzungsverwaltung bestehen. Überarbeitete [Kontoübersicht](mockups/13-profil-1280.png), [Einrichtung mobil](mockups/13-authenticator-390.png) und [Wiederherstellungscodes](mockups/13-codes-1280.png) durch D-RELEASE-006 freigegeben. Die ergänzenden Anmelde- und Verwaltungsabläufe 14 sind durch D-RELEASE-007 freigegeben. Baugrundlage: [technische Vorbereitung](KONTOSICHERHEIT.md). |
| 0.9.0 — Browsererweiterung | Neuen Anmeldevertrag übernehmen; weitere Browser- und Alltagstests | Chromium-Timer, Notizen und eigene widerrufbare Sitzung bestehen seit 0.5.0. Firefox, Safari/WebKit, Vertriebsweg und Store-Veröffentlichung bleiben gesondert zu qualifizieren. |

## Umfang von 0.7.0

Designkorrekturen der vorhandenen Web-App und Chromium-Erweiterung sowie **Verwaltung → Updates / Domainzugriff** sind implementiert. Prüfungen und deren Grenzen: [Designprüfung](DESIGNPRUEFUNG.md), [Betriebsvertrag](ADMIN-BETRIEB.md), [Releasebelege](nachweise/0.7.0.md). Ein bestehender Container braucht für den Betriebsdienst zunächst das Konsolenupdate auf 0.7.0. Die Veröffentlichung eines Releases aktualisiert Lars' LXC nicht automatisch.

## Benutzer und Rollen in 0.8.1

Berater, Betrieb und Administrator sowie Rollenwechsel sind implementiert. Der [Rollenvertrag](ROLLEN.md) beschreibt Kontotrennung, Sitzungswiderruf und den Schutz des letzten Administrators; [Prüfbelege](nachweise/0.8.1.md). Kontosicherheit bleibt das nächste Lieferpaket.

## Audit-Protokoll in 0.8.2

Die freigegebene Administratoransicht ist umgesetzt: Datum und Suchbegriff, Nachladen und JSON-Export. Das Protokoll erfasst die im [Audit-Vertrag](AUDIT.md) benannten Konto- und Sicherheitsereignisse. [Prüfbelege](nachweise/0.8.2.md). Das 180-Tage-Fenster begrenzt die Anzeige, nicht die physische Aufbewahrung.

## Systemkonsole in 0.8.0

Die freigegebene Konsole ist mit echter Journalquelle umgesetzt: Quelle, Level, Suche, Live-Pause, Aktualisierung und Download. API-/Berechtigungs-, Browser- und native Dienstprüfungen sind im [Releasebeleg](nachweise/0.8.0.md) dokumentiert. Der [Betriebsvertrag](ADMIN-BETRIEB.md#systemkonsole-ab-080) beschreibt die Grenzen des Journalausschnitts. Rollen und Audit sind in 0.8.1 beziehungsweise 0.8.2 ergänzt.

Speicherknappheit, ein echter `pg_dump`-Fehler und ein nicht startbarer Vorgänger wurden mit 0.8.0 im nativen Prüfgast erzwungen und geprüft; siehe Releasebeleg.

## Noch offene Betriebs- und Gerätenachweise

| Thema | Abgrenzung / nächster Nachweis |
|---|---|
| Proxmox-LXC-Pilot | Neue 0.7.0-Betriebsfunktionen wurden im eigenen Debian-13/systemd-Prüfgast gemessen. Update auf Lars' LXC und externer Domainaufruf erfolgen durch Lars. |
| Geräte und Hilfstechnik | VoiceOver-Ausgabe, physische Touchgeräte und Safari/WebKit sind nicht geprüft. Firefox 159 ist für den Konsolenablauf geprüft; die übrigen Ansichten und die Firefox-Erweiterung bleiben offen. |
| Aufbewahrung der Betriebsaufträge | Root-eigene Aufträge und Konfigurationssicherungen bleiben erhalten. Wartungsweg für die endlichen Bestandsgrenzen planen; keine stillschweigende Löschung. |
| Aufbewahrung der Audit-Ereignisse | Migration 8 erfasst neue Ereignisse; die Ansicht liest 180 Tage. Aufbewahrungsfrist und gesicherter Wartungsweg sind gesondert zu entscheiden, ohne automatische Löschung aus dem Lesefenster abzuleiten. |

Die Repository-Präsentation ist seit `c3999a5` auf `main` veröffentlicht und wird mit den jeweiligen Releases nachgezogen.
