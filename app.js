let JOIN_INFLIGHT=false;

/* PiCo Pickle Pot — working app with Start/End time + configurable Pot Share % + admin UI refresh + auto-load registrations + admin controls + per-entry Hold/Move/Resend + rotating banners + Stripe join + per-event payment method toggles + SUCCESS BANNER */

/* ========= IMPORTANT: Backend base URL (no redeclare errors) ========= */
window.API_BASE = window.API_BASE || 'https://picklepot-stripe.onrender.com';

/* ==== Organizer plan prices (safe to expose) ==== */
const PRICE_MAP = {
  individual_monthly: 'price_1Rwq6nFFPAbZxH9HkmDxBJ73',
  individual_yearly:  'price_1RwptxFFPAbZxH9HdPLdYIZR',
  club_monthly:       'price_1Rwq1JFFPAbZxH9HmpYCSJYv',
  club_yearly:        'price_1RwpyUFFPAbZxH9H2N1Ykd4U'
};

const SITE_ADMIN_PASS = 'Jesus7';
function isSiteAdmin(){ return localStorage.getItem('site_admin') === '1'; }
function setSiteAdmin(on){ on?localStorage.setItem('site_admin','1'):localStorage.removeItem('site_admin'); }

const $  = (s,el=document)=>el.querySelector(s);
const $$ = (s,el=document)=>[...el.querySelectorAll(s)];
const dollars = n => '$' + Number(n||0).toFixed(2);

/* --- session helpers --- */
function clearClientSession() {
  ['pp_uid','pp_profile','pp_admin','pp_token','pp_signed_in'].forEach(k => localStorage.removeItem(k));
  sessionStorage.clear();
}

(function forceLogoutViaURL(){
  if (new URLSearchParams(location.search).has('logout')) {
    clearClientSession();
    history.replaceState({}, '', location.pathname);
  }
})();

/* Update “Signed In/Out” label and buttons */
document.addEventListener('DOMContentLoaded', initAuthGate);
function initAuthGate() {
  const uid = localStorage.getItem('pp_uid');
  const signed = !!uid;

  let statusEl = document.querySelector('#signedStatus, .signed-status, [data-signed-status]');
  if (!statusEl) {
    statusEl = Array.from(document.querySelectorAll('span,div,b,strong,em'))
      .find(el => el.textContent.trim() === '' || el.textContent.trim() === '');
  }
  if (statusEl){ try{ statusEl.textContent=''; statusEl.style.display='none'; }catch(_){}}const signOutBtn = document.querySelector('[data-action=\"signout\"], #btnSignOut');
if (signOutBtn){ try{ signOutBtn.style.display='none'; }catch(_){} }
if (!signed) localStorage.removeItem('pp_admin');

  // Filters for Active Tournaments
  ['j-filter-name','j-filter-org','j-filter-city'].forEach(function(id){
    var el = document.getElementById(id);
    if (el && !el.__filterBound){
      el.addEventListener('input', function(){ try{ renderJoinPotSelectFromCache(); }catch(e){} });
      el.__filterBound = true;
    }
  });
}

/* ---------- Organizer Subscription (front-end) ---------- */
let ORG_SUB = { active:false, until:null };
function hasOrganizerSub(){ return !!ORG_SUB.active; }

async function loadOrganizerSubStatus(){
  try{
    const uid = firebase.auth().currentUser?.uid;
    if(!uid){ ORG_SUB = {active:false, until:null}; return ORG_SUB; }
    const doc = await db.collection('organizer_subs').doc(uid).get();
    if(!doc.exists){ ORG_SUB = {active:false, until:null}; return ORG_SUB; }
    const d = doc.data() || {};
    const untilMs = d.current_period_end?.toMillis ? d.current_period_end.toMillis() :
                    (typeof d.current_period_end === 'number' ? d.current_period_end : null);
    const now = Date.now();
    const active = (d.status === 'active') && (!!untilMs ? untilMs > now : true);
    ORG_SUB = { active, until: untilMs };
    return ORG_SUB;
  }catch(err){
    console.error('[Sub] Failed to load organizer subscription status', err);
    ORG_SUB = { active:false, until:null };
    return ORG_SUB;
  }
}

function refreshOrganizerUI(){
  try{
    const createCard = document.getElementById('create-card');
    if (createCard){
      if (hasOrganizerSub()){
        createCard.style.display = '';
      } else if (!isSiteAdmin()){
        createCard.style.display = 'none';
      }
    }
  }catch(e){ console.warn('[Sub] refreshOrganizerUI error', e); }
}

function isOrganizerOwnerWithSub(){
  const uid = firebase.auth().currentUser?.uid;
  const isOwner = !!(uid && CURRENT_DETAIL_POT && CURRENT_DETAIL_POT.ownerUid === uid);
  return isOwner && hasOrganizerSub();
}

/* ---------- Admin UI ---------- */
function refreshAdminUI(){
  const on = isSiteAdmin();
  $$('.admin-only').forEach(el => { el.style.display = on ? '' : 'none'; });
  const btnLogin  = $('#site-admin-toggle');
  const btnLogout = $('#site-admin-logout');
  const status    = $('#site-admin-status');
  if (btnLogin)  btnLogin.style.display  = on ? 'none' : '';
  if (btnLogout) btnLogout.style.display = on ? '' : 'none';
  if (status) status.textContent = on ? '01' : '00';

  if (CURRENT_DETAIL_POT) renderRegistrations(LAST_DETAIL_ENTRIES);
}

/* ---------- SELECT OPTIONS ---------- */

/* ---------- ADDRESS OPTIONS (lightweight) ---------- */
const US_STATES = [
  {code:'AL',name:'Alabama'},{code:'AZ',name:'Arizona'},{code:'CA',name:'California'},{code:'CO',name:'Colorado'},
  {code:'FL',name:'Florida'},{code:'GA',name:'Georgia'},{code:'IL',name:'Illinois'},{code:'MA',name:'Massachusetts'},
  {code:'MI',name:'Michigan'},{code:'NC',name:'North Carolina'},{code:'NJ',name:'New Jersey'},{code:'NY',name:'New York'},
  {code:'OH',name:'Ohio'},{code:'PA',name:'Pennsylvania'},{code:'SC',name:'South Carolina'},{code:'TN',name:'Tennessee'},
  {code:'TX',name:'Texas'},{code:'VA',name:'Virginia'},{code:'WA',name:'Washington'},{code:'WI',name:'Wisconsin'}
];
const STATE_CITIES = {
  "CA": ["Los Angeles","San Diego","San Jose","San Francisco","Sacramento","Other"],
  "FL": ["Miami","Orlando","Tampa","Jacksonville","Tallahassee","Other"],
  "GA": ["Atlanta","Savannah","Augusta","Columbus","Athens","Other"],
  "IL": ["Chicago","Aurora","Naperville","Joliet","Springfield","Other"],
  "MA": ["Boston","Worcester","Springfield","Cambridge","Lowell","Other"],
  "MI": ["Detroit","Grand Rapids","Ann Arbor","Warren","Flint","Other"],
  "NC": ["Charlotte","Raleigh","Greensboro","Durham","Winston-Salem","Other"],
  "NJ": ["Newark","Jersey City","Paterson","Elizabeth","Edison","Other"],
  "NY": ["New York","Buffalo","Rochester","Yonkers","Syracuse","Other"],
  "OH": ["Columbus","Cleveland","Cincinnati","Toledo","Akron","Other"],
  "PA": ["Philadelphia","Pittsburgh","Allentown","Erie","Reading","Other"],
  "SC": ["Charleston","Columbia","North Charleston","Mount Pleasant","Rock Hill","Other"],
  "TN": ["Nashville","Memphis","Knoxville","Chattanooga","Clarksville","Other"],
  "TX": ["Houston","San Antonio","Dallas","Austin","Fort Worth","Other"],
  "VA": ["Virginia Beach","Norfolk","Chesapeake","Richmond","Newport News","Other"],
  "WA": ["Seattle","Spokane","Tacoma","Vancouver","Bellevue","Other"],
  "WI": ["Milwaukee","Madison","Green Bay","Kenosha","Racine","Other"]
};

const NAME_OPTIONS = ["GPC April (AL)","GPC September League (SL)","PiCoSO (55+)","BOTP","Other"];
const EVENTS = ["Mixed Doubles","Coed Doubles","Men's Doubles","Women's Doubles","Full Singles (Men)","Full Singles (Women)","Skinny Singles (Coed)","Other"];
const SKILLS = ["Any","2.5 - 3.0","3.25+","Other"];
const LOCATIONS = ["VR Parks& Rec. 646 Industrial Blvd. Villa Rica GA 30180","Other"];
const SKILL_ORDER={ "Any":0, "2.5 - 3.0":1, "3.25+":2 };
const skillRank = s => SKILL_ORDER[s] ?? 0;

/* ---------- Helpers ---------- */

function toggleOrganizerExtras(){
  var sel = document.getElementById('c-organizer');
  var emailWrap = document.getElementById('c-org-email-wrap');
  var isOther = (sel && sel.value === 'Other');
  if (emailWrap){ emailWrap.style.display = isOther ? '' : 'none'; }
  var email = document.getElementById('c-org-email');
  if (email){ email.required = !!isOther; }
}

