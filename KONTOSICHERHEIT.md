# Kontoprofil und Zwei-Faktor-Anmeldung — Umsetzungsvorbereitung 0.9.0

Stand 19. November 2026. Technischer Entwurf für den beauftragten nächsten Ausbau, noch keine implementierte Sicherheitsfunktion. Ausgangspunkt ist Audit-Kandidat `a57cc75875c031b9112ab29f77460d0c67a639e7`. Profil- und Einrichtungsbilder 13 sind durch D-RELEASE-006 freigegeben. Anmeldung mit zweitem Faktor, Wiederherstellungsanmeldung und Verwaltung eines eingerichteten Faktors sind mit den ergänzenden Bildern 14 durch D-RELEASE-007 freigegeben.

## Gemessene Integrationspunkte

- `src/app.ts` meldet nach Passwortprüfung über `issueSession()` an. `src/session.ts` ruft dafür `sitzung_anlegen()` auf. Hier muss die Ausgabe einer vollständigen Sitzung bei eingeschaltetem zweiten Faktor unterbleiben.
- `sitzung_anlegen()` ist ein Datenbankvertrag seit Migration 2/3. Eine Änderung nur in der neuen HTTP-Route würde einen Rückfall auf die ältere Anwendung nicht absichern. Deshalb wird auch diese SQL-Funktion für Konten mit eingeschaltetem Faktor gesperrt; der neue Abschlussweg übernimmt beide Nachweise atomar.
- Die Chromium-Erweiterung verwendet die Webanmeldung und den vorhandenen Freigabe-/PKCE-Weg. Eine ausstehende Zweitfaktor-Prüfung darf keinen Erweiterungscode ausstellen.
- `betrieb/sichern.sh` läuft als PostgreSQL-Benutzer und erstellt derzeit einen Datenbankdump. Der Updater sichert ebenfalls einen Dump. Diese Dateien allein würden einen zusätzlich verschlüsselten TOTP-Schlüssel nicht wiederherstellen können.
- `betrieb/extern-sichern.sh` sichert bereits `/etc/timereal` zusammen mit Datenbank und Releaseangabe. Ein dort verwalteter Schlüssel fällt damit in den bestehenden externen Sicherungsumfang; der echte Wiederherstellungstest muss seine Nutzbarkeit zusätzlich nachweisen.

## Zustände und Verträge

Kontozustand: deaktiviert → Einrichtung ausstehend → aktiviert. Eine ausstehende Einrichtung ersetzt keinen vorhandenen aktiven Faktor. Abbruch und Ablauf lassen den vorherigen Zustand bestehen. Die Aktivierung erfolgt erst nach korrektem Authenticator-Code.

Anmeldung: Passwortprüfung → begrenzte Anmeldeprüfung → zweiter Nachweis → vollständige Websitzung. Der Zwischenschritt ist keine Sitzung und berechtigt weder zum Lesen persönlicher Zeiten noch zur Verwaltung oder Erweiterungsfreigabe. Er läuft nach fünf Minuten ab, wird nach erfolgreichem Abschluss verbraucht und besitzt eine serverseitige Fehlversuchsgrenze. Neue Passwortprüfungen dürfen das kontobezogene Versuchslimit nicht zurücksetzen.

