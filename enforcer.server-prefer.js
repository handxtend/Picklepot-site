
/* enforcer.server-prefer.js
   Safe additive hook: prefers server roster (inline/org) for current pot.
   Include this AFTER your normal bundles/enforcer and after you set window.API_BASE.
*/
(function(){
  const API = (window.API_BASE||'').replace(/\/$/,''); // must be set in HTML
  const TOKEN = (window.ADMIN_TOKEN||window.ORG_TOKEN||'');

  if(!API){ console.warn('[server-prefer] window.API_BASE not set'); }

  const cache = new Map(); // potId -> Set(emails)

  async function fetchRoster(potId){
    if(!API || !potId) return null;
    if(cache.has(potId)) return cache.get(potId);
    try{
      const res = await fetch(`${API}/api/pots/${encodeURIComponent(potId)}/roster-resolved`, {
        headers: TOKEN ? {'X-Organizer-Token': TOKEN} : {}
      });
      if(!res.ok) return null;
      const j = await res.json();
      const set = new Set((j && j.emails || []).map(e => (e||'').trim().toLowerCase()).filter(Boolean));
      cache.set(potId, set);
      return set;
    }catch(e){
      console.warn('[server-prefer] fetch failed', e);
      return null;
    }
  }

  function getPotId(){
    try{
      return (window.CURRENT_DETAIL_POT && (CURRENT_DETAIL_POT.id || CURRENT_DETAIL_POT.pot_id))
          || (document.getElementById('pot-id') && document.getElementById('pot-id').textContent.trim())
          || '';
    }catch(e){ return ''; }
  }

  function getEmailEl(){
    const scope = document;
    const els = scope.querySelectorAll('#j-email, #email, input[type="email"], input[name="email"]');
    for(const el of els){ if(!el.disabled && el.offsetParent !== null) return el; }
    return els[0] || null;
  }

  function getMemberTypeEl(){
    return document.getElementById('j-mtype') ||
           document.querySelector('#mtype') ||
           document.querySelector('select[name*="member" i]') ||
           document.querySelector('select[name*="type" i]');
  }

  function trigger(el){
    if(!el) return;
    el.dispatchEvent(new Event('change', {bubbles:true}));
    el.dispatchEvent(new Event('input', {bubbles:true}));
  }

  async function checkAndApply(){
    const pid = getPotId();
    const emailEl = getEmailEl();
    if(!pid || !emailEl) return;
    const email = (emailEl.value||'').trim().toLowerCase();
    if(!email) return;

    const set = await fetchRoster(pid);
    if(set && set.has(email)){
      const mtype = getMemberTypeEl();
      if(mtype && mtype.value !== 'Member'){
        try { mtype.value = 'Member'; } catch{}
        trigger(mtype);
        // try to retrigger cost display
        const cost = document.getElementById('j-cost') || document.querySelector('#cost, [data-cost]');
        trigger(cost);
      }
    }
  }

  function armListeners(){
    const emailEl = getEmailEl();
    if(emailEl){
      emailEl.addEventListener('change', checkAndApply);
      emailEl.addEventListener('blur', checkAndApply);
      emailEl.addEventListener('keyup', (e)=>{ if(e.key==='Enter') checkAndApply(); });
    }
    // also run when member/guest select changes manually
    const mtype = getMemberTypeEl();
    if(mtype){
      mtype.addEventListener('change', checkAndApply);
    }
    // first run
    setTimeout(checkAndApply, 200);
    setTimeout(checkAndApply, 800);
    setTimeout(checkAndApply, 1500);
  }

  if(document.readyState === 'loading'){
    document.addEventListener('DOMContentLoaded', armListeners);
  }else{
    armListeners();
  }
})();
