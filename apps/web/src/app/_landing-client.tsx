"use client";

import { useEffect } from "react";

/**
 * Landing-page interactivity — ported 1:1 from
 * `docs/design/redesign-v2/landing/scripts.js`.
 *
 * Two responsibilities:
 *
 *   1. Generate the two SVG radar charts (`#heroRadar` + `#cosmosRadar`).
 *      They are the visual centrepiece of the new landing — a 6-axis
 *      polygon representing the "Mapa Emocional" with sample values.
 *
 *   2. Animate elements as they enter the viewport (`.reveal` → `.in`).
 *      The original script also handled width-driven progress meters and
 *      had three independent triggers (immediate, IntersectionObserver,
 *      scroll fallback) so animations work even when the page is loaded
 *      with a frozen clock — useful for headless screenshot tools.
 *
 * The DOM gets mounted server-side via `dangerouslySetInnerHTML` in the
 * landing page itself; this component piggybacks on it once mounted.
 * Using a `useEffect` rather than wiring at SSR time is intentional:
 * SVG generation needs `document` and IntersectionObserver lives in the
 * browser only.
 *
 * Cleanup: the IntersectionObserver is disconnected on unmount so the
 * client-side router (when the user navigates to /login or /register)
 * doesn't leak observers.
 */
export function LandingClient() {
  useEffect(() => {
    // Marks the html element so CSS can scope effects to JS-on contexts.
    document.documentElement.setAttribute("data-js", "");

    const NS = "http://www.w3.org/2000/svg";

    function buildRadar(axes: string[], values: number[]): SVGSVGElement {
      // The viewBox is wider than the chart so long axis labels
      // ("CONSCIENCIA", "CONEXIÓN") don't spill outside the card in
      // narrow layouts (mobile). Padding = 60px on each side.
      const chart = 360;
      const padX = 60;
      const width = chart + padX * 2; // 480
      const height = chart;
      const cx = width / 2;
      const cy = height / 2;
      const R = chart * 0.36;
      const rings = 4;
      const N = axes.length;
      const svg = document.createElementNS(NS, "svg");
      svg.setAttribute("viewBox", `0 0 ${width} ${height}`);
      svg.setAttribute("preserveAspectRatio", "xMidYMid meet");

      function ang(i: number): number {
        return ((-90 + (i * 360) / N) * Math.PI) / 180;
      }
      function pt(i: number, r: number): [number, number] {
        return [cx + Math.cos(ang(i)) * r, cy + Math.sin(ang(i)) * r];
      }
      function poly(r: number): string {
        const p: string[] = [];
        for (let i = 0; i < N; i++) {
          const q = pt(i, r);
          p.push(`${q[0].toFixed(1)},${q[1].toFixed(1)}`);
        }
        return p.join(" ");
      }

      // Rings (concentric polygons).
      for (let k = 1; k <= rings; k++) {
        const pg = document.createElementNS(NS, "polygon");
        pg.setAttribute("points", poly((R * k) / rings));
        pg.setAttribute("class", "rg-ring");
        pg.setAttribute("stroke-width", "1");
        svg.appendChild(pg);
      }
      // Axes (radial lines).
      for (let i = 0; i < N; i++) {
        const ln = document.createElementNS(NS, "line");
        const e = pt(i, R);
        ln.setAttribute("x1", String(cx));
        ln.setAttribute("y1", String(cy));
        ln.setAttribute("x2", e[0].toFixed(1));
        ln.setAttribute("y2", e[1].toFixed(1));
        ln.setAttribute("class", "rg-axis");
        ln.setAttribute("stroke-width", "1");
        svg.appendChild(ln);
      }
      // Data polygon.
      const dp: string[] = [];
      for (let i = 0; i < N; i++) {
        const q = pt(i, R * values[i]!);
        dp.push(`${q[0].toFixed(1)},${q[1].toFixed(1)}`);
      }
      const dpoly = document.createElementNS(NS, "polygon");
      dpoly.setAttribute("points", dp.join(" "));
      dpoly.setAttribute("class", "rg-poly");
      svg.appendChild(dpoly);
      // Nodes + labels.
      for (let i = 0; i < N; i++) {
        const q = pt(i, R * values[i]!);
        const c = document.createElementNS(NS, "circle");
        c.setAttribute("cx", q[0].toFixed(1));
        c.setAttribute("cy", q[1].toFixed(1));
        c.setAttribute("r", "4");
        c.setAttribute("class", "rg-node");
        (c as unknown as HTMLElement).style.transitionDelay =
          `${0.6 + i * 0.08}s`;
        svg.appendChild(c);

        const lp = pt(i, R + 26);
        const t = document.createElementNS(NS, "text");
        t.setAttribute("x", lp[0].toFixed(1));
        t.setAttribute("y", lp[1].toFixed(1));
        t.setAttribute("class", "rg-label");
        const a = ang(i);
        t.setAttribute(
          "text-anchor",
          Math.abs(Math.cos(a)) < 0.3
            ? "middle"
            : Math.cos(a) > 0
              ? "start"
              : "end",
        );
        t.setAttribute("dominant-baseline", "middle");
        t.textContent = axes[i]!;
        svg.appendChild(t);
      }
      // Pulse + core.
      const pulse = document.createElementNS(NS, "circle");
      pulse.setAttribute("cx", String(cx));
      pulse.setAttribute("cy", String(cy));
      pulse.setAttribute("r", "6");
      pulse.setAttribute("class", "rg-pulse");
      pulse.setAttribute("stroke-width", "1.5");
      svg.appendChild(pulse);

      const core = document.createElementNS(NS, "circle");
      core.setAttribute("cx", String(cx));
      core.setAttribute("cy", String(cy));
      core.setAttribute("r", "4.5");
      core.setAttribute("class", "rg-core");
      svg.appendChild(core);
      return svg;
    }

    // Sample data — frozen for the landing; production reads it from
    // /api/emotional-map once Sprint D ships.
    const axesShort = [
      "Calma",
      "Claridad",
      "Conexión",
      "Propósito",
      "Compasión",
      "Consciencia",
    ];
    const vals = [0.58, 0.72, 0.8, 0.62, 0.5, 0.74];

    const hero = document.getElementById("heroRadar");
    if (hero) hero.appendChild(buildRadar(axesShort, vals));
    const cosmos = document.getElementById("cosmosRadar");
    if (cosmos) cosmos.appendChild(buildRadar(axesShort, vals));

    // Width-driven progress meter inside the radar footer.
    const hf = document.querySelector<HTMLElement>(".radar-foot .bar > i");
    if (hf) hf.setAttribute("data-w", "74%");

    // Mark the radars as reveal-on-scroll targets so they get the same
    // entrance animation as the other content blocks.
    document
      .querySelectorAll<HTMLElement>("#heroRadar, #cosmosRadar")
      .forEach((r) => r.classList.add("reveal"));

    function reveal(t: HTMLElement, instant: boolean): void {
      const cls = instant ? "show-now" : "in";
      if (
        t.classList.contains(cls) ||
        (instant && t.classList.contains("in")) ||
        (!instant && t.classList.contains("show-now"))
      )
        return;
      t.classList.add(cls);
      t.querySelectorAll<HTMLElement>(
        ".radar-holder, #heroRadar, #cosmosRadar",
      ).forEach((r) => r.classList.add(cls));
      t.querySelectorAll<HTMLElement>(
        ".pat-meter .bar > i, .radar-foot .bar > i",
      ).forEach((m) => {
        const w = m.dataset["w"];
        if (w) m.style.width = w;
      });
    }
    function inView(el: HTMLElement): boolean {
      const r = el.getBoundingClientRect();
      return r.top < (window.innerHeight || 800) * 0.92 && r.bottom > 0;
    }
    const all = () => document.querySelectorAll<HTMLElement>(".reveal");

    // (1) Immediate reveal — useful when a headless tool freezes the
    //     clock so transitions never tick.
    function revealInView(instant: boolean): void {
      all().forEach((e) => {
        if (inView(e)) reveal(e, instant);
      });
    }
    revealInView(true);
    requestAnimationFrame(() => revealInView(true));

    // (2) Scroll-driven reveal via IntersectionObserver.
    let io: IntersectionObserver | null = null;
    if ("IntersectionObserver" in window) {
      io = new IntersectionObserver(
        (entries) => {
          entries.forEach((en) => {
            if (en.isIntersecting) {
              reveal(en.target as HTMLElement, false);
              io?.unobserve(en.target);
            }
          });
        },
        { threshold: 0.12, rootMargin: "0px 0px -40px 0px" },
      );
      all().forEach((e) => io?.observe(e));
    } else {
      all().forEach((e) => reveal(e, true));
    }

    // (3) Scroll fallback + safety net for environments where IO + CSS
    //     transitions are starved.
    const onScroll = () => revealInView(false);
    window.addEventListener("scroll", onScroll, { passive: true });
    const safetyTimeout = window.setTimeout(() => {
      all().forEach((e) => {
        if (inView(e)) reveal(e, true);
      });
    }, 600);

    return () => {
      io?.disconnect();
      window.removeEventListener("scroll", onScroll);
      window.clearTimeout(safetyTimeout);
    };
  }, []);

  return null;
}
