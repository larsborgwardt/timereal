# Kontoprofil und Zwei-Faktor-Anmeldung — Vertrag ab 0.9.0

Profil- und Einrichtungsbilder 13 sind durch D-RELEASE-006 freigegeben; Anmeldung, Wiederherstellung und Verwaltung durch D-RELEASE-007. Die Umsetzung liegt in `src/mfa.ts`, den Migrationen 009/010 und den Kontoansichten. Prüfbelege und Betriebsgrenzen stehen in [nachweise/0.9.0.md](nachweise/0.9.0.md).

## Integrationspunkte

- `src/app.ts` prüft das Passwort und lässt `mfa_anmeldung_start()` über normale Anmeldung oder befristete Faktorprüfung entscheiden. Erst `mfa_anmeldung_abschliessen()` erzeugt nach dem zweiten Nachweis die Sitzung.
- Das bisherige `sitzung_anlegen()` verweigert Konten mit eingeschaltetem Faktor. Ein älterer Anwendungsstand kann diesen Schutz damit nicht über die Passwortanmeldung umgehen.
- Die Chromium-Erweiterung verwendet die Webanmeldung und den Freigabe-/PKCE-Weg. Das Anmeldeformular verwendet denselben Faktorbaustein wie die Web-App.
- `betrieb/mfa-schluessel.sh` legt den dauerhaften Schlüssel an und prüft ihn gegen gespeicherte aktive und vorbereitete Faktoren. `verwaltung-einrichten.sh` übernimmt diese Einrichtung auch beim Webupdate aus v0.8.2.
- Lokale Sicherungen enthalten Dump und Schlüssel; externe Sicherungen schließen `/etc/timereal` ein und prüfen beim Restore die Entschlüsselbarkeit.

## Zustände und Verträge

Kontozustand: deaktiviert → Einrichtung ausstehend → aktiviert. Eine ausstehende Einrichtung ersetzt keinen vorhandenen aktiven Faktor. Abbruch und Ablauf lassen den vorherigen Zustand bestehen. Die Aktivierung erfolgt erst nach korrektem Authenticator-Code.

Anmeldung: Passwortprüfung → begrenzte Anmeldeprüfung → zweiter Nachweis → vollständige Websitzung. Der Zwischenschritt ist keine Sitzung und berechtigt weder zum Lesen persönlicher Zeiten noch zur Verwaltung oder Erweiterungsfreigabe. Er läuft nach fünf Minuten ab, wird nach erfolgreichem Abschluss verbraucht und besitzt eine serverseitige Fehlversuchsgrenze. Neue Passwortprüfungen dürfen das kontobezogene Versuchslimit nicht zurücksetzen.

