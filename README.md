<h1 align="center">Timereal</h1>

<p align="center"><strong>Zeiten erfassen. Kunden wechseln. Nachweise vorbereiten.</strong><br>Deine Zeiterfassung im Browser – auf deinem eigenen Linux-Server.</p>

<p align="center">
  <a href="https://github.com/larsborgwardt/timereal/releases/latest"><img src="https://img.shields.io/github/v/release/larsborgwardt/timereal?label=Release&amp;color=08796f" alt="Aktuelles Release"></a>
  <a href="https://github.com/larsborgwardt/timereal/actions/workflows/tests.yml?query=branch%3Amain"><img src="https://github.com/larsborgwardt/timereal/actions/workflows/tests.yml/badge.svg?branch=main" alt="Prüfungen auf main"></a>
  <a href="LICENSE"><img src="https://img.shields.io/badge/Lizenz-AGPL--3.0-37536b" alt="Lizenz AGPL-3.0"></a>
</p>

<p align="center">
  <a href="#installation">Installation</a> ·
  <a href="#updates">Updates</a> ·
  <a href="#eigene-domain">Eigene Domain</a> ·
  <a href="#dokumentation">Dokumentation</a> ·
  <a href="https://github.com/larsborgwardt/timereal/issues">Fehler melden</a>
</p>

Timereal hilft Beratern und Selbstständigen, ihre Arbeit für verschiedene Kunden nachvollziehbar zu erfassen. Ein Kundenwechsel beendet den bisherigen Zeitabschnitt und startet den nächsten an derselben Zeitgrenze. Laptop, Smartphone und Browsererweiterung greifen auf den gemeinsamen Timer zu.

Die Daten liegen in deiner PostgreSQL-Datenbank. Stundennachweise lassen sich für die manuelle Übernahme in andere Systeme vorbereiten; eine direkte Anbindung an ein bestimmtes Abrechnungssystem ist nicht erforderlich.

![Wochenübersicht in Timereal mit erfasster und abrechenbarer Zeit](docs/images/wochenuebersicht.png)

*Echte Oberfläche aus dem Browsertest von Version 0.6.2, mit Testdaten.*

## Funktionen

| Für deinen Arbeitstag | In Timereal |
|---|---|
| Schnell anfangen | Sofortstart, interne Zeit und Buchungsziele für Kunden, Tickets oder Termine |
| Kunden wechseln | Gemeinsamer Timer über Geräte hinweg; Pause, Fortsetzen und Stopp |
| Zeiten vervollständigen | Leistungstexte, Nachträge, Korrekturen, Unterbrechungen und Stornos |
| Überblick behalten | Tagesverlauf, Wochenübersicht und durchsuchbare Historie |
| Stunden übertragen | Nachweise kopieren, Übernahme bestätigen und spätere Änderungen mit dem übertragenen Stand vergleichen |
| Weitere Berater einladen | Berater, Betrieb und Administrator, Einladungen per E-Mail und Kontosperren; persönliche Kunden und Zeiten |
| Im Browser bleiben | Erweiterung für Chrome und Edge mit Timer und Notizen; eigene widerrufbare Sitzung |
| Selbst betreiben | Native Linux-Dienste, PostgreSQL, HTTPS; Updates und Domainzugriff im Adminbereich, Sicherung vor Updates |
| Betrieb nachvollziehen | Systemkonsole für Betrieb und Administratoren mit Dienst-/Levelfilter, Suche, Live-Pause und Textdownload |

<details>
<summary><strong>Weitere Einblicke: Buchungsvergleich und Browsererweiterung</strong></summary>

### Änderungen vor der Übernahme vergleichen

![Vergleich zwischen übertragenem und aktuellem Buchungsstand](docs/images/buchungsvergleich.png)

### Timer in der Browserleiste

<img src="docs/images/browsererweiterung.png" width="380" alt="Timereal-Erweiterung mit laufendem Timer, Pause, Stopp und Kundenwechsel">

