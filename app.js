/* PiCo Pickle Pot — working app with Start/End time + configura...ripe join + per-event payment method toggles + SUCCESS BANNER */

const SITE_ADMIN_PASS = 'Jesus7';
function isSiteAdmin(){ return localStorage.getItem('site_admin') === '1'; }
function setSiteAdmin(on){ on?localStorage.setItem('site_admin','1'):localStorage.removeItem('site_admin'); }

const $  = (s,el=document)=>el.querySelector(s);
const $$ = (s,el=document)=>[...el.querySelectorAll(s)];
const dollars = n => '$' + Number(n||0).toFixed(2);

// === Stripe backend base (Render Flask app) ===
const API_BASE = "https://picklepot-stripe.onrender.com";

/* ---------- Admin UI (wire to your actual buttons) ---------- */
function refreshAdminUI(){
  const on     = isSiteAdmin();
  const toggle = document.getElementById('site-admin-toggle');
  const logout = document.getElementById('site-admin-logout');
  const status = document.getElementById('site-admin-status');

  if (toggle) toggle.style.display = on ? 'none' : '';
  if (logout) logout.style.display = on ? '' : 'none';
  if (status) status.textContent   = on ? 'Admin mode ON' : '';

  // Show/hide any elements marked admin-only
  document.querySelectorAll('.admin-only').forEach(el=>{
    el.style.display = on ? '' : 'none';
  });

  // Wire once
  if (!refreshAdminUI._wired){
    toggle?.addEventListener('click', ()=>{
      const pass = prompt('Admin Password:');
      if (pass === SITE_ADMIN_PASS){ setSiteAdmin(true);  refreshAdminUI(); }
      else { alert('Incorrect admin password.'); }
    });
    logout?.addEventListener('click', ()=>{ setSiteAdmin(false); refreshAdminUI(); });
    refreshAdminUI._wired = true;
  }
}
document.addEventListener('DOMContentLoaded', refreshAdminUI);


/* ---------- Options ---------- */
const NAME_OPTIONS = [
  'Pickle Pot', 'PiCo', 'Palmetto Dunes', 'Sun City', 'Margaritaville', 'Tidewater', 'Hammock Bay', 'Other'
];
const EVENTS = ['Round Robin','Mash Up','Money Ball','Open Play','Other'];
const SKILLS = ['2.5','3.0','3.5','4.0','4.5','Open','Other'];
const VENUES = ['Court 1','Court 2','Court 3','Court 4','Other'];

/* ---------- Helpers ---------- */
function setSelectOrOther(selectEl, wrap, input, val, opts){
  if(!selectEl || !wrap || !input) return;
  const found = opts.includes(val);
  if(found){ selectEl.value = val; wrap.style.display='none'; input.value=''; }
  else if(!val){ selectEl.value = 'Other'; wrap.style.display='none'; input.value=''; }
  else { selectEl.value='Other'; wrap.style.display=''; input.value=val||''; }
}
function escapeHtml(s){
  return String(s||'').replace(/[&<>"'`=\/]/g, c => ({
    '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;','/':'&#47;','`':'&#96;','=':'&#61;'
  }[c]));
}

/* ---------- FIREBASE ---------- */
const db = firebase.firestore();

/* ---------- UI bootstrap ---------- */
document.addEventListener('DOMContentLoaded', () => {
  fillSelect('c-name-select', NAME_OPTIONS);
  fillSelect('c-event', EVENTS);
  fillSelect('c-skill', SKILLS);
  fillSelect('c-venue', VENUES);

  // Join dropdowns populate from Firestore
  populateJoinDropdowns();
});

/* ---------- Fill selects ---------- */
function fillSelect(id, items){
  const el = $('#'+id);
  if(!el) return;
  el.innerHTML = '';
  items.forEach(v=>{
    const opt = document.createElement('option');
    opt.value = v; opt.textContent = v;
    el.appendChild(opt);
  });
}

/* ---------- Pot state ---------- */
let CURRENT_POT_ID = null;
let CURRENT_POT    = null;

