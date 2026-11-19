BEGIN;
CREATE TABLE erweiterungscode (
 code_hash text PRIMARY KEY CHECK(code_hash ~ '^[a-f0-9]{64}$'),
 konto_id bigint NOT NULL REFERENCES konto,
 quelle text NOT NULL REFERENCES sitzung(schluessel),
 challenge text NOT NULL CHECK(challenge ~ '^[A-Za-z0-9_-]{43}$'),
 redirect text NOT NULL,
 ablauf timestamptz NOT NULL DEFAULT clock_timestamp()+interval '3 minutes',
 verbraucht_am timestamptz
);
ALTER TABLE erweiterungscode ENABLE ROW LEVEL SECURITY;
CREATE POLICY eigener_code ON erweiterungscode USING(konto_id=aktuelles_konto()) WITH CHECK(konto_id=aktuelles_konto());
GRANT SELECT,INSERT,DELETE ON erweiterungscode TO timereal_app;
CREATE FUNCTION erweiterung_anmelden(hash text,pruefung text,ruecksprung text,sessionhash text) RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE c public.erweiterungscode; BEGIN
 -- Dieselbe Sperrreihenfolge wie normale Anfragen und Kontosperre: erst Konto.
 PERFORM k.id FROM public.konto k JOIN public.erweiterungscode e ON e.konto_id=k.id
 WHERE e.code_hash=hash AND k.aktiv FOR UPDATE OF k;
 IF NOT FOUND THEN RETURN false; END IF;
 SELECT * INTO c FROM public.erweiterungscode WHERE code_hash=hash AND ablauf>clock_timestamp()
 AND verbraucht_am IS NULL AND challenge=pruefung AND redirect=ruecksprung FOR UPDATE;
 IF NOT FOUND THEN RETURN false; END IF;
 PERFORM 1 FROM public.sitzung WHERE schluessel=c.quelle AND konto_id=c.konto_id AND client='web'
 AND widerrufen_am IS NULL AND ablauf>clock_timestamp() FOR UPDATE;
 IF NOT FOUND THEN RETURN false; END IF;
 INSERT INTO public.sitzung(schluessel,konto_id,client,ablauf)
 VALUES(sessionhash,c.konto_id,'erweiterung',clock_timestamp()+interval '14 days');
 UPDATE public.erweiterungscode SET verbraucht_am=clock_timestamp() WHERE code_hash=hash;
 RETURN true;
END; $$;
REVOKE ALL ON FUNCTION erweiterung_anmelden(text,text,text,text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION erweiterung_anmelden(text,text,text,text) TO timereal_app;
INSERT INTO timereal_migration VALUES(5);
COMMIT;
