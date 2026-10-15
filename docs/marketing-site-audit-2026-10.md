# Nuventa Cloud marketing site: audit, changes and growth plan

October 2026. Covers nuventacloud.com (the platform marketing site), not schools' own sites.

Everything here was checked against the code, the local database copy and the live site on 15 Oct 2026. Where something could not be checked, it says so.

---

## 1. Audit of the live site

### What works well (kept)

- **Tenant-safe tracking.** The Meta Pixel only fires on nuventacloud.com, never on a school's portal. Registration already fires `Lead` and `CompleteRegistration`.
- **Self-serve registration.** `/onboarding/register` → choose services → the school's own subdomain, working end to end.
- **Editable copy.** About, Contact and stats are edited under Platform admin → Site Content.
- **Host-aware sitemap and robots.txt** served by the backend.
- **A deep product.** Much more is built than the homepage said. The biggest gap is the offline CBT exam station, which is a real differentiator for Nigerian schools with weak internet.

### What was confusing or not working

| # | Problem | Effect |
|---|---------|--------|
| 1 | The homepage was a hero plus six value cards ("Integrity", "One Connected Platform"…). It had no features, pricing, how-it-works or FAQ. | Visitors could not tell what the product does or what it costs. |
| 2 | No way to request a demo. The Contact page showed only an email address. | Interested proprietors had no low-commitment next step. |
| 3 | The nav had "Admissions" and "Activities", which are school-site pages, and "Admin Login" went to the **Nuventa staff** login. | School admins couldn't find their own portal. Prospects saw irrelevant links. |
| 4 | Footer links to `/student-login`, `/teacher-login`, `/parent-login` and `/admin-login` lead to routes that don't exist. "Contact" went to `/about`. Help, Privacy and Terms were `#`. | Broken links on every page. |
| 5 | After scrolling, the nav stayed transparent with pale text over white sections. `App.css` makes `body` the scrolling element, so `window.scrollY` is always 0. | The nav was unreadable for most of the page. |
| 6 | Title was just "Nuventa Cloud"; description "Smarter Schools. Stronger Futures." | Weak for "school management software Nigeria" searches. |
| 7 | Stats from Site Content claim **"10+ schools onboarded", "8+ years of experience", "10+ developers"**. | The local DB copy has **4 schools** (it may be out of date). "8+ years" can't be true of the product. See §5. |
| 8 | Value card: "Know the whereabout of your children with the best in class tracking device". | Grammar, an unsupported superlative, and it sounds like tracking children rather than gate attendance. |

### Needs verification (not settled by the code)

- How many schools are actually live and paying in prod. The local copy shows 4 active and 3 payments.
- Whether an inbox exists at **support@nuventacloud.com**. It's the site's fallback address and now also where demo requests are emailed (see §2).
- Whether training and onboarding help are offered, and on what terms. Left out of the FAQ until decided.
- Data protection commitments (backups, hosting location, NDPA 2023 compliance). Left out of the FAQ.
- Whether `ANTHROPIC_API_KEY` is set in prod. AI answer suggestions on imported exam papers depend on it, so the site makes no AI claims.

### Features verified as working (and advertised)

Exams with Word import and a question bank. Results and report cards with grading, positions, remarks and signatures. CBT with live invigilation and an offline exam station (add-on). Student, teacher and parent records with spreadsheet bulk upload. Per-section admins (nursery, primary, JSS, SSS). Promotions. Daily and lesson attendance. Gate Tracker with parent arrival alerts (add-on). Parent portal with attendance, results and fees for all their children. Fees with discounts, online payment into the school's own Paystack, and receipts. Timetables. Email notifications (free). SMS (per message, add-on). The school's own subdomain, custom domain, and public site.

### Not advertised (not verified or not finished)

- **AI question generator:** listed as a service, but it has no screen.
- **Exam proofreading:** no screen found.
- **Result-checker routes:** commented out in the router.
- **Staff notes:** these are HR notes (commendations, queries), not lesson notes.

---

## 2. What changed

### Homepage (`/`)
1. **Hero:** "Everything your school needs to run smarter." Primary button **Book a free demo**, secondary **Explore features**, plus a "Register your school" text link. Three checked highlights.
2. **Stats:** still from Site Content, shown only when filled in. The editor now warns to publish only numbers you can back up.
3. **Problems → solutions:** six admin pains, each matched to a working module.
4. **Features:** eight groups, add-ons labelled.
5. **How it works:** four steps that match the real onboarding flow.
6. **Pricing:** the actual model (Basic per student per term, by term or session; CBT, Gate Tracker and SMS as add-ons). No figures are shown, and the button is "Get a quote" (see §5).
7. **FAQ:** nine questions, answered only where the product answers them.
8. **Final CTA:** Book a free demo and Contact our team.

