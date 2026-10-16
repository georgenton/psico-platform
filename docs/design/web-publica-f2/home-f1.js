/* FeelVerse · Home F1 · interacción local. Sin red, sin almacenamiento, sin IA. */
(function(){
const $=(s,r)=>(r||document).querySelector(s),$$=(s,r)=>[...(r||document).querySelectorAll(s)];
const RM=matchMedia("(prefers-reduced-motion: reduce)").matches;

/* marca real: FV.lockup del sistema (themes/brand.js) */
$$("[data-lockup]").forEach(el=>{if(window.FV&&FV.lockup)el.innerHTML=FV.lockup(+el.dataset.lockup)});

/* cabecera */
const head=$("#fh-head");addEventListener("scroll",()=>head.classList.toggle("is-scrolled",scrollY>8),{passive:true});
const mb=$("#fh-menu"),dr=$("#fh-drawer");
const setMenu=o=>{mb.setAttribute("aria-expanded",o);dr.classList.toggle("is-open",o)};
mb.addEventListener("click",()=>setMenu(mb.getAttribute("aria-expanded")!=="true"));
dr.addEventListener("click",e=>{if(e.target.closest("a"))setMenu(false)});
const eb=$("#fh-enter"),ep=$("#fh-enter-pop");
eb.addEventListener("click",()=>{const o=ep.hidden;ep.hidden=!o;eb.setAttribute("aria-expanded",o)});
document.addEventListener("click",e=>{if(!e.target.closest(".fh-enter")&&!ep.hidden){ep.hidden=true;eb.setAttribute("aria-expanded","false")}});
document.addEventListener("keydown",e=>{if(e.key!=="Escape")return;
  if(!ep.hidden){ep.hidden=true;eb.setAttribute("aria-expanded","false");eb.focus()}
  if(mb.getAttribute("aria-expanded")==="true"){setMenu(false);mb.focus()}});

/* ── radar: contrato de MapRadar (6 ejes, umbral de señal, sin porcentaje global) ── */
const AXES=["Calma","Claridad","Conexión","Propósito","Compasión","Consciencia"];
const EX={
  a:{Calma:.55,Claridad:.48},
  b:{Calma:.58,Claridad:.62,Conexión:.44,Consciencia:.5}
};
const NOTES={a:"Primeras semanas: solo dos dimensiones tienen señal. Con menos de tres no se dibuja área.",b:"Con más registros: cuatro dimensiones con señal y dos reuniendo datos. Más señal significa más registros, no más bienestar."};
function radar(vals,o){
  const W=o.big?440:180,H=o.big?360:170,cx=W/2,cy=o.big?178:85,R=o.big?118:62,n=6;
  const pt=(i,r)=>{const a=(-90+i*60)*Math.PI/180;return[cx+Math.cos(a)*r,cy+Math.sin(a)*r]};
  const ring=o.dark?"rgb(195 186 255/.28)":"#d9d5ce",gap=o.dark?"#c3baff":"#928d84",fill=o.dark?"#c3baff":"#8b71f5",lbl=o.dark?"#eeebff":"#574f45",lblOff=o.dark?"#c3baff":"#706b62",surf=o.dark?"#271c5e":"#fff";
  let s='<svg viewBox="0 0 '+W+' '+H+'" width="100%" role="img" aria-label="Mapa Emocional de ejemplo. Con señal: '+(Object.keys(vals).join(", ")||"ninguna")+'. Reuniendo datos: '+AXES.filter(a=>!(a in vals)).join(", ")+'.">';
  for(let k=1;k<=4;k++)s+='<polygon points="'+AXES.map((_,i)=>pt(i,R*k/4).join(",")).join(" ")+'" fill="none" stroke="'+ring+'" stroke-width="1"/>';
  AXES.forEach((a,i)=>{const e=pt(i,R);s+='<line x1="'+cx+'" y1="'+cy+'" x2="'+e[0]+'" y2="'+e[1]+'" stroke="'+(a in vals?ring:gap)+'" stroke-width="'+(a in vals?1:1.4)+'"'+(a in vals?'':' stroke-dasharray="4 4"')+'/>'});
  const ready=AXES.map((a,i)=>({a,i})).filter(x=>x.a in vals);
  if(ready.length>=3)s+='<polygon class="poly" points="'+ready.map(x=>pt(x.i,R*vals[x.a]).join(",")).join(" ")+'" fill="'+fill+'" fill-opacity=".24" stroke="'+fill+'" stroke-width="1.8"/>';
  AXES.forEach((a,i)=>{if(a in vals){const p=pt(i,R*vals[a]);s+='<circle cx="'+p[0]+'" cy="'+p[1]+'" r="'+(o.big?5:4)+'" fill="'+fill+'" stroke="'+surf+'" stroke-width="1.5"/>'}
    else{const p=pt(i,R*.16);s+='<circle cx="'+p[0]+'" cy="'+p[1]+'" r="4.5" fill="'+surf+'" stroke="'+gap+'" stroke-width="1.5" stroke-dasharray="3 3"/>'}});
  if(o.big)AXES.forEach((a,i)=>{const p=pt(i,R+26),c=Math.cos((-90+i*60)*Math.PI/180),an=Math.abs(c)<.3?"middle":c>0?"start":"end";
    s+='<text x="'+p[0]+'" y="'+p[1]+'" fill="'+(a in vals?lbl:lblOff)+'" font-family="Geist Mono,monospace" font-size="12.5" font-weight="600" letter-spacing="1.5" text-anchor="'+an+'" dominant-baseline="middle">'+a.toUpperCase()+'</text>'+
    (a in vals?'':'<text x="'+p[0]+'" y="'+(p[1]+16)+'" fill="'+lblOff+'" font-family="Geist,sans-serif" font-size="11" text-anchor="'+an+'" dominant-baseline="middle">Reuniendo datos</text>')});
  s+='<circle cx="'+cx+'" cy="'+cy+'" r="3" fill="'+fill+'"/></svg>';return s;
}
$$('[data-radar="hero"]').forEach(el=>el.innerHTML=radar(EX.b,{}));
const big=$('[data-radar="big"]');
const setEx=k=>{big.innerHTML=radar(EX[k],{big:1,dark:1});$$("[data-ex]").forEach(b=>b.setAttribute("aria-pressed",b.dataset.ex===k));$("#ex-note").textContent="Ejemplo con datos sintéticos. "+NOTES[k]};
$$("[data-ex]").forEach(b=>b.addEventListener("click",()=>setEx(b.dataset.ex)));setEx("b");

/* ── modo lectura / guiado ── */
const pL=$("#p-leer"),pG=$("#p-guia");
function setMode(m,focus){pL.hidden=m!=="leer";pG.hidden=m!=="guia";$$(".fh-seg [data-mode]").forEach(b=>b.setAttribute("aria-pressed",b.dataset.mode===m));
  if(focus){const t=m==="leer"?$("#rd-t"):$('.fh-step:not([hidden]) h3');if(t){t.setAttribute("tabindex","-1");t.focus({preventScroll:true})}}}
document.addEventListener("click",e=>{const b=e.target.closest("[data-mode]");if(!b)return;const inStage=b.closest(".fh-stage");setMode(b.dataset.mode,true);if(inStage&&!b.closest(".fh-seg"))scrollTo({top:$("#guiado").getBoundingClientRect().top+scrollY-88,behavior:RM?"auto":"smooth"})});

/* ── pasos ── */
let cur=0;const steps=$$(".fh-step"),tabs=$$("[data-go]"),prev=$("#g-prev"),next=$("#g-next");
function go(i,focus){cur=Math.max(0,Math.min(4,i));steps.forEach((s,k)=>s.hidden=k!==cur);
  tabs.forEach((t,k)=>{if(k===cur)t.setAttribute("aria-current","step");else t.removeAttribute("aria-current");if(k<cur)t.classList.add("seen")});
  prev.disabled=cur===0;next.hidden=cur===4;if(focus){const h=steps[cur].querySelector("h3");h&&h.focus({preventScroll:true})}}
tabs.forEach(t=>t.addEventListener("click",()=>go(+t.dataset.go,true)));
prev.addEventListener("click",()=>go(cur-1,true));next.addEventListener("click",()=>go(cur+1,true));
$$("[data-open-guide]").forEach(a=>a.addEventListener("click",e=>{e.preventDefault();setMode("guia");if(a.dataset.step)go(+a.dataset.step);
  const t=$("#guiado");scrollTo({top:t.getBoundingClientRect().top+scrollY-88,behavior:RM?"auto":"smooth"});setTimeout(()=>{const h=steps[cur].querySelector("h3");h&&h.focus({preventScroll:true})},RM?0:450)}));

/* ── práctica: clasificar lecturas ── */
const READS=["Está de acuerdo con la decisión.","Intenta mantener la calma delante del grupo.","Está decepcionada, pero prefiere no mostrarlo.","Le da igual el resultado."];
const OPTS=["Más plausible","Posible","Falta información"];
$("#fh-reads").innerHTML=READS.map((r,i)=>'<div class="fh-reading"><span id="rl'+i+'">'+r+'</span><fieldset aria-labelledby="rl'+i+'"><legend>'+r+'</legend>'+OPTS.map((o,k)=>'<label><input type="radio" name="rd'+i+'" value="'+k+'"><span>'+o+'</span></label>').join("")+'</fieldset></div>').join("");
$("#fh-reads").addEventListener("change",()=>{$("#fh-fb").hidden=false});

/* ── Eco (respuestas sintéticas) ── */
const ECO=[
  ["¿Puedes explicarme esta idea con una situación cotidiana?","Piensa en alguien que sonríe al abrir un regalo que no le gusta. La sonrisa es real, pero no te dice por sí sola si está contento o solo está siendo amable. Para saberlo necesitas más contexto: qué pasó antes, cómo suele reaccionar esa persona y qué dice después."],
  ["Entonces, ¿las expresiones no sirven para saber qué siente alguien?","Sí sirven: esta microguía parte de que el rostro aporta información. La idea es tratarlo como una pista y no como un diccionario, en el que cada gesto tendría un único significado. ¿Quieres probarlo con la práctica de la sonrisa?"]
];
const log=$("#eco-log");
$$("[data-eco]").forEach(b=>b.addEventListener("click",()=>{const e=ECO[+b.dataset.eco];$$("[data-eco]").forEach(x=>x.setAttribute("aria-pressed",x===b));
  log.innerHTML='<div class="fh-bub-u">'+e[0]+'</div><div class="fh-bub-e"><b style="display:block;font-size:12.5px;margin-bottom:4px;color:#5e42c0">Eco · respuesta de ejemplo</b>'+e[1]+'</div>'}));

/* ── sugerencia de patrón ── */
$$("[data-pt]").forEach(b=>b.addEventListener("click",()=>{const st=$("#pt-status");st.hidden=false;
  st.innerHTML=b.dataset.pt==="ok"?'La marcarías como confirmada. En esta muestra no se guarda. <button class="fh-btn fh-btn-3" type="button" data-pt-undo>Deshacer</button>':'La descartarías y dejaría de mostrarse. En esta muestra no se guarda. <button class="fh-btn fh-btn-3" type="button" data-pt-undo>Deshacer</button>';
  $("#pt-actions").hidden=true;st.querySelector("button").focus()}));
document.addEventListener("click",e=>{if(e.target.closest("[data-pt-undo]")){$("#pt-status").hidden=true;$("#pt-actions").hidden=false;$('[data-pt="ok"]').focus()}});

/* ── diálogos: <dialog> nativo (Escape y foco atrapado) + retorno del foco ── */
let opener=null;
$$("[data-open]").forEach(b=>b.addEventListener("click",()=>{opener=b;const d=document.getElementById(b.dataset.open);d.showModal();d.querySelector("[data-close]").focus()}));
$$(".fh-dlg").forEach(d=>{d.addEventListener("click",e=>{if(e.target===d||e.target.closest("[data-close]"))d.close()});
  d.addEventListener("close",()=>{if(opener&&document.contains(opener)&&!opener.closest("dialog"))opener.focus({preventScroll:true});opener=null})});

/* ── movimiento: la línea de tiempo se revela al recorrerla ── */
const rv=$$(".fh-reveal");
if(RM||!("IntersectionObserver" in window))rv.forEach(x=>x.classList.add("in"));
else{const io=new IntersectionObserver(es=>es.forEach(en=>{if(en.isIntersecting){en.target.classList.add("in");io.unobserve(en.target)}}),{rootMargin:"0px 0px -10% 0px"});
  rv.forEach((x,i)=>{x.style.transitionDelay=(i*90)+"ms";io.observe(x)})}
})();
