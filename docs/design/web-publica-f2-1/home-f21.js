/* FeelVerse · Home F2.1 · biblioteca, ficha, oferta (libro / catálogo), FAQ y Apariencia.
   Se carga ANTES de home-f1.js. Sin red; solo guarda la preferencia de apariencia de esta web, con su propia clave. */
(function(){
const D=window.FH_DATA,O=D.offer,$=s=>document.querySelector(s),$$=s=>[...document.querySelectorAll(s)];
const RM=matchMedia("(prefers-reduced-motion: reduce)").matches;
const S={book:null,period:"mensual"};
const ico=(n,st)=>'<svg class="fh-ico"'+(st?' style="'+st+'"':'')+'><use href="#i-'+n+'"/></svg>';
const motif='<svg class="m" viewBox="0 0 100 100" fill="none" stroke="#fff" stroke-width="1.2" aria-hidden="true"><polygon points="50,6 88,28 88,72 50,94 12,72 12,28"/><polygon points="50,24 72,37 72,63 50,76 28,63 28,37"/><path d="M50 6v88M12 28l76 44M88 28 12 72"/></svg>';
const cover=(b,sm)=>'<div class="fh-cv '+b.cover+(sm?' sm':'')+'" role="img" aria-label="Cubierta conceptual de '+b.title+'"><span class="b"><span>FeelVerse</span>'+(sm?'':'<span>'+b.theme+'</span>')+'</span>'+motif+'<span class="t">'+b.title+'</span></div>';
const fmts=b=>b.formats.length?'<div class="fh-fmt" aria-label="Formatos">'+b.formats.map(f=>'<span>'+ico(f.i)+f.t+'</span>').join("")+'</div>':'<p class="fh-fmt-q">La ficha publicada indicará sus formatos.</p>';
const book=id=>D.books.find(x=>x.id===id);
const go=(sel,focusSel)=>{const t=$(sel);scrollTo({top:t.getBoundingClientRect().top+scrollY-88,behavior:RM?"auto":"smooth"});setTimeout(()=>{const f=$(focusSel);f&&f.focus({preventScroll:true})},RM?0:420)};

/* biblioteca */
$("#fh-lib").innerHTML=D.books.map(b=>'<article class="fh-book" aria-labelledby="bk-'+b.id+'"><div class="fh-book-cv">'+cover(b)+'</div><div class="fh-book-body">'+
 '<span class="fh-mono">'+b.theme+'</span><h3 id="bk-'+b.id+'">'+b.title+'</h3><p>'+b.line+'</p>'+fmts(b)+
 '<button class="fh-btn fh-btn-2 fh-btn-sm" type="button" data-open="dlg-book" data-book="'+b.id+'">Conocer el libro'+ico("arrow","width:16px;height:16px")+'</button></div></article>').join("");

/* ficha: una plantilla, cuatro registros */
function fillBook(id){const b=book(id),r=b.formats.some(f=>f.k==="leer");
 $("#dlg-book-body").innerHTML='<div class="fh-detail">'+cover(b)+'<div>'+
  '<span class="fh-tag">Ficha de demostración</span><h2 id="db-t">'+b.title+'</h2><p style="margin:0;font-size:17px">'+b.line+'</p>'+
  '<h3>Temas que explora</h3><ul>'+b.explores.map(e=>'<li>'+e+'</li>').join("")+'</ul>'+
  '<h3>Cómo puedes usarlo</h3><div class="fh-modes">'+
   (r?'<button class="fh-mode" type="button" data-go-read><b>'+ico("book")+'Leer</b>El texto, a tu ritmo.</button>':'<div class="fh-mode off"><b>'+ico("book")+'Leer</b>La ficha publicada indicará si está disponible.</div>')+
   (b.guided?'<button class="fh-mode" type="button" data-go-guide><b>'+ico("bulb")+'Explorar el modo guiado</b>'+b.guideNote+'</button>':'<div class="fh-mode off"><b>'+ico("bulb")+'Modo guiado</b>La ficha publicada indicará si lo incluye.</div>')+
  '</div>'+
  '<h3>Cómo acceder</h3><div class="fh-modes">'+
   '<button class="fh-mode" type="button" data-access="book" data-id="'+b.id+'"><b>'+ico("book")+'Acceso a este libro</b>USD '+O.pass.price+', pago único · propuesta</button>'+
   '<button class="fh-mode" type="button" data-access="member"><b>'+ico("list")+'Acceso con membresía</b>Todo el catálogo, mensual o anual · propuesta</button>'+
  '</div>'+
  '<p style="margin:16px 0 0;font-size:13.5px;color:var(--fv-muted)">Cubierta conceptual y frase de orientación para revisión. Autoría, disponibilidad y acceso se confirmarán en la ficha publicada. Estado: '+b.status+'.</p>'+
 '</div></div>';}

/* oferta: dos alcances */
const list=items=>'<ul class="fh-scope">'+items.map(i=>'<li'+(i[1]?'':' class="no"')+'>'+ico(i[1]?"check":"x")+'<span>'+i[0]+'</span></li>').join("")+'</ul>';
$("#fh-plans").innerHTML=
 '<article class="fh-plan" id="plan-libro" aria-labelledby="pl-libro"><div class="fh-plan-top"><h3 id="pl-libro" tabindex="-1">Un libro</h3><p class="sub">Elige una obra y trabájala a tu ritmo.</p></div>'+
  '<p class="fh-price"><span class="c">'+O.currency+'</span><span class="n">'+O.pass.price+'</span><span class="p">'+O.pass.per+'</span></p><p class="eq">'+O.pass.note+'</p>'+
  '<div class="fh-pick" id="pick-slot" aria-live="polite"></div>'+list(O.pass.benefits)+'<div id="pass-cta" class="fh-plan-cta"></div></article>'+
 '<article class="fh-plan" id="plan-catalogo" aria-labelledby="pl-catalogo"><div class="fh-plan-top"><h3 id="pl-catalogo" tabindex="-1">Todo el catálogo</h3><p class="sub">Explora el conjunto publicado y sus herramientas.</p></div>'+
  '<div class="fh-seg fh-period" role="group" aria-label="Forma de pago de la membresía"><button type="button" data-period="mensual" aria-pressed="true">Mensual</button><button type="button" data-period="anual" aria-pressed="false">Anual</button></div>'+
  '<div aria-live="polite"><p class="fh-price"><span class="c">'+O.currency+'</span><span class="n" id="m-price"></span><span class="p" id="m-per"></span></p><p class="eq" id="m-eq"></p><p class="billed" id="m-billed"></p></div>'+
  list(O.member.benefits)+'<p class="eq" style="font-size:13.5px">'+O.member.excl+'</p>'+
  '<div class="fh-plan-cta"><button class="fh-btn fh-btn-1" type="button" data-open="dlg-plan" data-scope="catalogo">Revisar membresía</button></div></article>';
function renderPass(){const b=S.book&&book(S.book);
 $("#pick-slot").innerHTML=b?'<div class="fh-pick-on">'+cover(b,1)+'<div><span class="fh-mono">Obra elegida</span><b>'+b.title+'</b><small>'+b.status+'</small></div><button class="fh-btn fh-btn-3" type="button" data-open="dlg-pick">Cambiar</button></div>'
  :'<p class="fh-pick-empty">'+ico("book")+'Todavía no has elegido una obra.</p>';
 $("#pass-cta").innerHTML=b?'<button class="fh-btn fh-btn-1" type="button" data-open="dlg-plan" data-scope="libro" id="pass-btn">Revisar acceso a este libro</button>'
  :'<button class="fh-btn fh-btn-1" type="button" data-open="dlg-pick" id="pass-btn">Elegir un libro</button>';
 bindOpen($("#pick-slot"));bindOpen($("#pass-cta"));}
function renderPeriod(){const p=O.member[S.period];$("#m-price").textContent=p.price;$("#m-per").textContent=p.per;$("#m-eq").textContent=p.eq;$("#m-billed").textContent=p.billed;
 $$("[data-period]").forEach(b=>b.setAttribute("aria-pressed",b.dataset.period===S.period))}
$$("[data-period]").forEach(b=>b.addEventListener("click",()=>{S.period=b.dataset.period;renderPeriod()}));
$("#fh-cmp").innerHTML='<div class="fh-cmp-row head" aria-hidden="true"><span></span><span>Un libro</span><span>Todo el catálogo</span></div>'+
 O.compare.map(r=>'<div class="fh-cmp-row"><b>'+r[0]+'</b><span><em>Un libro</em>'+r[1]+'</span><span><em>Todo el catálogo</em>'+r[2]+'</span></div>').join("");

/* selector de obra */
function fillPick(){$("#fh-picklist").innerHTML=D.books.map(b=>'<button class="fh-pickitem" type="button" data-pick="'+b.id+'" aria-pressed="'+(S.book===b.id)+'">'+cover(b,1)+'<span><b>'+b.title+'</b><small>'+b.status+'</small></span></button>').join("")}
document.addEventListener("click",e=>{const p=e.target.closest("[data-pick]");if(!p)return;S.book=p.dataset.pick;const d=$("#dlg-pick");d.close();renderPass();$("#pass-btn").focus()});

/* resumen de simulación */
function fillSum(scope){const rows=[];let title;
 if(scope==="libro"){const b=book(S.book);title="Un libro";
  rows.push(["Alcance","Un libro"],["Obra",b.title],["Estado",b.status+(b.status==="Estado por confirmar"?". Esta obra no puede adquirirse todavía.":"")],["Moneda",O.currency],["Importe",O.currency+" "+O.pass.price],["Frecuencia","Pago único por título"],["Duración del acceso","Por definir"],["Eco","Cuota del paquete · cantidad por definir"],["Renovación","No corresponde (pago único)"]);}
 else{const p=O.member[S.period];title="Todo el catálogo";
  rows.push(["Alcance","Todo el catálogo"],["Forma de pago",S.period==="anual"?"Anual":"Mensual"],["Moneda",O.currency],["Importe",O.currency+" "+p.price+" "+p.per],["Cómo se cobra",p.billed],["Duración del acceso","Mientras la membresía esté activa"],["Eco","Cuota renovable · cantidad por definir"],["Dúo y Círculos","Modalidades y participantes por definir"],["Renovación y cancelación","Por definir"]);}
 $("#dlg-plan-body").innerHTML='<span class="fh-tag lav" style="justify-self:start">Simulación · no admite compras</span><h2 id="dp-t" style="font-family:var(--fv-font-display);font-weight:500;font-size:28px;color:var(--fv-text);margin:0">Resumen · '+title+'</h2>'+
  '<dl class="fh-sum">'+rows.map(r=>'<div><dt>'+r[0]+'</dt><dd>'+r[1]+'</dd></div>').join("")+'</dl>'+
  '<p style="margin:0;font-size:14.5px">No se piden datos de pago ni personales. Mientras falten las condiciones comerciales, esta propuesta no puede completarse.</p>';}

/* FAQ */
$("#fh-faq").innerHTML=D.faq.map((q,i)=>'<details class="fh-q"'+(i===0?' open':'')+'><summary><span class="n" aria-hidden="true">'+String(i+1).padStart(2,"0")+'</span><span>'+q[0]+'</span>'+ico("arrow","width:18px;height:18px").replace('class="fh-ico"','class="fh-ico fh-chev"')+'</summary><div class="a">'+q[1]+'</div></details>').join("");

/* apertura de diálogos para botones re-renderizados (los estáticos los enlaza home-f1.js) */
let opener=null;
function bindOpen(root){root.querySelectorAll("[data-open]").forEach(b=>b.addEventListener("click",()=>{opener=b;const d=document.getElementById(b.dataset.open);d.showModal();d.querySelector("[data-close]").focus()}))}
["dlg-pick","dlg-plan"].forEach(id=>document.getElementById(id).addEventListener("close",()=>{if(opener&&document.contains(opener))opener.focus({preventScroll:true});opener=null}));
document.addEventListener("click",e=>{const b=e.target.closest("[data-book]");if(b)fillBook(b.dataset.book);const s=e.target.closest("[data-scope]");if(s)fillSum(s.dataset.scope);if(e.target.closest('[data-open="dlg-pick"]'))fillPick()},true);

/* ficha → lectura / guía / planes (la obra elegida se conserva) */
const toStage=mode=>{$("#dlg-book").close();const seg=document.querySelector('.fh-seg [data-mode="'+mode+'"]');seg&&seg.click();go("#guiado",mode==="leer"?"#rd-t":".fh-step:not([hidden]) h3")};
document.addEventListener("click",e=>{if(e.target.closest("[data-go-read]"))toStage("leer");if(e.target.closest("[data-go-guide]"))toStage("guia");
 const a=e.target.closest("[data-access]");if(!a)return;if(a.dataset.access==="book"){S.book=a.dataset.id;renderPass()}$("#dlg-book").close();go("#planes",a.dataset.access==="book"?"#pl-libro":"#pl-catalogo")});

/* Apariencia: preferencia local de esta web, aislada del producto */
const KEY="feelverse-web-publica:apariencia",root=document.documentElement;
const syncTheme=()=>{const t=root.getAttribute("data-theme");$$("[data-theme-set]").forEach(b=>b.setAttribute("aria-pressed",b.dataset.themeSet===t))};
$$("[data-theme-set]").forEach(b=>b.addEventListener("click",()=>{root.setAttribute("data-theme",b.dataset.themeSet);try{localStorage.setItem(KEY,b.dataset.themeSet)}catch(e){}syncTheme();window.FH_radar&&window.FH_radar()}));
syncTheme();

const fl=$("[data-lockup-inv]");if(fl&&window.FV)fl.innerHTML=FV.lockup(22,{inv:true});
renderPass();renderPeriod();
window.FH_STATE=S;
})();
