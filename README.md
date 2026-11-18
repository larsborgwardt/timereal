# Timereal

Persönliche Zeiterfassung für die Arbeit mit mehreren Kunden. Ein Wechsel beendet den bisherigen Abschnitt und startet den nächsten zur selben Minute. Laptop und Smartphone greifen auf denselben Timer zu.

## Im eigenen LXC testen

Lege einen **unprivilegierten Debian-13-LXC** mit eigenem Hostnamen und erreichbarer IPv4-Adresse an. Für den Pilot sind 2 vCPU, 2 GiB RAM und 8 GiB Speicher als Startwerte vorgesehen. Internetzugang wird für die Paketinstallation benötigt. Anwendung, PostgreSQL und HTTPS laufen als native Dienste. Docker ist für den LXC entbehrlich.

Führe in der **Root-Konsole des neuen Containers** aus:

```bash
apt-get update && apt-get install -y git ca-certificates &&
git clone --branch feature/zeiterfassung-lxc --single-branch https://github.com/larsborgwardt/timereal.git /opt/timereal &&
bash /opt/timereal/betrieb/install.sh
```

Das Skript fragt den Anmeldenamen und das Passwort für dein erstes Konto ab und gibt die HTTPS-Adresse aus. Der Pilot verwendet eine eigene Zertifizierungsstelle. Übertrage **nur das öffentliche Zertifikat** `/root/timereal-test-ca.crt` über deinen vertrauten Containerzugang auf die Testgeräte und vertraue ihm dort für Websites. Auf dem iPhone muss für ein installiertes CA-Profil zusätzlich das volle Vertrauen aktiviert werden. Verwende bei einer Namensbindung denselben DNS-Namen auf beiden Geräten. Für diesen Fall starte den Installer mit `TIMEREAL_HOST=zeit.test.example bash /opt/timereal/betrieb/install.sh` und ersetze den Namen durch deinen auflösbaren Testnamen.

Bestehende Installationen aktualisierst du über den [versionierten Updateweg](betrieb/README.md#versioniert-aktualisieren-ab-02), einschließlich Sicherung. Verwende dafür nicht erneut den Installer. Dienststatus und Startfehler zeigt `journalctl -u timereal -u timereal-https -b`.

## Ein Vormittag zum Ausprobieren

1. Am Laptop anmelden und unter **Heute → Neues Buchungsziel** einen Kunden und ein Ticket anlegen. **Speichern und starten** beginnt den Timer.
2. Am Smartphone mit demselben Konto anmelden. Das Ticket läuft dort bereits. Einen Termin für einen anderen Kunden anlegen und **Speichern und wechseln** wählen.
3. Am Laptop zum ursprünglichen Ticket wechseln. Im Tagesverlauf entstehen drei Abschnitte. **Pausieren** merkt sich das aktuelle Ticket. **Fortsetzen** beginnt dafür einen neuen Abschnitt. **Stoppen** beendet die Erfassung.
4. Leistungstext ergänzen. Unter **Nachweise → Übernahme** den Eintrag kopieren und nach der externen Eingabe bestätigen. Unter **Historie** abgeschlossene Zeiten nach Zeitraum, Kunde oder Ziel durchsuchen.

## Unterlagen

- [Architektur und Ablauf des Kundenwechsels](ARCHITEKTUR.md)
- [Datenmodell mit Beziehungsdiagramm](DATENMODELL.md)
- [Konzept und Bildentwürfe](KONZEPT.md)
- [Verwaltung und Sicherung im Testcontainer](betrieb/README.md)

## Entwicklung

Node.js 24 und PostgreSQL 17 oder 18. Mit `npm ci && npm test` starten die Integrationstests eine getrennte, vorübergehende PostgreSQL-Instanz über Docker. Für PostgreSQL 17 setze `POSTGRES_IMAGE=postgres:17-alpine`. Für den echten Browsertest zuerst `npx playwright-core install chromium` und anschließend `BROWSER_TEST=1 npm test` ausführen. Ein vorhandenes Chromium lässt sich mit `CHROMIUM_PATH` angeben.

## Arbeitstag bearbeiten (ab 0.4)

Unter **Heute** beginnt „Sofort starten“ eine vorläufige Zeit, wahlweise mit Kunde. „Interne Zeit“ erfasst eine nicht abrechenbare Tätigkeit. Im Tagesverlauf und unter Nachweise lassen sich abgeschlossene Zeiten nachtragen, korrigieren, teilen oder stornieren. Beim Verschieben einer gemeinsamen Grenze wird der direkt anschließende Abschnitt mit angepasst.

„Buchung vergleichen“ zeigt den zuletzt bestätigten Übertragungsstand neben den aktuellen Werten. Korrigiere deinen externen Stundennachweis und bestätige danach die Übernahme. Die Wochenansicht summiert Minuten; Filter zurücksetzen leert lediglich die Suchfilter. Kundenname und Buchungsziel bearbeitest du über „Bearbeiten“ beim jeweiligen Ziel.
