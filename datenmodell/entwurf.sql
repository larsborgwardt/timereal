\set ON_ERROR_STOP on
-- Für psql -f ausführen. Die Sperre gilt auch zwischen den Transaktionen.
SELECT pg_advisory_lock(675039138012);
CREATE TABLE IF NOT EXISTS timereal_migration (version integer PRIMARY KEY);
SELECT to_regclass('public.konto') IS NULL AS neu \gset
\if :neu
\ir migrationen/001-grundmodell.sql
\endif
SELECT NOT EXISTS(SELECT FROM timereal_migration WHERE version=2) AS erweitern \gset
\if :erweitern
\ir migrationen/002-pilot.sql
\endif
SELECT pg_advisory_unlock(675039138012);
