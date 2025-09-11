/*! app.roster.enforcer.v7.3.js (scoped to join form; robust email detection) */
(function(){
  const LOG=(...a)=>console.log('[enforcer]', ...a);
  const lc=s=>(s||'').trim().toLowerCase();
  const RKEY_BY_POT='pot_rosters_by_key';

  function loadPotMap(){ try{ const raw=localStorage.getItem(RKEY_BY_POT); return raw? (JSON.parse(raw)||{}):{};}catch(_){return{};} }

  function currentPotKeyExact(){
    try{ if (typeof window.__getCurrentPotKey==='function'){ const k=window.__getCurrentPotKey(); if(k) return lc(String(k)); } }catch(_){}
    const root=document.querySelector('[data-potid],[data-pot-key]');
    if(root){ return lc(root.dataset.potid||root.dataset.potKey||''); }
    const hid=document.querySelector('#pot-id, input[name="pot_id"], input[name="potid"], input[id*="pot" i][type="hidden"]');
    if(hid && hid.value) return lc(hid.value);
    const sel=document.querySelector('#j-select, #j-tournament, #active-tournaments, select[name*="tournament" i], select[size]');
    if(sel && sel.options && sel.selectedIndex>=0){
      const opt=sel.options[sel.selectedIndex];
      const pid=opt.getAttribute('data-potid')||opt.value;
      if(pid && String(pid).length>6) return lc(pid);
    }
    return null;
  }
  function tournamentNameToken(){
    const sel=document.querySelector('#j-select, #j-tournament, #active-tournaments, select[name*="tournament" i], select[size]');
    let t='';
    if(sel && sel.options && sel.selectedIndex>=0){ t = sel.options[sel.selectedIndex].textContent||''; }
    if(!t){
      const sum=document.querySelector('.summary, #summary, [data-summary]');
      if(sum) t = sum.textContent||'';
    }
    t=t.split('•')[0].split('-')[0];
    return lc(t);
  }
  function dateToken(){
    const roots=[
      document.querySelector('#pot-details, .pot-details, #summary, .summary'),
      document.querySelector('body')
    ].filter(Boolean);
    const re=/\b(20\d{2})-(\d{2})-(\d{2})\b/;
    for(const r of roots){
      const m = re.exec(r.textContent||'');
      if(m) return lc(m[0]);
    }
    return null;
  }
  function rosterForPot(){
    const map=loadPotMap();
    const exact=currentPotKeyExact();
    if(exact && Array.isArray(map[exact]) && map[exact].length) return new Set(map[exact].map(lc));
    const nameTok=tournamentNameToken();
    if(nameTok){
      if(Array.isArray(map[nameTok]) && map[nameTok].length) return new Set(map[nameTok].map(lc));
      for(const k of Object.keys(map)){ if(k.includes(nameTok) && Array.isArray(map[k]) && map[k].length){ return new Set(map[k].map(lc)); } }
    }
    const dt=dateToken();
    if(dt){
      for(const k of Object.keys(map)){ if(k.includes(dt) && Array.isArray(map[k]) && map[k].length){ return new Set(map[k].map(lc)); } }
    }
    return null;
  }

  function isVisible(el){
    if(!el) return false;
    const style = window.getComputedStyle(el);
    return style && style.display !== 'none' && style.visibility !== 'hidden' && el.offsetParent !== null;
  }
  function getJoinScope(){
    const mg = document.querySelector('#j-mtype, #mtype, select[name*="type" i], select[name*="buy" i]');
    if (mg){
      const form = mg.closest('form');
      if (form) return form;
      const panel = mg.closest('section, .card, .panel, .box, .container, .join');
      if (panel) return panel;
      return document;
    }
    return document;
  }
  function findEmail(){
    const scope = getJoinScope();
    const candidates = scope.querySelectorAll('#j-email, #email, input[name="email"], input[type="email"]');
    let pick = null;
    candidates.forEach(el => {
      if (!el.disabled && isVisible(el)) pick = el;
    });
    return pick || candidates[candidates.length-1] || null;
  }
  function findMtype(){
    const scope = getJoinScope();
    const sel = scope.querySelector('#j-mtype, #mtype, select[name*="type" i], select[name*="buy" i]');
    return sel;
  }
  function ensurePlaceholder(sel){
    let ph=Array.from(sel.options).find(o=>o.dataset && o.dataset.placeholder==='1');
    if(!ph){ ph=document.createElement('option'); ph.value=''; ph.textContent='— Select —'; ph.dataset.placeholder='1'; sel.insertBefore(ph, sel.firstChild); }
    return ph;
  }
  function getOpts(sel){
    const opts=Array.from(sel.options);
    const member=opts.find(o=>/member/i.test(o.value)||/member/i.test(o.text));
    const guest =opts.find(o=>/guest/i.test(o.value)||/guest/i.test(o.text));
    const ph=ensurePlaceholder(sel);
    return {member,guest,ph};
  }
  function setOptVisible(opt, vis){ if(!opt) return; opt.hidden=!vis; opt.disabled=!vis; }

  let inProgress=false;
  function applyRule(){
    if(inProgress) return false;
    inProgress=true;
    try{
      const email=findEmail(), sel=findMtype();
      if(!email||!sel) return false;

      const {member,guest,ph}=getOpts(sel);
      const e=lc(email.value);
      const set=rosterForPot();
      let changed=false;

      if(!e){
        if(set){ setOptVisible(member,false); setOptVisible(guest,false); setOptVisible(ph,true); if(sel.value!==''){ sel.value=''; changed=true; } LOG('blank + roster → placeholder'); }
        else   { setOptVisible(member,true);  setOptVisible(guest,true);  setOptVisible(ph,true);  if(sel.value!==''){ sel.value=''; changed=true; } LOG('blank + no roster → both active, blank'); }
      }else if(set){
        if(set.has(e)){ setOptVisible(member,true); setOptVisible(guest,false); setOptVisible(ph,false); if(member && sel.value!==member.value){ sel.value=member.value; changed=true; } LOG('IN roster → Member only'); }
        else          { setOptVisible(member,false); setOptVisible(guest,true); setOptVisible(ph,false); if(guest && sel.value!==guest.value){ sel.value=guest.value; changed=true; } LOG('NOT in roster → Guest only'); }
      }else{
        setOptVisible(member,true); setOptVisible(guest,true); setOptVisible(ph,false); LOG('no roster → both allowed'); 
      }

      if(changed) sel.dispatchEvent(new Event('change',{bubbles:true}));
      return true;
    }finally{ inProgress=false; }
  }

  function attach(){
    let attached=false;
    const tryAttach=()=>{
      const email=findEmail(), sel=findMtype();
      if(email && sel && !attached){
        attached=true; LOG('attached to join controls (scoped)');
        const handler=()=>applyRule();
        email.addEventListener('input', handler);
        email.addEventListener('keyup', handler);
        email.addEventListener('blur', handler);
        const tourSel=document.querySelector('#j-select, #j-tournament, #active-tournaments, select[name*="tournament" i], select[size]');
        if(tourSel) tourSel.addEventListener('change', handler);
        applyRule();
      }
    };
    const iv=setInterval(tryAttach,300); setTimeout(()=>clearInterval(iv),15000);
    const mo=new MutationObserver(tryAttach); mo.observe(document.documentElement,{childList:true,subtree:true});
    document.addEventListener('visibilitychange',()=>{ if(!document.hidden) applyRule(); });
  }

  if(document.readyState==='loading') document.addEventListener('DOMContentLoaded', attach);
  else attach();
})();