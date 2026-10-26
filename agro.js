'use strict';
const KEY='mallorca-agro-v1', WEATHER_KEY='mallorca-agro-weather-v1';
const $=id=>document.getElementById(id);
const escapeHTML=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const fmt=new Intl.NumberFormat('es-ES',{maximumFractionDigits:1});
const uid=()=>globalThis.crypto?.randomUUID?.()||Date.now().toString(36)+'-'+Math.random().toString(36).slice(2);
const today=()=>new Intl.DateTimeFormat('sv-SE',{timeZone:'Europe/Madrid',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
const dayLabel=day=>new Intl.DateTimeFormat('es-ES',{day:'numeric',month:'short',timeZone:'Europe/Madrid'}).format(new Date(day+'T12:00:00+01:00'));
const cropLabel=crop=>crop==='vid'?'Viña':'Cítricos';
const validDay=value=>typeof value==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(value)&&Number.isFinite(Date.parse(value+'T12:00:00Z'))&&new Date(value+'T12:00:00Z').toISOString().slice(0,10)===value;
const fingerprint=value=>{let n=2166136261;for(const c of value)n=Math.imul(n^c.charCodeAt(0),16777619);return (n>>>0).toString(16);};
const stages={vid:{unknown:'Sin indicar',green:'Hojas verdes / crecimiento',flower:'Floración o cuajado',fruit:'Racimos en desarrollo',post:'Vendimiada con hojas verdes',dormant:'Reposo / sin hojas'},citricos:{unknown:'Sin indicar',green:'Frutos verdes',colour:'Cambio de color',ripe:'Frutos maduros',none:'Sin fruta'}};
const pests={oidio:'Oídio',mildiu:'Mildiu',mosca:'Mosca de la fruta'};
let storageOK=true, weather=null,editing=null,currentTab='dashboard';
function notify(text,error=false){$('message').textContent=text;$('message').className=error?'error':'';$('message').hidden=false;clearTimeout(notify.timer);notify.timer=setTimeout(()=>$('message').hidden=true,6500);}
function validateState(s){
 if(!s||s.version!==1||!Array.isArray(s.parcels)||!Array.isArray(s.observations)||!Array.isArray(s.reviews)||s.parcels.length>250||s.observations.length>5000||s.reviews.length>10000)throw Error('Formato de copia no compatible');
 const ids=new Set();
 for(const p of s.parcels){if(!p||typeof p.id!=='string'||!/^[A-Za-z0-9_-]{1,100}$/.test(p.id)||ids.has(p.id)||typeof p.name!=='string'||!p.name.trim()||p.name.length>100||!Object.hasOwn(stages,p.crop)||!Object.hasOwn(stages[p.crop],p.stage)||p.zone!=='Llubí'||typeof p.variety!=='string'||p.variety.length>100)throw Error('Parcela no válida');ids.add(p.id);}
 const seen=new Set();
 for(const o of s.observations){if(!o||typeof o.id!=='string'||!/^[A-Za-z0-9_-]{1,100}$/.test(o.id)||seen.has(o.id)||!ids.has(o.parcelId)||!Object.hasOwn(pests,o.pest)||!validDay(o.date)||o.date>today()||typeof o.note!=='string'||o.note.length>3000||!['unknown','yes','no'].includes(o.symptoms)||(o.captures!==null&&(!Number.isInteger(o.captures)||o.captures<0||o.captures>100000)))throw Error('Observación no válida');const p=s.parcels.find(p=>p.id===o.parcelId);if((p.crop==='vid'&&o.pest==='mosca')||(p.crop==='citricos'&&o.pest!=='mosca'))throw Error('Problema no compatible con el cultivo');seen.add(o.id);}
 const reviewKeys=new Set();
 for(const r of s.reviews){if(!r||typeof r.key!=='string'||r.key.length>300||reviewKeys.has(r.key+'|'+String(r.signature??'legacy'))||!['reviewed','followup'].includes(r.state)||typeof r.note!=='string'||r.note.length>1000||typeof r.updated!=='string'||!Number.isFinite(Date.parse(r.updated)))throw Error('Revisión no válida');const parts=r.key.split('|');if(parts.length!==3||!ids.has(parts[0])||!Object.hasOwn(pests,parts[1])||!validDay(parts[2])||parts[2]>today())throw Error('Referencia de revisión no válida');if(r.signature!==undefined&&(typeof r.signature!=='string'||! /^[0-9a-f]{1,8}$/.test(r.signature)))throw Error('Firma de revisión no válida');reviewKeys.add(r.key+'|'+String(r.signature??'legacy'));}
 return s;
}
function load(){try{const raw=localStorage.getItem(KEY);return raw?validateState(JSON.parse(raw)):{version:1,parcels:[],observations:[],reviews:[]};}catch(error){storageOK=false;return {version:1,parcels:[],observations:[],reviews:[]};}}
let state=load();
function save(next){
 try{validateState(next);localStorage.setItem(KEY,JSON.stringify(next));state=next;storageOK=true;$('storage-warning').hidden=true;return true;}
 catch(error){storageOK=false;$('storage-warning').hidden=false;notify('No se han guardado los cambios. Revisa el almacenamiento del navegador o exporta una copia.',true);return false;}
}
function setTab(tab){currentTab=tab;for(const section of document.querySelectorAll('[data-panel]'))section.hidden=section.dataset.panel!==tab;for(const button of document.querySelectorAll('[data-tab]')){if(button.dataset.tab===tab)button.setAttribute('aria-current','page');else button.removeAttribute('aria-current');}render();}
function isFresh(){return weather&&Date.now()-weather.fetchedAt<6*60*60*1000&&weather.fetchedAt<=Date.now()+300000&&weather.data.daily.time.includes(today());}
function validateWeather(data){
 const h=data?.hourly,d=data?.daily;
 if(!h||!d||!Array.isArray(h.time)||h.time.length<24||!Array.isArray(d.time)||d.time.length<1||data.timezone!=='Europe/Madrid'||Math.abs(data.latitude-39.699)>.15||Math.abs(data.longitude-3.005)>.15||data.hourly_units?.temperature_2m!=='°C'||data.hourly_units?.precipitation!=='mm'||data.hourly_units?.relative_humidity_2m!=='%')throw Error('Previsión no válida');
 if(!h.time.every(t=>typeof t==='string'&&/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(t))||!d.time.every(t=>/^\d{4}-\d{2}-\d{2}$/.test(t))||new Set(h.time).size!==h.time.length||new Set(d.time).size!==d.time.length)throw Error('Fechas no válidas');
 for(const [key,min,max] of [['temperature_2m',-60,65],['relative_humidity_2m',0,100],['precipitation',0,1000]])if(!Array.isArray(h[key])||h[key].length!==h.time.length||!h[key].every(v=>Number.isFinite(v)&&v>=min&&v<=max))throw Error('Serie incompleta');
 for(const key of ['temperature_2m_max','temperature_2m_min','precipitation_sum'])if(!Array.isArray(d[key])||d[key].length!==d.time.length||!d[key].every(Number.isFinite))throw Error('Resumen incompleto');
 if(!d.time.every(day=>h.time.filter(t=>t.slice(0,10)===day).length>=23))throw Error('Días incompletos');
 return data;
}
function forecastDays(){if(!isFresh())return [];const h=weather.data.hourly;return weather.data.daily.time.filter(day=>day>=today()).map(day=>{
 const indices=h.time.map((t,i)=>t.startsWith(day)?i:-1).filter(i=>i>=0);let run=0,best=0,start=null,bestStart=null,bestEnd=null;
 for(const i of indices){if(h.temperature_2m[i]>=21.1&&h.temperature_2m[i]<=29.4){if(!run)start=h.time[i].slice(11);run++;if(run>best){best=run;bestStart=start;bestEnd=h.time[i].slice(11);}}else run=0;}
 return {day,hours:best,start:bestStart,end:bestEnd,min:Math.min(...indices.map(i=>h.temperature_2m[i])),max:Math.max(...indices.map(i=>h.temperature_2m[i])),rain:indices.reduce((sum,i)=>sum+h.precipitation[i],0),humid:indices.filter(i=>h.relative_humidity_2m[i]>=90).length};
 });}
function latestObservation(p,pest){return state.observations.filter(o=>o.parcelId===p.id&&o.pest===pest).sort((a,b)=>b.date.localeCompare(a.date)||b.id.localeCompare(a.id))[0];}
function recent(o){return o&&o.date<=today()&&(new Date(today()+'T12:00:00Z')-new Date(o.date+'T12:00:00Z'))/86400000<=7;}
function evaluate(p,pest,days){
 const observation=latestObservation(p,pest),key=[p.id,pest,today()].join('|');
 let kind='pending',title='Faltan datos',detail='',action='';
 if(p.crop==='vid'){
  if(p.stage==='unknown'){detail='Indica el estado de la viña para valorar si hay órganos susceptibles.';action='Completa el estado del cultivo en Parcelas.';}
  else if(p.stage==='dormant'){kind='neutral';title='Fuera del periodo de tejido verde';detail='Has indicado reposo o ausencia de hojas. No se evalúa infección de tejido verde; esto no confirma ausencia de inóculo.';action='Actualiza el estado cuando comience la brotación.';}
  else if(!days.length){detail='No hay previsión reciente y completa. No se asigna un riesgo bajo por falta de datos.';action='Actualiza el tiempo y revisa las observaciones de campo.';}
  else if(pest==='oidio'){
   const matches=days.filter(d=>d.hours>=6);
   if(matches.length){kind='watch';title='Ventana térmica favorable';detail=matches.slice(0,3).map(d=>dayLabel(d.day)+': '+d.start+'–'+d.end+' ('+d.hours+' lecturas horarias)').join('; ')+'. Temperaturas entre 21,1 y 29,4 °C. Es un indicador térmico, no el índice UC Davis completo ni una infección confirmada.';}
   else{kind='neutral';title='Sin ventana de 6 lecturas';detail='La previsión no cumple este indicador de 6 lecturas horarias consecutivas entre 21,1 y 29,4 °C. Puede haber actividad fuera de ese intervalo: no equivale a ausencia de riesgo.';}
   action='Revisa hojas y racimos susceptibles; confirma síntomas e historial con tu técnico. No se conoce el inóculo ni la temperatura dentro de la cubierta vegetal.';
  }else{
   const rain=days.filter(d=>d.rain>=0.2),humid=days.filter(d=>d.humid>=1);
   title='Mojado foliar sin medir';detail=rain.length?'Lluvia prevista: '+rain.slice(0,3).map(d=>dayLabel(d.day)+' ('+fmt.format(d.rain)+' mm)').join(', ')+'. La lluvia es una señal para revisar, no un umbral de infección.':'Sin lluvia apreciable prevista (acumulados inferiores a 0,2 mm/día). No descarta rocío, riego ni infecciones secundarias.';
   if(humid.length)detail+=' Hay horas con humedad relativa ≥90 %; humedad alta no demuestra que la hoja esté mojada.';
   action='Registra mojado foliar, riego y síntomas. Sin duración de mojado, temperatura de la hoja y estado del inóculo no se calcula una infección ni una fecha de tratamiento.';
  }
 }else{
  if(p.stage==='unknown'){detail='Falta indicar si hay fruta verde, en cambio de color o madura.';action='Indica variedad y estado del fruto. La época de peligro sigue a la maduración, no a un mes fijo.';}
  else if(p.stage==='none'){kind='neutral';title='Sin fruta en la parcela';detail='No has indicado frutos susceptibles. La plaga puede seguir presente en el entorno.';action='Retira frutos caídos y actualiza el estado cuando haya fruta.';}
  else if(p.stage==='green'){kind='neutral';title='Preparar vigilancia de maduración';detail='Has indicado frutos verdes. La sensibilidad depende de la variedad y madurez; no se concluye riesgo cero.';action='Revisa trampas e indica cuándo empieza el cambio de color.';}
  else{kind='watch';title='Fruta en periodo susceptible';detail='Con fruta en cambio de color o madura, revisa trampas y frutos. No se estima la población de Ceratitis capitata solo con el tiempo.';action='Registra capturas por trampa y día, tipo de atrayente, picaduras y fruta caída; consulta los umbrales locales con tu técnico.';}
  if(days.length)detail+=' Próximos días: máximas de '+fmt.format(Math.min(...days.map(d=>d.max)))+' a '+fmt.format(Math.max(...days.map(d=>d.max)))+' °C (previsión, no capturas).';
  else detail+=' No hay previsión reciente disponible.';
 }
 if(recent(observation)&&observation.symptoms==='yes'){kind='watch';title='Síntomas registrados: revisar';detail='Observación del '+dayLabel(observation.date)+': has registrado síntomas. Requieren identificación en campo; la app no confirma el diagnóstico. '+detail;}
 if(pest==='mosca'&&recent(observation)&&observation.captures>0){kind='watch';title='Capturas registradas';detail='Último registro: '+observation.captures+' moscas por trampa y día, el '+dayLabel(observation.date)+'. Verifica la identificación y el tipo de trampa. '+detail;}
 const signature=fingerprint([p.stage,p.variety,kind,title,detail,action].join('|'));
 return {key,p,pest,kind,title,detail,action,signature,review:state.reviews.find(r=>r.key===key&&r.signature===signature)};
}
function allAlerts(){const days=forecastDays();return state.parcels.flatMap(p=>(p.crop==='vid'?['oidio','mildiu']:['mosca']).map(pest=>evaluate(p,pest,days)));}
function renderWeather(){
 const days=forecastDays();$('weather-date').textContent=weather?'Consulta: '+new Intl.DateTimeFormat('es-ES',{timeZone:'Europe/Madrid',dateStyle:'short',timeStyle:'short'}).format(new Date(weather.fetchedAt))+' · hora de Mallorca':'Aún no se ha descargado la previsión';
 $('weather-reading').textContent=days.length?fmt.format(days[0].min)+'–'+fmt.format(days[0].max)+' °C':'Sin previsión reciente';
 $('weather-summary').textContent=days.length?'Hoy: '+fmt.format(days[0].rain)+' mm previstos · Llubí, punto de referencia municipal. La parcela puede tener otro microclima.':'Los avisos meteorológicos quedan pendientes. Las observaciones y parcelas siguen disponibles.';
 $('weather-table').innerHTML=days.length?'<div class="table-wrap"><table><caption class="small">Previsión de Open-Meteo · horario Europe/Madrid</caption><thead><tr><th>Fecha</th><th>Mín. / Máx.</th><th>Lluvia</th><th>Ventana oídio*</th><th>Horas HR ≥90 %</th></tr></thead><tbody>'+days.map(d=>'<tr><td>'+dayLabel(d.day)+'</td><td>'+fmt.format(d.min)+' / '+fmt.format(d.max)+' °C</td><td>'+fmt.format(d.rain)+' mm</td><td>'+(d.hours>=6?d.start+'–'+d.end:'Sin ventana de 6 lecturas')+'</td><td>'+d.humid+'</td></tr>').join('')+'</tbody></table></div><p class="small muted">*Indicador térmico orientativo (21,1–29,4 °C). No es un modelo de infección validado en tu parcela. Para hoy, el resumen puede incluir horas ya transcurridas.</p>':'<p class="muted">Actualiza para consultar los próximos 7 días.</p>';
}
function renderDashboard(){
 const alerts=allAlerts();$('count-parcels').textContent=state.parcels.length;$('count-watch').textContent=alerts.filter(a=>a.kind==='watch'&&!a.review).length;$('count-pending').textContent=alerts.filter(a=>a.kind==='pending').length;
 const filter=$('alert-filter').value;
 const visible=alerts.filter(a=>filter==='all'||(filter==='watch'&&a.kind==='watch')||(filter==='pending'&&a.kind==='pending')||(filter==='reviewed'&&a.review));
 $('alert-list').innerHTML=visible.length?visible.map(a=>'<article class="card"><div class="card-head"><div><div class="eyebrow">'+escapeHTML(a.p.name)+' · '+cropLabel(a.p.crop)+'</div><h3>'+pests[a.pest]+'</h3></div><span class="badge '+a.kind+'">'+escapeHTML(a.title)+'</span></div><p class="explain">'+escapeHTML(a.detail)+'</p><p class="explain"><strong>Qué revisar:</strong> '+escapeHTML(a.action)+'</p>'+(a.review?'<p><span class="badge done">'+(a.review.state==='reviewed'?'Revisada':'En seguimiento')+'</span> '+escapeHTML(a.review.note)+'</p>':'')+'<div class="meta">Llubí · '+escapeHTML(stages[a.p.crop][a.p.stage])+' · Evaluación del '+dayLabel(today())+'<br>Indicador orientativo. Revisarla no cambia el riesgo meteorológico.</div><div class="actions"><button data-review="'+escapeHTML(a.key)+'">'+(a.review?'Editar seguimiento':'Revisar / anotar')+'</button><button data-observe="'+escapeHTML(a.p.id)+'" data-pest="'+a.pest+'">Registrar observación</button></div></article>').join(''):'<div class="empty">'+(state.parcels.length?'No hay avisos que coincidan con este filtro.':'Añade tu primera parcela para generar los avisos de viña o cítricos.')+'</div>';
}
function fillObservationParcels(){const selected=$('obs-parcel').value;$('obs-parcel').innerHTML='<option value="">Elige una parcela</option>'+state.parcels.map(p=>'<option value="'+escapeHTML(p.id)+'">'+escapeHTML(p.name)+' · '+cropLabel(p.crop)+'</option>').join('');if(state.parcels.some(p=>p.id===selected))$('obs-parcel').value=selected;fillPests();$('obs-submit').disabled=!state.parcels.length;}
function fillPests(){const p=state.parcels.find(p=>p.id===$('obs-parcel').value);const previous=$('obs-pest').value;const options=p?(p.crop==='vid'?['oidio','mildiu']:['mosca']):[];$('obs-pest').innerHTML=options.map(k=>'<option value="'+k+'">'+pests[k]+'</option>').join('');if(options.includes(previous))$('obs-pest').value=previous;$('capture-field').hidden=$('obs-pest').value!=='mosca';}
function renderParcels(){
 $('parcel-list').innerHTML=state.parcels.length?state.parcels.map(p=>'<article class="entry"><div class="eyebrow">Llubí · '+cropLabel(p.crop)+'</div><h3>'+escapeHTML(p.name)+'</h3><p>'+escapeHTML(p.variety||'Variedad sin indicar')+' · '+escapeHTML(stages[p.crop][p.stage])+'</p><div class="actions"><button data-edit="'+escapeHTML(p.id)+'">Editar</button><button class="danger" data-delete="'+escapeHTML(p.id)+'">Eliminar parcela</button></div></article>').join(''):'<div class="empty">Todavía no has añadido parcelas. No se crean datos de campo ficticios.</div>';
}
function renderObservations(){
 $('review-history').innerHTML=state.reviews.length?[...state.reviews].sort((a,b)=>b.updated.localeCompare(a.updated)).map(r=>{const [parcelId,pest,date]=r.key.split('|');const p=state.parcels.find(p=>p.id===parcelId);return '<article class="entry"><div class="eyebrow">'+escapeHTML(date)+' · '+escapeHTML(p?.name||'Parcela archivada')+'</div><h3>'+escapeHTML(pests[pest]||pest)+' · '+(r.state==='reviewed'?'Revisado':'En seguimiento')+'</h3><p>'+escapeHTML(r.note||'Sin nota adicional')+'</p></article>';}).join(''):'<p class="muted">Todavía no has revisado ningún aviso.</p>';
 $('obs-list').innerHTML=state.observations.length?[...state.observations].sort((a,b)=>b.date.localeCompare(a.date)).map(o=>{const p=state.parcels.find(p=>p.id===o.parcelId);return '<article class="entry"><div class="eyebrow">'+dayLabel(o.date)+' · '+escapeHTML(p.name)+'</div><h3>'+pests[o.pest]+'</h3><p>Síntomas: '+({yes:'observados (sin diagnóstico confirmado)',no:'no observados en la revisión',unknown:'sin revisar'}[o.symptoms])+(o.pest==='mosca'&&o.captures!==null?' · Capturas: '+o.captures+' / trampa / día':'')+'</p><p>'+escapeHTML(o.note)+'</p><button class="link-button danger" data-delete-obs="'+escapeHTML(o.id)+'">Eliminar registro</button></article>';}).join(''):'<div class="empty">Registra revisiones, síntomas, mojado foliar, riego o capturas de trampas.</div>';
}
function render(){renderDashboard();renderParcels();renderObservations();fillObservationParcels();renderWeather();$('storage-warning').hidden=storageOK;}
function fillStages(){const crop=$('parcel-crop').value;$('parcel-stage').innerHTML=Object.entries(stages[crop]).map(([value,label])=>'<option value="'+value+'">'+label+'</option>').join('');}
function resetParcelForm(){editing=null;$('parcel-form').reset();fillStages();$('parcel-submit').textContent='Guardar parcela';$('parcel-cancel').hidden=true;}
$('parcel-crop').addEventListener('change',fillStages);
$('parcel-form').addEventListener('submit',event=>{
 event.preventDefault();if(!editing&&state.parcels.length>=250)return notify('Máximo 250 parcelas. Exporta una copia antes de reorganizarlas.',true);
 const p={id:editing||uid(),name:$('parcel-name').value.trim(),zone:'Llubí',crop:$('parcel-crop').value,variety:$('parcel-variety').value.trim(),stage:$('parcel-stage').value};
 if(!p.name)return notify('Escribe un nombre para la parcela.',true);
 const old=state.parcels.find(x=>x.id===editing);
 if(old&&old.crop!==p.crop&&state.observations.some(o=>o.parcelId===p.id))return notify('Esta parcela tiene observaciones. Crea otra parcela para cambiar de cultivo y conservar su historial.',true);
 const next={...state,parcels:editing?state.parcels.map(x=>x.id===editing?p:x):[...state.parcels,p]};
 if(save(next)){resetParcelForm();render();notify('Parcela guardada. Los avisos se han recalculado.');}
});
$('parcel-cancel').addEventListener('click',resetParcelForm);
$('obs-parcel').addEventListener('change',fillPests);$('obs-pest').addEventListener('change',fillPests);
$('obs-form').addEventListener('submit',event=>{
 event.preventDefault();if(state.observations.length>=5000)return notify('Máximo 5.000 observaciones. Exporta una copia.',true);
 const date=$('obs-date').value;if(!date||date>today())return notify('La observación no puede tener una fecha futura.',true);
 const raw=$('obs-captures').value;const captures=$('obs-pest').value==='mosca'&&raw!==''?Number(raw):null;
 if(captures!==null&&(!Number.isInteger(captures)||captures<0))return notify('Las capturas deben ser un entero no negativo.',true);
 const o={id:uid(),parcelId:$('obs-parcel').value,pest:$('obs-pest').value,date,symptoms:$('obs-symptoms').value,captures,note:$('obs-note').value.trim()};
 if(save({...state,observations:[...state.observations,o]})){$('obs-form').reset();$('obs-date').value=today();render();notify('Observación guardada.');}
});
document.addEventListener('click',event=>{
 const b=event.target.closest('button');if(!b)return;
 if(b.dataset.tab){setTab(b.dataset.tab);return;}
 if(b.dataset.edit){const p=state.parcels.find(p=>p.id===b.dataset.edit);if(!p)return;editing=p.id;$('parcel-name').value=p.name;$('parcel-crop').value=p.crop;$('parcel-variety').value=p.variety;fillStages();$('parcel-stage').value=p.stage;$('parcel-submit').textContent='Guardar cambios';$('parcel-cancel').hidden=false;$('parcel-name').focus();}
 if(b.dataset.delete){const p=state.parcels.find(p=>p.id===b.dataset.delete);if(p&&confirm('¿Eliminar '+p.name+' y sus observaciones? Exporta una copia antes si quieres conservarlas.')){if(save({...state,parcels:state.parcels.filter(x=>x.id!==p.id),observations:state.observations.filter(o=>o.parcelId!==p.id),reviews:state.reviews.filter(r=>!r.key.startsWith(p.id+'|'))})){if(editing===p.id)resetParcelForm();render();notify('Parcela eliminada.');}}}
 if(b.dataset.deleteObs&&confirm('¿Eliminar esta observación?')){if(save({...state,observations:state.observations.filter(o=>o.id!==b.dataset.deleteObs)}))render();}
 if(b.dataset.observe){setTab('observations');$('obs-parcel').value=b.dataset.observe;fillPests();$('obs-pest').value=b.dataset.pest;fillPests();$('obs-date').focus();}
 if(b.dataset.review){const a=allAlerts().find(a=>a.key===b.dataset.review);if(!a)return;$('review-key').value=a.key;$('review-key').dataset.signature=a.signature;$('review-heading').textContent=a.p.name+' · '+pests[a.pest];$('review-state').value=a.review?.state||'reviewed';$('review-note').value=a.review?.note||'';$('review-editor').hidden=false;$('review-note').focus();$('review-editor').scrollIntoView({block:'center'});}
});
$('review-cancel').addEventListener('click',()=>$('review-editor').hidden=true);
$('review-form').addEventListener('submit',event=>{event.preventDefault();const key=$('review-key').value;const alert=allAlerts().find(a=>a.key===key);if(!alert||alert.signature!==$('review-key').dataset.signature)return notify('El aviso ha cambiado. Vuelve a abrirlo antes de guardar la revisión.',true);const r={key,state:$('review-state').value,note:$('review-note').value.trim(),updated:new Date().toISOString(),signature:alert.signature};if(save({...state,reviews:[...state.reviews.filter(x=>x.key!==key||x.signature!==r.signature),r]})){$('review-editor').hidden=true;render();notify('Seguimiento guardado para estos datos. Si cambian las condiciones o el día, tendrás que revisarlo de nuevo.');}});
$('alert-filter').addEventListener('change',renderDashboard);
$('export').addEventListener('click',()=>{const blob=new Blob([JSON.stringify({...state,exportedAt:new Date().toISOString()},null,2)],{type:'application/json'});const url=URL.createObjectURL(blob);const a=document.createElement('a');a.href=url;a.download='mallorca-agro-copia-'+today()+'.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);notify('Copia exportada. Guárdala fuera del navegador.');});
$('import-file').addEventListener('change',async event=>{const file=event.target.files[0];if(!file)return;try{if(file.size>10000000)throw Error('La copia supera 10 MB');const incoming=validateState(JSON.parse(await file.text()));if(confirm('Restaurar '+incoming.parcels.length+' parcelas y '+incoming.observations.length+' observaciones. Esto sustituye tus registros actuales. ¿Continuar?')){if(save(incoming)){resetParcelForm();render();notify('Copia restaurada.');}}}catch(error){notify('No se ha importado la copia: '+error.message,true);}finally{event.target.value='';}});
async function updateWeather(){
 if($('refresh-weather').disabled)return;$('refresh-weather').disabled=true;$('weather-error').textContent='Consultando previsión…';
 const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),20000);
 try{
  const params=new URLSearchParams({latitude:'39.699',longitude:'3.005',hourly:'temperature_2m,relative_humidity_2m,precipitation',daily:'temperature_2m_max,temperature_2m_min,precipitation_sum',timezone:'Europe/Madrid',forecast_days:'7',temperature_unit:'celsius',precipitation_unit:'mm'});
  const response=await fetch('https://api.open-meteo.com/v1/forecast?'+params,{signal:controller.signal});if(!response.ok)throw Error('HTTP '+response.status);
  const data=validateWeather(await response.json());if(!data.daily.time.includes(today()))throw Error('Previsión fuera de fecha');weather={data,fetchedAt:Date.now()};
  try{localStorage.setItem(WEATHER_KEY,JSON.stringify(weather));}catch(error){notify('Previsión disponible, pero no se pudo guardar su copia local.',true);}
  $('weather-error').textContent='';render();
 }catch(error){$('weather-error').textContent='No se pudo actualizar. '+(isFresh()?'Se conserva la previsión anterior, con su fecha de consulta.':'Sin previsión reciente: los avisos meteorológicos quedan pendientes.');render();}
 finally{clearTimeout(timer);$('refresh-weather').disabled=false;}
}
$('refresh-weather').addEventListener('click',updateWeather);
try{const cached=JSON.parse(localStorage.getItem(WEATHER_KEY));if(cached&&Number.isFinite(cached.fetchedAt)){validateWeather(cached.data);weather=cached;}}catch(error){/* A cache failure never replaces field records. */}
fillStages();$('obs-date').value=today();$('obs-date').max=today();render();updateWeather();
setInterval(()=>{render();updateWeather();},30*60*1000);
