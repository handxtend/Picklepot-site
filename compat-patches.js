/*! PiCo Pickle Pot — front-end compatibility patches
 * - Show ALL created pots in Active Tournaments: include status 'open' and 'active'
 * - Allow organizers to edit using their Manage link (?pot=...&key=...) without changing your layout
 * Drop this file next to your app.js and add:
 *   <script src="compat-patches.js" defer></script>
 * after your existing <script src="app.js"> tag.
 */
(function(){
  const API = (window.API_BASE || "https://picklepot-stripe.onrender.com").replace(/\/+$/,"");
  // Organizer verification flag (true when backend validates a manage link 'key')
  window.OWNER_OK = false;

  async function verifyOwner(potId){
    try{
      const params = new URLSearchParams(location.search);
      const key = params.get("key") || localStorage.getItem("owner_key_"+potId);
      if(!key) return false;
      const r = await fetch(`${API}/pots/${encodeURIComponent(potId)}/owner/auth`, {
        method: "POST",
        headers: {"Content-Type": "application/json"},
        body: JSON.stringify({ key })
      });
      if(!r.ok) return false;
      window.OWNER_OK = true;
      localStorage.setItem("owner_key_"+potId, key);
      try{ refreshAdminUI(); }catch(_){}
      return true;
    }catch(_){ return false; }
  }

  // ---- Patch: Active Tournaments includes 'open' and 'active' ----
  const origAttach = window.attachActivePotsListener;
  window.attachActivePotsListener = function(){
    const sel = document.getElementById("j-pot-select");
    if(!window.db){ if(origAttach) return origAttach(); return; }

    // Unsubscribe if prior
    try{ if(window.JOIN_POTS_SUB){ window.JOIN_POTS_SUB(); window.JOIN_POTS_SUB=null; } }catch(_){}

    // Preferred: single 'in' query (may require Firestore index on 'status')
    try{
      window.JOIN_POTS_SUB = db.collection("pots").where("status","in",["open","active"])
      .onSnapshot(handle, errorFallback);
    }catch(e){
      errorFallback(e);
    }

    function handle(snap){
      const now = Date.now();
      const pots = [];
      snap.forEach(d=>{
        const x = { id: d.id, ...d.data() };
        const endMs = x.end_at?.toMillis ? x.end_at.toMillis() : null;
        if (endMs && endMs <= now) return;
        pots.push(x);
      });
      pots.sort((a,b)=>((a.start_at?.toMillis?.()||0)-(b.start_at?.toMillis?.()||0)));
      window.JOIN_POTS_CACHE = pots;
      try{ renderJoinPotSelectFromCache(); }catch(_){}
      if (sel && sel.selectedIndex < 0 && pots.length) sel.selectedIndex = 0;
      if (sel && sel.value){ const potIn = document.getElementById("v-pot"); if(potIn) potIn.value = sel.value; }
      try{ onJoinPotChange(); }catch(_){}
    }

    function errorFallback(err){
      console.warn("[compat] Falling back to dual open+active queries:", err);
      const subs = [];
      const merge = {};
      function subFor(status){
        return db.collection("pots").where("status","==",status).onSnapshot(s=>{
          s.forEach(d=>{ merge[d.id] = { id:d.id, ...d.data() }; });
          const arr = Object.values(merge);
          const now = Date.now();
          const pots = arr.filter(x=>{
            const endMs = x.end_at?.toMillis ? x.end_at.toMillis() : null;
            return !(endMs && endMs <= now);
          }).sort((a,b)=>((a.start_at?.toMillis?.()||0)-(b.start_at?.toMillis?.()||0)));
          window.JOIN_POTS_CACHE = pots;
          try{ renderJoinPotSelectFromCache(); }catch(_){}
          if (sel && sel.selectedIndex < 0 && pots.length) sel.selectedIndex = 0;
          try{ onJoinPotChange(); }catch(_){}
        });
      }
      subs.push(subFor("open"));
      subs.push(subFor("active"));
      window.JOIN_POTS_SUB = ()=>subs.forEach(u=>{ try{ u(); }catch(_){} });
    }
  };

  // ---- Patch: allow organizer manage link/key to unlock editing ----
  const origLoad = window.onLoadPotClicked;
  window.onLoadPotClicked = async function(){
    if (origLoad) await origLoad();
    try{
      if (window.CURRENT_DETAIL_POT?.id) {
        await verifyOwner(window.CURRENT_DETAIL_POT.id);
      }
    }catch(_){}
  };

  const origIsOwner = window.isOrganizerOwnerWithSub;
  window.isOrganizerOwnerWithSub = function(){
    try{
      if (window.OWNER_OK) return true;
    }catch(_){}
    try{
      return origIsOwner ? origIsOwner() : false;
    }catch(_){ return !!window.OWNER_OK; }
  };

  // If page opened with ?pot=...&key=... try to pre-unlock
  document.addEventListener("DOMContentLoaded", ()=>{
    const qs = new URLSearchParams(location.search);
    const pot = qs.get("pot");
    const key = qs.get("key");
    if (pot && key) verifyOwner(pot);
  });
})();