TOTP erhält ein zufälliges Geheimnis je Konto, sechs Ziffern und einen 30-Sekunden-Schritt. Die Prüfung akzeptiert den aktuellen und höchstens den vorherigen Schritt; ein bereits verbrauchter oder älterer Schritt wird atomar abgewiesen. Serverzeit und tatsächliche Uhrabweichungen gehören in die Betriebsprobe. Die einmalige Verwendung und das begrenzte Zeitfenster folgen [RFC 6238](https://www.rfc-editor.org/rfc/rfc6238).

Wiederherstellungscodes werden mit kryptografischem Zufall erzeugt und nur einmal ausgegeben. Die Datenbank hält Hashwerte und den Verbrauchszustand. Eine parallele Verwendung desselben Codes darf nur einen Erfolg haben. Neue Codes ersetzen die vorherigen erst nach erfolgreicher erneuter Prüfung. Das Ausschalten des Faktors und die Erneuerung der Codes verlangen Passwort und bestehenden Faktor beziehungsweise einen gültigen Wiederherstellungscode. Die Sitzung allein genügt dafür nicht. Diese Maßnahmen orientieren sich an [OWASP: MFA, Zurücksetzen und Faktorwechsel](https://cheatsheetseries.owasp.org/cheatsheets/Multifactor_Authentication_Cheat_Sheet.html).

Passwort-Zurücksetzen deaktiviert den Faktor nicht. Passwort-, Sperr- und Faktoränderungen entwerten offene Anmeldeprüfungen. Die Aktivierung widerruft andere Sitzungen einschließlich Erweiterung und rotiert die aktuelle Sitzung; laufende Timer bleiben bestehen. Ein Rollenwechsel behält seinen bestehenden Widerrufsvertrag. E-Mail-Änderungen dürfen kein Wiederherstellungs- oder Faktor-Umgehungsweg werden.

## Speicherung und Schlüsselbetrieb

Migrationen 009/010 speichern: Profil-Anzeigename; Faktorstatus und verschlüsseltes Geheimnis; zuletzt verbrauchter Zeitschritt; Sicherheitsrevision des Kontos; befristete Anmelde-/Einrichtungsprüfungen mit Tokenhash und Fehlversuchen; Wiederherstellungscode-Hashes. Eigentumsprüfung und eingeschränkte Datenbankrolle bleiben erhalten. Sicherheitsdaten erhalten keine allgemeine CRUD-Schnittstelle.

TOTP-Geheimnisse müssen für die Berechnung entschlüsselbar bleiben. Verwendet wird AES-256-GCM mit zufälligem Nonce je Verschlüsselung und Bindung an Konto und Formatversion. Der Hauptschlüssel liegt außerhalb der Datenbank unter `/etc/timereal`, ist auf Dienst und root beschränkt und wird bei Updates erhalten. Bei fehlendem oder falschem Schlüssel wird die Prüfung verweigert; es gibt keinen Passwort-Fallback. Ein bestehender Schlüssel wird nicht automatisch ersetzt. Die OWASP-Quelle oben begründet Verschlüsselung und begrenzte Entschlüsselung; Dateipfad, Algorithmus und Betriebsform sind technische Entscheidungen dieses Projekts.

Die tägliche lokale Sicherung erstellt ein geschütztes, atomar fertiggestelltes Paket mit Datenbankdump, Schlüssel, Prüfsummen und Format-/Release-Metadaten. Bestehende `.dump`-Dateien bleiben erhalten. Der neue Updater sichert zusätzlich den Schlüssel und die Konfiguration. Beim erstmaligen Sprung aus v0.8.2 enthält der vorherige Datenbankstand noch keine MFA-Geheimnisse; der Schlüssel wird im anschließenden Einrichtungsschritt erzeugt. Ab dann ist ein Dump ohne zugehörigen Schlüssel keine vollständige Kontosicherung. Der [Betriebsvertrag](betrieb/README.md) beschreibt Sicherung und Wiederherstellung.

Audit erfasst Einrichtung, Aktivierung, Ausschalten, Codeerneuerung und Wiederherstellungsverwendung als benannte Ereignisse. Codes, QR-Inhalt, Geheimnisse, Challenge-Token und Schlüssel erscheinen weder in Audit noch Logs, Fehlerantworten oder URL-Parametern. Browserseitig wird der Einrichtungsinhalt nach Abschluss und Abmeldung entfernt. QR-Erzeugung erfolgt lokal ohne externen Bilddienst.

## Profil und API

Der Anzeigename ist optional. Eine neue E-Mail-Adresse wird erst nach Bestätigung eines befristeten Einmallinks aus dem angemeldeten eigenen Konto übernommen. Eine reine Namensänderung benötigt keinen Mailversand und erhält einen ausstehenden Bestätigungslink. Passwort-, Rollen- und Sperränderungen widerrufen ausstehende Links; die Übernahme einer neuen Adresse widerruft alte Passwort-Rücksetzlinks.

| Vorgang | API unter `/api/v1` |
|---|---|
| Profil lesen / bearbeiten | `GET` / `PATCH /profil` |
| Adresse bestätigen | `POST /profil/email-bestaetigen` |
| Faktorstatus | `GET /mfa` |
| Einrichtung beginnen / abbrechen | `POST` / `DELETE /mfa/einrichtung` |
| Einrichtung bestätigen | `POST /mfa/aktivieren` |
| Faktorprüfung abschließen / abbrechen | `POST` / `DELETE /anmeldung/faktor` |
| Ersatzcodes erneuern / Faktor ausschalten | `POST /mfa/codes` / `POST /mfa/deaktivieren` |

Die Faktorverwaltung benötigt eine vollständige Websitzung. Die Teilanmeldung verwendet ein eigenes HttpOnly-Cookie mit begrenztem Pfad. Die Tabellen sind für die eingeschränkte Datenbankrolle nicht direkt les- oder schreibbar. Der Anwendungsdienst ist die Vertrauensgrenze für die kryptografische Prüfung; SQL übernimmt Kontosperren, Verbrauch, Ablauf und Sitzungswiderruf. Ein kompromittierter Anwendungsprozess liegt außerhalb dieser Kontotrennungszusage.

## Abnahme

API und PostgreSQL prüfen Kontogrenzen, Teilanmeldung, Replay, Parallelverbrauch, Ablauf, Fehlversuchsgrenze und Widerruf. RFC-Vektoren und unabhängige HTTP-Testberechnung prüfen den TOTP-Kern; QR-Code-Erzeugung erfolgt mit der gesperrten Abhängigkeit `qrcode`, ohne externen Dienst. Browserproben führen die freigegebenen Ansichten einschließlich Abbruch, Fehler, kleiner Breite und vergrößerter Schrift durch. Die native Probe aktualisiert einen tatsächlichen v0.8.2-Betriebsdienst, sichert einen eingerichteten Faktor und meldet sich aus dem rückgesicherten Bestand an. Die konkreten Ergebnisse stehen im Releasebeleg.
