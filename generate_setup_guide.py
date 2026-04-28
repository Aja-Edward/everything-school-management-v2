"""
Run from repo root:  python generate_setup_guide.py
Output:  tenant_setup_guide.pdf
"""

HTML_CONTENT = """
<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8"/>
<style>
  @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&display=swap');

  :root {
    --blue:    #2563EB;
    --blue-lt: #EFF6FF;
    --blue-dk: #1E40AF;
    --gray:    #6B7280;
    --gray-lt: #F9FAFB;
    --gray-dk: #111827;
    --border:  #E5E7EB;
    --green:   #059669;
    --green-lt:#ECFDF5;
    --amber:   #D97706;
    --amber-lt:#FFFBEB;
    --red:     #DC2626;
  }

  * { box-sizing: border-box; margin: 0; padding: 0; }

  body {
    font-family: 'Inter', 'Segoe UI', Arial, sans-serif;
    font-size: 9.5pt;
    color: var(--gray-dk);
    background: #fff;
    line-height: 1.55;
  }

  /* ── COVER PAGE ─────────────────────────────────────────── */
  .cover {
    page-break-after: always;
    min-height: 100vh;
    background: linear-gradient(145deg, #1E3A8A 0%, #2563EB 50%, #3B82F6 100%);
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    padding: 60px 40px;
    text-align: center;
    color: #fff;
  }
  .cover-badge {
    background: rgba(255,255,255,0.15);
    border: 1px solid rgba(255,255,255,0.3);
    border-radius: 100px;
    padding: 6px 20px;
    font-size: 8pt;
    font-weight: 600;
    letter-spacing: 2px;
    text-transform: uppercase;
    margin-bottom: 32px;
  }
  .cover h1 {
    font-size: 34pt;
    font-weight: 800;
    line-height: 1.1;
    margin-bottom: 16px;
    letter-spacing: -0.5px;
  }
  .cover h1 span { color: #93C5FD; }
  .cover-sub {
    font-size: 13pt;
    opacity: 0.85;
    max-width: 480px;
    margin: 0 auto 48px;
    font-weight: 400;
  }
  .cover-stats {
    display: flex;
    gap: 24px;
    justify-content: center;
    flex-wrap: wrap;
    margin-bottom: 56px;
  }
  .cover-stat {
    background: rgba(255,255,255,0.12);
    border: 1px solid rgba(255,255,255,0.2);
    border-radius: 12px;
    padding: 16px 24px;
    min-width: 120px;
  }
  .cover-stat .num { font-size: 22pt; font-weight: 700; }
  .cover-stat .lbl { font-size: 7.5pt; opacity: 0.75; text-transform: uppercase; letter-spacing: 1px; margin-top: 2px; }
  .cover-footer {
    border-top: 1px solid rgba(255,255,255,0.2);
    padding-top: 24px;
    font-size: 8pt;
    opacity: 0.6;
    letter-spacing: 0.5px;
  }

  /* ── PAGE LAYOUT ────────────────────────────────────────── */
  .page { padding: 36px 44px 44px; }

  @page {
    size: A4;
    margin: 0;
  }

  /* ── SECTION HEADERS ────────────────────────────────────── */
  .section-header {
    page-break-before: always;
    display: flex;
    align-items: flex-start;
    gap: 14px;
    background: var(--blue-lt);
    border-left: 5px solid var(--blue);
    border-radius: 0 10px 10px 0;
    padding: 18px 20px;
    margin: 0 0 20px;
  }
  .section-header .icon {
    font-size: 22pt;
    line-height: 1;
    margin-top: 2px;
  }
  .section-header .title-wrap .phase {
    font-size: 7pt;
    font-weight: 700;
    color: var(--blue);
    text-transform: uppercase;
    letter-spacing: 1.5px;
    margin-bottom: 3px;
  }
  .section-header .title-wrap h2 {
    font-size: 14pt;
    font-weight: 700;
    color: var(--blue-dk);
    line-height: 1.2;
  }
  .section-header .title-wrap p {
    font-size: 8.5pt;
    color: var(--gray);
    margin-top: 4px;
  }

  /* ── TOC ────────────────────────────────────────────────── */
  .toc-page { page-break-after: always; padding: 36px 44px; }
  .toc-title {
    font-size: 18pt;
    font-weight: 700;
    color: var(--blue-dk);
    margin-bottom: 6px;
  }
  .toc-subtitle { font-size: 9pt; color: var(--gray); margin-bottom: 28px; }
  .toc-item {
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 9px 14px;
    border-radius: 8px;
    margin-bottom: 4px;
  }
  .toc-item:nth-child(odd) { background: var(--gray-lt); }
  .toc-num {
    background: var(--blue);
    color: #fff;
    border-radius: 50%;
    width: 22px;
    height: 22px;
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 7.5pt;
    font-weight: 700;
    flex-shrink: 0;
  }
  .toc-icon { font-size: 12pt; }
  .toc-label { font-size: 9.5pt; font-weight: 600; color: var(--gray-dk); flex: 1; }
  .toc-desc { font-size: 8pt; color: var(--gray); }

  /* ── CHECKLIST ──────────────────────────────────────────── */
  .checklist-grid {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 8px;
    margin-bottom: 20px;
  }
  .check-item {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 8px 12px;
    background: var(--gray-lt);
    border-radius: 7px;
    border: 1px solid var(--border);
  }
  .check-box {
    width: 16px;
    height: 16px;
    border: 2px solid var(--border);
    border-radius: 4px;
    flex-shrink: 0;
    background: #fff;
  }
  .check-text { font-size: 8.5pt; font-weight: 500; }

  /* ── TABLES ─────────────────────────────────────────────── */
  table {
    width: 100%;
    border-collapse: collapse;
    margin: 10px 0 20px;
    font-size: 8.5pt;
  }
  thead tr {
    background: var(--blue-dk);
    color: #fff;
  }
  thead th {
    padding: 8px 10px;
    text-align: left;
    font-weight: 600;
    font-size: 8pt;
    letter-spacing: 0.3px;
  }
  thead th:first-child { border-radius: 6px 0 0 0; }
  thead th:last-child  { border-radius: 0 6px 0 0; }
  tbody tr:nth-child(even) { background: var(--gray-lt); }
  tbody tr:hover { background: var(--blue-lt); }
  tbody td {
    padding: 7px 10px;
    border-bottom: 1px solid var(--border);
    vertical-align: top;
  }

  /* ── BADGES ─────────────────────────────────────────────── */
  .badge {
    display: inline-block;
    padding: 2px 8px;
    border-radius: 100px;
    font-size: 7pt;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.5px;
  }
  .badge-req  { background: #FEE2E2; color: var(--red); }
  .badge-opt  { background: #ECFDF5; color: var(--green); }
  .badge-sys  { background: #EDE9FE; color: #7C3AED; }
  .badge-cond { background: var(--amber-lt); color: var(--amber); }

  /* ── CALLOUT BOXES ──────────────────────────────────────── */
  .callout {
    border-radius: 8px;
    padding: 12px 14px;
    margin: 10px 0 18px;
    display: flex;
    gap: 10px;
    align-items: flex-start;
    font-size: 8.5pt;
  }
  .callout-info  { background: var(--blue-lt);  border-left: 4px solid var(--blue); }
  .callout-tip   { background: var(--green-lt); border-left: 4px solid var(--green); }
  .callout-warn  { background: var(--amber-lt); border-left: 4px solid var(--amber); }
  .callout-icon  { font-size: 12pt; flex-shrink: 0; margin-top: 1px; }
  .callout p     { margin: 0; line-height: 1.5; color: var(--gray-dk); }
  .callout strong{ color: var(--gray-dk); }

  /* ── SUBSECTION ─────────────────────────────────────────── */
  .subsection-title {
    font-size: 10pt;
    font-weight: 700;
    color: var(--blue-dk);
    margin: 18px 0 8px;
    padding-bottom: 5px;
    border-bottom: 2px solid var(--blue-lt);
  }

  /* ── STEP FLOW ──────────────────────────────────────────── */
  .steps { display: flex; flex-direction: column; gap: 8px; margin-bottom: 20px; }
  .step {
    display: flex;
    gap: 12px;
    align-items: flex-start;
    padding: 10px 14px;
    border: 1px solid var(--border);
    border-radius: 8px;
    background: #fff;
  }
  .step-num {
    background: var(--blue);
    color: #fff;
    border-radius: 50%;
    width: 24px;
    height: 24px;
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 8pt;
    font-weight: 700;
    flex-shrink: 0;
    margin-top: 1px;
  }
  .step-body .step-title { font-weight: 600; font-size: 9pt; color: var(--gray-dk); }
  .step-body .step-desc  { font-size: 8pt; color: var(--gray); margin-top: 2px; }

  /* ── PILLS ──────────────────────────────────────────────── */
  .pill-group { display: flex; flex-wrap: wrap; gap: 6px; margin: 8px 0 14px; }
  .pill {
    background: var(--blue-lt);
    color: var(--blue-dk);
    border: 1px solid #BFDBFE;
    border-radius: 100px;
    padding: 3px 11px;
    font-size: 8pt;
    font-weight: 500;
  }

  /* ── PAGE NUMBER ────────────────────────────────────────── */
  .page-num {
    text-align: center;
    font-size: 7.5pt;
    color: var(--gray);
    margin-top: 24px;
    padding-top: 10px;
    border-top: 1px solid var(--border);
  }
  .footer-brand { font-weight: 600; color: var(--blue); }

  /* ── MISC ───────────────────────────────────────────────── */
  ul { padding-left: 18px; }
  li { margin-bottom: 4px; font-size: 8.5pt; }
  p  { margin-bottom: 8px; font-size: 9pt; }
  h3 { font-size: 10pt; font-weight: 700; margin: 14px 0 6px; color: var(--gray-dk); }
  .mb { margin-bottom: 20px; }
  .mt { margin-top: 16px; }
</style>
</head>
<body>

<!-- ══════════════════════════════════════════════════════ -->
<!-- COVER                                                  -->
<!-- ══════════════════════════════════════════════════════ -->
<div class="cover">
  <div class="cover-badge">Platform Documentation · 2026</div>
  <h1>Tenant <span>Setup</span><br/>Complete Guide</h1>
  <p class="cover-sub">Everything a school administrator needs to configure for a fully operational Nuventa Cloud portal.</p>
  <div class="cover-stats">
    <div class="cover-stat"><div class="num">10</div><div class="lbl">Setup Phases</div></div>
    <div class="cover-stat"><div class="num">150+</div><div class="lbl">Config Fields</div></div>
    <div class="cover-stat"><div class="num">13</div><div class="lbl">Checklist Items</div></div>
  </div>
  <div class="cover-footer">Nuventa Cloud · nuventacloud.com · School Management Platform</div>
</div>

<!-- ══════════════════════════════════════════════════════ -->
<!-- TABLE OF CONTENTS                                      -->
<!-- ══════════════════════════════════════════════════════ -->
<div class="toc-page">
  <div class="toc-title">Table of Contents</div>
  <div class="toc-subtitle">This guide walks through all 10 setup phases in the order they should be completed.</div>

  <div class="toc-item"><div class="toc-num">1</div><div class="toc-icon">📝</div><div class="toc-label">Initial Registration</div><div class="toc-desc">School info, admin credentials, billing period</div></div>
  <div class="toc-item"><div class="toc-num">2</div><div class="toc-icon">⚙️</div><div class="toc-label">Service Selection</div><div class="toc-desc">Choose optional features and review pricing</div></div>
  <div class="toc-item"><div class="toc-num">3</div><div class="toc-icon">🏫</div><div class="toc-label">General Settings</div><div class="toc-desc">School profile, branding, localization</div></div>
  <div class="toc-item"><div class="toc-num">4</div><div class="toc-icon">🎨</div><div class="toc-label">Design & Appearance</div><div class="toc-desc">Theme, colors, typography, layout options</div></div>
  <div class="toc-item"><div class="toc-num">5</div><div class="toc-icon">📚</div><div class="toc-label">Academic Structure</div><div class="toc-desc">Calendar, grading, attendance, curriculum</div></div>
  <div class="toc-item"><div class="toc-num">6</div><div class="toc-icon">🔐</div><div class="toc-label">Security</div><div class="toc-desc">Authentication, password policy, session rules</div></div>
  <div class="toc-item"><div class="toc-num">7</div><div class="toc-icon">📬</div><div class="toc-label">Communication</div><div class="toc-desc">Email (Brevo) and SMS (Twilio) configuration</div></div>
  <div class="toc-item"><div class="toc-num">8</div><div class="toc-icon">🌐</div><div class="toc-label">Domain Setup</div><div class="toc-desc">Subdomain or custom domain with DNS verification</div></div>
  <div class="toc-item"><div class="toc-num">9</div><div class="toc-icon">🖥️</div><div class="toc-label">Landing Page</div><div class="toc-desc">Public website: hero, sections, footer, socials</div></div>
  <div class="toc-item"><div class="toc-num">10</div><div class="toc-icon">💰</div><div class="toc-label">Finance & Billing</div><div class="toc-desc">Fee structure, discounts, payment methods, tax</div></div>

  <div class="callout callout-info mt">
    <div class="callout-icon">ℹ️</div>
    <p><strong>Legend — </strong>
      <span class="badge badge-req">Required</span> Must be filled before saving. &nbsp;
      <span class="badge badge-opt">Optional</span> Can be skipped or filled later. &nbsp;
      <span class="badge badge-cond">Conditional</span> Required only if a related feature is enabled. &nbsp;
      <span class="badge badge-sys">System</span> Auto-generated, no input needed.
    </p>
  </div>
</div>

<!-- ══════════════════════════════════════════════════════ -->
<!-- PHASE 1: REGISTRATION                                  -->
<!-- ══════════════════════════════════════════════════════ -->
<div class="page">
  <div class="section-header">
    <div class="icon">📝</div>
    <div class="title-wrap">
      <div class="phase">Phase 1</div>
      <h2>Initial Registration</h2>
      <p>Completed once at <strong>nuventacloud.com/onboarding/register</strong> — creates the school account and first admin user.</p>
    </div>
  </div>

  <table>
    <thead>
      <tr><th>Field</th><th>Type</th><th>Status</th><th>Notes</th></tr>
    </thead>
    <tbody>
      <tr><td>School Name</td><td>Text</td><td><span class="badge badge-req">Required</span></td><td>Full official name of the school</td></tr>
      <tr><td>School Slug</td><td>Text (auto-suggest)</td><td><span class="badge badge-req">Required</span></td><td>URL-safe ID — becomes your subdomain (e.g. <em>my-school.nuventacloud.com</em>). Must be unique.</td></tr>
      <tr><td>Admin First Name</td><td>Text</td><td><span class="badge badge-req">Required</span></td><td>Name of the primary school administrator</td></tr>
      <tr><td>Admin Last Name</td><td>Text</td><td><span class="badge badge-req">Required</span></td><td></td></tr>
      <tr><td>Admin Email</td><td>Email</td><td><span class="badge badge-req">Required</span></td><td>Used for login and notifications. Must be unique across the platform.</td></tr>
      <tr><td>Admin Phone</td><td>Phone</td><td><span class="badge badge-opt">Optional</span></td><td>Contact number for the administrator</td></tr>
      <tr><td>Password</td><td>Password</td><td><span class="badge badge-req">Required</span></td><td>Minimum 8 characters</td></tr>
      <tr><td>Confirm Password</td><td>Password</td><td><span class="badge badge-req">Required</span></td><td>Must match the password field</td></tr>
      <tr><td>Billing Period</td><td>Select</td><td><span class="badge badge-req">Required</span></td><td><strong>Term</strong> — billed every school term. <strong>Session</strong> — billed once per academic year.</td></tr>
    </tbody>
  </table>

  <div class="callout callout-tip">
    <div class="callout-icon">✅</div>
    <p>After registration, you receive a one-time <strong>setup link</strong> (valid 15 minutes) that redirects you to your school subdomain to complete onboarding. Check your email or copy the link immediately.</p>
  </div>
</div>

<!-- ══════════════════════════════════════════════════════ -->
<!-- PHASE 2: SERVICES                                      -->
<!-- ══════════════════════════════════════════════════════ -->
<div class="page">
  <div class="section-header">
    <div class="icon">⚙️</div>
    <div class="title-wrap">
      <div class="phase">Phase 2</div>
      <h2>Service Selection</h2>
      <p>Choose which platform features to enable. Pricing is per-student and added to your billing.</p>
    </div>
  </div>

  <div class="subsection-title">Core Services (Always Enabled)</div>
  <div class="pill-group">
    <span class="pill">Examinations</span>
    <span class="pill">Results Management</span>
  </div>

  <div class="subsection-title">Optional Services — Select as Needed</div>
  <table>
    <thead>
      <tr><th>Category</th><th>Service</th><th>Description</th></tr>
    </thead>
    <tbody>
      <tr><td>Assessment</td><td>Exam Proofreading</td><td>Review and approve exams before publishing</td></tr>
      <tr><td>Assessment</td><td>AI Question Generator</td><td>Auto-generate exam questions using AI</td></tr>
      <tr><td>Assessment</td><td>Question Bank</td><td>Store and reuse questions across exams</td></tr>
      <tr><td>Assessment</td><td>Exam Builder</td><td>Advanced drag-and-drop exam construction</td></tr>
      <tr><td>Tracking</td><td>Attendance System</td><td>Daily student attendance recording and reporting</td></tr>
      <tr><td>Tracking</td><td>Arrival Notifications</td><td>Notify parents when students arrive/leave</td></tr>
      <tr><td>Communication</td><td>SMS Notifications</td><td>Send SMS alerts to parents and staff</td></tr>
      <tr><td>Finance</td><td>Fees &amp; Payments</td><td>Manage school fees, invoices, and payment tracking</td></tr>
      <tr><td>Scheduling</td><td>Timetable Management</td><td>Create and manage class timetables</td></tr>
    </tbody>
  </table>

  <div class="callout callout-warn">
    <div class="callout-icon">⚠️</div>
    <p><strong>Pricing Note:</strong> Monthly cost = <strong>(Base price per student + sum of enabled service prices) × number of students</strong>. Services can be enabled or disabled later from the Settings → Services tab.</p>
  </div>
</div>

<!-- ══════════════════════════════════════════════════════ -->
<!-- PHASE 3: GENERAL SETTINGS                             -->
<!-- ══════════════════════════════════════════════════════ -->
<div class="page">
  <div class="section-header">
    <div class="icon">🏫</div>
    <div class="title-wrap">
      <div class="phase">Phase 3 · Settings → General Tab</div>
      <h2>General Settings</h2>
      <p>Core school profile information, branding assets, and regional preferences.</p>
    </div>
  </div>

  <div class="subsection-title">School Information</div>
  <table>
    <thead><tr><th>Field</th><th>Status</th><th>Notes</th></tr></thead>
    <tbody>
      <tr><td>School Name</td><td><span class="badge badge-req">Required</span></td><td>Displayed across all portals and documents</td></tr>
      <tr><td>School Code</td><td><span class="badge badge-req">Required</span></td><td>Short code (max 10 chars, e.g. "HIS") used in auto-generated usernames</td></tr>
      <tr><td>Site Name</td><td><span class="badge badge-opt">Optional</span></td><td>Alternate display name for the portal</td></tr>
      <tr><td>Address</td><td><span class="badge badge-opt">Optional</span></td><td>Full physical address of the school</td></tr>
      <tr><td>Phone</td><td><span class="badge badge-opt">Optional</span></td><td>Main school contact number</td></tr>
      <tr><td>Email</td><td><span class="badge badge-req">Required</span></td><td>Official school contact email</td></tr>
      <tr><td>Motto</td><td><span class="badge badge-opt">Optional</span></td><td>School motto displayed on landing page and result sheets (max 500 chars)</td></tr>
    </tbody>
  </table>

  <div class="subsection-title">Branding Assets</div>
  <table>
    <thead><tr><th>Asset</th><th>Status</th><th>Format &amp; Size</th><th>Usage</th></tr></thead>
    <tbody>
      <tr><td>School Logo</td><td><span class="badge badge-opt">Optional</span></td><td>PNG/JPG/SVG · Max 2 MB</td><td>Navbar, footer, result sheets, portals</td></tr>
      <tr><td>Favicon</td><td><span class="badge badge-opt">Optional</span></td><td>ICO/PNG · Max 1 MB · 32×32 px recommended</td><td>Browser tab icon for your school subdomain</td></tr>
    </tbody>
  </table>

  <div class="callout callout-info">
    <div class="callout-icon">ℹ️</div>
    <p>If no logo is uploaded, the platform defaults to the <strong>Nuventa Cloud</strong> logo. Upload your school logo to brand the portal completely for your school.</p>
  </div>

  <div class="subsection-title">Localization</div>
  <table>
    <thead><tr><th>Setting</th><th>Default</th><th>Options</th></tr></thead>
    <tbody>
      <tr><td>Timezone</td><td>UTC</td><td>UTC-12 through UTC+12 (e.g. Africa/Lagos for Nigeria)</td></tr>
      <tr><td>Date Format</td><td>dd/mm/yyyy</td><td>dd/mm/yyyy · mm/dd/yyyy · yyyy-mm-dd · dd-mm-yyyy</td></tr>
      <tr><td>Language</td><td>English</td><td>English, Français, Español, Deutsch, 中文, العربية</td></tr>
    </tbody>
  </table>
</div>

<!-- ══════════════════════════════════════════════════════ -->
<!-- PHASE 4: DESIGN                                        -->
<!-- ══════════════════════════════════════════════════════ -->
<div class="page">
  <div class="section-header">
    <div class="icon">🎨</div>
    <div class="title-wrap">
      <div class="phase">Phase 4 · Settings → Design Tab</div>
      <h2>Design &amp; Appearance</h2>
      <p>Customise the visual look and feel of your school portal across all user-facing pages.</p>
    </div>
  </div>

  <div class="subsection-title">Theme &amp; Colors</div>
  <table>
    <thead><tr><th>Setting</th><th>Default</th><th>Options</th></tr></thead>
    <tbody>
      <tr><td>Theme</td><td>Default</td><td>default · modern · classic · vibrant · minimal · corporate · premium · dark · obsidian · aurora · midnight · crimson · forest · golden</td></tr>
      <tr><td>Primary Color</td><td>#3B82F6</td><td>Any hex color or 12 preset palette colors</td></tr>
      <tr><td>Typography</td><td>Inter</td><td>Inter · Roboto · Open Sans · Poppins · Montserrat</td></tr>
    </tbody>
  </table>

  <div class="subsection-title">Layout &amp; Style Options</div>
  <table>
    <thead><tr><th>Setting</th><th>Default</th><th>Options</th></tr></thead>
    <tbody>
      <tr><td>Border Radius</td><td>rounded-lg</td><td>none · sm · md (rounded-lg) · lg · xl</td></tr>
      <tr><td>Shadow Style</td><td>shadow-md</td><td>none · sm · md · lg · xl</td></tr>
      <tr><td>Animations</td><td>Enabled</td><td>Toggle on/off</td></tr>
      <tr><td>Compact Mode</td><td>Off</td><td>Reduces padding/spacing for denser layouts</td></tr>
      <tr><td>Dark Mode</td><td>Off</td><td>Dark background across all portals</td></tr>
      <tr><td>High Contrast</td><td>Off</td><td>Accessibility — increases text/background contrast</td></tr>
    </tbody>
  </table>
</div>

<!-- ══════════════════════════════════════════════════════ -->
<!-- PHASE 5: ACADEMIC                                      -->
<!-- ══════════════════════════════════════════════════════ -->
<div class="page">
  <div class="section-header">
    <div class="icon">📚</div>
    <div class="title-wrap">
      <div class="phase">Phase 5 · Settings → Academic Tab</div>
      <h2>Academic Structure</h2>
      <p>Configure the school calendar, grading system, attendance rules, and curriculum structure.</p>
    </div>
  </div>

  <div class="subsection-title">Academic Calendar</div>
  <table>
    <thead><tr><th>Field</th><th>Default</th><th>Status</th></tr></thead>
    <tbody>
      <tr><td>Academic Year Start Month</td><td>September</td><td><span class="badge badge-req">Required</span></td></tr>
      <tr><td>Academic Year End Month</td><td>July</td><td><span class="badge badge-req">Required</span></td></tr>
      <tr><td>Number of Terms per Year</td><td>3</td><td><span class="badge badge-req">Required</span></td></tr>
      <tr><td>Weeks per Term</td><td>13</td><td><span class="badge badge-req">Required</span></td></tr>
    </tbody>
  </table>

  <div class="subsection-title">Grading System</div>
  <table>
    <thead><tr><th>Field</th><th>Default</th><th>Options</th></tr></thead>
    <tbody>
      <tr><td>Grading System</td><td>Percentage</td><td>Percentage · Letter Grade · GPA · Points</td></tr>
      <tr><td>Pass Percentage</td><td>40%</td><td>0–100</td></tr>
      <tr><td>Grade Curving</td><td>Off</td><td>Automatically adjust grade distributions</td></tr>
      <tr><td>Grade Weighting</td><td>On</td><td>Apply different weights to assessment types</td></tr>
    </tbody>
  </table>

  <div class="subsection-title">Attendance</div>
  <table>
    <thead><tr><th>Field</th><th>Default</th></tr></thead>
    <tbody>
      <tr><td>Enable Attendance Tracking</td><td>On</td></tr>
      <tr><td>Require Attendance</td><td>On</td></tr>
      <tr><td>Minimum Attendance %</td><td>75%</td></tr>
      <tr><td>Allow Late Arrival</td><td>On</td></tr>
    </tbody>
  </table>

  <div class="subsection-title">Curriculum &amp; Class Structure</div>
  <div class="callout callout-warn">
    <div class="callout-icon">⚠️</div>
    <p><strong>These must be created manually</strong> in the platform after initial setup, as they are school-specific:</p>
  </div>
  <table>
    <thead><tr><th>Item to Create</th><th>Examples</th></tr></thead>
    <tbody>
      <tr><td>Education Levels</td><td>Nursery, Primary, Junior Secondary, Senior Secondary</td></tr>
      <tr><td>Grade Levels / Classes</td><td>Primary 1–6, JSS 1–3, SSS 1–3</td></tr>
      <tr><td>Streams</td><td>Science, Arts, Commercial, General</td></tr>
      <tr><td>Subjects</td><td>Mathematics, English, Physics, Economics…</td></tr>
      <tr><td>Academic Sessions</td><td>2025/2026, 2026/2027</td></tr>
      <tr><td>Terms</td><td>First Term, Second Term, Third Term</td></tr>
    </tbody>
  </table>
</div>

<!-- ══════════════════════════════════════════════════════ -->
<!-- PHASE 6: SECURITY                                      -->
<!-- ══════════════════════════════════════════════════════ -->
<div class="page">
  <div class="section-header">
    <div class="icon">🔐</div>
    <div class="title-wrap">
      <div class="phase">Phase 6 · Settings → Security Tab</div>
      <h2>Security Settings</h2>
      <p>Control how users authenticate and manage their accounts on your school portal.</p>
    </div>
  </div>

  <div class="subsection-title">Session &amp; Login</div>
  <table>
    <thead><tr><th>Field</th><th>Default</th><th>Description</th></tr></thead>
    <tbody>
      <tr><td>Require Email Verification</td><td>On</td><td>New users must verify email before accessing portal</td></tr>
      <tr><td>Session Timeout</td><td>30 min</td><td>Idle time before user is automatically logged out</td></tr>
      <tr><td>Max Login Attempts</td><td>5</td><td>Failed attempts before account is temporarily locked</td></tr>
      <tr><td>Account Lock Duration</td><td>15 min</td><td>How long account stays locked after max attempts</td></tr>
    </tbody>
  </table>

  <div class="subsection-title">Password Policy</div>
  <table>
    <thead><tr><th>Field</th><th>Default</th><th>Range</th></tr></thead>
    <tbody>
      <tr><td>Minimum Password Length</td><td>8</td><td>6–20 characters</td></tr>
      <tr><td>Require Numbers</td><td>On</td><td>—</td></tr>
      <tr><td>Require Uppercase</td><td>Off</td><td>—</td></tr>
      <tr><td>Require Symbols</td><td>Off</td><td>—</td></tr>
      <tr><td>Password Expiry</td><td>90 days</td><td>30–365 days</td></tr>
    </tbody>
  </table>
</div>

<!-- ══════════════════════════════════════════════════════ -->
<!-- PHASE 7: COMMUNICATION                                 -->
<!-- ══════════════════════════════════════════════════════ -->
<div class="page">
  <div class="section-header">
    <div class="icon">📬</div>
    <div class="title-wrap">
      <div class="phase">Phase 7 · Settings → Communication Tab</div>
      <h2>Communication</h2>
      <p>Connect third-party providers to send emails and SMS to students, parents, and staff.</p>
    </div>
  </div>

  <div class="subsection-title">Email — Brevo (formerly Sendinblue)</div>
  <div class="callout callout-info">
    <div class="callout-icon">ℹ️</div>
    <p>Create a free account at <strong>brevo.com</strong>, then copy your API key from <em>Account → SMTP &amp; API → API Keys</em>.</p>
  </div>
  <table>
    <thead><tr><th>Field</th><th>Status</th><th>Notes</th></tr></thead>
    <tbody>
      <tr><td>Brevo API Key</td><td><span class="badge badge-cond">Conditional</span></td><td>Required if email notifications are enabled</td></tr>
      <tr><td>Sender Email</td><td><span class="badge badge-cond">Conditional</span></td><td>Must be a verified address in your Brevo account</td></tr>
      <tr><td>Sender Name</td><td><span class="badge badge-cond">Conditional</span></td><td>Display name shown to email recipients (e.g., "Kebi Academy")</td></tr>
      <tr><td>Test Mode</td><td><span class="badge badge-opt">Optional</span></td><td>Prevents real sends while testing configuration</td></tr>
    </tbody>
  </table>

  <div class="subsection-title">SMS — Twilio</div>
  <div class="callout callout-info">
    <div class="callout-icon">ℹ️</div>
    <p>Create an account at <strong>twilio.com</strong>. Your Account SID and Auth Token are on your Twilio Console dashboard. A phone number must be purchased/provisioned.</p>
  </div>
  <table>
    <thead><tr><th>Field</th><th>Status</th><th>Notes</th></tr></thead>
    <tbody>
      <tr><td>Twilio Account SID</td><td><span class="badge badge-cond">Conditional</span></td><td>Required if SMS service was selected in Phase 2</td></tr>
      <tr><td>Twilio Auth Token</td><td><span class="badge badge-cond">Conditional</span></td><td>Keep this secret — treat like a password</td></tr>
      <tr><td>Twilio Phone Number</td><td><span class="badge badge-cond">Conditional</span></td><td>Must be an active Twilio number in E.164 format (e.g. +2348012345678)</td></tr>
      <tr><td>Test Mode</td><td><span class="badge badge-opt">Optional</span></td><td>Logs SMS instead of sending during testing</td></tr>
    </tbody>
  </table>
</div>

<!-- ══════════════════════════════════════════════════════ -->
<!-- PHASE 8: DOMAIN                                        -->
<!-- ══════════════════════════════════════════════════════ -->
<div class="page">
  <div class="section-header">
    <div class="icon">🌐</div>
    <div class="title-wrap">
      <div class="phase">Phase 8 · Settings → Domain Tab</div>
      <h2>Domain Setup</h2>
      <p>Your school is accessible on a Nuventa subdomain by default. Optionally connect a custom domain you own.</p>
    </div>
  </div>

  <div class="subsection-title">Default Subdomain (No Action Needed)</div>
  <table>
    <thead><tr><th>Field</th><th>Status</th><th>Example</th></tr></thead>
    <tbody>
      <tr><td>Subdomain URL</td><td><span class="badge badge-sys">System</span></td><td>your-school.nuventacloud.com</td></tr>
    </tbody>
  </table>

  <div class="subsection-title">Custom Domain (Optional)</div>
  <div class="steps">
    <div class="step"><div class="step-num">1</div><div class="step-body"><div class="step-title">Enter your domain</div><div class="step-desc">Type the domain you own (e.g. portal.myschool.com or myschool.com) in the Custom Domain field.</div></div></div>
    <div class="step"><div class="step-num">2</div><div class="step-body"><div class="step-title">Receive verification token</div><div class="step-desc">The platform generates a unique DNS TXT record value for you.</div></div></div>
    <div class="step"><div class="step-num">3</div><div class="step-body"><div class="step-title">Add DNS record at your registrar</div><div class="step-desc">Add a TXT record: <strong>Host:</strong> _nuventacloud-verify.yourdomain.com &nbsp;|&nbsp; <strong>Value:</strong> [the token]</div></div></div>
    <div class="step"><div class="step-num">4</div><div class="step-body"><div class="step-title">Point domain to Nuventa</div><div class="step-desc">Add a CNAME: <strong>Host:</strong> www &nbsp;|&nbsp; <strong>Value:</strong> cname.vercel-dns.com (or A record to platform IP)</div></div></div>
    <div class="step"><div class="step-num">5</div><div class="step-body"><div class="step-title">Click Verify</div><div class="step-desc">The platform checks DNS. Once verified, your domain goes live. DNS propagation can take up to 48 hours.</div></div></div>
  </div>
</div>

<!-- ══════════════════════════════════════════════════════ -->
<!-- PHASE 9: LANDING PAGE                                  -->
<!-- ══════════════════════════════════════════════════════ -->
<div class="page">
  <div class="section-header">
    <div class="icon">🖥️</div>
    <div class="title-wrap">
      <div class="phase">Phase 9 · Settings → Landing Page Tab</div>
      <h2>Public Landing Page</h2>
      <p>Build a public-facing website for your school that prospective parents and students can visit.</p>
    </div>
  </div>

  <div class="subsection-title">Hero Section</div>
  <table>
    <thead><tr><th>Field</th><th>Status</th><th>Notes</th></tr></thead>
    <tbody>
      <tr><td>Hero Type</td><td><span class="badge badge-req">Required</span></td><td>Static (single image) or Carousel (multiple images)</td></tr>
      <tr><td>Hero Image</td><td><span class="badge badge-opt">Optional</span></td><td>Main banner background image</td></tr>
      <tr><td>Hero Title</td><td><span class="badge badge-opt">Optional</span></td><td>Main heading (max 200 chars)</td></tr>
      <tr><td>Hero Subtitle</td><td><span class="badge badge-opt">Optional</span></td><td>Supporting description text</td></tr>
      <tr><td>CTA Button Text</td><td><span class="badge badge-opt">Optional</span></td><td>Default: "Enter Portal"</td></tr>
      <tr><td>CTA Button URL</td><td><span class="badge badge-opt">Optional</span></td><td>Default: "/login"</td></tr>
      <tr><td>Announcement Ribbon</td><td><span class="badge badge-opt">Optional</span></td><td>Scrolling text bar at top of page (max 300 chars)</td></tr>
    </tbody>
  </table>

  <div class="subsection-title">Content Sections (Add as Many as Needed)</div>
  <table>
    <thead><tr><th>Section Type</th><th>Key Fields</th></tr></thead>
    <tbody>
      <tr><td><strong>About</strong></td><td>Title, Subtitle, Content (markdown), Image</td></tr>
      <tr><td><strong>Admissions</strong></td><td>Title, Deadline, Application Fee, Contact Person (name, email, phone)</td></tr>
      <tr><td><strong>Contact</strong></td><td>Address, Phone, Email, Office Hours, Google Maps embed URL</td></tr>
      <tr><td><strong>Custom</strong></td><td>Title, Subtitle, Markdown content, Image</td></tr>
    </tbody>
  </table>

  <div class="subsection-title">Footer &amp; Social Media</div>
  <table>
    <thead><tr><th>Field</th><th>Status</th></tr></thead>
    <tbody>
      <tr><td>Footer Text</td><td><span class="badge badge-opt">Optional</span></td></tr>
      <tr><td>Facebook URL</td><td><span class="badge badge-opt">Optional</span></td></tr>
      <tr><td>Twitter / X URL</td><td><span class="badge badge-opt">Optional</span></td></tr>
      <tr><td>Instagram URL</td><td><span class="badge badge-opt">Optional</span></td></tr>
      <tr><td>YouTube URL</td><td><span class="badge badge-opt">Optional</span></td></tr>
      <tr><td>Publish Landing Page</td><td><span class="badge badge-req">Required</span></td></tr>
    </tbody>
  </table>
</div>

<!-- ══════════════════════════════════════════════════════ -->
<!-- PHASE 10: FINANCE                                      -->
<!-- ══════════════════════════════════════════════════════ -->
<div class="page">
  <div class="section-header">
    <div class="icon">💰</div>
    <div class="title-wrap">
      <div class="phase">Phase 10 · Settings → Finance Tab</div>
      <h2>Finance &amp; Billing</h2>
      <p>Set up your school's fee structure, discounts, accepted payment methods, and tax settings.</p>
    </div>
  </div>

  <div class="subsection-title">Fee Structure</div>
  <table>
    <thead><tr><th>Field</th><th>Status</th><th>Notes</th></tr></thead>
    <tbody>
      <tr><td>Fee Name</td><td><span class="badge badge-req">Required</span></td><td>e.g. "Tuition Fee", "Development Levy"</td></tr>
      <tr><td>Amount</td><td><span class="badge badge-req">Required</span></td><td>Fee amount in local currency</td></tr>
      <tr><td>Frequency</td><td><span class="badge badge-req">Required</span></td><td>Monthly or Yearly</td></tr>
      <tr><td>Description</td><td><span class="badge badge-opt">Optional</span></td><td>What the fee covers</td></tr>
      <tr><td>Active</td><td><span class="badge badge-opt">Optional</span></td><td>Enable/disable fee without deleting it</td></tr>
    </tbody>
  </table>

  <div class="subsection-title">Discounts</div>
  <table>
    <thead><tr><th>Field</th><th>Notes</th></tr></thead>
    <tbody>
      <tr><td>Discount Name</td><td>e.g. "Sibling Discount", "Early Payment"</td></tr>
      <tr><td>Type</td><td>Percentage (e.g. 10%) or Fixed Amount (e.g. ₦5,000)</td></tr>
      <tr><td>Value</td><td>The discount amount or percentage</td></tr>
    </tbody>
  </table>

  <div class="subsection-title">Payment Methods &amp; Tax</div>
  <table>
    <thead><tr><th>Setting</th><th>Default</th><th>Notes</th></tr></thead>
    <tbody>
      <tr><td>Credit Card</td><td>On</td><td>Enable/disable and set processing fee %</td></tr>
      <tr><td>Bank Transfer</td><td>On</td><td>Enable/disable and set processing fee %</td></tr>
      <tr><td>Cash</td><td>On</td><td>Enable/disable and set processing fee %</td></tr>
      <tr><td>Mobile Money</td><td>Off</td><td>Enable/disable and set processing fee %</td></tr>
      <tr><td>Tax (VAT)</td><td>15%</td><td>Tax name, rate, and tax ID number</td></tr>
    </tbody>
  </table>
</div>

<!-- ══════════════════════════════════════════════════════ -->
<!-- MASTER CHECKLIST                                       -->
<!-- ══════════════════════════════════════════════════════ -->
<div class="page">
  <div class="section-header" style="page-break-before:always;">
    <div class="icon">✅</div>
    <div class="title-wrap">
      <div class="phase">Summary</div>
      <h2>Master Setup Checklist</h2>
      <p>Print this page and tick off each item as your school completes its setup.</p>
    </div>
  </div>

  <div class="checklist-grid">
    <div class="check-item"><div class="check-box"></div><div class="check-text">Register school (name, slug, admin credentials, billing period)</div></div>
    <div class="check-item"><div class="check-box"></div><div class="check-text">Open setup link and complete token exchange</div></div>
    <div class="check-item"><div class="check-box"></div><div class="check-text">Select platform services and confirm pricing</div></div>
    <div class="check-item"><div class="check-box"></div><div class="check-text">Fill school info: name, code, address, phone, email</div></div>
    <div class="check-item"><div class="check-box"></div><div class="check-text">Upload school logo and favicon</div></div>
    <div class="check-item"><div class="check-box"></div><div class="check-text">Set timezone, date format, and language</div></div>
    <div class="check-item"><div class="check-box"></div><div class="check-text">Choose theme, primary color, and typography</div></div>
    <div class="check-item"><div class="check-box"></div><div class="check-text">Set academic calendar (start/end month, terms, weeks)</div></div>
    <div class="check-item"><div class="check-box"></div><div class="check-text">Configure grading system and pass percentage</div></div>
    <div class="check-item"><div class="check-box"></div><div class="check-text">Create education levels, grade levels, and streams</div></div>
    <div class="check-item"><div class="check-box"></div><div class="check-text">Add subjects and assign to grade levels</div></div>
    <div class="check-item"><div class="check-box"></div><div class="check-text">Create the current academic session and terms</div></div>
    <div class="check-item"><div class="check-box"></div><div class="check-text">Configure password policy and session timeout</div></div>
    <div class="check-item"><div class="check-box"></div><div class="check-text">Set up Brevo email (API key, sender email/name)</div></div>
    <div class="check-item"><div class="check-box"></div><div class="check-text">Set up Twilio SMS (if SMS service selected)</div></div>
    <div class="check-item"><div class="check-box"></div><div class="check-text">Verify custom domain (if using own domain)</div></div>
    <div class="check-item"><div class="check-box"></div><div class="check-text">Build and publish public landing page</div></div>
    <div class="check-item"><div class="check-box"></div><div class="check-text">Create fee structure and discount rules</div></div>
    <div class="check-item"><div class="check-box"></div><div class="check-text">Enable payment methods and configure tax</div></div>
    <div class="check-item"><div class="check-box"></div><div class="check-text">Begin enrolling students, teachers, and parents</div></div>
  </div>

  <div class="callout callout-tip mt">
    <div class="callout-icon">🎉</div>
    <p><strong>You're ready!</strong> Once all items above are checked, your school portal is fully operational. Students and parents can log in, view results, track attendance, and make fee payments through your personalised Nuventa Cloud portal.</p>
  </div>

  <div class="page-num">
    <span class="footer-brand">Nuventa Cloud</span> · nuventacloud.com · Tenant Setup Guide · Generated 2026
  </div>
</div>

</body>
</html>
"""

def generate_pdf():
    try:
        from weasyprint import HTML as WeasyHTML
    except ImportError:
        print("WeasyPrint not found. Install with: pip install weasyprint")
        return

    output_path = "tenant_setup_guide.pdf"
    print("Generating PDF...")
    WeasyHTML(string=HTML_CONTENT).write_pdf(output_path)
    print(f"Done! PDF saved to: {output_path}")

if __name__ == "__main__":
    generate_pdf()
