# Timereal mit 100 gleichzeitig aktiven Nutzern

Seit Lars’ Entscheidung vom 20. November 2026 läuft dieses Lastprofil nur bei gezieltem manuellen Aufruf. Der bisherige automatische Kapazitätsjob ist ab 0.9.4 durch Gitleaks ersetzt. Die folgenden Messergebnisse bleiben historische Kapazitätsnachweise.

Auftrag von Lars, 19. November 2026. Ausgangspunkt: Release 0.5.0 (`ab7d980`). Umsetzung als 0.6.0; der bestehende Pilot wird anschließend über den versionierten Updater aktualisiert.

## Nutzer und Datenmodell

Ein `konto` ist ein Berater. Kunden, Buchungsziele, Zeitabschnitte und Timeraufträge tragen `konto_id`. Zusammengesetzte Fremdschlüssel verhindern fremde Zuordnungen; PostgreSQL-RLS begrenzt die Anwendung auf das aus der Sitzung ermittelte Konto. Ein Konto hat einen gemeinsamen Timer über seine Geräte. Verschiedene Konten dürfen gleichzeitig erfassen. Die Verwaltung erhält Kontometadaten, keine fremden Arbeitsnachweise.

Für 100 Nutzer bleibt diese Architektur erhalten: ein Node-Dienst, ein begrenzter Verbindungspool, eine PostgreSQL-Datenbank. 100 Browser erfordern keine 100 Datenbankverbindungen. Änderungen desselben Kontos bleiben serialisiert; unabhängige Konten sollen einander nicht blockieren. Redis, Datenbank-Sharding und zusätzliche App-Instanzen sind für diesen Lieferumfang nicht vorgesehen.

## Abnahmelast

- 100 angemeldete, gleichzeitig aktive Nutzer mit je 5.000 abgeschlossenen Abschnitten (500.000 insgesamt), verteilt auf 250 Tage; persönliche Kunden und Ziele.
- Echter HTTP-Zugriff auf einen separaten Node-Prozess mit eingeschränkter PostgreSQL-Anwendungsrolle; keine simulierten API-Antworten.
- Gleichzeitige Anmeldung, Start, Kundenwechsel, Pause, Fortsetzen und Stopp; Wiederholung desselben Auftrags sowie fremde Ziel- und Notizzugriffe.
- Regelmäßige Aktualisierung entsprechend dem Webclient alle zehn Sekunden. Der Ausgangstest mit 0.5 verwendet vier parallele Stammdaten-/Timeranfragen und anschließend Tag oder Woche. Ab 0.6 liefert eine gemeinsame Arbeitsstand-Anfrage Timer, Ziele, Profil und Kunden, gefolgt von Tag oder Woche. Die fachlichen Daten und die Zahl gleichzeitig aktiver Nutzer bleiben gleich. Synchronisierte Aktualisierungen prüfen die Lastspitze.
- Mindestens zwei Minuten Messbetrieb; Antwortzeiten getrennt für Anmeldung, Lesen und Schreiben. Ziel: keine unerwarteten Fehler, Lesen/Schreiben p95 unter 1.000 ms und p99 unter 2.000 ms; Anmeldung p95 unter 8.000 ms. Eine langsame Maschine wird als fehlgeschlagener Lastnachweis ausgewiesen, nicht mit höheren Grenzwerten passend gemacht.
- Datenprüfung nach der Last: Kontotrennung, ein aktiver Timer je Konto, konsistente Versionen, wiederholte Aufträge ohne zusätzliche Abschnitte, keine Überlappungen.

## Schutz bei Überlast und Betrieb

Verbindungswartezeit, Datenbanksperren und SQL-Laufzeit erhalten endliche Grenzen. Eine vorübergehend überlastete Datenbank liefert einen verständlichen 503-Fehler; die Oberfläche darf Schreibaufträge nicht automatisch wiederholen. Defekte Poolverbindungen werden verworfen, damit nachfolgende Konten keine fremde Transaktion übernehmen.

Einladungs- und Passwortlink-Anfragen werden je IP und Ziel auf zwölf Versuche pro zehn Minuten begrenzt, zusätzlich auf 200 Anfragen je IP. Verschiedene Berater hinter derselben Firmen-IP teilen damit nicht dasselbe kleine Zielkontingent. Der lokale Caddy ist der vertrauenswürdige Proxy; direkte entfernte Aufrufer können ihre Adresse nicht über Weiterleitungsheader ersetzen. Anmeldeversuche zählen je IP und normalisierter Loginadresse (zwölf pro zehn Minuten) und zusätzlich je IP über alle Loginadressen (2048 pro zehn Minuten). Ein ausgeschöpftes Kontingent trifft nur die IP, die es verbraucht hat; ist der Zählerspeicher voll, wird der älteste Zähler verdrängt und niemand abgewiesen. Die Zähler liegen im einzelnen App-Prozess; ein Neustart leert sie. Ein öffentlicher Mehrinstanzbetrieb benötigt ein zusätzliches, gemeinsam wirksames Schutzkonzept.

Einladungs- und Rücksetzlinks werden vor dem SMTP-Versand bestätigt gespeichert. Während der Mailzustellung bleibt keine Datenbanktransaktion offen. Eine Passwortanforderung wird beantwortet, bevor der Versand beginnt; die Antwortzeit hängt damit nicht davon ab, ob zur Adresse ein Konto existiert (ab 0.9.6). Scheitert der Versand oder endet der Prozess zwischen Speichern und Versand, kann die Einladung erneut gesendet beziehungsweise ein neuer Passwortlink angefordert werden; eine automatische Versandwarteschlange ist nicht implementiert.

