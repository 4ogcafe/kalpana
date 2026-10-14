import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Armchair, Bell, Gift, Mail, Plus, Search, ShoppingBag, Stamp, Table2, UserCircle, UserPlus, UtensilsCrossed } from 'lucide-react';
import { apiFetch } from '../../lib/api';
import { formatOrderNumber, yen } from '../../lib/format';

/** What a tab should do when it opens from the top bar (e.g. open its "add" form). */
export interface TabIntent {
  action: 'add-item' | 'new-offer' | 'add-table' | 'add-user' | 'stamp' | 'search';
  value?: string;
  nonce: number;
}
export type Navigate = (tab: string, intent?: Omit<TabIntent, 'nonce'>) => void;

interface SearchResults {
  orders: { id: string; number: number; status: string; fulfillment: string; tableNumber: string | null; customerName: string; createdAt: string }[];
  members: { id: string; name: string; email: string; phone: string }[];
  menuItems: { id: string; nameEn: string; nameJa: string | null; price: number; isSoldOut: boolean }[];
  tables: { id: string; number: string; name: string | null }[];
  messages: { id: string; name: string; type: string; createdAt: string; isRead: boolean }[];
}
interface Note {
  id: string;
  tone: 'critical' | 'warning' | 'info';
  title: string;
  detail?: string;
  tab: string;
  at?: string;
}

const SEARCH_DELAY_MS = 250;
const NOTIFY_POLL_MS = 20_000;
const STATUS: Record<string, string> = { NEW: 'New', CONFIRMED: 'Cooking', READY: 'Ready', COMPLETED: 'Done', CANCELLED: 'Cancelled' };

/** Closes a popover on outside click or Escape. */
function useDismiss(open: boolean, close: () => void) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const onDown = (e: PointerEvent) => ref.current && !ref.current.contains(e.target as Node) && close();
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && close();
    document.addEventListener('pointerdown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('pointerdown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open, close]);
  return ref;
}

export function GlobalSearch({ isAdmin, onNavigate }: { isAdmin: boolean; onNavigate: Navigate }) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<SearchResults | null>(null);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const ref = useDismiss(open, () => setOpen(false));
  const inputRef = useRef<HTMLInputElement>(null);

  // "/" focuses the search from anywhere in the admin.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement;
      if (e.key === '/' && !['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName) && !target.isContentEditable) {
        e.preventDefault();
        inputRef.current?.focus();
      }
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, []);

  useEffect(() => {
    const q = query.trim();
    if (!q) return;
    let cancelled = false;
    const timer = setTimeout(async () => {
      setLoading(true);
      try {
        const res = await apiFetch(`/api/v1/dashboard/search?q=${encodeURIComponent(q)}`);
        if (!cancelled && res.ok) setResults(await res.json());
      } finally {
        if (!cancelled) setLoading(false);
      }
    }, SEARCH_DELAY_MS);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [query]);

  const go = (tab: string, intent?: Omit<TabIntent, 'nonce'>) => {
    onNavigate(tab, intent);
    setOpen(false);
    setQuery('');
    setResults(null);
  };
  const shown = query.trim() ? results : null;
  const total = shown ? shown.orders.length + shown.members.length + shown.menuItems.length + shown.tables.length + shown.messages.length : 0;

  return (
    <div ref={ref} className="tb-search">
      <Search size={18} className="tb-search-icon" aria-hidden="true" />
      <input
        ref={inputRef}
        type="search"
        value={query}
        onChange={e => {
          setQuery(e.target.value);
          setOpen(true);
        }}
        onFocus={() => setOpen(true)}
        placeholder={isAdmin ? 'Search orders, members, menu…  ( / )' : 'Search orders, menu, tables…  ( / )'}
        aria-label="Search the admin"
        aria-expanded={open && Boolean(shown)}
        aria-controls="admin-search-results"
      />
      {open && query.trim() && (
        <div id="admin-search-results" className="tb-pop tb-search-pop" role="listbox" aria-busy={loading}>
          {!shown ? (
            <p className="tb-pop-empty">Searching…</p>
          ) : total === 0 ? (
            <p className="tb-pop-empty">Nothing found for “{query.trim()}”.</p>
          ) : (
            <>
              <Group title="Orders" items={shown.orders.map(order => ({
                key: order.id,
                icon: <ShoppingBag size={16} />,
                title: `#${formatOrderNumber(order.number)} · ${order.fulfillment === 'DINE_IN' ? `Table ${order.tableNumber}` : order.customerName}`,
                detail: `${STATUS[order.status] ?? order.status} · ${new Date(order.createdAt).toLocaleString('ja-JP', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' })}`,
                onSelect: () => go('Orders'),
              }))} />
              <Group title="Members" items={shown.members.map(member => ({
                key: member.id,
                icon: <UserCircle size={16} />,
                title: member.name,
                detail: [member.email, member.phone].filter(Boolean).join(' · '),
                onSelect: () => go('Members', { action: 'search', value: member.email }),
              }))} />
              <Group title="Menu" items={shown.menuItems.map(item => ({
                key: item.id,
                icon: <UtensilsCrossed size={16} />,
                title: item.nameJa || item.nameEn,
                detail: `${item.nameEn} · ${yen(item.price)}${item.isSoldOut ? ' · sold out' : ''}`,
                onSelect: () => go('Menu Management'),
              }))} />
              <Group title="Tables" items={shown.tables.map(table => ({
                key: table.id,
                icon: <Armchair size={16} />,
                title: `Table ${table.number}`,
                detail: table.name ?? '',
                onSelect: () => go('Tables'),
              }))} />
              <Group title="Messages" items={shown.messages.map(message => ({
                key: message.id,
                icon: <Mail size={16} />,
                title: message.name,
                detail: `${message.type.toLowerCase()}${message.isRead ? '' : ' · unread'}`,
                onSelect: () => go('Contact Messages'),
              }))} />
            </>
          )}
        </div>
      )}
    </div>
  );
}

