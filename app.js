
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
        }catch(err){
          console.error('Failed to update type', err);
          alert('Failed to update Member/Guest.'); 
        }
      }
    }, true);
  })();
})();
/* ===== /Admin/Organizer type toggle ======================================== */

// === Ensure Active Tournaments list populates reliably ===
if (typeof document !== 'undefined') {
  document.addEventListener('DOMContentLoaded', function() {
    try {
      if (typeof attachActivePotsListener === 'function') { attachActivePotsListener(); }
      // Optional UX: show "Loading..." if list is empty initially
      try {
        var sel = document.getElementById('j-pot-select');
        if (sel && !sel.options.length) sel.innerHTML = '<option>Loading…</option>';
      } catch (_){}
    } catch (e) { console && console.error && console.error('[boot] attachActivePotsListener failed', e); }
  });
}
// Retry once when Firebase auth state settles (covers delayed init)
try {
  var __auth = (window.firebase && firebase.auth) ? firebase.auth() : null;
  if (__auth && !window.__potsBoundOnce) {
    __auth.onAuthStateChanged(function() {
      if (!window.__potsBoundOnce) {
        window.__potsBoundOnce = true;
        try {
          if (typeof attachActivePotsListener === 'function') { attachActivePotsListener(); }
        } catch (e) { console && console.error && console.error('[auth] attachActivePotsListener failed', e); }
      }
    });
  }
} catch (_){}

