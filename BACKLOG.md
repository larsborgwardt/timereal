# Backlog — spätere Versionen

Diese Themen sind ausdrücklich für später beauftragt; sie gehören nicht zum laufenden Paket für Domain-Patch, Versionsfooter und Updatehinweis. Die Versionszuordnung erfolgt bei ihrem Zuschnitt.

| Thema | Gewünschter Ausbau | Ausgangspunkt |
|---|---|---|
| Benutzer und Rollen | Benutzerverwaltung und differenzierte Rollen/Berechtigungen | Verwaltung mit Administrator/Berater, Einladungen und Sperren besteht seit 0.3.0; Rollenmodell vor dem Ausbau abgleichen |
| Audit-Protokoll | Nachvollziehbare sicherheits- und verwaltungsbezogene Ereignisse | Fachliche Buchungshistorie besteht; gesonderte Einsicht und Aufbewahrung planen |
| Systemlogs | Filter nach `all`, `info`, `warn`, `error`, `debug`, `success`, `fatal`, `complete`; Freitextsuche; Liveansicht; Aktualisieren; Download | Systemdienst schreibt ins Journal; Oberfläche und Export noch einzuplanen. Standardlevel und fachliche Abschlusszustände bei der Planung unterscheiden |
| Eigenes Konto | Passwortänderung, Profil bearbeiten, Zwei-Faktor-Authentifizierung | Passwortwechsel, E-Mail-Adresse und Sitzungsverwaltung bestehen; Profilumfang und 2FA ergänzend planen |
| Browsererweiterung | Späteren Ausbau und Alltagstest als eigenen Backlogpunkt führen | Chromium-Grundversion mit gemeinsamem Timer, Notizen und widerrufbarer Sitzung besteht seit 0.5.0. Weitere Browser und Vertriebsweg werden beim Zuschnitt entschieden |

Für Protokolle werden Sichtrechte, personenbezogene Inhalte, Aufbewahrung und Exportbegrenzung im jeweiligen Architekturentwurf festgelegt. Für 2FA gehören Wiederherstellung und Verlust des zweiten Faktors zum Bedienablauf.
