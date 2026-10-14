import { useCallback, useEffect, useState, type CSSProperties, type FormEvent, type ReactNode } from 'react';
import type { TabIntent } from '../TopBar';
import { toast } from 'react-hot-toast';
import { BellRing, ExternalLink, Pencil, Plus, Printer, QrCode, RefreshCw, Receipt, Trash2, Users, X } from 'lucide-react';
import { apiFetch, errorMessage } from '../../../lib/api';
import { yen } from '../../../lib/format';
import TableDetail from './TableDetail';
import { adminIsLocal, printTableCards, qrBase, qrSvg, restaurantName, tableUrl } from './qr-print';
import './tables.css';

interface Call {
  id: string;
  type: 'STAFF' | 'WATER' | 'BILL';
  createdAt: string;
}
interface FloorTable {
  id: string;
  number: string;
  name: string | null;
  seats: number | null;
  area: string | null;
  isActive: boolean;
  sortOrder: number;
  qrToken: string;
  session: {
    id: string;
    status: 'OPEN' | 'BILL_REQUESTED';
    guests: number | null;
    openedAt: string;
    openedBy: string;
    calls: Call[];
    orders: number;
    inProgress: number;
    ready: number;
    total: number;
  } | null;
}
interface Floor {
  dining: { enabled: boolean; selfOpen: boolean; targetMinutes: number };
  tables: FloorTable[];
  closedToday: { id: string; tableNumber: string; guests: number | null; openedAt: string; closedAt: string; total: number; paymentMethod: string | null }[];
}

const POLL_MS = 8_000;
const CALL_TEXT = { STAFF: 'Calling', WATER: 'Water', BILL: 'Bill' };
const PAYMENT_TEXT: Record<string, string> = { CASH: 'Cash', CARD: 'Card', QR: 'QR pay', OTHER: 'Other' };
const time = (iso: string) => new Date(iso).toLocaleTimeString('ja-JP', { timeZone: 'Asia/Tokyo', hour: '2-digit', minute: '2-digit' });
const minutesSince = (iso: string) => Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 60_000));

