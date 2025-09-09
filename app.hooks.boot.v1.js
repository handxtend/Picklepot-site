// === PiCo Boot Hooks (standalone) — v1 ===============================
// Ensures the Active Tournaments list is reliably populated without
// modifying your main app.js. Safe to load AFTER app.js with `defer`.
(function(){
  function $(s, el){ return (el||document).querySelector(s); }

  function setLoadingState(){
    try{
      var sel = document.getElementById('j-pot-select');
      if (sel && !sel.options.length) sel.innerHTML = '<option>Loading…</option>';
    }catch(_){}
  }

  function callAttach(label){
    try{
      if (typeof attachActivePotsListener === 'function'){
        console.log('[pots] boot hook:', label);
        attachActivePotsListener();
      }
    }catch(err){
      console.error('[pots] boot hook error:', label, err);
    }
  }

  // DOM ready → kick once and show placeholder
  if (document.readyState === 'loading'){
    document.addEventListener('DOMContentLoaded', function(){
      setLoadingState();
      callAttach('DOMContentLoaded');
    });
  } else {
    setLoadingState();
    callAttach('document-ready');
  }

  // Auth-settle → kick once (covers delayed Firebase init)
  try{
    var auth = (window.firebase && firebase.auth) ? firebase.auth() : null;
    if (auth && !window.__potsBoundOnce){
      auth.onAuthStateChanged(function(){
        if (!window.__potsBoundOnce){
          window.__potsBoundOnce = true;
          callAttach('onAuthStateChanged');
        }
      });
    }
  }catch(_){}

  // Watchdog retries + graceful empty state
  (function watchdog(){
    function maybeEmpty(){
      try{
        var sel = document.getElementById('j-pot-select');
        if (!sel) return;
        var first = sel.options[0];
        var txt = first ? (first.textContent || '') : '';
        if (!sel.options.length || /loading/i.test(txt)){
          sel.innerHTML = '<option disabled>No open tournaments found. Click Refresh.</option>';
        }
      }catch(_){}
    }
    setTimeout(function(){ callAttach('t+1200ms'); }, 1200);
    setTimeout(function(){ callAttach('t+3500ms'); }, 3500);
    setTimeout(maybeEmpty, 6000);
  })();
})();
// === /PiCo Boot Hooks — v1 ===========================================
