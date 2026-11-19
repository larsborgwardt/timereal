import { test } from "node:test";
import assert from "node:assert/strict";
import { journalLeser } from "../betrieb/verwaltung/journal.mjs";

// journalctl JSON gemäß systemd.journal-fields(7): Zeit in Mikrosekunden,
// PRIORITY als Text, mehrfache/binary Felder können Arrays sein.
const datensatz = (
  message,
  unit = "timereal.service",
  priority = "6",
  nr = 1,
) => ({
  __REALTIME_TIMESTAMP: String(1795093200000000 + nr * 1000000),
  _SYSTEMD_UNIT: unit,
  PRIORITY: priority,
  MESSAGE: message,
});
const jsonl = (rows) => rows.map(JSON.stringify).join("\n");

test("Journal: feste Dienste, echte Prioritäten und explizite Abschlussereignisse", async () => {
  const calls = [];
  const lesen = journalLeser({
    ausfuehren: async (...args) => {
      calls.push(args);
      return {
        stdout: jsonl([
          datensatz("Anwendung gestartet"),
          datensatz("Warnung", "timereal-https.service", "4", 2),
          datensatz(
            JSON.stringify({
              level: "error",
              msg: "HTTPS fehlgeschlagen",
              request: { headers: { Cookie: "VERTRAULICH" } },
            }),
            "timereal-https.service",
            "6",
            3,
          ),
          datensatz(
            JSON.stringify({
              timereal_log: 1,
              level: "complete",
              msg: "Update abgeschlossen",
            }),
            "timereal-betrieb.service",
            "6",
            4,
          ),
          datensatz("Fremder Dienst", "ssh.service", "0", 5),
          datensatz("Kritisch", "timereal.service", "2", 6),
          datensatz("Diagnose", "timereal.service", "7", 7),
        ]),
      };
    },
  });
  const result = await lesen({});
  assert.deepEqual(
    result.zeilen.map((z) => z.level),
    ["info", "warn", "error", "complete", "fatal", "debug"],
  );
  assert.equal(result.zeilen[2].text, "HTTPS fehlgeschlagen");
  assert.ok(!JSON.stringify(result).includes("VERTRAULICH"));
  assert.equal(calls[0][0], "/usr/bin/journalctl");
  for (const unit of [
    "timereal.service",
    "timereal-betrieb.service",
    "timereal-https.service",
  ])
    assert.ok(calls[0][1].includes("_SYSTEMD_UNIT=" + unit));
  assert.ok(calls[0][1].includes("--lines=500"));
  assert.ok(calls[0][1].includes("--since=-24h"));
  assert.ok(calls[0][2].timeout <= 3000);
  assert.ok(calls[0][2].maxBytes <= 4194304);
  assert.equal(
    (await lesen({ quelle: "https", level: "error", suche: "FEHLGESCHLAGEN" }))
      .zeilen.length,
    1,
  );
  assert.equal(
    (await lesen({ suche: "VERTRAULICH" })).zeilen.length,
    0,
    "Suche darf keine verworfenen Geheimfelder verraten",
  );
  assert.equal(
    calls.length,
    1,
    "Ein gemeinsamer kurzer Snapshot für unterschiedliche Filter",
  );
});

test("Journal: ungültige Filter erreichen keinen Prozess", async () => {
  let calls = 0;
  const lesen = journalLeser({
    ausfuehren: async () => {
      calls++;
      return { stdout: "" };
    },
  });
  for (const filter of [
    null,
    [],
    { quelle: "ssh.service" },
    { level: "trace" },
    { suche: "x".repeat(201) },
    { suche: 12 },
    { befehl: "id" },
    { quelle: "__proto__" },
  ])
    await assert.rejects(lesen(filter), (e) => e.code === "EINGABE");
  assert.equal(calls, 0);
  assert.deepEqual((await lesen({})).zeilen, []);
});

