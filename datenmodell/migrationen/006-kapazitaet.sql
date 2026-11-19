BEGIN;
-- Der Timerzugriff soll nicht den gesamten persönlichen Zeitbestand durchsuchen.
CREATE UNIQUE INDEX zeitabschnitt_ein_timer ON zeitabschnitt(konto_id) WHERE ende IS NULL;
-- Getrennte Zugriffspfade für abgeschlossene Zeiten und Null-Minuten-Abschnitte.
-- Historie muss auch stornierte und an einer Tagesgrenze leere Abschnitte finden.
CREATE INDEX zeitabschnitt_ende ON zeitabschnitt(konto_id,ende) WHERE ende IS NOT NULL;
CREATE INDEX zeitabschnitt_leer ON zeitabschnitt(konto_id,beginn) WHERE ende=beginn;
INSERT INTO timereal_migration VALUES(6);
COMMIT;
