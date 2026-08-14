# Grass Daddy — Website

A brand site + internal dashboard for **Grass Daddy**, a Connecticut lawn care & landscaping company. Static HTML/CSS/JS, no build step, no framework, no npm dependencies for the site itself — open `index.html` or serve the folder with any static host.

## What's in here

```
index.html        One-page brand site (Nav → Hero → Services → Proof → Consulting → Contact → Footer)
team.html          Standalone "Our Team" page
404.html           Branded 404 page
login.html         Owner login gate for the internal dashboard
dashboard.html     CRM dashboard (KPIs, today's route, follow-ups, new leads, rest of week)
leads.html         Leads inbox (pipeline, activity log, property notes, search/sort/filter, CSV/JSON)
calendar.html      Booking calendar (month grid, agenda, recurrence, mark done, payment)
customers.html     Customer 360 (contact, property, jobs, estimates, invoices, notes)
estimates.html     Quotes from the price list; convert accepted estimates to invoices
billing.html       Price list, per-client rates, and invoices
css/styles.css     Design system: tokens, layout, animation, all page styles
css/crm.css        GorillaDesk-inspired CRM shell (sidebar, top search, customer record)
js/main.js         Public site: nav, mobile menu, scroll reveal, stat count-up, service modal, quote form
js/auth-guard.js   Shared login/session/lockout helpers used by login + dashboard pages
js/modal-utils.js  Shared focus-trap helper for all modals
js/crm-shell.js    CRM sidebar/search chrome
js/login.js        Login form logic (uses auth-guard.js)
js/dashboard.js    Dashboard / CRM home
js/leads.js        Leads dashboard logic
js/calendar.js     Calendar/booking logic
js/customers.js    Customer 360 records
js/estimates.js    Estimates and convert-to-invoice
js/billing.js      Price list, per-client rates, and invoices
assets/            Images, video, icons
robots.txt, sitemap.xml, manifest.webmanifest  SEO/PWA basics
_headers, vercel.json  Security headers for hosts that support custom HTTP headers (Netlify/Cloudflare Pages, Vercel)
.well-known/security.txt  Where to report a security issue
_shot-tool/        Internal dev-only Puppeteer test/screenshot scripts — not part of the deployed site
dist-mac/, grass-daddy-mac.zip  Old packaged build artifact — not the live site, safe to delete
```

## Visual concept

- **Palette** — near-black (`#0A0B09`), deep grass green (`#234E29`), a single vivid "fresh-cut" accent green (`#5FAF3C`), warm off-white, and a stone-grey scale for structure.
- **Type** — condensed, tall-cap **Bebas Neue** for headlines (yard-sign/truck-lettering energy), paired with **Inter** for body/UI so it still reads modern and trustworthy.
- **Motion** — the recurring motif is *mower stripes*: diagonal alternating bands used in the hero background, the proof-section divider, the consultation panel and the contact card. Buttons "mow" a stripe-fill on hover; sections fade/rise in on scroll; stats count up when they enter view.

## The dashboard's login is a deterrent, not real security

`login.html` / `dashboard.html` / `leads.html` / `calendar.html` / `billing.html` / `customers.html` / `estimates.html` are static pages with **no backend and no server-side session**. `js/auth-guard.js` now:

- Hashes the passcode (SHA-256 via Web Crypto) instead of storing it in plaintext.
- Expires the login session after 12 hours.
- Locks out repeated failed attempts with an increasing delay.
- Provides a "Log out" button that clears the session.

This raises the bar above "trivially readable," but **anyone with browser devtools can still bypass it** (e.g. by setting `localStorage.gdAdminAuthed = "1"` directly), because there's nothing on a server to check against. Don't put anything in the dashboard you wouldn't be okay with a technically-savvy visitor eventually seeing. If this dashboard ever needs to hold real business-critical or customer-sensitive data long-term, move authentication to a real backend with server-side sessions (e.g. Netlify Identity, Auth0, or a small custom API).

The default passcode is `grassdaddy2026` — change it from **Leads Dashboard → Settings** the first time you log in.

## The public quote form: how leads actually reach you today

There's still no backend, so a real visitor's form submission is handled two ways right now:

1. It's saved to **this browser's** `localStorage` (only useful if you personally submit a test lead and then open the dashboard in the same browser).
2. It opens **your own email app** with a pre-filled message addressed to `Grass_Daddy@yahoo.com` via a `mailto:` link, so real quote requests actually land in your inbox from any visitor's device.

The `mailto:` approach works with zero setup, but it depends on the visitor's device having a mail client configured, and a couple of extra clicks from them. For guaranteed, silent delivery straight to your inbox (or a spreadsheet), swap the form over to one of:

- **[Formspree](https://formspree.io)** — free tier, no server needed. Sign up, get a form endpoint, change `js/main.js`'s submit handler to `fetch()` that URL instead of/alongside the current logic.
- **Netlify Forms** — if you deploy on Netlify, add `data-netlify="true"` and a hidden `form-name` input to `#quoteForm` and Netlify captures submissions automatically, no JS changes required.

The form already has a honeypot field (`name="company"`, visually hidden) to cut down on basic bot spam — keep that field in place if you change the submit handler.

## Security headers

`index.html`/`team.html`/`login.html`/`dashboard.html`/`leads.html`/`calendar.html`/`billing.html`/`customers.html`/`estimates.html`/`404.html` all ship a `Content-Security-Policy` and `Referrer-Policy` via `<meta>` tags (works on any static host, no config needed). A couple of protections can only be set via real HTTP headers, not `<meta>`, so:

- **`_headers`** — picked up automatically by Netlify and Cloudflare Pages.
- **`vercel.json`** — picked up automatically by Vercel.
- Other hosts (Apache/Nginx/IIS) — add the equivalent of `X-Frame-Options: DENY`, `X-Content-Type-Options: nosniff`, and `Strict-Transport-Security` in your server config.

## Before you launch

1. **Domain** — swap every `YOURDOMAIN.com` placeholder (canonical URLs, `robots.txt`, `sitemap.xml`, `security.txt`, Open Graph tags) for the real domain.
2. **Social links** — confirm the exact Facebook page URL for "Grass Daddy LLC" and Instagram handle `@GrassDaddyLandscaping`.
3. **Lead delivery** — decide if the built-in `mailto:` fallback is good enough, or wire up Formspree/Netlify Forms (see above).
4. **Dashboard passcode** — log in with the default passcode and change it immediately from Settings.
5. **What to upload** — only deploy the actual site: `index.html`, `team.html`, `login.html`, `dashboard.html`, `leads.html`, `calendar.html`, `billing.html`, `customers.html`, `estimates.html`, `404.html`, `css/`, `js/`, `assets/`, `manifest.webmanifest`, `robots.txt`, `sitemap.xml`, `_headers`, `vercel.json`, `.well-known/`. Don't upload `_shot-tool/`, `dist-mac/`, `grass-daddy-mac.zip`, `logo-animations.html`, or this README.
6. **Hosting** — Netlify, Vercel, Cloudflare Pages, or any static host. No build step required.
