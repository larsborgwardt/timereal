# Betrieb im Testcontainer

Die App läuft als `timereal_app`, HTTPS als `timereal_proxy`. PostgreSQL prüft die lokale Dienstidentität am Unix-Socket. Das erste Konto wird bei der Installation angelegt. Weitere Berater werden ab 0.3.0 in der Webverwaltung eingeladen. Für die Wiederherstellung lassen sich Konten aus der Root-Konsole verwalten. Das Passwort wird verdeckt eingelesen.

```bash
cd /opt/timereal-current
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

## Stand ab 0.5.0

Der Installer beginnt weiterhin mit HTTPS im lokalen Testnetz. Öffentliches HTTPS, SMTP und externe Sicherungen sind über die unten beschriebenen Einrichtungsskripte verfügbar. Domain, Mailserver und Sicherungsserver werden vom Betreiber bereitgestellt. Die [Browsererweiterung](../erweiterung/README.md) lässt sich separat installieren.

## Erprobter Installationsstand

Am 17. November 2026 lief der Anwendungsstand `7fcf58b` im unprivilegierten Debian-13.7-LXC mit PostgreSQL 17.12 und Node.js 24.22.3. Der Erstinstallationsablauf endete mit Exitcode 0. HTTPS lieferte über die Container-IP mit der exportierten CA den Gesundheitsstatus. Systemd meldete Anwendung, HTTPS und Sicherungstimer aktiv.

Über zwei getrennte HTTPS-Sitzungen wurden Ticket A, Termin B und erneut Ticket A gestartet. Eine Wiederholung desselben Wechsels lieferte das ursprüngliche Ergebnis. Nach Pause und Fortsetzen war ein vierter Abschnitt vorhanden. Stopp beendete die Erfassung. Ein separater Chromium-Browser öffnete die Historie bei 390 Pixel Breite. Nach einem Neustart des Anwendungsdienstes blieben die Einträge vorhanden.

Eine vom Sicherungsdienst erzeugte Datei wurde in eine neue Datenbank zurückgespielt. Der Inhaltsvergleich von Konten, Kunden, Buchungszielen, Zeitabschnitten, Aufträgen und Sitzungen ergab keine Differenz.

## Versioniert aktualisieren (ab 0.2)

Die Befehle laufen in der Root-Konsole deines bestehenden Testcontainers. Sie aktualisieren den ursprünglichen Pilot direkt auf **0.7.2**. Ein neuer Container und Zwischeninstallationen sind nicht nötig. Die `&&`-Verknüpfung verhindert, dass nach einem fehlgeschlagenen Abruf ein älteres Skript ausgeführt wird.

```bash
git -C /opt/timereal fetch --tags origin &&
git -C /opt/timereal show v0.7.2:betrieb/update.sh > /root/timereal-update.sh &&
bash /root/timereal-update.sh --check v0.7.2 &&
bash /root/timereal-update.sh v0.7.2
```

Der Prüfaufruf unterbricht die Anwendung nicht. Der Updateaufruf baut zuerst separat. Erst für Sicherung und Migration wird die Anwendung kurz angehalten. Die laufende Zeit liegt in PostgreSQL und läuft nach dem Update weiter. Lade danach den Browser neu. Wenn du die Erweiterung verwendest, aktualisiere anschließend auch deren entpacktes Paket auf 0.7.2. Die Serveraktualisierung kommt zuerst. Die App-Version lässt sich über `/api/v1/version` prüfen.

Ab 0.6.1 zeigen Installation und Update nummerierte Schritte und eine Browser-Adresse mit ausdrücklichem Port. Der Updater liest dafür `PUBLIC_ORIGIN` aus `/etc/timereal/dienst.conf`; eine eingerichtete Domain oder ein abweichender Port bleibt sichtbar. Beim normalen LXC-Zugang steht beispielsweise `https://192.0.2.42:443` (Beispieladresse). 443 ist der HTTPS-Port, 3040 bleibt intern. Schon `--check` zeigt die konfigurierte Adresse und den Befehl zum eigentlichen Update. Es prüft dabei keinen externen Browserzugriff. Eine fehlende oder ungültige Adresse wird als Hinweis gemeldet und nicht durch eine vermutete IP ersetzt.