Die Bilder stammen aus der echten Anwendung mit Testkonten. Die [Erweiterungsanleitung](https://github.com/larsborgwardt/timereal/blob/v0.8.1/erweiterung/README.md) beschreibt Installation und Anmeldung.

</details>

## Installation

Der Installationsweg ist für einen **eigenen unprivilegierten Debian-13-LXC mit systemd** vorgesehen. Die Anwendung läuft mit Node.js, PostgreSQL und Caddy als native Dienste. Docker wird für diesen Installationsweg nicht benötigt.

| Einsatz | Startwerte |
|---|---|
| Persönlicher Pilot | 2 vCPU · 2 GiB RAM · 8 GiB Speicher |
| Planung für 100 gleichzeitig aktive Nutzer | 4 vCPU · 4 GiB RAM · 32 GiB SSD |

Der [Kapazitätsnachweis](https://github.com/larsborgwardt/timereal/blob/v0.8.1/KAPAZITAET.md) beschreibt Lastprofil, Messergebnisse und Grenzen. Die Werte sind keine Garantie für jede Hardware oder Datenmenge.

In der **Root-Konsole eines neuen Containers**:

```bash
apt-get update && apt-get install -y git ca-certificates &&
git clone --branch v0.8.1 --single-branch https://github.com/larsborgwardt/timereal.git /opt/timereal &&
bash /opt/timereal/betrieb/install.sh
```

Der Installer richtet die Dienste ein, fragt das erste Konto ab und zeigt die Browser-Adresse einschließlich Port, etwa `https://192.0.2.42:443`. Verwende die Adresse aus deiner eigenen Ausgabe.

- **443:** HTTPS-Zugang im Browser.
- **3040:** interner Anwendungsdienst auf Loopback, kein öffentlicher Zugang.
- **Lokales HTTPS:** Der Pilot verwendet eine eigene Zertifizierungsstelle. Übertrage nur das öffentliche Zertifikat `/root/timereal-test-ca.crt` über deinen vertrauten Containerzugang auf die Testgeräte und vertraue ihm dort für Websites. Auf dem iPhone zusätzlich das volle Vertrauen für das CA-Profil aktivieren.

SMTP, externe Sicherungen und weitere Installationshinweise stehen in der [Betriebsanleitung für 0.8.1](https://github.com/larsborgwardt/timereal/blob/v0.8.1/betrieb/README.md). Für eine vorhandene Installation verwende den Updateweg.

## Updates

Die Oberfläche zeigt die installierte Version und weist auf neue stabile Releases hin. Ab **0.8.1** können Betrieb und Administratoren unter **Verwaltung → Updates** ein kompatibles Folgeupdate vorbereiten und nach Passwortbestätigung installieren. Fortschritt und Ergebnis bleiben beim Neuladen erhalten.

**Einmaliger Umstieg:** Ein älterer Container benötigt zunächst das folgende Konsolenupdate, um den getrennten Betriebsdienst einzurichten.

Als root auf die veröffentlichte Version **0.8.1** aktualisieren:

```bash
git -C /opt/timereal fetch --tags origin &&
git -C /opt/timereal show v0.8.1:betrieb/update.sh > /root/timereal-update.sh &&
bash /root/timereal-update.sh --check v0.8.1 &&
bash /root/timereal-update.sh v0.8.1
```

Der Prüfmodus kontrolliert den Ausgangsstand. Das Update baut ein getrenntes Release und erstellt vor einer Datenbankänderung eine geprüfte Sicherung. Schlägt der neue Anwendungsstart fehl, versucht der Updater den vorherigen Anwendungsstand wieder zu starten. Eine alte Datenbanksicherung wird dabei nicht automatisch zurückgespielt.

[Release und Änderungsnotizen](https://github.com/larsborgwardt/timereal/releases/latest) · [Updatevertrag und Wiederherstellung](https://github.com/larsborgwardt/timereal/blob/v0.8.1/betrieb/README.md)

## Eigene Domain

Ab 0.7.0 unter **Verwaltung → Domainzugriff** den eigenen DNS-Namen eintragen, **Domain prüfen** und nach Passwortbestätigung **Domain übernehmen** wählen. Timereal zeigt das aus deiner Installation ermittelte Weiterleitungsziel einschließlich Port an.

Der vorgeschaltete Proxy leitet auf **`https://CONTAINER_IP:443`** weiter und übergibt den öffentlichen Hostnamen. DNS, öffentliches Zertifikat und Routerweiterleitung richtest du am Proxy ein. Bei aktivierter Upstream-Zertifikatsprüfung muss er der Timereal-Test-CA vertrauen.

Nach der Übernahme die neue Adresse öffnen, erneut anmelden und innerhalb von **drei Minuten Zugriff bestätigen**. Ohne Bestätigung stellt Timereal die bisherige Konfiguration wieder her, auch bei geschlossenem Browser. Unterstützt wird die vom Installer erzeugte interne HTTPS-Vorlage mit IPv4-Adresse; eigene Caddy-Konfigurationen werden nicht überschrieben. Prüfe die öffentliche Domain auch von außerhalb deines lokalen Netzes.

[Reverse Proxy, Konsolenweg und direkter HTTPS-Betrieb](https://github.com/larsborgwardt/timereal/blob/v0.8.1/betrieb/README.md)

## Einen Arbeitstag ausprobieren

1. Unter **Heute → Neues Buchungsziel** Kunde und Ticket anlegen, dann **Speichern und starten**.
2. Auf dem Smartphone mit demselben Konto anmelden und zu einem anderen Kunden wechseln.
3. Das erste Ticket am Laptop fortsetzen. **Pausieren** merkt das Ziel vor; **Stoppen** beendet die Erfassung.
4. Leistungstext ergänzen und unter **Nachweise → Übernahme** in das externe System kopieren. Die erfolgte Übernahme bestätigen.
5. Korrekturen über **Buchung vergleichen** nachvollziehen; die Woche und Historie zum Abgleich nutzen.

## Geplant

Die Systemkonsole ist ab 0.8.0 unter **Verwaltung → Systemlogs** verfügbar. Sie zeigt Meldungen der Anwendung, des Betriebsdienstes und des HTTPS-Dienstes. Die Suche arbeitet auf den letzten 500 Einträgen der vergangenen 24 Stunden; längere Aufbewahrung richtet sich nach der Journal-Konfiguration des Servers.

Die Rollen Berater, Betrieb und Administrator sind ab 0.8.1 unter **Verwaltung → Konten** verfügbar. Rollenwechsel melden das betroffene Konto ab; persönliche Kunden und Zeiten bleiben getrennt. Audit-Protokolle, Profilerweiterung und Zwei-Faktor-Anmeldung folgen in den nächsten Paketen. Der [aktuelle Backlog](BACKLOG.md) und der [Releaseplan](RELEASEPLAN.md) führen Umfang und Bildfreigaben.

## Dokumentation

Die folgenden Links zeigen den Stand des veröffentlichten Releases **0.8.1**:

| Thema | Einstieg |
|---|---|
| Installation, HTTPS, SMTP, Sicherung und Updates | [Betriebsanleitung](https://github.com/larsborgwardt/timereal/blob/v0.8.1/betrieb/README.md) |
| Versionen und Änderungen | [Changelog](https://github.com/larsborgwardt/timereal/blob/v0.8.1/CHANGELOG.md) |
| Architektur und Kundenwechsel | [Architektur](https://github.com/larsborgwardt/timereal/blob/v0.8.1/ARCHITEKTUR.md) |
| Datenbank | [Datenmodell](https://github.com/larsborgwardt/timereal/blob/v0.8.1/DATENMODELL.md) |
| Browsererweiterung | [Chrome/Edge einrichten](https://github.com/larsborgwardt/timereal/blob/v0.8.1/erweiterung/README.md) |
| Betrieb mit mehreren Nutzern | [Kapazitätsplanung](https://github.com/larsborgwardt/timereal/blob/v0.8.1/KAPAZITAET.md) |

## Entwicklung und Mitmachen

Für einen reproduzierbaren Einstieg das Release auschecken; laufende Änderungen sind in den [Pull Requests](https://github.com/larsborgwardt/timereal/pulls) sichtbar. Benötigt werden **Node.js 24** und **Docker** für die isolierte PostgreSQL-Testinstanz.

```bash
git clone --branch v0.8.1 https://github.com/larsborgwardt/timereal.git
cd timereal
npm ci
npm run build
npm test
```

Die Tests verwenden PostgreSQL 18; `POSTGRES_IMAGE=postgres:17-alpine npm test` prüft PostgreSQL 17. Für die Browser- und Erweiterungsproben:

```bash
npx playwright-core install chromium
BROWSER_TEST=1 npm test
```

Ein vorhandenes Chromium lässt sich mit `CHROMIUM_PATH` angeben. Die Tests legen eine getrennte Wegwerfdatenbank an.

Fehler und Vorschläge können als [GitHub-Issue](https://github.com/larsborgwardt/timereal/issues) eingereicht werden. Nenne Version, Installationsart und Schritte zum Nachstellen. Zugangsdaten und echte Kundendaten gehören nicht in öffentliche Issues. Besprich größere Funktionsänderungen vor einem Pull Request.

## Lizenz

Timereal wird unter der [GNU Affero General Public License v3](LICENSE) bereitgestellt.
