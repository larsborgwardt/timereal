# Architektur von Timereal

Die Web-App läuft auf einem eigenen Linux-Systemcontainer. Für den Pilot sind Backend und Datenbank getrennte Prozesse im selben Gast. Das Backend ist ein modularer Monolith in TypeScript mit Node.js und Fastify. Lern- und Wartungsaufwand bleiben überschaubar, weil ein Kundenwechsel in einer einzigen PostgreSQL-Transaktion abgeschlossen wird.

```mermaid
flowchart LR
  Laptop[Web-App am Laptop]
  Handy[Web-App am Smartphone]
  Popup[Browsererweiterung]
  subgraph LXC[Eigener unprivilegierter Debian-LXC]
    TLS[HTTPS · Caddy]
    API[TypeScript-API · Loopback]
    Auth[Zugang und Sitzungen]
    Ziele[Kunden und Buchungsziele]
    Timer[Timer und Tageskorrektur]
    Beleg[Historie und Übernahme]
    DB[(PostgreSQL · lokaler Socket)]
    TLS --> API
    API --> Auth
    Auth --> Ziele & Timer & Beleg
    Ziele & Timer & Beleg --> DB
  end
  Laptop & Handy -->|Sitzungscookie| TLS
  Popup -->|separat widerrufbare Sitzung| TLS
```

## Zuständigkeiten und Vertrauensgrenzen

| Stelle | Aufgabe |
|---|---|
| Oberfläche | Zeigt den vom Server gelesenen Zustand. Die laufende Anzeige berechnet sie aus der Startzeit. Datenbankkennung des Benutzers und Wechselzeit sind keine Eingaben des Clients. |
| Zugang | Das Passwort wird mit Salt und scrypt geprüft. Der Browser erhält ein zufälliges Sitzungstoken als HttpOnly-, Secure- und SameSite-Cookie. PostgreSQL speichert seinen SHA-256-Abdruck, Clientart, Ablauf und Widerruf. Änderungen über Cookie verlangen die konfigurierte HTTPS-Herkunft. |
| Servertransaktion | Prüft und sperrt das Konto und die Sitzung. Sie bindet die Konto-ID nur für diese Transaktion. Fehler rollen die Änderung zurück, bevor die Verbindung in den Pool zurückkehrt. |
| Fachmodule | Kundenanlage und Projektzuordnung liegen bei den Buchungszielen. Der Timer setzt Zeitgrenzen. Die Tageskorrektur bearbeitet bestehende Abschnitte. Die Nachweise berechnen den Übertragungsstand aus denselben Daten. |
| PostgreSQL | Die Dienstrolle besitzt keine Tabellen und hat keine RLS-Ausnahme. Eigentümerbezogene Fremdschlüssel, Zeilenrichtlinien und ein Ausschluss über Zeitintervalle sichern die Schreib- und Lesewege. Migration und Kontoverwaltung erfolgen mit eigener Berechtigung. |
| Betrieb | Der Webdienst lauscht auf Loopback. Die Datenbank nutzt Peer-Anmeldung am lokalen Socket. Der HTTPS-Dienst besitzt ein eigenes Betriebssystemkonto für die Test-CA. Der Installer richtet einen Zugang im Testnetz ein. |

## Einen Kunden wechseln

```mermaid
sequenceDiagram
    actor L as Laptop oder Handy
    participant A as API
    participant D as PostgreSQL
    L->>A: Wechsel zu B, gelesene Version, Auftragsschlüssel
    A->>D: BEGIN · Sitzung und Kontosperre prüfen
    A->>D: Kontokontext setzen und gespeicherten Auftrag lesen
    alt Derselbe Auftrag wurde schon bestätigt
        D-->>A: Ursprüngliches Ergebnis
    else Neuer Auftrag
        A->>D: Version und eigenes Ziel prüfen
        A->>D: Eine Serverminute bestimmen
        A->>D: Abschnitt A schließen, B öffnen, Version erhöhen
        A->>D: Ergebnis beim Auftrag speichern
    end
    A->>D: COMMIT
    A-->>L: Timerzustand mit Abschnitt-ID und Version
```

Der Client sendet beispielsweise `POST /api/v1/timer/wechsel`, den Header `Idempotency-Key` mit einer UUID und den JSON-Inhalt `{"version":"1","art":"zugeordnet","zielId":"42"}`. Ein Wechsel darf ein neues Buchungsziel einschließlich Kundenanlage im selben Auftrag enthalten. Scheitert der Wechsel, bleibt das vorherige Ziel aktiv und die Anlage wird zurückgerollt.

Ein konkurrierendes Gerät mit eigener UUID und derselben alten Version erhält HTTP 409. Es lädt mit `GET /api/v1/timer` den aktuellen Zustand. Eine verloren gegangene Antwort kann mit identischem Auftrag und identischer UUID erneut abgefragt werden, selbst wenn der Timer inzwischen weitergelaufen ist. Derselbe Schlüssel mit verändertem Inhalt ergibt 409. Ein fremdes Buchungsziel ergibt 404. Eine widerrufene Sitzung ergibt 401. Lesezugriffe anderer Konten sperren einander fachlich nicht.

## Timervertrag für beide Oberflächen

