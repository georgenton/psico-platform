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
 * tiene, así que es un enlace al acceso real. Mantener el aviso habría sido
 * publicar una señal de trabajo interno como si fuera copy.
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
        <div className="fh-enter">
          <Link className="fh-btn fh-btn-2 fh-btn-sm" href="/login">
            Entrar
          </Link>
        </div>
        <a
          className="fh-btn fh-btn-1 fh-btn-sm fh-cta-desk"
          href="#guiado"
          onClick={(e) => {
            e.preventDefault();
            abrirEscenario("guia");
          }}
        >
          Ver una experiencia
        </a>
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
          className="fh-btn fh-btn-2"
          href="/login"
          onClick={() => setMenuAbierto(false)}
        >
          Entrar
        </Link>
        <a
          className="fh-btn fh-btn-1"
          href="#guiado"
          onClick={(e) => {
            e.preventDefault();
            setMenuAbierto(false);
            abrirEscenario("guia");
          }}
        >
          Ver una experiencia
        </a>
        <ControlApariencia id="ap-m" />
      </nav>
    </header>
  );
}