function fillSelect(id, items){
  const el = (typeof id==='string') ? document.getElementById(id) : id;
  if (!el) return;
  el.innerHTML = items.map(v => `<option>${v}</option>`).join('');
}
function toggleOther(selectEl, wrapEl){ if(!selectEl||!wrapEl) return; wrapEl.style.display = (selectEl.value==='Other')?'':'none'; }
function getSelectValue(selectEl, otherInputEl){ return selectEl.value==='Other'?(otherInputEl?.value||'').trim():selectEl.value; }
function setSelectOrOther(selectEl, wrap, input, val, list){
  if(list.includes(val)){ selectEl.value=val; wrap.style.display='none'; input.value=''; }
  else { selectEl.value='Other'; wrap.style.display=''; input.value=val||''; }
}
function escapeHtml(s){
  const map = {
    '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;','/':'&#47;','`':'&#96;','=':'&#61;'
  };
  return String(s||'').replace(/[&<>"'`=\/]/g, c => map[c]);
}

/* ---------- FIREBASE (safe) ---------- */
let db = null;
(function initDbSafely(){
  try{
    if (window.firebase && firebase.firestore){ db = firebase.firestore(); }
  }catch(e){ console.info('Firebase not loaded on this page (success/cancel ok).'); }
})();

/* ---------- UI bootstrap ---------- */
document.addEventListener('DOMContentLoaded', () => {
  // Force Create button to use Stripe Checkout
  try{
    const _btn = document.getElementById('btn-create');
    if (_btn){
      const _clone = _btn.cloneNode(true);
      _btn.parentNode.replaceChild(_clone, _btn);
      _clone.addEventListener('click', onCreateClick);
    }
  }catch(_){}
  document.getElementById('btn-subscribe-organizer')?.addEventListener('click', onOrganizerSubscribe);
  handleSubscriptionReturn();

  fillSelect('c-name-select', NAME_OPTIONS);
  fillSelect('c-event', EVENTS);
  fillSelect('c-skill', SKILLS);
  fillSelect('c-location-select', LOCATIONS);
  try{ fillStateAndCity(); }catch(_){}
  try{ toggleAddressForLocation(); $('#c-location-select').addEventListener('change', ()=>toggleAddressForLocation()); }catch(_){}
  fillSelect('j-skill', SKILLS);

  // Other toggles (create)
  toggleOther($('#c-name-select'), $('#c-name-other-wrap'));
  $('#c-name-select').addEventListener('change', ()=>toggleOther($('#c-name-select'), $('#c-name-other-wrap')));
  toggleOther($('#c-organizer'), $('#c-org-other-wrap'));
  try{ toggleOrganizerExtras(); $('#c-organizer').addEventListener('change', toggleOrganizerExtras); }catch(_){}
  $('#c-organizer').addEventListener('change', ()=>toggleOther($('#c-organizer'), $('#c-org-other-wrap')));
  toggleOther($('#c-event'), $('#c-event-other-wrap'));
  $('#c-event').addEventListener('change', ()=>toggleOther($('#c-event'), $('#c-event-other-wrap')));
  toggleOther($('#c-skill'), $('#c-skill-other-wrap'));
  $('#c-skill').addEventListener('change', ()=>toggleOther($('#c-skill'), $('#c-skill-other-wrap')));
  toggleOther($('#c-location-select'), $('#c-location-other-wrap'));
  $('#c-location-select').addEventListener('change', ()=>toggleOther($('#c-location-select'), $('#c-location-other-wrap')));

  if (db) attachActivePotsListener();

  $('#j-refresh').addEventListener('click', ()=>{ if (db) attachActivePotsListener(); onJoinPotChange(); });
  $('#j-pot-select').addEventListener('change', onJoinPotChange);
  $('#j-skill').addEventListener('change', evaluateJoinEligibility);
  $('#j-mtype').addEventListener('change', ()=>{ updateJoinCost(); evaluateJoinEligibility(); });

  $('#j-paytype').addEventListener('change', ()=>{ updateJoinCost(); updatePaymentNotes(); });

  $('#btn-create').addEventListener('click', onCreateClick);
$('#btn-join').addEventListener('click', joinPot);

  const loadBtn = $('#btn-load');
  if (loadBtn) { loadBtn.disabled = false; loadBtn.addEventListener('click', onLoadPotClicked); }
  const potIdInput = $('#v-pot');
  if (potIdInput) {
    potIdInput.addEventListener('keydown', (e)=>{
      if(e.key === 'Enter'){ e.preventDefault(); onLoadPotClicked(); }
    });
  }
  $('#j-pot-select').addEventListener('change', ()=>{
    const sel = $('#j-pot-select').value;
    if(sel && potIdInput){ potIdInput.value = sel; }
  });

  // Admin header buttons
  $('#site-admin-toggle').addEventListener('click', ()=>{
    const v = prompt('Admin password?');
    if(v===SITE_ADMIN_PASS){ setSiteAdmin(true); refreshAdminUI(); alert('Admin mode enabled.'); }
    else alert('Incorrect password.');
  });
  $('#site-admin-logout').addEventListener('click', ()=>{
    setSiteAdmin(false); refreshAdminUI(); alert('Admin mode disabled.');
  });

  // Admin buttons in Pot Detail
  $('#btn-admin-login')?.addEventListener('click', ()=>{
    const v = prompt('Admin password?');
    if(v===SITE_ADMIN_PASS){ setSiteAdmin(true); refreshAdminUI(); alert('Admin mode enabled.'); }
    else alert('Incorrect password.');
  });
  $('#btn-edit')?.addEventListener('click', enterPotEditMode);
  $('#btn-cancel-edit')?.addEventListener('click', ()=>{ $('#pot-edit-form').style.display='none'; });
  $('#btn-save-pot')?.addEventListener('click', savePotEdits);
  $('#btn-hold')?.addEventListener('click', ()=>updatePotStatus('hold'));
  $('#btn-resume')?.addEventListener('click', ()=>updatePotStatus('open'));
  $('#btn-delete')?.addEventListener('click', deleteCurrentPot);
  $('#btn-admin-grant')?.addEventListener('click', grantThisDeviceAdmin);
  $('#btn-admin-revoke')?.addEventListener('click', revokeThisDeviceAdmin);

  // Per-entry actions delegated
  const tbody = document.querySelector('#adminTable tbody');
  if (tbody){
    tbody.addEventListener('change', async (e)=>{
      const t = e.target;
      if (t && t.matches('input[type="checkbox"][data-act="paid"]')) {
        if(!requireAdmin()) { t.checked = !t.checked; return; }
        const entryId = t.getAttribute('data-id');
        try{
          await db.collection('pots').doc(CURRENT_DETAIL_POT.id)
            .collection('entries').doc(entryId).update({ paid: t.checked });
        }catch(err){
          console.error(err); alert('Failed to update paid status.'); t.checked = !t.checked;
        }
      }
    });
    tbody.addEventListener('click', async (e)=>{
      const btn = e.target.closest('button[data-act]');
      if(!btn) return;
      if(!requireAdmin()) return;
      const act = btn.getAttribute('data-act');
      const entryId = btn.getAttribute('data-id');
      if (act === 'remove'){
        const ok = confirm('Remove this registration?'); if(!ok) return;
        try{
          await db.collection('pots').doc(CURRENT_DETAIL_POT.id)
            .collection('entries').doc(entryId).delete();
        }catch(err){ console.error(err); alert('Failed to remove registration.'); }
        return;
      }
      if (act === 'hold'){
        const next = btn.getAttribute('data-next');
        try{
          await db.collection('pots').doc(CURRENT_DETAIL_POT.id)
            .collection('entries').doc(entryId).update({ status: next });
        }catch(err){ console.error(err); alert('Failed to update status.'); }
        return;
      }
      if (act === 'move'){ openMoveDialog(entryId); return; }
      if (act === 'resend'){ resendConfirmation(entryId); return; }
    });
  }

  refreshAdminUI();
  // NEW: show success banner if returning from Stripe
  checkStripeReturn();
});

/* ---------- Utility: payment methods map ---------- */
function getPaymentMethods(p){
  const pm = p?.payment_methods || {};
  const has = v => v === true;
  return {
    stripe: has(pm.stripe) || false,
    zelle:  has(pm.zelle)  || (!!p?.pay_zelle),
    cashapp:has(pm.cashapp)|| (!!p?.pay_cashapp),
    onsite: has(pm.onsite) || (!!p?.pay_onsite)
  };
}

/* ---------- Create Pot ---------- */
async function createPot(){
  // Route to Stripe checkout (draft first)
  return startCreatePotCheckout();
}
/* ---------- Active list / Totals ---------- */
let JOIN_POTS_CACHE = [];
let JOIN_POTS_SUB = null;
let CURRENT_JOIN_POT = null;
let JOIN_ENTRIES_UNSUB = null;
let DETAIL_ENTRIES_UNSUB = null;
let LAST_DETAIL_ENTRIES = [];
let CURRENT_DETAIL_POT = null;


// --- Active list filtering helpers ---
function getActiveFilters(){
  return {
    name: (document.getElementById('j-filter-name')?.value || '').trim().toLowerCase(),
    org:  (document.getElementById('j-filter-org')?.value  || '').trim().toLowerCase(),
    city: (document.getElementById('j-filter-city')?.value || '').trim().toLowerCase()
  };
}
function renderJoinPotSelectFromCache(){
  const sel = document.getElementById('j-pot-select');
  if (!sel) return;
  const pots = (typeof JOIN_POTS_CACHE!=='undefined' && JOIN_POTS_CACHE) ? JOIN_POTS_CACHE : [];
  const f = getActiveFilters();
  const filtered = pots.filter(p=>{
    const n = (p.name||'').toLowerCase();
    const o = (p.organizer||'').toLowerCase();
    const c = ((p.addr_city || p.location || '')+'').toLowerCase();
    return (!f.name || n.includes(f.name)) &&
           (!f.org  || o.includes(f.org)) &&
           (!f.city || c.includes(f.city));
  });
  if(!filtered.length){
    sel.innerHTML = `<option value=\"\">No matches</option>`;\n    try{ sel.size = 1; }catch(_){ }
    const joinBtn = document.getElementById('btn-join');
    if (joinBtn) joinBtn.disabled = true;
    const brief = document.getElementById('j-pot-summary-brief');
    if (brief) brief.textContent = '—';
    const startedBadge = document.getElementById('j-started-badge');
    if (startedBadge) startedBadge.style.display='none';
    if (typeof updateBigTotals === 'function') updateBigTotals(0,0);
    if (typeof watchPotTotals === 'function') watchPotTotals(null);
    return;
  }
  const prev = sel.value;
  sel.innerHTML = filtered.map(p=>{
    const label = [p.name||'Unnamed', p.event||'—', p.skill||'Any'].join(' • ');
    return `<option value="${p.id}">${label}</option>`;
  }).join('');
  
  try{ sel.size=Math.max(1,Math.min(filtered.length,12)); }catch(e){}
if (filtered.some(p=>p.id===prev)) sel.value = prev;
  if (sel.selectedIndex < 0) sel.selectedIndex = 0;
  const potIdInput = document.getElementById('v-pot');
  if (potIdInput && sel.value) potIdInput.value = sel.value;
  if (typeof onJoinPotChange === 'function') onJoinPotChange();
}

function attachActivePotsListener(){
  const sel = $('#j-pot-select');
  if(JOIN_POTS_SUB){ try{JOIN_POTS_SUB();}catch(_){} JOIN_POTS_SUB=null; }
  sel.innerHTML = '';
  JOIN_POTS_CACHE = [];

  JOIN_POTS_SUB = db.collection('pots').where('status','==','open')
    .onSnapshot(snap=>{
      const now = Date.now();
      const pots = [];
      snap.forEach(d=>{
        const x = { id:d.id, ...d.data() };
        const endMs   = x.end_at?.toMillis ? x.end_at.toMillis() : null;
        if(endMs && endMs <= now) return;
        pots.push(x);
      });
      pots.sort((a,b)=>{
        const as = a.start_at?.toMillis?.() ?? 0;
        const bs = b.start_at?.toMillis?.() ?? 0;
        return as-bs;
      });

      JOIN_POTS_CACHE = pots;

      if(!pots.length){
        sel.innerHTML = `<option value="">No open pots</option>`;
        $('#btn-join').disabled = true;
        $('#j-pot-summary-brief').textContent = '—';
        $('#j-started-badge').style.display='none';
        updateBigTotals(0,0);
        return;
      }

      renderJoinPotSelectFromCache();
if(sel.selectedIndex < 0) sel.selectedIndex = 0;

      const firstId = sel.value;
      if (firstId) { const potIdInput = $('#v-pot'); if(potIdInput) potIdInput.value = firstId; }

      onJoinPotChange();
    }, err=>{
      console.error('pots watch error', err);
      sel.innerHTML = `<option value="">Error loading pots</option>`;
    });
}

function onJoinPotChange(){
  const sel = $('#j-pot-select');
  CURRENT_JOIN_POT = JOIN_POTS_CACHE.find(p=>p.id === sel.value) || null;

  const brief = $('#j-pot-summary-brief');
  const startedBadge = $('#j-started-badge');
  const btn = $('#btn-join');

  const potIdInput = $('#v-pot');
  if (potIdInput && sel.value) potIdInput.value = sel.value;

  if(!CURRENT_JOIN_POT){
    brief.textContent = '—';
    startedBadge.style.display='none';
    btn.disabled = true;
    watchPotTotals(null);
    return;
  }

  const p = CURRENT_JOIN_POT;
  brief.textContent = [p.name||'Unnamed', p.event||'—', p.skill||'Any'].join(' • ');

  const now = Date.now();
  const startMs = p.start_at?.toMillis ? p.start_at.toMillis() : null;
  const endMs   = p.end_at?.toMillis   ? p.end_at.toMillis()   : null;
  const started = startMs && startMs <= now;
  const ended   = endMs && endMs <= now;

  startedBadge.style.display = started && !ended ? '' : 'none';
  btn.disabled = ended;

  updateJoinCost();
  evaluateJoinEligibility();
  updatePaymentOptions();
  updatePaymentNotes();
  watchPotTotals(p.id);

  autoLoadDetailFromSelection();
}

function autoLoadDetailFromSelection(){
  const selId = $('#j-pot-select')?.value;
  if(!selId) return;
  if($('#v-pot')) $('#v-pot').value = selId;
  onLoadPotClicked();
}

/* ---------- Totals ---------- */
function getPotSharePct(potId){
  const fromJoin = JOIN_POTS_CACHE.find(p=>p.id===potId);
  if (fromJoin && typeof fromJoin.pot_share_pct === 'number') return fromJoin.pot_share_pct;
  if (CURRENT_DETAIL_POT && CURRENT_DETAIL_POT.id===potId && typeof CURRENT_DETAIL_POT.pot_share_pct === 'number') return CURRENT_DETAIL_POT.pot_share_pct;
  return 50;
}

function watchPotTotals(potId){
  if(JOIN_ENTRIES_UNSUB){ try{JOIN_ENTRIES_UNSUB();}catch(_){} JOIN_ENTRIES_UNSUB=null; }
  const totalEl = $('#j-pot-total');
  if(!potId){ totalEl.style.display='none'; updateBigTotals(0,0); return; }

  JOIN_ENTRIES_UNSUB = db.collection('pots').doc(potId).collection('entries')
    .onSnapshot(snap=>{
      let totalAll=0, totalPaid=0, countAll=0, countPaid=0;

      snap.forEach(doc=>{
        const d = doc.data();
        const isActive = !d.status || d.status === 'active';
        if (!isActive) return;
        const amt = Number(d.applied_buyin || 0);
        if (amt > 0) {
          totalAll += amt;
          countAll++;
          if (d.paid) { totalPaid += amt; countPaid++; }
        }
      });

      totalEl.innerHTML =
        `Total Pot (All): <b>${dollars(totalAll)}</b> (${countAll} entr${countAll===1?'y':'ies'}) • ` +
        `Paid: <b>${dollars(totalPaid)}</b> (${countPaid} paid)`;
      totalEl.style.display='';

      const pct = getPotSharePct(potId) / 100;
      updateBigTotals(totalPaid*pct, totalAll*pct);
    }, err=>{
      console.error('entries watch failed', err);
      totalEl.textContent = 'Total Pot: (error loading)';
      totalEl.style.display='';
      updateBigTotals(0,0);
    });
}
function updateBigTotals(paidShare, totalShare){
  $('#j-big-paid-amt').textContent  = dollars(paidShare);
  $('#j-big-total-amt').textContent = dollars(totalShare);
}

/* ---------- Join helpers ---------- */
function updateJoinCost(){
  const p = CURRENT_JOIN_POT; if(!p) return;
  const mtype = $('#j-mtype').value;
  const amt = (mtype==='Member'? Number(p.buyin_member||0) : Number(p.buyin_guest||0));
  $('#j-cost').textContent = 'Cost: ' + dollars(amt);
}
function evaluateJoinEligibility(){
  const p=CURRENT_JOIN_POT; if(!p) return;
  const warn = $('#j-warn');
  const playerSkill = $('#j-skill').value;
  const allow = (p.skill==='Any') || ( ({"Any":0,"2.5 - 3.0":1,"3.25+":2}[playerSkill]??0) <= ({"Any":0,"2.5 - 3.0":1,"3.25+":2}[p.skill]??0) );
  warn.style.display = allow ? 'none' : 'block';
  warn.textContent = allow ? '' : 'Higher skill level cannot play down';
}

/* Build payment options per event */
function updatePaymentOptions(){
  const p = CURRENT_JOIN_POT; if(!p) return;
  const pm = getPaymentMethods(p);
  const sel = $('#j-paytype');
  const opts = [];
  if (pm.stripe)  opts.push(`<option value="Stripe">Stripe (card)</option>`);
  if (pm.zelle)   opts.push(`<option value="Zelle">Zelle</option>`);
  if (pm.cashapp) opts.push(`<option value="CashApp">CashApp</option>`);
  if (pm.onsite)  opts.push(`<option value="Onsite">Onsite</option>`);
  sel.innerHTML = opts.join('') || `<option value="">No payment methods available</option>`;
}

/* Notes under payment select */
function updatePaymentNotes(){
  const p = CURRENT_JOIN_POT; const el = $('#j-pay-notes');
  if(!p){ el.style.display='none'; el.textContent=''; return; }
  const t = $('#j-paytype').value;
  const lines=[];
  if(t==='Stripe')  lines.push('Pay securely by card via Stripe Checkout.');
  if(t==='Zelle')   lines.push(p.pay_zelle ? `Zelle: ${p.pay_zelle}` : 'Zelle instructions not provided.');
  if(t==='CashApp') lines.push(p.pay_cashapp ? `CashApp: ${p.pay_cashapp}` : 'CashApp instructions not provided.');
  if(t==='Onsite')  lines.push(p.pay_onsite ? 'Onsite payment accepted at event check-in.' : 'Onsite payment is not enabled for this tournament.');
  el.innerHTML = lines.join('<br>'); el.style.display = lines.length ? '' : 'none';
}

/* ---------- Join (Stripe + others) ---------- */
async function joinPot(){
  if (JOIN_INFLIGHT) return; JOIN_INFLIGHT=true; try{const b=document.getElementById('btn-join'); if(b) b.disabled=true;}catch(_){ };
const p = CURRENT_JOIN_POT; 
  const btn = $('#btn-join');
  const msg = $('#join-msg');

  function setBusy(on, text){
    if (!btn) return;
    btn.disabled = !!on;
    btn.textContent = on ? (text || 'Working…') : 'Join';
  }
  function fail(message){
    console.error('[JOIN] Error:', message);
    msg.textContent = message || 'Something went wrong.';
    setBusy(false);
  }

  if(!p){ msg.textContent='Select a pot to join.'; return; }

  const now=Date.now(), endMs=p.end_at?.toMillis?.();
  if((endMs && endMs<=now) || p.status==='closed'){
    msg.textContent='Registration is closed for this tournament.'; return;
  }

  const fname=$('#j-fname').value.trim();
  const lname=$('#j-lname').value.trim();
  const email=$('#j-email').value.trim();
  const playerSkill=$('#j-skill').value;
  const member_type=$('#j-mtype').value;
  const pay_type=$('#j-paytype').value;

  if(!fname){ msg.textContent='First name is required.'; return; }
  if(!pay_type){ msg.textContent='Choose a payment method.'; return; }

  const rank = s => ({"Any":0,"2.5 - 3.0":1,"3.25+":2}[s] ?? 0);
  if(p.skill!=='Any' && rank(playerSkill) > rank(p.skill)){
    msg.textContent='Selected skill is higher than pot skill — joining is not allowed.'; 
    return;
  }

  const name=[fname,lname].filter(Boolean).join(' ').trim();
  const applied_buyin=(member_type==='Member'? (p.buyin_member??0) : (p.buyin_guest??0));
  const emailLC = (email||'').toLowerCase(), nameLC = name.toLowerCase();

  try{
    setBusy(true, pay_type==='Stripe' ? 'Redirecting to Stripe…' : 'Joining…');
    msg.textContent = '';

    const entriesRef = db.collection('pots').doc(p.id).collection('entries');

    const dupEmail = emailLC ? await entriesRef.where('email_lc','==', emailLC).limit(1).get() : { empty:true };
    const dupName  = nameLC  ? await entriesRef.where('name_lc','==', nameLC).limit(1).get()  : { empty:true };
    if(!dupEmail.empty || !dupName.empty){ 
      return fail('Duplicate registration: this name or email already joined this event.');
    }

    const entry = {
      name, name_lc:nameLC, email, email_lc:emailLC,
      member_type, player_skill:playerSkill, pay_type,
      applied_buyin, paid:false, status:'active',
      created_at: firebase.firestore.FieldValue.serverTimestamp()
    };
    const docRef = await entriesRef.add(entry);
    const entryId = docRef.id;
    console.log('[JOIN] Entry created', { potId: p.id, entryId });

    if (pay_type === 'Stripe'){
      const pm = getPaymentMethods(p);
      if (!pm.stripe){
        return fail('Stripe is disabled for this event.');
      }

      const amount_cents = Math.round(Number(applied_buyin || 0) * 100);
      if (!Number.isFinite(amount_cents) || amount_cents < 50){
        return fail('Stripe requires a fee of at least $0.50.');
      }

      // Use HTTPS origin if page was opened as file://
      const origin =
        window.location.protocol === 'file:'
          ? 'https://pickleballcompete.com'
          : window.location.origin;

      const payload = {
        pot_id: p.id,
        entry_id: entryId,
        amount_cents,
        player_name: name || 'Player',
        player_email: email || undefined,
        success_url: origin + '/success.html?flow=join',
        cancel_url: origin + '/cancel.html?flow=join',
        method: 'stripe'
      };

      console.log('[JOIN] Creating checkout session…', payload);

      let res, data;
      try{
        res = await fetch(`${window.API_BASE}/create-checkout-session`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload)
        });
      }catch(networkErr){
        return fail('Network error contacting payment server. Check your internet or CORS.');
      }

      try { data = await res.json(); }
      catch(parseErr){ return fail('Bad response from payment server.'); }

      if (!res.ok || !data?.url){
        const errMsg = data?.error || `Payment server error (${res.status}).`;
        return fail(errMsg);
      }

      // Keep IDs for success page UX
      sessionStorage.setItem('potId', p.id);
      sessionStorage.setItem('entryId', entryId);

      try { window.location.href = data.url; }
      catch { window.open(data.url, '_blank', 'noopener'); }
      return;
    }

    // Non-Stripe:
    setBusy(false);
    msg.textContent='Joined! Complete payment using the selected method.';
    updatePaymentNotes();
    try{ $('#j-fname').value=''; $('#j-lname').value=''; $('#j-email').value=''; }catch(_){}
  }catch(e){
    console.error('[JOIN] Unexpected failure:', e);
    fail('Join failed (check Firebase rules and your network).');
  }
}