Beim Update sind die Vorbereitung mit noch laufender Anwendung und die Phase mit angehaltenem Dienst getrennt benannt. Die Ausgabe nennt Sicherung und Migrationsprotokoll. Bei Fehlern stehen Phase, Exitcode und der Befehl `journalctl -u timereal -u timereal-https -n 80 --no-pager` am Ende. Eine gescheiterte Startprüfung wird als Abbruch mit Ergebnis der Wiederherstellung gemeldet. Der Erfolgsabschluss prüft den Dienst im Container; öffne die ausgegebene Adresse anschließend auch auf deinem Endgerät.

Ab 0.7.0 ist **Verwaltung → Updates** der Einstieg für reguläre kompatible Folgeupdates. Die Vorbereitung lässt die App laufen; **Sichern und installieren** verlangt das aktuelle Administratorpasswort. Der Server führt den angenommenen Auftrag auch bei geschlossenem Browser weiter. Nach dem Neustart wird sein Ergebnis erneut angezeigt. Der Betriebsdienst prüft ein stabiles Release aus `larsborgwardt/timereal` und dessen Betriebsprotokoll. Die Browsererweiterung kann diese Aktionen nicht ausführen.

Als Konsolenweg für Folgeversionen dient `/opt/timereal-current/betrieb/update.sh` als Einstieg; neue Tags vorher wieder mit `git fetch --tags origin` abholen. Der Updateweg verwendet `/opt/timereal` nur als Git-Quelle, `/opt/timereal-releases` für gebaute Stände und `/opt/timereal-current` als aktiven Zeiger. `git pull` oder ein erneuter Aufruf von `install.sh` ist auf einer versionierten Installation kein Updateweg.

Sicherungen vor dem Update liegen getrennt von der täglichen Aufbewahrung unter `/var/lib/timereal-updates/`. Dort bleiben `before.dump`, die ursprünglichen Dienstdateien, Versionsangaben und das Migrationsprotokoll erhalten. Diese Verzeichnisse werden nicht automatisch gelöscht. Die HTTPS-Konfiguration, Zugangsdaten und Test-CA werden beim Update nicht ersetzt.

Bei einem Startfehler kehrt das Skript zur vorherigen Anwendung zurück. Additive Datenbankänderungen bleiben bestehen. Ein Stromausfall oder ein nicht startbarer alter Dienst erfordert die Prüfung der Ausgabe und des Verzeichnisses; ein automatisches Zurückspielen des Dumps findet nicht statt. Vor einer bewussten Rücksicherung müssen die seit dem Dump erfassten Zeiten gesichert und der Anwendungsdienst angehalten werden.

## Betriebsdienst ab 0.7.0

`timereal-betrieb.service` läuft getrennt von der Web-App. Er hört ausschließlich auf `/run/timereal-betrieb/dienst.sock`; es gibt keinen zusätzlichen öffentlichen Port. Die Anwendung bleibt unprivilegiert. Der Dienst akzeptiert fest definierte Update- und Domainaufträge; freie Shellbefehle sind über diese Oberfläche nicht möglich.

Dauerhafte Aufträge und Konfigurationssicherungen liegen root-eigen unter `/var/lib/timereal-betrieb`. Sie werden nicht automatisch entfernt und müssen bei der Speicherplanung berücksichtigt werden. Das Auftragsbuch begrenzt sich auf 2.000 Aufträge und 10.000 Wiederholungsschlüssel; beim Erreichen der Grenze verweigert es neue Aufträge. Konfigurationssicherungen können Geheimnisse enthalten. Nicht mit veröffentlichten Diagnoseausgaben teilen.

Bei „Betriebsdienst nicht erreichbar“ zuerst in der Root-Konsole prüfen:

```bash
systemctl status timereal-betrieb --no-pager
journalctl -u timereal-betrieb -n 80 --no-pager
```

Bei „manuelle Wiederherstellung erforderlich“ keine neue Aktion starten. Aktive Anwendung, gespeicherten Auftrag und Sicherung prüfen. Das System spielt einen alten Datenbankdump nicht automatisch zurück. Hinweise zu Fehlerfällen und zur geprüften Laufzeit stehen im [Releasebeleg](../nachweise/0.7.0.md).

## Berater einladen (ab 0.3.0)

