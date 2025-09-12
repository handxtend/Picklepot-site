
/* ===== Pot Detail: Admin/Organizer type toggle (Member/Guest) ============== */
(function(){
  function $(s, el=document){ return el.querySelector(s); }
  function dollars(n){ try{ return '$' + Number(n||0).toFixed(2); }catch(_){ return '$0.00'; } }
  function canAdmin(){
    try{
      return (typeof isSiteAdmin==='function' && isSiteAdmin()) ||
             (typeof isOrganizerOwnerWithSub==='function' && isOrganizerOwnerWithSub());
    }catch(_){ return false; }
  }

  // Capture original if present
  var __orig_render = window.renderRegistrations;

  window.renderRegistrations = function(entries){
    const tbody = document.querySelector('#adminTable tbody');
    if(!tbody) return;

    const showEmail = (typeof isSiteAdmin==='function' && isSiteAdmin());
    const allowEdits = canAdmin();

    if(!entries || !entries.length){
      tbody.innerHTML = `<tr><td colspan="7" class="muted">No registrations yet.</td></tr>`;
      return;
    }

    const pot = (typeof CURRENT_DETAIL_POT!=='undefined') ? CURRENT_DETAIL_POT : null;
    const html = entries.map(e=>{
      const name = e.name || '—';
      const email = showEmail ? (e.email || '—') : '';
      const typeSel = allowEdits
        ? `<select data-act="type" data-id="${e.id}" class="mini">
             <option value="Member"${(e.member_type||'')==='Member'?' selected':''}>Member</option>
             <option value="Guest"${(e.member_type||'')==='Guest'?' selected':''}>Guest</option>
           </select>`
        : (e.member_type || '—');
      const buyin = dollars(e.applied_buyin || 0);
      const paid = e.paid ? 'Yes' : 'No';
      const status = (e.status || 'active').toLowerCase();
      const next = status==='hold' ? 'active' : 'hold';
      const holdLabel = status==='hold' ? 'Resume' : 'Hold';

      const actions = allowEdits
        ? `
          <label style="display:inline-flex;align-items:center;gap:6px">
            <input type="checkbox" data-act="paid" data-id="${e.id}" ${e.paid?'checked':''}/> Paid
          </label>
          <button class="btn" data-act="hold" data-id="${e.id}" data-next="${next}" style="margin-left:6px">${holdLabel}</button>
          <button class="btn" data-act="move" data-id="${e.id}" style="margin-left:6px">Move</button>
          <button class="btn" data-act="resend" data-id="${e.id}" style="margin-left:6px">Resend</button>
          <button class="btn" data-act="remove" data-id="${e.id}" style="margin-left:6px">Remove</button>
        ` : '—';

      return `
        <tr>
          <td>${name}</td>
          <td>${email}</td>
          <td>${typeSel}</td>
          <td>${buyin}</td>
          <td>${paid}</td>
          <td>${status}</td>
          <td>${actions}</td>
        </tr>`;
    }).join('');

    tbody.innerHTML = html;
  };

  // Delegate change handler for the new <select>
  (function bindDelegates(){
    const tbody = document.querySelector('#adminTable tbody');
    if (!tbody || tbody.__typeToggleBound) return;
    tbody.__typeToggleBound = true;

    tbody.addEventListener('change', async function(e){
      const t = e.target;
      if (t && t.matches('select[data-act="type"]')){
        // Permission gate
        if (!( (typeof isSiteAdmin==='function' && isSiteAdmin()) ||
               (typeof isOrganizerOwnerWithSub==='function' && isOrganizerOwnerWithSub()) )) {
          alert('Organizer/Admin only');
          return;
        }

        const entryId = t.getAttribute('data-id');
        const newType = t.value === 'Member' ? 'Member' : 'Guest';
        const pot = (typeof CURRENT_DETAIL_POT!=='undefined') ? CURRENT_DETAIL_POT : null;
        if (!pot || !window.db){ alert('Pot not loaded.'); return; }

        // Recompute applied buy-in based on pot rates
        const newBuyin = (newType==='Member') ? Number(pot.buyin_member||0) : Number(pot.buyin_guest||0);
        try{
          await db.collection('pots').doc(pot.id).collection('entries').doc(entryId)
            .update({ member_type: newType, applied_buyin: newBuyin });
        }
}
    }, true);
  })();
})();
/* ===== /Admin/Organizer type toggle ======================================== */

