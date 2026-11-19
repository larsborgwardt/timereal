# Backlog — offene Arbeit

Lars hat am 19. November 2026 die Umsetzung der Designprüfung und der offenen Punkte einschließlich Release beauftragt. Die Lieferpakete und Bildentscheidungen stehen im [Releaseplan](RELEASEPLAN.md).

## Nächste Lieferpakete

| Version / Thema | Ziel | Stand und nächster Schritt |
|---|---|---|
| 0.8.0 — Benutzer und Rollen | Berater, Betrieb und Administrator mit abgegrenzten Rechten | Bestehende Einladungen und Sperren weiterverwenden. Neue Rollenansicht wartet nach „Bildentwürfe zuerst ändern“ auf Bildfreigabe; Rollenwechsel und Schutz des letzten Administrators vor dem Bau verbindlich beschreiben. |
| 0.8.0 — Audit-Protokoll | Sicherheits- und Verwaltungsereignisse lesbar machen | Buchungshistorie besteht. Eigene Einsicht, Aufbewahrung und Exportgrenzen ergänzen; neuer Entwurf noch nicht freigegeben. |
| 0.8.0 — Systemkonsole | Fortlaufende Systemausgabe wie eine CLI: Quelle, Level, Freitextsuche, live, Aktualisieren und Download | [Laptopbild](mockups/12-systemkonsole-desktop.png) und [Mobilbild](mockups/12-systemkonsole-mobil.png) sind mit D-RELEASE-003 freigegeben. Echte Journalquelle anbinden. Keine beliebige Befehlsausführung. Gewünschte Level: `all`, `info`, `warn`, `error`, `debug`, `success`, `fatal`, `complete`; Journallevel und fachliche Abschlussereignisse im Vertrag unterscheiden. |
| 0.9.0 — Eigenes Konto und 2FA | Profil bearbeiten und Zwei-Faktor-Anmeldung mit Wiederherstellung | Passwortwechsel, E-Mail und Sitzungsverwaltung bestehen. Neue Kontosicherheitsansicht noch nicht freigegeben; Einrichtung, Verlust des Faktors und Recovery ausarbeiten. |
| 0.9.0 — Browsererweiterung | Neuen Anmeldevertrag übernehmen; weitere Browser- und Alltagstests | Chromium-Timer, Notizen und eigene widerrufbare Sitzung bestehen seit 0.5.0. Firefox, Safari/WebKit, Vertriebsweg und Store-Veröffentlichung bleiben gesondert zu qualifizieren. |

## Umfang von 0.7.0

Designkorrekturen der vorhandenen Web-App und Chromium-Erweiterung sowie **Verwaltung → Updates / Domainzugriff** sind implementiert. Prüfungen und deren Grenzen: [Designprüfung](DESIGNPRUEFUNG.md), [Betriebsvertrag](ADMIN-BETRIEB.md), [Releasebelege](nachweise/0.7.0.md). Ein bestehender Container braucht für den Betriebsdienst zunächst das Konsolenupdate auf 0.7.0. Die Veröffentlichung eines Releases aktualisiert Lars' LXC nicht automatisch.

## Noch offene Betriebs- und Gerätenachweise

| Thema | Abgrenzung / nächster Nachweis |
|---|---|
| Proxmox-LXC-Pilot | Neue 0.7.0-Betriebsfunktionen wurden im eigenen Debian-13/systemd-Prüfgast gemessen. Update auf Lars' LXC und externer Domainaufruf erfolgen durch Lars. |
| Weitere Fehlerfälle | Speicherknappheit, misslungene Datenbanksicherung und ein nicht mehr startbarer Vorgänger zusätzlich in nativer Laufzeit erzwingen; bisherige Startfehler-, Bootstrap- und SIGKILL-Proben im Releasebeleg. |
| Geräte und Hilfstechnik | VoiceOver-Ausgabe, physische Touchgeräte, Firefox und Safari/WebKit sind in der Chromium-Designmatrix nicht enthalten. |
| Aufbewahrung der Betriebsaufträge | Root-eigene Aufträge und Konfigurationssicherungen bleiben erhalten. Wartungsweg für die endlichen Bestandsgrenzen planen; keine stillschweigende Löschung. |

Die Repository-Präsentation ist seit `c3999a5` auf `main` veröffentlicht und wird mit den jeweiligen Releases nachgezogen.
