# Betrieb im Testcontainer

Die App läuft als `timereal_app`, HTTPS als `timereal_proxy`. PostgreSQL prüft die lokale Dienstidentität am Unix-Socket. Das erste Konto wird bei der Installation angelegt. Weitere Konten lassen sich aus der Root-Konsole verwalten. Das Passwort wird verdeckt eingelesen.

```bash
cd /opt/timereal
read -r -p 'Anmeldename: ' login
read -rs -p 'Passwort: ' pass && echo
printf '%s' "$pass" | runuser -u postgres -- env PGDATABASE=timereal /opt/timereal-node/bin/node dist/konto-cli.js anlegen "$login"
unset pass
```

Mit `passwort` statt `anlegen` änderst du ein Passwort und widerrufst bestehende Sitzungen. Zum sofortigen Sperren oder Entsperren nimm `sperren` bzw. `entsperren` und den Anmeldenamen, ohne Passworteingabe.

## Sichern und wiederherstellen

Der Installer aktiviert eine tägliche Sicherung um 03:15 Uhr in der Gastzeitzone. Fertige Dumps liegen in `/var/lib/timereal-backups`. Dateien älter als 14 Tage werden nach einer erfolgreichen neuen Sicherung entfernt. Ein sofortiger Probelauf ist mit `systemctl start timereal-backup.service` möglich.

Eine zusätzliche manuelle Datenbanksicherung in der Root-Konsole:

```bash
umask 077
runuser -u postgres -- pg_dump -Fc timereal > "/root/timereal-$(date +%F-%H%M%S).dump"
```

Sichere die Datei außerhalb des Containers vertraulich. Sie enthält Kundenarbeit und Passworthashes. Der PostgreSQL-Dump enthält Rollen nicht. Für einen neuen Testgast schafft die Installation die Rolle `timereal_app`. Zur Probe lässt sich der Dump dort in eine **separate, leere Datenbank** zurücklesen:

```bash
runuser -u postgres -- createdb timereal_restore
runuser -u postgres -- pg_restore --single-transaction --exit-on-error -d timereal_restore < "$BACKUP"
runuser -u postgres -- psql -X -d timereal_restore -c 'SELECT count(*) FROM zeitabschnitt'
```

Setze `BACKUP` vorher auf den Pfad des Dumps. Für eine Sicherung des gesamten Gasts inklusive Zertifikatsvertrauen und Dienstkonfiguration ist zusätzlich eine verschlüsselt verwahrte Containersicherung sinnvoll. Nach einer tatsächlichen Rückkehr zu einem älteren Datenstand sind restaurierte Sitzungen zu widerrufen.

## Stand des Piloten

Der Installationsstand dient dem lokalen Testnetz. Eine öffentliche Adresse mit bestehendem Reverse Proxy, vertrauenswürdigem öffentlichem Zertifikat, automatisch zugestellten Einladungen und geplanten externen Sicherungen wird beim anschließenden Pilotbetrieb eingerichtet. Die Browsererweiterung folgt auf die Rückmeldung zum Arbeitstag.

## Erprobter Installationsstand

Am 17. November 2026 lief der Anwendungsstand `7fcf58b` im unprivilegierten Debian-13.7-LXC mit PostgreSQL 17.12 und Node.js 24.22.3. Der Erstinstallationsablauf endete mit Exitcode 0. HTTPS lieferte über die Container-IP mit der exportierten CA den Gesundheitsstatus. Systemd meldete Anwendung, HTTPS und Sicherungstimer aktiv.

Über zwei getrennte HTTPS-Sitzungen wurden Ticket A, Termin B und erneut Ticket A gestartet. Eine Wiederholung desselben Wechsels lieferte das ursprüngliche Ergebnis. Nach Pause und Fortsetzen war ein vierter Abschnitt vorhanden. Stopp beendete die Erfassung. Ein separater Chromium-Browser öffnete die Historie bei 390 Pixel Breite. Nach einem Neustart des Anwendungsdienstes blieben die Einträge vorhanden.

Eine vom Sicherungsdienst erzeugte Datei wurde in eine neue Datenbank zurückgespielt. Der Inhaltsvergleich von Konten, Kunden, Buchungszielen, Zeitabschnitten, Aufträgen und Sitzungen ergab keine Differenz.