TOTP erhält ein zufälliges Geheimnis je Konto, sechs Ziffern und einen 30-Sekunden-Schritt. Die Prüfung akzeptiert den aktuellen und höchstens den vorherigen Schritt; ein bereits verbrauchter oder älterer Schritt wird atomar abgewiesen. Serverzeit und tatsächliche Uhrabweichungen gehören in die Betriebsprobe. Die einmalige Verwendung und das begrenzte Zeitfenster folgen [RFC 6238](https://www.rfc-editor.org/rfc/rfc6238).

Wiederherstellungscodes werden mit kryptografischem Zufall erzeugt und nur einmal ausgegeben. Die Datenbank hält Hashwerte und den Verbrauchszustand. Eine parallele Verwendung desselben Codes darf nur einen Erfolg haben. Neue Codes ersetzen die vorherigen erst nach erfolgreicher erneuter Prüfung. Das Ausschalten des Faktors und die Erneuerung der Codes verlangen Passwort und bestehenden Faktor beziehungsweise einen gültigen Wiederherstellungscode. Die Sitzung allein genügt dafür nicht. Diese Maßnahmen orientieren sich an [OWASP: MFA, Zurücksetzen und Faktorwechsel](https://cheatsheetseries.owasp.org/cheatsheets/Multifactor_Authentication_Cheat_Sheet.html).

Passwort-Zurücksetzen deaktiviert den Faktor nicht. Passwort-, Sperr- und Faktoränderungen entwerten offene Anmeldeprüfungen. Die Aktivierung widerruft andere Sitzungen einschließlich Erweiterung und rotiert die aktuelle Sitzung; laufende Timer bleiben bestehen. Ein Rollenwechsel behält seinen bestehenden Widerrufsvertrag. E-Mail-Änderungen dürfen kein Wiederherstellungs- oder Faktor-Umgehungsweg werden.

## Speicherung und Schlüsselbetrieb

Geplanter Speicherumfang: Profil-Anzeigename; Faktorstatus und verschlüsseltes Geheimnis; zuletzt verbrauchter Zeitschritt; Sicherheitsrevision des Kontos; befristete Anmelde-/Einrichtungsprüfungen mit Tokenhash und Fehlversuchen; Wiederherstellungscode-Hashes. Eigentumsprüfung und eingeschränkte Datenbankrolle bleiben erhalten. Sicherheitsdaten erhalten keine allgemeine CRUD-Schnittstelle.

TOTP-Geheimnisse müssen für die Berechnung entschlüsselbar bleiben. Geplant ist AES-256-GCM mit zufälligem Nonce je Verschlüsselung und Bindung an Konto und Formatversion. Der Hauptschlüssel liegt außerhalb der Datenbank unter `/etc/timereal`, ist auf Dienst und root beschränkt und wird bei Updates erhalten. Bei fehlendem oder falschem Schlüssel wird die Prüfung verweigert; es gibt keinen Passwort-Fallback. Ein bestehender Schlüssel wird nicht automatisch ersetzt. Die OWASP-Quelle oben begründet Verschlüsselung und begrenzte Entschlüsselung; Dateipfad, Algorithmus und Betriebsform sind technische Entscheidungen dieses Projekts.

Vor Freigabe ist die tägliche lokale Sicherung zu erweitern: ein geschütztes, atomar fertiggestelltes Paket enthält Datenbankdump, Schlüssel und Format-/Release-Metadaten. Bestehende `.dump`-Dateien bleiben lesbar und werden nicht umgedeutet. Der Updater sichert vor einer Änderung zusätzlich den Schlüsselbestand. Die externe Sicherung bekommt eine ausdrückliche Prüfung der Schlüsseldatei. Der Wiederherstellungstest startet einen Ersatzbestand und meldet sich mit dem vorher eingerichteten Authenticator an; nur `pg_restore --list` wäre kein Nachweis.

Audit erfasst Einrichtung, Aktivierung, Ausschalten, Codeerneuerung und Wiederherstellungsverwendung als benannte Ereignisse. Codes, QR-Inhalt, Geheimnisse, Challenge-Token und Schlüssel erscheinen weder in Audit noch Logs, Fehlerantworten oder URL-Parametern. Browserseitig wird der Einrichtungsinhalt nach Abschluss und Abmeldung entfernt. QR-Erzeugung erfolgt lokal ohne externen Bilddienst.

## Lieferfolge und Abnahme

1. Datenbank- und Anmeldevertrag mit Tests zuerst: fehlender Faktor verhindert Sitzung; gültiger Abschluss erlaubt sie; Parallelverwendung, Ablauf, Fehlversuche, Sperre und Passwortänderung werden gegen echtes PostgreSQL geprüft. Ein Aufruf des alten `sitzung_anlegen()` kann einen aktiven Faktor nicht umgehen.
2. Schlüsselanlage und Sicherung: Neuinstallation, bestehender Container, Update, fehlender/falscher Schlüssel und Wiederherstellung im eigenen systemd-Prüfgast. Keine Änderungen auf Lars' LXC.
3. Freigegebene Profil-/Einrichtungsansichten und nach Bildentscheidung ergänzte Anmeldungs-/Verwaltungsansichten verbinden. Echte QR-Daten, Tastatur, kleine Breiten, vergrößerte Schrift, Abbruch und verlorene Antwort prüfen.
4. Tatsächlich geladene Erweiterung durch die vollständige Anmeldung führen; Teilanmeldung und widerrufene Sitzung ablehnen. API-Version und Kompatibilitätsgrenzen anhand dieses Laufs festlegen, nicht nur am Typmodell.
5. Audit, Geheimnisprüfung, Gesamt- und Lastlauf, Rückfall auf alten Anwendungsstand mit aktiver 2FA. Release erst nach diesen Nachweisen; ein alter Stand darf bei aktivierter 2FA den Zugriff verweigern, aber nicht den Faktor überspringen.

Noch zu qualifizieren sind die konkrete TOTP-/QR-Bibliothek, die Tabellen-/API-Signaturen und der genaue Wiederherstellungsbefehl. Diese Punkte werden vor Implementierung an vorhandenen Abhängigkeiten und realen Testaufbauten entschieden. Die Bildfreigabe ist erteilt; dieser Entwurf behauptet keinen abgeschlossenen Bau.