Das erste bei der Installation angelegte Konto ist Administrator. Nach dem Update erscheinen **Verwaltung** und **Einstellungen**. In der Verwaltung kannst du andere Berater per E-Mail einladen, offene Einladungen erneut senden oder widerrufen und Beraterkonten sperren. Eine Sperre beendet einen laufenden Timer als prüfpflichtigen Abschnitt und widerruft die Sitzungen. Administratorkonten sind in dieser Ansicht gegen eine Sperre geschützt; die vorhandene Konten-CLI bleibt für die Wiederherstellung im Container verfügbar.

Richte zuerst SMTP in der Root-Konsole ein:

```bash
bash /opt/timereal-current/betrieb/mail-einrichten.sh
```

Das Skript fragt Server, Port, TLS, Absender und Zugang ab. Das Passwort wird verdeckt gelesen. Es prüft die SMTP-Verbindung ohne eine Einladung zu versenden, speichert die Konfiguration in `/etc/timereal/mail.json` (root, Gruppe timereal_app, Modus 640) und startet den Anwendungsdienst neu. Bei externen Servern muss TLS direkt oder über STARTTLS funktionieren. Ein nicht authentifizierendes lokales Relay ist für die lokale Prüfung möglich. Einladungen versendest du danach ausdrücklich über **Verwaltung → Berater einladen**.

Ein Einladungslink gilt 48 Stunden, ein Rücksetzlink 30 Minuten. Erneutes Senden entwertet den alten Einladungslink. Der Berater legt ein eigenes Passwort fest und meldet sich mit seiner E-Mail-Adresse an. In **Einstellungen** kannst du deinem bestehenden Pilotkonto eine E-Mail-Adresse zuordnen, dein Passwort ändern und Sitzungen einzeln abmelden. Nach einem Passwortwechsel oder einer Zurücksetzung werden die vorherigen Sitzungen ungültig.

## Vorhandener Nginx / Nginx Proxy Manager

Ab 0.7.0 wird die Domain unter **Verwaltung → Domainzugriff** eingerichtet. **Domain prüfen** zeigt das vorhandene HTTPS-Ziel mit Port an; **Domain übernehmen** verlangt das aktuelle Administratorpasswort. Öffne danach die neue Adresse, melde dich erneut an und bestätige den Zugriff innerhalb von drei Minuten. Ohne Bestätigung wird die vorherige Konfiguration serverseitig wiederhergestellt. Das funktioniert auch nach Schließen des Tabs; der Betriebsdienst liest die gespeicherte Frist bei einem Neustart erneut.

Timereal konfiguriert den eigenen Caddy-Dienst und `PUBLIC_ORIGIN`. Den vorgeschalteten Nginx-Host, DNS und das öffentliche Zertifikat konfigurierst du selbst. Die unterstützte Vorlage stammt aus dem Timereal-Installer; eigene Caddy-Anpassungen werden nicht überschrieben. Für die Wiederherstellung oder ältere Versionen bleibt der folgende Konsolenweg verfügbar. Proxy-Patch 2 wurde mit 0.6.2 eingeführt.

Ersetze Domain und lokale IPv4-Adresse durch deinen Bestand. Im LXC als root zuerst prüfen, danach anwenden:

```bash
bash /opt/timereal-current/betrieb/proxy-einrichten.sh --check zeit.example.org 192.0.2.42 &&
bash /opt/timereal-current/betrieb/proxy-einrichten.sh zeit.example.org 192.0.2.42
```

Der vorgeschaltete Proxy leitet auf `https://192.0.2.42:443` weiter und übergibt den öffentlichen Hostnamen. Für eine aktivierte Upstream-Zertifikatsprüfung muss er der Timereal-Test-CA vertrauen; der Patch deaktiviert keine Zertifikatsprüfung. Das öffentliche Zertifikat bleibt beim vorgeschalteten Proxy. Port 3040 bleibt an Loopback gebunden.

