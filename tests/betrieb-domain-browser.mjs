import { chromium } from "playwright-core";
import assert from "node:assert/strict";
import pg from "pg";
import { randomBytes, randomUUID } from "node:crypto";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createApp } from "../dist/app.js";
import { passwordHash } from "../dist/session.js";
import { dienstStarten } from "../betrieb/verwaltung/dienst.mjs";

// Echte Websitzung, DB, Auftragsbuch und Browser. Der Transport bildet den
// externen HTTPS-Proxy ab; privilegierte Konfigurationsänderungen sind Doubles.
const dir = await mkdtemp(join(tmpdir(), "timereal-domain-browser-"));
const db = new pg.Client({ connectionString: process.env.TEST_DATABASE_URL });
await db.connect();
const login = "domain-browser-" + randomUUID(),
  passwort = randomBytes(24).toString("hex");
const {
  rows: [konto],
} = await db.query(
  "insert into konto(login_referenz,passwort_hash,ist_admin) values($1,$2,true) returning id",
  [login, await passwordHash(passwort)],
);
const origin = "https://zeit.example.org",
  socketPath = join(dir, "dienst.sock");
const dienst = await dienstStarten({
  verzeichnis: dir,
  socketPath,
  lockPath: join(dir, "lock"),
  status: async () => ({ version: "0.9.2", origin, domainUnterstuetzt: true }),
  ausfuehren: async () => {},
});
const role = new URL(process.env.TEST_DATABASE_URL);
role.username = "timereal_app";
role.password = "nur-fuer-diese-wegwerfdatenbank";
const app = createApp(new pg.Pool({ connectionString: role.href }), {
  secure: false,
  origin,
  betriebSocket: socketPath,
  updateCheck: async () => ({
    status: "ok",
    currentVersion: "0.9.2",
    latestVersion: "0.9.4",
    updateAvailable: true,
  }),
});
const addr = await app.listen({ host: "127.0.0.1", port: 0 });
const browser = await chromium.launch({
  executablePath: process.env.CHROMIUM_PATH,
});
try {
  const page = await browser.newPage();
  page.setDefaultTimeout(8000);
  await page.route(origin + "/**", async (route) => {
    const url = new URL(route.request().url());
    const response = await route.fetch({
      url: addr + url.pathname + url.search,
    });
    await route.fulfill({ response });
  });
  // Die Geräteuhr liegt einen Tag vor der Serveruhr. Der neue Zugang ist
  // dennoch erreichbar; die Betriebsberechtigung wird am echten Backend geprüft.
  await page.clock.setFixedTime(new Date(Date.now() + 86400000));
  const { auftrag } = await dienst.buch.annehmen({
    aktion: "domain-pruefen",
    konto: konto.id,
    schluessel: randomUUID(),
    daten: { domain: "zeit.example.org" },
  });
  await dienst.buch.fortschreiben(auftrag.id, {
    zustand: "bestaetigung_ausstehend",
    phase: "bestaetigung_ausstehend",
    frist: Date.now() + 180000,
    vorherigeOrigin: "https://192.0.2.42",
  });
  await page.goto(origin);
  await page.getByLabel("Anmeldename").fill(login);
  await page.getByLabel("Passwort", { exact: true }).fill(passwort);
  const erkannt = page.waitForResponse(
    (r) =>
      r.url().endsWith(`/domain/${auftrag.id}/bestaetigen`) &&
      r.status() === 202,
  );
  await page.getByRole("button", { name: "Anmelden", exact: true }).click();
  // Der neue Zugriff wird bereits auf „Heute“ nach der Anmeldung erkannt.
  await erkannt;
  assert.equal(dienst.buch.lesen(auftrag.id).zustand, "erfolgreich");
  await page.getByRole("button", { name: "Verwaltung", exact: true }).click();
  await page
    .getByRole("navigation", { name: "Verwaltungsbereiche" })
    .getByRole("button", { name: "Updates", exact: true })
    .click();
  await page.waitForFunction(
    () => !document.querySelector("#betrieb-vorbereiten").disabled,
  );
  assert.equal(dienst.buch.lesen(auftrag.id).zustand, "erfolgreich");
  assert.equal(
    await page.locator('#betrieb-bereich input[type="password"]').count(),
    0,
  );
  console.log(
    "Neue Domain automatisch erkannt, Updates trotz abweichender Geräteuhr freigegeben; keine erneute Passworteingabe.",
  );
} finally {
  await browser.close();
  await app.close();
  await dienst.schliessen();
  await db.end();
  await rm(dir, { recursive: true, force: true });
}
