BEGIN;
REVOKE CREATE ON SCHEMA public FROM PUBLIC;
CREATE ROLE timereal_app LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOBYPASSRLS;
ALTER TABLE konto
    ADD COLUMN passwort_hash text,
    ADD COLUMN aktiv boolean NOT NULL DEFAULT true,
    ADD COLUMN ist_admin boolean NOT NULL DEFAULT false,
    ADD COLUMN nachkommastellen integer NOT NULL DEFAULT 2 CHECK (nachkommastellen IN (2,3)),
    ADD COLUMN pruefminuten integer NOT NULL DEFAULT 480 CHECK (pruefminuten > 0);
ALTER TABLE buchungsziel
    ADD COLUMN projekt_id bigint,
    ADD COLUMN abrechenbar boolean NOT NULL DEFAULT true,
    ADD COLUMN projekt_art text GENERATED ALWAYS AS ('Projekt'::text) STORED,
    ADD UNIQUE (konto_id,kunde_id,id,art),
    ADD UNIQUE (konto_id,kunde_id,id),
    ADD FOREIGN KEY (konto_id,kunde_id,projekt_id,projekt_art) REFERENCES buchungsziel(konto_id,kunde_id,id,art),
    ADD CHECK (projekt_id IS NULL OR art <> 'Projekt');
ALTER TABLE zeitabschnitt
    ALTER COLUMN ziel_id DROP NOT NULL,
    ADD COLUMN art text NOT NULL DEFAULT 'zugeordnet',
    ADD COLUMN kunde_id bigint,
    ADD COLUMN pruefen boolean NOT NULL DEFAULT false,
    ADD COLUMN storniert boolean NOT NULL DEFAULT false,
    ADD COLUMN storno_bestaetigt boolean NOT NULL DEFAULT false,
    ADD COLUMN uebertragener_stand jsonb;
UPDATE zeitabschnitt a SET kunde_id=z.kunde_id FROM buchungsziel z
 WHERE (a.konto_id,a.ziel_id)=(z.konto_id,z.id);
ALTER TABLE zeitabschnitt
    ADD FOREIGN KEY (konto_id,kunde_id) REFERENCES kunde(konto_id,id),
    ADD FOREIGN KEY (konto_id,kunde_id,ziel_id) REFERENCES buchungsziel(konto_id,kunde_id,id),
    ADD CHECK ((art='zugeordnet' AND kunde_id IS NOT NULL AND ziel_id IS NOT NULL)
            OR (art='vorlaeufig' AND ziel_id IS NULL)
            OR (art='intern' AND kunde_id IS NULL AND ziel_id IS NULL AND NOT abrechenbar)),
    ADD CHECK (NOT storniert OR ende IS NOT NULL),
    ADD CHECK (NOT storno_bestaetigt OR storniert),
    DROP CONSTRAINT zeiten_ohne_ueberlappung,
    ADD CONSTRAINT zeiten_ohne_ueberlappung EXCLUDE USING gist
      (konto_id WITH =, tstzrange(beginn,ende,'[)') WITH &&)
      WHERE (NOT storniert) DEFERRABLE INITIALLY IMMEDIATE;
CREATE OR REPLACE FUNCTION zeitabschnitt_fassung_pflegen() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
    IF ROW(NEW.art,NEW.kunde_id,NEW.ziel_id,NEW.beginn,NEW.ende,NEW.leistungstext,NEW.abrechenbar,NEW.pruefen,NEW.storniert)
       IS DISTINCT FROM
       ROW(OLD.art,OLD.kunde_id,OLD.ziel_id,OLD.beginn,OLD.ende,OLD.leistungstext,OLD.abrechenbar,OLD.pruefen,OLD.storniert) THEN
        NEW.fassung := OLD.fassung+1;
    ELSE NEW.fassung := OLD.fassung;
    END IF;
    RETURN NEW;
END; $$;
ALTER TABLE konto ADD COLUMN pause_abschnitt_id bigint,
    ADD FOREIGN KEY (id,pause_abschnitt_id) REFERENCES zeitabschnitt(konto_id,id);
