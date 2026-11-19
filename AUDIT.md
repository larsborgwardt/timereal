# Audit-Protokoll — Paket 0.8.2

Freigabe: D-RELEASE-005 in RELEASEPLAN.md, Bilder 11. Administratoren lesen und exportieren Sicherheits- und Verwaltungsereignisse. Betrieb und Berater erhalten keinen Zugriff; Erweiterungssitzungen bleiben ausgeschlossen. Die Buchungshistorie bleibt ein eigener persönlicher Bereich.

## Ereignisse und Daten

Erfasst werden Kontoanlage, tatsächliche Rollen-/Sperränderung, Passwort- und E-Mail-Änderung, Anmeldung/Sitzungserstellung und Sitzungswiderruf, Einladung/Erneuerung/Annahme/Widerruf sowie Passwortzurücksetzung. Datenbanktrigger schreiben diese Ereignisse in derselben Transaktion wie die Änderung. Abgebrochene Transaktionen erzeugen keinen Erfolgseintrag. Unveränderte Werte erzeugen kein Änderungsereignis. Fehlgeschlagene Anmeldungen werden gesondert vom Server gemeldet; unbekannte eingegebene Namen werden nicht gespeichert.

Ein Ereignis enthält Zeitpunkt, festgelegte Ereignisart, handelndes Konto soweit bekannt und betroffenes Konto beziehungsweise die Einladung. Rollenänderungen enthalten die bisherige und neue Rolle. Für die freigegebene Darstellung werden Kontonamen beziehungsweise Einladungsempfänger festgehalten. Es werden keine Buchungstexte, Passwörter, Passwort-Hashes, Sitzungsschlüssel, Linkcodes oder vollständigen Anfrageinhalte abgelegt. Der Anwendung fehlen direkte Schreib-/Änderungs-/Löschrechte am Protokoll.

## Ansicht und Export

Die API beschränkt Ergebnisse auf die vergangenen 180 Tage und auf bereits eingetretene Ereignisse. Von/Bis beziehen sich auf die persönliche Zeitzone des lesenden Administrators. Suche behandelt den Begriff als Text, nicht als SQL-Muster. Die Liste lädt begrenzte Seiten und verwendet eine stabile Ereignis-ID als Cursor. Neue Ereignisse erscheinen nach Aktualisieren, ohne nachgeladene Seiten zu verdoppeln. Ein Export enthält die gefilterte Auswahl bis zur angegebenen Obergrenze; bei Überschreitung verlangt er engere Filter statt still zu kürzen. JSON vermeidet die Ausführung von Tabellenformeln beim Öffnen eines Exports.

Das Lesefenster ist keine Löschregel. Ältere Einträge werden von der App nicht angezeigt und zunächst nicht automatisch gelöscht. Ein Aufbewahrungs-/Wartungsweg bleibt eine gesonderte Betriebsentscheidung.

## API

`GET /api/v1/verwaltung/audit` liest eine Seite mit höchstens 100 Ereignissen. Optionale Parameter: `von`/`bis` als Datum, `suche` als Text bis 200 Zeichen und `vor` als Ereignis-ID der vorherigen Seite. Die Antwort enthält `eintraege`, `naechsteSeite` und `zeitzone`. `GET /api/v1/verwaltung/audit/export` verwendet dieselben Filter ohne Cursor und liefert die Auswahl als JSON-Anhang. Bei mehr als 5.000 Treffern antwortet er mit 413 und fordert engere Filter. Ohne Anmeldung gilt 401; Berater, Betrieb und Erweiterungssitzungen erhalten 403.

Nicht Teil dieses Protokolls sind Betriebsaufträge und deren Prozessausgabe; sie bleiben unter Updates/Domainzugriff beziehungsweise Systemlogs sichtbar. Fehlgeschlagene Passwortanmeldungen werden erfasst, abgewiesene PKCE-Codeeinlösungen nicht.

## Messungen

Echtes PostgreSQL mit Anwendungsrolle: Rollenmatrix, direkte Rechte, Transaktionsrücknahme, unveränderte Werte, Geheimnis-Ausschluss, 180-Tage-Grenze, Datums-/Suchvalidierung, Pagination und Exportgrenze. Browser: tatsächliche Rolle ändern, Ereignis suchen, weiterladen, exportieren; schmale Ansichten, vergrößerte Schrift, Tastatur, leerer Zustand und Fehler. Keine erfundenen historischen Einträge bei der Migration.
