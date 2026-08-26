# Grass Daddy — Website

A brand site + internal dashboard for **Grass Daddy**, a Connecticut lawn care & landscaping company. Static HTML/CSS/JS, no build step, no framework, no npm dependencies for the site itself — open `index.html` or serve the folder with any static host.

## What's in here

```
index.html        One-page brand site (Nav → Hero → Services → Proof → Consulting → Contact → Footer)
team.html          Standalone "Our Team" page
privacy.html       Short privacy note for the quote form
404.html           Branded 404 page
login.html         Owner login gate for the internal dashboard
dashboard.html     CRM dashboard (KPIs, today's route, follow-ups, new leads, rest of week)
leads.html         Leads inbox (pipeline, activity log, property notes, search/sort/filter, CSV/JSON)
calendar.html      Booking calendar (month grid, agenda, recurrence, mark done, payment)
customers.html     Customer 360 (contact, property, jobs, estimates, invoices, notes)
estimates.html     Quotes from the price list; convert accepted estimates to invoices
billing.html       Invoices
prices.html        Price list
css/styles.css     Design system: tokens, layout, animation, all page styles
css/crm.css        GorillaDesk-inspired CRM shell (sidebar, top search, customer record)
js/main.js         Public site: nav, quote form, FormSubmit delivery
js/auth-guard.js   Shared login/session/lockout helpers used by login + dashboard pages
js/modal-utils.js  Shared focus-trap helper for all modals
js/crm-shell.js    CRM sidebar/search chrome
js/login.js        Login form logic (uses auth-guard.js)
js/dashboard.js    Dashboard / CRM home
js/leads.js        Leads dashboard logic
js/calendar.js     Calendar/booking logic
js/customers.js    Customer 360 records
js/estimates.js    Estimates and convert-to-invoice
js/billing.js      Invoices
js/prices.js       Price list editor
js/price-catalog.js Shared price catalog
js/settings.js     CRM settings modal (email, password, backup)
js/maps-utils.js   Property map pins
js/work-convert.js Lead → customer conversion
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

Change the login password from **Settings** after the first sign-in. Default accounts are stored as SHA-256 hashes in `js/auth-guard.js`.

## The public quote form

A real visitor's quote is handled three ways:

1. Saved to **this browser's** `localStorage` (only useful if you open the CRM in that same browser).
2. **Posted to [FormSubmit](https://formsubmit.co)** so it lands in `Grass_Daddy@yahoo.com` without opening the visitor's mail app. The **first** submission sends Izzy a one-time confirmation email — click that link or later quotes will not arrive.
3. If that POST fails, the visitor's mail app opens with a pre-filled `mailto:` message, and the success screen still has a backup email link.

The form already has a honeypot field (`name="company"`) to cut down on basic bot spam.

## Security headers

`index.html`/`team.html`/`privacy.html`/`login.html`/`dashboard.html`/`leads.html`/`calendar.html`/`billing.html`/`customers.html`/`estimates.html`/`404.html` all ship a `Content-Security-Policy` and `Referrer-Policy` via `<meta>` tags (works on any static host, no config needed). A couple of protections can only be set via real HTTP headers, not `<meta>`, so:

- **`_headers`** — picked up automatically by Netlify and Cloudflare Pages.
- **`vercel.json`** — picked up automatically by Vercel.
- Other hosts (Apache/Nginx/IIS) — add the equivalent of `X-Frame-Options: DENY`, `X-Content-Type-Options: nosniff`, and `Strict-Transport-Security` in your server config.

## Before you launch

1. **Domain** — public URLs currently point at the GitHub Pages site (`https://doacreativeco.github.io/grass-daddy/`). When you buy a custom domain, swap those in `index.html`, `team.html`, `privacy.html`, `robots.txt`, and `sitemap.xml`.
2. **FormSubmit** — send one test quote, then confirm the activation email at `Grass_Daddy@yahoo.com`.
3. **Social links** — confirm the exact Facebook page URL for "Grass Daddy LLC" and Instagram handle `@GrassDaddyLandscaping`.
4. **Dashboard password** — log in and change it from Settings.
5. **What to upload** — only deploy the actual site: `index.html`, `team.html`, `privacy.html`, `login.html`, `dashboard.html`, `leads.html`, `calendar.html`, `billing.html`, `prices.html`, `customers.html`, `estimates.html`, `404.html`, `css/`, `js/`, `assets/`, `manifest.webmanifest`, `robots.txt`, `sitemap.xml`, `_headers`, `vercel.json`, `.well-known/`. Don't upload `_shot-tool/`, `dist-mac/`, `grass-daddy-mac.zip`, `logo-animations.html`, or this README.
6. **Hosting** — GitHub Pages is live. Netlify, Vercel, or Cloudflare Pages also work with no build step.
