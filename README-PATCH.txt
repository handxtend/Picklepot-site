PicklePot Frontend (patched) — 20250826_175130

What changed
------------
1) app.js
   - More robust checkout redirect:
     * Uses server-provided `url` when available (window.location.assign).
     * Falls back to Stripe.js redirectToCheckout({sessionId}) if only a session id is returned.
     * Shows a clear error message if neither is present.
   - Adds an on‑demand Stripe.js loader (_only_ used in the fallback path).

2) index.html
   - Adds a small cache‑buster on the app.js tag (?v=20250826_175130) so the latest JS is always picked up after deploy.

How to deploy
-------------
1) Replace the files on Netlify with the ones in this zip (index.html, app.js, success.html, cancel.html).
2) Deploy. If you still see the old UI, hard‑refresh the page (Ctrl/Cmd+Shift+R).

Notes
-----
- The fallback to Stripe.js requires a publishable key to be present on the page as window.STRIPE_PUBLISHABLE (or window.STRIPE_PK). If you’re only using server‑redirect `url`, this isn’t required.
- If you continue to get “Redirecting to checkout…” without leaving the page, please open the browser devtools > Network tab and confirm the JSON returned from /create-pot-session contains either `url` or `id`.
