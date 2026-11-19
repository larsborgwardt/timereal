import assert from "node:assert/strict";

export async function pruefeSeitenicons(page) {
  const icons = await page.evaluate(async () => {
    const links = [...document.querySelectorAll('link[rel="icon"]')];
    return Promise.all(
      links.map(async (link) => {
        const image = new Image();
        image.src = link.href;
        await image.decode();
        return {
          sameOrigin: new URL(link.href).origin === location.origin,
          path: new URL(link.href).pathname,
          width: image.naturalWidth,
          height: image.naturalHeight,
        };
      }),
    );
  });
  assert.equal(icons.length, 3, page.url());
  assert.ok(icons.every((i) => i.sameOrigin && i.width === i.height));
  for (const size of [16, 32]) {
    assert.ok(
      icons.some(
        (i) => i.path === `/icons/timereal-${size}.png` && i.width === size,
      ),
    );
  }
  assert.ok(
    icons.some(
      (i) => i.path === "/favicon.ico" && [16, 32, 48].includes(i.width),
    ),
  );
}
