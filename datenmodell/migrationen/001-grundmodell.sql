-- Modellvorschlag für eine leere PostgreSQL-Datenbank.
BEGIN;
CREATE EXTENSION IF NOT EXISTS btree_gist;

CREATE TABLE konto (
    id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    login_referenz text NOT NULL UNIQUE CHECK (btrim(login_referenz) <> ''),
    zeitzone text NOT NULL DEFAULT 'Europe/Berlin',
    timer_version bigint NOT NULL DEFAULT 0 CHECK (timer_version >= 0)
);

CREATE TABLE kunde (
    konto_id bigint NOT NULL REFERENCES konto,
    id bigint GENERATED ALWAYS AS IDENTITY,
    name text NOT NULL CHECK (btrim(name) <> ''),
    PRIMARY KEY (konto_id, id)
);

CREATE TABLE buchungsziel (
    konto_id bigint NOT NULL,
    id bigint GENERATED ALWAYS AS IDENTITY,
    kunde_id bigint NOT NULL,
    art text NOT NULL CHECK (art IN ('Ticket', 'Projekt', 'Termin')),
    bezeichnung text NOT NULL CHECK (btrim(bezeichnung) <> ''),
    PRIMARY KEY (konto_id, id),
    FOREIGN KEY (konto_id, kunde_id) REFERENCES kunde (konto_id, id)
);

CREATE TABLE zeitabschnitt (
    konto_id bigint NOT NULL,
    id bigint GENERATED ALWAYS AS IDENTITY,
    ziel_id bigint NOT NULL,
    beginn timestamptz NOT NULL,
    ende timestamptz,
    leistungstext text NOT NULL DEFAULT '',
    abrechenbar boolean NOT NULL DEFAULT true,
    fassung bigint NOT NULL DEFAULT 1 CHECK (fassung > 0),
    uebertragene_fassung bigint,
    PRIMARY KEY (konto_id, id),
    FOREIGN KEY (konto_id, ziel_id) REFERENCES buchungsziel (konto_id, id),
    CHECK (isfinite(beginn) AND extract(second FROM beginn AT TIME ZONE 'UTC') = 0),
    CHECK (ende IS NULL OR (isfinite(ende) AND ende >= beginn
                            AND extract(second FROM ende AT TIME ZONE 'UTC') = 0)),
    CHECK (uebertragene_fassung IS NULL OR
           (ende IS NOT NULL AND uebertragene_fassung BETWEEN 1 AND fassung)),
    CONSTRAINT zeiten_ohne_ueberlappung EXCLUDE USING gist
        (konto_id WITH =, tstzrange(beginn, ende, '[)') WITH &&)
        DEFERRABLE INITIALLY IMMEDIATE
);

CREATE INDEX zeitabschnitt_verlauf ON zeitabschnitt (konto_id, beginn DESC, id DESC);
CREATE INDEX buchungsziel_nach_kunde ON buchungsziel (konto_id, kunde_id);

CREATE FUNCTION zeitabschnitt_fassung_pflegen() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
    NEW.fassung := OLD.fassung;
    IF ROW(NEW.ziel_id, NEW.beginn, NEW.ende, NEW.leistungstext, NEW.abrechenbar)
       IS DISTINCT FROM
       ROW(OLD.ziel_id, OLD.beginn, OLD.ende, OLD.leistungstext, OLD.abrechenbar) THEN
        NEW.fassung := OLD.fassung + 1;
        NEW.uebertragene_fassung := OLD.uebertragene_fassung;
    END IF;
    RETURN NEW;
END;
$$;

CREATE TRIGGER zeitabschnitt_fassung
    BEFORE UPDATE ON zeitabschnitt
    FOR EACH ROW EXECUTE FUNCTION zeitabschnitt_fassung_pflegen();

-- Der spätere API-Zugang nutzt eine Rolle ohne Tabellenbesitz und ohne BYPASSRLS.
-- Innerhalb jeder Transaktion stammt app.konto_id aus der authentifizierten Sitzung.
CREATE FUNCTION aktuelles_konto() RETURNS bigint
LANGUAGE sql STABLE AS $$
    SELECT NULLIF(current_setting('app.konto_id', true), '')::bigint
$$;

ALTER TABLE konto ENABLE ROW LEVEL SECURITY;
ALTER TABLE kunde ENABLE ROW LEVEL SECURITY;
ALTER TABLE buchungsziel ENABLE ROW LEVEL SECURITY;
ALTER TABLE zeitabschnitt ENABLE ROW LEVEL SECURITY;
CREATE POLICY eigenes_konto ON konto USING (id = aktuelles_konto());
CREATE POLICY eigene_kunden ON kunde USING (konto_id = aktuelles_konto());
CREATE POLICY eigene_ziele ON buchungsziel USING (konto_id = aktuelles_konto());
CREATE POLICY eigene_zeiten ON zeitabschnitt USING (konto_id = aktuelles_konto());

COMMIT;
