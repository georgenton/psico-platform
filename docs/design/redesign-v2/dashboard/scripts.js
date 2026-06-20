/* Dashboard — vanilla JS (no framework). */

    /* ── Radar builder ─────────────────────────────────────────── */
    function buildRadar(target, axes, values) {
      var size = 360, cx = size/2, cy = size/2, R = size*0.34, rings = 4, N = axes.length;
      var ns = "http://www.w3.org/2000/svg";
      var svg = document.createElementNS(ns, "svg");
      svg.setAttribute("viewBox", "0 0 " + size + " " + size);
      function ang(i){ return (-90 + i*360/N)*Math.PI/180; }
      function pt(i,r){ return [cx+Math.cos(ang(i))*r, cy+Math.sin(ang(i))*r]; }
      function poly(r){ var p=[]; for(var i=0;i<N;i++){var q=pt(i,r); p.push(q[0].toFixed(1)+","+q[1].toFixed(1));} return p.join(" "); }
      for(var k=1;k<=rings;k++){ var pg=document.createElementNS(ns,"polygon"); pg.setAttribute("points",poly(R*k/rings)); pg.setAttribute("class","rg-ring"); pg.setAttribute("stroke-width","1"); svg.appendChild(pg); }
      for(var i=0;i<N;i++){ var ln=document.createElementNS(ns,"line"); var e=pt(i,R); ln.setAttribute("x1",cx);ln.setAttribute("y1",cy);ln.setAttribute("x2",e[0].toFixed(1));ln.setAttribute("y2",e[1].toFixed(1)); ln.setAttribute("class","rg-axis");ln.setAttribute("stroke-width","1"); svg.appendChild(ln); }
      var dp=[]; for(var i=0;i<N;i++){ var q=pt(i,R*values[i]); dp.push(q[0].toFixed(1)+","+q[1].toFixed(1)); }
      var dpoly=document.createElementNS(ns,"polygon"); dpoly.setAttribute("points",dp.join(" ")); dpoly.setAttribute("class","rg-poly"); svg.appendChild(dpoly);
      for(var i=0;i<N;i++){ var q=pt(i,R*values[i]); var c=document.createElementNS(ns,"circle"); c.setAttribute("cx",q[0].toFixed(1));c.setAttribute("cy",q[1].toFixed(1));c.setAttribute("r","4");c.setAttribute("class","rg-node"); svg.appendChild(c);
        var lp=pt(i,R+24); var t=document.createElementNS(ns,"text"); t.setAttribute("x",lp[0].toFixed(1));t.setAttribute("y",lp[1].toFixed(1));t.setAttribute("class","rg-label"); var a=ang(i); t.setAttribute("text-anchor", Math.abs(Math.cos(a))<0.3?"middle":(Math.cos(a)>0?"start":"end")); t.setAttribute("dominant-baseline","middle"); t.textContent=axes[i]; svg.appendChild(t); }
      var pulse=document.createElementNS(ns,"circle"); pulse.setAttribute("cx",cx);pulse.setAttribute("cy",cy);pulse.setAttribute("r","6");pulse.setAttribute("class","rg-pulse");pulse.setAttribute("stroke-width","1.5"); svg.appendChild(pulse);
      var core=document.createElementNS(ns,"circle"); core.setAttribute("cx",cx);core.setAttribute("cy",cy);core.setAttribute("r","4.5");core.setAttribute("class","rg-core"); svg.appendChild(core);
      target.appendChild(svg);
    }
    var AX = ["Calma","Claridad","Conexión","Propósito","Compasión","Consciencia"];
    var VL = [0.58,0.72,0.8,0.62,0.5,0.74];
    ["radar-home","radar-mapa","radar-mobile"].forEach(function(id){ var el=document.getElementById(id); if(el) buildRadar(el, AX, VL); });

    /* ── Surface toggle ────────────────────────────────────────── */
    document.getElementById("seg").addEventListener("click", function(e){
      var b = e.target.closest("button"); if(!b) return;
      document.querySelectorAll("#seg button").forEach(function(x){ x.classList.toggle("on", x===b); });
      var s = b.dataset.surface;
      document.getElementById("surface-web").classList.toggle("on", s==="web");
      document.getElementById("surface-mobile").classList.toggle("on", s==="mobile");
      window.scrollTo(0,0);
    });

    /* ── Sidebar screen switching ──────────────────────────────── */
    function goTo(screen){
      document.querySelectorAll(".screen").forEach(function(s){ s.classList.toggle("on", s.id==="s-"+screen); });
      document.querySelectorAll(".nav-item").forEach(function(n){ n.classList.toggle("on", n.dataset.screen===screen); });
      var main = document.querySelector(".main"); if(main) main.scrollTo ? main.scrollTo(0,0) : 0;
      window.scrollTo(0, 0);
    }
    document.querySelectorAll(".nav-item").forEach(function(n){
      n.addEventListener("click", function(){ if(n.dataset.screen) goTo(n.dataset.screen); });
    });
    document.querySelectorAll("[data-goto]").forEach(function(b){
      b.addEventListener("click", function(){ goTo(b.dataset.goto); });
    });

    /* ── Mood check-in selection ──────────────────────────────────── */
    var MOODS = {
      great:{label:"Muy bien", mouth:"M8 13.5 a4 4 0 0 0 8 0"},
      good:{label:"Bien", mouth:"M9 13.8 a3.2 3.2 0 0 0 6 0"},
      ok:{label:"Neutral", mouth:"M9 14.5 H15"},
      low:{label:"Bajo", mouth:"M9.2 15 a3 3 0 0 1 5.6 0"},
      hard:{label:"Difícil", mouth:"M8.4 15.5 a4 4 0 0 1 7.2 0"}
    };
    function faceSVG(mouth, size){
      return '<svg class="ic" width="'+size+'" height="'+size+'" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="8.5"/><path d="'+mouth+'"/><circle cx="9" cy="10" r="0.7" fill="currentColor" stroke="none"/><circle cx="15" cy="10" r="0.7" fill="currentColor" stroke="none"/></svg>';
    }
    function setMood(mood){
      var m = MOODS[mood]; if(!m) return;
      var row = document.getElementById("moodRow");
      if(row){ row.querySelectorAll(".mood").forEach(function(x){ x.className="mood"; if(x.dataset.mood===mood){ x.classList.add("on"); x.classList.add(mood); } }); }
      var checkin = document.querySelector(".mood-checkin"); if(checkin) checkin.classList.add("collapsed");
      var chip = document.getElementById("moodChip");
      if(chip){ chip.setAttribute("data-mood", mood);
        document.getElementById("moodChipFace").innerHTML = faceSVG(m.mouth,17);
        document.getElementById("moodChipText").innerHTML = 'Hoy: <b>'+m.label+'</b>'; }
      var pop = document.getElementById("moodPop");
      if(pop){ pop.querySelectorAll(".mp-opt").forEach(function(x){ x.className="mp-opt"; if(x.dataset.mood===mood){ x.classList.add("on"); x.classList.add(mood); } }); }
      var mrow = document.getElementById("mMoodRow");
      if(mrow){ mrow.querySelectorAll(".m-mood-opt").forEach(function(x){ x.classList.toggle("on", x.dataset.mood===mood); }); }
      var mmood = document.querySelector(".m-mood"); if(mmood){ mmood.classList.add("done"); }
      var mdf = document.getElementById("mMoodDoneFace"); if(mdf) mdf.innerHTML = faceSVG(m.mouth,17);
      var mdl = document.getElementById("mMoodDoneLabel"); if(mdl) mdl.textContent = m.label;
      try{ localStorage.setItem("psico-mood", mood); }catch(e){}
    }
    function expandMood(){
      var checkin=document.querySelector(".mood-checkin"); if(checkin) checkin.classList.remove("collapsed");
      var chip=document.getElementById("moodChip"); if(chip) chip.classList.remove("show");
      var mmood=document.querySelector(".m-mood"); if(mmood) mmood.classList.remove("done");
    }
    var moodRow = document.getElementById("moodRow");
    if (moodRow) moodRow.addEventListener("click", function(e){ var b=e.target.closest(".mood"); if(b) setMood(b.dataset.mood); });
    var mMoodRow = document.getElementById("mMoodRow");
    if (mMoodRow) mMoodRow.addEventListener("click", function(e){ var b=e.target.closest(".m-mood-opt"); if(b) setMood(b.dataset.mood); });
    var moodChip = document.getElementById("moodChip"), moodPop = document.getElementById("moodPop");
    if(moodChip){ moodChip.addEventListener("click", function(e){ e.stopPropagation(); if(moodPop) moodPop.classList.toggle("open"); }); }
    if(moodPop){ moodPop.addEventListener("click", function(e){ var o=e.target.closest(".mp-opt"); if(!o) return; setMood(o.dataset.mood); moodPop.classList.remove("open"); }); }
    var mMoodDone = document.getElementById("mMoodDone"); if(mMoodDone) mMoodDone.addEventListener("click", expandMood);

    var AMB = {
      calma:{label:"Calma", sw:"linear-gradient(135deg,#8b71f5,#7fae76)"},
      enfoque:{label:"Enfoque", sw:"linear-gradient(135deg,#4f57e0,#2c9586)"},
      energia:{label:"Energía", sw:"linear-gradient(135deg,#f2602f,#e3a423)"},
      noche:{label:"Noche", sw:"linear-gradient(135deg,#2a1c66,#8b71f5)"}
    };
    function setAmb(a){
      if(!AMB[a]) a="calma";
      document.body.classList.remove("amb-calma","amb-enfoque","amb-energia","amb-noche");
      document.body.classList.add("amb-"+a);
      var lbl=document.getElementById("ambLabel"); if(lbl) lbl.textContent = AMB[a].label;
      var sw=document.getElementById("ambSw"); if(sw) sw.style.background = AMB[a].sw;
      document.querySelectorAll(".amb-opt").forEach(function(o){ o.classList.toggle("on", o.dataset.amb===a); });
      try{ localStorage.setItem("psico-amb", a); }catch(e){}
    }
    var ambBtn=document.getElementById("ambBtn"), ambMenu=document.getElementById("ambMenu");
    if(ambBtn){ ambBtn.addEventListener("click", function(e){ e.stopPropagation(); ambMenu.classList.toggle("open"); }); }
    if(ambMenu){ ambMenu.addEventListener("click", function(e){ var o=e.target.closest(".amb-opt"); if(!o) return; setAmb(o.dataset.amb); ambMenu.classList.remove("open"); }); }
    document.addEventListener("click", function(){ if(ambMenu) ambMenu.classList.remove("open"); var mp=document.getElementById("moodPop"); if(mp) mp.classList.remove("open"); });

    try{
      var sa=localStorage.getItem("psico-amb"); if(sa) setAmb(sa);
      var sm=localStorage.getItem("psico-mood"); if(sm) setMood(sm);
    }catch(e){}
  