// === PiCo Boot Hooks — reliable Active Tournaments attach ====================
(function(){
  function $(s, el){ return (el||document).querySelector(s); }
  function setLoading(){ try{ var sel = $('#j-pot-select'); if (sel && !sel.options.length) sel.innerHTML = '<option>Loading…</option>'; }catch(_){}};
  function kick(label){
    try{
      if (typeof attachActivePotsListener === 'function'){ console.log('[pots] kick:', label); attachActivePotsListener(); }
    }catch(e){ console.error('[pots] kick failed', label, e); }
  }
  if (document.readyState === 'loading'){ document.addEventListener('DOMContentLoaded', function(){ setLoading(); kick('DOMContentLoaded'); }); }
  else { setLoading(); kick('document-ready'); }
  try{
    var auth = (window.firebase && firebase.auth) ? firebase.auth() : null;
    if (auth && !window.__potsKickOnce){
      auth.onAuthStateChanged(function(){ if (!window.__potsKickOnce){ window.__potsKickOnce = true; kick('auth'); } });
    }
  }catch(_){}
  setTimeout(function(){ kick('t+1200ms'); }, 1200);
  setTimeout(function(){ kick('t+3500ms'); }, 3500);
  setTimeout(function(){
    try{
      var sel = document.getElementById('j-pot-select');
      if (!sel) return;
      var first = sel.options[0];
      var txt = first ? (first.textContent||'') : '';
      if (!sel.options.length || /loading/i.test(txt)){
        sel.innerHTML = '<option disabled>No open tournaments found. Click Refresh.</option>';
      }
    }catch(_){}
  }, 6000);
})();
// === /PiCo Boot Hooks ========================================================

/* ===== Join Checkout amount injector (ensures Stripe sees correct price) === */
(function(){
  if (window.__pp_amount_injector_installed) return;
  window.__pp_amount_injector_installed = true;

  function findCostCents(){
    try{
      // Preferred: explicit data-amount on a cost element
      var el = document.querySelector('#j-cost,[data-cost],[data-amount],.cost-label,.cost');
      if (el){
        var t = (el.dataset && (el.dataset.amount || el.dataset.cost)) ? (el.dataset.amount || el.dataset.cost) : (el.textContent||'');
        var m = /\$?\s*([0-9]+(?:\.[0-9]{1,2})?)/.exec(String(t));
        if (m){ return Math.round(parseFloat(m[1]) * 100); }
      }
      // Fallback: look near the Member/Guest control for "Cost: $X.YY"
      var mg = document.querySelector('#j-mtype,#mtype,select[name*="type" i],select[name*="buy" i]');
      if (mg){
        var wrap = mg.closest('.form-row,.row,.field,.input-group,.container') || document;
        var txt = wrap.textContent || '';
        var m2 = /Cost:\s*\$?\s*([0-9]+(?:\.[0-9]{1,2})?)/i.exec(txt);
        if (m2){ return Math.round(parseFloat(m2[1]) * 100); }
      }
    }catch(e){ console.warn('[join] findCostCents failed', e); }
    return null;
  }

  var origFetch = window.fetch;
  window.fetch = function(input, init){
    try{
      var url = (typeof input==='string') ? input : (input && input.url) || '';
      var method = (init && init.method || 'GET').toUpperCase();
      if (/\/create-checkout-session(?:\?|$)/.test(url) && method === 'POST' && init && typeof init.body === 'string'){
        try{
          var data = JSON.parse(init.body || '{}');
          if (data && (data.amount_cents == null)){
            var cents = findCostCents();
            if (cents != null){
              data.amount_cents = cents;
              init.body = JSON.stringify(data);
              console.log('[join] injected amount_cents =', cents);
            } else {
              console.warn('[join] unable to determine cost; leaving payload as-is');
            }
          }
        }catch(e){ console.warn('[join] payload parse fail', e); }
      }
    }catch(e){}
    return origFetch.apply(this, arguments);
  };
})();
/* ===== /Join Checkout amount injector ====================================== */
