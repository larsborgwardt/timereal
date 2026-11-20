// Bedienung von Material-Auswahllisten in Browserproben. Playwrights
// selectOption() und inputValue() kennen nur native <select>-Elemente; diese
// Helfer gehen den Weg eines Menschen: Liste öffnen, sichtbare Option klicken.

// auswahl: Locator auf die md-outlined-select oder ein Element in ihr (etwa
// getByLabel). option: Wert als Text oder { label } mit dem sichtbaren Text.
export async function waehle(auswahl, option) {
  await auswahl.click();
  const seite = auswahl.page();
  const ziel =
    typeof option === "string"
      ? seite.locator(`md-select-option[value="${option}"]:visible`)
      : seite.getByRole("option", { name: option.label, exact: true });
  await ziel.click();
  await ziel.waitFor({ state: "hidden" });
}

// Wert eines Material-Felds, auch über einen Locator auf sein inneres Element.
export const wertVon = (feld) =>
  feld.evaluate((el) => (el.getRootNode().host ?? el).value);