Der Patch ergänzt die öffentliche Domain im Caddy-Siteblock und setzt `PUBLIC_ORIGIN`. Er sichert die vorherige Konfiguration unter `/var/lib/timereal-proxy-wechsel`, validiert Caddy und prüft nach dem kurzen Dienstneustart HTTPS über Domain sowie lokale IP. Die Startseite muss mit öffentlichem Hostnamen Inhalt liefern; ein leeres HTTP 200 gilt nicht als Erfolg. Bei einem Fehler wird die vorherige Konfiguration zurückgespielt und deren Erreichbarkeit geprüft. Proxy-Patch 2 setzt vor geplanten Neustarts die systemd-Startzähler zurück, damit schnelle Konfigurationswechsel den Rückbau nicht durch eine Startsperre verhindern. `--check` startet die Dienste nicht neu. Ein identischer Folgeaufruf benötigt ebenfalls keinen Neustart.

Für einen Domainwechsel denselben Befehl mit dem neuen DNS-Namen ausführen. Die bisherige öffentliche Domain wird ersetzt, die lokale IP bleibt erhalten. DNS-Namen werden kleingeschrieben und ohne Protokoll, Port oder Pfad übergeben; internationale Namen in Punycode-Schreibweise. Diese Variante verwendet Port 443 und eine lokale IPv4-Adresse. Die Anmeldung und die Erweiterung anschließend über die neue öffentliche Domain verwenden. Der IP-Zugang bleibt für Diagnoseabrufe verfügbar; Schreibanfragen von der alten Adresse werden durch die Herkunftsprüfung abgewiesen.

Die Befehle oben verwenden das Proxy-Skript aus der aktiven Installation. Für die einzelne Verwendung ohne Anwendungsupdate lade das Skript aus dem festen Git-Tag `v0.6.2` herunter und verwende seinen lokalen Dateipfad.

Die Nachprüfung des Skripts erfolgt innerhalb des Containers. Öffne anschließend die öffentliche Domain auch außerhalb deines lokalen Netzes, um die Nginx-/Routerstrecke zu prüfen. Der [ursprüngliche Prüfnachweis](../nachweise/proxy-patch-1.md) und die [Ergänzung für 0.6.2](../nachweise/0.6.2.md) beschreiben den getesteten Umfang.

## Öffentliches HTTPS direkt am Container