/* ---------- Pot Detail loader + registrations subscription ---------- */
async function onLoadPotClicked(){
  let id = ($('#v-pot')?.value || '').trim();
  if(!id){ id = $('#j-pot-select')?.value || ''; }
  if(!id){ alert('Select an active tournament or enter a Pot ID.'); return; }

  const snap = await db.collection('pots').doc(id).get();
  if(!snap.exists){ alert('Pot not found'); return; }

  const pot = { id:snap.id, ...snap.data() };
  CURRENT_DETAIL_POT = pot;

  if($('#v-pot')) $('#v-pot').value = pot.id;

  $('#pot-info').style.display='';
  $('#pi-name').textContent = pot.name||'';
  $('#pi-event').textContent = pot.event||'';
  $('#pi-skill').textContent = pot.skill||'';
  $('#pi-when').textContent = [pot.date||'', pot.time||''].filter(Boolean).join(' ');
  const endLocal = pot.end_at?.toDate?.();
  $('#pi-when-end').textContent = endLocal ? ('Ends: '+ endLocal.toLocaleTimeString([],{hour:'2-digit',minute:'2-digit'})) : '';
  $('#pi-location').textContent = pot.location||'';
  $('#pi-organizer').textContent = `Org: ${pot.organizer||''}`;
  $('#pi-status').textContent = `Status: ${pot.status||'open'}`;
  $('#pi-id').textContent = `ID: ${pot.id}`;

  subscribeDetailEntries(pot.id);
  if ($('#pot-edit-form')?.style.display === '') prefillEditForm(pot);
}

/* ---------- Registrations table ---------- */
function subscribeDetailEntries(potId){
  if(DETAIL_ENTRIES_UNSUB){ try{DETAIL_ENTRIES_UNSUB();}catch(_){} DETAIL_ENTRIES_UNSUB=null; }
  const tbody = document.querySelector('#adminTable tbody');
  if(!tbody){ return; }
  tbody.innerHTML = `<tr><td colspan="7" class="muted">Loading registrations…</td></tr>`;

  DETAIL_ENTRIES_UNSUB = db.collection('pots').doc(potId).collection('entries')
    .orderBy('created_at','asc')
    .onSnapshot(snap=>{
      LAST_DETAIL_ENTRIES = [];
      snap.forEach(doc=>{
        const d = doc.data();
        LAST_DETAIL_ENTRIES.push({ id: doc.id, ...d });
      });
      renderRegistrations(LAST_DETAIL_ENTRIES);
    }, err=>{
      console.error('registrations watch error', err);
      tbody.innerHTML = `<tr><td colspan="7" class="warn">Failed to load registrations.</td></tr>`;
    });
}

function renderRegistrations(entries){
  const tbody = document.querySelector('#adminTable tbody');
  if(!tbody) return;
  const showEmail = isSiteAdmin();
  const canAdmin  = isSiteAdmin();

  if(!entries || !entries.length){
    tbody.innerHTML = `<tr><td colspan="7" class="muted">No registrations yet.</td></tr>`;
    return;
  }

  const html = entries.map(e=>{
    const name = e.name || '—';
    const email = showEmail ? (e.email || '—') : '';
    const type = e.member_type || '—';
    const buyin = dollars(e.applied_buyin || 0);
    const paidChecked = e.paid ? 'checked' : '';
    const status = (e.status || 'active').toLowerCase();
    const next = status==='hold' ? 'active' : 'hold';
    const holdLabel = status==='hold' ? 'Resume' : 'Hold';

    const actions = canAdmin
      ? `
        <label style="display:inline-flex;align-items:center;gap:6px">
          <input type="checkbox" data-act="paid" data-id="${e.id}" ${paidChecked}/> Paid
        </label>
        <button class="btn" data-act="hold" data-id="${e.id}" data-next="${next}" style="margin-left:6px">${holdLabel}</button>
        <button class="btn" data-act="move" data-id="${e.id}" style="margin-left:6px">Move</button>
        <button class="btn" data-act="resend" data-id="${e.id}" style="margin-left:6px">Resend</button>
        <button class="btn" data-act="remove" data-id="${e.id}" style="margin-left:6px">Remove</button>
      `
      : '—';

    return `
      <tr>
        <td>${escapeHtml(name)}</td>
        <td>${escapeHtml(email)}</td>
        <td>${escapeHtml(type)}</td>
        <td>${buyin}</td>
        <td>${e.paid ? 'Yes' : 'No'}</td>
        <td>${escapeHtml(status)}</td>
        <td>${actions}</td>
      </tr>`;
  }).join('');

  tbody.innerHTML = html;
}

/* ---------- Admin utilities ---------- */
function requireAdmin(){
  const ok = isSiteAdmin() || isOrganizerOwnerWithSub();
  if(!ok){ alert('Admin/Organizer only. Use Admin Login or subscribe as Organizer.'); return false; }
  if(!CURRENT_DETAIL_POT){ alert('Load a pot first.'); return false; }
  return true;
}

function enterPotEditMode(){
  if(!requireAdmin()) return;
  fillSelect('f-name-select', NAME_OPTIONS);
  fillSelect('f-event', EVENTS);
  fillSelect('f-skill', SKILLS);
  fillSelect('f-location-select', LOCATIONS);
  prefillEditForm(CURRENT_DETAIL_POT);
  $('#pot-edit-form').style.display = '';
}

function prefillEditForm(pot){
  if(!pot) return;
  setSelectOrOther($('#f-name-select'), $('#f-name-other-wrap'), $('#f-name-other'), pot.name||'', NAME_OPTIONS);
  const orgSel = $('#f-organizer');
  if (orgSel){
    if (['Pickleball Compete','Other'].includes(pot.organizer)) {
      orgSel.value = pot.organizer;
      $('#wrap-organizer-other').style.display = (pot.organizer==='Other')? '' : 'none';
      if (pot.organizer==='Other') $('#f-organizer-other').value = '';
    } else {
      orgSel.value = 'Other';
      $('#wrap-organizer-other').style.display = '';
      $('#f-organizer-other').value = pot.organizer || '';
    }
  }
  setSelectOrOther($('#f-event'), $('#f-event-other-wrap'), $('#f-event-other'), pot.event||'', EVENTS);
  setSelectOrOther($('#f-skill'), $('#f-skill-other-wrap'), $('#f-skill-other'), pot.skill||'', SKILLS);
  $('#f-buyin-member').value = Number(pot.buyin_member||0);
  $('#f-buyin-guest').value  = Number(pot.buyin_guest||0);

  const pctVal = (typeof pot.pot_share_pct === 'number')
    ? pot.pot_share_pct
    : (typeof pot.potPercentage === 'number' ? pot.potPercentage : 100);
  const fPct = document.getElementById('f-pot-pct');
  if (fPct) fPct.value = pctVal;

  $('#f-date').value = pot.date || '';
  $('#f-time').value = pot.time || '';
  const endLocal = pot.end_at?.toDate?.();
  $('#f-end-time').value = endLocal ? endLocal.toTimeString().slice(0,5) : '';
  setSelectOrOther($('#f-location-select'), $('#f-location-other-wrap'), $('#f-location-other'), pot.location||'', LOCATIONS);

  const pm = getPaymentMethods(pot);
  $('#f-allow-stripe').value = pm.stripe ? 'yes' : 'no';
  $('#f-pay-zelle').value    = pot.pay_zelle || '';
  $('#f-pay-cashapp').value  = pot.pay_cashapp || '';
  $('#f-pay-onsite').value   = pm.onsite ? 'yes' : 'no';

  $('#f-status').value = pot.status || 'open';
}

