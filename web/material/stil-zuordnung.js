// Ersatz für lits styleMap im Material-Bündel (Entwurf 19, Richtlinie bleibt).
// lit schreibt beim ersten Zeichnen ein style-Attribut; das verbietet die
// Inhaltsrichtlinie style-src 'self'. Diese Fassung setzt jede Eigenschaft wie
// lit bei späteren Aktualisierungen über das CSSOM (zulässig) und nie als
// Attribut. Verhalten sonst wie lit-html/directives/style-map.js (lit 3.3).
import { noChange } from "lit";
import { directive, Directive, PartType } from "lit/directive.js";

const WICHTIG = "!important";

class StilZuordnung extends Directive {
  #vorher = new Set();
  constructor(teil) {
    super(teil);
    if (
      teil.type !== PartType.ATTRIBUTE ||
      teil.name !== "style" ||
      teil.strings?.length > 2
    )
      throw new Error(
        "styleMap ist nur als einziger Ausdruck im style-Attribut zulässig.",
      );
  }
  render() {
    return noChange;
  }
  update(teil, [werte]) {
    const { style } = teil.element;
    for (const name of this.#vorher)
      if (werte[name] == null) {
        this.#vorher.delete(name);
        if (name.includes("-")) style.removeProperty(name);
        else style[name] = null;
      }
    for (const name in werte) {
      const wert = werte[name];
      if (wert == null) continue;
      this.#vorher.add(name);
      const wichtig = typeof wert === "string" && wert.endsWith(WICHTIG);
      if (name.includes("-") || wichtig)
        style.setProperty(
          name,
          wichtig ? wert.slice(0, -WICHTIG.length).trimEnd() : wert,
          wichtig ? "important" : "",
        );
      else style[name] = wert;
    }
    return noChange;
  }
}

export const styleMap = directive(StilZuordnung);
