
/* ===== Pot Detail: Admin/Organizer Member/Guest toggle — v2 =================
   - Renders a <select> in the "Type" column for Admin and Organizer-owner (with sub)
   - Updates Firestore: member_type + applied_buyin (or buyin)
   - Updates the row UI immediately and nudges totals to recalc
============================================================================= */
(function(){
  function $(s, el=document){ return el.querySelector(s); }
  function dollars(n){ try{ return '$' + Number(n||0).toFixed(2); }catch(_){ return '$0.00'; } }
  function canAdmin(){
    try{
      return (typeof isSiteAdmin==='function' && isSiteAdmin()) ||
             (typeof isOrganizerOwnerWithSub==='function' && isOrganizerOwnerWithSub());
    }catch(_){ return false; }
  }
  function entryType(e){ return (e && (e.member_type || e.mtype)) || 'Guest'; }
  function entryBuyin(e){ return Number((e && (e.applied_buyin != null ? e.applied_buyin : e.buyin)) || 0); }

  // Save original if present (not used here but kept for safety)
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
      const curType = entryType(e);
      const typeSel = allowEdits
        ? `<select data-act="type" data-id="${e.id}" class="mini">
             <option value="Member"${curType==='Member'?' selected':''}>Member</option>
             <option value="Guest"${curType==='Guest'?' selected':''}>Guest</option>
           </select>`
        : curType;
      const buyin = dollars(entryBuyin(e));
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
        <tr data-entry-id="${e.id}">
          <td>${name}</td>
          <td>${email}</td>
          <td>${typeSel}</td>
          <td class="buyin-cell">${buyin}</td>
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
    if (!tbody || tbody.__typeToggleBoundV2) return;
    tbody.__typeToggleBoundV2 = true;

    tbody.addEventListener('change', async function(e){
      const t = e.target;
      if (t && t.matches('select[data-act="type"]')){
        // Permission gate
        if (!( (typeof isSiteAdmin==='function' && isSiteAdmin()) ||
               (typeof isOrganizerOwnerWithSub==='function' && isOrganizerOwnerWithSub()) )) {
          alert('Organizer/Admin only');
          // revert UI to prior value
          try{ t.value = (t.value==='Member'?'Guest':'Member'); }catch(_){}
          return;
        }

        const entryId = t.getAttribute('data-id');
        const newType = t.value === 'Member' ? 'Member' : 'Guest';
        const pot = (typeof CURRENT_DETAIL_POT!=='undefined') ? CURRENT_DETAIL_POT : null;
        if (!pot || !window.db){ alert('Pot not loaded.'); return; }

        // Compute the new buy-in based on pot rates
        const newBuyin = (newType==='Member') ? Number(pot.buyin_member||0) : Number(pot.buyin_guest||0);
        const entryRef = db.collection('pots').doc(pot.id).collection('entries').doc(entryId);
        try{
          await entryRef.update({ member_type: newType, applied_buyin: newBuyin });
          // Update UI immediately
          const row = t.closest('tr');
          if (row){
            const cell = row.querySelector('.buyin-cell');
            if (cell) cell.textContent = '$' + newBuyin.toFixed(2);
          }
          // Nudge totals recompute if your code exposes a helper
          try {
            if (typeof window.refreshPotTotals === 'function'){ window.refreshPotTotals(); }
            else {
              // quick fallback: trigger a synthetic mutation so listeners re-evaluate totals
              const target = document.getElementById('adminTable');
              if (target) target.dispatchEvent(new Event('change', {bubbles:true}));
            }
          } catch(_){}
        }catch(err){
          console.error('Failed to update type', err);
          alert('Failed to update Member/Guest.'); 
        }
      }
    }, true);
  })();
})();
/* ===== /Admin/Organizer type toggle — v2 =================================== */