CREATE TABLE sitzung (
    schluessel text PRIMARY KEY CHECK (length(schluessel)=64),
    konto_id bigint NOT NULL REFERENCES konto,
    client text NOT NULL CHECK (client IN ('web','erweiterung')),
    ablauf timestamptz NOT NULL,
    widerrufen_am timestamptz
);
CREATE INDEX sitzung_konto ON sitzung(konto_id);
CREATE TABLE timer_auftrag (
    konto_id bigint NOT NULL REFERENCES konto,
    schluessel uuid NOT NULL,
    anfrage jsonb NOT NULL,
    antwort jsonb NOT NULL,
    PRIMARY KEY (konto_id,schluessel)
);
ALTER TABLE timer_auftrag ENABLE ROW LEVEL SECURITY;
CREATE POLICY eigener_auftrag ON timer_auftrag USING (konto_id=aktuelles_konto());

CREATE FUNCTION sitzung_pruefen(hash text, kanal text) RETURNS bigint
LANGUAGE sql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
    SELECT k.id FROM public.konto k JOIN public.sitzung s ON s.konto_id=k.id
    WHERE s.schluessel=hash AND s.client=kanal AND k.aktiv AND s.ablauf>clock_timestamp()
          AND s.widerrufen_am IS NULL FOR UPDATE OF k,s
$$;
CREATE FUNCTION login_suchen(login text) RETURNS TABLE(id bigint, hash text)
LANGUAGE sql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
    SELECT id,passwort_hash FROM public.konto WHERE login_referenz=login AND aktiv
$$;
CREATE FUNCTION sitzung_anlegen(k bigint,hash text,kanal text,erwartet text) RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
BEGIN
    PERFORM 1 FROM public.konto WHERE id=k AND aktiv AND passwort_hash IS NOT DISTINCT FROM erwartet FOR UPDATE;
    IF NOT FOUND THEN RETURN false; END IF;
    INSERT INTO public.sitzung VALUES(hash,k,kanal,clock_timestamp()+interval '14 days',NULL);
    RETURN true;
END; $$;
CREATE FUNCTION sitzung_beenden(hash text) RETURNS void
LANGUAGE sql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
    UPDATE public.sitzung SET widerrufen_am=now() WHERE schluessel=hash AND konto_id=public.aktuelles_konto()
$$;
CREATE FUNCTION sperre_anwenden() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
    IF OLD.aktiv AND NOT NEW.aktiv THEN
        UPDATE sitzung SET widerrufen_am=now() WHERE konto_id=NEW.id AND widerrufen_am IS NULL;
        UPDATE zeitabschnitt SET ende=greatest(beginn,date_trunc('minute',clock_timestamp())),pruefen=true
        WHERE konto_id=NEW.id AND ende IS NULL;
        NEW.pause_abschnitt_id:=NULL;
        NEW.timer_version:=OLD.timer_version+1;
    END IF;
    RETURN NEW;
END; $$;
CREATE TRIGGER kontosperre BEFORE UPDATE OF aktiv ON konto FOR EACH ROW EXECUTE FUNCTION sperre_anwenden();
REVOKE ALL ON FUNCTION sitzung_pruefen(text,text),login_suchen(text),sitzung_anlegen(bigint,text,text,text),sitzung_beenden(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION sitzung_pruefen(text,text), login_suchen(text), sitzung_anlegen(bigint,text,text,text),sitzung_beenden(text) TO timereal_app;
GRANT USAGE ON SCHEMA public TO timereal_app;
GRANT SELECT(id,login_referenz,zeitzone,timer_version,nachkommastellen,pruefminuten,pause_abschnitt_id) ON konto TO timereal_app;
GRANT UPDATE(timer_version,pause_abschnitt_id) ON konto TO timereal_app;
GRANT SELECT,INSERT,UPDATE ON kunde,buchungsziel,zeitabschnitt TO timereal_app;
GRANT SELECT,INSERT ON timer_auftrag TO timereal_app;
GRANT USAGE ON SEQUENCE kunde_id_seq,buchungsziel_id_seq,zeitabschnitt_id_seq TO timereal_app;
INSERT INTO timereal_migration VALUES (1),(2);
COMMIT;
