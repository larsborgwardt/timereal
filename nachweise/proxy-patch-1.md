# Proxy-Patch 1 — Prüfnachweis

Stand: 19. November 2026. Basis: `23d7f5a2f9fa8968e0580872a2867e678f658ffc`.

Auftrag: eine lokal funktionierende Timereal-Installation hinter einem externen Nginx erreichbar machen; Domain frei wählbar und später wechselbar. Liefergegenstand: `betrieb/proxy-einrichten.sh`. Anwendungsversion, API und Datenbankschema bleiben unverändert. Der Patch wird einzeln angewendet.

## Fehler und TDD

Am Benutzercontainer lieferte die Startseite unter der IP HTTP 200 mit Inhalt, mit öffentlichem Host-Header hingegen HTTP 200 ohne Inhalt. Keine Schreiboperation im Benutzercontainer. Die Diagnose liegt unter `workspace/issues/timereal-nginx-diagnose-2026-11-19.md` im Betreiberworkspace.

Vor Anlage des Betriebsskripts: `node --test --test-name-pattern='Proxy-Patch' tests/betrieb.test.mjs` rot wegen fehlendem Skript. Im eigenen nativen Debian/systemd-Prüfgast reproduzierte `tests/betrieb-proxy.sh` die leere HTTPS-Antwort und brach am noch fehlenden Patch ab. Anschließend Implementierung und grüner Lauf. Die Punycode-Top-Level-Domain wurde vor der Erweiterung der Eingabeprüfung separat rot gemessen.

## Ausgeführte Prüfungen

| Kommando / Umfeld | Ergebnis |
|---|---|
| `npm run build` | Exit 0 |
| `node --test tests/betrieb.test.mjs` | Exit 0 |
| `shellcheck betrieb/proxy-einrichten.sh tests/betrieb-proxy.sh` | Exit 0 |
| `git diff --check` | Exit 0 |
| `docker exec timereal-install061 bash /root/betrieb-proxy-test.sh /root/timereal-proxy-patch.sh` | Exit 0; echte Caddy-TLS-, systemd- und PostgreSQL-Laufzeit |

Die native Probe misst Prüfmodus ohne Konfigurationsänderung oder PID-Wechsel, nichtleere Startseite mit öffentlichem Host, Domainwechsel von `erste.proxyprobe.test` zu `zweite.proxyprobe.test`, wiederholten Aufruf ohne Neustart, erlaubten und fremden Origin sowie Rückkehr zur vorherigen Konfiguration nach einem absichtlich fehlgeschlagenen Neustart. Benutzerdefinierte Caddy-Konfiguration wird ohne Überschreiben abgewiesen. HTTPS-Proben vertrauen der realen internen CA; keine deaktivierte Zertifikatsprüfung. Der Fehleradapter musste wegen `noexec` auf `/tmp` in ein ausführbares Testverzeichnis wechseln; der grüne Lauf assertiert ausdrücklich, dass der Adapter ausgelöst wurde.

Selbstprüfung: feste Konfigurationspfade, keine Ausführung der Umgebungsdatei als Shell, Eingabeprüfung vor Systemzugriff, gemeinsame Einrichtungssperre, Erhalt sonstiger Umgebungswerte und Dateimetadaten, Bestandsvergleich vor Umschaltung, Sicherung und Rückbau bei Fehler oder Signal. Der Rückbau meldet Erfolg nur nach erfolgreichem Neustart und erneuter HTTPS-Probe. Keine unabhängige Review-Sitzung.

## Grenzen

Der Prüfgast ist ein eigener Docker/systemd-Gast, kein neuer unprivilegierter LXC-Nachweis. Der ursprüngliche Pilot-Installer am Commit `7fcf58b` erzeugt dieselbe hier erlaubte Caddy-/Origin-Vorlage. Der Patch unterstützt HTTPS-Port 443, eine lokale IPv4-Adresse und eine öffentliche Domain; individuelle Caddy-Konfiguration wird nicht umgeschrieben. Die externe Nginx-, DNS- und Routerstrecke wird vom Patch nicht umkonfiguriert. Eine erfolgreiche Anmeldung mit Benutzerkonto wurde in dieser Patchprobe nicht behauptet: gemessen wurden die echte Herkunftsprüfung und die danach erreichte Eingabevalidierung.

Nach der Probe wurden die vorherigen Dateien im Prüfgast wiederhergestellt und der Gast gestoppt. Die Anwendung im Benutzercontainer bleibt bis zu dessen eigenem Patchaufruf unverändert.
