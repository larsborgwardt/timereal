import { spawn } from "node:child_process";
import { open } from "node:fs/promises";
import { StringDecoder } from "node:string_decoder";
import { Betriebsfehler } from "./auftraege.mjs";

/** Feste Programme/Argumente kommen aus dem Betriebsadapter, nie aus HTTP-Eingaben. */
export function prozess(programm, argumente, options = {}) {
  return new Promise((resolve, reject) => {
    const stdio = [
      "ignore",
      "pipe",
      "pipe",
      options.ereignis ? "pipe" : "ignore",
    ];
    if (options.lockFd !== undefined) {
      while (stdio.length < 9) stdio.push("ignore");
      stdio.push(options.lockFd);
    }
    const child = spawn(programm, argumente, {
      cwd: options.cwd,
      env: {
        ...process.env,
        PATH: "/opt/timereal-node/bin:/usr/sbin:/usr/bin:/sbin:/bin",
        ...(options.env ?? {}),
      },
      shell: false,
      detached: true,
      stdio,
    });
    let stdout = "",
      stderr = "",
      bytes = 0,
      abbruch,
      killTimer,
      phasen = Promise.resolve(),
      puffer = "";
    const ausgabeDecoder = new StringDecoder("utf8"),
      fehlerDecoder = new StringDecoder("utf8"),
      ereignisDecoder = new StringDecoder("utf8");
    function abbrechen(fehler) {
      if (abbruch) return;
      abbruch = fehler;
      try {
        process.kill(-child.pid, "SIGTERM");
      } catch {}
      killTimer = setTimeout(() => {
        try {
          process.kill(-child.pid, "SIGKILL");
        } catch {}
      }, 2000);
      killTimer.unref();
    }
    const timer = setTimeout(
      () =>
        abbrechen(
          new Error("Betriebsprozess hat das Zeitlimit überschritten."),
        ),
      options.timeout ?? 120000,
    );
    const lesen = (ziel) => (chunk) => {
      bytes += chunk.length;
      if (bytes > (options.maxBytes ?? 1048576))
        return abbrechen(new Error("Betriebsprozess liefert zu viel Ausgabe."));
      if (ziel === "out") stdout += ausgabeDecoder.write(chunk);
      else stderr += fehlerDecoder.write(chunk);
    };
    child.stdout.on("data", lesen("out"));
    child.stderr.on("data", lesen("err"));
    if (options.ereignis)
      child.stdio[3].on("data", (chunk) => {
        puffer += ereignisDecoder.write(chunk);
        if (puffer.length > 16384)
          return abbrechen(new Error("Ungültiges Betriebsereignis."));
        let n;
        while ((n = puffer.indexOf("\n")) >= 0) {
          const zeile = puffer.slice(0, n);
          puffer = puffer.slice(n + 1);
          phasen = phasen
            .then(() => options.ereignis(JSON.parse(zeile)))
            .catch((e) => {
              abbrechen(e);
            });
        }
      });
    child.on("error", (error) => {
      clearTimeout(timer);
      clearTimeout(killTimer);
      reject(error);
    });
    child.on("close", async (exitCode, signal) => {
      clearTimeout(timer);
      clearTimeout(killTimer);
      stdout += ausgabeDecoder.end();
      stderr += fehlerDecoder.end();
      puffer += ereignisDecoder.end();
      await phasen;
      if (puffer) abbruch ??= new Error("Unvollständiges Betriebsereignis.");
      if (abbruch) return reject(abbruch);
      if (exitCode !== 0) {
        const error = new Error("Betriebsprozess fehlgeschlagen.");
        Object.assign(error, { exitCode, signal, stdout, stderr });
        return reject(error);
      }
      resolve({ stdout, stderr });
    });
  });
}

export async function betriebssperre(pfad = "/run/lock/timereal-install.lock") {
  const handle = await open(pfad, "a", 0o600);
  try {
    await prozess("/usr/bin/flock", ["-n", "9"], { lockFd: handle.fd });
  } catch (error) {
    await handle.close();
    if (error.exitCode === 1)
      throw new Betriebsfehler(
        "BELEGT",
        "Eine Einrichtung oder Aktualisierung läuft bereits.",
      );
    throw error;
  }
  return handle;
}