Der Lastlauf zeichnet Versionen, Ressourcenbegrenzung, Datensatzmenge, Laufzeit, Antwortperzentile und Fehler auf. Er baut zunächst das Schema des 0.5-Piloten auf, füllt den Bestand und wendet anschließend die aktuellen Migrationen an. Inhaltssignaturen vor und nach der Migration müssen übereinstimmen. Der Messrechner ersetzt keinen Nachweis für Lars' tatsächlichen LXC, seine Datenträger oder seine Internetverbindung.

Technische Grundlagen: [node-postgres Pool](https://node-postgres.com/apis/pool), [PostgreSQL Zeitgrenzen](https://www.postgresql.org/docs/18/runtime-config-client.html).

## Umsetzung und Wiederholung

Release 0.6.0 ergänzt in Schema 6 Indizes für den aktiven Timer, abgeschlossene Zeiträume und Null-Minuten-Abschnitte. Die persönliche Zeitzone wird vor der Bereichsabfrage in UTC-Grenzen aufgelöst. Diese gebundenen Parameter ermöglichen PostgreSQL einen gezielten Indexzugriff unter RLS. Die Woche begrenzt ihren Bestand vor der Aufteilung auf die einzelnen Tage. RLS und zusammengesetzte Fremdschlüssel bleiben wirksam. Hintergrund dazu: [PostgreSQL RLS und Auswertungsreihenfolge](https://www.postgresql.org/docs/18/ddl-rowsecurity.html).

`GET /api/v1/arbeitsstand` liefert Timer, Ziele, Kunden und Profil in einer authentifizierten Transaktion. Bestehende Einzelendpunkte bleiben kompatibel. Web-App und aktualisierte Erweiterung verwenden den gemeinsamen Aufruf.

Reproduzierbar auf einem Testrechner mit Node.js 24 und Docker:

```bash
npm ci --ignore-scripts
bash tests/last.sh
```

Das Skript erzeugt eigene Datenbank- und API-Container, bindet sie nur an Loopback und beendet sie beim Verlassen. Es verwendet keine Pilotdatenbank. Der ausgegebene Nachweisordner enthält `ergebnis.json`, Abfragepläne, Ressourcenstichproben und den Inhaltsvergleich der Migration. Die Datei `zugang.json` enthält kurzlebige Testzugänge und ist nur lokal lesbar; sie gehört nicht in Veröffentlichungen oder CI-Artefakte. `LAST_SEKUNDEN` kann für längere Läufe erhöht werden; unter 120 Sekunden bricht der Test ab.

Die Ressourcenbegrenzung ist 1 CPU und 512 MiB für Node sowie 2 CPU und 1.536 MiB für PostgreSQL, ohne Swap. Für den nativen Debian-LXC empfehlen wir **4 vCPU, 4 GiB RAM und 32 GiB SSD**. Das ist eine Auslegung mit Reserve für Betriebssystem, HTTPS, Sicherungen und Schwankungen, keine pauschale Garantie für beliebige Lasten oder Datenträger. Gemessen werden 100 HTTP-Sitzungen mit dem Aktualisierungsrhythmus der App; Browser-Rendering, Internetlatenz und öffentlicher TLS-Zugang gehören nicht zu diesem Lastlauf.

## Messergebnis am 19. November 2026

Beleg: [`nachweise/kapazitaet-0.6.0/ergebnis.json`](nachweise/kapazitaet-0.6.0/ergebnis.json), erzeugt mit `bash tests/last.sh`, Exit 0. Das JSON trägt Laufzeit, Versionsangaben, Ressourcenlimits, Zähler und Grenzwertentscheidung. Der [Ausgangslauf](nachweise/kapazitaet-0.6.0/ausgang-0.5.0.json) verfehlte die Lese- und Schreibziele. Zwischenstände wurden nicht als Abnahme gewertet.

| Messgröße | Ausgang 0.5.0 | 0.6.0 |
|---|---:|---:|
| Lesen p95 | 2.550 ms | 382 ms |
| Lesen p99 | 3.350 ms | 442 ms |
| Schreiben p95 | 1.068 ms | 483 ms |
| Schreiben p99 | 1.181 ms | 538 ms |
| Gleichzeitige Anmeldung p95 | 6.017 ms | 4.220 ms |
| Unerwartete HTTP-Fehler | 0 | 0 |

Die festgelegten Antwortzeitgrenzen sind im 0.6-Lauf eingehalten. Die angefragten Arbeitsstände wurden auf ihre Kontozuordnung geprüft; nach dem Lauf waren Timerfassungen und Abschnittszahlen konsistent, Timer gestoppt und fremde Notizzugriffe wirkungslos. Der Anmeldesturm ist bewusst gesondert ausgewiesen: Passwortprüfung benötigt mehr CPU als eine bereits angemeldete Aktion.

`cmp nachweise/kapazitaet-0.6.0/bestand-vorher.txt nachweise/kapazitaet-0.6.0/bestand-nachher.txt` endet mit Exit 0. Der Vergleich erfasst Konto-, Kunden-, Ziel- und Zeitabschnittsinhalte des gefüllten Schema-5-Bestands vor und nach Migration 6. Die SQL-[Abfragepläne](nachweise/kapazitaet-0.6.0/abfrageplaene.json) wurden aus den echten Fachfunktionen unter der Anwendungsrolle mit RLS erhoben. Der Lastnachweis ist ein kurzer Funktion-/Kapazitätsnachweis; Dauerlast, Sicherung während Last und Lars' konkreter Proxmox-Host bleiben eigene Betriebsproben.