### Lead capture
- **`/book-demo`**: a focused form (school, name, role, phone/WhatsApp, optional email, location, student count, preferred contact, message). It has inline validation, a confirmation message, and records the page and UTM source.
- The same form is on **`/contact`**.
- **Backend:** `DemoRequest` model and `POST /api/tenants/demo-requests/`. It needs no login, allows 5 per hour per IP, has a honeypot, and cannot set its own status. Each request emails the team at the Site Content contact email (fallback: support@nuventacloud.com).
- **Platform admin → Demo Requests:** lists requests with WhatsApp, call and email links, a status (New → Contacted → Demo booked → Subscribed / Not interested) and notes. Nothing is deleted, so the list doubles as the conversion record.
- **WhatsApp:** a new **WhatsApp number** field under Site Content. Once it's set, a floating "Chat on WhatsApp" button appears on marketing pages. No number was guessed.
- **Tracking:** demo submit fires Meta `Lead` (content_name "Demo Request") plus custom `DemoRequest`. WhatsApp clicks fire `Contact`.

> Note: Meta `Lead` already fires when someone *opens* the registration form, so it mixes two intents. For demo-focused campaigns, optimise for the custom `DemoRequest` event instead.

### Navigation and footer
- **Nav:** Features · How It Works · Pricing · About · Contact | **School login** · Register school · **Book a demo**.
- **New `/school-login`:** asks for the school's web address (it accepts a pasted URL), checks the school exists, and sends the user to that school's own login page. Platform staff login moved to the footer.
- **Footer:** only links that work. Privacy and Terms were removed because they pointed nowhere; see the next steps.
- **Nav scroll bug fixed.**

### SEO and safety
- Title "School Management Software for Nigerian Schools | Nuventa Cloud" on the platform homepage only; schools keep their own titles. New meta description.
- Sitemap adds `/book-demo` and `/contact` and drops `/school_activities` (a school page). The school sitemaps drop `/how-to-apply`.
- Platform-only pages (`/how-to-apply`, `/book-demo`, `/school-login`) now redirect to the school's homepage on a school's subdomain. Before, a school's visitors could land on Nuventa's onboarding page.

### Files
Backend: `tenants/models.py`, `serializers.py`, `views.py`, `urls.py`, `middleware.py`, `migrations/0024_demo_request_and_whatsapp.py` (additive: one new table, one blank field), `test_demo_requests.py`, `config/sitemaps.py`.
Frontend: `pages/Landing.tsx`, `pages/BookDemoPage.tsx`, `pages/SchoolLoginFinderPage.tsx`, `components/home/{HeroSection,Nav,Footer,DemoRequestForm,WhatsAppButton}.tsx`, `components/home/landing/*`, `components/contact/PlatformContact.tsx`, `components/platform-admin/{DemoRequestsPanel,PlatformContentPanel}.tsx`, `pages/SuperAdminDashbaord.tsx`, `hooks/usePlatformContent.ts`, `hooks/useAuthLost.tsx`, `routes/index.tsx`, `components/{TitleManager,MetaTagManager}.tsx`, `index.html`.

### Validation
- 15 new backend tests pass: form, validation, honeypot, rate limit, stale-cookie case, admin-only reads, no deletes, and the WhatsApp field.
- The production build passes. Type-check shows no errors in changed files; the repo has 420 errors that were already there.
- `npm run lint` can't run: `eslint.config.js` uses `module.exports` in an ESM package. This was already broken.
- In the browser (desktop, 375px mobile, dark mode): homepage, anchor nav, mobile menu, demo form validation and success (with the submit stubbed, so no real email was sent), school-login with unknown and real schools, and the subdomain redirect.
- **Not checked visually:** the Demo Requests tab, which needs a platform-admin login. It's covered by API tests and type-check.

---

## 3. Marketing plan (Abuja first)

The funnel to measure: **contact → demo booked → demo held → registered → first invoice paid → renewed next term.** The Demo Requests tab now records the first four steps; billing covers the rest.

