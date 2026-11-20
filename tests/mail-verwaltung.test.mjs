import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readFile, writeFile, stat, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { mailVerwaltung } from "../betrieb/verwaltung/mail.mjs";
import { maildienst } from "../dist/mail.js";
import { smtpKonfiguration } from "../dist/config.js";
import { postfach } from "./hilfe/smtp.mjs";

test("SMTP: leerer Bestand, echte Prüfung, atomare Speicherung, Testmail und sofortiges Einlesen", async (t) => {
  const dir = await mkdtemp(join(tmpdir(), "timereal-smtp-")),
    post = await postfach();
  t.after(async () => {
    await post.close();
    await rm(dir, { recursive: true, force: true });
  });
  const file = join(dir, "mail.json");
  const service = mailVerwaltung({
    datei: file,
    lockPath: join(dir, "lock"),
    maildienst,
  });
  const empty = await service({ aktion: "mail-lesen" });
  assert.equal(empty.konfiguriert, false);
  const dynamic = maildienst(() => smtpKonfiguration(file));
  assert.equal(dynamic.konfiguriert, false);
  const saved = await service({
    aktion: "mail-speichern",
    daten: { ...post.config, user: "", password: "", version: empty.version },
  });
  assert.equal(saved.konfiguriert, true);
  assert.equal("password" in saved, false);
  assert.notEqual(saved.version, empty.version);
  assert.equal((await stat(file)).mode & 0o777, 0o640);
  assert.deepEqual(JSON.parse(await readFile(file, "utf8")), post.config);
  assert.equal(post.nachrichten.length, 0);
  assert.equal(dynamic.konfiguriert, true);
  await dynamic.senden(
    "eingeladen@example.test",
    "einladung",
    "https://zeit.example.test/#einladung=abc",
  );
  assert.equal(post.nachrichten.length, 1);
  await service({
    aktion: "mail-test",
    daten: { email: "admin@example.test", version: saved.version },
  });
  assert.match(post.nachrichten.at(-1), /Timereal.*Testmail/);
  assert.match(post.nachrichten.at(-1), /To: admin@example.test/);
  await assert.rejects(
    service({
      aktion: "mail-speichern",
      daten: { ...post.config, user: "", password: "", version: empty.version },
    }),
    /geändert/,
  );
  const before = await readFile(file, "utf8");
  await assert.rejects(
    service({
      aktion: "mail-speichern",
      daten: {
        ...post.config,
        port: 1,
        user: "",
        password: "",
        version: saved.version,
      },
    }),
    /SMTP/,
  );
  assert.equal(await readFile(file, "utf8"), before);
  post.ablehnen(true);
  await assert.rejects(
    service({
      aktion: "mail-test",
      daten: { email: "admin@example.test", version: saved.version },
    }),
    /Testmail/,
  );
});

test("Vorhandene Zugangsdaten werden weder ausgegeben noch still an einen anderen Server gesendet", async (t) => {
  const dir = await mkdtemp(join(tmpdir(), "timereal-smtp-secret-"));
  t.after(() => rm(dir, { recursive: true, force: true }));
  const file = join(dir, "mail.json");
  const secret = "nur-ein-zufaelliger-Testwert-" + crypto.randomUUID();
  const old = {
    host: "smtp.example.test",
    port: 587,
    secure: false,
    from: "zeit@example.test",
    user: "konto",
    password: secret,
  };
  await writeFile(file, JSON.stringify(old), { mode: 0o640 });
  let configs = [];
  // Nur externe Anbieterkommunikation ersetzt; Dateischutz und Protokoll sind echt.
  const service = mailVerwaltung({
    datei: file,
    lockPath: join(dir, "lock"),
    maildienst: (c) => ({ pruefen: async () => configs.push(c) }),
  });
  let status = await service({ aktion: "mail-lesen" });
  assert.equal(status.passwortGesetzt, true);
  assert.ok(!JSON.stringify(status).includes(secret));
  for (const field of [
    { host: "anders.example.test" },
    { port: 465 },
    { secure: true },
    { user: "anderes-konto" },
  ]) {
    await assert.rejects(
      service({
        aktion: "mail-speichern",
        daten: { ...old, ...field, password: "", version: status.version },
      }),
      /erneut/,
    );
  }
  assert.equal(configs.length, 0);
  status = await service({
    aktion: "mail-speichern",
    daten: {
      ...old,
      from: "neu@example.test",
      password: "",
      version: status.version,
    },
  });
  assert.equal(configs[0].password, secret);
  assert.ok(!JSON.stringify(status).includes(secret));
  status = await service({
    aktion: "mail-speichern",
    daten: { ...old, user: "", password: "", version: status.version },
  });
  assert.equal("password" in JSON.parse(await readFile(file, "utf8")), false);
  assert.equal(status.passwortGesetzt, false);
  for (const data of [
    { aktion: "mail-lesen", datei: "/etc/shadow" },
    {
      aktion: "mail-speichern",
      daten: {
        ...old,
        version: status.version,
        tls: { rejectUnauthorized: false },
      },
    },
    {
      aktion: "mail-speichern",
      daten: {
        ...old,
        version: status.version,
        from: "a@example.test\r\nBcc: fremd@example.test",
      },
    },
    {
      aktion: "mail-test",
      daten: {
        version: status.version,
        email: "a@example.test,b@example.test",
      },
    },
  ])
    await assert.rejects(service(data), /Ungültig/);
});