async function loadPot(potId){
  if(!potId){ alert('Enter a Pot ID.'); return; }
  const doc = await db.collection('pots').doc(potId).get();
  if(!doc.exists){ alert('Pot not found.'); return; }
  CURRENT_POT_ID = potId;
  CURRENT_POT = { id: potId, ...doc.data() };
  renderPot(CURRENT_POT);
  watchEntries(potId);
}

function renderPot(pot){
  $('#v-id').textContent = pot.id || '';
  $('#v-name').textContent = pot.name || '';
  $('#v-event').textContent = pot.event || '';
  $('#v-skill').textContent = pot.skill || '';
  $('#v-venue').textContent = pot.venue || '';
  $('#v-date').textContent = pot.date || '';
  $('#v-time').textContent = `${pot.start||''} - ${pot.end||''}`;
  $('#v-organizer').textContent = pot.organizer || '';
  $('#v-max').textContent = (pot.max||0);
  $('#v-price').textContent = dollars(pot.price||0);
  $('#v-pot').value = pot.id || '';

 // Ads & logo (inject <img> into the <div> slots)
const topAd = document.getElementById('ad-top');
if (topAd){
  topAd.style.display = '';
  topAd.innerHTML = '<a href="#"><img src="/ads/top_728x90_1.png" alt="Sponsored"></a>';
  document.getElementById('ad-top-meta')?.style.setProperty('display','');
}
const botAd = document.getElementById('ad-bottom');
if (botAd){
  botAd.style.display = '';
  botAd.innerHTML = '<a href="#"><img src="/ads/bottom_300x250_2.png" alt="Sponsored"></a>';
  document.getElementById('ad-bottom-meta')?.style.setProperty('display','');
}
// Logo (your HTML uses class="logo", not id="site-logo")
document.querySelector('.logo')?.setAttribute('src','Picklepot-logo.png');

}

/* ---------- Create / Join ---------- */
async function createPot(){
  const id = ($('#c-id')?.value || '').trim();
  if(!id){ alert('Provide an ID'); return; }
  const docRef = db.collection('pots').doc(id);
  const exists = await docRef.get();
  if(exists.exists){ alert('That ID already exists.'); return; }

  const name = $('#c-name-select')?.value;
  const event = $('#c-event')?.value;
  const skill = $('#c-skill')?.value;
  const venue = $('#c-venue')?.value;
  const max   = Number($('#c-max')?.value || 0);
  const price = Number($('#c-price')?.value || 0);

  const data = {
    id, name, event, skill, venue, max, price,
    created: Date.now()
  };
  await docRef.set(data, { merge:true });
  alert('Pot created.');
  loadPot(id);
}

async function joinPot(){
  const potId = CURRENT_POT_ID || $('#v-pot')?.value;
  if(!potId){ alert('Load a Pot first.'); return; }

  const name  = ($('#j-name')?.value || '').trim();
  const email = ($('#j-email')?.value || '').trim();
  if(!name || !email){ alert('Name and Email are required.'); return; }

  const entries = db.collection('pots').doc(potId).collection('entries');
  // Prevent dup by email/name
  const emailLC = email.toLowerCase();
  const nameLC  = name.toLowerCase();
  const dupEmail = await entries.where('email_lc','==',emailLC).limit(1).get();
  const dupName  = await entries.where('name_lc','==',nameLC).limit(1).get();
  if(!dupEmail.empty || !dupName.empty){
    alert('Duplicate entry (same name or email).'); return;
  }

  await entries.add({
    name, email,
    name_lc: nameLC, email_lc: emailLC,
    ts: Date.now()
  });

  alert('You are added to this Pot. Check your email for receipt/confirmation.');
}

/* ---------- Watch entries ---------- */
let ENTRIES_UNSUB = null;
function watchEntries(potId){
  if(ENTRIES_UNSUB) ENTRIES_UNSUB();
  ENTRIES_UNSUB = db.collection('pots').doc(potId).collection('entries')
    .orderBy('ts','desc')
    .onSnapshot(snap=>{
      const list = $('#v-entries');
      if(!list) return;
      list.innerHTML = '';
      snap.forEach(doc=>{
        const e = doc.data();
        const li = document.createElement('li');
        li.textContent = `${e.name||''} — ${e.email||''}`;
        list.appendChild(li);
      });
    });
}