| Auftrag unter `/api/v1/timer/` | Vorher | Wirkung |
|---|---|---|
| `start` | Frei oder pausiert | Öffnet einen Abschnitt für das gewählte Ziel. Löst eine vorhandene Pause auf. |
| `wechsel` | Läuft | Schließt den bisherigen und eröffnet den neuen Abschnitt an derselben Grenze. |
| `pause` | Läuft | Schließt den Abschnitt und merkt dessen ID im Konto. Die Pause erzeugt keine Arbeitszeit. |
| `fortsetzen` | Pausiert | Beginnt einen eigenen Abschnitt für das vorgemerkte Ziel. |
| `stopp` | Läuft oder pausiert | Beendet die Messung und entfernt die Vormerkung. Ein späterer Start bleibt möglich. |

Für Notizen gilt `PATCH /api/v1/abschnitte/{id}/notiz` mit Leistungstext und gelesener Abschnittsfassung. So bleibt eine am Bildschirm begonnene Notiz beim richtigen Ticket, wenn auf einem anderen Gerät der Kunde wechselt. Die API verwendet Zeichenketten für IDs und Versionen.

## Pilot und anschließender Ausbau

Der erste Pilottest funktioniert ohne Mailserver. Die Konten werden im Gast angelegt. Ab Version 0.3.0 sind Einmal-Token mit Ablauf und Hash, Versand über SMTP, Passwortzurücksetzung und die Verwaltungsansicht für Kontosperren implementiert. Das Modul `konten` übernimmt die Fachlogik; `konten-routen` bindet sie an HTTP. Administrationsfunktionen in PostgreSQL geben Kontometadaten aus, ohne Zugriff auf fremde Kunden oder Zeiten zu gewähren. Die technische Sperre widerruft bereits Sitzungen und schließt einen laufenden Abschnitt als prüfpflichtig.

Ab Version 0.5.0 verwendet das Chromium-Popup dieselben HTML-/JavaScript-Module und Timer-/Notizbefehle wie die Web-App. Ein gemeinsamer Transportadapter ergänzt den Bearer-Zugang; die Fachlogik bleibt im Backend. Die Anmeldung bindet einen kurzlebigen Code an PKCE-S256, das feste Rücksprungziel der Erweiterungskennung und die weiterhin gültige Websitzung. Der Sitzungsschlüssel liegt adressgebunden im Sitzungsspeicher der Erweiterung und wird nach einem Browserneustart neu angefordert. Die Serverberechtigung wird beim Verbinden abgefragt; beim erfolgreichen Serverwechsel werden frühere Serverberechtigungen entfernt. Ein abgebrochener Verbindungsversuch ersetzt die bestehende Verbindung nicht.

Die Erweiterung liest keine Inhalte anderer Tabs. Nach einer ausgebliebenen Antwort sperrt sie weitere Schreibaufrufe, bis der Benutzer den Serverstand neu geladen hat. Die nächste Timeraktion wird bestätigt; eine frühere Anfrage wird nicht automatisch nachgeholt. Dieser Zustand bleibt beim Schließen des Popups erhalten. Der Server verwendet weiterhin Versionsprüfung und Auftragsschlüssel für konkurrierende Geräte und Wiederholungen.

Die Betriebsskripte liegen außerhalb der HTTP-Anwendung und benötigen root. Öffentliches HTTPS verwendet Caddy, eine externe Anwendungssicherung Restic über SFTP. Die Einrichtung gehört dem Betreiber; Zugangsdaten werden verdeckt eingelesen und nicht im Git-Bestand abgelegt. Einzelheiten und Grenzen stehen in der [Betriebsanleitung](betrieb/README.md).

## Gleichzeitige Nutzer und begrenzte Ressourcen

`GET /api/v1/arbeitsstand` liefert Timer, persönliche Ziele, Profil und Kunden innerhalb einer geprüften Kontotransaktion. Die Web-App und Erweiterung verwenden diesen gemeinsamen Abruf statt separater paralleler Anfragen für diese Daten. Die bisherigen Leseendpunkte bleiben für bestehende Clients verfügbar. Die gemeinsame Antwort enthält keine Passworthashes oder Sitzungsschlüssel.

Die Kapazitätsplanung für Version 0.6 steht in [KAPAZITAET.md](KAPAZITAET.md). Der Produktionspool nutzt standardmäßig zwölf PostgreSQL-Verbindungen, unabhängig von der Zahl angemeldeter Browser. `TIMEREAL_DB_POOL_MAX` lässt Werte von 2 bis 32 zu; ungültige Konfiguration verhindert den Start. Poolwartezeit (3 s), SQL-Laufzeit (5 s), Sperrwartezeit (1 s) und Leerlauf in einer offenen Transaktion (10 s) sind begrenzt. Diese Vorgaben gelten für die Anwendungsverbindungen; Migration und Sicherung verwenden eigene Verbindungen.

Bei einem solchen Engpass meldet die API HTTP 503 mit `Retry-After: 1`. Das ist keine Bestätigung einer Buchung. Der Nutzer lädt den aktuellen Zustand, bevor er erneut handelt; die bestehenden Auftrags- und Versionsprüfungen bleiben maßgeblich. Nach einem fehlgeschlagenen Rollback wird die Verbindung verworfen. Ein Fehler an einer unbenutzten Poolverbindung wird ohne Zugangsdaten protokolliert und beendet nicht den gesamten Node-Prozess.