/** Dine-in: the live floor (who is seated, calls, running bills) and, for admins, tables, QR codes and settings. */
export default function TablesTab({ isAdmin, intent }: { isAdmin: boolean; intent?: TabIntent | null }) {
  const [floor, setFloor] = useState<Floor | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const [opening, setOpening] = useState<FloorTable | null>(null);
  const [editing, setEditing] = useState<FloorTable | 'new' | null>(null);
  const [view, setView] = useState<'floor' | 'manage'>('floor');
  // Quick Add → "Table" opens the add form on the management view.
  useEffect(() => {
    if (intent?.action === 'add-table' && isAdmin) {
      setView('manage');
      setEditing('new');
    }
  }, [intent, isAdmin]);

  const load = useCallback(async () => {
    try {
      const res = await apiFetch('/api/v1/dining/tables');
      if (!res.ok) return;
      const data: Floor = await res.json();
      // New guest calls ring (and are accepted) in TableCallAlerts, shown on every admin tab.
      setFloor(data);
    } catch {
      // Retried on the next poll.
    }
  }, []);

  useEffect(() => {
    load();
    const intervalId = setInterval(load, POLL_MS);
    return () => clearInterval(intervalId);
  }, [load]);

  const saveSettings = async (patch: Partial<Floor['dining']>) => {
    const body: Record<string, unknown> = {};
    if (patch.enabled !== undefined) body.diningEnabled = patch.enabled;
    if (patch.selfOpen !== undefined) body.diningSelfOpen = patch.selfOpen;
    if (patch.targetMinutes !== undefined) body.diningTargetMinutes = patch.targetMinutes;
    const res = await apiFetch('/api/v1/settings', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    if (res.ok) {
      toast.success('Saved.');
      load();
    } else toast.error(await errorMessage(res, 'Could not save.'));
  };

  if (!floor) return <div style={{ padding: '40px', textAlign: 'center' }}>Loading tables…</div>;

  const occupied = floor.tables.filter(table => table.session);
  const calls = occupied.reduce((sum, table) => sum + (table.session?.calls.length ?? 0), 0);
  const openTotal = occupied.reduce((sum, table) => sum + (table.session?.total ?? 0), 0);
  const closedTotal = floor.closedToday.reduce((sum, session) => sum + session.total, 0);
  const activeTables = floor.tables.filter(table => table.isActive);

  return (
    <div className="tt">
      <div className="tt-bar">
        <div className="tt-stats">
          <Stat label="Seated" value={`${occupied.length}/${activeTables.length}`} />
          <Stat label="Guests" value={String(occupied.reduce((sum, t) => sum + (t.session?.guests ?? 0), 0))} />
          <Stat label="Calls" value={String(calls)} tone={calls ? 'alert' : undefined} />
          {isAdmin && <Stat label="Open bills" value={yen(openTotal)} />}
          {isAdmin && <Stat label="Paid today" value={yen(closedTotal)} />}
        </div>
        <div className="tt-actions">
          <label className={`tt-switch${floor.dining.enabled ? '' : ' is-off'}`}>
            <input type="checkbox" role="switch" checked={floor.dining.enabled} disabled={!isAdmin} onChange={e => {
              const on = e.target.checked;
              // Turning it off stops every table from ordering, so make sure it's on purpose.
              if (!on && !window.confirm('Turn off table ordering? Guests who scan a table QR code will be asked to order with staff instead.')) return;
              saveSettings({ enabled: on });
            }} />
            <span>Table ordering {floor.dining.enabled ? 'on' : 'off'}</span>
          </label>
          {isAdmin && (
            <div className="tt-seg">
              <button type="button" aria-pressed={view === 'floor'} onClick={() => setView('floor')}>Floor</button>
              <button type="button" aria-pressed={view === 'manage'} onClick={() => setView('manage')}>Tables &amp; QR codes</button>
            </div>
          )}
        </div>
      </div>

      {!floor.dining.enabled && (
        <div className="tt-note">Table ordering is off: guests who scan a QR code are asked to order with staff. {isAdmin ? 'Switch it on above.' : 'An admin can switch it on.'}</div>
      )}

      {view === 'floor' ? (
        <>
          {activeTables.length === 0 ? (
            <div className="tt-empty">
              <QrCode size={32} />
              <p>No tables yet.{isAdmin ? ' Add your tables in "Tables & QR codes", then print their QR codes.' : ' Ask an admin to add the tables.'}</p>
              {isAdmin && <button type="button" className="tt-btn tt-btn-dark" onClick={() => setView('manage')}>Set up tables</button>}
            </div>
          ) : (
            <div className="tt-floor">
              {activeTables.map(table => {
                const session = table.session;
                const state = !session ? 'free' : session.calls.length ? 'call' : session.status === 'BILL_REQUESTED' ? 'bill' : session.ready ? 'ready' : 'busy';
                return (
                  <button
                    key={table.id}
                    type="button"
                    className={`tt-table is-${state}`}
                    onClick={() => (session ? setSelected(session.id) : setOpening(table))}
                    aria-label={`Table ${table.number}${session ? `, ${session.guests ?? '?'} guests, ${yen(session.total)}` : ', free'}`}
                  >
                    <div className="tt-table-head">
                      <span className="tt-num">{table.number}</span>
                      {table.name && <span className="tt-name">{table.name}</span>}
                      <span className="tt-seats"><Users size={13} /> {session?.guests ?? table.seats ?? '–'}</span>
                    </div>
                    {!session ? (
                      <span className="tt-free">Free · tap to seat guests</span>
                    ) : (
                      <>
                        <div className="tt-line">{minutesSince(session.openedAt)} min · {session.orders} order{session.orders === 1 ? '' : 's'}</div>
                        {isAdmin && <div className="tt-total">{yen(session.total)}</div>}
                        <div className="tt-chips">
                          {session.calls.map(call => <span key={call.id} className="tt-chip is-call"><BellRing size={12} /> {CALL_TEXT[call.type]}</span>)}
                          {session.status === 'BILL_REQUESTED' && !session.calls.some(call => call.type === 'BILL') && <span className="tt-chip is-bill"><Receipt size={12} /> Bill</span>}
                          {session.inProgress > 0 && <span className="tt-chip">{session.inProgress} cooking</span>}
                          {session.ready > 0 && <span className="tt-chip is-ready">{session.ready} to serve</span>}
                        </div>
                      </>
                    )}
                  </button>
                );
              })}
            </div>
          )}

          {floor.closedToday.length > 0 && (
            <section className="tt-card">
              <h3>Closed today</h3>
              <div style={{ overflowX: 'auto' }}>
                <table className="tt-list">
                  <thead><tr><th>Table</th><th>Guests</th><th>Seated</th><th>Paid</th><th>Method</th>{isAdmin && <th className="num">Total</th>}</tr></thead>
                  <tbody>
                    {floor.closedToday.map(session => (
                      <tr key={session.id}>
                        <td>{session.tableNumber}</td>
                        <td>{session.guests ?? '–'}</td>
                        <td>{time(session.openedAt)}</td>
                        <td>{time(session.closedAt)}</td>
                        <td>{PAYMENT_TEXT[session.paymentMethod ?? ''] ?? '–'}</td>
                        {isAdmin && <td className="num">{yen(session.total)}</td>}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          )}
        </>
      ) : (
        <ManageTables floor={floor} onEdit={setEditing} onSettings={saveSettings} reload={load} />
      )}

      {selected && <TableDetail sessionId={selected} onClose={() => setSelected(null)} onChanged={load} />}
      {opening && <OpenTable table={opening} onClose={() => setOpening(null)} onOpened={id => { setOpening(null); load(); setSelected(id); }} />}
      {editing && <TableForm table={editing === 'new' ? null : editing} onClose={() => setEditing(null)} onSaved={() => { setEditing(null); load(); }} />}
    </div>
  );
}

function Stat({ label, value, tone }: { label: string; value: string; tone?: 'alert' }) {
  return (
    <div className={`tt-stat${tone ? ` is-${tone}` : ''}`}>
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

function OpenTable({ table, onClose, onOpened }: { table: FloorTable; onClose: () => void; onOpened: (sessionId: string) => void }) {
  const [guests, setGuests] = useState(Math.min(table.seats ?? 2, 2));
  const [busy, setBusy] = useState(false);
  const open = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    try {
      const res = await apiFetch(`/api/v1/dining/tables/${table.id}/open`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ guests }) });
      if (res.ok) {
        toast.success(`Table ${table.number} open — guests can order from the QR code.`);
        onOpened((await res.json()).id);
      } else toast.error(await errorMessage(res, 'Could not open the table.'));
    } finally {
      setBusy(false);
    }
  };
  return (
    <Modal title={`Seat guests at table ${table.number}`} onClose={onClose}>
      <form onSubmit={open} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '16px' }}>
          <button type="button" className="tt-round" onClick={() => setGuests(g => Math.max(1, g - 1))} aria-label="One guest fewer">−</button>
          <span style={{ fontSize: '2.2rem', fontWeight: 700, minWidth: '3ch', textAlign: 'center' }}>{guests}</span>
          <button type="button" className="tt-round" onClick={() => setGuests(g => Math.min(50, g + 1))} aria-label="One more guest">+</button>
        </div>
        <p style={{ margin: 0, textAlign: 'center', color: '#6b7280' }}>guests</p>
        <button type="submit" disabled={busy} className="tt-btn tt-btn-dark tt-btn-lg">Open table</button>
      </form>
    </Modal>
  );
}

