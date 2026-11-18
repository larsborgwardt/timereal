import net from "node:net";
// Echte SMTP-Verbindung auf Loopback; nur der Transport wird lokal zugestellt.
export async function postfach() {
  const nachrichten = [],
    sockets = new Set();
  let ablehnen = false;
  const server = net.createServer((socket) => {
    sockets.add(socket);
    socket.on("close", () => sockets.delete(socket));
    socket.write("220 localhost ESMTP\r\n");
    let buffer = "",
      daten = false,
      mail = "";
    socket.on("data", (chunk) => {
      buffer += chunk.toString();
      while (buffer.includes("\r\n")) {
        const n = buffer.indexOf("\r\n"),
          line = buffer.slice(0, n);
        buffer = buffer.slice(n + 2);
        if (daten) {
          if (line === ".") {
            daten = false;
            nachrichten.push(mail);
            socket.write("250 gespeichert\r\n");
          } else mail += line.replace(/^\.\./, ".") + "\r\n";
        } else if (/^EHLO|^HELO/i.test(line)) socket.write("250 localhost\r\n");
        else if (/^MAIL|^RCPT/i.test(line))
          socket.write(ablehnen ? "550 abgelehnt\r\n" : "250 ok\r\n");
        else if (/^DATA/i.test(line)) {
          daten = true;
          mail = "";
          socket.write("354 senden\r\n");
        } else if (/^QUIT/i.test(line)) socket.end("221 ende\r\n");
        else socket.write("250 ok\r\n");
      }
    });
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  return {
    nachrichten,
    config: {
      host: "127.0.0.1",
      port: server.address().port,
      secure: false,
      from: "zeit@example.test",
    },
    ablehnen: (value) => {
      ablehnen = value;
    },
    close: async () => {
      for (const s of sockets) s.destroy();
      await new Promise((r) => server.close(r));
    },
  };
}