Richte den A-Eintrag deiner Domain auf den Anschluss des Containers. Ein vorhandener AAAA-Eintrag muss ebenfalls dorthin führen. Leite TCP 80 und 443 auf den Container weiter. Die Anwendung selbst bleibt auf Loopback-Port 3040. Caddy beschafft und erneuert das öffentliche Zertifikat; die Voraussetzungen beschreibt die [Caddy-Dokumentation](https://caddyserver.com/docs/automatic-https).

Ersetze `zeit.example.org` durch deine Domain und prüfe zuerst:

```bash
bash /opt/timereal-current/betrieb/https-einrichten.sh --check zeit.example.org
```

Danach umschalten:

```bash
bash /opt/timereal-current/betrieb/https-einrichten.sh zeit.example.org
```

Der Prüfmodus prüft Namensauflösung und Caddy-Konfiguration. Erst die Umschaltung prüft ein vertrauenswürdiges Zertifikat über die neue Adresse am lokalen HTTPS-Dienst. Bei einem Fehler werden die vorherigen Konfigurationsdateien zurückgespielt und der alte HTTPS-Zugang geprüft. Sicherungen liegen unter `/var/lib/timereal-https-wechsel`. Prüfe anschließend die neue Adresse zusätzlich vom Smartphone im Mobilfunknetz; dieser Test misst deine externe Router-/Firewallstrecke. Melde dich unter der neuen Adresse erneut an und verbinde die Erweiterung damit.

## Verschlüsselte externe Sicherung

Verwende ein **eigenes SFTP-Verzeichnis** außerhalb dieses Containers. Installiere `restic` und den SSH-Client:

```bash
apt-get update && apt-get install -y restic openssh-client
```

Richte für root einen SSH-Schlüssel zum Sicherungsserver ein. Vergleiche dessen Hostschlüssel-Fingerabdruck über einen vertrauenswürdigen Zugang und hinterlege ihn in `/root/.ssh/known_hosts`. Ein SSH-Alias in `/root/.ssh/config` kann Port und Schlüsseldatei festlegen. Das Skript erzwingt Schlüsselanmeldung und einen bereits vertrauten Hostschlüssel. Es akzeptiert keinen unbekannten Host automatisch.

Prüfe das echte Ziel, beispielsweise `sftp:backup@backup-host:/srv/timereal`:

```bash
bash /opt/timereal-current/betrieb/backup-einrichten.sh --check sftp:backup@backup-host:/srv/timereal
```

Für einen **neuen** Sicherungsbestand:

```bash
bash /opt/timereal-current/betrieb/backup-einrichten.sh neu sftp:backup@backup-host:/srv/timereal
```

Bei einem vorhandenen Restic-Repository verwende `vorhanden` statt `neu` und dessen Passwort. Die verdeckte Abfrage schreibt das Passwort in die nur für root zugängliche Konfiguration `/etc/timereal/extern`. Bewahre es zusätzlich außerhalb des Containers auf. Restic verschlüsselt den Bestand; ohne dieses Passwort ist eine Wiederherstellung nicht möglich. Grundlage: [Restic: Repository und SFTP](https://restic.readthedocs.io/en/stable/030_preparing_a_new_repo.html).

```bash
bash /opt/timereal-current/betrieb/extern-sichern.sh sichern
bash /opt/timereal-current/betrieb/extern-sichern.sh liste
bash /opt/timereal-current/betrieb/extern-sichern.sh check
bash /opt/timereal-current/betrieb/extern-sichern.sh pruefen latest
```

`sichern` überträgt Datenbankdump, PostgreSQL-Rollen, Anwendungskonfiguration, HTTPS-Zustand und Releaseangabe. `check` liest und prüft die verschlüsselten Datenblöcke. `pruefen` entschlüsselt einen Snapshot, prüft die Dateiinhalte und restauriert den Dump in eine eigens angelegte Datenbank. Diese Prüfdatenbank und lokale temporäre Klartextdateien werden anschließend entfernt; die aktive Datenbank wird nicht überschrieben. Statt `latest` lässt sich eine Kennung aus `liste` verwenden.

Der Timer `timereal-extern.timer` läuft täglich ab 03:30 Uhr mit bis zu 15 Minuten Streuung und holt verpasste Läufe nach. Fehler stehen in `journalctl -u timereal-extern.service`; `systemctl list-timers timereal-extern.timer` zeigt den nächsten Lauf. Ein gleichzeitig laufendes Update verhindert die Sicherung mit einer sichtbaren Fehlermeldung; sie kann danach manuell wiederholt werden. Externe Snapshots werden nicht automatisch gelöscht. Lege passend zum verfügbaren Speicher eine Aufbewahrung mit Restic fest; verwende dafür dessen `forget --dry-run`, bevor du etwas entfernst.

Bei Verlust des Containers: installiere denselben veröffentlichten Stand in einem Ersatzcontainer, richte SSH und Restic mit dem extern aufbewahrten Passwort ein und restauriere den gewünschten Snapshot mit `restic restore ... --target /root/wiederherstellung`. Der Snapshotpfad ist `/var/lib/timereal-extern/staging`. Prüfe zuerst mit `pruefen`. Stoppe vor einer bewussten Übernahme den Anwendungs- und HTTPS-Dienst; übernimm Datenbank und Konfiguration erst nach Sicherung des Ersatzbestands. `rollen.sql` enthält auch Rolleneigenschaften und gehört nur nach Prüfung in einen frischen PostgreSQL-Cluster. Restaurierte Sitzungen müssen vor der Wiederfreigabe widerrufen werden. SSH-Schlüssel und das Container-Betriebssystem sind nicht Teil dieser Anwendungssicherung.

## Kapazität ab 0.6.0

Für 100 gleichzeitig aktive Berater: unprivilegierter Debian-13-LXC mit **4 vCPU, 4 GiB RAM und 32 GiB SSD-Speicher**. Die zusätzliche Reserve gegenüber dem [begrenzten Lasttest](../KAPAZITAET.md) ist für Betriebssystem, HTTPS, Sicherungen und Lastschwankungen vorgesehen. Reale Datenträger und konkurrierende Gäste beeinflussen die Antwortzeit; ein zwei Minuten langer Lasttest ist kein Dauerbetriebsnachweis.

Der Node-Dienst verwendet standardmäßig höchstens zwölf Datenbankverbindungen. `TIMEREAL_DB_POOL_MAX=12` kann in `/etc/timereal/dienst.conf` gesetzt werden; erlaubt sind ganze Zahlen von 2 bis 32. Für die geprüfte Konfiguration bleibt der Standard unverändert. Nach einer bewussten Änderung ist `systemctl restart timereal` erforderlich. Mehr Verbindungen sind nicht automatisch schneller.

Die Anwendung begrenzt den Verbindungsaufbau beziehungsweise das Warten im Pool auf drei Sekunden, Sperrwartezeiten auf eine Sekunde und einzelne SQL-Anweisungen auf fünf Sekunden. Eine inaktive offene Transaktion endet nach zehn Sekunden. Bei vorübergehender Überlast erhält der Nutzer eine Fehlermeldung und lädt den aktuellen Stand, bevor er erneut handelt. Notizen und Timeraufträge werden nicht still im Hintergrund nachgeholt.

Das Update legt zusätzliche Indizes an. Bei einem großen Altbestand kann die Phase mit angehaltenem Dienst länger dauern. Vorher Speicher für Datenbank, Indexaufbau und Update-Dump bereithalten; externe Sicherungen getrennt aufbewahren.

## Versionsfooter und Updateprüfung (ab 0.6.2)

Der Footer zeigt die laufende Serverversion und verlinkt das GitHub-Repository. Ein neueres stabiles Release erscheint als „Update verfügbar: v…“ mit Link zu dessen Versionshinweisen. Ab 0.7.0 können Administratoren kompatible Folgeupdates unter **Verwaltung → Updates** vorbereiten und installieren; für ältere Installationen gilt der oben beschriebene einmalige Konsolenumstieg.

Die automatische Prüfung des Servers verwendet bei Bedarf `https://api.github.com/repos/larsborgwardt/timereal/releases/latest`, höchstens einmal innerhalb von sechs Stunden pro Prozess. Gleichzeitige Anfragen teilen denselben Abruf. Fehlgeschlagene Prüfungen werden erst nach 15 Minuten erneut versucht; ein Neustart leert den Cache. Die offene Oberfläche fragt stündlich und bei Rückkehr zum Tab den eigenen Server ab. Es werden keine Kundendaten, Buchungstexte, Anmeldenamen oder Sitzungsschlüssel an GitHub gesendet; GitHub sieht technisch die ausgehende Server-IP und einen allgemeinen User-Agent. Die Browserprüfung benötigt keine Verbindung des Endgeräts zu GitHub. Beim bewussten Öffnen des Repository-/Release-Links wird GitHub normal im neuen Tab geladen.

Ab **0.7.2** fragt **Verwaltung → Updates → Status aktualisieren** GitHub sofort neu ab und aktualisiert auch den Footer. Manuelle Prüfungen benötigen eine aktive Administrator-Websitzung und sind pro Serverprozess auf einen Versuch je Minute begrenzt. Die automatische Prüfung behält ihren Cache. Die Abschaltung der Versionsprüfung gilt auch für den manuellen Knopf.

Bei **0.7.0 oder 0.7.1** kann ein gerade veröffentlichtes Release noch bis zu sechs Stunden fehlen; auch der bisherige Knopf liest nur den Cache. Einmal `systemctl restart timereal` in der LXC-Konsole leert ihn. Danach die Seite neu laden und das Update in der Verwaltung installieren. Alternativ ist der oben beschriebene direkte Konsolenupdate auf 0.7.2 möglich.

Die Prüfung ist standardmäßig aktiviert. Zum Abschalten in `/etc/timereal/dienst.conf` die Zeile `TIMEREAL_UPDATE_CHECK=false` setzen und anschließend `systemctl restart timereal` ausführen. `true` aktiviert sie wieder; andere Werte führen beim Dienststart zu einer klaren Konfigurationsfehlermeldung. Das Updateskript erhält diese Konfiguration.

Die Version bleibt auch ohne GitHub erreichbar. „Updateprüfung nicht möglich“ ist kein Nachweis, dass die installierte Version aktuell ist. Falls bereits ein neueres Release bekannt war, bleibt der Hinweis mit dem letzten erfolgreichen Prüfzeitpunkt sichtbar. `/api/v1/updates` liefert diesen Zustand ohne Betriebsgeheimnisse. Ein Timeout nach fünf Sekunden und eine Größenbegrenzung verhindern unbegrenztes Warten auf GitHub.

Der Footer gehört zur Web-App. Die Chromium-Erweiterung hat eine eigene Paketversion; ihr weiterer Ausbau steht im Backlog.
