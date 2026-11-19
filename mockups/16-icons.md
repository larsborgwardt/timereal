# Timereal: Favicon und Erweiterungssymbol

Auftrag vom 19. November 2026: „ich brauche auch ein fav icon bzw. auch ein icon für die browser erweiterung“.

Status: Lars hat den Entwurf mit „Icon wie gezeigt übernehmen (empfohlen)“ freigegeben (D-RELEASE-011). Einbindung in Version 0.9.2; der Serverpatch 0.9.1 enthält diese Icons noch nicht.

## Entwurf und Dateien

- `16-timereal-icon.png`: mit dem eingebauten ImageGen-Werkzeug erzeugte Bildquelle; keine CLI/API-Schlüssel verwendet.
- `16-icons.html` und `16-icons-vorschau.png`: Vorschau mit hellem und dunklem Browser, kleinen Größen und Store-Symbol. Die Browserleisten sind ausdrücklich ein Mockup.
- `../web/icons/`: freigegebene PNG-Exporte in 16, 32, 48, 128 und 180 Pixel. Mechanische Skalierung über Chromium mit der in der Vorschau gezeigten Rundung.
- `../web/favicon.ico`: ICO mit eingebetteten PNG-Bildern in 16, 32 und 48 Pixel.
- `../docs/images/timereal-store-300.png`: separater Store-Export mit 300 × 300 Pixel.

Der 300-Pixel-Export ist für das separate Feld „Extension logo“ im Partner Center vorgesehen. Microsoft empfiehlt 300 × 300 Pixel und verlangt mindestens 128 × 128: https://learn.microsoft.com/en-us/microsoft-edge/extensions/publish/publish-extension#enter-properties-for-a-language

## Designprüfung

Verwendeter Apple-Design-Skill: `/home/hermes/.local/share/idb-skills/upstream/ff4ebddf0488598723a82bfdce1afb04de0b1c44/apple-design/SKILL.md`.

Angewendete Icon-Prüfung: `app-icons.md` › Design (einfaches Motiv, konsistente Wiedererkennung, keine Schrift) und `icons.md` › Best practices (wenige Formen, auch klein erkennbar). Die Uhr bleibt ohne Farberkennung lesbar; der mintfarbene Abschnitt ergänzt sie. Die Vorschau zeigt dieselbe Bildquelle auf hellen und dunklen Browserleisten. Größe und Format der Exporte wurden mit `file web/favicon.ico web/icons/* docs/images/timereal-store-300.png` geprüft. Physische Displays, High-Contrast-Browsermodus und eine echte Edge-Symbolleiste sind damit nicht geprüft.

## Endgültiger ImageGen-Prompt

```text
Draw a strictly flat 2D vector-style app icon on a COMPLETELY OPAQUE SOLID TEAL square canvas, edge to edge background RGB 8,121,111 (#08796f). The whole 1024 by 1024 image is the app icon: no outside frame, no rounded background corners, no transparency. In the center draw a bold thick white circular clock ring, radius about 300px, stroke 65px with rounded ends. The ring has a small separated mint segment (#73edcb) at 1 to 2 o'clock, with simple small gaps on both sides of that mint segment. Inside the ring, white rounded clock hands, same 65px stroke, from center pointing straight up and right at 3 o'clock. A minimal professional brand icon for Timereal consultant time tracking. Precise geometry, generous margins, centered and readable at 16 pixels. Every area is pure flat filled color, like an SVG exported directly to a PNG. ABSOLUTELY NO shading, shadows, glows, highlights, texture, gradients, blurred edges, perspective, depth, 3D, bevels or thin details. No numbers, tick marks, text, wordmark or additional shapes. Uniform opaque teal fill is mandatory everywhere except the white clock and mint arc.
```

Der Prompt ist eine Designvorgabe, keine Behauptung pixelgenauer Modelltreue. Das Ergebnis wurde am Bild geprüft; die PNG-Exporte verwenden diese Bildquelle unverändert bis auf Skalierung und Eckmaske.
