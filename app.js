'use strict';
const API='https://ct-campeador-api.ligasdetenis.workers.dev/';
const $=id=>document.getElementById(id);
const $$=sel=>Array.from(document.querySelectorAll(sel));
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const state={token:'',name:'',records:[],results:{},tab:'pending',pending:null,loading:false,deferredPrompt:null};
const euro=n=>new Intl.NumberFormat('es-ES',{style:'currency',currency:'EUR'}).format(n);
const dateText=v=>/^\d{4}-\d{2}-\d{2}$/.test(v||'')?new Date(v+'T12:00:00').toLocaleDateString('es-ES',{day:'2-digit',month:'short',year:'numeric'}):String(v||'Sin fecha');
const initials=name=>String(name||'?').split(/\s+/).filter(Boolean).slice(0,2).map(x=>x[0].toUpperCase()).join('')||'?';
async function api(body,requiresAuth=true){
  const c=new AbortController(), timeout=setTimeout(()=>c.abort(),18000);
  try{
    const r=await fetch(API,{method:'POST',headers:{'Content-Type':'application/json',...(requiresAuth&&state.token?{Authorization:'Bearer '+state.token}:{})},body:JSON.stringify(body),cache:'no-store',signal:c.signal});
    const v=await r.json().catch(()=>({}));
    if(!r.ok||v.ok===false) throw Error(v.error||('Error HTTP '+r.status));
    return v;
  }catch(e){ if(e.name==='AbortError') throw Error('Tiempo de espera agotado. Comprueba la conexión.'); throw e; }
  finally{ clearTimeout(timeout); }
}
function setStatus(s){ $('status').textContent=s; }
function showNotice(msg,error=false){ const n=$('notice'); n.textContent=msg; n.className=(error?'errorBox':'infoBox'); n.classList.remove('hidden'); }
function hideNotice(){ $('notice').classList.add('hidden'); }
function logout(){ state.token=''; state.name=''; state.records=[]; state.results={}; $('pin').value=''; $('app').classList.add('hidden'); $('logout').classList.add('hidden'); $('loginPage').classList.remove('hidden'); $('loginError').classList.add('hidden'); setStatus('Acceso restringido'); }
$('logout').onclick=logout;
$('loginForm').onsubmit=async ev=>{
  ev.preventDefault(); const btn=$('loginBtn'), err=$('loginError'); btn.disabled=true; err.classList.add('hidden');
  try{
    const result=await api({action:'loginPin',pin:$('pin').value.trim()},false);
    if(result.user?.role!=='admin') throw Error('Este PIN no pertenece a una cuenta de administrador.');
    state.token=result.token; state.name=result.user.name; $('pin').value='';
    $('loginPage').classList.add('hidden'); $('app').classList.remove('hidden'); $('logout').classList.remove('hidden');
    setStatus('Sesión iniciada · '+state.name);
    await refresh();
  }catch(e){ state.token=''; err.textContent=e.message; err.classList.remove('hidden'); }
  finally{ btn.disabled=false; }
};
function timestampEnd(b){
  const d=String(b.date||''); if(!/^\d{4}-\d{2}-\d{2}$/.test(d)) return NaN;
  const found=[...String(b.time||'').matchAll(/(?:[01]?\d|2[0-3]):[0-5]\d/g)].map(m=>m[0]); if(!found.length) return NaN;
  const [hh,mm]=found[found.length-1].split(':').map(Number); const dt=new Date(d+'T12:00:00'); dt.setHours(hh,mm,0,0); return dt.getTime();
}
function eligibility(r){
  const b=r.reservation||{}, res=state.results[r.matchId];
  if(r.status==='cancelled'||r.status==='replaced') return {ok:false,reason:'Reserva cancelada o reprogramada · sin cargo'};
  if(!['active','completed'].includes(r.status)) return {ok:false,reason:'Estado histórico no cobrable'};
  const end=timestampEnd(b); if(!Number.isFinite(end)||end>Date.now()) return {ok:false,reason:'Pista futura o franja todavía no terminada'};
  if(res?.type==='not_played') return {ok:false,reason:'Partido marcado como no disputado · sin cargo'};
  return {ok:true,reason:res?.status==='confirmed'?'Resultado confirmado':'Resultado pendiente o todavía no comunicado'};
}
function players(r){ const b=r.reservation||{}; return ['a','b'].filter(k=>String(b[k]||'').trim()).map(k=>({side:k,name:b[k],paid:r['payment'+k.toUpperCase()]==='paid'})); }
function validRecords(){ return state.records.filter(r=>eligibility(r).ok); }
function filtered(){
  const search=$('search').value.trim().toLocaleLowerCase('es'); const month=$('month').value; const court=$('court').value;
  return validRecords().filter(r=>{
    const ps=players(r), b=r.reservation||{};
    const tabOk=state.tab==='all'||(state.tab==='pending'?ps.some(p=>!p.paid):ps.some(p=>p.paid));
    const searchOk=!search||[b.a,b.b,b.date,b.time,b.court,b.week].join(' ').toLocaleLowerCase('es').includes(search);
    const monthOk=month==='all'||String(b.date||'').startsWith(month);
    const courtOk=court==='all'||b.court===court;
    return tabOk&&searchOk&&monthOk&&courtOk;
  }).sort((a,b)=>String(b.reservation?.date||'').localeCompare(String(a.reservation?.date||''))||String(b.reservation?.time||'').localeCompare(String(a.reservation?.time||'')));
}
function render(){
  const valid=validRecords(), allPlayers=valid.flatMap(players);
  $('nBookings').textContent=valid.length; $('nPending').textContent=allPlayers.filter(x=>!x.paid).length; $('nPaid').textContent=allPlayers.filter(x=>x.paid).length; $('nExcluded').textContent=state.records.length-valid.length;
  const rows=filtered(); $('total').textContent=rows.length+' reservas'; $('listTitle').textContent={pending:'Pagos pendientes',paid:'Pagos abonados',all:'Todos los cobros'}[state.tab];
  $('printedAt').textContent='Generado el '+new Date().toLocaleDateString('es-ES')+' a las '+new Date().toLocaleTimeString('es-ES',{hour:'2-digit',minute:'2-digit'});
  const unit=Math.max(0,Number($('price').value)||0);
  $('list').innerHTML=rows.length?rows.map(r=>{
    const b=r.reservation||{}, ps=players(r), info=eligibility(r), fullyPaid=ps.length&&ps.every(x=>x.paid);
    return `<article class="card record">
      <div>
        <div class="recordTop">
          <div>
            <div class="recordMeta">${esc(dateText(b.date))} · ${esc(b.time||'Hora sin indicar')} · ${esc(b.court||'Pista sin indicar')}${b.week?` · ${esc(b.week)}`:''}</div>
            <h4 class="recordTitle">${esc(b.a||'?')} <span class="vs">vs</span> ${esc(b.b||'?')}</h4>
          </div>
        </div>
        <div class="reason">${info.reason.includes('confirmado')?'✅':'🕓'} ${esc(info.reason)}</div>
        <div class="players">${ps.map(x=>`<div class="player">
          <div class="pMain">
            <div class="avatar">${esc(initials(x.name))}</div>
            <div class="pText"><b>${esc(x.name)}</b><span>${unit?`Importe orientativo ${esc(euro(unit))}`:'Sin importe configurado'}</span></div>
          </div>
          <div class="toolbar">
            <span class="chip ${x.paid?'paid':'pending'}">${x.paid?'🟢 Abonado':'🔴 Pendiente'}${unit?` · ${esc(euro(unit))}`:''}</span>
            <button class="btn ${x.paid?'secondary':'primary'} small noPrint" data-id="${esc(r.bookingId)}" data-side="${x.side}" data-next="${x.paid?'pending':'paid'}">${x.paid?'Revertir':'Marcar pagado'}</button>
          </div>
        </div>`).join('')}</div>
      </div>
      <div class="recordAside">
        <span class="badge ${fullyPaid?'paid':'pending'}">${fullyPaid?'✅ Cobro completo':'⏳ Pendiente de cobro'}</span>
        <div class="muted" style="font-size:12px;font-weight:700">ID reserva: ${esc(r.bookingId||'—')}</div>
      </div>
    </article>`;
  }).join(''):`<div class="empty"><h4>No hay cobros para estos filtros</h4><p>Prueba con otro mes, otra pista o cambia entre pendientes, abonados y todos.</p></div>`;
  $('list').querySelectorAll('[data-id]').forEach(btn=>btn.onclick=()=>choose(btn.dataset.id,btn.dataset.side,btn.dataset.next));
}
async function refresh(){
  if(!state.token||state.loading) return; state.loading=true; $('refresh').disabled=true; setStatus('Actualizando datos…');
  try{
    const [pay,league]=await Promise.all([api({action:'listCourtPayments'}),api({action:'read'})]);
    if(!Array.isArray(pay.records)||!league.state?.results) throw Error('La API no devolvió resultados completos.');
    state.records=pay.records; state.results=league.state.results;
    const months=[...new Set(state.records.map(r=>String(r.reservation?.date||'').slice(0,7)).filter(x=>/^\d{4}-\d{2}$/.test(x)))].sort().reverse();
    const courts=[...new Set(state.records.map(r=>String(r.reservation?.court||'')).filter(Boolean))].sort((a,b)=>a.localeCompare(b,'es',{numeric:true}));
    const monthVal=$('month').value, courtVal=$('court').value;
    $('month').replaceChildren(new Option('Todos','all'),...months.map(x=>new Option(new Date(x+'-15T12:00:00').toLocaleDateString('es-ES',{month:'long',year:'numeric'}),x)));
    $('month').value=months.includes(monthVal)?monthVal:'all';
    $('court').replaceChildren(new Option('Todas','all'),...courts.map(x=>new Option(x,x)));
    $('court').value=courts.includes(courtVal)?courtVal:'all';
    hideNotice(); setStatus('Conectado · última actualización '+new Date().toLocaleTimeString('es-ES',{hour:'2-digit',minute:'2-digit'})); render();
  }catch(e){ state.records=[]; state.results={}; render(); showNotice('No se han podido cargar los cobros: '+e.message,true); setStatus('Error de consulta'); }
  finally{ state.loading=false; $('refresh').disabled=false; }
}
function choose(id,side,next){ const r=state.records.find(x=>x.bookingId===id); if(!r||!eligibility(r).ok) return; state.pending={bookingId:id,side,payment:next}; const who=r.reservation?.[side]||'Jugador'; $('modalTitle').textContent=next==='paid'?'Confirmar cobro':'Revertir cobro'; $('modalText').textContent='¿Quieres marcar el pago de '+who+' como '+(next==='paid'?'ABONADO':'PENDIENTE')+'?'; $('confirm').classList.remove('hidden'); $('accept').focus(); }
function closeModal(){ state.pending=null; $('confirm').classList.add('hidden'); }
$('cancel').onclick=closeModal; $('confirm').onclick=e=>{ if(e.target===$('confirm')) closeModal(); }; document.addEventListener('keydown',e=>{ if(e.key==='Escape') closeModal(); });
$('accept').onclick=async()=>{ const change=state.pending; if(!change) return; $('accept').disabled=true; try{ await api({action:'setCourtPayment',...change}); closeModal(); await refresh(); showNotice('El pago se ha guardado correctamente.'); }catch(e){ closeModal(); showNotice('No se ha guardado: '+e.message,true); }finally{ $('accept').disabled=false; } };
$$('[data-tab]').forEach(b=>b.onclick=()=>{ state.tab=b.dataset.tab; $$('[data-tab]').forEach(x=>x.classList.toggle('active',x===b)); render(); });
['search','month','court','price'].forEach(id=>$(id).addEventListener(id==='search'||id==='price'?'input':'change',render));
$('refresh').onclick=refresh; $('print').onclick=()=>window.print();
$('csv').onclick=()=>{ const rows=[['Fecha','Hora','Pista','Jugador A','Pago A','Jugador B','Pago B','Estado']]; for(const r of filtered()){ const b=r.reservation||{}; rows.push([b.date||'',b.time||'',b.court||'',b.a||'',r.paymentA==='paid'?'Abonado':'Pendiente',b.b||'',r.paymentB==='paid'?'Abonado':'Pendiente',eligibility(r).reason]); } const text='\ufeff'+rows.map(r=>r.map(x=>'"'+String(x).replace(/"/g,'""')+'"').join(';')).join('\r\n'); const url=URL.createObjectURL(new Blob([text],{type:'text/csv;charset=utf-8'})); const a=document.createElement('a'); a.href=url; a.download='CT_Campeador_control_pistas_'+new Date().toISOString().slice(0,10)+'.csv'; a.click(); setTimeout(()=>URL.revokeObjectURL(url),1500); };
async function triggerInstall(){
  if(state.deferredPrompt){
    state.deferredPrompt.prompt();
    try{ await state.deferredPrompt.userChoice; }catch{}
    state.deferredPrompt=null; updateInstallTexts(); return;
  }
  const ua=navigator.userAgent||'';
  let msg='Instalación manual:\n\n';
  if(/iphone|ipad|ipod/i.test(ua)) msg+='En Safari pulsa Compartir y después “Añadir a pantalla de inicio”.';
  else if(/android/i.test(ua)) msg+='En Chrome abre el menú ⋮ y pulsa “Instalar app” o “Añadir a pantalla de inicio”.';
  else msg+='Usa el menú del navegador y busca “Instalar app”, “Instalar esta aplicación” o “Crear acceso directo”.';
  alert(msg);
}
function updateInstallTexts(){
  const available=!!state.deferredPrompt;
  $('installHint').textContent=available?'Tu navegador permite instalación directa. Pulsa “Instalar ahora”.':'Si no aparece la instalación automática, usa el menú del navegador para añadirla a la pantalla de inicio.';
}
window.addEventListener('beforeinstallprompt',e=>{ e.preventDefault(); state.deferredPrompt=e; updateInstallTexts(); });
$('installHero').onclick=triggerInstall; $('installTop').onclick=triggerInstall; $('howInstall').onclick=triggerInstall;
if('serviceWorker' in navigator && location.protocol==='https:') window.addEventListener('load',()=>navigator.serviceWorker.register('./sw.js').catch(console.warn));
updateInstallTexts();
