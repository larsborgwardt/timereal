export function nachweisExport({ button, filter, ansicht, request, melden }) {
  let laeuft = false;
  button.onclick = async () => {
    if (laeuft || !filter.reportValidity()) return;
    const f = filter.elements;
    const werte = {
      von: f.von.value,
      bis: f.bis.value,
      suche: f.suche.value.trim(),
      ansicht: ansicht(),
    };
    laeuft = true;
    button.disabled = true;
    button.setAttribute("aria-busy", "true");
    button.textContent = "Excel wird erstellt …";
    melden();
    try {
      const datei = await request(
        "/nachweise/excel?" + new URLSearchParams(werte),
        "GET",
        undefined,
        undefined,
        true,
      );
      const url = URL.createObjectURL(datei);
      const link = document.createElement("a");
      link.href = url;
      link.download = `timereal-nachweise-${werte.von}-bis-${werte.bis}.xlsx`;
      document.body.append(link);
      link.click();
      link.remove();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch (error) {
      melden(error.message);
    } finally {
      laeuft = false;
      button.disabled = false;
      button.removeAttribute("aria-busy");
      button.textContent = "Als Excel exportieren";
    }
  };
}
