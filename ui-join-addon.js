
/**
 * PicklePot UI add-on
 * - Adds a light-gold "Join A Pot" button under the top CTAs
 * - Reveals the existing Join section and adds a bottom "↑↑ close"
 * - Ensures "Number of Pots" field exists in Create form
 * - Wires the "Create Pot" button to your existing startCreatePotCheckout()
 * No layout rewrite; pure progressive enhancement.
 */
(function(){
  const $  = (s,sc)=> (sc||document).querySelector(s);
  const $$ = (s,sc)=> Array.from((sc||document).querySelectorAll(s));

  function textIncludes(el, needle){
    if(!el) return false;
    return (el.textContent||"").toLowerCase().includes(needle.toLowerCase());
  }
  function closestWithText(start, needle){
    let el = start;
    while (el && el !== document.body){
      if (textIncludes(el, needle)) return el;
      el = el.parentElement;
    }
    return null;
  }
  function show(el){ if(el) el.style.display=''; }
  function hide(el){ if(el) el.style.display='none'; }
  function scrollInto(el){
    if(!el) return;
    try{ el.scrollIntoView({behavior:'smooth',block:'start'}); }catch(_){}
  }

  function ensureCountField(){
    // Try by id
    let count = $('#c-count');
    if (count) return;

    // Try to find guest buy-in field to insert after
    const guestInput = $('#c-guest') ||
      $$('label').find(l => textIncludes(l, 'guest') && l.htmlFor && $('#'+l.htmlFor));
    let afterNode = null;
    if (guestInput && guestInput.id){
      afterNode = guestInput.closest('.field') || guestInput.parentElement;
    }else if (guestInput && guestInput.nodeType===1){
      afterNode = guestInput.closest('.field') || guestInput.parentElement;
    }
    // If not found, fallback to any create card container
    const createCard = $('#create-card') || closestWithText($('body'),'member buy-in');
    if (!afterNode && createCard){
      afterNode = createCard;
    }
    if (!afterNode) return;

    const wrap = document.createElement('div');
    wrap.className = 'field';
    wrap.innerHTML = `
      <label for="c-count">Number of Pots</label>
      <input id="c-count" type="number" min="1" step="1" value="1" inputmode="numeric" />
    `;
    afterNode.insertAdjacentElement('afterend', wrap);
  }

  function wireCreateButton(){
    // Find a Create button inside a "create" area
    const explicit = $('#btn-create');
    const guessed  = $$('button').find(b=>textIncludes(b,'create pot'));
    const createBtn = explicit || guessed;
    if (!createBtn) return;

    const handler = (ev)=>{
      // Let form submit naturally if you have an action, else call known handlers
      if (typeof window.startCreatePotCheckout === 'function'){
        ev.preventDefault();
        return window.startCreatePotCheckout();
      }
      if (typeof window.onCreateClick === 'function'){
        ev.preventDefault();
        return window.onCreateClick();
      }
      // otherwise, allow default behavior
    };
    // Avoid duplicate bindings
    createBtn.addEventListener('click', handler, {capture:false});
  }

  function injectJoinCTA(){
    // Locate the top CTA row by its buttons (Create/Organizer) and insert gold Join beneath
    const createTopBtn = $$('button').find(b=>textIncludes(b,'create a pot'));
    const organizerBtn = $$('button').find(b=>textIncludes(b,'organizer'));
    let anchor = null;
    if (createTopBtn && organizerBtn){
      // Use their shared container if possible
      anchor = createTopBtn.parentElement;
      // climb until both are inside the same container
      while (anchor && !anchor.contains(organizerBtn)) anchor = anchor.parentElement;
    }
    if (!anchor) anchor = (createTopBtn||organizerBtn)?.parentElement || document.body;

    // Build the gold Join CTA row
    const row = document.createElement('div');
    row.className = 'cta-bar-join';
    row.style.cssText = 'display:flex;justify-content:center;align-items:center;margin:-4px 0 10px;';

    const joinBtn = document.createElement('button');
    joinBtn.id = 'btn-start-join';
    joinBtn.className = 'btn xl btn-gold-light';
    joinBtn.type = 'button';
    joinBtn.textContent = 'Join A Pot';
    row.appendChild(joinBtn);

    // Insert row after the anchor block
    anchor.insertAdjacentElement('afterend', row);

    // Locate the existing Join section by the "Active Tournaments" marker
    let joinCard = null;
    const marker = $$('*').find(el=>textIncludes(el,'active tournaments'));
    if (marker){
      // prefer a <section> or card wrapper
      joinCard = marker.closest('section') || marker.closest('.card') || marker.parentElement;
    }

    // If not found, do nothing gracefully
    if (!joinCard) return;

    // Hide by default
    joinCard.style.display = 'none';

    // Add bottom collapse control
    const bottomWrap = document.createElement('div');
    bottomWrap.style.cssText = 'display:flex;justify-content:center;margin:18px 0 6px;';
    bottomWrap.innerHTML = `
      <button id="btn-join-collapse-bottom" type="button"
              title="Hide Join a Pot"
              style="background:none;border:none;color:#666;cursor:pointer;font-weight:600">
        ↑↑ close
      </button>
    `;
    joinCard.appendChild(bottomWrap);

    // Wire open/close
    joinBtn.addEventListener('click', ()=>{ joinCard.style.display=''; scrollInto(joinCard); });
    bottomWrap.querySelector('button').addEventListener('click', ()=>{ joinCard.style.display='none'; });
  }

  document.addEventListener('DOMContentLoaded', ()=>{
    ensureCountField();
    wireCreateButton();
    injectJoinCTA();
  });
})();
