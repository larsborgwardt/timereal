# Rollenvertrag — Folgepaket 0.8.1

Freigabe: RELEASEPLAN.md D-RELEASE-004; Zielbilder mockups/11-konten-desktop.png und 11-konten-mobil.png. Ausgangspunkt: 0.8.0.

| Fähigkeit | Berater | Betrieb | Administrator |
|---|---|---|---|
| Eigene Kunden, Zeiten, Nachweise und Einstellungen | ja | ja | ja |
| Updates, Domainzugriff und Systemkonsole | nein | Websitzung | Websitzung |
| Konten, Einladungen und Rollen | nein | nein | Websitzung |
| Audit-Protokoll | nein | nein | ab 0.8.2 |
| Fremde Kunden oder Buchungstexte | nein | nein | nein |

Die vorhandene Administrator-Eigenschaft bleibt für ältere Anwendungen und den bestehenden Konto-CLI kompatibel. Eine zusätzliche Betriebseigenschaft ergänzt das Modell; die Rolle wird daraus eindeutig abgeleitet. Die Anwendungsrolle erhält keine Schreibberechtigung auf diese Eigenschaften. Rollenänderungen laufen über eine berechtigungsgeprüfte Datenbankfunktion.

Ein tatsächlich geänderter Rollenwert widerruft die Sitzungen des betroffenen Kontos. Ein unveränderter Wert bleibt ohne Widerruf. Das erneute Anmelden übernimmt die neuen Rechte; ein laufender persönlicher Timer bleibt durch den Rollenwechsel erhalten. Eine Kontosperre behält das bestehende Verhalten: Timer beenden und zur Prüfung markieren, Pause zurücksetzen, Sitzungen widerrufen.

Das eigene Administratorkonto bleibt wie bisher in der Oberfläche vor Sperre geschützt; die freigegebene Vorlage zeigt es als eigenes Konto ohne Änderungsaktionen. Der letzte aktive Administrator darf über die Verwaltungsfunktion weder herabgestuft noch gesperrt werden. Rollen-/Sperränderungen werden bereits vor der Sitzungssperre serialisiert, sodass zwei Administratoren einander nicht parallel herabstufen können. Die Prüfung und das Schreiben geschehen in derselben Transaktion. Nach der Sperre wird die Berechtigung erneut aus dem aktuellen Datenbankstand geprüft.

Die neue Oberfläche bewahrt einen noch ungespeicherten Rollenentwurf bei Hintergrundaktualisierung. Rollen- und Sperraktionen nennen das betroffene Konto; der Bereich erklärt die Rollen wie im Zielbild. Die 2FA-Statuszeile wird erst mit der tatsächlichen 2FA-Funktion in 0.9.0 eingebunden. Einladungen erzeugen weiterhin Berater; ein Administrator kann anschließend die Rolle ändern.

Prüfungen: PostgreSQL mit eingeschränkter Anwendungsrolle; Berechtigungsmatrix über HTTP; direkte Fremddatenabfragen; Rollenwechsel mit Web-/Erweiterungssitzung und laufendem Timer; gleicher Wert ohne Widerruf; ungültiger Wert; letzter Administrator; konkurrierende Herabstufung/Sperre; echte Browserbedienung bei 1280/390/320 Pixeln und vergrößerter Schrift. Migrations- und Rückwärtskompatibilität anhand vorhandener 0.8.0-Abfragen. Unbefugte Anfragen dürfen den privilegierten Unix-Dienst nicht erreichen.
