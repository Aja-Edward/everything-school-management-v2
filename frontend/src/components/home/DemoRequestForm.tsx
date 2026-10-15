import React, { useEffect, useRef, useState } from 'react';
import { CheckCircle2, Loader2, MessageCircle } from 'lucide-react';
import api from '@/services/api';
import { trackPixelCustomEvent, trackPixelEvent } from '@/utils/metaPixel';
import { usePlatformContent, whatsappLink } from '@/hooks/usePlatformContent';

/**
 * The marketing site's "Book a free demo" form. Posts to the public
 * /api/tenants/demo-requests/ endpoint, which emails the platform team and
 * lists the request under Platform admin -> Demo Requests.
 *
 * Asks only for what the team needs to call the school back.
 */

interface FormState {
  school_name: string;
  contact_name: string;
  role: string;
  phone: string;
  email: string;
  location: string;
  student_count: string;
  preferred_contact: 'whatsapp' | 'phone' | 'email';
  message: string;
  website: string; // honeypot, hidden from people
}

const EMPTY: FormState = {
  school_name: '', contact_name: '', role: '', phone: '', email: '',
  location: '', student_count: '', preferred_contact: 'whatsapp', message: '', website: '',
};

type Errors = Partial<Record<keyof FormState | 'form', string>>;

const ROLES = ['Proprietor / Director', 'Principal / Head teacher', 'School administrator', 'Teacher', 'Other'];
const STUDENT_COUNTS = ['Under 100', '100–300', '301–600', '601–1,000', 'Over 1,000'];

/** Where the visitor came from, for the team to see which pages and campaigns work. */
const sourceFor = (page: string) => {
  try {
    const q = new URLSearchParams(window.location.search);
    const utm = [q.get('utm_source'), q.get('utm_campaign')].filter(Boolean).join('/');
    return (utm ? `${page} utm:${utm}` : page).slice(0, 120);
  } catch {
    return page;
  }
};

const validate = (f: FormState): Errors => {
  const e: Errors = {};
  if (!f.school_name.trim()) e.school_name = "Enter your school's name.";
  if (!f.contact_name.trim()) e.contact_name = 'Enter your name.';
  const digits = f.phone.replace(/\D/g, '');
  if (digits.length < 10 || digits.length > 15) e.phone = 'Enter a phone number we can reach you on, e.g. 0801 234 5678.';
  if (f.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(f.email)) e.email = 'That email address does not look right.';
  if (f.preferred_contact === 'email' && !f.email) e.email = 'Add an email address, or choose another way to reach you.';
  return e;
};

const inputCls = (hasError: boolean) =>
  `w-full px-3 py-2.5 rounded-lg border text-sm bg-white dark:bg-gray-800 text-gray-900 dark:text-white placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 ${
    hasError ? 'border-red-500' : 'border-gray-300 dark:border-gray-700'
  }`;

const Field: React.FC<{ id: string; label: string; optional?: boolean; error?: string; children: React.ReactNode }> = ({
  id, label, optional, error, children,
}) => (
  <div>
    <label htmlFor={id} className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">
      {label} {optional && <span className="font-normal text-gray-400">(optional)</span>}
    </label>
    {children}
    {error && <p id={`${id}-error`} className="mt-1 text-xs text-red-600 dark:text-red-400">{error}</p>}
  </div>
);

interface Props {
  /** Recorded with the request, e.g. "home" or "book-demo". */
  source: string;
}