async function savePotEdits(){
  if(!requireAdmin()) return;
  try{
    const ref = db.collection('pots').doc(CURRENT_DETAIL_POT.id);
    const name = getSelectValue($('#f-name-select'), $('#f-name-other')) || CURRENT_DETAIL_POT.name;
    const organizer = ($('#f-organizer').value==='Other') ? ($('#f-organizer-other').value.trim()||'Other') : $('#f-organizer').value;
    const event = getSelectValue($('#f-event'), $('#f-event-other')) || CURRENT_DETAIL_POT.event;
    const skill = getSelectValue($('#f-skill'), $('#f-skill-other')) || CURRENT_DETAIL_POT.skill;
    const buyin_member = Number($('#f-buyin-member').value || CURRENT_DETAIL_POT.buyin_member || 0);
    const buyin_guest  = Number($('#f-buyin-guest').value  || CURRENT_DETAIL_POT.buyin_guest  || 0);

    let pctRaw = Number(document.getElementById('f-pot-pct')?.value);
    if (!Number.isFinite(pctRaw)) {
      pctRaw = (CURRENT_DETAIL_POT.pot_share_pct ?? CURRENT_DETAIL_POT.potPercentage ?? 100);
    }
    const pot_share_pct = Math.max(0, Math.min(100, pctRaw));

    const date = $('#f-date').value || CURRENT_DETAIL_POT.date || '';
    const time = $('#f-time').value || CURRENT_DETAIL_POT.time || '';
    const endTime = $('#f-end-time').value || '';
    const location = getSelectValue($('#f-location-select'), $('#f-location-other')) || CURRENT_DETAIL_POT.location;

    let end_at = CURRENT_DETAIL_POT.end_at || null;
    if(date && (time || endTime)){
      const startLocal = time ? new Date(`${date}T${time}:00`) : (CURRENT_DETAIL_POT.start_at?.toDate?.() || null);
      if(endTime){
        let endLocal = new Date(`${date}T${endTime}:00`);
        if(startLocal && endLocal < startLocal){ endLocal = new Date(startLocal.getTime() + 2*60*60*1000); }
        end_at = firebase.firestore.Timestamp.fromDate(endLocal);
      }else{
        end_at = null;
      }
    }
    const status = $('#f-status').value || CURRENT_DETAIL_POT.status;

    const allowStripe = ($('#f-allow-stripe')?.value||'no') === 'yes';
    const zelleInfo   = $('#f-pay-zelle')?.value || '';
    const cashInfo    = $('#f-pay-cashapp')?.value || '';
    const onsiteYes   = ($('#f-pay-onsite')?.value||'yes') === 'yes';

    await ref.update({
      name, organizer, event, skill, buyin_member, buyin_guest,
      date, time, location, status, end_at, pot_share_pct,
      pay_zelle: zelleInfo,
      pay_cashapp: cashInfo,
      pay_onsite: onsiteYes,
      payment_methods: {
        stripe: allowStripe,
        zelle: !!zelleInfo,
        cashapp: !!cashInfo,
        onsite: onsiteYes
      }
    });
    $('#pot-edit-form').style.display = 'none';
    alert('Saved.');
    onLoadPotClicked();
  }catch(e){ console.error(e); alert('Failed to save changes.'); }
}

async function updatePotStatus(newStatus){
  if(!requireAdmin()) return;
  try{
    await db.collection('pots').doc(CURRENT_DETAIL_POT.id).update({ status: newStatus });
    alert(`Status updated to ${newStatus}.`);
    onLoadPotClicked();
  }catch(e){ console.error(e); alert('Failed to update status.'); }
}

async function deleteCurrentPot(){
  if(!requireAdmin()) return;
  const go = confirm('This deletes the pot document. Continue?');
  if(!go) return;
  try{
    await db.collection('pots').doc(CURRENT_DETAIL_POT.id).delete();
    alert('Pot deleted.');
    CURRENT_DETAIL_POT = null;
    $('#pot-info').style.display = 'none';
    if (db) attachActivePotsListener();
  }catch(e){ console.error(e); alert('Failed to delete pot.'); }
}

async function grantThisDeviceAdmin(){
  if(!requireAdmin()) return;
  try{
    const uid = firebase.auth().currentUser?.uid;
    if(!uid){ alert('No auth UID.'); return; }
    await db.collection('pots').doc(CURRENT_DETAIL_POT.id)
      .update({ adminUids: firebase.firestore.FieldValue.arrayUnion(uid) });
    alert('This device UID granted co-admin.');
  }catch(e){ console.error(e); alert('Failed to grant co-admin.'); }
}
async function revokeThisDeviceAdmin(){
  if(!requireAdmin()) return;
  try{
    const uid = firebase.auth().currentUser?.uid;
    if(!uid){ alert('No auth UID.'); return; }
    await db.collection('pots').doc(CURRENT_DETAIL_POT.id)
      .update({ adminUids: firebase.firestore.FieldValue.arrayRemove(uid) });
    alert('This device UID revoked.');
  }catch(e){ console.error(e); alert('Failed to revoke co-admin.'); }
}

/* ---------- Move & Resend (unchanged) ---------- */
function openMoveDialog(entryId){
  const currentId = CURRENT_DETAIL_POT?.id;
  const options = JOIN_POTS_CACHE
    .filter(p=>p.id!==currentId)
    .map(p=>`<option value="${p.id}">${escapeHtml([p.name,p.event,p.skill].filter(Boolean).join(' • '))}</option>`)
    .join('');
  const html = `
    <div id="move-overlay" style="position:fixed;inset:0;background:rgba(0,0,0,.35);display:flex;align-items:center;justify-content:center;z-index:9999">
      <div style="background:#fff;border:1px solid #e5e7eb;border-radius:12px;max-width:520px;width:92%;padding:16px">
        <h3 style="margin:0 0 10px">Move Registration</h3>
        <label style="display:block;margin:6px 0">Target tournament</label>
        <select id="move-target" style="width:100%;padding:10px;border:1px solid #e5e7eb;border-radius:10px">${options||'<option value="">No other open tournaments</option>'}</select>
        <div style="display:flex;gap:8px;justify-content:flex-end;margin-top:12px">
          <button id="move-cancel" class="btn">Cancel</button>
          <button id="move-confirm" class="btn primary">Move</button>
        </div>
      </div>
    </div>`;
  document.body.insertAdjacentHTML('beforeend', html);
  $('#move-cancel').onclick = ()=>{ $('#move-overlay')?.remove(); };
  $('#move-confirm').onclick = async ()=>{
    const toPotId = $('#move-target')?.value || '';
    if(!toPotId){ alert('Pick a target tournament.'); return; }
    await moveEntry(entryId, toPotId);
    $('#move-overlay')?.remove();
  };
}

async function moveEntry(entryId, toPotId){
  try{
    const fromPotId = CURRENT_DETAIL_POT.id;
    if(toPotId===fromPotId){ alert('Already in this tournament.'); return; }

    const entry = LAST_DETAIL_ENTRIES.find(e=>e.id===entryId);
    if(!entry){ alert('Entry not found.'); return; }

    const toRef = db.collection('pots').doc(toPotId).collection('entries');
    const emailLC = (entry.email||'').toLowerCase();
    const nameLC  = (entry.name||'').toLowerCase();
    const dupEmail = emailLC ? await toRef.where('email_lc','==', emailLC).limit(1).get() : { empty:true };
    const dupName  = nameLC  ? await toRef.where('name_lc','==', nameLC).limit(1).get()  : { empty:true };
    if(!dupEmail.empty || !dupName.empty){
      alert('Duplicate exists in the target tournament (same name or email).'); return;
    }

    const data = {...entry}; delete data.id;
    data.created_at = firebase.firestore.FieldValue.serverTimestamp();
    data.moved_from = fromPotId;
    data.moved_at   = firebase.firestore.FieldValue.serverTimestamp();

    await toRef.add(data);
    await db.collection('pots').doc(fromPotId).collection('entries').doc(entryId).delete();
    alert('Registration moved.');
  }catch(err){ console.error(err); alert('Failed to move registration.'); }
}

async function resendConfirmation(entryId){
  try{
    const entry = LAST_DETAIL_ENTRIES.find(e=>e.id===entryId);
    if(!entry){ alert('Entry not found.'); return; }
    if(!entry.email){ alert('No email on this registration.'); return; }
    const pot = CURRENT_DETAIL_POT;
    const subject = `Your registration for ${pot?.name||'PiCo Pickle Pot'}`;
    const text =
`Hi ${entry.name||'player'},

This is a confirmation for your registration in:
${pot?.name||''} • ${pot?.event||''} • ${pot?.skill||''}
Date/Time: ${[pot?.date||'', pot?.time||''].filter(Boolean).join(' ')}

Member Type: ${entry.member_type||'-'}
Buy-in: ${dollars(entry.applied_buyin||0)}
Paid: ${entry.paid ? 'Yes' : 'No'}

Thanks for playing!
PiCo Pickle Pot`;

    await db.collection('mail').add({
      to: [entry.email],
      message: { subject, text }
    });
    alert('Resend queued.');
  }catch(err){ console.error(err); alert('Failed to queue resend.'); }
}

/* ---------- Rotating Banners ---------- */
(function(){
  const ROTATE_MS = 20000;
  const FADE_MS = 1200;

  const TOP_BANNERS = [
    { src: 'top_728x90_1.png', url: 'https://pickleballcompete.com' },
    { src: 'top_728x90_2.png', url: 'https://pickleballcompete.com/my-teams/' },
    { src: 'sponsor_728x90.png', url: 'https://pickleballcompete.com' }
  ];
  const BOTTOM_BANNERS = [
    { src: '/bottom_300x250_1.png', url: '' },
    { src: '/bottom_300x250_2.png', url: '' },
    { src: '/sponsor_300x250.png', url: '' }
  ];

  function preload(banners){
    return Promise.all(
      banners.map(b => new Promise(resolve => {
        const img = new Image();
        img.onload = () => resolve(b);
        img.onerror = () => resolve(null);
        img.src = b.src;
      }))
    ).then(list => list.filter(Boolean));
  }

  function createImgEl(){
    const img = document.createElement('img');
    img.alt = 'Sponsor';
    img.style.maxWidth = '100%';
    img.style.height = 'auto';
    img.style.opacity = '0';
    img.style.transition = `opacity ${FADE_MS}ms ease-in-out`;
    return img;
  }

  function setupBanner(wrapperId, metaId){
    const wrap = document.getElementById(wrapperId);
    const meta = document.getElementById(metaId);
    if(!wrap) return null;
    wrap.style.display = '';
    if (meta) meta.style.display = '';

    const a = document.createElement('a');
    a.target = '_blank';
    a.rel = 'noopener';

    const img = createImgEl();
    a.appendChild(img);
    wrap.innerHTML = '';
    wrap.appendChild(a);

    return { img, link: a };
  }

  function startRotator(imgEl, linkEl, banners){
    if(!imgEl || !banners.length) return;
    let i = 0;
    const swap = () => {
      imgEl.style.opacity = '0';
      setTimeout(() => {
        const banner = banners[i % banners.length];
        imgEl.src = banner.src;
        if (banner.url) {
          linkEl.href = banner.url;
          linkEl.style.pointerEvents = 'auto';
          linkEl.style.cursor = 'pointer';
        } else {
          linkEl.href = '#';
          linkEl.style.pointerEvents = 'none';
          linkEl.style.cursor = 'default';
        }
        imgEl.style.opacity = '1';
        i++;
      }, FADE_MS);
    };
    swap();
    if (banners.length > 1) setInterval(swap, ROTATE_MS);
  }

  (async () => {
    const [topList, bottomList] = await Promise.all([preload(TOP_BANNERS), preload(BOTTOM_BANNERS)]);
    const top = setupBanner('ad-top', 'ad-top-meta');
    const bottom = setupBanner('ad-bottom', 'ad-bottom-meta');
    if (top) startRotator(top.img, top.link, topList);
    if (bottom) startRotator(bottom.img, bottom.link, bottomList);
  })();
})();

/* ---------- NEW: Stripe return success banner ---------- */
function checkStripeReturn(){
  const params = new URLSearchParams(location.search);
  const sessionId = params.get('session_id'); // present after successful Checkout
  const banner = $('#pay-banner');
  if (!banner) return;

  if (sessionId){
    // Show a friendly banner immediately
    banner.style.display = '';
    banner.textContent = 'Payment successful! Finalizing your registration… ✅';

    // Try to confirm against Firestore using saved IDs
    const potId = sessionStorage.getItem('potId');
    const entryId = sessionStorage.getItem('entryId');

    if (potId && entryId && db){
      // Live-listen for paid:true flip (webhook)
      db.collection('pots').doc(potId).collection('entries').doc(entryId)
        .onSnapshot(doc=>{
          const d = doc.data() || {};
          if (d.paid){
            const amt = (typeof d.paid_amount === 'number') ? (d.paid_amount/100) : (d.applied_buyin||0);
            banner.textContent = `Payment successful: ${dollars(amt)} received. Enjoy the event! 🎉`;
            // Auto-hide after a bit
            setTimeout(()=>{ try{ banner.style.display='none'; }catch{} }, 8000);
          } else {
            banner.textContent = 'Payment completed. Waiting for confirmation…';
          }
        }, _err=>{
          banner.textContent = 'Payment completed. (If status doesn’t update, refresh in a few seconds.)';
        });
    }

    // Clean the session_id from the URL for a nicer look
    if (history.replaceState){
      const cleanUrl = location.pathname + location.hash;
      history.replaceState(null, '', cleanUrl);
    }
  }
}

/* ---------- Auth (Sign In/Out) + subscription watcher ---------- */
try{
  document.getElementById('btn-signin')?.addEventListener('click', async ()=>{
    try{
      const provider = new firebase.auth.GoogleAuthProvider();
      await firebase.auth().signInWithPopup(provider);
    }catch(e){
      console.warn('Sign-in failed, trying anonymous.', e);
      try{ await firebase.auth().signInAnonymously(); }catch(_){}
    }
  });
  document.getElementById('btn-signout')?.addEventListener('click', async ()=>{
    await firebase.auth().signOut();
  });
}catch(e){ console.warn('Auth button init error', e); }

((window.firebase && firebase.auth) ? firebase.auth() : { onAuthStateChanged: function(){} }).onAuthStateChanged(async (user)=>{
  try{
    const isReal = !!(user && !user.isAnonymous);
    const name = isReal ? (user && (user.displayName || "Signed In")) : "";
    const authUser = document.getElementById('auth-user');
    const btnIn = document.getElementById('btn-signin');
    const btnOut = document.getElementById('btn-signout');
    if (isReal){
      if (authUser){ authUser.textContent = name; authUser.style.display = ''; }
      if (btnIn) btnIn.style.display = 'none';
      if (btnOut) btnOut.style.display = '';
    }else{
      if (authUser){ authUser.textContent = ''; authUser.style.display = 'none'; }
      if (btnIn) btnIn.style.display = '';
      if (btnOut) btnOut.style.display = 'none';
    }
  }catch(_){}

  await loadOrganizerSubStatus();
  refreshOrganizerUI();
  refreshAdminUI();
});

