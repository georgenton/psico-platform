"use client";

import { useEffect, useState } from "react";
import * as Sentry from "@sentry/browser";

export default function Page() {
  const [texto, setTexto] = useState("");
  const [romper, setRomper] = useState(false);
  const [listo, setListo] = useState(false);
  useEffect(() => setListo(true), []);
  if (romper) throw new Error(`render ${texto} ${window.location.href}`);
  return (
    <main data-listo={listo}>
      <textarea
        id="texto"
        value={texto}
        onChange={(e) => setTexto(e.target.value)}
      />
      <p>Lo que escribiste: {texto}</p>
      <button
        id="sincrono"
        aria-label="sincrono"
        style={{ width: 90, height: 30 }}
        onClick={() => {
          localStorage.setItem("borrador", texto);
          console.log("sonda", texto);
          Sentry.setUser({ id: texto });
          Sentry.captureMessage(texto);
          Sentry.addBreadcrumb({ message: texto });
          throw Object.assign(
            new Error(`clic ${texto} ${window.location.href}`, {
              cause: new Error(`causa ${texto}`),
            }),
            { extra: texto },
          );
        }}
      />
      <button
        id="natural"
        aria-label="natural"
        style={{ width: 90, height: 30 }}
        onClick={() => {
          const nada = undefined as unknown as { map: () => void };
          nada.map();
        }}
      />
      <button
        id="promesa"
        aria-label="promesa"
        style={{ width: 90, height: 30 }}
        onClick={() => {
          void Promise.reject(new Error(`promesa ${texto}`));
        }}
      />
      <button
        id="cadena"
        aria-label="cadena"
        style={{ width: 90, height: 30 }}
        onClick={() => {
          // Lo que tira un código de terceros: no es ni un error.
          throw texto;
        }}
      />
      <button
        id="consola"
        aria-label="consola"
        style={{ width: 90, height: 30 }}
        onClick={() =>
          console.error(`consola ${texto}`, new RangeError(`rango ${texto}`))
        }
      />
      <button
        id="nombre"
        aria-label="nombre"
        style={{ width: 90, height: 30 }}
        onClick={() => {
          const err = new Error("x");
          err.name = texto;
          err.stack += `\n    at ${texto} (${window.location.origin}/_next/static/chunks/${texto}-0123456789abcdef.js:1:1)\n    at f (${window.location.href}:1:1)`;
          throw err;
        }}
      />
      <button
        id="salir"
        aria-label="salir"
        style={{ width: 90, height: 30 }}
        onClick={() =>
          void fetch(
            `${process.env.NEXT_PUBLIC_API_URL}/api/proveedor-navegador`,
          )
        }
      />
      <button
        id="render"
        aria-label="render"
        style={{ width: 90, height: 30 }}
        onClick={() => setRomper(true)}
      />
    </main>
  );
}
