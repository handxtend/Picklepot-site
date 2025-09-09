
/* === PiCo Bootstrap Add-on v2 ===============================================
   - Make tip banner visible with fallback text
   - Bind "Create A Pot" button -> onCreateClick (admin: direct, organizer: Stripe)
   - Force Active Tournaments list to attach; show loading/empty states
   - Safe to include AFTER app.full.bundle.js (defer)
============================================================================= */
(function(){
  function $(s, el){ return (el||document).querySelector(s); }
  function on(el, ev, fn){ if(el) el.addEventListener(ev, fn, {capture:true}); }
  function showBanner(txt){
    try{
      var bar = $('#tipsBar');
      var t = $('#tipText');
      if(bar){ bar.style.display = 'block'; }
      if(t && txt){ t.textContent = txt; }
    }catch(_){}
  }

  // 1) Banner
  if (document.readyState === 'loading'){
    document.addEventListener('DOMContentLoaded', function(){
      showBanner('Tip: Use the Active Tournaments list to pick your event, then fill your info to join.');
    });
  } else {
    showBanner('Tip: Use the Active Tournaments list to pick your event, then fill your info to join.');
  }

  // 2) Create button binding
  function bindCreate(){
    var btn = document.getElementById('btn-create');
    if (!btn || btn.__picoBound) return;
    btn.__picoBound = true;
    btn.addEventListener('click', function(e){
      if (e && e.preventDefault) e.preventDefault();
      try{
        if (typeof onCreateClick === 'function'){
          return onCreateClick(e);
        }
        // Fallback route if onCreateClick isn't defined
        if (typeof isSiteAdmin === 'function' && isSiteAdmin()){
          return (typeof createPotDirect==='function') && createPotDirect();
        } else {
          return (typeof startCreatePotCheckout==='function') && startCreatePotCheckout();
        }
      }catch(err){
        console.error('[Create] failed', err);
        alert('Create Pot failed. See console.');
      }
    }, {capture:true});
  }
  if (document.readyState === 'loading'){
    document.addEventListener('DOMContentLoaded', bindCreate);
  } else { bindCreate(); }

  // 3) Active Tournaments attach
  function setLoading(){
    var sel = $('#j-pot-select');
    if (sel && !sel.options.length) sel.innerHTML = '<option>Loading…</option>';
  }
  function attachPots(reason){
    try{
      if (typeof attachActivePotsListener === 'function'){
        console.log('[pots] bootstrap attach', reason||'');
        attachActivePotsListener();
      }
    }catch(err){ console.error(err); }
  }
  if (document.readyState === 'loading'){
    document.addEventListener('DOMContentLoaded', function(){ setLoading(); attachPots('DOMContentLoaded'); });
  } else { setLoading(); attachPots('document-ready'); }

  try{
    var auth = (window.firebase && firebase.auth) ? firebase.auth() : null;
    if (auth && !window.__picoKickOnce){
      auth.onAuthStateChanged(function(){
        if (!window.__picoKickOnce){
          window.__picoKickOnce = true;
          attachPots('auth');
        }
      });
    }
  }catch(_){}

  setTimeout(function(){ attachPots('t+1200ms'); }, 1200);
  setTimeout(function(){ attachPots('t+3500ms'); }, 3500);
  setTimeout(function(){
    var sel = $('#j-pot-select');
    if (!sel) return;
    var first = sel.options[0];
    var txt = first ? (first.textContent||'') : '';
    if (!sel.options.length || /loading/i.test(txt)){
      sel.innerHTML = '<option disabled>No open tournaments found. Click Refresh.</option>';
    }
  }, 6000);

  // Wire Refresh button to reattach
  on(document.getElementById('j-refresh'), 'click', function(e){
    if (e && e.preventDefault) e.preventDefault();
    attachPots('refresh-click');
  });
})();
/* === /PiCo Bootstrap Add-on v2 ============================================ */