function ManageTables({ floor, onEdit, onSettings, reload }: { floor: Floor; onEdit: (table: FloorTable | 'new') => void; onSettings: (patch: Partial<Floor['dining']>) => void; reload: () => void }) {
  const [from, setFrom] = useState(1);
  const [to, setTo] = useState(10);
  const [preview, setPreview] = useState<FloorTable | null>(null);
  const [target, setTarget] = useState(floor.dining.targetMinutes);
  const [name, setName] = useState<string | undefined>(undefined);
  const [qr, setQr] = useState<{ siteUrl: string | null; lanAddresses: string[] }>({ siteUrl: null, lanAddresses: [] });
  const [siteDraft, setSiteDraft] = useState('');
  const loadQr = useCallback(() => {
    apiFetch('/api/v1/dining/qr-base')
      .then(res => (res.ok ? res.json() : null))
      .then(data => {
        if (!data) return;
        setQr(data);
        setSiteDraft(data.siteUrl ?? '');
      })
      .catch(() => undefined);
  }, []);
  useEffect(() => {
    restaurantName().then(setName);
    loadQr();
  }, [loadQr]);
  const base = qrBase(qr.siteUrl, qr.lanAddresses);
  const baseIsLocal = /\/\/(localhost|127\.|\[::1\])/.test(base);
  const saveSite = async (value: string) => {
    const res = await apiFetch('/api/v1/settings', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ publicSiteUrl: value.trim() }) });
    if (res.ok) {
      toast.success(value.trim() ? 'QR codes will open this address. Print them again.' : 'QR codes will use this page\'s address.');
      loadQr();
    } else toast.error(await errorMessage(res, 'Could not save the address.'));
  };

  const bulk = async () => {
    const res = await apiFetch('/api/v1/dining/tables/bulk', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ from, to }) });
    if (res.ok) {
      const { created, skipped } = await res.json();
      toast.success(`${created} table${created === 1 ? '' : 's'} added${skipped ? `, ${skipped} already existed` : ''}.`);
      reload();
    } else toast.error(await errorMessage(res, 'Could not add tables.'));
  };

  const remove = async (table: FloorTable) => {
    if (!window.confirm(`Delete table ${table.number}? Its printed QR code will stop working.`)) return;
    const res = await apiFetch(`/api/v1/dining/tables/${table.id}`, { method: 'DELETE' });
    if (res.ok) reload();
    else toast.error(await errorMessage(res, 'Could not delete the table.'));
  };

  const regenerate = async (table: FloorTable) => {
    if (!window.confirm(`Make a new QR code for table ${table.number}? The old printed code stops working, so print and replace it.`)) return;
    const res = await apiFetch(`/api/v1/dining/tables/${table.id}/qr`, { method: 'POST' });
    if (res.ok) {
      toast.success('New QR code made. Print it and replace the old one.');
      reload();
    } else toast.error(await errorMessage(res, 'Could not make a new QR code.'));
  };

  const print = (tables: FloorTable[]) => {
    if (baseIsLocal && !window.confirm('These QR codes point to "localhost", which phones cannot open. Print anyway?')) return;
    if (!printTableCards(tables, base, name)) toast.error('Allow pop-ups for this site to print QR codes.');
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
      <section className="tt-card">
        <h3>How table ordering works</h3>
        <div className="tt-settings">
          <label className="tt-check">
            <input type="checkbox" checked={floor.dining.selfOpen} onChange={e => onSettings({ selfOpen: e.target.checked })} />
            <span>
              <strong>Guests can start ordering by themselves</strong>
              <small>Off (recommended): staff tap a free table to seat guests, and only then does its QR code take orders — a photo of the code can't be used from outside. On: the first scan opens the table.</small>
            </span>
          </label>
          <label className="tt-field">
            Target time to serve (minutes)
            <span style={{ display: 'flex', gap: '6px' }}>
              <input type="number" min={5} max={120} value={target} onChange={e => setTarget(Number(e.target.value))} />
              <button type="button" className="tt-btn" onClick={() => onSettings({ targetMinutes: Math.min(120, Math.max(5, Math.round(target) || 20)) })}>Save</button>
            </span>
            <small>The kitchen display counts down to this for table orders.</small>
          </label>
        </div>
      </section>

      <section className={`tt-card${baseIsLocal ? ' tt-warn' : ''}`}>
        <h3>QR codes open</h3>
        <p style={{ margin: '0 0 8px', fontSize: '0.95rem' }}>
          <code style={{ fontSize: '0.95rem', fontWeight: 700, wordBreak: 'break-all' }}>{base}/t/…</code>
        </p>
        {!qr.siteUrl && adminIsLocal() && qr.lanAddresses.length > 0 && (
          <p className="tt-hint">
            Testing on this computer: the codes use its Wi-Fi address <strong>{qr.lanAddresses[0]}</strong>, so phones on the <strong>same Wi-Fi</strong> can open them.
            Restart <code>pnpm dev</code> once if a phone can't connect. For the restaurant, set the real website address below and print again.
          </p>
        )}
        {baseIsLocal && <p className="tt-hint" role="alert">These codes point to “localhost”, which phones can't open. Enter the website address below.</p>}
        <div className="tt-site">
          <input
            type="url"
            inputMode="url"
            placeholder="https://your-restaurant-site.jp"
            value={siteDraft}
            onChange={e => setSiteDraft(e.target.value)}
            aria-label="Website address for QR codes"
          />
          <button type="button" className="tt-btn tt-btn-dark" onClick={() => saveSite(siteDraft)} disabled={siteDraft.trim() === (qr.siteUrl ?? '')}>Save address</button>
          {qr.siteUrl && <button type="button" className="tt-btn" onClick={() => { setSiteDraft(''); saveSite(''); }}>Use automatic</button>}
        </div>
        <p className="tt-hint">The public address of this website (where guests should land). After changing it, print the QR codes again — old printouts keep the old address.</p>
      </section>

      <section className="tt-card">
        <div className="tt-card-head">
          <h3>Tables ({floor.tables.length})</h3>
          <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
            <button type="button" className="tt-btn" onClick={() => onEdit('new')}><Plus size={16} /> Add table</button>
            <button type="button" className="tt-btn tt-btn-dark" disabled={floor.tables.length === 0} onClick={() => print(floor.tables.filter(t => t.isActive))}><Printer size={16} /> Print all QR codes</button>
          </div>
        </div>
        <div className="tt-bulk">
          <span>Quick add tables</span>
          <input type="number" min={1} max={999} value={from} onChange={e => setFrom(Number(e.target.value))} aria-label="From number" />
          <span>to</span>
          <input type="number" min={1} max={999} value={to} onChange={e => setTo(Number(e.target.value))} aria-label="To number" />
          <button type="button" className="tt-btn" onClick={bulk} disabled={!(to >= from)}>Add</button>
        </div>
        {floor.tables.length > 0 && (
          <div style={{ overflowX: 'auto' }}>
            <table className="tt-list">
              <thead><tr><th>Table</th><th>Name / area</th><th>Seats</th><th>Status</th><th>QR code</th><th /></tr></thead>
              <tbody>
                {floor.tables.map(table => (
                  <tr key={table.id}>
                    <td><strong>{table.number}</strong></td>
                    <td>{[table.name, table.area].filter(Boolean).join(' · ') || '–'}</td>
                    <td>{table.seats ?? '–'}</td>
                    <td>{table.isActive ? (table.session ? 'In use' : 'Available') : 'Hidden'}</td>
                    <td>
                      <span style={{ display: 'inline-flex', gap: '6px', flexWrap: 'wrap' }}>
                        <button type="button" className="tt-btn tt-btn-sm" onClick={() => setPreview(table)}><QrCode size={14} /> Show</button>
                        <button type="button" className="tt-btn tt-btn-sm" onClick={() => print([table])}><Printer size={14} /> Print</button>
                        <button type="button" className="tt-btn tt-btn-sm" onClick={() => regenerate(table)} title="New QR code"><RefreshCw size={14} /> New code</button>
                      </span>
                    </td>
                    <td style={{ whiteSpace: 'nowrap', textAlign: 'right' }}>
                      <button type="button" className="tt-icon" onClick={() => onEdit(table)} aria-label={`Edit table ${table.number}`}><Pencil size={16} /></button>
                      <button type="button" className="tt-icon is-danger" onClick={() => remove(table)} aria-label={`Delete table ${table.number}`}><Trash2 size={16} /></button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {preview && (
        <Modal title={`Table ${preview.number} QR code`} onClose={() => setPreview(null)}>
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '10px', textAlign: 'center' }}>
            <div dangerouslySetInnerHTML={{ __html: qrSvg(tableUrl(base, preview.qrToken), 240) }} />
            <code style={{ fontSize: '0.75rem', wordBreak: 'break-all', color: '#4b5563' }}>{tableUrl(base, preview.qrToken)}</code>
            <a className="tt-btn" href={tableUrl(base, preview.qrToken)} target="_blank" rel="noopener"><ExternalLink size={14} /> Open as a guest</a>
            {baseIsLocal && <p style={{ margin: 0, fontSize: '0.8rem', color: '#92400e' }}>This code points to localhost, so phones can't open it. Set the website address above.</p>}
          </div>
        </Modal>
      )}
    </div>
  );
}

function TableForm({ table, onClose, onSaved }: { table: FloorTable | null; onClose: () => void; onSaved: () => void }) {
  const [form, setForm] = useState({ number: table?.number ?? '', name: table?.name ?? '', area: table?.area ?? '', seats: table?.seats ?? 4, isActive: table?.isActive ?? true });
  const [busy, setBusy] = useState(false);
  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    try {
      const body = { number: form.number.trim(), name: form.name.trim() || null, area: form.area.trim() || null, seats: form.seats, isActive: form.isActive };
      const res = await apiFetch(table ? `/api/v1/dining/tables/${table.id}` : '/api/v1/dining/tables', { method: table ? 'PUT' : 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
      if (res.ok) {
        toast.success(table ? 'Table saved.' : `Table ${body.number} added.`);
        onSaved();
      } else toast.error(await errorMessage(res, 'Could not save the table.'));
    } finally {
      setBusy(false);
    }
  };
  return (
    <Modal title={table ? `Edit table ${table.number}` : 'Add table'} onClose={onClose}>
      <form onSubmit={submit} style={{ display: 'grid', gap: '0.9rem' }}>
        <label className="tt-field">Table number (shown to guests and staff)<input required maxLength={10} value={form.number} onChange={e => setForm({ ...form, number: e.target.value })} placeholder="e.g. 5, A2, テラス1" /></label>
        <label className="tt-field">Name (optional)<input maxLength={40} value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} placeholder="e.g. Window, 座敷" /></label>
        <label className="tt-field">Area (optional)<input maxLength={30} value={form.area} onChange={e => setForm({ ...form, area: e.target.value })} placeholder="e.g. 1F, Terrace" /></label>
        <label className="tt-field">Seats<input type="number" min={1} max={50} value={form.seats} onChange={e => setForm({ ...form, seats: Number(e.target.value) })} /></label>
        <label className="tt-check"><input type="checkbox" checked={form.isActive} onChange={e => setForm({ ...form, isActive: e.target.checked })} /><span>In use (hidden tables don't appear on the floor and their QR code doesn't work)</span></label>
        <button type="submit" disabled={busy} className="tt-btn tt-btn-dark tt-btn-lg">{table ? 'Save' : 'Add table'}</button>
      </form>
    </Modal>
  );
}

function Modal({ title, onClose, children }: { title: string; onClose: () => void; children: ReactNode }) {
  return (
    <div role="dialog" aria-modal="true" aria-label={title} style={overlay} onClick={onClose}>
      <div onClick={e => e.stopPropagation()} style={{ background: '#fff', borderRadius: '12px', padding: '1.25rem', width: '100%', maxWidth: '420px', maxHeight: '90vh', overflowY: 'auto' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
          <h2 style={{ margin: 0, fontSize: '1.15rem' }}>{title}</h2>
          <button type="button" onClick={onClose} aria-label="Close" style={{ background: 'none', border: 'none', cursor: 'pointer' }}><X size={20} /></button>
        </div>
        {children}
      </div>
    </div>
  );
}

const overlay: CSSProperties = { position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 60, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '1rem' };
