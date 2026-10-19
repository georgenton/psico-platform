"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";

import { ControlApariencia } from "./ControlApariencia";
import { useLanding } from "./estado";
import { Icono } from "./Icono";
import { FeelVerseLockup } from "@/components/brand/FeelVerse";

const ENLACES: ReadonlyArray<{ href: string; texto: string }> = [
  { href: "#como", texto: "Cómo funciona" },
  { href: "#biblioteca", texto: "Biblioteca" },
  { href: "#mapa", texto: "Mapa Emocional" },
  { href: "#duo", texto: "Dúo y Círculos" },
  { href: "#planes", texto: "Planes" },
];

/**
 * Cabecera y menú.
 *
 * Una diferencia deliberada con la referencia: allí «Entrar» abría un aviso que
 * decía que el prototipo no incluye autenticación. Aquí el producto sí la
 * tiene, así que lleva al acceso real. Mantener el aviso habría sido publicar
 * una señal de trabajo interno como si fuera copy.
 *
 * ── Quién llega aquí, y qué se le ofrece ──────────────────────────────────
 *
 * Esta es una superficie pública: quien la lee todavía no tiene cuenta. La
 * revisión de la landing midió que, de los 77 controles de la página, NINGUNO
 * llevaba a `/register`; la única puerta decía «Entrar», que se lee como «ya
 * tengo cuenta». El registro existía y respondía, pero sólo se alcanzaba
 * pasando por el acceso.
 *
 * Así que la llamada principal es **crear cuenta**, y vive en `fh-enter`
 * a propósito: es el único contenedor de la cabecera que sobrevive a todos los
 * anchos. Por debajo de 1140 px el CSS esconde la navegación y el CTA de
 * escritorio, de modo que poner la adquisición en cualquier otro sitio la
 * habría hecho desaparecer justo en móvil.
 *
 * El acceso de quien ya tiene cuenta queda como enlace de texto al lado, no
 * como botón: sigue estando a un clic, sin competir con la adquisición. En el
 * cajón aparece como botón secundario, porque ahí no hay jerarquía de ancho
 * que lo distinga.
 *
 * «Ver una experiencia» se conserva —es parte del diseño aprobado y es lo que
 * hace la página explorable— pero pasa a secundaria: en una cabecera sólo
 * puede haber una llamada principal, y ahora es otra.
 */
export function Cabecera() {
  const { abrirEscenario } = useLanding();
  const [menuAbierto, setMenuAbierto] = useState(false);
  const [desplazada, setDesplazada] = useState(false);
  const botonMenu = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    const alDesplazar = () => setDesplazada(window.scrollY > 8);
    alDesplazar();
    window.addEventListener("scroll", alDesplazar, { passive: true });
    return () => window.removeEventListener("scroll", alDesplazar);
  }, []);

  useEffect(() => {
    if (!menuAbierto) return;
    const alPulsar = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      setMenuAbierto(false);
      botonMenu.current?.focus();
    };
    document.addEventListener("keydown", alPulsar);
    return () => document.removeEventListener("keydown", alPulsar);
  }, [menuAbierto]);

  return (
    <header
      className={desplazada ? "fh-head is-scrolled" : "fh-head"}
      id="fh-head"
    >
      <div className="fh-wrap fh-head-in">
        <a className="fh-brand" href="#top" aria-label="FeelVerse, inicio">
          <FeelVerseLockup size={20} />
        </a>
        <nav className="fh-nav" aria-label="Principal">
          {ENLACES.map((e) => (
            <a key={e.href} href={e.href}>
              {e.texto}
            </a>
          ))}
        </nav>
        <a
          className="fh-btn fh-btn-2 fh-btn-sm fh-cta-desk"
          href="#guiado"
          onClick={(e) => {
            e.preventDefault();
            abrirEscenario("guia");
          }}
        >
          Ver una experiencia
        </a>
        <div className="fh-enter">
          <Link className="fh-enter-link" href="/login">
            Entrar
          </Link>
          <Link className="fh-btn fh-btn-1 fh-btn-sm" href="/register">
            Crear cuenta
          </Link>
        </div>
        <button
          className="fh-menu-btn"
          type="button"
          ref={botonMenu}
          aria-expanded={menuAbierto}
          aria-controls="fh-drawer"
          onClick={() => setMenuAbierto((v) => !v)}
        >
          <Icono nombre="menu" />
          Menú
        </button>
      </div>
      <nav
        className={menuAbierto ? "fh-drawer is-open" : "fh-drawer"}
        id="fh-drawer"
        aria-label="Menú"
      >
        {ENLACES.map((e) => (
          <a key={e.href} href={e.href} onClick={() => setMenuAbierto(false)}>
            {e.texto}
          </a>
        ))}
        <a href="#faq" onClick={() => setMenuAbierto(false)}>
          Preguntas frecuentes
        </a>
        <Link
          className="fh-btn fh-btn-1"
          href="/register"
          onClick={() => setMenuAbierto(false)}
        >
          Crear cuenta
        </Link>
        <a
          className="fh-btn fh-btn-2"
          href="#guiado"
          onClick={(e) => {
            e.preventDefault();
            setMenuAbierto(false);
            abrirEscenario("guia");
          }}
        >
          Ver una experiencia
        </a>
        <Link
          className="fh-btn fh-btn-2"
          href="/login"
          onClick={() => setMenuAbierto(false)}
        >
          Entrar
        </Link>
        <ControlApariencia id="ap-m" />
      </nav>
    </header>
  );
}
