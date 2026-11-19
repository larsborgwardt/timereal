import { mkdir } from "node:fs/promises";
import { chromium } from "playwright-core";
import { strict as assert } from "node:assert";
import { createApp } from "../dist/app.js";
import { release } from "../dist/version.js";
import pg from "pg";
const screenshots = process.env.SCREENSHOT_DIR ?? "/tmp";
await mkdir(screenshots, { recursive: true });
let status = {
  status: "ok",
  currentVersion: release.version,
  latestVersion: "99.0.0",
  updateAvailable: true,
  checkedAt: "2026-11-19T12:00:00.000Z",
  repositoryUrl: "https://github.com/larsborgwardt/timereal",
  releaseUrl: "https://github.com/larsborgwardt/timereal/releases/tag/v99.0.0",
};
const app = createApp(
  new pg.Pool({
    connectionString: process.env.TEST_DATABASE_URL,
    connectionTimeoutMillis: 1000,
  }),
  { secure: false, updateCheck: async () => ({ ...status }) },
);
const addr = await app.listen({ host: "127.0.0.1", port: 0 });
const browser = await chromium.launch({
  executablePath: process.env.CHROMIUM_PATH,
});
try {
  for (const [name, width, height] of [
    ["desktop", 1120, 760],
    ["mobil", 390, 844],
    ["schmal", 320, 740],
  ]) {
    const page = await browser.newPage({ viewport: { width, height } });
    const remote = [];
    page.on("request", (r) => {
      if (!r.url().startsWith(addr)) remote.push(r.url());
    });
    await page.goto(addr);
    const footer = page.getByRole("contentinfo");
    await footer
      .getByText("v" + release.version, { exact: true })
      .waitFor({ timeout: 3000 });
    await footer.getByRole("link", { name: /Update verfügbar: v99/ }).waitFor();
    assert.equal(
      await footer.getByRole("link", { name: /GitHub/ }).getAttribute("href"),
      "https://github.com/larsborgwardt/timereal",
    );
    assert.equal(
      await footer
        .getByRole("link", { name: /Update verfügbar/ })
        .getAttribute("href"),
      status.releaseUrl,
    );
    await footer.getByRole("link", { name: /GitHub/ }).focus();
    await page.keyboard.press("Tab");
    assert.equal(
      await page.evaluate(() => document.activeElement.id),
      "update-link",
    );
    assert.ok(
      await page
        .locator("#update-link")
        .evaluate((e) => getComputedStyle(e).outlineStyle !== "none"),
    );
    for (const fontSize of ["100%", "200%"]) {
      await page.evaluate(
        (size) => (document.documentElement.style.fontSize = size),
        fontSize,
      );
      assert.ok(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth,
        ),
        name +
          " Textgröße " +
          fontSize +
          " " +
          JSON.stringify(
            await page.evaluate(() =>
              [...document.querySelectorAll("body *")]
                .filter((e) => e.getBoundingClientRect().right > innerWidth)
                .map((e) => ({
                  tag: e.tagName,
                  id: e.id,
                  class: e.className,
                  right: e.getBoundingClientRect().right,
                })),
            ),
          ),
      );
      for (const link of await footer.locator("a:visible").all())
        assert.ok((await link.boundingBox()).height >= 44);
    }
    await page.evaluate(() => (document.documentElement.style.fontSize = ""));
    await page.screenshot({
      path: `${screenshots}/timereal-footer-${name}.png`,
      fullPage: true,
    });
    assert.deepEqual(remote, []);
    await page.close();
  }
  const page = await browser.newPage();
  for (const [newState, text] of [
    [{ status: "ok", updateAvailable: false }, "Kein Update verfügbar"],
    [
      { status: "disabled", updateAvailable: false },
      "Updateprüfung deaktiviert",
    ],
    [
      {
        status: "unavailable",
        updateAvailable: false,
        latestVersion: null,
        checkedAt: null,
      },
      "Updateprüfung nicht möglich",
    ],
    [
      {
        status: "unavailable",
        updateAvailable: true,
        latestVersion: "99.0.0",
        checkedAt: "2026-11-19T12:00:00.000Z",
      },
      "Letzte erfolgreiche Prüfung:",
    ],
  ]) {
    status = { ...status, ...newState };
    await page.goto(addr);
    await page
      .getByRole("contentinfo")
      .getByText(text, { exact: false })
      .waitFor();
  }
  await page.route("**/api/v1/updates", (r) => r.abort());
  await page.reload();
  await page
    .getByText("Updateprüfung nicht möglich", { exact: true })
    .waitFor();
  assert.equal(
    await page
      .getByRole("button", { name: "Anmelden", exact: true })
      .isEnabled(),
    true,
  );
  await page.route("**/api/v1/version", (r) => r.abort());
  await page.reload();
  await page.getByText("Version nicht verfügbar", { exact: true }).waitFor();
  console.log(
    "Footer: Version, Update-, Fehler- und Deaktiviert-Zustände, Tastatur, 320/390/1120 Pixel, 200 % Text und keine externen Browserabfragen bestanden.",
  );
} finally {
  await browser.close();
  await app.close();
}
