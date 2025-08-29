
// ui-join-addon.js
// Adds a light-gold "Join A Pot" button under your top CTAs.
// The Join section stays hidden until clicked, and shows a bottom "↑↑ close".

(function () {
  const TXT_JOIN = "Join A Pot";
  const CLASS_HIDDEN = "jp-hidden";
  const GOLD_BTN_CLASS = "jp-gold-btn";

  function normText(el) {
    return (el.textContent || "").replace(/\s+/g, " ").trim().toLowerCase();
  }

  function findButtonByLabel(label) {
    const target = label.toLowerCase();
    const btns = Array.from(document.querySelectorAll('button, a, input[type="button"], input[type="submit"]'));
    return btns.find(b => normText(b) === target);
  }

  function findTopCtaRow() {
    // Try to locate the row that contains "Create A Pot" and/or "Organizer"
    const createBtn = findButtonByLabel("Create A Pot");
    if (createBtn && createBtn.parentElement) {
      // insert after that button's container
      return createBtn.parentElement;
    }
    // fallback: first header area with buttons
    const candidates = Array.from(document.querySelectorAll("header, .cta, .cta-row, .button-row, .top-row, .top"));
    return candidates.find(x => x.querySelector("button, a"));
  }

  function findJoinPanel() {
    // Prefer known ids/classes first
    const ids = ["join", "join-panel", "join-section", "joinArea", "join_wrap", "joinWrap"];
    for (const id of ids) {
      const el = document.getElementById(id);
      if (el) return el;
    }
    const classes = [".join", ".join-panel", ".join-section", "[data-role='join']"];
    for (const sel of classes) {
      const el = document.querySelector(sel);
      if (el) return el;
    }
    // Heuristic: container that holds "Active Tournaments"
    const h = Array.from(document.querySelectorAll("h2,h3,h4,div,span"))
      .find(n => /active tournaments/i.test(normText(n)));
    if (h) {
      // go up to a reasonably sized container
      let cur = h;
      for (let i = 0; i < 4 && cur && cur.parentElement; i++) cur = cur.parentElement;
      return cur || h;
    }
    return null;
  }

  function ensureCloseAtBottom(panel, hideFn) {
    if (!panel.querySelector(".jp-close")) {
      const closeRow = document.createElement("div");
      closeRow.className = "jp-close";
      closeRow.innerHTML = '<span class="jp-arrows">↑↑</span> close';
      closeRow.addEventListener("click", hideFn);
      panel.appendChild(closeRow);
    }
  }

  function mount() {
    const joinPanel = findJoinPanel();
    if (!joinPanel) return; // nothing to do

    // Hide join panel by default
    joinPanel.classList.add(CLASS_HIDDEN);

    // Insert a light-gold "Join A Pot" button under the top CTAs (or before the join panel as fallback)
    let hostRow = findTopCtaRow();
    if (!hostRow) hostRow = joinPanel.parentElement || document.body;

    // Avoid duplicating if already added
    if (!document.querySelector(".jp-join-btn")) {
      const joinBtn = document.createElement("button");
      joinBtn.type = "button";
      joinBtn.className = `jp-join-btn ${GOLD_BTN_CLASS}`;
      joinBtn.textContent = TXT_JOIN;

      const show = () => {
        joinPanel.classList.remove(CLASS_HIDDEN);
        ensureCloseAtBottom(joinPanel, hide);
        // Scroll into view just below the buttons
        setTimeout(() => {
          joinPanel.scrollIntoView({ behavior: "smooth", block: "start" });
          window.scrollBy({ top: -16, behavior: "smooth" });
        }, 30);
      };
      const hide = () => {
        joinPanel.classList.add(CLASS_HIDDEN);
      };

      joinBtn.addEventListener("click", show);

      // place the button just after the hostRow's first button (keeps your layout intact)
      if (hostRow.firstElementChild && hostRow.firstElementChild.nextSibling) {
        hostRow.insertBefore(joinBtn, hostRow.firstElementChild.nextSibling.nextSibling);
      } else {
        hostRow.appendChild(joinBtn);
      }

      // Also add bottom close (↑↑ close)
      ensureCloseAtBottom(joinPanel, hide);
    }
  }

  // mount when DOM is ready
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", mount);
  } else {
    mount();
  }
})();
