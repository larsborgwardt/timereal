# Backlog — offene Arbeit

## Aktuell beauftragt

| Thema | Ziel | Stand |
|---|---|---|
| Updates im Adminbereich | Version prüfen, Update mit Sicherung starten und Ergebnis nach Neustart wieder anzeigen | Für 0.7.0 geplant; [Architektur und Bedienentwurf](ADMIN-BETRIEB.md). Noch nicht in 0.6.2 enthalten. Einmalige Einrichtung des Betriebsdienstes über ein Konsolenupdate erforderlich. |
| Domainzugriff im Adminbereich | Öffentliche Domain hinter einem externen HTTPS-Proxy eintragen, prüfen und sicher übernehmen | Für 0.7.0 geplant; [Domainwechsel mit Rückkehrmöglichkeit](ADMIN-BETRIEB.md#domainwechsel). Das vorhandene Einrichtungsskript wird in den Ablauf eingebunden. |
| Apple-Design-Prüfung der gesamten App | Darstellung, Bedienung, Zustände, Tastatur und vergrößerten Text über die App und Erweiterung prüfen | Von Lars zusätzlich beauftragt; Bestandteil der Arbeit an 0.7.0. Ausgangspunkt sind die freigegebenen Bilder; [Prüfumfang](DESIGNPRUEFUNG.md). |

Die Repository-Präsentation wurde am 19. November 2026 mit Commit `c3999a5` auf `main` veröffentlicht: README mit echten Bildschirmbildern, Release-/Prüfstatus sowie getrennten Installations-, Update- und Domainanleitungen. Sie wird deshalb nicht als offene Funktion weitergeführt.

## Für später vorgemerkt

Diese Themen bleiben ausdrücklich für später vorgemerkt. Die Versionszuordnung erfolgt bei ihrem Zuschnitt.

| Thema | Gewünschter Ausbau | Ausgangspunkt |
|---|---|---|
| Benutzer und Rollen | Benutzerverwaltung und differenzierte Rollen/Berechtigungen | Verwaltung mit Administrator/Berater, Einladungen und Sperren besteht seit 0.3.0; Rollenmodell vor dem Ausbau abgleichen |
| Audit-Protokoll | Nachvollziehbare sicherheits- und verwaltungsbezogene Ereignisse | Fachliche Buchungshistorie besteht; gesonderte Einsicht und Aufbewahrung planen |
| Systemlogs | Filter nach `all`, `info`, `warn`, `error`, `debug`, `success`, `fatal`, `complete`; Freitextsuche; Liveansicht; Aktualisieren; Download | Systemdienst schreibt ins Journal; Oberfläche und Export noch einzuplanen. Standardlevel und fachliche Abschlusszustände bei der Planung unterscheiden |
| Eigenes Konto | Passwortänderung, Profil bearbeiten, Zwei-Faktor-Authentifizierung | Passwortwechsel, E-Mail-Adresse und Sitzungsverwaltung bestehen; Profilumfang und 2FA ergänzend planen |
| Browsererweiterung | Späteren Ausbau und Alltagstest als eigenen Backlogpunkt führen | Chromium-Grundversion mit gemeinsamem Timer, Notizen und widerrufbarer Sitzung besteht seit 0.5.0. Weitere Browser und Vertriebsweg werden beim Zuschnitt entschieden |

Für Protokolle werden Sichtrechte, personenbezogene Inhalte, Aufbewahrung und Exportbegrenzung im jeweiligen Architekturentwurf festgelegt. Für 2FA gehören Wiederherstellung und Verlust des zweiten Faktors zum Bedienablauf.
