/*! app.roster.cloud.v1.js
 * Syncs per-pot roster to Firebase (Storage + Firestore pointer),
 * and hydrates local roster maps on pot selection so existing UI works.
 */
(function(){
  const LOG = (...a)=>console.log('[roster-cloud]', ...a);
  const ERR = (...a)=>console.warn('[roster-cloud]', ...a);
  const lc = s => (s||'').trim().toLowerCase();

  // Keys shared with loader/enforcer
  const RKEY_GLOBAL = 'pot_roster';
  const RKEY_BY_POT = 'pot_rosters_by_key';

  function hasFirebase(){
    try{
      return !!(window.firebase && firebase.apps && firebase.apps.length && firebase.firestore && firebase.storage);
    }catch(_){ return false; }
  }
  function db(){ try{ return firebase.firestore(); }catch(_){ return null; } }
  function storage(){ try{ return firebase.storage(); }catch(_){ return null; } }

  function getSelectedPotId(){
    const sel = document.getElementById('j-pot-select');
    if (sel && sel.value) return String(sel.value);
    const v = document.getElementById('v-pot');
    if (v && v.value) return String(v.value);
    return '';
  }

  function getLocalEmails(){
    try{
      // loader saves to localStorage as entries [email, {email}]
      const raw = localStorage.getItem(RKEY_GLOBAL);
      if (!raw) return [];
      const arr = JSON.parse(raw)||[];
      const emails = [];
      for (const kv of arr){ if (Array.isArray(kv) && kv[0]) emails.push(lc(kv[0])); }
      return Array.from(new Set(emails));
    }catch(_){ return []; }
  }

  async function uploadRosterToCloud(potId, emails){
    if (!hasFirebase()) { ERR('firebase not available; skipping cloud upload'); return false; }
    if (!potId || !emails || !emails.length) return false;
    const st = storage(); const _db = db(); if (!st || !_db) return false;

    // Store JSON in Storage
    const path = `rosters/${potId}.json`;
    const ref  = st.ref().child(path);
    const blob = new Blob([JSON.stringify({ membershipMap: Object.fromEntries(emails.map(e=>[e,true])), meta: { count: emails.length } })], { type:'application/json' });
    await ref.put(blob);

    // Write pointer in Firestore
    const docRef = _db.collection('pots').doc(potId).collection('meta').doc('roster');
    await docRef.set({
      storagePath: path,
      meta: {
        count: emails.length,
        uploadedAt: (firebase.firestore && firebase.firestore.FieldValue && firebase.firestore.FieldValue.serverTimestamp) ? firebase.firestore.FieldValue.serverTimestamp() : null
      }
    }, { merge: true });

    LOG('uploaded roster to cloud', potId, emails.length);
    return true;
  }

  function savePotMap(obj){
    try{ localStorage.setItem(RKEY_BY_POT, JSON.stringify(obj)); }catch(_){}
  }
  function loadPotMap(){
    try{ return JSON.parse(localStorage.getItem(RKEY_BY_POT) || '{}') || {}; }catch(_){ return {}; }
  }

  async function hydrateLocalFromCloud(potId){
    if (!hasFirebase() || !potId) return false;
    const _db = db(); const st = storage(); if(!_db||!st) return false;
    try{
      const doc = await _db.collection('pots').doc(potId).collection('meta').doc('roster').get();
      if (!doc.exists) { ERR('no roster pointer for pot', potId); return false; }
      const data = doc.data()||{};
      if (!data.storagePath) { ERR('no storagePath'); return false; }
      const url = await st.ref().child(data.storagePath).getDownloadURL();
      const res = await fetch(url, { cache:'no-store' });
      const json = await res.json();
      const map = loadPotMap();
      // primary key: potId
      map[lc(String(potId))] = Object.keys(json.membershipMap||{}).map(lc);
      savePotMap(map);
      LOG('hydrated local roster for', potId, (map[lc(String(potId))]||[]).length);
      // nudge enforcer to re-evaluate
      try{
        const email = document.querySelector('#j-email, #email, input[type="email"]');
        if (email){ email.dispatchEvent(new Event('input', {bubbles:true})); }
      }catch(_){}
      return true;
    }catch(err){
      ERR('hydrate failed', err);
      return false;
    }
  }

  function bindAttachButton(){
    const btn = document.getElementById('btn-roster-attach');
    if (!btn || btn.__cloudBound) return;
    btn.__cloudBound = true;
    btn.addEventListener('click', async function(){
      try{
        const potId = getSelectedPotId();
        const emails = getLocalEmails();
        if (!potId){ alert('Select a pot first (Active Tournaments).'); return; }
        if (!emails.length){ alert('No roster loaded. Upload a CSV first.'); return; }
        if (!hasFirebase()){ alert('Firebase not configured yet. Roster will work locally, but not synced.'); return; }
        btn.disabled = true; btn.textContent = 'Binding…';
        await uploadRosterToCloud(potId, emails);
        btn.textContent = 'Bind roster to this pot';
        btn.disabled = false;
        alert('Roster synced to cloud for this pot.');
      }catch(err){
        console.error(err);
        btn.disabled = false; btn.textContent = 'Bind roster to this pot';
        alert('Cloud sync failed: ' + (err && err.message || err));
      }
    });
  }

  function bindPotChangeHydrate(){
    const sel = document.getElementById('j-pot-select');
    if (!sel || sel.__cloudHydrateBound) return;
    sel.__cloudHydrateBound = true;
    sel.addEventListener('change', function(){
      const potId = getSelectedPotId();
      if (potId) hydrateLocalFromCloud(potId);
    });
    // initial
    const potId = getSelectedPotId();
    if (potId) hydrateLocalFromCloud(potId);
  }

  function boot(){
    bindAttachButton();
    bindPotChangeHydrate();
  }

  if (document.readyState==='loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})();