/* ---------- Organizer Subscription flow ---------- */
function originForReturn(){
  return window.location.protocol === 'file:' ? 'https://pickleballcompete.com' : window.location.origin;
}

async function onOrganizerSubscribe(){
  try{
    // Read selected plan -> explicit Stripe price_id
    const planSel = document.getElementById('org-plan');
    const plan = planSel ? planSel.value : 'individual_monthly';
    const price_id = (PRICE_MAP || {})[plan];
    if (!price_id){
      alert('Please choose a valid plan.'); 
      return;
    }

    // Optional: prefill email (work even when not signed-in)
    const user = (firebase && firebase.auth && firebase.auth().currentUser) ? firebase.auth().currentUser : null;
    let email = user?.email || '';
    if (!email){
      // Ask for an email so Stripe can send the receipt and we can later claim the sub
      email = prompt('Enter your email for the subscription (you can sign up with this email after payment):', '') || '';
      email = email.trim();
      if (!email){
        alert('Email is required to start a subscription.');
        return;
      }
    }

    // If you already have an active sub, short-circuit
    if (typeof hasOrganizerSub === 'function' && hasOrganizerSub()){
      const until = ORG_SUB?.until ? new Date(ORG_SUB.until).toLocaleDateString() : 'current period';
      alert('Your organizer subscription is already active.\nExpires: ' + until);
      return;
    }

    // Build payload for the backend
    const payload = {
      price_id,
      email,
      success_url: originForReturn() + '/?sub=success',
      cancel_url:  originForReturn() + '/?sub=cancel'
    };

    let res, data;
    try{
      res = await fetch(`${window.API_BASE}/create-organizer-subscription`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
    }catch(netErr){
      alert('Network error starting subscription. Please check your internet or backend.');
      return;
    }
    try{ data = await res.json(); }catch(_){ data = null; }
    if (!res.ok || !data?.url){
      alert(data?.error || 'Subscription server error.'); 
      return;
    }
    try{ window.location.href = data.url; }
    catch{ window.open(data.url, '_blank', 'noopener'); }
  }catch(e){
    console.error('[Sub] Failed to start organizer subscription', e);
    alert('Could not start subscription.');
  }
}

async function handleSubscriptionReturn(){
  try{
    const params = new URLSearchParams(window.location.search);
    const sub = params.get('sub');
    if(!sub) return;
    if(sub === 'success'){
      await loadOrganizerSubStatus();
      const banner = document.getElementById('pay-banner');
      if (banner){
        banner.textContent = 'Organizer subscription activated! You can now create & manage your Pots.';
        banner.style.display = '';
        setTimeout(()=>{ banner.style.display='none'; }, 6000);
      }
      refreshOrganizerUI();
    }else if(sub === 'cancel'){
      const banner = document.getElementById('pay-banner');
      if (banner){
        banner.classList.remove('success');
        banner.classList.add('alert');
        banner.textContent = 'Subscription not completed.';
        banner.style.display = '';
        setTimeout(()=>{ banner.style.display='none'; }, 4000);
      }
    }
    try{
      const url = new URL(window.location.href);
      url.searchParams.delete('sub');
      window.history.replaceState({}, '', url.toString());
    }catch(_){}
  }catch(e){ console.warn('[Sub] handleSubscriptionReturn error', e); }
}


/* ====== ORGANIZER VISIBILITY FIX (non-breaking) ====== */
(function(){
  const ACTIVE_STATUSES = ['active','trialing','past_due'];

  async function readOrganizerActive(uid, email){
    try{
      const emailLc = (email||'').toLowerCase();
      // 1) Preferred: organizer_subs/{uid}
      if (uid && typeof db!=='undefined'){
        try{
          const doc = await db.collection('organizer_subs').doc(uid).get();
          if (doc.exists) {
            const s = (doc.data()||{}).status;
            if (ACTIVE_STATUSES.includes(s)) return true;
          }
        }catch(_){}
      }
      // 2) Email-keyed (pre-claim): organizer_subs_emails/{email}
      if (emailLc && typeof db!=='undefined'){
        try{
          const doc = await db.collection('organizer_subs_emails').doc(emailLc).get();
          if (doc.exists) {
            const s = (doc.data()||{}).status;
            if (ACTIVE_STATUSES.includes(s)) return true;
          }
        }catch(_){}
      }
      // 3) Legacy collection: organizers/{uid}.active === true
      if (uid && typeof db!=='undefined'){
        try{
          const doc = await db.collection('organizers').doc(uid).get();
          if (doc.exists && (doc.data()||{}).active === true) return true;
        }catch(_){}
      }
    }catch(_){}
    return false;
  }

  async function ensureOrganizerFlag(){
    try{
      const u = (firebase.auth && firebase.auth().currentUser) ? firebase.auth().currentUser : null;
      const ok = u ? await readOrganizerActive(u.uid, u.email) : false;
      try{ window.organizerActive = !!ok; }catch(_){}
      // If your code has refreshCreateVisibility(), let it decide UI
      try{ if (typeof refreshCreateVisibility==='function') refreshCreateVisibility(); }catch(_){}
      // Hide subscribe button when active
      try{ if (typeof updateOrganizerSubscribeVisibility==='function') await updateOrganizerSubscribeVisibility(); }catch(_){}
    }catch(_){}
  }

  // Hook into auth state
  try{
    if (firebase && firebase.auth){
      ((window.firebase && firebase.auth) ? firebase.auth() : { onAuthStateChanged: function(){} }).onAuthStateChanged(async () => {
        await ensureOrganizerFlag();
      });
    }
  }catch(_){}

  // Also run on DOM ready (covers reload after return)
  document.addEventListener('DOMContentLoaded', () => {
    ensureOrganizerFlag();
  });

  // Expose for debugging
  window.__debugCheckOrganizer = ensureOrganizerFlag;
})();


// ===== Organizer UI Fix (drop-in addon; safe to append at end of app.js) =====
(function(){
  const ACTIVE = ['active','trialing','past_due'];

  // If API_BASE isn't defined in the page, set it here (adjust if yours differs)
  if (typeof API_BASE === 'undefined') {
    window.API_BASE = 'https://picklepot-stripe.onrender.com';
  }

  function $(s, el=document){ return el.querySelector(s); }

  function show(el, on){ if(el){ el.style.display = on ? '' : 'none'; } }
  function setText(el, txt){ if(el){ el.textContent = txt; el.style.display = ''; } }

  // Ensure Firebase auth persists across reloads
  try { firebase.auth().setPersistence(firebase.auth.Auth.Persistence.LOCAL); } catch(_){}

  async function getEmailActive(email){
    if (!email || !window.db) return false;
    try{
      const snap = await db.collection('organizer_subs_emails').doc(email.toLowerCase()).get();
      if (!snap.exists) return false;
      const s = (snap.data()||{}).status;
      return ACTIVE.includes(s);
    }catch(_){ return false; }
  }

  async function getUidActive(uid){
    if (!uid || !window.db) return false;
    try{
      const snap = await db.collection('organizer_subs').doc(uid).get();
      if (!snap.exists) return false;
      const s = (snap.data()||{}).status;
      return ACTIVE.includes(s);
    }catch(_){ return false; }
  }

  async function claim(uid, email){
    try{
      const res = await fetch(`${API_BASE}/activate-subscription-for-uid`, {
        method: 'POST',
        headers: {'Content-Type':'application/json'},
        body: JSON.stringify({ entry_id:(function(){try{const s=`${CURRENT_JOIN_POT?.id||''}|${($('#j-email')?.value||'').trim().toLowerCase()}|${($('#j-first')?.value||'').trim()}|${($('#j-last')?.value||'').trim()}|${($('#j-member-type')?.value||'Member')}`;return btoa(unescape(encodeURIComponent(s))).replace(/[^a-z0-9]/gi,'').slice(0,24);}catch(e){return null;}})(), idempotency_key:(crypto?.randomUUID?crypto.randomUUID():(Date.now().toString(36)+Math.random().toString(36).slice(2))),  uid, email })
      });
      return res.ok;
    }catch(_){ return false; }
  }

  async function refreshOrganizerUI(){
    const user = (firebase.auth && firebase.auth().currentUser) ? firebase.auth().currentUser : null;
    const email = user?.email || '';
    const uid   = user?.uid   || '';

    const createCard = document.getElementById('create-card');
    const subscribeBtn = document.getElementById('btn-subscribe-organizer') || document.getElementById('organizer-subscribe') || document.querySelector('[data-role="subscribe-organizer"]');
    const banner = document.getElementById('pay-banner');

    // Signed out: hide create, show subscribe
    if (!user){
      show(createCard, false);
      if (subscribeBtn) subscribeBtn.style.display='';
      return;
    }

    // Check active via uid
    const activeUid = await getUidActive(uid);

    if (activeUid){
      show(createCard, true);
      if (subscribeBtn) subscribeBtn.style.display='none';
      if (banner) banner.style.display='none';
      return;
    }

    // Not active yet — see if email has paid (pre-claim state)
    const emailActive = await getEmailActive(email);

    if (emailActive){
      // Try to claim automatically
      setText(banner, 'Finishing your subscription… one moment.');
      const ok = await claim(uid, email);
      if (ok){
        setText(banner, 'Subscription linked — you can create Pots now!');
      }else{
        setText(banner, 'Subscription found for this email. Click to claim.');
        // Add a quick claim button
        let btn = document.getElementById('btn-claim-sub');
        if (!btn){
          btn = document.createElement('button');
          btn.id = 'btn-claim-sub';
          btn.className = 'btn';
          btn.textContent = 'Claim subscription';
          banner?.insertAdjacentElement('afterend', btn);
          btn.addEventListener('click', async ()=>{
            btn.disabled = true; btn.textContent = 'Claiming…';
            const ok2 = await claim(uid, email);
            btn.disabled = false; btn.textContent = ok2 ? 'Claimed!' : 'Try again';
            await refreshOrganizerUI();
          });
        }
      }
      // After claim attempt, re-check uid status and update UI
      const nowActive = await getUidActive(uid);
      show(createCard, !!nowActive);
      if (subscribeBtn) subscribeBtn.style.display = nowActive ? 'none' : 'none'; // keep hidden if email paid
      return;
    }

    // No subscription yet
    show(createCard, false);
    if (subscribeBtn) subscribeBtn.style.display='';
  }

  // Run on load and on auth changes
  document.addEventListener('DOMContentLoaded', refreshOrganizerUI);
  try {
    ((window.firebase && firebase.auth) ? firebase.auth() : { onAuthStateChanged: function(){} }).onAuthStateChanged(refreshOrganizerUI);
  } catch(_){}

  // Expose for manual retry / debugging
  window.__refreshOrganizerUI = refreshOrganizerUI;
})();




/* ======================= Organizer & Auth Addon (non-breaking) =======================
   - Persists Firebase auth (LOCAL)
   - Subscription start with selected plan (PRICE_MAP)
   - Detects active sub via organizer_subs/{uid} or organizer_subs_emails/{email}
   - Claim button to attach email-keyed sub to uid
   - Shows Create-a-Pot when active; hides Subscribe strip
   This block APPENDS behavior; it does NOT modify existing code.
======================================================================================= */
(function(){
  const ACTIVE = ['active','trialing','past_due'];
  const API_BASE = (typeof window.API_BASE !== 'undefined' && window.API_BASE) ? window.API_BASE : 'https://picklepot-stripe.onrender.com';

// --- Warm the API (helps wake Render free dyno & avoid transient CORS/preflight hiccups)
async function warmApi() {
  const url = `${API_BASE}/health`;
  try {
    const ctrl = new AbortController();
    const tid = setTimeout(() => ctrl.abort(), 2500);
    const r = await fetch(url, { mode: 'cors', cache: 'no-store', signal: ctrl.signal });
    clearTimeout(tid);
    // don't block on result — if it's 200 great; if not we still try checkout
    // console.log('warmApi', r.status);
  } catch (e) {
    // swallow; this is only a best-effort warmup
    // console.debug('warmApi failed', e);
  }
}

  const $  = (s,el=document)=>el.querySelector(s);

  // 1) Ensure auth persistence
  try{ firebase.auth().setPersistence(firebase.auth.Auth.Persistence.LOCAL); }catch(_){}

  // 2) Helpers
  function show(el, on){ if(el){ el.style.display = on ? '' : 'none'; } }
  function setText(el, t){ if(el){ el.textContent = t; el.style.display=''; } }

  // 3) Detect subscription state
  async function hasActiveUid(uid){
    try{
      const snap = await firebase.firestore().collection('organizer_subs').doc(uid).get();
      if (!snap.exists) return false;
      const s = (snap.data()||{}).status||'';
      return ACTIVE.includes(String(s));
    }catch(_){ return false; }
  }
  async function hasActiveEmail(email){
    if (!email) return false;
    try{
      const snap = await firebase.firestore().collection('organizer_subs_emails').doc(email.toLowerCase()).get();
      if (!snap.exists) return false;
      const s = (snap.data()||{}).status||'';
      return ACTIVE.includes(String(s));
    }catch(_){ return false; }
  }

  // 4) Gate Create card & Subscribe strip
  async function gateUI(){
    const user = firebase.auth().currentUser;
    const createCard = document.getElementById('create-card');
    const subStrip   = document.getElementById('org-subscribe-strip');
    const subHint    = document.getElementById('org-subscribe-hint');

    if (!user){
      show(createCard, false);
      show(subStrip, true); show(subHint, true);
      return;
    }

    const byUid = await hasActiveUid(user.uid);
    if (byUid){
      show(createCard, true);
      show(subStrip, false); show(subHint, false);
      return;
    }

    const byEmail = await hasActiveEmail(user.email||'');
    if (byEmail){
      // Try auto-claim if we just returned from Stripe
      show(document.getElementById('claim-banner'), true);
      const claimEmailEl = document.getElementById('claim-email');
      if (claimEmailEl) claimEmailEl.textContent = user.email || '';
      return;
    }

    // No sub found
    show(createCard, false);
    show(subStrip, true); show(subHint, true);
  }

  // 5) Claim handler
  async function claimNow(){
    const user = firebase.auth().currentUser;
    if (!user || !user.email) return;
    const btn = document.getElementById('btn-claim');
    if (btn){ btn.disabled = true; btn.textContent = 'Claiming…'; }
    try{
      const res = await fetch(`${API_BASE}/activate-subscription-for-uid`, {
        method:'POST', headers:{'Content-Type':'application/json'},
        body: JSON.stringify({ uid: user.uid, email: user.email })
      });
      const data = await res.json().catch(()=>null);
      if (!res.ok) throw new Error((data&&data.error)||'Claim failed');

      // Success → hide claim, show create, hide subscribe
      const banner = document.getElementById('claim-banner');
      if (banner) banner.style.display = 'none';
      await gateUI();
      alert('Subscription linked. You can now create Pots.');
    }catch(e){
      alert(e.message||'Could not claim subscription.');
    }finally{
      if (btn){ btn.disabled = false; btn.textContent = 'Claim subscription'; }
    }
  }

  // 6) Start subscription (reads plan + PRICE_MAP)
  async function onOrganizerSubscribe2(){ // avoid name clash with earlier function
    const btn = document.getElementById('btn-subscribe-organizer');
    if (!btn) return;
    const planSel = document.getElementById('org-plan');
    const planKey = planSel ? planSel.value : 'individual_monthly';
    const price_id = (window.PRICE_MAP||{})[planKey];
    if (!price_id){ alert('Pick a plan.'); return; }

    const user = firebase.auth().currentUser;
    const origin = window.location.origin;
    const payload = {
      price_id,
      success_url: origin + '/?sub=success',
      cancel_url:  origin + '/?sub=cancel',
      email: user?.email || null
    };
    btn.disabled = true; btn.textContent = 'Redirecting…';
    try{
      const res = await fetch(`${API_BASE}/create-organizer-subscription`, {
        method:'POST', headers:{'Content-Type':'application/json'},
        body: JSON.stringify(payload)
      });
      const data = await res.json().catch(()=>null);
      if (!res.ok || !data?.url) throw new Error((data&&data.error)||'Service error');
      window.location.href = data.url;
    }catch(e){
      alert(e.message||'Could not start subscription.');
      btn.disabled = false; btn.textContent = 'Organizer Subscription';
    }
  }

  // 7) Stripe return banner
  function handleStripeReturn(){
    try{
      const url = new URL(window.location.href);
      if (url.searchParams.get('sub') === 'success'){
        const b = document.getElementById('pay-banner');
        if (b){ b.textContent = 'Payment received. Sign in (or create an account) to finish setup.'; b.style.display=''; }
        url.searchParams.delete('sub');
        history.replaceState({}, '', url.toString());
      }
    }catch(_){}
  }

  // 8) Bind once DOM is ready
  document.addEventListener('DOMContentLoaded', () => {
    // Add PRICE_MAP if missing
    if (!window.PRICE_MAP) {
      window.PRICE_MAP = {
        individual_monthly: 'price_1Rwq6nFFPAbZxH9HkmDxBJ73',
        individual_yearly:  'price_1RwptxFFPAbZxH9HdPLdYIZR',
        club_monthly:       'price_1Rwq1JFFPAbZxH9HmpYCSJYv',
        club_yearly:        'price_1RwpyUFFPAbZxH9H2N1Ykd4U'
      };
    }
    // Hook buttons if present
    const subBtn = document.getElementById('btn-subscribe-organizer');
    if (subBtn && !subBtn._bound){ subBtn.addEventListener('click', onOrganizerSubscribe2); subBtn._bound = true; }
    const claimBtn = document.getElementById('btn-claim');
    if (claimBtn && !claimBtn._bound){ claimBtn.addEventListener('click', claimNow); claimBtn._bound = true; }

    // Auth UI
    const inBtn = document.getElementById('btn-signin');
    if (inBtn && !inBtn._bound){
      inBtn.addEventListener('click', async ()=>{
        try{ await firebase.auth().signInWithPopup(new firebase.auth.GoogleAuthProvider()); }
        catch(_){}
      });
      inBtn._bound = true;
    }
    const outBtn = document.getElementById('btn-signout');
    if (outBtn && !outBtn._bound){
      outBtn.addEventListener('click', async ()=>{ try{ await firebase.auth().signOut(); }catch(_){} });
      outBtn._bound = true;
    }

    handleStripeReturn();
    gateUI();
  });

  // Update gate on auth state
  try{
    ((window.firebase && firebase.auth) ? firebase.auth() : { onAuthStateChanged: function(){} }).onAuthStateChanged(()=>{
      // reflect label
      const user = firebase.auth().currentUser;
      const label = document.getElementById('auth-user');
      if (label){
        if (user){ label.style.display=''; label.textContent = user.displayName || user.email || '(signed in)'; }
        else { label.style.display='none'; label.textContent=''; }
      }
      gateUI();
    });
  }catch(_){}

  // Expose for debugging
  window.__gateUI = gateUI;
})();


/* ===== scrub any "(signed in)" badges from UI (near Join a Pot etc.) ===== */
function scrubSignedInBadges(){
  try{
    const exact = Array.from(document.querySelectorAll('small,span,em,i,strong,b,div'));
    for (const el of exact){
      const t = (el.textContent||'').trim();
      if (/^\(?\s*signed\s*in\s*\)?$/i.test(t)) { el.remove(); }
    }
    const leafs = Array.from(document.querySelectorAll('*')).filter(n=>!n.children || n.children.length===0);
    for (const el of leafs){
      if (/\(signed\s*in\)/i.test(el.textContent||'')){
        el.textContent = (el.textContent||'').replace(/\s*\(signed\s*in\)\s*/ig, ' ').replace(/\s{2,}/g,' ').trim();
      }
    }
  }catch(_){}
}
document.addEventListener('DOMContentLoaded', scrubSignedInBadges);
// Also run after any auth state change or gating updates if those hooks exist
try{
  const _origGate = gateUI;
  if (typeof gateUI === 'function'){
    window.gateUI = async function(){ try{ await _origGate(); }catch(_){ } try{ scrubSignedInBadges(); }catch(_){ } }
  }
}catch(_){}



/* ===== TEMP: Disable Organizer Subscription button ===== */
document.addEventListener('DOMContentLoaded', ()=>{
  const btn = document.getElementById('btn-subscribe-organizer');
  if (!btn) return;
  // disable visually and functionally
  try{
    btn.disabled = true;
    btn.setAttribute('aria-disabled','true');
    btn.style.pointerEvents = 'none';   // prevents clicks
    btn.style.opacity = '0.6';
    btn.title = 'Organizer Subscription is temporarily disabled';
  }catch(_){}

  // Hard block: if any code re-enables it, keep it disabled
  const observer = new MutationObserver(()=>{
    try{
      if (!btn.disabled) btn.disabled = true;
      if (btn.style.pointerEvents !== 'none') btn.style.pointerEvents = 'none';
    }catch(_){}
  });
  try{ observer.observe(btn, { attributes: true, attributeFilter: ['disabled','style','class'] }); }catch(_){}
});



/* ===== Create A Pot CTA: open form for all users (keep editing admin-only) ===== */
function _showCreatePotForm(){
  const section = document.getElementById('create-card');
  if (!section) return;
  try{ section.classList.remove('admin-only'); }catch(_){}
  try{ section.style.display = ''; }catch(_){}
  try{ section.scrollIntoView({ behavior: 'smooth', block: 'start' }); }catch(_){}
}
document.addEventListener('DOMContentLoaded', () => {
  // Work with either an explicit id or the visible button text
  const explicit = document.getElementById('btn-start-create');
  if (explicit && !explicit.dataset._wired){
    explicit.dataset._wired = '1';
    explicit.addEventListener('click', _showCreatePotForm);
  }
  // Fallback: delegate on any button whose text is "Create A Pot"
  document.body.addEventListener('click', (e) => {
    const btn = e.target.closest('button');
    if (!btn) return;
    const label = (btn.textContent || '').trim();
    if (/^create\s+a\s+pot$/i.test(label)){
      e.preventDefault();
      _showCreatePotForm();
    }
  }, { capture: true });
});

/* === Admin-only Stripe visibility (kept) === */
function _isAdmin(){
  try { return typeof isSiteAdmin === 'function' && isSiteAdmin(); } catch(_) { return false; }
}
function hideStripeForNonAdmin(){
  const admin = _isAdmin();
  const pm = document.getElementById('j-paytype');
  if (pm){
    const opts = Array.from(pm.options || []);
    opts.forEach(opt => {
      const isStripe = /stripe/i.test(opt.textContent || '') || /stripe/i.test(opt.value || '');
      if (isStripe){
        opt.hidden = !admin;
        if (!admin && pm.value === opt.value) { pm.selectedIndex = 0; }
      }
    });
    const joinSection = pm.closest('.card') || document;
    Array.from(joinSection.querySelectorAll('div,span,small,li')).forEach(el => {
      if (/(^|\s)stripe(\s|$)/i.test((el.textContent||''))){
        if (!admin) el.style.display = 'none';
      }
    });
  }
  const allowStripe = document.getElementById('c-allow-stripe');
  if (allowStripe){
    if (!admin){
      try { allowStripe.value = 'no'; } catch(_){}
      try { const wrap = allowStripe.closest('div'); if (wrap) wrap.style.display = 'none'; } catch(_){}
    }else{
      try { const wrap = allowStripe.closest('div'); if (wrap) wrap.style.display = ''; } catch(_){}
    }
  }
}
document.addEventListener('DOMContentLoaded', hideStripeForNonAdmin);
try{ const _oldRefreshAdmin = refreshAdminUI; window.refreshAdminUI = function(){ try{ _oldRefreshAdmin(); }catch(_){ } try{ hideStripeForNonAdmin(); }catch(_){ } } }catch(_){}
try{ const _oldGate = gateUI; window.gateUI = async function(){ try{ await _oldGate(); }catch(_){ } try{ hideStripeForNonAdmin(); }catch(_){ } } }catch(_){}

// If create flow exists, force allowed_stripe false for non-admins before posting
(function(){
  try{
    const orig = window.startCreatePotCheckout;
    if (typeof orig === 'function'){
      window.startCreatePotCheckout = async function(){
        try{
          if (!_isAdmin()){
            const sel = document.getElementById('c-allow-stripe');
            if (sel){ try{ sel.value = 'no'; }catch(_){ } }
          }
        }catch(_){}
        return orig.apply(this, arguments);
      }
    }
  }catch(_){}
})();


/* === Admin-only Stripe visibility === */
function _isAdmin(){ try { return typeof isSiteAdmin === 'function' && isSiteAdmin(); } catch(_) { return false; } }
function hideStripeForNonAdmin(){
  const admin = _isAdmin();
  // Hide "Stripe" in Join payment select for non-admins
  const pmSel = document.getElementById('j-paytype');
  if (pmSel){
    const opts = Array.from(pmSel.options || []);
    opts.forEach(opt => {
      const isStripe = /(^|\b)stripe(\b|$)/i.test((opt.value||'')) || /stripe/i.test(opt.textContent||'');
      if (isStripe){
        opt.hidden = !admin;
        if (!admin && pmSel.value === opt.value) { pmSel.selectedIndex = 0; }
      }
    });
  }
  // Hide "Allow Stripe" on Create form for non-admins; force 'no'
  const allowSel = document.getElementById('c-allow-stripe');
  if (allowSel){
    if (!admin){
      try { allowSel.value = 'no'; }catch(_){}
      try { const wrap = allowSel.closest('div'); if (wrap) wrap.style.display = 'none'; } catch(_){}
    }else{
      try { const wrap = allowSel.closest('div'); if (wrap) wrap.style.display = ''; } catch(_){}
    }
  }
}
document.addEventListener('DOMContentLoaded', hideStripeForNonAdmin);
try{ const _oldRefreshAdmin = refreshAdminUI; window.refreshAdminUI = function(){ try{ _oldRefreshAdmin(); }catch(_){ } try{ hideStripeForNonAdmin(); }catch(_){ } } }catch(_){}


/* === Create Pot -> Stripe Checkout === */


/* removed duplicate startCreatePotCheckout */




/* === Ensure How To Use + Show Pot Details wiring (idempotent) === */
(function ensureUXButtons(){
  function wireHowTo(){
    var btn = document.getElementById('btn-howto');
    var panel = document.getElementById('howto-panel');
    if (!btn || !panel) return;
    if (btn.dataset._howto_wired === '1') return;
    btn.dataset._howto_wired = '1';
    btn.addEventListener('click', function(){
      var open = panel.style.display !== 'none';
      panel.style.display = open ? 'none' : '';
      btn.setAttribute('aria-expanded', String(!open));
    });
  }
  function wireShowDetail(){
    var btn = document.getElementById('btn-show-detail');
    var target = document.getElementById('pot-detail-section') || document.getElementById('pot-info');
    if (!btn || !target) return;
    if (btn.dataset._showdetail_wired === '1') return;
    btn.dataset._showdetail_wired = '1';
    btn.addEventListener('click', function(){
      try{
        var sel = document.getElementById('j-pot-select');
        var vpot = document.getElementById('v-pot');
        if (sel && vpot && sel.value) vpot.value = sel.value;
        if (typeof onLoadPotClicked === 'function') onLoadPotClicked();
      }catch(_){}
      try{ target.scrollIntoView({behavior:'smooth', block:'start'}); }
      catch(_){ location.hash = '#pot-detail-section'; }
    });
  }
  document.addEventListener('DOMContentLoaded', function(){
    try{ wireHowTo(); wireShowDetail(); }catch(_){}
  });
  // Also attempt late-binding in case DOM is injected later
  var _uxObs = new MutationObserver(function(){ try{ wireHowTo(); wireShowDetail(); }catch(_){}});
  _uxObs.observe(document.documentElement || document.body, {childList:true, subtree:true});
})();


/* ====================== CREATE-POT CHECKOUT DRAFT FIX (append-only) ======================
   - Rebinds #btn-create to Stripe Checkout via /create-pot-session
   - Stores draft_id in sessionStorage ("createDraftId")
   - On cancel.html?flow=create -> calls /cancel-pot-session to delete the draft
   - On success.html?flow=create -> clears draft marker; webhook creates pot
   - Leaves ALL other features unchanged
========================================================================================== */
(function(){
  function $id(id){ return document.getElementById(id); }
  function pick(selectEl, otherEl){
    if (!selectEl) return '';
    var v = selectEl.value || '';
    if (/^Other$/i.test(v) && otherEl) return (otherEl.value||'').trim();
    return v;
  }
  function isAdmin(){
    try{ return (typeof isSiteAdmin==='function') ? isSiteAdmin() : false; }catch(_){ return false; }
  }
  function originHost(){
    return (window.location.protocol === 'file:' ? 'https://pickleballcompete.com' : window.location.origin);
  }

  // Build a minimal draft from the existing Create form fields
  function collectCreateDraft(){
    try{
      var name      = pick($id('c-name-select'), $id('c-name-other')) || 'Tournament';
      var organizer = ($id('c-organizer') && $id('c-organizer').value==='Other')
                        ? (($id('c-org-other')?.value||'').trim() || 'Other')
                        : ($id('c-organizer')?.value || 'Pickleball Compete');
      var event     = pick($id('c-event'), $id('c-event-other'));
      var skill     = pick($id('c-skill'), $id('c-skill-other'));
      var location  = pick($id('c-location-select'), $id('c-location-other'));

      var buyin_member = Number($id('c-buyin-m')?.value || 0);
      var buyin_guest  = Number($id('c-buyin-g')?.value || 0);
      var pot_share_pct = Math.max(0, Math.min(100, Number($id('c-pot-pct')?.value || 100)));

      var date      = $id('c-date')?.value || '';
      var time      = $id('c-time')?.value || '';
      var end_time  = $id('c-end-time')?.value || '';

      var pay_zelle   = $id('c-pay-zelle')?.value || '';
      var pay_cashapp = $id('c-pay-cashapp')?.value || '';
      var pay_onsite  = (($id('c-pay-onsite')?.value || 'yes') === 'yes');

      // Admin-only toggle for Stripe payments on the pot itself (not the organizer checkout)
      var allow_stripe = isAdmin() ? (( $id('c-allow-stripe')?.value || 'no') === 'yes') : false;

      return {
        name, organizer, event, skill, location,
        buyin_member, buyin_guest, pot_share_pct,
        date, time, end_time,
        pay_zelle, pay_cashapp, pay_onsite,
        count: Math.max(1, parseInt(($id('c-count')?.value||'1'), 10) || 1),
        payment_methods: { stripe: allow_stripe, zelle: !!pay_zelle, cashapp: !!pay_cashapp, onsite: !!pay_onsite }
      };
    }catch(e){
      console.warn('[CreateDraft] failed to read fields', e);
      return null;
    }
  }

  
/* removed duplicate startCreatePotCheckout */


  // Ensure #btn-create uses ONLY checkout (replace any old listeners)
  function rebindCreateToCheckout(){
    var b = $id('btn-create');
    if (!b || b.dataset._create_checkout_wired === '1') return;
    var clone = b.cloneNode(true);
    clone.dataset._create_checkout_wired = '1';
    b.parentNode.replaceChild(clone, b);
    clone.addEventListener('click', function(e){ e.preventDefault(); e.stopPropagation(); startCreatePotCheckout(); });
  }

  // Handle returns specifically for Create-Pot flow
  async function handleCreateCheckoutReturn(){
    try{
      var params = new URLSearchParams(location.search);
      var flow = params.get('flow');
      if (flow !== 'create') return; // not our flow

      var onCancel = /cancel\.html$/i.test(location.pathname);
      var onSuccess = /success\.html$/i.test(location.pathname);
      var draftId = null;
      try{ draftId = sessionStorage.getItem('createDraftId'); }catch(_){}

      if (onCancel){
        // Best-effort: tell backend to discard draft; then clear marker
        try{
          var payload = { draft_id: draftId, session_id: params.get('session_id') || null };
          await fetch(String(window.API_BASE).replace(/\/+$/,'') + '/cancel-pot-session', {
            method:'POST',
            headers:{'Content-Type':'application/json'},
            body: JSON.stringify(payload)
          });
        }catch(e){ console.warn('[CreatePot Cancel] notify failed', e); }
        try{ sessionStorage.removeItem('createDraftId'); }catch(_){}
        try{ sessionStorage.removeItem('createFlow'); }catch(_){}
        // Optionally show a gentle note if there's a banner element
        var banner = document.getElementById('pay-banner');
        if (banner){ banner.style.display=''; banner.textContent='Checkout canceled. Draft removed.'; }
        // Clean query
        if (history.replaceState){
          var clean = location.pathname + location.hash;
          history.replaceState(null, '', clean);
        }
        return;
      }

      if (onSuccess){
        // Do NOT create pot on client; webhook will apply draft
        try{ sessionStorage.removeItem('createDraftId'); }catch(_){}
        try{ sessionStorage.removeItem('createFlow'); }catch(_){}
        // Optional banner
        var banner2 = document.getElementById('pay-banner');
        if (banner2){
          banner2.style.display='';
          banner2.textContent='Payment successful! Finalizing your tournament…';
          setTimeout(()=>{ try{ banner2.style.display='none'; }catch(_){ } }, 8000);
        }
        // Clean query
        if (history.replaceState){
          var clean2 = location.pathname + location.hash;
          history.replaceState(null, '', clean2);
        }
        return;
      }
    }catch(e){ console.warn('[Create Checkout Return] error', e); }
  }

  document.addEventListener('DOMContentLoaded', function(){
    // Rebind after other scripts run, to override any createPot binding
    try{ rebindCreateToCheckout(); setTimeout(rebindCreateToCheckout, 0); setTimeout(rebindCreateToCheckout, 300); }catch(_){}
    handleCreateCheckoutReturn();
  });

  try{
    // If DOM is replaced, keep our binding intact
    new MutationObserver(function(){ rebindCreateToCheckout(); }).observe(document.documentElement||document.body, {childList:true, subtree:true});
  }catch(_){}
})();


// Ensure Create button triggers Stripe checkout (idempotent binding)
document.addEventListener('DOMContentLoaded', function(){
  var btn = document.getElementById('btn-create');
  if (btn && !btn.__stripeBound){
    btn.addEventListener('click', function(e){ e.preventDefault(); startCreatePotCheckout(); });
    btn.__stripeBound = true;
  }
});

function fillStateAndCity(){
  const stSel = document.getElementById('c-addr-state');
  if (stSel && stSel.options.length === 0){
    stSel.innerHTML = ['<option value="">-- Select State --</option>']
      .concat(US_STATES.map(s => `<option value="${s.code}">${s.code} - ${s.name}</option>`))
      .join('');
  }
  function populateCity(){
    const citySel = document.getElementById('c-addr-city');
    const otherWrap = document.getElementById('c-addr-city-other-wrap');
    if (!citySel) return;
    const code = stSel ? (stSel.value || '').toUpperCase() : '';
    const cities = STATE_CITIES[code] || ['Other'];
    citySel.innerHTML = cities.map(c => `<option>${c}</option>`).join('');
    if (typeof toggleOther === 'function') toggleOther(citySel, otherWrap);
  }
  if (stSel){
    stSel.addEventListener('change', populateCity);
    populateCity();
  }
  const citySel = document.getElementById('c-addr-city');
  if (citySel){
    citySel.addEventListener('change', ()=>{
      const otherWrap = document.getElementById('c-addr-city-other-wrap');
      if (typeof toggleOther === 'function') toggleOther(citySel, otherWrap);
    });
  }
}
function toggleAddressForLocation(){
  var sel = document.getElementById('c-location-select');
  var block = document.getElementById('c-address-block');
  if (!sel || !block) return;
  var show = (sel.value === 'Other');
  block.style.display = show ? '' : 'none';
}

function onCreateClick(e){
  try{
    e && e.preventDefault && e.preventDefault();
    if (typeof isSiteAdmin === 'function' && isSiteAdmin()){
      return createPotDirect();
    } else {
      return startCreatePotCheckout();
    }
  }catch(err){ console.error('Create click failed', err); }
}



async function createPotDirect(){
  try{
    if(!db){ alert('Firebase is not initialized.'); return; }
    const uid = (window.firebase && firebase.auth && firebase.auth().currentUser) ? firebase.auth().currentUser.uid : null;
    // Admin bypass allows no auth uid, but we will still store null ownerUid if absent
    const name = getSelectValue($('#c-name-select'), $('#c-name-other')) || 'Sunday Round Robin';
    const organizer = ($('#c-organizer') && $('#c-organizer').value==='Other') ? ($('#c-org-other')?.value?.trim()||'Other') : 'Pickleball Compete';
    const orgEmail = ($('#c-organizer') && $('#c-organizer').value==='Other') ? ($('#c-org-email')?.value?.trim()||'') : '';
    if(($('#c-organizer') && $('#c-organizer').value==='Other') && !orgEmail){
      alert('Please enter Organizer Email so registrants can reach the organizer.'); return;
    }
    const event = getSelectValue($('#c-event'), $('#c-event-other'));
    const skill = getSelectValue($('#c-skill'), $('#c-skill-other'));
    const locSel = $('#c-location-select');
    const location = (locSel && locSel.value === 'Other') ? '' : (locSel ? locSel.value : '');
    const buyin_member = Number($('#c-buyin-m')?.value || 0);
    const buyin_guest  = Number($('#c-buyin-g')?.value || 0);
    const date = $('#c-date')?.value || '';
    const time = $('#c-time')?.value || '';
    const endTime = $('#c-end-time')?.value || '';

    const allowStripe = ($('#c-allow-stripe')?.value||'no') === 'yes';
    const zelleInfo   = $('#c-pay-zelle')?.value || '';
    const cashInfo    = $('#c-pay-cashapp')?.value || '';
    const onsiteYes   = ($('#c-pay-onsite')?.value||'yes') === 'yes';

    let pctRaw = Number(document.getElementById('c-pot-pct')?.value);
    if (!Number.isFinite(pctRaw)) pctRaw = 100;
    const pot_share_pct = Math.max(0, Math.min(100, pctRaw));

    // Build date/times
    let start_at = null, end_at = null;
    if(date && (time || endTime)){
      if (time) start_at = firebase.firestore.Timestamp.fromDate(new Date(`${date}T${time}:00`));
      if (endTime){
        let endLocal = new Date(`${date}T${endTime}:00`);
        if (time){ const startLocal = new Date(`${date}T${time}:00`); if (endLocal < startLocal) endLocal = new Date(startLocal.getTime() + 2*60*60*1000); }
        end_at = firebase.firestore.Timestamp.fromDate(endLocal);
      }
    }

    // Compose address if "Other" location
    const addr_line1 = ($('#c-addr-line1')?.value||'').trim();
    const addr_state = ($('#c-addr-state')?.value||'').trim();
    const citySel = $('#c-addr-city');
    const addr_city = citySel ? (citySel.value==='Other' ? ($('#c-addr-city-other')?.value||'').trim() : citySel.value) : '';
    const addr_zip  = ($('#c-addr-zip')?.value||'').trim();
    const fullLocation = location || [addr_line1, [addr_city, addr_state].filter(Boolean).join(', '), addr_zip].filter(Boolean).join(' ');

    const pot = {
      name, organizer, event, skill,
      buyin_member, buyin_guest,
      date, time, location: fullLocation,
      status:'open',
      ownerUid: uid || null,
      adminUids: uid ? [uid] : [],
      pay_zelle: zelleInfo,
      pay_cashapp: cashInfo,
      pay_onsite: onsiteYes,
      payment_methods: { stripe: allowStripe, zelle: !!zelleInfo, cashapp: !!cashInfo, onsite: onsiteYes },
      pot_share_pct,
      start_at, end_at,
      org_email: orgEmail
    };

    const ref = await db.collection('pots').add(pot);
    const resultEl = document.getElementById('create-result');
    if (resultEl) resultEl.textContent = `Created (ID: ${ref.id}).`;
    alert('Pot created.');
    // optional: auto-load details
    if (document.getElementById('v-pot')){
      document.getElementById('v-pot').value = ref.id;
      if (typeof onLoadPotClicked === 'function') onLoadPotClicked();
    }
  }catch(e){
    console.error('[CreateDirect] Failed:', e);
    alert('Failed to create pot.');
  }
}



/* Collapse Create-a-Pot section (arrows) */
document.addEventListener('DOMContentLoaded', () => {
  const btn = document.getElementById('btn-create-collapse');
  if (btn && !btn.__bound){
    btn.addEventListener('click', () => {
      const sec = document.getElementById('create-card');
      if (sec) sec.style.display = 'none';
      const cta = document.getElementById('btn-start-create') || document.getElementById('btn-create');
      try{ cta?.scrollIntoView({behavior:'smooth', block:'center'}); }catch(_){}
    });
    btn.__bound = true;
  }
});

/* =================== Global UI Init & Wiring (All-Fix v2) =================== */
(function(){
  const $ = (s,el=document)=>el.querySelector(s);
  const byId = id => document.getElementById(id);
  const originHost = () => (location.protocol==='file:' ? 'https://pickleballcompete.com' : location.origin);
  const toCents = v => Math.round(Number(v||0)*100);

  function ensureOptions(id, values){
    const el = byId(id);
    if(!el) return;
    const hasOptions = el.options && el.options.length>0;
    if (!hasOptions){
      el.innerHTML = values.map(v=>`<option>${v}</option>`).join('');
    }
  }
  function toggleOther(selectId, wrapId){
    const sel = byId(selectId), wrap = byId(wrapId);
    if(!sel || !wrap) return;
    const set = ()=>{ wrap.style.display = (/^other$/i.test(sel.value||'') ? '' : 'none'); };
    sel.addEventListener('change', set); set();
  }

  function populateCreate(){
    ensureOptions('c-name-select', ['Pickleball Compete Open','Club Night','Saturday Smash','Other']);
    ensureOptions('c-event', ['Singles','Doubles','Mixed Doubles','Round Robin','Other']);
    ensureOptions('c-skill', ['Beginner','Intermediate','Advanced','Any','Other']);
    ensureOptions('c-location-select', ['Clubhouse Court','Rec Center','Community Park','Other']);
    if (byId('c-pot-pct') && !byId('c-pot-pct').value) byId('c-pot-pct').value = 100;
    if (byId('c-count') && !byId('c-count').value) byId('c-count').value = 1;
    try{
      const today = new Date(), d = today.toISOString().slice(0,10);
      if (byId('c-date') && !byId('c-date').value) byId('c-date').value = d;
      if (byId('c-time') && !byId('c-time').value) byId('c-time').value = (today.toTimeString().slice(0,5));
    }catch(_){}
    toggleOther('c-name-select','c-name-other-wrap');
    toggleOther('c-event','c-event-other-wrap');
    toggleOther('c-skill','c-skill-other-wrap');
    toggleOther('c-organizer','c-org-other-wrap');
  }

  function collectCreateDraft(){
    const val = id => (byId(id)?.value || '').trim();
    const pickOther = (sel,other)=>{
      const s = byId(sel), o = byId(other);
      if (s && /^other$/i.test(s.value||'') && o) return (o.value||'').trim();
      return val(sel);
    };
    const name = pickOther('c-name-select','c-name-other') || val('c-name') || 'Tournament';
    const organizer = pickOther('c-organizer','c-org-other') || 'Pickleball Compete';
    const event = pickOther('c-event','c-event-other');
    const skill = pickOther('c-skill','c-skill-other') || 'Any';
    const location = pickOther('c-location-select','c-location-other');
    const draft = {
      name, organizer, event, skill, location,
      buyin_member: Number(val('c-buyin-m') || val('c-buyin-member') || 0),
      buyin_guest:  Number(val('c-buyin-g') || val('c-buyin-guest') || 0),
      pot_share_pct: Number(byId('c-pot-pct')?.value ?? 100),
      date: val('c-date'), time: val('c-time'), end_time: val('c-end-time'),
      pay_zelle: val('c-pay-zelle'), pay_cashapp: val('c-pay-cashapp'),
      payment_methods: {
        stripe: (byId('c-allow-stripe')?.value || 'yes') === 'yes',
        zelle: !!val('c-pay-zelle'),
        cashapp: !!val('c-pay-cashapp'),
        onsite: (val('c-pay-onsite') || 'Allowed').toLowerCase() !== 'not allowed'
      },
      status: 'open'
    };
    return draft;
  }
  if (typeof window.collectCreateDraft !== 'function') window.collectCreateDraft = collectCreateDraft;

  async function startCreatePotCheckout(){
    const btn = byId('btn-create');
    const msg = byId('create-msg') || byId('create-result');
    const setBusy=(on,t)=>{ if(btn){ btn.disabled=!!on; if(t) btn.textContent=t; } };
    const show=(t)=>{ if(msg){ msg.textContent=t; msg.style.display=''; } };

    try{
      const count = Math.max(1, parseInt(byId('c-count')?.value || '1', 10));
      const payload = {
        draft: collectCreateDraft(),
        count,
        success_url: originHost() + '/success.html?flow=join',
cancel_url: originHost() + '/cancel.html?flow=create',

      };
      setBusy(true, 'Redirecting…');
      const r = await fetch((window.API_BASE||'') + '/create-pot-session', {
        method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify(payload)
      });
      const data = await r.json().catch(()=>null);
      if (!r.ok || !data?.url) throw new Error((data && (data.error||data.message)) || ('Payment server error ('+r.status+')'));
      location.href = data.url;
    }catch(e){
      console.error('[CREATE]', e);
      show(e.message||String(e));
    }finally{ setBusy(false, 'Create Pot'); }
  }
  if (typeof window.startCreatePotCheckout !== 'function') window.startCreatePotCheckout = startCreatePotCheckout;

  async function startJoinCheckout(){
    const potId = byId('v-pot')?.value?.trim() || '';
    const amountDollars = byId('j-cost')?.value || byId('j-amount')?.value || '10';
    const playerName = byId('j-name')?.value || byId('j-player')?.value || 'Player';
    const playerEmail= byId('j-email')?.value || '';
    const entryId = 'e_' + Date.now().toString(36) + Math.random().toString(36).slice(2,7);

    if (!potId){ alert('Enter a Pot ID first.'); return; }

    const payload = {
      pot_id: potId,
      entry_id: entryId,
      amount_cents: toCents(amountDollars),
      player_name: playerName,
      player_email: playerEmail,
     success_url: originHost() + '/success.html?flow=join',
  cancel_url: originHost() + '/cancel.html?flow=create'

    };
    try{
      const r = await fetch((window.API_BASE||'') + '/create-checkout-session', {
        method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify(payload)
      });
      const data = await r.json().catch(()=>null);
      if(!r.ok || !data?.url) throw new Error((data && (data.error||data.message)) || ('Payment server error ('+r.status+')'));
      location.href = data.url;
    }catch(e){
      console.error('[JOIN]', e);
      alert('Join failed: ' + (e.message || e));
    }
  }
  if (typeof window.startJoinCheckout !== 'function') window.startJoinCheckout = startJoinCheckout;

  function wire(id, fn){
    const el = byId(id);
    if (el && !el.dataset.wired){
      el.dataset.wired='1';
      el.addEventListener('click', function(ev){ ev.preventDefault(); ev.stopPropagation(); fn.call(el, ev); });
    }
  }

  function showCreateCard(){ const c = byId('create-card'); if(c){ c.style.display=''; c.scrollIntoView({behavior:'smooth', block:'start'});} }
  function hideCreateCard(){ const c = byId('create-card'); if(c){ c.style.display='none'; window.scrollTo({top:0, behavior:'smooth'});} }

  function loadPotFromInput(){
    const potId = (byId('v-pot')?.value||'').trim();
    const out = byId('pot-load-msg') || byId('join-msg');
    if (!potId){ if(out) out.textContent='Enter a Pot ID.'; return; }
    window.CURRENT_POT_ID = potId;
    if(out){ out.textContent = 'Loaded Pot ' + potId + '. You can now Join.'; out.style.display=''; }
    const detail = byId('pot-detail-section'); if (detail) detail.style.display='';
  }

  function adminLogin(){
    const p = prompt('Admin password:');
    if (p === 'Jesus7'){ localStorage.setItem('site_admin','1'); alert('Admin enabled'); document.location.reload(); }
    else if (p!=null){ alert('Wrong password'); }
  }
  function adminLogout(){ localStorage.removeItem('site_admin'); alert('Admin disabled'); document.location.reload(); }

  function notImplemented(msg){ return ()=>alert(msg || 'Coming soon'); }

  function bindAll(){
    wire('btn-start-create', showCreateCard);
    wire('btn-create-collapse', hideCreateCard);
    wire('btn-create', startCreatePotCheckout);
    wire('btn-load', loadPotFromInput);
    wire('btn-join', joinPot);
    wire('btn-refresh', ()=>location.reload());
    wire('btn-show-details', ()=>{ const s=byId('pot-detail-section'); if(s){ s.style.display=''; s.scrollIntoView({behavior:'smooth'})}});
    wire('btn-admin-login', adminLogin);
    wire('btn-claim', notImplemented('Claim subscription coming soon.'));
    wire('btn-edit', ()=>{ const f=byId('pot-edit-form'); if(f) f.style.display=''; });
    wire('btn-cancel-edit', ()=>{ const f=byId('pot-edit-form'); if(f) f.style.display='none'; });
    wire('btn-save-pot', notImplemented('Saving edits requires API endpoint.'));
    wire('btn-hold', notImplemented('Hold requires backend endpoint.'));
    wire('btn-resume', notImplemented('Resume requires backend endpoint.'));
    wire('btn-delete', notImplemented('Delete requires backend endpoint.'));
    wire('btn-admin-grant', notImplemented('Grant co-admin requires backend endpoint.'));
    wire('btn-admin-revoke', notImplemented('Revoke co-admin requires backend endpoint.'));
    const signIn = byId('btn-signin'), signOut = byId('btn-signout');
    if(signIn && !signIn.dataset.wired){ signIn.dataset.wired='1'; signIn.addEventListener('click', adminLogin); }
    if(signOut && !signOut.dataset.wired){ signOut.dataset.wired='1'; signOut.addEventListener('click', adminLogout); }
  }

  document.addEventListener('DOMContentLoaded', ()=>{
    populateCreate();
    bindAll();
    if (typeof checkStripeReturn==='function') try{ checkStripeReturn(); }catch(_){}
  });

  document.addEventListener('click', function(e){
    const el = e.target.closest('button, [role="button"], a.btn');
    if (!el || el.dataset.wired) return;
    const id = el.id || '';
    const map = {
      'btn-start-create': showCreateCard,
      'btn-create-collapse': hideCreateCard,
      'btn-create': startCreatePotCheckout,
      'btn-load': loadPotFromInput,
      'btn-join': startJoinCheckout,
      'btn-refresh': ()=>location.reload(),
      'btn-show-details': ()=>{ const s=byId('pot-detail-section'); if(s){ s.style.display=''; s.scrollIntoView({behavior:'smooth'})}},
      'btn-admin-login': adminLogin,
      'btn-claim': notImplemented('Claim subscription coming soon.'),
      'btn-edit': ()=>{ const f=byId('pot-edit-form'); if(f) f.style.display=''; },
      'btn-cancel-edit': ()=>{ const f=byId('pot-edit-form'); if(f) f.style.display='none'; },
      'btn-save-pot': notImplemented('Saving edits requires API endpoint.'),
      'btn-hold': notImplemented('Hold requires backend endpoint.'),
      'btn-resume': notImplemented('Resume requires backend endpoint.'),
      'btn-delete': notImplemented('Delete requires backend endpoint.'),
      'btn-admin-grant': notImplemented('Grant co-admin requires backend endpoint.'),
      'btn-admin-revoke': notImplemented('Revoke co-admin requires backend endpoint.'),
    };
    const fn = map[id];
    if (fn){
      e.preventDefault(); e.stopPropagation();
      fn.call(el, e);
    }
  }, true);
})();


/* ===== Manage page helpers: auto-resolve pot by owner code ===== */
async function resolvePotByOwnerCode(ownerCode) {
  try {
    if (!ownerCode || ownerCode.trim().length < 4) return null;
    const res = await fetch(API_BASE + '/owner/resolve', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ owner_code: ownerCode.trim() })
    });
    if (!res.ok) return null;
    return await res.json(); // {pot_id, owner_link}
  } catch (e) { console.error('[MANAGE] resolve error', e); return null; }
}