function Group({ title, items }: { title: string; items: { key: string; icon: ReactNode; title: string; detail: string; onSelect: () => void }[] }) {
  if (items.length === 0) return null;
  return (
    <div className="tb-group">
      <div className="tb-group-title">{title}</div>
      {items.map(item => (
        <button key={item.key} type="button" role="option" aria-selected="false" className="tb-row" onClick={item.onSelect}>
          <span className="tb-row-icon">{item.icon}</span>
          <span className="tb-row-text">
            <strong>{item.title}</strong>
            {item.detail && <small>{item.detail}</small>}
          </span>
        </button>
      ))}
    </div>
  );
}

export function NotificationBell({ onNavigate }: { onNavigate: Navigate }) {
  const [notes, setNotes] = useState<Note[]>([]);
  const [count, setCount] = useState(0);
  const [open, setOpen] = useState(false);
  const ref = useDismiss(open, () => setOpen(false));

  useEffect(() => {
    const load = () =>
      apiFetch('/api/v1/dashboard/notifications')
        .then(res => (res.ok ? res.json() : null))
        .then(data => {
          if (!data) return;
          setNotes(data.items);
          setCount(data.count);
        })
        .catch(() => undefined);
    load();
    const intervalId = setInterval(load, NOTIFY_POLL_MS);
    return () => clearInterval(intervalId);
  }, []);

  return (
    <div ref={ref} style={{ position: 'relative' }}>
      <button type="button" className="tb-icon-btn" onClick={() => setOpen(o => !o)} aria-expanded={open} aria-label={count ? `${count} notifications` : 'Notifications'}>
        <Bell size={22} />
        {count > 0 && <span className="tb-count">{count > 99 ? '99+' : count}</span>}
      </button>
      {open && (
        <div className="tb-pop tb-pop-right" role="dialog" aria-label="Notifications">
          <div className="tb-pop-head">Notifications</div>
          {notes.length === 0 ? (
            <p className="tb-pop-empty">All caught up — nothing needs attention.</p>
          ) : (
            notes.map(note => (
              <button key={note.id} type="button" className={`tb-row tb-note is-${note.tone}`} onClick={() => { onNavigate(note.tab); setOpen(false); }}>
                <span className="tb-dot" aria-hidden="true" />
                <span className="tb-row-text">
                  <strong>{note.title}</strong>
                  {(note.detail || note.at) && (
                    <small>{[note.detail, note.at && new Date(note.at).toLocaleTimeString('ja-JP', { timeZone: 'Asia/Tokyo', hour: '2-digit', minute: '2-digit' })].filter(Boolean).join(' · ')}</small>
                  )}
                </span>
              </button>
            ))
          )}
        </div>
      )}
    </div>
  );
}

export function QuickAdd({ isAdmin, onNavigate }: { isAdmin: boolean; onNavigate: Navigate }) {
  const [open, setOpen] = useState(false);
  const ref = useDismiss(open, () => setOpen(false));
  const actions: { label: string; detail: string; icon: ReactNode; tab: string; action?: TabIntent['action']; adminOnly?: boolean }[] = [
    { label: 'Menu item', detail: 'Add a dish to the menu', icon: <UtensilsCrossed size={16} />, tab: 'Menu Management', action: 'add-item' },
    { label: 'Seat guests', detail: 'Open a table for dine-in', icon: <Armchair size={16} />, tab: 'Tables' },
    { label: 'Give a stamp', detail: 'Scan a member at the counter', icon: <Stamp size={16} />, tab: 'Orders', action: 'stamp' },
    { label: 'Offer', detail: 'Discount or member special', icon: <Gift size={16} />, tab: 'Stamps, Offers & Points', action: 'new-offer', adminOnly: true },
    { label: 'Table', detail: 'Add a table and its QR code', icon: <Table2 size={16} />, tab: 'Tables', action: 'add-table', adminOnly: true },
    { label: 'Staff user', detail: 'Admin, staff or kitchen account', icon: <UserPlus size={16} />, tab: 'Staff Users', action: 'add-user', adminOnly: true },
  ];
  return (
    <div ref={ref} style={{ position: 'relative' }}>
      <button type="button" className="tb-add-btn" onClick={() => setOpen(o => !o)} aria-expanded={open} aria-haspopup="menu">
        <Plus size={18} />
        <span className="adm-hide-sm">Quick Add</span>
      </button>
      {open && (
        <div className="tb-pop tb-pop-right" role="menu">
          {actions.filter(a => isAdmin || !a.adminOnly).map(a => (
            <button key={a.label} type="button" role="menuitem" className="tb-row" onClick={() => { onNavigate(a.tab, a.action ? { action: a.action } : undefined); setOpen(false); }}>
              <span className="tb-row-icon">{a.icon}</span>
              <span className="tb-row-text"><strong>{a.label}</strong><small>{a.detail}</small></span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