**Direct outreach (highest return early)**
- Build a list of 150–200 private schools in Abuja: Gwarinpa, Lugbe, Kubwa, Wuse, Garki, Maitama, Lokogoma, Life Camp. Use Google Maps and proprietors' associations.
- Visit or call proprietors with one specific offer: *"We'll set up your next term's results for free so you can see the report cards."* Results are the sharpest pain.
- Book 20-minute demos. Follow up within 24 hours on WhatsApp.
- Target to check after 8 weeks: of 100 contacted, how many book demos, and how many of those pay.

**WhatsApp Business**
- Set the business number in Site Content so the button appears.
- Add a catalogue with one item per module (Results, CBT, Fees, Attendance), each with a screenshot.
- Save quick replies for pricing questions, the demo link and the registration link. Label chats by funnel stage.

**Facebook and Instagram**
- One campaign per pain point (results, CBT ahead of mock exams, fee collection), each sending visitors to `/book-demo?utm_source=facebook&utm_campaign=<topic>`.
- Optimise for the `DemoRequest` event. Target proprietors and administrators in Abuja.
- Use real screenshots from a demo school with made-up data, never a real school's.

**Google Search**
- Search terms: "school management software Nigeria", "result management software for schools", "CBT software for schools Nigeria", "school portal Abuja".
- Build two or three landing pages that match these searches: a results page, a CBT page with the offline station, and a fees-and-Paystack page. The homepage sections are a good starting point.
- Set up Google Search Console and submit the sitemap.

**Referrals and partnerships**
- Existing schools: one free term of Basic for each referred school that pays its first invoice. This is self-funding because it is only paid after revenue.
- Education consultants and proprietors' associations: a flat commission of the first paid invoice. The marketer role and referral codes already exist in the platform admin.

---

## 4. Financial sustainability

Track monthly, in a sheet or a future Platform admin → Billing view:

| Metric | Source |
|---|---|
| Active schools / paying schools | Tenants list; paid invoices this term |
| MRR | Term invoices ÷ 4 months (or session invoices ÷ 12) |
| Revenue by service (Basic, CBT, Gate, SMS) | Invoice line items |
| Hosting, DB, Brevo, Termii, Cloudinary, Anthropic costs | Provider bills |
| Marketing spend; cost per paying school | Ad accounts ÷ new paying schools |
| Term renewal rate; churn | Schools invoiced last term that paid this term |
| ARPS (average revenue per school) | Revenue ÷ paying schools |
| Contribution margin | Revenue − (variable costs: SMS, payment fees, per-school storage) |

**Break-even** (fill in the real monthly cost):
`schools needed = monthly fixed costs ÷ (average students × price per student per term × 3 ÷ 12)`.

For example, at the standard ₦800 per student per term, a 200-student school pays ₦160,000 a term, about **₦40,000 a month**. If fixed costs were ₦X a month, you'd need X ÷ 40,000 schools of that size. The actual cost figures weren't supplied, so no break-even number is given here.

**Infrastructure:** measure before changing anything. Check DB connection counts and slow queries (the prod pooler is shared; see the note about never using `SET SESSION`), Cloudinary storage per school, and Render instance sizing. On the frontend, the main JS bundle is **483 kB (149 kB gzipped)** and loads for every marketing visitor. Splitting the dashboard code out of the marketing entry would speed up first load on mobile data.

---

## 5. Pricing experiments (your call; nothing changed in billing)

1. **Publish a "from" price.** Show "from ₦800 per student per term" on the Pricing section and compare demo requests over a month against quote-only. Showing the price filters out schools that can't afford it, and reassures those that can.
2. **Session prepayment discount.** `TenantPricing` already supports a separate per-session price. Offer three terms for the price of about 2.7, paid upfront. This fits schools that collect a session's fees in the first term.
3. **Minimum charge per school**, so a 40-student school still covers its own costs.
4. **Paid setup service**: records import, the first report cards and staff training, for schools that want it done for them.
5. **Stats strip:** replace "10+ schools / 8+ years / 10+ developers" with numbers the database supports, for example report cards produced or students on the platform. Or remove it until there's a figure you're happy to defend.

---

## 6. Next three actions

1. **Set the WhatsApp number and check the contact email** under Site Content. Make sure support@nuventacloud.com (or whatever email is set) is read daily, since demo requests go there.
2. **Take five screenshots from a demo school with made-up data:** a report card, a CBT exam screen, the parent dashboard, fees, and attendance. Add them to the Features section and the ads. They're the biggest missing trust signal.
3. **Publish a Privacy Policy and Terms of Service.** Schools are trusting you with children's data, and NDPA 2023 applies. Then restore the footer links.
