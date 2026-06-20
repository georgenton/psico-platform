/* Landing Page — vanilla JS (no framework). */

    document.documentElement.setAttribute("data-js", "");

    /* ── Radar builder ─────────────────────────────────────────── */
    function buildRadar(axes, values, opts) {
      opts = opts || {};
      var size = 360, cx = size / 2, cy = size / 2, R = size * 0.36, rings = 4, N = axes.length;
      var ns = "http://www.w3.org/2000/svg";
      var svg = document.createElementNS(ns, "svg");
      svg.setAttribute("viewBox", "0 0 " + size + " " + size);
      function ang(i) { return (-90 + i * 360 / N) * Math.PI / 180; }
      function pt(i, r) { return [cx + Math.cos(ang(i)) * r, cy + Math.sin(ang(i)) * r]; }
      function poly(r) { var p = []; for (var i = 0; i < N; i++) { var q = pt(i, r); p.push(q[0].toFixed(1) + "," + q[1].toFixed(1)); } return p.join(" "); }

      // rings
      for (var k = 1; k <= rings; k++) {
        var pg = document.createElementNS(ns, "polygon");
        pg.setAttribute("points", poly(R * k / rings));
        pg.setAttribute("class", "rg-ring");
        pg.setAttribute("stroke-width", "1");
        svg.appendChild(pg);
      }
      // axes
      for (var i = 0; i < N; i++) {
        var ln = document.createElementNS(ns, "line");
        var e = pt(i, R);
        ln.setAttribute("x1", cx); ln.setAttribute("y1", cy);
        ln.setAttribute("x2", e[0].toFixed(1)); ln.setAttribute("y2", e[1].toFixed(1));
        ln.setAttribute("class", "rg-axis"); ln.setAttribute("stroke-width", "1");
        svg.appendChild(ln);
      }
      // data polygon
      var dp = []; for (var i = 0; i < N; i++) { var q = pt(i, R * values[i]); dp.push(q[0].toFixed(1) + "," + q[1].toFixed(1)); }
      var dpoly = document.createElementNS(ns, "polygon");
      dpoly.setAttribute("points", dp.join(" "));
      dpoly.setAttribute("class", "rg-poly");
      svg.appendChild(dpoly);
      // nodes + labels
      for (var i = 0; i < N; i++) {
        var q = pt(i, R * values[i]);
        var c = document.createElementNS(ns, "circle");
        c.setAttribute("cx", q[0].toFixed(1)); c.setAttribute("cy", q[1].toFixed(1));
        c.setAttribute("r", "4"); c.setAttribute("class", "rg-node");
        c.style.transitionDelay = (0.6 + i * 0.08) + "s";
        svg.appendChild(c);
        var lp = pt(i, R + 26);
        var t = document.createElementNS(ns, "text");
        t.setAttribute("x", lp[0].toFixed(1)); t.setAttribute("y", lp[1].toFixed(1));
        t.setAttribute("class", "rg-label");
        var a = ang(i);
        t.setAttribute("text-anchor", Math.abs(Math.cos(a)) < 0.3 ? "middle" : (Math.cos(a) > 0 ? "start" : "end"));
        t.setAttribute("dominant-baseline", "middle");
        t.textContent = axes[i];
        svg.appendChild(t);
      }
      // pulse + core
      var pulse = document.createElementNS(ns, "circle");
      pulse.setAttribute("cx", cx); pulse.setAttribute("cy", cy); pulse.setAttribute("r", "6");
      pulse.setAttribute("class", "rg-pulse"); pulse.setAttribute("stroke-width", "1.5");
      svg.appendChild(pulse);
      var core = document.createElementNS(ns, "circle");
      core.setAttribute("cx", cx); core.setAttribute("cy", cy); core.setAttribute("r", "4.5");
      core.setAttribute("class", "rg-core");
      svg.appendChild(core);
      return svg;
    }

    var axesShort = ["Calma", "Claridad", "Conexión", "Propósito", "Compasión", "Consciencia"];
    var vals = [0.58, 0.72, 0.8, 0.62, 0.5, 0.74];
    var hero = document.getElementById("heroRadar");
    if (hero) hero.appendChild(buildRadar(axesShort, vals));
    var cosmos = document.getElementById("cosmosRadar");
    if (cosmos) cosmos.appendChild(buildRadar(axesShort, vals));

    /* ── Reveal + radar/meter activation ───────────────────────── */
    (function () {
      var hf = document.querySelector(".radar-foot .bar > i"); if (hf) hf.setAttribute("data-w", "74%");
      document.querySelectorAll("#heroRadar, #cosmosRadar").forEach(function (r) { r.classList.add("reveal"); });

      function reveal(t, instant) {
        var cls = instant ? "show-now" : "in";
        if (t.classList.contains(cls) || (instant && t.classList.contains("in")) || (!instant && t.classList.contains("show-now"))) return;
        t.classList.add(cls);
        t.querySelectorAll(".radar-holder, #heroRadar, #cosmosRadar").forEach(function (r) { r.classList.add(cls); });
        t.querySelectorAll(".pat-meter .bar > i, .radar-foot .bar > i").forEach(function (m) { if (m.dataset.w) m.style.width = m.dataset.w; });
      }
      function inView(el) {
        var r = el.getBoundingClientRect();
        return r.top < (window.innerHeight || 800) * 0.92 && r.bottom > 0;
      }
      var all = function () { return document.querySelectorAll(".reveal"); };

      // 1) Immediately reveal whatever is already on screen — instant, no clock dependency
      function revealInView(instant) { all().forEach(function (e) { if (inView(e)) reveal(e, instant); }); }
      revealInView(true);
      requestAnimationFrame(function () { revealInView(true); });

      // 2) IntersectionObserver animates the rest as the user scrolls
      if ("IntersectionObserver" in window) {
        var io = new IntersectionObserver(function (entries) {
          entries.forEach(function (en) { if (en.isIntersecting) { reveal(en.target, false); io.unobserve(en.target); } });
        }, { threshold: 0.12, rootMargin: "0px 0px -40px 0px" });
        all().forEach(function (e) { io.observe(e); });
      } else {
        all().forEach(function (e) { reveal(e, true); });
      }

      // 3) Scroll fallback + safety net (instant) for any context where IO/transitions stall
      window.addEventListener("scroll", function () { revealInView(false); }, { passive: true });
      setTimeout(function () { all().forEach(function (e) { if (inView(e)) reveal(e, true); }); }, 600);
    })();
  