/* ---------- Populate Join dropdowns ---------- */
async function populateJoinDropdowns(){
  try{
    const pots = await db.collection('pots').orderBy('created','desc').limit(50).get();
    const sel = $('#j-pot-select');
    if(!sel) return;
    sel.innerHTML = '';
    pots.forEach(doc=>{
      const d = doc.data();
      const opt = document.createElement('option');
      opt.value = d.id;
      opt.textContent = `${d.name||d.id||''} — ${d.date||''}`;
      sel.appendChild(opt);
    });
  }catch(e){ /* ignore */ }
}

/* ---------- Buttons ---------- */
document.addEventListener('DOMContentLoaded', ()=>{
  $('#btn-create')?.addEventListener('click', createPot);
  $('#btn-join')?.addEventListener('click', joinPot);

  const loadBtn = $('#btn-load');
  if (loadBtn) { loadBtn.disabled = false; loadBtn.addEventListener('click', onLoadPotClicked); }
  const potIdInput = $('#v-pot');
  if (potIdInput) {
    potIdInput.addEventListener('keydown', (e)=>{
      if(e.key === 'Enter'){ e.preventDefault(); onLoadPotClicked(); }
    });
  }
  $('#j-pot-select')?.addEventListener('change', ()=>{
    const sel = $('#j-pot-select').value;
    if(sel && sel !== CURRENT_POT_ID){ loadPot(sel); }
  });
});

function onLoadPotClicked(){
  const id = ($('#v-pot')?.value || '').trim();
  loadPot(id);
}

/* ---------- Move Entry (admin) ---------- */
let LAST_DETAIL_ENTRIES = [];
async function listEntriesForPot(potId, intoEl){
  const snap = await db.collection('pots').doc(potId).collection('entries').orderBy('ts','desc').get();
  const arr = []; snap.forEach(d=>arr.push({ id:d.id, ...d.data() }));
  LAST_DETAIL_ENTRIES = arr;
  intoEl.innerHTML = '';
  arr.forEach(e=>{
    const li = document.createElement('li');
    li.textContent = `${e.name||''} — ${e.email||''}`;
    li.dataset.entryId = e.id;
    intoEl.appendChild(li);
  });
}

async function moveEntry(fromPotId, toPotId, entryId){
  if(!fromPotId || !toPotId || !entryId){ alert('Select from/to pots and an entry'); return; }
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

  await toRef.add({
    name: entry.name||'', email: entry.email||'',
    name_lc: nameLC, email_lc: emailLC, ts: Date.now()
  });
  await db.collection('pots').doc(fromPotId).collection('entries').doc(entryId).delete();
  alert('Moved successfully.');
}

/* ---------- Admin detail modal (optional wiring if you have it) ---------- */
document.addEventListener('DOMContentLoaded', ()=>{
  const openBtn = $('#admin-detail-open');
  if(!openBtn) return;

  openBtn.addEventListener('click', async ()=>{
    const potId = ($('#v-pot')?.value || '').trim();
    if(!potId){ alert('Load a Pot ID first'); return; }
    if(!isSiteAdmin()){ alert('Enable Admin mode first.'); return; }

    const list = $('#admin-detail-list');
    await listEntriesForPot(potId, list);

    $('#admin-detail-modal')?.classList.add('open');
  });

  $('#admin-detail-close')?.addEventListener('click', ()=>{
    $('#admin-detail-modal')?.classList.remove('open');
  });

  $('#admin-detail-move')?.addEventListener('click', async ()=>{
    const fromPotId = ($('#v-pot')?.value || '').trim();
    const toPotId = ($('#admin-move-to')?.value || '').trim();
    const entryEl = $('#admin-detail-list li.selected');
    if(!entryEl){ alert('Select an entry from the list.'); return; }
    const entryId = entryEl?.dataset?.entryId;
    await moveEntry(fromPotId, toPotId, entryId);
    const list = $('#admin-detail-list');
    await listEntriesForPot(fromPotId, list);
  });

  $('#admin-detail-list')?.addEventListener('click', (e)=>{
    if(e.target.tagName === 'LI'){
      $$('#admin-detail-list li').forEach(li=>li.classList.remove('selected'));
      e.target.classList.add('selected');
    }
  });
});

