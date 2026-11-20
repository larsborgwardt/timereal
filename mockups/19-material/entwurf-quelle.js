import "@material/web/button/filled-button.js";
import "@material/web/button/outlined-button.js";
import "@material/web/button/text-button.js";
import "@material/web/textfield/outlined-text-field.js";
import "@material/web/progress/linear-progress.js";
import "@material/web/tabs/tabs.js";
import "@material/web/tabs/primary-tab.js";
import "@material/web/tabs/secondary-tab.js";
import "@material/web/list/list.js";
import "@material/web/list/list-item.js";
import "@material/web/divider/divider.js";
import "@material/web/chips/assist-chip.js";
import "@material/web/labs/card/outlined-card.js";
import { styles as typescale } from "@material/web/typography/md-typescale-styles.js";
document.adoptedStyleSheets.push(typescale.styleSheet);

const ansicht = new URLSearchParams(location.search).get("ansicht") ?? "heute";
for (const el of document.querySelectorAll("[data-ansicht]"))
  el.hidden = !el.dataset.ansicht.split(" ").includes(ansicht);
for (const tab of document.querySelectorAll(".hauptnavigation md-primary-tab"))
  tab.active = tab.dataset.auswahl === ansicht;
document.body.dataset.ansicht = ansicht;
await customElements.whenDefined("md-linear-progress");
const balken = document.querySelector("#fortschritt");
if (balken) balken.value = 0.5;
window.__fertig = true;