function initManageAutoFill() {
  const potInput = document.querySelector('input[name="pot-id"], #pot-id, input[placeholder^="pot_"]');
  const codeInput = document.querySelector('input[name="owner-code"], #owner-code, input[placeholder*="code"], input[placeholder*="Code"]');
  if (!potInput || !codeInput) return;

  // from URL ?pot= & key= or ?owner=CODE
  const qs = new URLSearchParams(location.search);
  const pot = qs.get('pot');
  if (pot) potInput.value = pot;

  // When they type the owner code, auto-resolve pot id
  codeInput.addEventListener('change', async () => {
    const info = await resolvePotByOwnerCode(codeInput.value);
    if (info && info.pot_id) {
      potInput.value = info.pot_id;
      console.log('[MANAGE] Resolved pot', info.pot_id);
    }
  });
}

// Run on manage.html
if (location.pathname.endsWith('/manage.html') || location.pathname.endsWith('manage.html')) {
  document.addEventListener('DOMContentLoaded', initManageAutoFill);
}


// --- Simple show/hide for Create/Join cards ---
document.addEventListener('DOMContentLoaded', function(){
  var createCard = document.getElementById('create-card');
  var joinCard   = document.getElementById('join-card');
  var btnStartCreate = document.getElementById('btn-start-create');
  var btnStartJoin   = document.getElementById('btn-start-join');
  var btnCreateCollapse = document.getElementById('btn-create-collapse');
  var btnJoinCollapse   = document.getElementById('btn-join-collapse');

  function show(el){ if(el){ el.style.display=''; el.scrollIntoView({behavior:'smooth', block:'start'});} }
  function hide(el){ if(el){ el.style.display='none'; } }

  if (btnStartCreate && createCard){
    btnStartCreate.addEventListener('click', function(){ show(createCard); hide(joinCard); });
  }
  if (btnCreateCollapse && createCard){
    btnCreateCollapse.addEventListener('click', function(){ hide(createCard); window.scrollTo({top:0, behavior:'smooth'}); });
  }
  if (btnStartJoin && joinCard){
    btnStartJoin.addEventListener('click', function(){ show(joinCard); hide(createCard); });
  }
  if (btnJoinCollapse && joinCard){
    btnJoinCollapse.addEventListener('click', function(){ hide(joinCard); window.scrollTo({top:0, behavior:'smooth'}); });
  }

  // Safety: wire Create Pot button to actual checkout function
  var btnCreate = document.getElementById('btn-create');
  if (btnCreate){
    if (!btnCreate.__bound){
      btnCreate.addEventListener('click', function(ev){
        // allow existing handlers, but provide a fallback if none are bound
        try{
          if (typeof startCreatePotCheckout === 'function') return startCreatePotCheckout();
          if (typeof onCreateClick === 'function') return onCreateClick();
        }catch(e){ console.error('Create Pot click error:', e); }
      });
      btnCreate.__bound = true;
    }
  }
});

