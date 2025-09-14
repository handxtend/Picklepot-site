/*! app.roster.loader.v3.1.js (per-pot storage; tournament-name key; external bind helper) */
(function(){
  const RKEY_GLOBAL = 'pot_roster';
  const RKEY_BY_POT = 'pot_rosters_by_key';
  const LOGP='[roster]';
  const log=(...a)=>console.log(LOGP, ...a);
  const lc = s => (s||'').trim().toLowerCase();

  function csvToRows(text){
    const rows=[]; let row=[]; let cur=''; let inQ=false;
    for(let i=0;i<text.length;i++){
      const c=text[i];
      if(c==='"'){ if(inQ && text[i+1]==='"'){cur+='"'; i++;} else inQ=!inQ; }
      else if(c===',' && !inQ){ row.push(cur); cur=''; }
      else if((c==='\n'||c==='\r') && !inQ){ if(cur!==''||row.length){row.push(cur); rows.push(row); row=[]; cur='';} if(c==='\r'&&text[i+1]==='\n') i++; }
      else { cur+=c; }
    }
    if(cur!==''||row.length){ row.push(cur); rows.push(row); }
    return rows;
  }
  function rowsToObjects(rows){
    if(!rows||!rows.length) return [];
    const headers = rows[0].map(h=>lc(h));
    const items=[];
    for(let i=1;i<rows.length;i++){
      const r=rows[i]; if(r.every(v=>!String(v||'').trim())) continue;
      const o={}; for(let j=0;j<headers.length;j++){ o[headers[j]||('col'+j)]=r[j]||''; }
      items.push(o);
    }
    return items;
  }
  function extractEmails(items){
    const out=[];
    for(const it of items){ const e = lc(it.email||it['e-mail']||it['mail']); if(e) out.push(e); }
    return Array.from(new Set(out));
  }

  function saveGlobalMap(emails){
    const map=new Map(); emails.forEach(e=>map.set(e,{email:e}));
    window.__potRoster = map;
    try{ localStorage.setItem(RKEY_GLOBAL, JSON.stringify(Array.from(map.entries())));}catch(_){}
    return map.size;
  }

  function val(sel){
    const el = document.querySelector(sel);
    if(!el) return '';
    return (el.value||el.textContent||'').trim();
  }
  function deriveCreatePotKeys(){
    const name = val('#c-name') || val('input[name="tournament_name"]') || val('input[name*="tournament" i]');
    const date = val('#c-date') || val('input[type="date"]');
    const time = val('#c-time') || val('input[type="time"]');
    const loc  = val('#c-location') || val('input[name*="location" i]');
    const keys = [];
    if (name) keys.push(lc(name)); // primary: tournament name
    const composite = [name,date,time,loc].map(lc).filter(Boolean).join('|');
    if (composite) keys.push(composite);
    return Array.from(new Set(keys));
  }

  function loadPotMap(){
    try{
      const raw=localStorage.getItem(RKEY_BY_POT);
      if(raw){ const obj=JSON.parse(raw); if(obj && typeof obj==='object') return obj; }
    }catch(_){}
    return {};
  }
  function savePotMap(obj){
    try{ localStorage.setItem(RKEY_BY_POT, JSON.stringify(obj)); }catch(_){}
  }

  window.__savePotRosterForKey = function(key){
    try{
      key = lc(String(key||''));
      if(!key) return false;
      const map = loadPotMap();
      const emails = window.__potRoster instanceof Map ? Array.from(window.__potRoster.keys()) : [];
      if(!emails.length) return false;
      map[key] = emails.map(lc);
      savePotMap(map);
      log('bound roster to key:', key, `(${emails.length} emails)`);
      return true;
    }catch(err){ console.error(err); return false; }
  };

  function ensureStatusEl(file){
    let s=document.querySelector('#roster-status');
    if(!s){ s=document.createElement('span'); s.id='roster-status'; s.style.marginLeft='8px'; s.style.fontSize='12px'; file.insertAdjacentElement('afterend', s); }
    return s;
  }
  function setStatus(el, txt, good=true){ if(!el) return; el.textContent=txt||''; el.style.color = good ? '#2a7' : '#c33'; }

  function findRosterInput(){
    let el = document.querySelector('#member-roster, #memberRoster, #rosterCsv');
    if(el) return el;
    el = document.querySelector('input[type="file"][id*="roster" i], input[type="file"][name*="roster" i]');
    return el || document.querySelector('input[type="file"]');
  }

  function restoreGlobal(){
    try{
      const raw=localStorage.getItem(RKEY_GLOBAL);
      if(raw){
        const arr=JSON.parse(raw);
        if(Array.isArray(arr)){
          const map=new Map();
          for(const kv of arr){ if(Array.isArray(kv)&&kv[0]) map.set(lc(kv[0]),{email:lc(kv[0])}); }
          window.__potRoster = map;
          return map.size;
        }
      }
    }catch(_){}
    return 0;
  }

  function bootstrap(){
    const file = findRosterInput();
    if(!file) return;
    const status = ensureStatusEl(file);

    const restored = restoreGlobal();
    if(restored){ log('restored roster', restored, 'entries'); setStatus(status, `Loaded ${restored} records`, true); }
    else { setStatus(status, 'No roster loaded', false); }

    file.addEventListener('change', async () => {
      const f = file.files && file.files[0];
      if(!f){ setStatus(status, 'No roster loaded', false); return; }
      try{
        const text = await (async function readFileText(file){
  if (file && typeof file.text === 'function') return file.text();
  return await new Promise((resolve, reject)=>{
    const fr = new FileReader();
    fr.onload = ()=> resolve(fr.result);
    fr.onerror = ()=> reject(fr.error||new Error('Failed to read file'));
    fr.readAsText(file);
  });
})(f);
        const rows = csvToRows(text);
        const items= rowsToObjects(rows);
        const emails= extractEmails(items);

        const count = saveGlobalMap(emails);
        setStatus(status, `Loaded ${count} records`, true);
        log('roster loaded', count);

        const keys = deriveCreatePotKeys();
        if (keys.length){
          const pm = loadPotMap();
          for(const k of keys){ pm[k]=emails.map(lc); log('saved pot roster under key:', k); }
          savePotMap(pm);
        } else {
          log('warning: no create-form keys found; roster stored globally only');
        }
      }catch(err){
        console.error(err);
        setStatus(status, 'Failed to read CSV', false);
        alert('Could not read the CSV file. Please ensure the CSV has an Email column.');
      }
    });
  }

  if(document.readyState==='loading') document.addEventListener('DOMContentLoaded', bootstrap);
  else bootstrap();
})();