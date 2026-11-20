# Timereal — Betrieb im Adminbereich

**Fortgeschrieben für 0.9.5 am 20. November 2026 (D-RELEASE-015):** Die Domain kommt zur lokalen Adresse hinzu; Zugriffsbestätigung, Dreiminutenfenster und fristgesteuerte Rücknahme entfallen. Abschnitt „Domainwechsel“ beschreibt den neuen Ablauf.

**Fortgeschrieben für 0.9.4 am 20. November 2026 (D-RELEASE-014).** Die Bilder 18 ersetzen den bisherigen Ablauf mit erneuter Passworteingabe und manueller Zugriffsbestätigung. [Aktueller Prüfnachweis](nachweise/0.9.4.md).

Ursprünglicher Implementierungsstand 0.7.0 vom 19. November 2026. Grundlage: veröffentlichte Version 0.6.2, Commit `2e287287df539c8465567f2b9c95ddfb937100e1`. Der Auftrag umfasst Updates und die Einrichtung einer öffentlichen Domain in der Verwaltung. Lars hat die Bildvorlagen für Updates und Domainzugriff einschließlich Fortschritt und Zugriffsbestätigung mit „Bildentwürfe freigeben (empfohlen)“ zur Umsetzung freigegeben. Die bereits abgenommenen Verwaltungs- und Footerbilder bleiben der Gestaltungsmaßstab. Die Implementierung und ihre tatsächlich ausgeführten Prüfungen sind im [Auslieferungsnachweis](nachweise/0.7.0.md) getrennt von offenen Messungen dokumentiert.

## Bedienung

