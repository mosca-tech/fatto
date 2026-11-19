// Logica della bacheca: portata dal prototipo, con Supabase al posto del database di Claude.
export function initBoard(sb){
  var ac=new AbortController();
  var COLS=[
    {id:'later',name:'Prima o poi',hint:'Nessuna scadenza vicina'},
    {id:'month',name:'Questo mese',hint:''},
    {id:'week',name:'Questa settimana',hint:''},
    {id:'today',name:'Oggi',hint:'Da chiudere prima di spegnere il PC'},
    {id:'done',name:'Fatto',hint:'Ultimi 7 giorni'}
  ];
  var EST=[0,15,30,45,60,90,120,180,240,480];
  var NCOL=8, DAYS=['Lun','Mar','Mer','Gio','Ven','Sab','Dom'], DAYS_LONG=['lunedì','martedì','mercoledì','giovedì','venerdì','sabato','domenica'];
  // Ricorrenze: i quattro valori standard oppure "numero + unità" (es. '2y' = ogni 2 anni, '3w' = ogni 3 settimane).
  var REC_STD={daily:'1d',weekly:'1w',monthly:'1m',yearly:'1y'}, REC_NAME={d:'daily',w:'weekly',m:'monthly',y:'yearly'};
  var UNIT={d:['giorno','giorni'],w:['settimana','settimane'],m:['mese','mesi'],y:['anno','anni']};
  function recParse(r){ var m=/^([1-9]\d?)([dwmy])$/.exec(REC_STD[r]||r||''); return m?{n:+m[1],u:m[2]}:null }
  function recText(r){ var p=recParse(r); return !p?'':p.n===1?'ogni '+UNIT[p.u][0]:'ogni '+p.n+' '+UNIT[p.u][1] }
  function recValue(n,u){ n=Math.min(99,Math.max(1,parseInt(n,10)||1)); return n===1?REC_NAME[u]:n+u }

  var tasks=new Map(), labels=new Map(), props=new Map(), db=null, seq=0;
  var filter={labels:new Set(),important:false,late:false,q:''};
  var NOTICE=[[0,'Nessuno'],[3,'3 giorni prima'],[7,'1 settimana prima'],[14,'2 settimane prima'],[30,'1 mese prima'],[60,'2 mesi prima'],[90,'3 mesi prima']];
  var mobileCol='today', weekOffset=0, editingId=null, delArmed=false, propsHidden=false, dueMove=null, dlgCol='today', hiddenCols=new Set(), colsOpen=false, snoozeOpen=null;

  var $=function(id){return document.getElementById(id)};
  function esc(s){return String(s==null?'':s).replace(/[&<>"']/g,function(c){return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]})}
  function fmt(m){m=Math.round(m||0); if(!m) return '0h'; if(m<60) return m+'m'; var h=Math.floor(m/60), r=m%60; return h+'h'+(r?' '+r+'m':'')}
  function sync(msg,bad){var e=$('sync'); e.textContent=msg; e.className=bad?'bad':''}
  function lc(l){return 'var(--h'+((l&&l.color|0)%NCOL)+')'}
  function ymd(d){return d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0')}
  function today(){return ymd(new Date())}
  function dueFor(col,from){
    var d=from?new Date(from):new Date(); if(isNaN(d)) d=new Date();
    if(col==='today') return ymd(d);
    if(col==='week'){d.setDate(d.getDate()+(7-d.getDay())%7); return ymd(d)}
    if(col==='month') return ymd(new Date(d.getFullYear(),d.getMonth()+1,0));
    return null;
  }
  function dueOf(t){ if(t.col==='done') return null; if(t.due!==undefined) return t.due; return dueFor(t.col,t.createdAt) }
  function isLate(t){var d=dueOf(t); return !!d&&d<today()}
  function daysLate(t){return Math.round((new Date(today()+'T00:00:00')-new Date(dueOf(t)+'T00:00:00'))/864e5)}
  // Prossima occorrenza di un task ricorrente: finché non arriva la sua data resta "in attesa" e si vede in Prima o poi, in grigio.
  function isPending(t){return !!t.startsOn&&t.col!=='done'&&t.startsOn>today()}
  // La colonna dice quando pensi di farlo; la scadenza può solo anticiparlo (mai rimandarlo).
  // Vale per le scadenze scelte da te, non per quelle standard della colonna (domenica, ultimo giorno del mese).
  var RANK={today:0,week:1,month:2,later:3};
  function colFromDue(d){var tod=today(); return d<=tod?'today':d<=weekEndOf(tod)?'week':d<=monthEndOf(tod)?'month':'later'}
  function explicitDue(t){
    var d=t.due; if(!d||t.col==='done') return false;
    if(t.col==='later') return true;
    if(t.col==='month') return d!==monthEndOf(d);
    if(t.col==='week') return dateOf(d).getDay()!==0;
    return d>today();
  }
  // Preavviso: dal giorno "scadenza meno N giorni" il task sale almeno in Questa settimana.
  function noticeFrom(t){ return t.noticeDays>0&&t.due&&t.col!=='done'?addDays(t.due,-t.noticeDays):null }
  function inNotice(t){ var nf=noticeFrom(t); return !!nf&&nf<=today() }
  function planCol(t){
    if(t.col==='done') return t.col;
    var c=t.col;
    if(explicitDue(t)){ var d=colFromDue(t.due); if(RANK[d]<RANK[c]) c=d }
    if(inNotice(t)&&RANK.week<RANK[c]) c='week';
    return c;
  }
  // La colonna non è troppo in là rispetto alla scadenza? (Oggi va sempre bene.)
  function dueFits(col,d){ return !d||col==='done'||col==='today'||RANK[col]<=RANK[colFromDue(d)] }
  function minDue(col){
    var tod=today();
    return col==='week'?addDays(tod,1):col==='month'?addDays(weekEndOf(tod),1):col==='later'?addDays(monthEndOf(tod),1):'';
  }
  function shownCol(t){return isPending(t)?'later':isLate(t)?'today':planCol(t)}

  try{ var saved=JSON.parse(localStorage.getItem('bacheca.filter')||'null'); if(saved){filter.labels=new Set(saved.labels||[]); filter.important=!!saved.important; if(saved.col) mobileCol=saved.col} }catch(e){}
  try{ propsHidden=localStorage.getItem('bacheca.propsHidden')==='1' }catch(e){}
  // Colonne nascoste su questo dispositivo. Chi aveva acceso "Nascondi i task completati" ritrova Fatto nascosta.
  try{
    var hc=JSON.parse(localStorage.getItem('bacheca.hiddenCols')||'null');
    if(Array.isArray(hc)) hiddenCols=new Set(hc.filter(function(id){return COLS.some(function(c){return c.id===id})}));
    else if(localStorage.getItem('bacheca.hideDone')==='1') hiddenCols.add('done');
    if(hiddenCols.size>=COLS.length) hiddenCols.clear();
  }catch(e){}
  function persistCols(){ try{localStorage.setItem('bacheca.hiddenCols',JSON.stringify(Array.from(hiddenCols)))}catch(e){} }
  function persist(){ try{localStorage.setItem('bacheca.filter',JSON.stringify({labels:Array.from(filter.labels),important:filter.important,col:mobileCol}))}catch(e){} }

  /* ---------- store (Supabase) ---------- */
  function fail(e){ sync('Salvataggio non riuscito, riprova',true); if(window.console) console.error(e); loadAll(); }
  function check(r){ if(r&&r.error) throw r.error; return r }
  function uuid(){
    if(window.crypto&&crypto.randomUUID) return crypto.randomUUID();
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g,function(c){var r=Math.random()*16|0; return (c==='x'?r:(r&3|8)).toString(16)});
  }
  function taskRow(d){
    return {title:d.title||'',col:d.col||'today',labels:d.labels||[],est:d.est|0,important:!!d.important,recurring:d.recurring||'none',
      note:d.note||'',due:d.due||null,source:d.source||null,prev_col:d.prevCol||null,created_at:d.createdAt||nowISO(),done_at:d.doneAt||null,starts_on:d.startsOn||null,
      notice_days:d.noticeDays|0,in_calendar:!!d.inCalendar};
  }
  function taskObj(r){
    return {title:r.title,col:r.col,labels:r.labels||[],est:r.est||0,important:!!r.important,recurring:r.recurring||'none',
      note:r.note||'',due:r.due||null,source:r.source||null,prevCol:r.prev_col||null,createdAt:r.created_at,doneAt:r.done_at||null,startsOn:r.starts_on||null,
      noticeDays:r.notice_days|0,inCalendar:!!r.in_calendar};
  }
  function patchRow(p){
    var m={prevCol:'prev_col',doneAt:'done_at',createdAt:'created_at',startsOn:'starts_on',noticeDays:'notice_days',inCalendar:'in_calendar'}, o={};
    Object.keys(p).forEach(function(k){ o[m[k]||k]=p[k] }); return o;
  }
  // Ogni modifica si vede subito a schermo e poi viene salvata; se il salvataggio fallisce si ricarica dal database.
  var store={
    setTask:function(id,data){
      id=id||uuid(); tasks.set(id,data); renderAll();
      var row=taskRow(data); row.id=id;
      return sb.from('tasks').upsert(row).then(check).catch(fail);
    },
    patchTask:function(id,patch){
      tasks.set(id,Object.assign({},tasks.get(id),patch)); renderAll();
      return sb.from('tasks').update(patchRow(patch)).eq('id',id).then(check).catch(fail);
    },
    delTask:function(id){
      tasks.delete(id); renderAll();
      return sb.from('tasks').delete().eq('id',id).then(check).catch(fail);
    },
    setLabel:function(id,data){
      id=id||uuid(); labels.set(id,data); renderAll();
      return sb.from('labels').upsert({id:id,name:data.name,color:data.color|0}).then(check).catch(fail);
    },
    delLabel:function(id){
      labels.delete(id); renderAll();
      return sb.from('labels').delete().eq('id',id).then(check).catch(fail);
    },
    decideProp:function(id,status){
      props.delete(id); renderAll();
      return sb.from('proposals').update({status:status,decided_at:nowISO()}).eq('id',id).then(check).catch(fail);
    }
  };

  /* ---------- task logic ---------- */
  function nowISO(){return new Date().toISOString()}
  function newTask(over){ var t=Object.assign({title:'',col:'today',labels:[],est:0,important:false,recurring:'none',note:'',createdAt:nowISO(),doneAt:null,prevCol:null,startsOn:null,noticeDays:0,inCalendar:false},over||{}); if(t.due===undefined) t.due=dueFor(t.col); return t }
  /* Date delle ricorrenze (giorni locali, formato AAAA-MM-GG). */
  function dateOf(s){return new Date(s+'T00:00:00')}
  function addDays(s,n){var d=dateOf(s); d.setDate(d.getDate()+n); return ymd(d)}
  function weekEndOf(s){return addDays(s,(7-dateOf(s).getDay())%7)}
  function monthEndOf(s){var d=dateOf(s); return ymd(new Date(d.getFullYear(),d.getMonth()+1,0))}
  // Aggiunge n mesi: un giorno a fine mese resta a fine mese, un 30 diventa 28 a febbraio.
  function addMonths(s,n){
    var d=dateOf(s), last=new Date(d.getFullYear(),d.getMonth()+1,0).getDate(), end=d.getDate()===last;
    var first=new Date(d.getFullYear(),d.getMonth()+n,1), ml=new Date(first.getFullYear(),first.getMonth()+1,0).getDate();
    return ymd(new Date(first.getFullYear(),first.getMonth(),end?ml:Math.min(d.getDate(),ml)));
  }
  // La nuova scadenza parte da quella del task completato (non dal giorno in cui lo chiudi) e va avanti
  // finché cade dopo il periodo in corso: un task completato in ritardo non riappare già scaduto.
  function nextOccurrence(t){
    var tod=today(), base=/^\d{4}-\d{2}-\d{2}$/.test(t.due||'')?t.due:tod, p=recParse(t.recurring), n=p.n, due, k;
    if(p.u==='d'){ for(k=1;;k++){ due=addDays(base,n*k); if(due>tod) break } return {col:'today',due:due,startsOn:due} }
    if(p.u==='w'){ for(k=1;;k++){ due=addDays(base,7*n*k); if(due>weekEndOf(tod)) break } return {col:'week',due:due,startsOn:addDays(weekEndOf(due),-6)} }
    if(p.u==='m'){ for(k=1;;k++){ due=addMonths(base,n*k); if(due>monthEndOf(tod)) break } return {col:'month',due:due,startsOn:due.slice(0,8)+'01'} }
    for(k=1;;k++){ due=addMonths(base,12*n*k); if(due>tod) break }
    return {col:'month',due:due,startsOn:due.slice(0,8)+'01'};
  }
  function spawnRecurrence(t){
    if(!recParse(t.recurring)) return;
    var n=nextOccurrence(t), s=n.startsOn;
    if(t.noticeDays>0){ var nf=addDays(n.due,-t.noticeDays); if(nf<s) s=nf }   // con il preavviso riappare prima
    store.setTask(null,newTask({title:t.title,labels:(t.labels||[]).slice(),est:t.est||0,important:!!t.important,recurring:t.recurring,note:t.note||'',
      noticeDays:t.noticeDays|0,inCalendar:!!t.inCalendar,col:n.col,due:n.due,startsOn:s>today()?s:null}));
  }
  function complete(id){
    var t=tasks.get(id); if(!t||t.col==='done') return;
    store.patchTask(id,{col:'done',prevCol:t.col,doneAt:nowISO(),startsOn:null}).then(function(){ spawnRecurrence(t) });
  }
  function reopen(id,col){
    var t=tasks.get(id); if(!t) return;
    var c=col||t.prevCol||'today'; store.patchTask(id,{col:c,doneAt:null,due:dueFor(c)});
  }
  function move(id,col){
    var t=tasks.get(id); if(!t) return;
    if(col==='done'){ if(t.col!=='done') complete(id); return }
    if(t.col==='done'){ reopen(id,col); return }
    if(shownCol(t)===col&&!isLate(t)&&!isPending(t)) return;
    if(isLate(t)&&col==='today'){ store.patchTask(id,{col:col,due:today(),startsOn:null}); return }
    if(!explicitDue(t)){ store.patchTask(id,{col:col,due:dueFor(col),startsOn:null}); return }   // scadenza standard: segue la colonna
    if(dueFits(col,t.due)) store.patchTask(id,{col:col,startsOn:null});                       // anticipare è libero: la scadenza resta
    else askDue(id,col);                                                                     // rimandare oltre la scadenza no
  }
  function askDue(id,col){
    var t=tasks.get(id), min=minDue(col), name=COLS.filter(function(c){return c.id===col})[0].name;
    dueMove={id:id,col:col};
    $('due-msg').textContent='Questo task scade il '+dm(dateOf(t.due))+': in “'+name+'” arriverebbe troppo tardi. Scegli una nuova scadenza dal '+dm(dateOf(min))+' in poi, oppure togli la scadenza.';
    $('due-new').min=min; $('due-new').value=min;
    $('dlg-due').showModal();
  }

  // Rimanda: il task sparisce fino al giorno scelto (in attesa, come le ricorrenze) e poi torna nella colonna giusta.
  // Una scadenza scelta da te e non ancora passata resta; se arriverebbe prima del ritorno, quell'opzione non c'è.
  var SNOOZE=[{id:'tomorrow',name:'Domani',col:'today'},{id:'monday',name:'Lunedì',col:'week'},{id:'nextmonth',name:'Mese prossimo',col:'month'}];
  function snoozeStart(k){ var tod=today(); return k==='tomorrow'?addDays(tod,1):k==='monday'?addDays(weekEndOf(tod),1):addDays(monthEndOf(tod),1) }
  function snoozeOptions(t){
    if(t.col==='done'||isPending(t)) return [];
    var sc=shownCol(t); if(sc==='later') return [];
    var keep=explicitDue(t)&&!isLate(t);
    return SNOOZE.filter(function(o){ return RANK[o.col]>=RANK[sc]&&(!keep||t.due>=snoozeStart(o.id)) });
  }
  function snooze(id,k){
    var t=tasks.get(id); if(!t) return;
    var o=SNOOZE.filter(function(x){return x.id===k})[0], s=snoozeStart(k);
    var due=explicitDue(t)&&!isLate(t)?t.due:dueFor(o.col,dateOf(s));
    snoozeOpen=null;
    store.patchTask(id,{col:o.col,due:due,startsOn:s});
    sync('Rimandato: riappare '+(k==='tomorrow'?'domani':'il '+dm(dateOf(s))));
  }

  function matches(t){
    if(filter.late&&!isLate(t)) return false;
    if(filter.important&&!t.important) return false;
    if(filter.q&&(t.title||'').toLowerCase().indexOf(filter.q)<0&&(t.note||'').toLowerCase().indexOf(filter.q)<0) return false;
    if(filter.labels.size){
      var ls=(t.labels||[]).filter(function(x){return labels.has(x)});
      var ok=ls.some(function(x){return filter.labels.has(x)})||(filter.labels.has('__none')&&!ls.length);
      if(!ok) return false;
    }
    return true;
  }
  function colTasks(col){
    var out=[], weekAgo=Date.now()-7*864e5;
    tasks.forEach(function(t,id){
      if(shownCol(t)!==col||!matches(t)) return;
      if(col==='done'&&t.doneAt&&new Date(t.doneAt).getTime()<weekAgo) return;
      out.push({id:id,t:t});
    });
    out.sort(function(a,b){
      if(col==='done') return String(b.t.doneAt||'').localeCompare(String(a.t.doneAt||''));
      var pa=isPending(a.t), pb=isPending(b.t); if(pa!==pb) return pa?1:-1;
      var la=isLate(a.t), lb=isLate(b.t); if(la!==lb) return la?-1:1;
      if(!!b.t.important!==!!a.t.important) return b.t.important?1:-1;
      return String(a.t.createdAt||'').localeCompare(String(b.t.createdAt||''));
    });
    return out;
  }

  /* ---------- board ---------- */
  function buildBoard(){
    $('board').innerHTML=COLS.map(function(c){
      return '<section class="col" data-col="'+c.id+'" aria-label="'+esc(c.name)+'">'+
        '<div class="colhead"><h2>'+esc(c.name)+'</h2><span class="stat" id="stat-'+c.id+'"></span></div>'+
        (c.hint?'<div class="colhint">'+esc(c.hint)+'</div>':'')+
        (c.id!=='done'?'<input class="quick" id="quick-'+c.id+'" data-quick="'+c.id+'" type="text" maxlength="200" autocomplete="off" placeholder="+ Aggiungi e premi Invio" aria-label="Aggiungi task in '+esc(c.name)+'">':'')+
        '<div class="list" id="list-'+c.id+'"></div></section>';
    }).join('');
    $('f-col').innerHTML=COLS.map(function(c){return '<option value="'+c.id+'">'+esc(c.name)+'</option>'}).join('');
    $('f-notice').innerHTML=NOTICE.map(function(n){return '<option value="'+n[0]+'">'+esc(n[1])+'</option>'}).join('');
    $('f-est').innerHTML=EST.map(function(m){return '<option value="'+m+'">'+(m?fmt(m):'Nessuna')+'</option>'}).join('');
  }
  function chipHTML(id){
    var l=labels.get(id); if(!l) return '';
    return '<span class="chip" style="--lc:'+lc(l)+'"><span class="dot"></span>'+esc(l.name)+'</span>';
  }
  function cardHTML(id,t){
    var done=t.col==='done', late=!done&&isLate(t), due=dueOf(t), badge='', pending=isPending(t), rec=recText(t.recurring);
    if(late){
      var n=daysLate(t), from=t.col!=='today'?COLS.filter(function(c){return c.id===t.col})[0]:null;
      badge='<span class="badge late">'+(n===1?'Scaduto ieri':'Scaduto da '+n+' giorni')+'</span>'+(from?'<span>da '+esc(from.name)+'</span>':'')+
        '<button class="replan" type="button" data-replan="'+esc(id)+'">Sposta a oggi</button>';
    } else if(pending){
      badge='<span title="Riappare da solo in questa data">Riappare '+(t.startsOn===ymd(new Date(Date.now()+864e5))?'domani':'il '+dmy(dateOf(t.startsOn)))+'</span>';
    } else if(!done&&due&&shownCol(t)!=='today'){
      if(due===today()) badge='<span class="badge soon">Scade oggi</span>';
      else if(due===ymd(new Date(Date.now()+864e5))) badge='<span class="badge soon">Scade domani</span>';
      else if(inNotice(t)) badge='<span class="badge soon" title="Preavviso">Scade il '+dmy(dateOf(due))+' · tra '+(-daysLate(t))+' giorni</span>';
      else if(explicitDue(t)) badge='<span title="Scadenza">Scade il '+dmy(dateOf(due))+'</span>';
    }
    var sn=snoozeOptions(t);
    if(sn.length) badge+='<button class="replan" type="button" data-snooze="'+esc(id)+'" aria-expanded="'+(snoozeOpen===id)+'">Rimanda</button>';
    return '<article class="card'+(t.important?' imp':'')+(done?' done':'')+(late?' late':'')+(pending?' pending':'')+'" draggable="true" data-id="'+esc(id)+'">'+
      '<button class="check" type="button" data-check="'+esc(id)+'" aria-label="'+(done?'Riapri':'Segna come fatto')+'">'+(done?'✓':'')+'</button>'+
      '<div class="cbody"><button class="ctitle" type="button" data-open="'+esc(id)+'">'+(rec?'<span class="recicon" role="img" title="Ricorrente: '+esc(rec)+'" aria-label="Ricorrente: '+esc(rec)+'">↻</span> ':'')+esc(t.title||'(senza titolo)')+'</button>'+
      '<div class="cmeta">'+(t.important?'<span class="star" title="Importante">★</span>':'')+badge+(t.source?'<span title="Creato da un’email">✉ email</span>':'')+(t.inCalendar?'<span title="Nel calendario">📅</span>':'')+
      (t.labels||[]).map(chipHTML).join('')+
      (t.est?'<span class="est">'+fmt(t.est)+'</span>':'')+
      (rec?'<span title="Ricorrente">'+esc(rec)+'</span>':'')+
      '</div>'+(sn.length&&snoozeOpen===id?'<div class="snooze"><span>Rimanda a</span>'+sn.map(function(o){
        return '<button class="btn" type="button" data-snoozeto="'+o.id+'" data-id="'+esc(id)+'">'+esc(o.name)+'</button>';
      }).join('')+'</div>':'')+'</div></article>';
  }
  function renderBoard(){
    var tabs='', vis=COLS.filter(function(c){return !hiddenCols.has(c.id)});
    if(hiddenCols.has(mobileCol)){ mobileCol=hiddenCols.has('today')?vis[0].id:'today'; persist() }
    $('board').style.setProperty('--ncol',vis.length);
    COLS.forEach(function(c){
      var items=colTasks(c.id), active=items.filter(function(x){return !isPending(x.t)}), mins=active.reduce(function(s,x){return s+(x.t.est||0)},0);
      $('stat-'+c.id).textContent=active.length+(mins?' · '+fmt(mins):'');
      $('list-'+c.id).innerHTML=items.length?items.map(function(x){return cardHTML(x.id,x.t)}).join(''):
        '<div class="empty">'+(c.id==='done'?'Niente completato negli ultimi 7 giorni.':'Nessun task qui.')+'</div>';
      if(hiddenCols.has(c.id)) return;
      tabs+='<button type="button" role="tab" data-tab="'+c.id+'" aria-selected="'+(mobileCol===c.id)+'">'+esc(c.name)+'<span class="n">'+active.length+'</span></button>';
    });
    $('coltabs').innerHTML=tabs;
    document.querySelectorAll('.col').forEach(function(el){el.classList.toggle('active',el.dataset.col===mobileCol); el.hidden=hiddenCols.has(el.dataset.col)});
  }
  function renderFilters(){
    var h='<span class="lbl">Filtra</span>';
    var arr=sortedLabels();
    arr.forEach(function(x){
      h+='<button class="chip" type="button" style="--lc:'+lc(x.l)+'" data-flabel="'+esc(x.id)+'" aria-pressed="'+filter.labels.has(x.id)+'"><span class="dot"></span>'+esc(x.l.name)+'</button>';
    });
    h+='<button class="chip" type="button" data-flabel="__none" aria-pressed="'+filter.labels.has('__none')+'">Senza label</button>';
    h+='<button class="chip" type="button" style="--lc:var(--warn)" id="f-important" aria-pressed="'+filter.important+'">★ Importanti</button>';
    var lateN=0; tasks.forEach(function(t){ if(isLate(t)) lateN++ });
    if(lateN||filter.late) h+='<button class="chip" type="button" style="--lc:var(--danger)" id="f-late" aria-pressed="'+filter.late+'"><span class="dot"></span>Scaduti · '+lateN+'</button>';
    if(filter.labels.size||filter.important||filter.late||filter.q) h+='<button class="btn ghost" type="button" id="f-clear">Azzera filtri</button>';
    h+='<span style="flex:1"></span>'+colsMenuHTML();
    h+='<input id="search" type="search" placeholder="Cerca…" aria-label="Cerca nei task" value="'+esc(filter.q)+'">';
    var ae=document.activeElement, had=ae&&ae.id==='search', pos=had?ae.selectionStart:0;
    var hadBtn=ae&&ae.id==='cols-btn', hadCol=ae&&ae.dataset&&ae.dataset.colvis;
    $('filters').innerHTML=h;
    if(had){var s=$('search'); s.focus(); try{s.setSelectionRange(pos,pos)}catch(e){}}
    if(hadBtn) $('cols-btn').focus();
    if(hadCol){ var sw=document.querySelector('[data-colvis="'+hadCol+'"]'); if(sw) sw.focus() }
  }
  // Menu "Colonne": un interruttore per colonna. Almeno una resta sempre visibile.
  function colsMenuHTML(){
    var nh=hiddenCols.size, h='<div class="colsmenu'+(colsOpen?' open':'')+'">'+
      '<button class="btn'+(nh?' on':'')+'" type="button" id="cols-btn" aria-expanded="'+colsOpen+'" aria-controls="cols-pop">Colonne'+(nh?' · '+nh+(nh===1?' nascosta':' nascoste'):'')+'</button>';
    if(colsOpen){
      h+='<div class="pop" id="cols-pop" role="group" aria-label="Colonne da mostrare"><div class="note">Mostra</div>'+COLS.map(function(c){
        var on=!hiddenCols.has(c.id), last=on&&hiddenCols.size===COLS.length-1;
        var n=colTasks(c.id).filter(function(x){return !isPending(x.t)}).length;
        return '<button class="switch" type="button" role="switch" data-colvis="'+c.id+'" aria-checked="'+on+'"'+(last?' disabled title="Almeno una colonna resta visibile"':'')+'>'+
          '<span class="track"><span class="knob"></span></span><span>'+esc(c.name)+'</span><span class="n">'+n+'</span></button>';
      }).join('')+'</div>';
    }
    return h+'</div>';
  }
  function sortedLabels(){
    var arr=[]; labels.forEach(function(l,id){arr.push({id:id,l:l})});
    arr.sort(function(a,b){return String(a.l.name).localeCompare(String(b.l.name),'it')});
    return arr;
  }

  /* ---------- proposte dall'agente ---------- */
  function renderProps(){
    var arr=[]; props.forEach(function(p,id){ if((p.status||'new')==='new') arr.push({id:id,p:p}) });
    arr.sort(function(a,b){return String(b.p.createdAt||'').localeCompare(String(a.p.createdAt||''))||String(a.id).localeCompare(String(b.id))});
    var el=$('props'); el.hidden=!arr.length;
    if(!arr.length){el.innerHTML=''; return}
    el.innerHTML='<div class="head"><h2>Proposti dall’agente · '+arr.length+'</h2>'+(propsHidden?'':'<span class="note">Trovati nelle tue email. Accetta scegliendo la colonna, oppure scarta.</span>')+
      '<button class="btn ghost" type="button" id="props-toggle" aria-expanded="'+(propsHidden?'false':'true')+'" aria-controls="plist">'+(propsHidden?'Mostra':'Nascondi')+'</button></div>'+
      '<div class="plist" id="plist"'+(propsHidden?' hidden':'')+'>'+arr.map(function(x){
      var p=x.p, id=esc(x.id), link=/^https:\/\//.test(p.link||'')?p.link:'';
      return '<article class="prop"><div class="pt">'+esc(p.title)+'</div>'+
        '<div class="cmeta">'+(p.labels||[]).map(chipHTML).join('')+(p.confidence?'<span>Sicurezza '+esc(p.confidence)+'</span>':'')+'</div>'+
        (p.reason?'<div class="pm">'+esc(p.reason)+'</div>':'')+
        '<div class="pm">'+esc([p.from,p.subject].filter(Boolean).join(' · '))+(link?' · <a href="'+esc(link)+'" target="_blank" rel="noopener">Apri email</a>':'')+'</div>'+
        '<div class="pa"><button class="btn primary" type="button" data-pacc="'+id+'" data-col="today">Oggi</button>'+
        '<button class="btn" type="button" data-pacc="'+id+'" data-col="week">Settimana</button>'+
        '<button class="btn" type="button" data-pacc="'+id+'" data-col="month">Mese</button>'+
        '<button class="btn ghost danger" type="button" data-pdis="'+id+'">Scarta</button></div></article>';
    }).join('')+'</div>';
  }
  function decideProp(id,col){
    var p=props.get(id); if(!p||!db) return;
    if(col){
      var note=[p.reason,[p.from,p.subject].filter(Boolean).join(' · '),p.link].filter(Boolean).join('\n').slice(0,2000);
      store.setTask(null,newTask({title:p.title,col:col,labels:(p.labels||[]).filter(function(x){return labels.has(x)}),note:note,source:p.source||'email'}));
    }
    store.decideProp(id,col?'accepted':'dismissed');
  }

  /* ---------- analytics ---------- */
  function weekStart(off){
    var d=new Date(); d.setHours(0,0,0,0);
    d.setDate(d.getDate()-((d.getDay()+6)%7)+off*7); return d;
  }
  function dm(d){return d.getDate()+' '+['gen','feb','mar','apr','mag','giu','lug','ago','set','ott','nov','dic'][d.getMonth()]}
  // Come dm, con l'anno se non è quello in corso (es. "1 ott 2028").
  function dmy(d){return dm(d)+(d.getFullYear()!==new Date().getFullYear()?' '+d.getFullYear():'')}
  function renderAnalytics(){
    var ws=weekStart(weekOffset), we=new Date(ws); we.setDate(we.getDate()+7);
    var last=new Date(we); last.setDate(last.getDate()-1);
    var perDay=[0,0,0,0,0,0,0], cntDay=[0,0,0,0,0,0,0], perLabel=new Map(), n=0, mins=0, imp=0;
    tasks.forEach(function(t){
      if(t.col!=='done'||!t.doneAt) return;
      var d=new Date(t.doneAt); if(d<ws||d>=we) return;
      var i=(d.getDay()+6)%7; n++; mins+=(t.est||0); if(t.important) imp++;
      perDay[i]+=(t.est||0); cntDay[i]++;
      var ls=(t.labels||[]).filter(function(x){return labels.has(x)}); if(!ls.length) ls=['__none'];
      ls.forEach(function(x){perLabel.set(x,(perLabel.get(x)||0)+(t.est||0))});
    });
    var open={}, openN={};
    COLS.forEach(function(c){open[c.id]=0;openN[c.id]=0});
    var lateN=0;
    tasks.forEach(function(t){ var pc=planCol(t); if(t.col!=='done'&&!isPending(t)&&open[pc]!=null){open[pc]+=(t.est||0);openN[pc]++; if(isLate(t)) lateN++} });

    var maxD=Math.max.apply(null,cntDay.concat([1]));
    var todayIdx=weekOffset===0?((new Date().getDay()+6)%7):-1;
    var days=cntDay.map(function(c,i){
      return '<div class="day'+(i===todayIdx?' now':'')+'"><span class="val">'+(c?c+(perDay[i]?' · '+fmt(perDay[i]):''):'')+'</span><div class="bar" style="height:'+Math.round(c/maxD*100)+'%"></div><span class="nm">'+DAYS[i]+'</span></div>';
    }).join('');

    var lrows=[]; perLabel.forEach(function(v,k){lrows.push({k:k,v:v})}); lrows.sort(function(a,b){return b.v-a.v});
    var maxL=Math.max.apply(null,lrows.map(function(r){return r.v}).concat([1]));
    var lhtml=lrows.length?'<div class="rows">'+lrows.map(function(r){
      var l=labels.get(r.k);
      return '<span>'+esc(l?l.name:'Senza label')+'</span><div class="track"><div class="fill" style="width:'+Math.round(r.v/maxL*100)+'%;'+(l?'--lc:'+lc(l):'--lc:var(--muted)')+'"></div></div><span class="num">'+fmt(r.v)+'</span>';
    }).join('')+'</div>':'<p class="note">Nessun task completato in questa settimana.</p>';

    var maxO=Math.max(open.today,open.week,open.month,open.later,1);
    var ohtml='<div class="rows">'+['today','week','month','later'].map(function(id){
      var c=COLS.filter(function(x){return x.id===id})[0];
      return '<span>'+esc(c.name)+'</span><div class="track"><div class="fill" style="width:'+Math.round(open[id]/maxO*100)+'%"></div></div><span class="num">'+openN[id]+' task · '+fmt(open[id])+'</span>';
    }).join('')+'</div>';

    var best=-1; cntDay.forEach(function(c,i){ if(c&&(best<0||c>cntDay[best])) best=i });
    var topL=lrows.length?(labels.get(lrows[0].k)?labels.get(lrows[0].k).name:'Senza label'):null;
    var report='Settimana '+dm(ws)+' – '+dm(last)+': '+n+' task completati'+(mins?' per '+fmt(mins)+' di lavoro stimato':'')+(imp?', di cui '+imp+' importanti':'')+'.'+
      (best>=0?' Giorno più produttivo: '+DAYS_LONG[best]+' ('+cntDay[best]+' task).':'')+
      (topL&&lrows[0].v?' Label con più tempo: '+topL+' ('+fmt(lrows[0].v)+').':'')+
      (lateN?' Scaduti: '+lateN+' task.':'')+' Restano aperti '+openN.today+' task per oggi ('+fmt(open.today)+') e '+openN.week+' per la settimana ('+fmt(open.week)+').';

    $('view-analytics').innerHTML='<div style="display:flex;flex-direction:column;gap:14px">'+
      '<div class="weeknav"><button class="btn" type="button" data-week="-1" aria-label="Settimana precedente">‹</button>'+
      '<strong>'+dm(ws)+' – '+dm(last)+'</strong>'+
      '<button class="btn" type="button" data-week="1" aria-label="Settimana successiva"'+(weekOffset>=0?' disabled':'')+'>›</button>'+
      (weekOffset!==0?'<button class="btn ghost" type="button" data-week="0">Questa settimana</button>':'')+'</div>'+
      '<div class="tiles">'+
        '<div class="tile"><div class="v">'+n+'</div><div class="k">Task completati</div></div>'+
        '<div class="tile"><div class="v">'+fmt(mins)+'</div><div class="k">Tempo stimato completato</div></div>'+
        '<div class="tile"><div class="v">'+imp+'</div><div class="k">Importanti completati</div></div>'+
        '<div class="tile"><div class="v">'+openN.today+'</div><div class="k">Ancora aperti oggi</div></div>'+
        '<div class="tile"><div class="v">'+lateN+'</div><div class="k">Scaduti adesso</div></div>'+
      '</div>'+
      '<div class="grid">'+
        '<div class="panel"><h3>Completati per giorno</h3><div class="days">'+days+'</div></div>'+
        '<div class="panel"><h3>Tempo completato per label</h3>'+lhtml+'<p class="note">Un task con più label conta in ciascuna.</p></div>'+
        '<div class="panel"><h3>Carico aperto adesso</h3>'+ohtml+'</div>'+
        '<div class="panel"><h3>Report della settimana</h3><p class="report" id="report">'+esc(report)+'</p><div class="actions"><button class="btn" type="button" id="copy-report">Copia report</button></div></div>'+
      '</div></div>';
  }

  /* ---------- dialogs ---------- */
  function openTask(id,presetCol){
    editingId=id||null; delArmed=false;
    var t=id?tasks.get(id):newTask({col:presetCol||mobileCol==='done'?'today':(presetCol||mobileCol),labels:Array.from(filter.labels).filter(function(x){return labels.has(x)})});
    if(!t) return;
    $('dlg-task-title').textContent=id?'Modifica task':'Nuovo task';
    $('f-title').value=t.title||''; $('f-col').value=t.col||'today'; dlgCol=t.col||'today'; $('f-due').setCustomValidity('');
    $('f-est').value=String(EST.indexOf(t.est|0)>=0?(t.est|0):0);
    $('f-due').value=dueOf(t)||''; setRecFields(t.recurring); $('f-imp').checked=!!t.important;
    $('f-notice').value=String(t.noticeDays|0); if($('f-notice').value!==String(t.noticeDays|0)) $('f-notice').value='0'; $('f-notice').setCustomValidity('');
    $('f-cal').checked=!!t.inCalendar; $('f-note').value=t.note||'';
    var sel=new Set(t.labels||[]);
    $('f-labels').innerHTML=sortedLabels().map(function(x){
      return '<button class="chip" type="button" style="--lc:'+lc(x.l)+'" data-pick="'+esc(x.id)+'" aria-pressed="'+sel.has(x.id)+'"><span class="dot"></span>'+esc(x.l.name)+'</button>';
    }).join('')||'<span class="note">Nessuna label: creale da “Gestisci label”.</span>';
    $('f-del').hidden=!id; $('f-del').textContent='Elimina';
    $('dlg-task').showModal(); $('f-title').focus();
  }
  // Menu Ricorrenza: valori standard oppure "Personalizzata…" con "ogni N giorni/settimane/mesi/anni".
  function setRecFields(r){
    var p=recParse(r), std=!p||REC_STD[r];
    $('f-rec').value=$('f-rec').dataset.prev=!p?'none':std?r:'custom';
    $('f-rec-n').value=p&&!std?p.n:2; $('f-rec-u').value=p?p.u:'w';
    showRecCustom();
  }
  function showRecCustom(){ var on=$('f-rec').value==='custom'; $('f-rec-custom').hidden=!on; $('f-rec-n').disabled=!on; $('f-rec-u').disabled=!on }
  function recFromFields(){ var v=$('f-rec').value; return v==='custom'?recValue($('f-rec-n').value,$('f-rec-u').value):v }
  function saveTask(){
    var title=$('f-title').value.trim(); if(!title) return;
    var prev=editingId?tasks.get(editingId):null, col=$('f-col').value, dv=$('f-due').value;
    if(col!=='done'&&dv&&dv!==dueFor(col)&&!dueFits(col,dv)){
      var fd=$('f-due'); fd.setCustomValidity('Scadenza troppo vicina per questa colonna: scegli dal '+dm(dateOf(minDue(col)))+' in poi, oppure svuota il campo.'); fd.reportValidity(); return;
    }
    $('f-due').setCustomValidity('');
    var notice=parseInt($('f-notice').value,10)||0;
    if(notice&&col!=='done'&&!dv){ var fn=$('f-notice'); fn.setCustomValidity('Il preavviso serve solo con una scadenza: impostala oppure scegli Nessuno.'); fn.reportValidity(); return }
    var data=Object.assign({},prev||newTask(),{noticeDays:notice,inCalendar:$('f-cal').checked,
      title:title,col:col,est:parseInt($('f-est').value,10)||0,recurring:recFromFields(),
      important:$('f-imp').checked,note:$('f-note').value.trim(),
      labels:Array.prototype.map.call(document.querySelectorAll('#f-labels [aria-pressed="true"]'),function(b){return b.dataset.pick})
    });
    var justDone=col==='done'&&(!prev||prev.col!=='done');
    if(justDone){data.doneAt=nowISO(); data.prevCol=prev?prev.col:'today'}
    if(col!=='done'){data.doneAt=null; data.due=$('f-due').value||null}
    if(!prev||col!==prev.col||col==='done') data.startsOn=null;
    store.setTask(editingId,data).then(function(){ if(justDone) spawnRecurrence(data) });
    $('dlg-task').close();
  }
  function renderLabelsDialog(){
    var act=document.activeElement; if(act&&act.dataset&&act.dataset.lname) return;
    $('labels-list').innerHTML=sortedLabels().map(function(x){
      return '<div class="lrow"><button class="swatch" type="button" style="--lc:'+lc(x.l)+'" data-lcolor="'+esc(x.id)+'" aria-label="Cambia colore di '+esc(x.l.name)+'"></button>'+
        '<input type="text" id="lname-'+esc(x.id)+'" data-lname="'+esc(x.id)+'" value="'+esc(x.l.name)+'" maxlength="40" aria-label="Nome label">'+
        '<button class="btn ghost danger" type="button" data-ldel="'+esc(x.id)+'">Elimina</button></div>';
    }).join('')||'<p class="note">Ancora nessuna label.</p>';
  }

  function renderAll(){
    renderFilters(); renderProps(); renderBoard();
    if(!$('view-analytics').hidden) renderAnalytics();
    if($('dlg-labels').open) renderLabelsDialog();
  }
  function route(){
    var v=location.hash==='#analytics'?'analytics':'bacheca';
    $('view-bacheca').hidden=v!=='bacheca'; $('view-analytics').hidden=v!=='analytics';
    ['bacheca','analytics'].forEach(function(k){ if(k===v) $('nav-'+k).setAttribute('aria-current','page'); else $('nav-'+k).removeAttribute('aria-current') });
    if(v==='analytics') renderAnalytics();
  }

  /* ---------- events ---------- */
  buildBoard(); renderAll(); route();
  window.addEventListener('hashchange',route,{signal:ac.signal});
  $('btn-new').addEventListener('click',function(){openTask(null)});
  $('props').addEventListener('click',function(e){
    if(e.target.closest('#props-toggle')){
      propsHidden=!propsHidden;
      try{localStorage.setItem('bacheca.propsHidden',propsHidden?'1':'0')}catch(err){}
      renderProps(); return;
    }
    var a=e.target.closest('[data-pacc]'); if(a){ decideProp(a.dataset.pacc,a.dataset.col); return }
    var d=e.target.closest('[data-pdis]'); if(d) decideProp(d.dataset.pdis,null);
  });
  $('btn-labels').addEventListener('click',function(){renderLabelsDialog(); $('dlg-labels').showModal()});
  $('labels-close').addEventListener('click',function(){$('dlg-labels').close()});
  $('f-cancel').addEventListener('click',function(){$('dlg-task').close()});
  $('f-col').addEventListener('change',function(){
    var c=$('f-col').value, d=$('f-due').value;
    // Una scadenza scelta da te resta (e viene controllata al salvataggio); quella standard segue la colonna.
    if(!(d&&d!==(dueFor(dlgCol)||''))) $('f-due').value=dueFor(c)||'';
    dlgCol=c; $('f-due').setCustomValidity('');
  });
  $('f-due').addEventListener('input',function(){ this.setCustomValidity(''); $('f-notice').setCustomValidity('') });
  $('f-notice').addEventListener('change',function(){ this.setCustomValidity('') });
  $('f-rec').addEventListener('change',function(){
    // Passando a "Personalizzata…" si parte dall'unità già scelta (ogni settimana → ogni 2 settimane).
    var p=recParse(this.dataset.prev); if(this.value==='custom'&&p) $('f-rec-u').value=p.u;
    this.dataset.prev=this.value; showRecCustom();
    if(this.value==='custom') $('f-rec-n').select();
  });
  $('form-due').addEventListener('submit',function(e){
    e.preventDefault(); if(!dueMove) return;
    store.patchTask(dueMove.id,{col:dueMove.col,due:$('due-new').value,startsOn:null}); dueMove=null; $('dlg-due').close();
  });
  $('due-clear').addEventListener('click',function(){
    if(!dueMove) return;
    store.patchTask(dueMove.id,{col:dueMove.col,due:null,startsOn:null}); dueMove=null; $('dlg-due').close();
  });
  $('due-cancel').addEventListener('click',function(){ dueMove=null; $('dlg-due').close() });
  var dayShown=today();
  function tick(){ if(today()!==dayShown){dayShown=today(); renderAll()} }
  var tickId=setInterval(tick,60000); document.addEventListener('visibilitychange',tick,{signal:ac.signal});
  $('form-task').addEventListener('submit',function(e){e.preventDefault(); saveTask()});
  $('f-del').addEventListener('click',function(){
    if(!editingId) return;
    if(!delArmed){delArmed=true; $('f-del').textContent='Conferma eliminazione'; return}
    store.delTask(editingId); $('dlg-task').close();
  });
  $('f-labels').addEventListener('click',function(e){
    var b=e.target.closest('[data-pick]'); if(b) b.setAttribute('aria-pressed',b.getAttribute('aria-pressed')!=='true');
  });

  $('filters').addEventListener('click',function(e){
    if(e.target.closest('#cols-btn')){ colsOpen=!colsOpen; renderFilters(); return }
    var cv=e.target.closest('[data-colvis]');
    if(cv){
      var cid=cv.dataset.colvis;
      if(hiddenCols.has(cid)) hiddenCols.delete(cid); else if(hiddenCols.size<COLS.length-1) hiddenCols.add(cid);
      persistCols(); renderAll(); return;
    }
    var b=e.target.closest('[data-flabel]');
    if(b){var id=b.dataset.flabel; if(filter.labels.has(id)) filter.labels.delete(id); else filter.labels.add(id)}
    else if(e.target.closest('#f-important')) filter.important=!filter.important;
    else if(e.target.closest('#f-late')) filter.late=!filter.late;
    else if(e.target.closest('#f-clear')){filter.labels.clear(); filter.important=false; filter.late=false; filter.q=''}
    else return;
    persist(); renderAll();
  });
  // Il menu Colonne si chiude cliccando fuori o con Esc.
  document.addEventListener('click',function(e){
    if(colsOpen&&!e.target.closest('.colsmenu')){ colsOpen=false; renderFilters() }
  },{signal:ac.signal});
  $('filters').addEventListener('keydown',function(e){
    if(e.key==='Escape'&&colsOpen){ colsOpen=false; renderFilters(); $('cols-btn').focus() }
  });
  $('filters').addEventListener('input',function(e){
    if(e.target.id!=='search') return;
    filter.q=e.target.value.trim().toLowerCase(); renderBoard();
  });
  $('coltabs').addEventListener('click',function(e){
    var b=e.target.closest('[data-tab]'); if(!b) return;
    mobileCol=b.dataset.tab; persist(); renderBoard();
  });

  var board=$('board');
  board.addEventListener('click',function(e){
    var c=e.target.closest('[data-check]');
    if(c){var id=c.dataset.check, t=tasks.get(id); if(t&&t.col==='done') reopen(id); else complete(id); return}
    var so=e.target.closest('[data-snooze]');
    if(so){ snoozeOpen=snoozeOpen===so.dataset.snooze?null:so.dataset.snooze; renderBoard(); var b2=document.querySelector('[data-snooze="'+so.dataset.snooze+'"]'); if(b2) b2.focus(); return }
    var st=e.target.closest('[data-snoozeto]');
    if(st){ snooze(st.dataset.id,st.dataset.snoozeto); return }
    var rp=e.target.closest('[data-replan]');
    if(rp){ store.patchTask(rp.dataset.replan,{col:'today',due:today()}); return }
    var o=e.target.closest('[data-open]'); if(o) openTask(o.dataset.open);
  });
  board.addEventListener('keydown',function(e){
    if(e.key!=='Enter'||!e.target.dataset||!e.target.dataset.quick) return;
    var title=e.target.value.trim(); if(!title) return;
    store.setTask(null,newTask({title:title,col:e.target.dataset.quick,labels:Array.from(filter.labels).filter(function(x){return labels.has(x)})}));
    e.target.value='';
  });
  board.addEventListener('dragstart',function(e){
    var card=e.target.closest&&e.target.closest('.card'); if(!card) return;
    e.dataTransfer.setData('text/plain',card.dataset.id); e.dataTransfer.effectAllowed='move'; card.classList.add('dragging');
  });
  board.addEventListener('dragend',function(){
    document.querySelectorAll('.dragging,.over').forEach(function(el){el.classList.remove('dragging','over')});
  });
  board.addEventListener('dragover',function(e){
    var col=e.target.closest('.col'); if(!col) return;
    e.preventDefault();
    document.querySelectorAll('.col.over').forEach(function(el){ if(el!==col) el.classList.remove('over') });
    col.classList.add('over');
  });
  board.addEventListener('drop',function(e){
    var col=e.target.closest('.col'); if(!col) return;
    e.preventDefault(); col.classList.remove('over');
    var id=e.dataTransfer.getData('text/plain'); if(id) move(id,col.dataset.col);
  });

  $('view-analytics').addEventListener('click',function(e){
    var w=e.target.closest('[data-week]');
    if(w){var v=parseInt(w.dataset.week,10); weekOffset=v===0?0:Math.min(0,weekOffset+v); renderAnalytics(); return}
    var cp=e.target.closest('#copy-report');
    if(cp){
      var txt=$('report').textContent;
      var sel=function(){var r=document.createRange(); r.selectNodeContents($('report')); var s=getSelection(); s.removeAllRanges(); s.addRange(r)};
      try{ navigator.clipboard.writeText(txt).then(function(){cp.textContent='Copiato'},sel) }catch(err){sel()}
    }
  });

  $('form-label').addEventListener('submit',function(e){
    e.preventDefault();
    var name=$('new-label').value.trim(); if(!name) return;
    var used=new Set(); labels.forEach(function(l){used.add((l.color|0)%NCOL)});
    var color=0; while(used.has(color)&&color<NCOL-1) color++;
    store.setLabel(null,{name:name,color:color}); $('new-label').value='';
  });
  $('labels-list').addEventListener('click',function(e){
    var c=e.target.closest('[data-lcolor]');
    if(c){var l=labels.get(c.dataset.lcolor); if(l) store.setLabel(c.dataset.lcolor,{name:l.name,color:((l.color|0)+1)%NCOL}); return}
    var d=e.target.closest('[data-ldel]');
    if(d){
      if(d.dataset.armed){filter.labels.delete(d.dataset.ldel); persist(); store.delLabel(d.dataset.ldel)}
      else{d.dataset.armed='1'; d.textContent='Conferma'}
    }
  });
  $('labels-list').addEventListener('change',function(e){
    var id=e.target.dataset&&e.target.dataset.lname; if(!id) return;
    var l=labels.get(id), name=e.target.value.trim();
    if(l&&name&&name!==l.name) store.setLabel(id,{name:name,color:l.color|0});
    e.target.blur(); renderLabelsDialog();
  });

  /* ---------- data (Supabase) ---------- */
  db=sb;
  var loading=false, again=false, seeded=false, loadTimer=null;
  function loadAll(){
    if(ac.signal.aborted) return;
    if(loading){ again=true; return }
    loading=true;
    Promise.all([
      sb.from('tasks').select('*'),
      sb.from('labels').select('*'),
      sb.from('proposals').select('*').eq('status','new')
    ]).then(function(res){
      if(ac.signal.aborted) return;
      res.forEach(check);
      tasks.clear(); res[0].data.forEach(function(r){ tasks.set(r.id,taskObj(r)) });
      labels.clear(); res[1].data.forEach(function(r){ labels.set(r.id,{name:r.name,color:r.color|0}) });
      props.clear(); res[2].data.forEach(function(r){
        props.set(r.id,{title:r.title,labels:r.labels||[],source:r.source,from:r.sender,subject:r.subject,reason:r.reason,
          confidence:r.confidence,status:r.status,link:r.link,createdAt:r.created_at});
      });
      // Primo accesso: label di partenza.
      if(!labels.size&&!tasks.size&&!seeded){
        seeded=true;
        [['Lavoro',0],['Personale',2],['Casa',1],['Famiglia',3]].forEach(function(x){ store.setLabel(null,{name:x[0],color:x[1]}) });
      }
      sync('Salvato e sincronizzato'); renderAll();
    }).catch(function(e){
      sync('Dati non raggiungibili',true); if(window.console) console.error(e);
    }).then(function(){
      loading=false; if(again){ again=false; loadAll() }
    });
  }
  function soon(){ clearTimeout(loadTimer); loadTimer=setTimeout(loadAll,400) }
  loadAll();
  // Modifiche fatte da un altro dispositivo, da Siri o dall'agente email.
  var channel=sb.channel('board').on('postgres_changes',{event:'*',schema:'public'},soon).subscribe();
  document.addEventListener('visibilitychange',function(){ if(!document.hidden) soon() },{signal:ac.signal});

  return function(){
    ac.abort(); clearInterval(tickId); clearTimeout(loadTimer); sb.removeChannel(channel);
  };
}
