/* FeelVerse · Home F2 · render de biblioteca, ficha, planes y FAQ desde FH_DATA.
   Se carga ANTES de home-f1.js para que sus [data-open] queden enlazados. */
(function(){
const D=window.FH_DATA,$=s=>document.querySelector(s);
const ico=(n,st)=>'<svg class="fh-ico"'+(st?' style="'+st+'"':'')+'><use href="#i-'+n+'"/></svg>';
const motif='<svg class="m" viewBox="0 0 100 100" fill="none" stroke="#fff" stroke-width="1.2" aria-hidden="true"><polygon points="50,6 88,28 88,72 50,94 12,72 12,28"/><polygon points="50,24 72,37 72,63 50,76 28,63 28,37"/><path d="M50 6v88M12 28l76 44M88 28 12 72"/></svg>';
const cover=(b,sm)=>'<div class="fh-cv '+b.cover+(sm?' sm':'')+'" role="img" aria-label="Cubierta conceptual de '+b.title+'"><span class="b"><span>FeelVerse</span><span>'+b.theme+'</span></span>'+motif+'<span class="t">'+b.title+'</span></div>';
const fmts=b=>b.formats.length?'<div class="fh-fmt" aria-label="Formatos">'+b.formats.map(f=>'<span>'+ico(f.i)+f.t+'</span>').join("")+'</div>':'<p class="fh-fmt-q">La ficha publicada indicará sus formatos.</p>';

/* biblioteca */
$("#fh-lib").innerHTML=D.books.map(b=>'<article class="fh-book" aria-labelledby="bk-'+b.id+'"><div class="fh-book-cv">'+cover(b)+'</div><div class="fh-book-body">'+
 '<span class="fh-mono">'+b.theme+'</span><h3 id="bk-'+b.id+'">'+b.title+'</h3><p>'+b.line+'</p>'+fmts(b)+
 '<button class="fh-btn fh-btn-2 fh-btn-sm" type="button" data-open="dlg-book" data-book="'+b.id+'">Conocer el libro'+ico("arrow","width:16px;height:16px")+'</button></div></article>').join("");

/* ficha: una plantilla, cuatro registros */
function fill(id){const b=D.books.find(x=>x.id===id),r=b.formats.some(f=>f.k==="leer");
 $("#dlg-book-body").innerHTML='<div class="fh-detail">'+cover(b)+'<div>'+
  '<span class="fh-tag">Ficha de demostración</span><h2 id="db-t">'+b.title+'</h2><p style="margin:0;font-size:17px">'+b.line+'</p>'+
  '<h3>Temas que explora</h3><ul>'+b.explores.map(e=>'<li>'+e+'</li>').join("")+'</ul>'+
  '<h3>Cómo puedes usarlo</h3><div class="fh-modes">'+
   (r?'<button class="fh-mode" type="button" data-go-read><b>'+ico("book")+'Leer</b>El texto, a tu ritmo.</button>':'<div class="fh-mode off"><b>'+ico("book")+'Leer</b>La ficha publicada indicará si está disponible.</div>')+
   (b.guided?'<button class="fh-mode" type="button" data-go-guide><b>'+ico("bulb")+'Explorar el modo guiado</b>'+b.guideNote+'</button>':'<div class="fh-mode off"><b>'+ico("bulb")+'Modo guiado</b>La ficha publicada indicará si lo incluye.</div>')+
  '</div>'+
  '<h3>Siguiente paso</h3><div class="fh-row">'+(b.guided?'<button class="fh-btn fh-btn-1 fh-btn-sm" type="button" data-go-guide>Probar la microguía de muestra</button>':'')+'<a class="fh-btn fh-btn-2 fh-btn-sm" href="#planes" data-close>Ver planes</a></div>'+
  '<p style="margin:16px 0 0;font-size:13.5px;color:var(--fv-muted)">Cubierta conceptual y frase de orientación para revisión. Autoría, disponibilidad y acceso se confirmarán en la ficha publicada.</p>'+
 '</div></div>';}
/* planes */
const P=D.plans;
const plan=(p,k)=>'<article class="fh-plan" id="plan-'+p.id+'" aria-labelledby="pl-'+p.id+'"><h3 id="pl-'+p.id+'">Membresía individual · '+p.name+'</h3>'+
 '<p class="fh-price"><span class="c">'+P.currency+'</span><span class="n">'+p.price+'</span><span class="p">'+p.per+'</span></p>'+
 (p.equiv?'<p class="eq">'+p.equiv+'</p>':'<p class="eq">Sin compromiso anual.</p>')+'<p class="billed">'+p.billed+'</p>'+
 '<ul class="fh-scope">'+P.scope.map(s=>'<li>'+ico("check")+'<span>'+s+'</span></li>').join("")+'</ul>'+
 '<button class="fh-btn '+(k?'fh-btn-1':'fh-btn-2')+'" type="button" data-open="dlg-plan" data-plan="'+p.id+'">Revisar esta opción</button></article>';
$("#fh-plans").innerHTML=plan(P.monthly,0)+plan(P.annual,1);
$("#fh-terms-dl").innerHTML=P.terms.map(t=>'<dt>'+t[0]+'</dt><dd>'+t[1]+'</dd>').join("");
function fillPlan(id){const p=id==="anual"?P.annual:P.monthly;
 document.querySelectorAll(".fh-plan").forEach(x=>x.classList.toggle("is-sel",x.id==="plan-"+id));
 $("#dlg-plan-body").innerHTML='<span class="fh-tag lav">Simulación · no admite compras</span><h2 id="dp-t" style="font-family:var(--fv-font-display);font-weight:500;font-size:28px;color:var(--fv-text);margin:10px 0 0">Resumen de tu selección</h2>'+
  '<dl><div><dt>Opción</dt><dd>Membresía individual · '+p.name+'</dd></div><div><dt>Importe</dt><dd>'+P.currency+' '+p.price+' '+p.per+'</dd></div><div><dt>Cómo se cobra</dt><dd>'+p.billed+'</dd></div>'+
  '<div><dt>Renovación y cancelación</dt><dd>Por definir antes de abrir suscripciones.</dd></div></dl>'+
  '<p style="margin:0;font-size:14.5px">No se piden datos de pago ni datos personales. Esta propuesta no puede completarse.</p>';}

/* FAQ */
$("#fh-faq").innerHTML=D.faq.map((q,i)=>'<details class="fh-q"'+(i===0?' open':'')+'><summary><span class="n" aria-hidden="true">'+String(i+1).padStart(2,"0")+'</span><span>'+q[0]+'</span>'+ico("arrow","width:18px;height:18px").replace('class="fh-ico"','class="fh-ico fh-chev"')+'</summary><div class="a">'+q[1]+'</div></details>').join("");

/* marca inversa en el footer */
const fl=$("[data-lockup-inv]");if(fl&&window.FV)fl.innerHTML=FV.lockup(22,{inv:true});

/* rellenar antes de que home-f1.js abra el diálogo (fase de captura) */
document.addEventListener("click",e=>{const b=e.target.closest("[data-book]");if(b)fill(b.dataset.book);const p=e.target.closest("[data-plan]");if(p)fillPlan(p.dataset.plan)},true);
const toStage=mode=>{const d=$("#dlg-book");d.close();const seg=document.querySelector('.fh-seg [data-mode="'+mode+'"]');seg&&seg.click();
 const t=$("#guiado");scrollTo({top:t.getBoundingClientRect().top+scrollY-88,behavior:matchMedia("(prefers-reduced-motion: reduce)").matches?"auto":"smooth"});
 setTimeout(()=>{const h=mode==="leer"?$("#rd-t"):document.querySelector(".fh-step:not([hidden]) h3");h&&h.focus({preventScroll:true})},300)};
document.addEventListener("click",e=>{if(e.target.closest("[data-go-read]"))toStage("leer");if(e.target.closest("[data-go-guide]"))toStage("guia")});
document.getElementById("dlg-plan").addEventListener("close",()=>{});
})();
