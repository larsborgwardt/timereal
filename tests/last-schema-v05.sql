\set ON_ERROR_STOP on
-- Unveränderte Migrationen des 0.5-Piloten als Ausgangspunkt des Update-Lasttests.
CREATE TABLE timereal_migration(version integer PRIMARY KEY);
\ir ../datenmodell/migrationen/001-grundmodell.sql
\ir ../datenmodell/migrationen/002-pilot.sql
\ir ../datenmodell/migrationen/003-konten.sql
\ir ../datenmodell/migrationen/004-arbeitsablauf.sql
\ir ../datenmodell/migrationen/005-erweiterung.sql
-- PostgreSQL bindet SELECT * beim Anlegen einer View an die damaligen Spalten.
-- Der Inhaltsvergleich misst dadurch die Bestandswerte des Piloten auch dann,
-- wenn eine spätere Migration zusätzliche Spalten ergänzt.
CREATE VIEW timereal_last_konto_v05 AS SELECT * FROM konto;
CREATE VIEW timereal_last_kunde_v05 AS SELECT * FROM kunde;
CREATE VIEW timereal_last_ziel_v05 AS SELECT * FROM buchungsziel;
CREATE VIEW timereal_last_zeit_v05 AS SELECT * FROM zeitabschnitt;
