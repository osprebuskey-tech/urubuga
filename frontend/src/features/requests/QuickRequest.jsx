import { useState } from 'react';
import Button from '../../components/ui/Button';
import Icon from '../../components/Icon';
import { Alert } from '../../components/ui/feedback';
import { DISTRICTS } from '../../utils/constants';
import { errorMessage, fieldErrors } from '../../utils/errors';
import { compact, isoDay } from '../../utils/format';
import { validateRequest } from './RequestForm';

// Everything a person used to type is now a tap. The only free text left is one short sentence.
export const WHEN = [
  { key: 'today', label: 'Today', date: () => isoDay(0) },
  { key: 'tomorrow', label: 'Tomorrow', date: () => isoDay(1) },
  { key: 'week', label: 'Next week', date: () => isoDay(7) },
  { key: 'flexible', label: 'Flexible', date: () => '' },
];

export const BUDGETS = [
  { key: 'u20', label: 'Under 20,000', min: '', max: '20000' },
  { key: '20-50', label: '20,000 – 50,000', min: '20000', max: '50000' },
  { key: '50-100', label: '50,000 – 100,000', min: '50000', max: '100000' },
  { key: 'o100', label: 'Over 100,000', min: '100000', max: '' },
  { key: 'unsure', label: 'Not sure yet', min: '', max: '' },
];

const NEAR = ['Gasabo', 'Kicukiro', 'Nyarugenge'];
const REMEMBER = 'imbehe.lastDistrict';
const recall = () => { try { return localStorage.getItem(REMEMBER) || ''; } catch { return ''; } };
const remember = (d) => { try { localStorage.setItem(REMEMBER, d); } catch { /* private mode: nothing to remember */ } };

/** Turns the taps into the same body RequestForm sends, plus the string form validateRequest understands. */
export function buildRequest({ categories, category, subcategory, district, when, budget, description }) {
  const cat = categories.find((c) => c.id === category);
  const sub = cat?.subcategories.find((s) => s.slug === subcategory);
  const w = WHEN.find((x) => x.key === when);
  const b = BUDGETS.find((x) => x.key === budget);
  const form = {
    title: cat ? `${sub?.name ?? cat.name}${district ? ` in ${district}` : ''}` : '',
    description: description.trim(),
    category: category || '',
    district: district || '',
    preferredDate: w ? w.date() : '',
    budgetMin: b?.min ?? '',
    budgetMax: b?.max ?? '',
  };
  const body = {
    ...compact({
      title: form.title,
      description: form.description,
      category: form.category,
      subcategory: subcategory || '',
      preferredDate: form.preferredDate,
      budgetMin: form.budgetMin === '' ? '' : Number(form.budgetMin),
      budgetMax: form.budgetMax === '' ? '' : Number(form.budgetMax),
    }),
    location: { district: form.district },
  };
  return { form, body, cat, sub };
}

function Chip({ active, onClick, children }) {
  return (
    <button type="button" aria-pressed={active} onClick={onClick}
      className={`rounded-full border px-4 py-2 text-sm font-semibold transition-colors ${active ? 'border-ink-900 bg-ink-900 text-white' : 'border-ink-200 bg-white text-ink-900 hover:border-ink-400 hover:bg-ink-50'}`}>
      {children}
    </button>
  );
}

function Step({ n, title, done, children }) {
  return (
    <fieldset className="panel p-5 sm:p-6">
      <legend className="sr-only">{title}</legend>
      <div className="mb-4 flex items-center gap-3" aria-hidden="true">
        <span className={`flex h-8 w-8 items-center justify-center rounded-full text-sm font-bold text-white ${done ? 'bg-emerald-600' : 'bg-ink-900'}`}>{done ? <Icon name="check" className="h-4 w-4" /> : n}</span>
        <h2 className="text-lg font-semibold">{title}</h2>
      </div>
      {children}
    </fieldset>
  );
}

/**
 * Tap-to-request: pick what you need, where, when and a budget, add one sentence, send.
 * `provider` ({ id, displayName }) makes it a directed request, exactly as in RequestForm.
 */
