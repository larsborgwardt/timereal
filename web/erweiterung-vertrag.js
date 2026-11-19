export function serverAdresse(value) {
  const u = new URL(value.trim());
  if (
    (u.protocol !== "https:" &&
      !(
        u.protocol === "http:" &&
        ["localhost", "127.0.0.1", "[::1]"].includes(u.hostname)
      )) ||
    u.username ||
    u.password ||
    u.search ||
    u.hash ||
    u.pathname !== "/"
  )
    throw new Error(
      "Bitte eine HTTPS-Adresse ohne Pfad, Zugangsdaten oder Parameter eingeben.",
    );
  return u.origin;
}

export function andereServerBerechtigungen(origins, server) {
  const u = new URL(serverAdresse(server));
  const aktuell = u.protocol + "//" + u.hostname + "/*";
  return origins.filter((origin) => origin !== aktuell);
}
