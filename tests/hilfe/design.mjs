import { mkdir, appendFile } from "node:fs/promises";

// Misst die tatsächlich geöffnete Ansicht; Tabellen behalten ihren eigenen Scrollbereich.
export async function pruefeAnsicht(
  page,
  name,
  { widths = [1280, 390, 320] } = {},
) {
  const findings = [];
  const viewport = page.viewportSize();
  const fontSize = await page.evaluate(
    () => document.documentElement.style.fontSize,
  );
  for (const width of widths) {
    await page.setViewportSize({ width, height: 900 });
    for (const scale of [1, 2]) {
      await page.evaluate(
        (scale) =>
          (document.documentElement.style.fontSize = `${16 * scale}px`),
        scale,
      );
      const result = await page.evaluate(() => {
        const root = document.querySelector("dialog[open]") ?? document;
        const shown = (el) =>
          el.getClientRects().length &&
          getComputedStyle(el).visibility !== "hidden";
        const controls = [
          ...root.querySelectorAll("button,input,select,textarea,a[href]"),
        ].filter(shown);
        const label = (el) =>
          el.id ||
          el.getAttribute("name") ||
          el.textContent.trim().slice(0, 70);
        const small = controls
          .filter((el) => {
            const rect = (
              el.type === "checkbox" ? el.closest("label") : el
            ).getBoundingClientRect();
            return rect.height < 43.5 || rect.width < 43.5;
          })
          .map(label);
        const overflow = [...root.querySelectorAll("*")]
          .filter(shown)
          .filter((el) => {
            if (el.closest(".tabelle")) return false;
            const r = el.getBoundingClientRect();
            return r.left < -1 || r.right > innerWidth + 1;
          })
          .slice(0, 8)
          .map((el) => el.tagName + "#" + label(el));
        const dialog = document.querySelector("dialog[open]");
        const exit = dialog?.querySelector("[data-close]");
        const exitVisible =
          !exit ||
          (() => {
            const r = exit.getBoundingClientRect(),
              d = dialog.getBoundingClientRect();
            return r.top >= d.top && r.bottom <= d.bottom;
          })();
        const dialogName =
          !dialog ||
          !!(
            dialog.getAttribute("aria-label") ||
            document
              .getElementById(dialog.getAttribute("aria-labelledby"))
              ?.textContent.trim()
          );
        const fieldsWithoutLabel = controls
          .filter(
            (el) =>
              el.matches("input,select,textarea") &&
              !el.labels?.length &&
              !el.getAttribute("aria-label") &&
              !el.getAttribute("aria-labelledby"),
          )
          .map(label);
        return { small, overflow, dialogName, fieldsWithoutLabel, exitVisible };
      });
      for (const [kind, values] of Object.entries(result)) {
        if (Array.isArray(values)) {
          if (values.length)
            findings.push(
              `${name} ${width}px ${scale * 100}% ${kind}: ${values.join(", ")}`,
            );
        } else if (!values) findings.push(`${name} ${kind}`);
      }
      if (
        process.env.SCREENSHOT_DIR &&
        scale === 1 &&
        [1280, 390, 380].includes(width)
      ) {
        await mkdir(process.env.SCREENSHOT_DIR, { recursive: true });
        await page.screenshot({
          path: `${process.env.SCREENSHOT_DIR}/design-${name}-${width}.png`,
          fullPage: true,
        });
      }
    }
  }
  await page.setViewportSize(viewport);
  await page.evaluate(
    (value) => (document.documentElement.style.fontSize = value),
    fontSize,
  );
  if (process.env.DESIGN_PROBE_LOG) {
    const state = await page.evaluate(() => ({
      path: location.pathname,
      ids: [
        ...document.querySelectorAll(
          "main > section[id], dialog[open], [data-betrieb-panel][id]",
        ),
      ]
        .filter((el) => el.getClientRects().length)
        .map((el) => el.id),
    }));
    await appendFile(
      process.env.DESIGN_PROBE_LOG,
      JSON.stringify({ name, ...state, widths, scales: [100, 200], findings }) +
        "\n",
    );
  }
  return [...new Set(findings)];
}