**Ergänzung 0.7.2:** „Status aktualisieren“ unter Updates umgeht den Versionscache und fragt GitHub neu ab. Das Ergebnis steht anschließend auch dem Footer zur Verfügung. Die Prüfung ist auf einen Versuch je Minute pro Serverprozess begrenzt; gesperrte oder widerrufene Sitzungen, Berater und Erweiterungssitzungen können sie nicht auslösen. Eine abgeschaltete Versionsprüfung bleibt abgeschaltet. Vor 0.7.2 liest der Knopf nur den bisherigen Cache; der einmalige Übergang ist in der [Betriebsanleitung](betrieb/README.md#versionsfooter-und-updateprüfung-ab-062) beschrieben.

Unter **Verwaltung** stehen die Bereiche **Konten**, **Updates**, **Domainzugriff** und ab 0.8.0 **Systemlogs**. Persönliche Einstellungen bleiben unter Einstellungen. Ab 0.8.1 sind Betriebsaktionen für Betrieb und Administratoren vorgesehen. Konten und Einladungen bleiben Administratoren vorbehalten. [Rollenvertrag](ROLLEN.md).

### Systemkonsole ab 0.8.0

Die freigegebenen Bilder 12 (D-RELEASE-003) sind die Grundlage der Konsolenansicht. Sie liest das echte systemd-Journal ausschließlich für `timereal.service`, `timereal-betrieb.service` und `timereal-https.service`. Eine gültige Websitzung von Betrieb oder Administrator ist erforderlich; die Browsererweiterung bietet diesen Bereich nicht an.

Quelle, Level und Freitext werden mit „Filtern“ angewendet. Die Suche ignoriert Groß-/Kleinschreibung und arbeitet auf bereits bereinigten Meldungen. Live fragt im sichtbaren Bereich ungefähr alle zwei Sekunden ab. Pause beendet Folgeabrufe auch bei Fensterwechsel; ein bereits laufender Abruf darf noch enden. „Aktualisieren“ funktioniert weiterhin. Ohne automatisches Scrollen bleibt die Leseposition erhalten. „Herunterladen“ exportiert genau den zuletzt angezeigten gefilterten Stand als UTF-8-Text. Bei Verbindungsfehler bleibt ein zuvor geladener Stand mit ausdrücklichem Fehlerhinweis erhalten. Abmelden löscht den Stand aus der Oberfläche.

Der Journalabruf ist auf die jüngsten 500 Einträge innerhalb von 24 Stunden begrenzt; Filter durchsuchen diesen Ausschnitt. Es wird weder eine vollständige Historie noch eine Aufbewahrungsdauer zugesagt. Journald verwaltet den tatsächlichen Speicher. Binäre oder ungültige Datensätze werden ausgelassen, Texte auf 2.048 UTF-8-Bytes begrenzt, der Antwortinhalt auf unter 1 MiB beschränkt. Anzahl und Auslassungen stehen in der Ansicht. Der Betriebsdienst bündelt gleichzeitige Abrufe und hält einen gemeinsamen Snapshot höchstens zwei Sekunden vor; Prozesslaufzeit und Rohantwort sind begrenzt.

| Level | Herkunft |
|---|---|
| `all` | Keine Einschränkung auf einen Level |
| `fatal` | Journalpriorität 0–2 oder ausdrückliche schwere Betriebsstörung |
| `error` | Journalpriorität 3 oder strukturierte Fehlermeldung |
| `warn` | Journalpriorität 4 oder strukturierte Warnung |
| `info` | Journalpriorität 5–6, Startmeldungen oder unbekannte Priorität |
| `debug` | Journalpriorität 7 oder strukturierte Diagnosemeldung |
| `success` | Eigenes Timereal-Ereignis nach erfolgreicher Vorbereitung/Prüfung |
| `complete` | Eigenes Timereal-Ereignis nach abgeschlossenem Update bzw. eingerichteter Domain |

Es gibt keine Befehlszeile zur Ausführung eigener Kommandos. Filter ändern keine Prozessargumente. Die Web-App erhält keine Journalgruppe oder sudo-Rechte; ausschließlich der vorhandene Betriebsdienst ruft `journalctl` mit festen Dienstnamen auf. Strukturierte Meldungen liefern nur `msg` und einen geprüften Level; Request-, Header-, Body- und Stackfelder werden verworfen. Bekannte Passwort-/Token-/Cookie-/URL-Muster, Terminalsteuerung und private Schlüssel werden bereinigt. Das ist keine Garantie, beliebige Geheimnisse in frei formulierten Fremdmeldungen erkennen zu können. Eigene Start-/Abschlussmeldungen enthalten keine Nutzereingaben. Anzeige und Download verwenden denselben bereinigten Snapshot, ohne dauerhafte Speicherung im Browser.

Technische Grundlagen: [journalctl, Matching und JSON-Ausgabe](https://www.freedesktop.org/software/systemd/man/latest/journalctl.html), [Journalfelder und vertrauenswürdige Dienstzuordnung](https://www.freedesktop.org/software/systemd/man/latest/systemd.journal-fields.html). Prüfungen: [0.8.0](nachweise/0.8.0.md).

### Updates

1. Installierte und neu verfügbare stabile Version anzeigen; Änderungsnotizen öffnen. Ein Abruffehler heißt „Prüfung derzeit nicht möglich“, nicht „Aktuell“.
2. **Update starten** lädt das konkrete Release und baut es in einem eigenen Verzeichnis. Ab 0.9.6 muss der Release-Tag mit dem Schlüssel aus `betrieb/release-signierer` der bereits installierten Version signiert sein; ein unsignierter, fremd signierter oder umbenannter Tag bricht vor dem Bau ab. Bau und Tests des neuen Stands laufen unter dem Dienstkonto `timereal_build` ohne root-Rechte und ohne Datenbankzugang. Die Anwendung bleibt in dieser Phase nutzbar. Rechte, Speicherplatz und Versions-/Schemakompatibilität werden geprüft. Ein Konflikt mit einer anderen Betriebsaktion wird angezeigt.
3. Nach erfolgreicher Vorbereitung geht derselbe Auftrag automatisch zur Sicherung und Installation über. Eine erneute Passworteingabe entfällt. Der Hinweis erklärt die kurze Unterbrechung für angemeldete Nutzer; laufende Timer behalten ihre zeitlichen Grenzen in PostgreSQL. Noch vorbereitete Altaufträge können mit „Vorbereitetes Update installieren“ fortgesetzt werden.
4. Der getrennte Betriebsdienst hält die Anwendung an, erstellt und prüft die Sicherung, migriert, schaltet das Release um und startet die Anwendung. Der horizontale Fortschrittsbalken zeigt abgeschlossene Phasen und den aktuellen Schritt. Erst die erfolgreiche Abschlussprüfung füllt ihn vollständig; er schätzt keine Restlaufzeit.
5. Während des Neustarts meldet die Oberfläche den vorübergehenden Verbindungsverlust und verbindet sich erneut. Browser schließen oder Seite neu laden startet keinen zweiten Auftrag. Ein erfolgreich gestarteter Auftrag läuft unabhängig vom Browser weiter.
6. Ergebnis mit Ausgangs-/Zielversion, Zeitpunkt und veranlassendem Konto anzeigen. Bei fehlgeschlagener Aktivierung wird zwischen „vorige Anwendung wieder erreichbar“ und „manuelle Wiederherstellung erforderlich“ unterschieden. Kein automatisches Zurückspielen eines alten Datenbankdumps.

### Domainwechsel

1. **Verwaltung → Domainzugriff** zeigt die tatsächlich konfigurierte öffentliche Adresse und das erkannte Proxy-Ziel. Die Domain wird ohne Protokoll oder Pfad eingetragen. Keine Festverdrahtung auf Lars' Domain.
2. **Domain speichern** validiert Namen und vorhandene Caddy-Konfiguration. Vorhandene Konfiguration muss einer unterstützten Vorlage entsprechen; eigene Änderungen werden nicht überschrieben. Containeradresse und Port werden aus dem Bestand abgeleitet, nicht als beliebige Netzwerkziele vom Browser übernommen.
3. Angezeigt wird, was der Betreiber am externen Proxy benötigt: HTTPS-Ziel samt Port, öffentlicher Host-Header und gültiges öffentliches Zertifikat. Timereal richtet keine fremden DNS-/Router-/Nginx-Konten ein. Eine lokale Probe wird nicht als externer Erreichbarkeitsnachweis ausgegeben.
4. Nach erfolgreicher Prüfung übernimmt derselbe Auftrag die Domain ohne weitere Passworteingabe. Der Betriebsdienst sichert Caddy-Konfiguration und `PUBLIC_ORIGIN`, übernimmt beide gemeinsam und prüft echte HTTPS-Antworten einschließlich nichtleerer Startseite, korrekter Health-Antwort und der Fehlerantwort 421 für einen nicht eingerichteten Hostnamen. Scheitert eine dieser lokalen Prüfungen, wird die vorherige Konfiguration wiederhergestellt.
5. Nach der Übernahme ist der Auftrag abgeschlossen. Timereal ist zusätzlich über die Domain erreichbar; schreibende Anfragen einer Websitzung sind von der eingerichteten Adresse und von der eigenen IPv4-Adresse zulässig (Herkunft und angefragter Host müssen dort übereinstimmen). Die Sitzung wird nicht zwischen den Adressen übertragen. Mail-Links verwenden die eingerichtete Adresse.
6. Eine Zugriffsbestätigung, das Dreiminutenfenster und die fristgesteuerte Rücknahme entfallen: Weil der lokale Zugang erhalten bleibt, kann ein Domainwechsel niemanden aussperren. Aufträge, die eine Version bis 0.9.4 im Zustand „Bestätigung ausstehend“ hinterlassen hat, behalten ihr bisheriges Verhalten einschließlich Rücknahme.

Der erste Umfang unterstützt den vorhandenen Timereal-LXC mit externem HTTPS-Proxy und lokaler IPv4-Adresse auf Port 443. Abweichende eigene Caddy-Konfigurationen werden als nicht unterstützt angezeigt. Ein neuer öffentlicher Direktbetrieb ohne vorgeschalteten Proxy bleibt über das bestehende HTTPS-Einrichtungsskript möglich und wird nicht still in einen anderen Betriebsmodus umgeschaltet.

### Mailversand ab 0.9.7

Entwurf 15 (D-RELEASE-009). **Verwaltung → Mailversand** ist nur für Administratoren sichtbar; Betrieb, Berater und Erweiterungssitzungen erhalten 403. Speichern verlangt das eigene Timereal-Passwort (begrenzt wie eine Anmeldung, zwölf Fehlversuche je zehn Minuten). Die Anwendung reicht die Eingaben über den Unix-Socket an den Betriebsdienst; er prüft die SMTP-Verbindung, schreibt `/etc/timereal/mail.json` atomar (root, Gruppe `timereal_app`, Modus 640) und lehnt einen veralteten Stand mit 409 ab. Das SMTP-Passwort wird nie zurückgegeben. Die Anwendung liest die Datei bei jedem Versand neu. `GET/PUT /api/v1/verwaltung/mail/einstellungen`, `POST /api/v1/verwaltung/mail/test`.

## Architektur und Vertrauensgrenzen

```mermaid
flowchart LR
  Browser[Betrieb oder Administrator im Browser] -->|HTTPS und Websitzung| Proxy[Vorhandener HTTPS-Zugang]
  Proxy --> API[Timereal API als timereal_app]
  API -->|Sitzung und Rolle| PG[(PostgreSQL)]
  API -->|Festes Auftragsprotokoll über Unix-Socket| Betrieb[Getrennter systemd-Betriebsdienst]
  Betrieb -->|Update| Release[Festes GitHub-Repository und Releaseverzeichnis]
  Betrieb -->|Sicherung und Migration| PG
  Betrieb -->|Domainwechsel| Config[Caddyfile und PUBLIC_ORIGIN]
  Betrieb --> Zustand[Dauerhafter Auftragsstand und Rückkehrinformationen]
```

- Die Web-App bleibt `timereal_app`, mit `NoNewPrivileges=true`, ohne sudo und ohne Schreibrechte an Systemkonfiguration oder Releasecode.
- Der neue Dienst verwendet einen lokalen Unix-Socket mit ausdrücklich gesetztem Modus `0660`, Besitzer root und Gruppe `timereal_app`. Verzeichnis und Dienstprogramm sind root-eigen und für die Web-App nicht beschreibbar. Kein zusätzlicher TCP-Port und keine direkte öffentliche Weiterleitung zum Dienst.
- Das Protokoll erlaubt vorbereiten, starten, Status lesen, Domain prüfen/übernehmen/bestätigen sowie ab 0.8.0 den begrenzten Journalabruf. Kein frei wählbarer Shellbefehl, Dateipfad, Git-Remote oder Umgebungsblock. Prozesse starten mit festen Argumenten und ohne Shellinterpolation.
- Die API bindet eine gültige Websitzung und prüft `betrieb_pruefen()`. Erweiterungs-Bearer, Berater, gesperrte Konten und widerrufene Sitzungen erhalten keinen Zugriff. Schreibzugriffe unterliegen der Origin-Prüfung. Rollen und Sitzung werden bei jeder Aktion erneut geprüft.
- Das Socketrecht ist eine bewusste Vertrauensgrenze: Ein vollständig übernommener Webprozess könnte erlaubte Betriebsaufträge anfordern. Deshalb begrenzt der Betriebsdienst selbst Quelle, Ziel, Übergänge und Argumente; er ist keine zweite unabhängige Benutzeranmeldung. Das Restrisiko wird nicht als vollständige Prozessisolation ausgegeben.
- Releasequelle bleibt `larsborgwardt/timereal`. Nur stabile semantische Versionen, kein Downgrade; Git-Tag und Commit werden bei Vorbereitung festgehalten und vor Aktivierung erneut verglichen. TLS und das Repository sind die Vertrauensbasis; ohne zusätzlichen Signaturvertrag wird keine Signaturprüfung behauptet.
- Ein gemeinsamer Betriebslock verhindert gleichzeitige Webupdates, Domainwechsel und Konsoleneingriffe. Wiederholungen mit demselben Auftragsschlüssel liefern denselben Auftrag; abweichende Nutzdaten zum selben Schlüssel werden abgewiesen.

## Auftrags- und API-Vertrag

Implementierte Endpunkte; bis auf die reine Versionsprüfung muss der Unix-Betriebsdienst eingerichtet sein:

| Endpunkt unter `/api/v1/verwaltung/betrieb` | Zweck |
|---|---|
| `GET /status` | Betriebsdienst erreichbar, aktuelle Konfiguration, jüngster Auftrag |
| `GET /logs` | Ab 0.8.0: bereinigter Journalausschnitt; optionale Filter `quelle`, `level`, `suche` (höchstens 200 Zeichen), `Cache-Control: no-store` |
| `POST /updates/pruefen` | Ab 0.7.2: berechtigte Websitzung, Origin-Prüfung, leeres JSON-Objekt; sofortige Versionsprüfung ohne root-Aktion; bei erneutem Versuch innerhalb einer Minute HTTP 429 mit `Retry-After` |
| `POST /updates/starten` | Ab 0.9.4: Release vorbereiten und automatisch installieren; Auftragsschlüssel |
| `POST /domain/speichern` | Ab 0.9.4: Domain prüfen und automatisch übernehmen; Auftragsschlüssel |
| `POST /updates/vorbereiten` | Festes stabiles Release prüfen und separat bauen; Auftragsschlüssel |
| `POST /updates/:id/installieren` | Vorbereitetes Ziel aktivieren; Auftragsschlüssel, ab 0.9.4 ohne erneutes Passwort |
| `POST /domain/pruefen` | Domain gegen Konfiguration prüfen; unveränderlichen Prüfvorgang erzeugen |
| `POST /domain/:id/uebernehmen` | Geprüfte Konfiguration anwenden; ab 0.9.4 ohne erneutes Passwort |
| `POST /domain/:id/bestaetigen` | Neuen Zugriff mit Betriebsberechtigung über die neue Origin anerkennen; ab 0.9.4 automatisch aus der Web-App |
| `POST /domain/:id/zuruecknehmen` | Nur für Altaufträge im Zustand „Bestätigung ausstehend“: Wechsel auf die gesicherte Konfiguration zurücknehmen |
| `GET /auftraege/:id` | Persistierten Fortschritt und begrenzten Ergebnisbericht lesen |

Aufträge haben UUID, Typ, Konto-ID, Ausgangs-/Zielstand, Auftragsschlüssel, Konfigurationsfingerabdruck, Zustand, Phase und Zeitpunkte. Für den Domainwechsel kommen Bestätigungsfrist und Referenz auf die gesicherte Konfiguration hinzu. Passwörter, Cookies und SMTP-Zugangsdaten werden nicht in den Auftrag geschrieben. Statusausgaben enthalten keine rohen Prozesslogs oder beliebigen Dateiinhalte.

Der root-eigene Zustandsbestand liegt unter `/var/lib/timereal-betrieb`. Austausch erfolgt atomar mit Datei- und Verzeichnissynchronisation. Ein erfolgreicher HTTP-Start antwortet erst nach dauerhafter Annahme mit `202` und Auftrags-ID. Scheitert die Zustellung an den Betriebsdienst, zeigt die API einen Fehler. Prozessausgabe wird nicht als Statusprotokoll geparst; Betriebsskripte erhalten strukturierte Phasen-/Ergebnisereignisse.

Updatezustände: `vorbereitung`, `bereit`, `sicherung`, `migration`, `neustart`, `erfolgreich`, `fehlgeschlagen`, `vorherige_version_aktiv`, `wiederherstellung_noetig`. Domainzustände: `geprueft`, `uebernahme`, `bestaetigung_ausstehend`, `erfolgreich`, `zurueckgesetzt`, `wiederherstellung_noetig`. Nach einem Dienst-/Hostneustart wird der tatsächlich aktive Stand geprüft, bevor ein terminales Ergebnis festgeschrieben wird. Ein unterbrochener Auftrag wird nicht blind erneut ausgeführt.

Der Betriebsdienst liegt außerhalb des aktiven App-Releasezeigers. Seine eigene Aktualisierung überlebt den gerade laufenden Auftrag: neuer Dienststand wird separat installiert, vorheriger bleibt für Rückkehr verfügbar; erst nach dauerhaftem Ergebnis wird der Dienst neu gestartet. `release.json` bindet Webupdates an `betriebProtokoll: 1` und `apiVersion: 1`. Ein inkompatibles Release wird mit einem Hinweis auf den Konsolenweg abgewiesen. Nach einem Abbruch während des Dienstwechsels wird auch der Hilfsdienst nachgezogen, bevor die Wiederherstellung als erfolgreich endet. Folgesprung und Abbruchfall wurden mit privaten Prüftags ausgeführt, nicht mit vorweg veröffentlichten Releases.

Aufträge und Wiederholungsschlüssel werden nicht automatisch gelöscht. Bei den Grenzen von 2.000 Aufträgen beziehungsweise 10.000 Schlüsseln verweigert der Dienst neue Aufträge und verlangt Wartung. Die Zahlen sind Begrenzungen des Auftragsbuchs, keine Aufbewahrungsfrist. Sicherungen unter `/var/lib/timereal-betrieb/sicherungen` können vertrauliche Konfiguration enthalten und bleiben root-eigen. Speicherverbrauch und Sicherung dieses Bestands gehören zum Containerbetrieb.

## Lieferfolge und Prüfungen

1. Bildfreigabe; danach Betriebsdienst und HTTP-Vertrag mit zuerst roten Verhaltenstests bauen.
2. Webupdate einschließlich automatischer Vorbereitung/Installation, Sitzungs- und Rollenprüfung, Idempotenz und Neustart verbinden.
3. Domainzugriff mit echtem Caddy/TLS: Anmeldung über Domain und lokale Adresse, Fehlerantwort für fremde Hostnamen, keine HTTP/3-Ankündigung, Rückbau bei fehlgeschlagener lokaler Prüfung.
4. Erstinstallation und Bootstrap aus 0.6.2 sowie Folgesprung im eigenen Debian-13/systemd-Prüfgast ausführen. Der Testgast ist getrennt von Lars' LXC.
5. Gegen das freigegebene Bild auf Laptop und Smartphone prüfen; Links, Tastatur, Fehler, Verbindungsverlust und 200 % Textgröße einschließen. Release erst nach grüner Prüfung veröffentlichen.

Die tatsächlich ausgeführten API-, Browser-, Zustands- und Debian-Betriebsproben stehen mit Befehlen und Ergebnissen im [Auslieferungsnachweis](nachweise/0.7.0.md). Eine Browserprobe mit ersetztem privilegiertem Betriebsschritt misst die Bedienung; die getrennte native Probe misst echte Dienste, PostgreSQL, TLS, Git und Rückbau. Das wird nicht als gemeinsamer Ende-zu-Ende-Browserlauf auf Proxmox ausgegeben. Zusätzliche Störungsproben für Speicherknappheit, einen echten `pg_dump`-Sicherungsfehler und einen ebenfalls nicht mehr startbaren Vorgänger sind im [Nachweis 0.8.0](nachweise/0.8.0.md) mit Exit 0 dokumentiert; Lars' externer Proxy wurde nicht verändert oder als funktionsfähig abgenommen.

**Einmaliger Umstieg:** Ein Container mit 0.6.2 enthält den Betriebsdienst noch nicht. Lars installiert 0.7.0 zunächst einmal über die Konsole; dabei werden die root-eigenen Dateien und systemd-Einheiten eingerichtet. Anschließend sind reguläre Updates und unterstützte Domainwechsel über die Verwaltung möglich. Bei nicht mehr erreichbarer Anwendung bleibt die Konsole ein Wiederherstellungsweg.

## Bilder und Quellen

Die für 0.9.4 freigegebenen [Laptop-](mockups/18-betrieb-1280.png) und [Smartphonebilder](mockups/18-betrieb-390.png) zeigen den vereinfachten Ablauf. Die historischen Bilder 10 unten dokumentieren die ursprüngliche Fassung. Die [HTML-Vorlage](mockups/10-admin-betrieb.html) zeigt illustrative Zustände, keine ausgeführten Betriebsaktionen. Versionswerte, Adressen und Prüfergebnisse in den Bildern sind Beispieldaten. Die Anwendung selbst wird damit nicht verändert.

- [Updates am Laptop](mockups/10-updates-desktop.png)
- [Domainzugriff am Laptop](mockups/10-domain-desktop.png)
- [Domainzugriff am Smartphone](mockups/10-domain-mobil.png)
- [Neustart während eines Updates](mockups/10-update-neustart.png)
- [Bestätigung der neuen Domain](mockups/10-domain-bestaetigen.png)

Technische Referenzen: [systemd.socket, SocketMode/SocketGroup](https://www.freedesktop.org/software/systemd/man/latest/systemd.socket.html), [Node.js 24, child_process](https://nodejs.org/docs/latest-v24.x/api/child_process.html). Vorhandene Integrationspunkte: `betrieb/update.sh`, `betrieb/proxy-einrichten.sh`, `betrieb/timereal.service`, `src/app.ts`, `src/konten-routen.ts`, `src/session.ts`.
