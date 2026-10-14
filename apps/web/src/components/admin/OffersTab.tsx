import { useCallback, useEffect, useState, type CSSProperties, type FormEvent } from 'react';
import type { TabIntent } from './TopBar';
import { toast } from 'react-hot-toast';
import { apiFetch, errorMessage } from '../../lib/api';
import { offerLabel, yen } from '../../lib/format';
import LoyaltySettings from './LoyaltySettings';
import StampCardSettings from './StampCardSettings';

interface Offer {
  id: string;
  titleJa: string;
  descriptionJa: string | null;
  imageUrl: string | null;
  discountType: 'PERCENT' | 'AMOUNT';
  discountValue: number;
  minSubtotal: number;
  startsAt: string | null;
  endsAt: string | null;
  oncePerCustomer: boolean;
  isActive: boolean;
  uses: number;
}

type Draft = Omit<Offer, 'id' | 'uses' | 'descriptionJa' | 'imageUrl' | 'startsAt' | 'endsAt'> & {
  id?: string;
  descriptionJa: string;
  imageUrl: string;
  startsAt: string;
  endsAt: string;
};

const EMPTY_DRAFT: Draft = {
  titleJa: '', descriptionJa: '', imageUrl: '', discountType: 'PERCENT', discountValue: 10, minSubtotal: 0,
  startsAt: '', endsAt: '', oncePerCustomer: false, isActive: true,
};

// <input type="date"> works in YYYY-MM-DD; offers end at the very end of their last day (Japan time).
const toDateInput = (iso: string | null) => (iso ? new Date(iso).toLocaleDateString('en-CA', { timeZone: 'Asia/Tokyo' }) : '');
const startOfDay = (date: string) => (date ? `${date}T00:00:00+09:00` : null);
const endOfDay = (date: string) => (date ? `${date}T23:59:59+09:00` : null);

function status(offer: Offer): { label: string; color: string } {
  const now = Date.now();
  if (!offer.isActive) return { label: 'Paused', color: '#6b7280' };
  if (offer.startsAt && new Date(offer.startsAt).getTime() > now) return { label: 'Scheduled', color: '#1d4ed8' };
  if (offer.endsAt && new Date(offer.endsAt).getTime() < now) return { label: 'Ended', color: '#6b7280' };
  return { label: 'Live', color: '#047857' };
}