/* === Organizer Subscription + Auth UI (single copy) === */
(() => {
  // Use existing API_BASE constant if declared earlier; else fall back to window or default
  const apiBase = (typeof API_BASE !== "undefined" && API_BASE) || window.API_BASE || "https://picklepot-stripe.onrender.com";
  const returnUrl = window.RETURN_URL || `${location.origin}?sub=success`;

  const $id = (id) => document.getElementById(id);
  const isRealUser = (u) => !!u && u.isAnonymous !== true; // treat anonymous as signed-out

  function setAuthUI(signedIn, label){
    const btnIn  = $id('btn-signin');
    const btnOut = $id('btn-signout');
    const who    = $id('auth-user');
    if (btnIn)  btnIn.style.display  = signedIn ? 'none' : '';
    if (btnOut) btnOut.style.display = signedIn ? '' : 'none';
    if (who){
      if (signedIn){
        who.style.display = 'inline';
        who.textContent   = label ? `(signed in: ${label})` : '(signed in)';
      } else {
        who.style.display = 'none';
        who.textContent   = '';
      }
    }
  }

  async function startOrganizerSubscription(){
    const btn = $id('btn-subscribe-organizer') || $id('organizerSubscribeBtn');
    if (btn){ btn.disabled = true; btn.textContent = 'Redirecting…'; }
    try{
      const res = await fetch(`${apiBase}/create-organizer-subscription`, {
        method: 'POST',
        headers: { 'Content-Type':'application/json' },
        body: JSON.stringify({ returnUrl })
      });
      const data = await res.json().catch(()=>null);
      if (!res.ok || !data?.url) throw new Error(data?.error || 'Subscription service error.');
      location.assign(data.url);
    }catch(err){
      console.error(err);
      alert(err?.message || 'Network error starting subscription.');
    }finally{
      if (btn){ btn.disabled = false; btn.textContent = 'Organizer Subscription'; }
    }
  }

  function openSignInButton(){
    const btn = $id('btn-signin');
    if (btn){ try{btn.focus();}catch{}; try{btn.click();}catch{}; return true; }
    return false;
  }

  function handleStripeReturn(){
    const url = new URL(location.href);
    if (url.searchParams.get('sub') === 'success'){
      const banner = $id('pay-banner');
      if (banner){
        banner.textContent = 'Organizer subscription confirmed. Please sign in to manage your Pots.';
        banner.style.display = '';
      }
      if (!openSignInButton()){
        const obs = new MutationObserver(() => { if (openSignInButton()) obs.disconnect(); });
        obs.observe(document.body, { childList:true, subtree:true });
        setTimeout(() => obs.disconnect(), 5000);
      }
      url.searchParams.delete('sub');
      history.replaceState({}, '', url);
    }
  }

  async function signIn(){
    try{
      const provider = new firebase.auth.GoogleAuthProvider();
      const cred = await firebase.auth().signInWithPopup(provider);
      setAuthUI(true, cred?.user?.email || '');
    }catch(e){
      console.warn('Sign-in cancelled or failed', e);
    }
  }
  async function signOut(){
    try{ await firebase.auth().signOut(); }
    finally{ setAuthUI(false); }
  }

  document.addEventListener('DOMContentLoaded', () => {
    // start in a signed-out UI until Firebase confirms a real user
    setAuthUI(false);
    handleStripeReturn();

    $id('btn-signin') ?.addEventListener('click', signIn);
    $id('btn-signout')?.addEventListener('click', signOut);
    $id('btn-subscribe-organizer')?.addEventListener('click', startOrganizerSubscription);
    $id('organizerSubscribeBtn')  ?.addEventListener('click', startOrganizerSubscription);
  });

  if (firebase?.auth) {
    firebase.auth().onAuthStateChanged((user) => {
      if (!isRealUser(user)){ setAuthUI(false); return; }
      setAuthUI(true, user.email || '');
    });
  }
})();
