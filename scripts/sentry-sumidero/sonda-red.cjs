/**
 * Precarga que anota a dónde se conecta un proceso. Es lo que permite decir
 * «cero conexiones» sin DSN, en vez de «cero en el receptor».
 */
const net = require("node:net");
const fs = require("node:fs");
const fichero = process.env.SONDA_RED;
const original = net.Socket.prototype.connect;
net.Socket.prototype.connect = function (...args) {
  try {
    const a = Array.isArray(args[0]) ? args[0][0] : args[0];
    const destino =
      typeof a === "object" && a
        ? `${a.host ?? a.hostname ?? a.path ?? "localhost"}:${a.port ?? ""}`
        : String(a);
    if (fichero) fs.appendFileSync(fichero, `${destino}\n`);
  } catch {
    // Anotar no puede impedir conectarse.
  }
  return original.apply(this, args);
};
