\set ON_ERROR_STOP on
-- Unveränderte Migrationen des 0.5-Piloten als Ausgangspunkt des Update-Lasttests.
CREATE TABLE timereal_migration(version integer PRIMARY KEY);
\ir ../datenmodell/migrationen/001-grundmodell.sql
\ir ../datenmodell/migrationen/002-pilot.sql
\ir ../datenmodell/migrationen/003-konten.sql
\ir ../datenmodell/migrationen/004-arbeitsablauf.sql
\ir ../datenmodell/migrationen/005-erweiterung.sql
