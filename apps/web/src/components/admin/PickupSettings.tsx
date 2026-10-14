import { useEffect, useState, type CSSProperties } from 'react';
import { toast } from 'react-hot-toast';
import { apiFetch, errorMessage } from '../../lib/api';
import { taxRateOf } from '../../lib/price';

const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const DEFAULT_LEAD_MINUTES = 30;
const MAX_TAX_RATE = 25;
const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

// Switching pickup on and off is done in OrderingSwitches; this form holds the details.
interface PickupForm {
  pickupHours: string;
  pickupClosedDays: number[];
  pickupClosedDates: string;
  pickupLeadMinutes: number;
  taxRatePercent: number;
  pickupNoteJa: string;
}

export default function PickupSettings({ onSaved }: { onSaved?: () => void }) {
  const [form, setForm] = useState<PickupForm | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    apiFetch('/api/v1/settings')
      .then(res => res.json())
      .then(data =>
        setForm({
          pickupHours: data.pickupHours || '',
          pickupClosedDays: Array.isArray(data.pickupClosedDays) ? data.pickupClosedDays : [],
          pickupClosedDates: Array.isArray(data.pickupClosedDates) ? data.pickupClosedDates.join(', ') : '',
          pickupLeadMinutes: typeof data.pickupLeadMinutes === 'number' ? data.pickupLeadMinutes : DEFAULT_LEAD_MINUTES,
          taxRatePercent: taxRateOf(data),
          pickupNoteJa: data.pickupNoteJa || '',
        }),
      )
      .catch(console.error);
  }, []);

  if (!form) return null;

  const update = (patch: Partial<PickupForm>) => setForm({ ...form, ...patch });

  const toggleDay = (day: number) =>
    update({ pickupClosedDays: form.pickupClosedDays.includes(day) ? form.pickupClosedDays.filter(d => d !== day) : [...form.pickupClosedDays, day].sort() });

  const handleSave = async () => {
    const closedDates = form.pickupClosedDates.split(/[\s,、]+/).filter(Boolean);
    const badDate = closedDates.find(date => !DATE_PATTERN.test(date));
    if (badDate) {
      toast.error(`"${badDate}" is not a date. Use YYYY-MM-DD, e.g. 2026-12-31.`);
      return;
    }

    setSaving(true);
    try {
      // Only the pickup fields are sent; the API leaves every other setting untouched.
      const res = await apiFetch('/api/v1/settings', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...form, pickupClosedDates: closedDates }),
      });
      if (res.ok) {
        toast.success('Pickup settings saved.');
        onSaved?.();
      }
      else toast.error(await errorMessage(res, 'Failed to save pickup settings.'));
    } catch {
      toast.error('Network error while saving pickup settings.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <section style={{ backgroundColor: '#fff', borderRadius: '12px', boxShadow: '0 1px 3px rgba(0,0,0,0.05)', border: '1px solid #e5e7eb' }}>
      <div style={{ padding: '1.5rem', borderBottom: '1px solid #e5e7eb' }}>
        <h3 style={{ margin: 0, fontSize: '1.25rem', fontWeight: 600 }}>Pickup & Shop Settings</h3>
        <p style={{ margin: '0.25rem 0 0 0', color: '#6b7280', fontSize: '0.875rem' }}>
          Customers can order any menu item (except sold-out ones) and pay when they pick up. Times are offered in 15-minute steps for today and tomorrow.
        </p>
      </div>
      <div style={{ padding: '1.5rem', display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 260px), 1fr))', gap: '1.5rem' }}>
        <label style={labelStyle}>
          Pickup hours
          <input type="text" placeholder="11:30-14:30, 17:00-21:30" value={form.pickupHours} onChange={e => update({ pickupHours: e.target.value })} style={inputStyle} />
          <span style={hintStyle}>Earliest and latest pickup time; separate lunch and dinner with a comma.</span>
        </label>
        <label style={labelStyle}>
          Minimum notice (minutes)
          <input type="number" min={0} max={1440} step={5} value={form.pickupLeadMinutes} onChange={e => update({ pickupLeadMinutes: Number(e.target.value) })} style={inputStyle} />
          <span style={hintStyle}>How long the kitchen needs before the earliest pickup.</span>
        </label>
        <label style={labelStyle}>
          Consumption tax (%)
          <input type="number" min={0} max={MAX_TAX_RATE} value={form.taxRatePercent} onChange={e => update({ taxRatePercent: Number(e.target.value) })} style={inputStyle} />
          <span style={hintStyle}>Added to online orders. Takeout food is normally 8% (reduced rate). Past orders keep the rate they were placed with.</span>
        </label>
        <fieldset style={{ border: 'none', padding: 0, margin: 0 }}>
          <legend style={labelStyle}>Closed days (no pickup or delivery)</legend>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
            {WEEKDAYS.map((name, day) => (
              <label key={name} style={{ display: 'flex', alignItems: 'center', gap: '4px', fontSize: '0.875rem' }}>
                <input type="checkbox" checked={form.pickupClosedDays.includes(day)} onChange={() => toggleDay(day)} />
                {name}
              </label>
            ))}
          </div>
        </fieldset>
        <label style={labelStyle}>
          Closed dates
          <input type="text" placeholder="2026-12-31, 2027-01-01" value={form.pickupClosedDates} onChange={e => update({ pickupClosedDates: e.target.value })} style={inputStyle} />
          <span style={hintStyle}>Holidays or days you can't take orders, as YYYY-MM-DD.</span>
        </label>
        <label style={{ ...labelStyle, gridColumn: '1 / -1' }}>
          Note shown to customers (Japanese)
          <textarea rows={3} placeholder="例: ご来店時にレジで受付番号をお伝えください。" value={form.pickupNoteJa} onChange={e => update({ pickupNoteJa: e.target.value })} style={inputStyle} />
        </label>
        <div style={{ gridColumn: '1 / -1', display: 'flex', justifyContent: 'flex-end' }}>
          <button type="button" onClick={handleSave} disabled={saving} style={{ padding: '0.75rem 1.5rem', backgroundColor: '#000', color: '#fff', border: 'none', borderRadius: '8px', fontWeight: 500, cursor: 'pointer' }}>
            {saving ? 'Saving…' : 'Save Pickup Settings'}
          </button>
        </div>
      </div>
    </section>
  );
}

const labelStyle: CSSProperties = { display: 'flex', flexDirection: 'column', gap: '0.5rem', fontSize: '0.875rem', fontWeight: 500, color: '#374151' };
const inputStyle: CSSProperties = { width: '100%', padding: '0.75rem', border: '1px solid #d1d5db', borderRadius: '8px', backgroundColor: '#f9fafb', fontWeight: 400, boxSizing: 'border-box', fontFamily: 'inherit' };
const hintStyle: CSSProperties = { fontSize: '0.75rem', color: '#6b7280', fontWeight: 400 };
