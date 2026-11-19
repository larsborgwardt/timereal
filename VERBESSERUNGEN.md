# Projektvergleich und Frontendprüfung — 19. November 2026

Auftrag: Versionsfooter mit Repository-Link und Updatehinweis; Vergleich von Gotify, Uptime Kuma, Paperless-ngx und BookStack. Lars verlangt zusätzlich die Anwendung des Apple-Design-Skills und die Umsetzung der Befunde. Die am selben Tag ausdrücklich für später genannten Themen stehen im [Backlog](BACKLOG.md).

## Vergleich und Umsetzung

Geprüft wurden die README-Dateien und die verlinkten Versions-/Updatepfade. Dies ist ein gezielter Vergleich für Betrieb, Versionserkennung und Bedienung, kein Vollaudit der fremden Codebasen.

| Befund in Timereal | Vorbild und geprüfte Quelle | Umsetzung im aktuellen Paket |
|---|---|---|
| F01: Die Version ist erst nach Anmeldung in Einstellungen sichtbar; ein direkter Projektlink fehlt. | [Gotify VersionInfo](https://github.com/gotify/server/blob/01086b95a8b69ee87383f6e8bcae601d8c33384b/model/version.go) bietet zentrale Buildauskunft; [BookStack AppVersion](https://github.com/BookStackApp/BookStack/blob/47eb044e8417b730a97e7f0c2b4374edfabb6145/app/App/AppVersion.php) verwendet eine gemeinsame Versionsquelle. | Footer vor und nach Anmeldung, Version aus der vorhandenen API und Repository-Link. Paket-/Releaseabgleich bleibt erhalten. |
| F02: Es gibt keine automatische Information über neu veröffentlichte stabile Versionen. | [Uptime Kuma check-version](https://github.com/louislam/uptime-kuma/blob/160acac6ed696c938a5179113910c6ec352705ed/server/check-version.js): serverseitige periodische Abfrage, Versionsvergleich und aktivierbare Prüfung. | Numerischer Vergleich stabiler Releases; gemeinsamer Cache für sechs Stunden; gleichzeitige Anfragen teilen einen GitHub-Abruf. GitHub-Ausfälle werden für 15 Minuten zwischengespeichert. |
| F03: Für eine neue Updateprüfung fehlen ein ausdrücklicher Aus-Schalter und ein Datenschutzvertrag. | [Paperless-ngx App-Frame](https://github.com/paperless-ngx/paperless-ngx/blob/14252054a150595d89040a02cb510b9f43f4570b/src-ui/src/app/components/app-frame/app-frame.component.html): Updateanzeige, aktivierbare Prüfung und Erklärung. | `TIMEREAL_UPDATE_CHECK=false` deaktiviert die Prüfung. Der Server ruft eine feste öffentliche GitHub-Adresse ohne Kontodaten ab. Kein GitHub-Aufruf aus dem Browser für die Prüfung. Netzwerkziel und Intervall sind in der Betriebsanleitung erläutert. |
| F04: Ein Updatehinweis braucht einen eindeutigen Weg zur Installation und darf bei Ausfall keinen aktuellen Stand vortäuschen. | [BookStack README](https://github.com/BookStackApp/BookStack/blob/development/readme.md) betont einen stabilen Upgradeweg; [Releaseprozess](https://github.com/BookStackApp/BookStack/blob/47eb044e8417b730a97e7f0c2b4374edfabb6145/dev/docs/release-process.md) trennt Veröffentlichung und Entwicklung. BookStacks GitHub-Bestand verweist inzwischen auf Codeberg; dies wird nicht als Timereal-Updatequelle übernommen. | Der Hinweis öffnet die konkrete Release-Seite. Installation erfolgt weiter im Container mit Sicherung und Prüfmodus. Fehler, deaktivierte Prüfung und letzter erfolgreicher Stand sind unterscheidbar. |

Bereits vorhanden und weiter genutzt: persönliche Sitzungen, getrennte Erweiterungsberechtigung, Sicherung vor Update, Rückwechsel nach Startfehler, API-Version, Datenbankschema, Health-Endpunkt und Kapazitätsprobe. Die Benachrichtigungsfunktionen von Gotify, Monitoringchecks von Uptime Kuma, OCR von Paperless und Wissensverwaltung von BookStack sind keine Anforderungen an eine Zeiterfassung.

## Designprüfung

Maßstab: ausdrücklich geladener `idb-apple-design` mit dessen Original `apple-design` unter `/home/hermes/.local/share/idb-skills/upstream/ff4ebddf0488598723a82bfdce1afb04de0b1c44/apple-design/`. Timereal ist eine Browseranwendung; angewendet werden Layout-, Typografie-, Zugänglichkeits-, Farb- und Feedbackprinzipien. Native macOS-Menüs, Apple Pay, Liquid Glass und iOS-Navigation werden daraus nicht abgeleitet.

Das Ziel ist eine ruhige Zeiterfassung: Der laufende Arbeitstag bleibt zentral, Wartungsinformationen stehen unaufdringlich im Footer. Die vorhandene Systemschrift, Türkis als Aktionsfarbe und klar beschriftete Steuerelemente bleiben bestehen. Die Footerbilder 09 für Laptop und Smartphone wurden von Lars mit „Footer wie im Bild umsetzen (empfohlen)“ freigegeben. Versionszahlen in den Bildern sind illustrative Zustände.

| Befund / Maßstab | Referenz und Konsequenz | Nachweis |
|---|---|---|
| D01: Bei 320 Pixeln und 200 % Textgröße erzeugt die Anmeldeüberschrift horizontalen Überlauf. | `typography.md › Supporting Dynamic Type` und `layout.md`: vergrößerte Schrift darf Inhalte nicht abschneiden; Überschrift darf umbrechen. | Reproduzierter Überlauf von 350 gegenüber 320 Pixeln; Browserprobe prüft den Umbruch nach dem Fix. |
| D02: Der neue Footer benötigt sichtbaren Tastaturfokus, ausreichend große Linkflächen und erkennbare Links. | `accessibility.md › Vision / Speech`, `color.md › Inclusive color`: Information nicht ausschließlich durch Farbe; Bedienung per Tastatur. | Unterstrichene Links, Fokusrahmen, mindestens 44 Pixel hohe Linkflächen; Browserprobe mit Tab und vergrößertem Text. |
| D03: Laden, deaktivierte Prüfung, Fehler und veralteter Abruf dürfen nicht dieselbe Erfolgsmeldung zeigen. | `feedback.md`, `loading.md` und `writing.md`: Rückmeldung im Kontext; Arbeiten bleibt möglich. | Eigenständiges Footer-Modul, konkrete Zustandsmeldungen, Test mit abgebrochener Updateanfrage und weiterhin bedienbarer Anmeldung. |

D02/D03 sind Anforderungen an die neue Oberfläche; sie werden nicht als zuvor vorhandene Produktfehler dargestellt. Die automatisierten Proben stehen in `tests/footer-browser.mjs` und `tests/updates.test.mjs`. Tatsächlich ausgeführte Prüfungen, Kontraste, Screenshots und Grenzen werden im [Versionsnachweis](nachweise/0.6.2.md) festgehalten.

## Zusätzliche Betriebsbefunde aus der Integration

- E01: Die Erweiterung ließ frühes Absenden und Eingeben vor Abschluss ihres asynchronen Starts zu. Adressfeld und Verbindungsbutton werden jetzt erst nach Laden des gespeicherten Zustands bedienbar. Der verzögerte Start und die anschließende echte Anmeldung sind geprüft.
- B01: Geplante schnelle Proxy-Wechsel konnten die systemd-Startsperre erreichen und den Rückbau verhindern. Proxy-Patch 2 setzt die Zähler vor dem geplanten Neustart zurück; echte Dienst- und HTTPS-Prüfungen bleiben maßgeblich. Die native Probe erzwingt eine Startsperre und prüft auch den Rückbau nach einem einmaligen Neustartfehler.