const DemoRequestForm: React.FC<Props> = ({ source }) => {
  const [form, setForm] = useState<FormState>(EMPTY);
  const [errors, setErrors] = useState<Errors>({});
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState(false);
  const { content, email } = usePlatformContent();
  const doneRef = useRef<HTMLDivElement>(null);

  // The thank-you is much shorter than the form, so without this a visitor on
  // a phone is left looking at the footer.
  useEffect(() => {
    if (done) doneRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }, [done]);

  const set = <K extends keyof FormState>(key: K, value: FormState[K]) => {
    setForm((f) => ({ ...f, [key]: value }));
    if (errors[key]) setErrors((e) => ({ ...e, [key]: undefined }));
  };

  const onSubmit = async (ev: React.FormEvent) => {
    ev.preventDefault();
    const found = validate(form);
    setErrors(found);
    if (Object.keys(found).length) {
      document.getElementById(`demo-${Object.keys(found)[0]}`)?.focus();
      return;
    }

    setSubmitting(true);
    try {
      await api.post('/api/tenants/demo-requests/', { ...form, source: sourceFor(source) });
      trackPixelEvent('Lead', { content_name: 'Demo Request' });
      trackPixelCustomEvent('DemoRequest', { source });
      setDone(true);
    } catch (err: any) {
      const status = err?.response?.status;
      const data = err?.response?.data;
      if (status === 400 && data && typeof data === 'object') {
        const fieldErrors: Errors = {};
        for (const [k, v] of Object.entries(data)) {
          const msg = Array.isArray(v) ? String(v[0]) : String(v);
          fieldErrors[(k in EMPTY ? k : 'form') as keyof Errors] = msg;
        }
        setErrors(fieldErrors);
      } else if (status === 429) {
        setErrors({ form: `We've had a few requests from this connection already. Please email ${email} instead.` });
      } else {
        setErrors({ form: `We couldn't send your request. Check your connection and try again, or email ${email}.` });
      }
    } finally {
      setSubmitting(false);
    }
  };

  if (done) {
    const wa = whatsappLink(content.contact_whatsapp, `Hello, I just asked for a Nuventa Cloud demo for ${form.school_name}.`);
    return (
      <div ref={doneRef} role="status" className="text-center py-8">
        <CheckCircle2 className="w-12 h-12 text-green-600 mx-auto mb-4" aria-hidden="true" />
        <h3 className="text-lg font-semibold text-gray-900 dark:text-white">Thank you, {form.contact_name.split(' ')[0]}.</h3>
        <p className="mt-2 text-sm text-gray-600 dark:text-gray-400 max-w-sm mx-auto">
          We've received your request for {form.school_name}. Someone from our team will
          contact you on {form.preferred_contact === 'email' ? form.email : form.phone} to arrange your demo.
        </p>
        {wa && (
          <a
            href={wa}
            target="_blank"
            rel="noopener noreferrer"
            onClick={() => trackPixelEvent('Contact', { content_name: 'WhatsApp after demo request' })}
            className="mt-6 inline-flex items-center gap-2 px-4 py-2.5 rounded-lg bg-green-600 hover:bg-green-700 text-white text-sm font-medium"
          >
            <MessageCircle className="w-4 h-4" aria-hidden="true" />
            Message us on WhatsApp now
          </a>
        )}
      </div>
    );
  }

  const describedBy = (k: keyof FormState) => (errors[k] ? `demo-${k}-error` : undefined);

  return (
    <form onSubmit={onSubmit} noValidate className="space-y-4">
      {errors.form && (
        <div role="alert" className="rounded-lg border border-red-200 bg-red-50 dark:bg-red-900/20 dark:border-red-800 px-4 py-3 text-sm text-red-700 dark:text-red-300">
          {errors.form}
        </div>
      )}

      <div className="grid sm:grid-cols-2 gap-4">
        <Field id="demo-school_name" label="School name" error={errors.school_name}>
          <input id="demo-school_name" className={inputCls(!!errors.school_name)} value={form.school_name}
            onChange={(e) => set('school_name', e.target.value)} autoComplete="organization" maxLength={200}
            aria-invalid={!!errors.school_name} aria-describedby={describedBy('school_name')} />
        </Field>
        <Field id="demo-location" label="Town or area" optional error={errors.location}>
          <input id="demo-location" className={inputCls(!!errors.location)} value={form.location}
            onChange={(e) => set('location', e.target.value)} placeholder="e.g. Gwarinpa, Abuja" maxLength={120} />
        </Field>
        <Field id="demo-contact_name" label="Your name" error={errors.contact_name}>
          <input id="demo-contact_name" className={inputCls(!!errors.contact_name)} value={form.contact_name}
            onChange={(e) => set('contact_name', e.target.value)} autoComplete="name" maxLength={120}
            aria-invalid={!!errors.contact_name} aria-describedby={describedBy('contact_name')} />
        </Field>
        <Field id="demo-role" label="Your role" optional>
          <select id="demo-role" className={inputCls(false)} value={form.role} onChange={(e) => set('role', e.target.value)}>
            <option value="">Choose…</option>
            {ROLES.map((r) => <option key={r} value={r}>{r}</option>)}
          </select>
        </Field>
        <Field id="demo-phone" label="Phone / WhatsApp number" error={errors.phone}>
          <input id="demo-phone" type="tel" inputMode="tel" className={inputCls(!!errors.phone)} value={form.phone}
            onChange={(e) => set('phone', e.target.value)} autoComplete="tel" placeholder="0801 234 5678" maxLength={32}
            aria-invalid={!!errors.phone} aria-describedby={describedBy('phone')} />
        </Field>
        <Field id="demo-email" label="Email" optional={form.preferred_contact !== 'email'} error={errors.email}>
          <input id="demo-email" type="email" className={inputCls(!!errors.email)} value={form.email}
            onChange={(e) => set('email', e.target.value)} autoComplete="email" maxLength={254}
            aria-invalid={!!errors.email} aria-describedby={describedBy('email')} />
        </Field>
        <Field id="demo-student_count" label="Number of students" optional>
          <select id="demo-student_count" className={inputCls(false)} value={form.student_count}
            onChange={(e) => set('student_count', e.target.value)}>
            <option value="">Choose…</option>
            {STUDENT_COUNTS.map((c) => <option key={c} value={c}>{c}</option>)}
          </select>
        </Field>
        <fieldset>
          <legend className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">Best way to reach you</legend>
          <div className="flex flex-wrap gap-2">
            {([['whatsapp', 'WhatsApp'], ['phone', 'Call'], ['email', 'Email']] as const).map(([value, label]) => (
              <label key={value}
                className={`cursor-pointer px-3 py-2 rounded-lg border text-sm ${
                  form.preferred_contact === value
                    ? 'border-blue-600 bg-blue-50 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300'
                    : 'border-gray-300 dark:border-gray-700 text-gray-700 dark:text-gray-300'
                }`}>
                <input type="radio" name="preferred_contact" value={value} className="sr-only"
                  checked={form.preferred_contact === value} onChange={() => set('preferred_contact', value)} />
                {label}
              </label>
            ))}
          </div>
        </fieldset>
      </div>

      <Field id="demo-message" label="What would you like to see?" optional>
        <textarea id="demo-message" rows={3} className={inputCls(false)} value={form.message} maxLength={2000}
          onChange={(e) => set('message', e.target.value)}
          placeholder="e.g. Results and report cards, CBT, fees, attendance" />
      </Field>

      {/* Honeypot: off-screen and out of the tab order, so only bots fill it. */}
      <div aria-hidden="true" className="absolute -left-[9999px] w-px h-px overflow-hidden">
        <label htmlFor="demo-website">Website</label>
        <input id="demo-website" tabIndex={-1} autoComplete="off" value={form.website}
          onChange={(e) => set('website', e.target.value)} />
      </div>

      <button type="submit" disabled={submitting}
        className="w-full sm:w-auto inline-flex items-center justify-center gap-2 px-6 py-3 bg-blue-600 hover:bg-blue-700 disabled:opacity-60 text-white text-sm font-semibold rounded-lg transition-colors">
        {submitting && <Loader2 className="w-4 h-4 animate-spin" aria-hidden="true" />}
        {submitting ? 'Sending…' : 'Book my free demo'}
      </button>
      <p className="text-xs text-gray-500 dark:text-gray-400">
        We'll only use these details to arrange your demo.
      </p>
    </form>
  );
};

export default DemoRequestForm;
