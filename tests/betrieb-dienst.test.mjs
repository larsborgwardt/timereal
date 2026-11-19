import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm, stat } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { request } from "node:http";
import { dienstStarten } from "../betrieb/verwaltung/dienst.mjs";

function ipc(socketPath, daten) {
  return new Promise((resolve, reject) => {
    const req = request({ socketPath, path: "/", method: "POST" }, (res) => {
      let s = "";
      res.on("data", (d) => (s += d));
      res.on("end", () =>
        resolve({ status: res.statusCode, ...JSON.parse(s) }),
      );
    });
    req.on("error", reject);
    req.end(JSON.stringify(daten));
  });
}
test("Echter Unix-Socket: Annahme vor Abschluss, Wiederholung und Ergebnis nach Neustart", async (t) => {
  const dir = await mkdtemp(join(tmpdir(), "timereal-dienst-"));
  const socketPath = join(dir, "dienst.sock");
  let freigeben;
  const warte = new Promise((r) => (freigeben = r));
  let aufrufe = 0;
  const options = {
    verzeichnis: join(dir, "zustand"),
    socketPath,
    lockPath: join(dir, "lock"),
    status: async () => ({ origin: "https://zeit.test" }),
    ausfuehren: async (_aktion, job, buch) => {
      aufrufe++;
      await warte;
      await buch.fortschreiben(job.id, { zustand: "bereit" });
    },
    wiederherstellen: async () => {
      throw new Error("Kein unterbrochener Auftrag erwartet");
    },
  };
  let server = await dienstStarten(options);
  t.after(async () => {
    freigeben();
    await server.schliessen();
    await rm(dir, { recursive: true, force: true });
  });
  const anfrage = {
    aktion: "update-vorbereiten",
    konto: "1",
    schluessel: crypto.randomUUID(),
    daten: { tag: "v0.7.0" },
  };
  const erster = await ipc(socketPath, { aktion: "annehmen", anfrage });
  assert.equal(erster.status, 200);
  assert.equal(erster.zustand, "vorbereitung");
  const zweiter = await ipc(socketPath, { aktion: "annehmen", anfrage });
  assert.equal(zweiter.id, erster.id);
  assert.equal(aufrufe, 1);
  assert.equal((await stat(socketPath)).mode & 0o777, 0o660);
  assert.equal(
    (await ipc(socketPath, { aktion: "shell", befehl: "id" })).status,
    400,
  );
  freigeben();
  await server.ausstehend();
  assert.equal(
    (await ipc(socketPath, { aktion: "auftrag", id: erster.id })).zustand,
    "bereit",
  );
  await server.schliessen();
  server = await dienstStarten(options);
  assert.equal(
    (await ipc(socketPath, { aktion: "annehmen", anfrage })).id,
    erster.id,
  );
  assert.equal(aufrufe, 1);
});