export default function QuickRequest({ categories, provider, defaults, canUseCompany, onSubmit, onNeedMore }) {
  const [s, setS] = useState(() => ({
    category: categories.some((c) => c.id === defaults?.category) ? defaults.category : '',
    subcategory: '', district: recall(), when: 'flexible', budget: 'unsure', description: '',
  }));
  const [other, setOther] = useState(() => Boolean(recall()) && !NEAR.includes(recall()));
  const [company, setCompany] = useState(false);
  const [formError, setFormError] = useState('');
  const [saving, setSaving] = useState(false);
  const pick = (patch) => setS((x) => ({ ...x, ...patch }));

  const { form, body, cat, sub } = buildRequest({ categories, ...s });
  const problems = validateRequest(form);
  const ready = Object.keys(problems).length === 0;
  const need = [!s.category && 'what you need', !s.district && 'where', s.description.trim().length < 10 && 'a short description'].filter(Boolean);
  const noun = (sub?.name ?? cat?.name ?? 'this').toLowerCase();
  const ideas = cat ? [`I need help with ${noun}.`, `Please come and have a look at ${noun} for me.`, `I need ${noun} done for my business.`] : [];

  const send = async () => {
    setFormError('');
    if (!ready) { setFormError(`Almost there. Still needed: ${need.join(', ')}.`); return; }
    setSaving(true);
    try {
      remember(s.district);
      await onSubmit({ ...body, ...(provider ? { provider: provider.id } : {}), ...(canUseCompany && company ? { onBehalfOfCompany: true } : {}) });
    } catch (err) {
      setFormError(Object.keys(fieldErrors(err)).length ? 'Some details were not accepted. Try the detailed form.' : errorMessage(err));
      setSaving(false);
    }
  };

  const summary = [cat && (sub?.name ?? cat.name), s.district, WHEN.find((w) => w.key === s.when)?.label, BUDGETS.find((b) => b.key === s.budget)?.label].filter(Boolean);

  return (
    <div className="space-y-5">
      {provider && <Alert tone="info">This request goes only to <strong>{provider.displayName}</strong>.</Alert>}

      <Step n={1} title="What do you need?" done={Boolean(s.category)}>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          {categories.map((c) => (
            <button key={c.id} type="button" aria-pressed={s.category === c.id} onClick={() => pick({ category: c.id, subcategory: '' })}
              className={`flex items-center gap-3 rounded-xl border p-3 text-left transition-colors ${s.category === c.id ? 'border-ink-900 bg-ink-50 ring-2 ring-ink-900' : 'border-ink-100 bg-white hover:border-ink-300'}`}>
              <span aria-hidden="true" className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-teal-600 font-display text-lg font-bold text-white">{c.name[0]}</span>
              <span className="text-sm font-semibold leading-tight">{c.name}</span>
            </button>
          ))}
        </div>
        {cat && cat.subcategories.length > 0 && (
          <div className="mt-4">
            <p className="mb-2 text-sm font-semibold text-ink-700">Be more specific (optional)</p>
            <div className="flex flex-wrap gap-2">
              {cat.subcategories.map((x) => <Chip key={x.slug} active={s.subcategory === x.slug} onClick={() => pick({ subcategory: s.subcategory === x.slug ? '' : x.slug })}>{x.name}</Chip>)}
            </div>
          </div>
        )}
      </Step>

      {cat && (
        <>
          <Step n={2} title="Where and when?" done={Boolean(s.district)}>
            <p className="mb-2 text-sm font-semibold text-ink-700">District</p>
            <div className="flex flex-wrap gap-2">
              {NEAR.map((d) => <Chip key={d} active={s.district === d} onClick={() => { setOther(false); pick({ district: d }); }}>{d}</Chip>)}
              <Chip active={other} onClick={() => { setOther(true); if (NEAR.includes(s.district)) pick({ district: '' }); }}>Another district</Chip>
            </div>
            {other && (
              <select aria-label="Choose your district" className="input mt-3 max-w-xs" value={s.district} onChange={(e) => pick({ district: e.target.value })}>
                <option value="">Choose a district</option>
                {DISTRICTS.map((d) => <option key={d} value={d}>{d}</option>)}
              </select>
            )}
            <p className="mb-2 mt-5 text-sm font-semibold text-ink-700">When</p>
            <div className="flex flex-wrap gap-2">{WHEN.map((w) => <Chip key={w.key} active={s.when === w.key} onClick={() => pick({ when: w.key })}>{w.label}</Chip>)}</div>
          </Step>

          <Step n={3} title="Roughly what can you spend? (RWF)" done>
            <div className="flex flex-wrap gap-2">{BUDGETS.map((b) => <Chip key={b.key} active={s.budget === b.key} onClick={() => pick({ budget: b.key })}>{b.label}</Chip>)}</div>
            <p className="mt-3 text-sm text-ink-600">A range helps providers quote fairly. It isn’t a promise to pay that much.</p>
          </Step>

          <Step n={4} title="Say it in one sentence" done={s.description.trim().length >= 10}>
            <div className="mb-3 flex flex-wrap gap-2">{ideas.map((t) => <Chip key={t} active={s.description === t} onClick={() => pick({ description: t })}>{t}</Chip>)}</div>
            <label htmlFor="quick-description" className="sr-only">Describe the job</label>
            <textarea id="quick-description" rows={3} maxLength={3000} className="input" placeholder="Tap an idea above, or write your own. Add what a provider should know."
              value={s.description} onChange={(e) => pick({ description: e.target.value })} />
            {canUseCompany && (
              <label className="mt-3 flex items-center gap-2.5 text-sm font-medium"><input type="checkbox" checked={company} onChange={(e) => setCompany(e.target.checked)} className="h-4 w-4 accent-rose-700" />This is for my company</label>
            )}
          </Step>
        </>
      )}

      <div className="sticky bottom-3 z-10 rounded-xl border border-ink-100 bg-white/95 p-4 shadow-lg backdrop-blur">
        {formError && <Alert tone="error" className="mb-3">{formError}</Alert>}
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="min-w-0 flex-1 text-sm text-ink-700" aria-live="polite">{summary.length ? summary.join(' · ') : 'Choose what you need to begin.'}</p>
          <Button size="lg" loading={saving} onClick={send} aria-disabled={!ready || undefined} className={ready ? '' : 'opacity-60'}>Send request</Button>
        </div>
        {!ready && need.length > 0 && <p className="mt-2 text-xs text-ink-600">Still needed: {need.join(', ')}.</p>}
      </div>

      {onNeedMore && <p className="text-center text-sm text-ink-700">Need to add a title, sector or exact date? <button type="button" onClick={onNeedMore} className="font-semibold text-teal-700 underline">Use the detailed form</button></p>}
    </div>
  );
}