export default function OffersTab({ intent }: { intent?: TabIntent | null }) {
  const [offers, setOffers] = useState<Offer[] | null>(null);
  const [draft, setDraft] = useState<Draft | null>(null);
  // Quick Add → "Offer" opens a blank offer.
  useEffect(() => {
    if (intent?.action === 'new-offer') setDraft({ ...EMPTY_DRAFT });
  }, [intent]);
  const [saving, setSaving] = useState(false);

  const load = useCallback(() => {
    apiFetch('/api/v1/offers/all')
      .then(res => (res.ok ? res.json() : Promise.reject(new Error(String(res.status)))))
      .then(setOffers)
      .catch(console.error);
  }, []);

  useEffect(load, [load]);

  const edit = (offer: Offer) =>
    setDraft({
      id: offer.id, titleJa: offer.titleJa, descriptionJa: offer.descriptionJa ?? '', imageUrl: offer.imageUrl ?? '',
      discountType: offer.discountType, discountValue: offer.discountValue, minSubtotal: offer.minSubtotal,
      startsAt: toDateInput(offer.startsAt), endsAt: toDateInput(offer.endsAt), oncePerCustomer: offer.oncePerCustomer, isActive: offer.isActive,
    });

  const save = async (e: FormEvent) => {
    e.preventDefault();
    if (!draft) return;
    setSaving(true);
    const { id, ...fields } = draft;
    try {
      const res = await apiFetch(id ? `/api/v1/offers/${id}` : '/api/v1/offers', {
        method: id ? 'PUT' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...fields, startsAt: startOfDay(fields.startsAt), endsAt: endOfDay(fields.endsAt) }),
      });
      if (res.ok) {
        toast.success(id ? 'Offer updated.' : 'Offer created. Members can use it now.');
        setDraft(null);
        load();
      } else toast.error(await errorMessage(res, 'Could not save the offer.'));
    } catch {
      toast.error('Network error.');
    } finally {
      setSaving(false);
    }
  };

  const remove = async (offer: Offer) => {
    if (!window.confirm(`Delete "${offer.titleJa}"? Past orders keep their discount. To stop it temporarily, edit it and untick "Active" instead.`)) return;
    const res = await apiFetch(`/api/v1/offers/${offer.id}`, { method: 'DELETE' });
    if (res.ok) load();
    else toast.error(await errorMessage(res, 'Could not delete the offer.'));
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
      <StampCardSettings />
      <LoyaltySettings />

      <section style={panelStyle}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem', gap: '1rem', flexWrap: 'wrap' }}>
          <div>
            <h3 style={{ margin: 0, fontSize: '1.25rem', fontWeight: 600 }}>Member Offers</h3>
            <p style={{ margin: '0.25rem 0 0', color: '#6b7280', fontSize: '0.875rem' }}>Discounts members can choose at checkout. One offer per order.</p>
          </div>
          <button type="button" onClick={() => setDraft({ ...EMPTY_DRAFT })} style={primaryButton}>+ New offer</button>
        </div>

        {!offers ? (
          <p>Loading…</p>
        ) : offers.length === 0 ? (
          <p style={{ color: '#6b7280' }}>No offers yet. Create one to give members a reason to order online.</p>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.9rem' }}>
              <thead>
                <tr style={{ textAlign: 'left', color: '#6b7280' }}>
                  {['Offer', 'Discount', 'Conditions', 'Period', 'Used', 'Status', ''].map(h => <th key={h} style={cellStyle}>{h}</th>)}
                </tr>
              </thead>
              <tbody>
                {offers.map(offer => {
                  const state = status(offer);
                  return (
                    <tr key={offer.id} style={{ borderTop: '1px solid #e5e7eb' }}>
                      <td style={{ ...cellStyle, fontWeight: 600 }}>{offer.titleJa}</td>
                      <td style={cellStyle}>{offerLabel(offer)}</td>
                      <td style={cellStyle}>
                        {offer.minSubtotal > 0 ? `Min ${yen(offer.minSubtotal)}` : 'Any order'}
                        {offer.oncePerCustomer && <div style={{ color: '#6b7280' }}>Once per member</div>}
                      </td>
                      <td style={cellStyle}>{toDateInput(offer.startsAt) || '—'} → {toDateInput(offer.endsAt) || 'no end'}</td>
                      <td style={cellStyle}>{offer.uses}</td>
                      <td style={{ ...cellStyle, color: state.color, fontWeight: 600 }}>{state.label}</td>
                      <td style={{ ...cellStyle, whiteSpace: 'nowrap' }}>
                        <button type="button" onClick={() => edit(offer)} style={smallButton}>Edit</button>{' '}
                        <button type="button" onClick={() => remove(offer)} style={{ ...smallButton, color: '#b91c1c', borderColor: '#fca5a5' }}>Delete</button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {draft && (
        <div role="dialog" aria-modal="true" aria-labelledby="offer-dialog-title" style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 50, padding: '1rem' }}>
          <form onSubmit={save} style={{ ...panelStyle, width: '100%', maxWidth: '560px', maxHeight: '90vh', overflowY: 'auto', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
            <h2 id="offer-dialog-title" style={{ gridColumn: '1 / -1', margin: 0, fontSize: '1.25rem' }}>{draft.id ? 'Edit offer' : 'New offer'}</h2>
            <label style={{ ...labelStyle, gridColumn: '1 / -1' }}>
              Title (Japanese, shown to customers)
              <input required maxLength={100} placeholder="例: 初回限定 10%OFF" value={draft.titleJa} onChange={e => setDraft({ ...draft, titleJa: e.target.value })} style={inputStyle} />
            </label>
            <label style={{ ...labelStyle, gridColumn: '1 / -1' }}>
              Description (Japanese, optional)
              <textarea rows={2} maxLength={1000} value={draft.descriptionJa} onChange={e => setDraft({ ...draft, descriptionJa: e.target.value })} style={inputStyle} />
            </label>
            <label style={labelStyle}>
              Discount type
              <select value={draft.discountType} onChange={e => setDraft({ ...draft, discountType: e.target.value as Draft['discountType'] })} style={inputStyle}>
                <option value="PERCENT">Percent off</option>
                <option value="AMOUNT">Yen off</option>
              </select>
            </label>
            <label style={labelStyle}>
              {draft.discountType === 'PERCENT' ? 'Percent (1–100)' : 'Yen off'}
              <input type="number" required min={1} max={draft.discountType === 'PERCENT' ? 100 : 1000000} value={draft.discountValue} onChange={e => setDraft({ ...draft, discountValue: Number(e.target.value) })} style={inputStyle} />
            </label>
            <label style={labelStyle}>
              Minimum order (¥, 0 = none)
              <input type="number" min={0} value={draft.minSubtotal} onChange={e => setDraft({ ...draft, minSubtotal: Number(e.target.value) })} style={inputStyle} />
            </label>
            <div />
            <label style={labelStyle}>
              Starts (optional)
              <input type="date" value={draft.startsAt} onChange={e => setDraft({ ...draft, startsAt: e.target.value })} style={inputStyle} />
            </label>
            <label style={labelStyle}>
              Ends (optional, inclusive)
              <input type="date" value={draft.endsAt} onChange={e => setDraft({ ...draft, endsAt: e.target.value })} style={inputStyle} />
            </label>
            <label style={checkboxLabel}>
              <input type="checkbox" checked={draft.oncePerCustomer} onChange={e => setDraft({ ...draft, oncePerCustomer: e.target.checked })} />
              Once per member
            </label>
            <label style={checkboxLabel}>
              <input type="checkbox" checked={draft.isActive} onChange={e => setDraft({ ...draft, isActive: e.target.checked })} />
              Active
            </label>
            <div style={{ gridColumn: '1 / -1', display: 'flex', justifyContent: 'flex-end', gap: '0.75rem' }}>
              <button type="button" onClick={() => setDraft(null)} style={smallButton}>Cancel</button>
              <button type="submit" disabled={saving} style={primaryButton}>{saving ? 'Saving…' : 'Save offer'}</button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}

const panelStyle: CSSProperties = { backgroundColor: '#fff', borderRadius: '12px', boxShadow: '0 1px 3px rgba(0,0,0,0.05)', border: '1px solid #e5e7eb', padding: '1.5rem' };
const labelStyle: CSSProperties = { display: 'flex', flexDirection: 'column', gap: '0.4rem', fontSize: '0.875rem', fontWeight: 500, color: '#374151' };
const checkboxLabel: CSSProperties = { display: 'flex', alignItems: 'center', gap: '8px', fontSize: '0.9rem', fontWeight: 500 };
const inputStyle: CSSProperties = { width: '100%', padding: '0.65rem', border: '1px solid #d1d5db', borderRadius: '8px', backgroundColor: '#f9fafb', boxSizing: 'border-box', fontFamily: 'inherit', fontSize: '0.95rem' };
const cellStyle: CSSProperties = { padding: '0.75rem 0.5rem', verticalAlign: 'top' };
const primaryButton: CSSProperties = { padding: '0.65rem 1.25rem', backgroundColor: '#000', color: '#fff', border: 'none', borderRadius: '8px', fontWeight: 600, cursor: 'pointer' };
const smallButton: CSSProperties = { padding: '0.4rem 0.8rem', backgroundColor: '#fff', border: '1px solid #d1d5db', borderRadius: '6px', cursor: 'pointer', fontWeight: 500 };
