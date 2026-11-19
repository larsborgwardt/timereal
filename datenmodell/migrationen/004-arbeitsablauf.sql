BEGIN;
ALTER TABLE kunde ADD COLUMN fassung bigint NOT NULL DEFAULT 1;
ALTER TABLE buchungsziel ADD COLUMN fassung bigint NOT NULL DEFAULT 1;
CREATE FUNCTION stammdaten_fassung() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 NEW.fassung:=OLD.fassung;
 IF (to_jsonb(NEW)-'fassung') IS DISTINCT FROM (to_jsonb(OLD)-'fassung') THEN NEW.fassung:=OLD.fassung+1; END IF;
 RETURN NEW;
END; $$;
CREATE TRIGGER kunde_fassung BEFORE UPDATE ON kunde FOR EACH ROW EXECUTE FUNCTION stammdaten_fassung();
CREATE TRIGGER ziel_fassung BEFORE UPDATE ON buchungsziel FOR EACH ROW EXECUTE FUNCTION stammdaten_fassung();
GRANT UPDATE(nachkommastellen,pruefminuten) ON konto TO timereal_app;
INSERT INTO timereal_migration VALUES(4);
COMMIT;
