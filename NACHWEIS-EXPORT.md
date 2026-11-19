# Stundennachweise als Excel-Datei

Ab 0.9.3: **Nachweise → Zeitraum und Suche wählen → Übernahme oder Historie → Als Excel exportieren**. Der Download ist eine `.xlsx`-Datei. Änderungen an den Filterfeldern werden beim Klick berücksichtigt, auch wenn „Filtern“ noch nicht gedrückt wurde. Die Datei ändert keine Buchung und bestätigt keine Übernahme.

## Inhalt

Das Blatt **Nachweise** enthält Datum, Kunde, optionales Projekt, Buchungsziel, Art, Leistungstext, Beginn, Ende, Dauer, Dezimalstunden, Abrechenbarkeit, Status und Buchungs-ID. Die Kopfzeile bleibt beim Scrollen sichtbar. Stunden und Dauer sind Zahlen mit Excel-Zahlenformaten; Buchungsziele und Kennungen bleiben Text, damit beispielsweise `00123` erhalten bleibt.

**Übernahme** lässt die Statuswerte „Übertragen“, „Storniert“ und „Nicht abrechenbar“ aus, entsprechend der Bildschirmansicht. **Historie** enthält auch diese Einträge. Vorläufige Einträge sowie „Erneut prüfen“ und „Storno offen“ bleiben erkennbar. Deshalb ist eine ungefilterte Summe der Historie kein abrechenbarer Gesamtbetrag. Laufende Timer werden nicht exportiert.

Der Zeitraum wählt wie die Oberfläche überlappende Zeitabschnitte vollständig aus. Ein über Mitternacht laufender Abschnitt wird nicht am Filterrand abgeschnitten. Die Suche findet wörtliche, nicht zwischen Groß- und Kleinschreibung unterscheidende Treffer in Kunde, Buchungsziel und Projekt. Ein Prozentzeichen ist kein Platzhalter.

Beginn und Ende verwenden die persönliche Zeitzone; die Dauer wird aus den tatsächlichen Zeitpunkten ermittelt, auch bei der Zeitumstellung. Dezimalstunden stammen aus dem aktuellen Buchungsstand mit der persönlichen Rundungsgenauigkeit. Das Blatt **Exportinfo** nennt Konto, Zeitraum, Suche, Ansicht, Zeitzone und diese Auswertungsregeln.

## Grenzen und Kontotrennung

Der Export ist auf 5.000 passende abgeschlossene Abschnitte begrenzt. Bei größerer Auswahl erscheint eine Fehlermeldung; den Zeitraum oder die Suche eingrenzen. Es wird keine unbemerkt gekürzte Datei erzeugt. Eine leere Auswahl ergibt eine Datei mit Kopfzeile und Exportangaben.

Der Endpunkt `GET /api/v1/nachweise/excel` verlangt `von`, `bis`, `ansicht=uebernahme|historie` und optional `suche`. Die Sitzung bestimmt das Konto; eine Konto-ID kann nicht als Auswahl übergeben werden. Die Datenabfrage verwendet dieselbe PostgreSQL-RLS-Grenze wie persönliche Nachweise. Auch Administratoren exportieren hier ihre eigenen Zeiten. Die Erweiterung nutzt ihre separat widerrufbare Sitzung.

Freie Texte werden als String-Zellen geschrieben, nicht als Formeln oder Links ausgeführt. XML-unzulässige Steuerzeichen werden ersetzt; Zeilenumbrüche bleiben erhalten. Der Download erhält `Cache-Control: no-store`. Das Exportieren legt keine dauerhafte serverseitige Datei an.

## Nachweis

`npm test` prüft den Export mit echtem PostgreSQL und einem unabhängigen OOXML-Leser. `BROWSER_TEST=1 npm test` prüft zusätzlich Browserdownload, Fehlerrückmeldung, Sitzung, Abstände und Erweiterung. Die Python-Standardbibliothek wird nur für den unabhängigen Testleser benötigt; die Anwendung erzeugt die Datei mit `write-excel-file` unter Node.js. Releasebezogene Ergebnisse stehen in [nachweise/0.9.3.md](nachweise/0.9.3.md).
