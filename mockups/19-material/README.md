# Entwurf 19 — Material 3 mit Material Web

Auftrag von Lars am 20. November 2026: Material Web (github.com/material-components/material-web) auf die Oberfläche anwenden, nachdem die Audit-Befunde erledigt sind. **Noch nicht freigegeben.**

Die Bilder entstehen aus `entwurf.html` mit echten Komponenten von `@material/web` 2.5.0, gebündelt mit esbuild und ausgeliefert unter Timereals Inhaltsrichtlinie. Farbschema: Material 3, abgeleitet vom bisherigen Timereal-Grün. Schrift: die bisherige (Inter bzw. Systemschrift), nicht Roboto.

| Ansicht | Entwurf | Heutiger Stand (0.9.6) |
|---|---|---|
| Anmeldung, Laptop | [19-anmeldung-1280.png](19-anmeldung-1280.png) | [heute-stand-anmeldung-1280.png](heute-stand-anmeldung-1280.png) |
| Anmeldung, Smartphone | [19-anmeldung-390.png](19-anmeldung-390.png) | [heute-stand-anmeldung-390.png](heute-stand-anmeldung-390.png) |
| Heute, Laptop | [19-heute-1280.png](19-heute-1280.png) | [heute-stand-timer-zugeordnet-1280.png](heute-stand-timer-zugeordnet-1280.png) |
| Heute, Smartphone | [19-heute-390.png](19-heute-390.png) | [heute-stand-timer-zugeordnet-390.png](heute-stand-timer-zugeordnet-390.png) |
| Verwaltung → Updates, Laptop | [19-updates-1280.png](19-updates-1280.png) | [heute-stand-betrieb-update-laeuft-1280.png](heute-stand-betrieb-update-laeuft-1280.png) |
| Verwaltung → Updates, Smartphone | [19-updates-390.png](19-updates-390.png) | [heute-stand-betrieb-update-laeuft-390.png](heute-stand-betrieb-update-laeuft-390.png) |

Die Inhalte im Entwurf sind Beispieldaten; die Bilder des heutigen Stands stammen aus den Browserproben mit Testkonten.

## Messungen

- Material Web ist laut README „in maintenance mode pending new maintainers“; letztes Release v2.5.0 vom 15.07.2026 (abgerufen am 20.11.2026).
- Bündel der verwendeten Komponenten: rund 179 KB, gepackt rund 39 KB.
- Unter `style-src 'self'` laden die Komponenten ihre Stile (Constructable Stylesheets). Blockiert werden Inline-Stilattribute beim ersten Zeichnen: Fortschrittsbalken (Wert wirkt erst nach einer Änderung) und Schreibrichtung des Textfelds (folgenlos). Je Seitensatz 30 Fehlermeldungen in der Konsole.
- Karten und eine untere Navigationsleiste gibt es nur im experimentellen Bereich `labs`.
- Schriften und Symbole von Google Fonts sind unter der Richtlinie nicht ladbar und müssten selbst gehostet werden.
- Kein seitliches Überlaufen bei 1280 und 390 Pixeln.

## Offene Punkte am Bild

- Smartphone: Die Hauptnavigation scrollt seitlich; der aktive Bereich steht im Blick, äußere Bereiche sind angeschnitten.
- Smartphone: Listeneinträge mit Schaltfläche am Ende brechen Kundennamen um.