test("Journal: fremde Levelnamen und Prioritäts-Eigenschaften bleiben gewöhnliche Meldungen", async () => {
  const lesen = journalLeser({
    ausfuehren: async () => ({
      stdout: jsonl([
        datensatz("Unbekannte Priorität", "timereal.service", "map"),
        datensatz(
          JSON.stringify({ level: "success", msg: "Kein Timereal-Ereignis" }),
        ),
        datensatz(
          JSON.stringify({
            level: "complete",
            timereal_log: 1,
            msg: "Kein Betriebsabschluss",
          }),
          "timereal-https.service",
        ),
      ]),
    }),
  });
  assert.deepEqual(
    (await lesen({})).zeilen.map((z) => z.level),
    ["info", "info", "info"],
  );
});

test("Journal: Zugangsdaten, Steuerzeichen, Binärfelder und überlange Meldungen", async () => {
  const lesen = journalLeser({
    ausfuehren: async () => ({
      stdout: jsonl([
        datensatz("Authorization: Bearer GEHEIM_A"),
        datensatz("Cookie: timereal=GEHEIM_B; anderes=GEHEIM_C"),
        datensatz(
          "Fehler https://name:GEHEIM_D@host.test/pfad?token=GEHEIM_E#GEHEIM_F",
        ),
        datensatz('password="GEHEIM_G mit Leerzeichen" token=GEHEIM_H'),
        datensatz('{"request":{"password":"GEHEIM_I"}}'),
        datensatz('{"password":"GEHEIM_J"'),
        datensatz(
          "-----BEGIN PRIVATE KEY-----\nGEHEIM_K\n-----END PRIVATE KEY-----",
        ),
        datensatz([65, 66, 67]),
        datensatz("\u001b[31mMeldung\u001b[0m\r\nweiter\u202e"),
        datensatz("ä".repeat(5000)),
        { ...datensatz("Falsches Datum"), __REALTIME_TIMESTAMP: "kaputt" },
      ]),
    }),
  });
  const result = await lesen({});
  assert.doesNotMatch(JSON.stringify(result), /GEHEIM_[A-K]/);
  for (const row of result.zeilen) {
    assert.ok(Buffer.byteLength(row.text) <= 2048);
    assert.doesNotMatch(row.text, /[\u0000-\u001f\u007f\u202e]/);
    assert.ok(Number.isFinite(Date.parse(row.zeit)));
  }
  assert.ok(result.zeilen.some((z) => z.text.includes("Meldung")));
  assert.ok(result.ausgelassen > 0);
});

test("Journal: parallele Aufrufe, Ablauf, Fehler und begrenzter Ergebnisspeicher", async () => {
  let calls = 0,
    now = 10000,
    fail = false;
  const lesen = journalLeser({
    jetzt: () => now,
    ausfuehren: async () => {
      calls++;
      await new Promise((resolve) => setImmediate(resolve));
      if (fail) throw new Error("privates Prozessdetail");
      return {
        stdout: jsonl(
          Array.from({ length: 800 }, (_, i) =>
            datensatz("Meldung " + i, "timereal.service", "6", i),
          ),
        ),
      };
    },
  });
  const results = await Promise.all(
    Array.from({ length: 20 }, () => lesen({})),
  );
  assert.equal(calls, 1);
  assert.equal(results[0].zeilen.length, 500);
  assert.equal(results[0].zeilen.at(-1).text, "Meldung 799");
  assert.ok(Buffer.byteLength(JSON.stringify(results[0])) < 1048576);
  now += 2001;
  fail = true;
  await assert.rejects(
    lesen({}),
    (e) => e.code === "JOURNAL" && !e.message.includes("privates"),
  );
  await assert.rejects(lesen({}), (e) => e.code === "JOURNAL");
  assert.equal(calls, 2, "Auch Fehler bremsen Folgeabrufe");
  fail = false;
  now += 2001;
  assert.equal((await lesen({})).zeilen.length, 500);
  assert.equal(calls, 3);
});
