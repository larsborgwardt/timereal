# Backlog — offene Arbeit

Lars hat am 19. November 2026 die Umsetzung der Designprüfung und der offenen Punkte einschließlich Release beauftragt. Die Lieferpakete und Bildentscheidungen stehen im [Releaseplan](RELEASEPLAN.md).

## Nächste Lieferpakete

| Version / Thema | Ziel | Stand und nächster Schritt |
|---|---|---|
| 0.8.1 — Benutzer und Rollen | Berater, Betrieb und Administrator mit abgegrenzten Rechten | Bestehende Einladungen und Sperren weiterverwenden. Kontenbilder 11 sind durch D-RELEASE-004 freigegeben. Rollenwechsel und Schutz des letzten Administrators vor dem Bau verbindlich beschreiben. |
| 0.8.2 — Audit-Protokoll | Sicherheits- und Verwaltungsereignisse lesbar machen | Buchungshistorie besteht. Auditbilder 11 sind durch D-RELEASE-005 freigegeben. Vereinbart: Administratoransicht, 180-Tage-Lesefenster, Export ohne Buchungstexte und Zugangsdaten. Aufbewahrung gesondert festlegen. |
| 0.9.0 — Eigenes Konto und 2FA | Profil bearbeiten und Zwei-Faktor-Anmeldung mit Wiederherstellung | Passwortwechsel, E-Mail und Sitzungsverwaltung bestehen. Überarbeitete [Kontoübersicht](mockups/13-profil-1280.png), [Einrichtung mobil](mockups/13-authenticator-390.png) und [Wiederherstellungscodes](mockups/13-codes-1280.png) durch D-RELEASE-006 freigegeben. |
| 0.9.0 — Browsererweiterung | Neuen Anmeldevertrag übernehmen; weitere Browser- und Alltagstests | Chromium-Timer, Notizen und eigene widerrufbare Sitzung bestehen seit 0.5.0. Firefox, Safari/WebKit, Vertriebsweg und Store-Veröffentlichung bleiben gesondert zu qualifizieren. |

## Umfang von 0.7.0

Designkorrekturen der vorhandenen Web-App und Chromium-Erweiterung sowie **Verwaltung → Updates / Domainzugriff** sind implementiert. Prüfungen und deren Grenzen: [Designprüfung](DESIGNPRUEFUNG.md), [Betriebsvertrag](ADMIN-BETRIEB.md), [Releasebelege](nachweise/0.7.0.md). Ein bestehender Container braucht für den Betriebsdienst zunächst das Konsolenupdate auf 0.7.0. Die Veröffentlichung eines Releases aktualisiert Lars' LXC nicht automatisch.

## Systemkonsole in 0.8.0

Die freigegebene Konsole ist mit echter Journalquelle umgesetzt: Quelle, Level, Suche, Live-Pause, Aktualisierung und Download. API-/Berechtigungs-, Browser- und native Dienstprüfungen sind im [Releasebeleg](nachweise/0.8.0.md) dokumentiert. Der [Betriebsvertrag](ADMIN-BETRIEB.md#systemkonsole-ab-080) beschreibt die Grenzen des Journalausschnitts. Rollen und Audit folgen mit den Freigaben D-RELEASE-004 und D-RELEASE-005.

Speicherknappheit, ein echter `pg_dump`-Fehler und ein nicht startbarer Vorgänger wurden mit 0.8.0 im nativen Prüfgast erzwungen und geprüft; siehe Releasebeleg.

## Noch offene Betriebs- und Gerätenachweise

| Thema | Abgrenzung / nächster Nachweis |
|---|---|
| Proxmox-LXC-Pilot | Neue 0.7.0-Betriebsfunktionen wurden im eigenen Debian-13/systemd-Prüfgast gemessen. Update auf Lars' LXC und externer Domainaufruf erfolgen durch Lars. |
| Geräte und Hilfstechnik | VoiceOver-Ausgabe, physische Touchgeräte und Safari/WebKit sind nicht geprüft. Firefox 159 ist für den Konsolenablauf geprüft; die übrigen Ansichten und die Firefox-Erweiterung bleiben offen. |
| Aufbewahrung der Betriebsaufträge | Root-eigene Aufträge und Konfigurationssicherungen bleiben erhalten. Wartungsweg für die endlichen Bestandsgrenzen planen; keine stillschweigende Löschung. |

Die Repository-Präsentation ist seit `c3999a5` auf `main` veröffentlicht und wird mit den jeweiligen Releases nachgezogen.
