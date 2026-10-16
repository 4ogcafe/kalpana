import { useCallback, useEffect, useRef, useState, type CSSProperties } from 'react';
import { toast } from 'react-hot-toast';
import { Image, Plus, Trash2, Eye, EyeOff, Upload, X } from 'lucide-react';
import FooterSettings from './FooterSettings';
import GoogleReviewsSettings from './GoogleReviewsSettings';
import { apiFetch, assetUrl, errorMessage } from '../../lib/api';

// ── Types ──────────────────────────────────────────────────────────────────────
interface Settings {
  welcomeTitleEn?: string;
  welcomeTitleJa?: string;
  welcomeTextJa?: string;
  aboutJa?: string;
  storeSectionLabelJa?: string;
  storeSectionTitleJa?: string;
  storeSectionSubJa?: string;
  storeLocationJa?: string;
  storeBadgeJa?: string;
  storeReviewScore?: string;
  storeReviewText?: string;
  storeReviewLink?: string;
  aboutHeroImage?: string;
  contactHeroImage?: string;
  menuGrandHeroImage?: string;
  menuLunchHeroImage?: string;
  menuTakeoutHeroImage?: string;
  aboutStoryLabelJa?: string;
  aboutStoryTitleJa?: string;
  aboutStoryJa?: string;
  aboutSpiceLabelJa?: string;
  aboutSpiceTitleJa?: string;
  aboutSpiceDescJa?: string;
  aboutSpiceImage?: string;
  aboutChefLabelJa?: string;
  aboutChefTitleJa?: string;
  aboutChefDescJa?: string;
  aboutChefImage?: string;
}

interface Slide {
  id: string;
  titleEn?: string;
  titleJa?: string;
  altEn?: string;
  imageUrl: string;
  placement: 'HOME' | 'CONTACT';
  isActive: boolean;
  sortOrder: number;
}

const PLACEMENTS = ['HOME', 'CONTACT'] as const;

// ── Helpers ────────────────────────────────────────────────────────────────────
async function uploadImage(file: File): Promise<string> {
  const body = new FormData();
  body.append('image', file);
  const res = await apiFetch('/api/v1/upload', { method: 'POST', body });
  const data = await res.json().catch(() => ({}));
  if (res.ok && data.imageUrl) return data.imageUrl;
  throw new Error(data?.error?.message ?? 'Upload failed');
}

// ── Shared UI ──────────────────────────────────────────────────────────────────
const card: CSSProperties = { background: '#fff', borderRadius: '12px', padding: '1.75rem 2rem', boxShadow: '0 1px 3px rgba(0,0,0,0.08)', marginBottom: '1.5rem' };
const h3: CSSProperties = { margin: '0 0 1.25rem', fontSize: '1.1rem', fontWeight: 600 };
const lbl: CSSProperties = { display: 'flex', flexDirection: 'column', gap: '0.35rem', fontSize: '0.85rem', fontWeight: 500, color: '#374151', marginBottom: '0.75rem' };
const inp: CSSProperties = { padding: '0.6rem 0.75rem', border: '1px solid #d1d5db', borderRadius: '8px', background: '#f9fafb', fontSize: '0.9rem', width: '100%', boxSizing: 'border-box' };
const muted: CSSProperties = { color: '#6b7280', fontSize: '0.78rem', fontWeight: 400 };
const saveBtn: CSSProperties = { padding: '0.65rem 1.5rem', background: '#111', color: '#fff', border: 'none', borderRadius: '8px', fontWeight: 600, cursor: 'pointer', fontSize: '0.9rem' };
const outlineBtn: CSSProperties = { padding: '0.6rem 1rem', background: '#fff', border: '1px solid #d1d5db', borderRadius: '8px', cursor: 'pointer', fontWeight: 500, fontSize: '0.85rem', display: 'inline-flex', alignItems: 'center', gap: '6px' };
const dangerBtn: CSSProperties = { ...outlineBtn, color: '#dc2626', borderColor: '#fca5a5' };

function Thumb({ src }: { src?: string }) {
  if (!src) return null;
  const url = assetUrl(src) || src;
  return (
    <div style={{ marginTop: '0.5rem', borderRadius: '8px', overflow: 'hidden', width: 120, height: 72, background: '#f3f4f6', border: '1px solid #e5e7eb', flexShrink: 0 }}>
      <img src={url} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} onError={e => { (e.target as HTMLImageElement).style.display = 'none'; }} />
    </div>
  );
}

interface ImageFieldProps {
  label: string;
  hint?: string;
  value: string;
  onChange: (v: string) => void;
  onUpload?: (url: string) => void;
}
function ImageField({ label, hint, value, onChange, onUpload }: ImageFieldProps) {
  const [uploading, setUploading] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const handleFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    try {
      const url = await uploadImage(file);
      onChange(url);
      onUpload?.(url);
    } catch (err: any) {
      toast.error(err.message ?? 'Upload failed');
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = '';
    }
  };

  return (
    <label style={lbl}>
      {label}
      {hint && <span style={muted}>{hint}</span>}
      <div style={{ display: 'flex', gap: '8px', alignItems: 'flex-start', flexWrap: 'wrap' }}>
        <div style={{ flex: 1, minWidth: 200 }}>
          <input
            type="text"
            value={value}
            onChange={e => onChange(e.target.value)}
            placeholder="https://..."
            style={inp}
          />
          <Thumb src={value} />
        </div>
        <label style={{ ...outlineBtn, cursor: uploading ? 'wait' : 'pointer', marginTop: 0, height: 38, boxSizing: 'border-box' }}>
          <Upload size={14} />
          {uploading ? 'Uploading…' : 'Upload'}
          <input ref={fileRef} type="file" accept="image/*" hidden onChange={handleFile} />
        </label>
        {value && (
          <button type="button" style={{ ...outlineBtn, height: 38, boxSizing: 'border-box' }} onClick={() => onChange('')}>
            <X size={14} />
          </button>
        )}
      </div>
    </label>
  );
}

// ── Section save helper ────────────────────────────────────────────────────────
async function saveFields(fields: Partial<Settings>, label: string) {
  const res = await apiFetch('/api/v1/settings', {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(fields),
  });
  if (res.ok) toast.success(`${label} saved.`);
  else toast.error(await errorMessage(res, `Could not save ${label}.`));
}

// ── Sub-tabs ───────────────────────────────────────────────────────────────────

function HomePageTab({ settings, setSettings }: { settings: Settings; setSettings: (p: Partial<Settings>) => void }) {
  const [saving, setSaving] = useState(false);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      await saveFields({
        welcomeTitleEn: settings.welcomeTitleEn,
        welcomeTitleJa: settings.welcomeTitleJa,
        welcomeTextJa: settings.welcomeTextJa,
        aboutJa: settings.aboutJa,
        storeSectionLabelJa: settings.storeSectionLabelJa,
        storeSectionTitleJa: settings.storeSectionTitleJa,
        storeSectionSubJa: settings.storeSectionSubJa,
        storeLocationJa: settings.storeLocationJa,
        storeBadgeJa: settings.storeBadgeJa,
        storeReviewScore: settings.storeReviewScore,
        storeReviewText: settings.storeReviewText,
        storeReviewLink: settings.storeReviewLink,
      }, 'Home page content');
    } finally {
      setSaving(false);
    }
  };

  const set = (key: keyof Settings) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
    setSettings({ [key]: e.target.value });

  return (
    <form onSubmit={handleSave} style={{ display: 'flex', flexDirection: 'column' }}>
      <div style={card}>
        <h3 style={h3}>Indian Food Section</h3>
        <label style={lbl}>
          Title (EN)
          <input style={inp} type="text" value={settings.welcomeTitleEn ?? ''} onChange={set('welcomeTitleEn')} placeholder="Authentic Indian Flavors" />
        </label>
        <label style={lbl}>
          Title (JA)
          <input style={inp} type="text" value={settings.welcomeTitleJa ?? ''} onChange={set('welcomeTitleJa')} placeholder="本格インドの味わい" />
        </label>
        <label style={lbl}>
          Description (JA)
          <textarea style={{ ...inp, height: 120, resize: 'vertical', fontFamily: 'inherit' }} value={settings.welcomeTextJa ?? ''} onChange={set('welcomeTextJa')} placeholder="スパイスの香り豊かな..." />
        </label>
      </div>

      <div style={card}>
        <h3 style={h3}>Menu Explorer Section</h3>
        <label style={lbl}>
          Subtitle (JA)
          <span style={muted}>Shown under the "キッチンからお届け" heading on the home page.</span>
          <textarea style={{ ...inp, height: 80, resize: 'vertical', fontFamily: 'inherit' }} value={settings.aboutJa ?? ''} onChange={set('aboutJa')} placeholder="毎日手作りの新鮮な味 — 手挽きのスパイス、本格的な粘土窯（タンドール）、妥協のない調理" />
        </label>
      </div>

      <div style={card}>
        <h3 style={h3}>Our Store Section</h3>
        <label style={lbl}>
          Section Label
          <input style={inp} type="text" value={settings.storeSectionLabelJa ?? ''} onChange={set('storeSectionLabelJa')} placeholder="店舗を探す" />
        </label>
        <label style={lbl}>
          Section Title
          <input style={inp} type="text" value={settings.storeSectionTitleJa ?? ''} onChange={set('storeSectionTitleJa')} placeholder="私たちの店舗" />
        </label>
        <label style={lbl}>
          Subtitle Text
          <textarea style={{ ...inp, height: 80, resize: 'vertical', fontFamily: 'inherit' }} value={settings.storeSectionSubJa ?? ''} onChange={set('storeSectionSubJa')} placeholder="店舗を選択して..." />
        </label>
        <label style={lbl}>
          Location Tag
          <input style={inp} type="text" value={settings.storeLocationJa ?? ''} onChange={set('storeLocationJa')} placeholder="埼玉県熊谷市" />
        </label>
        <label style={lbl}>
          Badge Text
          <input style={inp} type="text" value={settings.storeBadgeJa ?? ''} onChange={set('storeBadgeJa')} placeholder="🍛 インド料理" />
        </label>
      </div>

      <div style={card}>
        <h3 style={h3}>Google Review Display</h3>
        <label style={lbl}>
          Review Score (e.g. 4.4)
          <input style={{ ...inp, maxWidth: 140 }} type="text" value={settings.storeReviewScore ?? ''} onChange={set('storeReviewScore')} placeholder="4.4" />
        </label>
        <label style={lbl}>
          Link Text
          <input style={inp} type="text" value={settings.storeReviewText ?? ''} onChange={set('storeReviewText')} placeholder="Googleでレビューを見る" />
        </label>
        <label style={lbl}>
          Link URL
          <input style={inp} type="url" value={settings.storeReviewLink ?? ''} onChange={set('storeReviewLink')} placeholder="https://..." />
        </label>
      </div>

      <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
        <button type="submit" disabled={saving} style={saveBtn}>{saving ? 'Saving…' : 'Save Home Page'}</button>
      </div>
    </form>
  );
}

function AboutPageTab({ settings, setSettings }: { settings: Settings; setSettings: (p: Partial<Settings>) => void }) {
  const [saving, setSaving] = useState(false);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      await saveFields({
        aboutStoryLabelJa: settings.aboutStoryLabelJa,
        aboutStoryTitleJa: settings.aboutStoryTitleJa,
        aboutStoryJa: settings.aboutStoryJa,
        aboutSpiceLabelJa: settings.aboutSpiceLabelJa,
        aboutSpiceTitleJa: settings.aboutSpiceTitleJa,
        aboutSpiceDescJa: settings.aboutSpiceDescJa,
        aboutSpiceImage: settings.aboutSpiceImage,
        aboutChefLabelJa: settings.aboutChefLabelJa,
        aboutChefTitleJa: settings.aboutChefTitleJa,
        aboutChefDescJa: settings.aboutChefDescJa,
        aboutChefImage: settings.aboutChefImage,
      }, 'About page content');
    } finally {
      setSaving(false);
    }
  };

  const set = (key: keyof Settings) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
    setSettings({ [key]: e.target.value });

  return (
    <form onSubmit={handleSave} style={{ display: 'flex', flexDirection: 'column' }}>
      <div style={card}>
        <h3 style={h3}>私たちの物語 — Story Section</h3>
        <label style={lbl}>
          Label
          <input style={inp} type="text" value={settings.aboutStoryLabelJa ?? ''} onChange={set('aboutStoryLabelJa')} placeholder="私たちの物語" />
        </label>
        <label style={lbl}>
          Title
          <input style={inp} type="text" value={settings.aboutStoryTitleJa ?? ''} onChange={set('aboutStoryTitleJa')} placeholder="本場インドの味を、熊谷へ" />
        </label>
        <label style={lbl}>
          Story Text
          <textarea style={{ ...inp, height: 160, resize: 'vertical', fontFamily: 'inherit' }} value={settings.aboutStoryJa ?? ''} onChange={set('aboutStoryJa')} placeholder="レストランの歴史やミッションについて..." />
        </label>
      </div>

      <div style={card}>
        <h3 style={h3}>こだわり — Spice Section</h3>
        <label style={lbl}>
          Label
          <input style={inp} type="text" value={settings.aboutSpiceLabelJa ?? ''} onChange={set('aboutSpiceLabelJa')} placeholder="こだわり" />
        </label>
        <label style={lbl}>
          Title
          <input style={inp} type="text" value={settings.aboutSpiceTitleJa ?? ''} onChange={set('aboutSpiceTitleJa')} placeholder="命を吹き込む、スパイス" />
        </label>
        <label style={lbl}>
          Description
          <textarea style={{ ...inp, height: 100, resize: 'vertical', fontFamily: 'inherit' }} value={settings.aboutSpiceDescJa ?? ''} onChange={set('aboutSpiceDescJa')} />
        </label>
        <ImageField
          label="Section Image"
          value={settings.aboutSpiceImage ?? ''}
          onChange={v => setSettings({ aboutSpiceImage: v })}
        />
      </div>

      <div style={card}>
        <h3 style={h3}>シェフ紹介 — Chef Section</h3>
        <label style={lbl}>
          Label
          <input style={inp} type="text" value={settings.aboutChefLabelJa ?? ''} onChange={set('aboutChefLabelJa')} placeholder="シェフ紹介" />
        </label>
        <label style={lbl}>
          Title
          <input style={inp} type="text" value={settings.aboutChefTitleJa ?? ''} onChange={set('aboutChefTitleJa')} placeholder="熟練の技" />
        </label>
        <label style={lbl}>
          Description
          <textarea style={{ ...inp, height: 100, resize: 'vertical', fontFamily: 'inherit' }} value={settings.aboutChefDescJa ?? ''} onChange={set('aboutChefDescJa')} />
        </label>
        <ImageField
          label="Chef Photo"
          value={settings.aboutChefImage ?? ''}
          onChange={v => setSettings({ aboutChefImage: v })}
        />
      </div>

      <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
        <button type="submit" disabled={saving} style={saveBtn}>{saving ? 'Saving…' : 'Save About Page'}</button>
      </div>
    </form>
  );
}

const BANNER_FIELDS: { key: keyof Settings; label: string; hint: string }[] = [
  { key: 'aboutHeroImage', label: 'About Us — Hero Image', hint: 'Banner shown at the top of the About page.' },
  { key: 'contactHeroImage', label: 'Contact Us — Hero Image', hint: 'Banner shown at the top of the Contact page.' },
  { key: 'menuGrandHeroImage', label: 'Grand Menu — Hero Image', hint: 'Banner shown at the top of the Grand Menu page.' },
  { key: 'menuLunchHeroImage', label: 'Lunch Menu — Hero Image', hint: 'Banner shown at the top of the Lunch Menu page.' },
  { key: 'menuTakeoutHeroImage', label: 'Takeout Menu — Hero Image', hint: 'Banner shown at the top of the Takeout Menu page.' },
];

function PageBannersTab({ settings, setSettings }: { settings: Settings; setSettings: (p: Partial<Settings>) => void }) {
  const [saving, setSaving] = useState(false);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      await saveFields({
        aboutHeroImage: settings.aboutHeroImage,
        contactHeroImage: settings.contactHeroImage,
        menuGrandHeroImage: settings.menuGrandHeroImage,
        menuLunchHeroImage: settings.menuLunchHeroImage,
        menuTakeoutHeroImage: settings.menuTakeoutHeroImage,
      }, 'Page banners');
    } finally {
      setSaving(false);
    }
  };

  return (
    <form onSubmit={handleSave}>
      <div style={card}>
        <h3 style={h3}>Page Hero Images</h3>
        <p style={{ ...muted, marginTop: 0, marginBottom: '1.5rem' }}>
          Each page can show a large hero banner image at the top. Paste an image URL or upload a file.
        </p>
        {BANNER_FIELDS.map(({ key, label, hint }) => (
          <div key={key} style={{ marginBottom: '1.5rem' }}>
            <ImageField
              label={label}
              hint={hint}
              value={(settings[key] as string) ?? ''}
              onChange={v => setSettings({ [key]: v })}
            />
          </div>
        ))}
      </div>
      <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
        <button type="submit" disabled={saving} style={saveBtn}>{saving ? 'Saving…' : 'Save Banners'}</button>
      </div>
    </form>
  );
}

const BLANK_SLIDE: { titleEn: string; titleJa: string; altEn: string; imageUrl: string; placement: 'HOME' | 'CONTACT' } = {
  titleEn: '',
  titleJa: '',
  altEn: '',
  imageUrl: '',
  placement: 'HOME',
};

function CarouselTab() {
  const [slides, setSlides] = useState<Slide[]>([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<Slide | null>(null);
  const [adding, setAdding] = useState(false);
  const [form, setForm] = useState(BLANK_SLIDE);
  const [saving, setSaving] = useState(false);
  const [filterPlacement, setFilterPlacement] = useState<'ALL' | 'HOME' | 'CONTACT'>('ALL');

  const fetch = useCallback(() => {
    setLoading(true);
    apiFetch('/api/v1/carousels?all=true')
      .then(r => r.json())
      .then(data => { if (Array.isArray(data)) setSlides(data); })
      .catch(() => toast.error('Could not load carousels'))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => { fetch(); }, [fetch]);

  const handleToggleActive = async (slide: Slide) => {
    const res = await apiFetch(`/api/v1/carousels/${slide.id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ isActive: !slide.isActive }),
    });
    if (res.ok) {
      setSlides(prev => prev.map(s => s.id === slide.id ? { ...s, isActive: !s.isActive } : s));
    } else {
      toast.error('Failed to update.');
    }
  };

  const handleDelete = async (id: string) => {
    if (!window.confirm('Delete this slide? This cannot be undone.')) return;
    const res = await apiFetch(`/api/v1/carousels/${id}`, { method: 'DELETE' });
    if (res.ok) {
      setSlides(prev => prev.filter(s => s.id !== id));
      toast.success('Slide deleted.');
    } else {
      toast.error('Failed to delete.');
    }
  };

  const handleSaveEdit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editing) return;
    setSaving(true);
    try {
      const res = await apiFetch(`/api/v1/carousels/${editing.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ titleEn: editing.titleEn, titleJa: editing.titleJa, altEn: editing.altEn, imageUrl: editing.imageUrl, isActive: editing.isActive }),
      });
      if (res.ok) {
        setEditing(null);
        fetch();
        toast.success('Slide updated.');
      } else {
        toast.error(await errorMessage(res, 'Failed to save.'));
      }
    } finally {
      setSaving(false);
    }
  };

  const handleAdd = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      const res = await apiFetch('/api/v1/carousels', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      });
      if (res.ok) {
        setAdding(false);
        setForm(BLANK_SLIDE);
        fetch();
        toast.success('Slide added.');
      } else {
        toast.error(await errorMessage(res, 'Failed to add.'));
      }
    } finally {
      setSaving(false);
    }
  };

  const visible = filterPlacement === 'ALL' ? slides : slides.filter(s => s.placement === filterPlacement);

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1rem', flexWrap: 'wrap', gap: '0.75rem' }}>
        <div style={{ display: 'flex', gap: '0.5rem' }}>
          {(['ALL', 'HOME', 'CONTACT'] as const).map(p => (
            <button key={p} type="button" onClick={() => setFilterPlacement(p)} style={{ padding: '0.4rem 0.85rem', borderRadius: '6px', border: '1px solid #d1d5db', background: filterPlacement === p ? '#111' : '#fff', color: filterPlacement === p ? '#fff' : '#374151', fontWeight: 500, cursor: 'pointer', fontSize: '0.85rem' }}>
              {p}
            </button>
          ))}
        </div>
        <button type="button" onClick={() => setAdding(true)} style={{ ...saveBtn, display: 'inline-flex', alignItems: 'center', gap: '6px' }}>
          <Plus size={15} /> Add Slide
        </button>
      </div>

      {loading ? (
        <div style={{ padding: '2rem', textAlign: 'center', color: '#6b7280' }}>Loading…</div>
      ) : visible.length === 0 ? (
        <div style={{ ...card, textAlign: 'center', color: '#6b7280', padding: '3rem' }}>
          <Image size={40} style={{ margin: '0 auto 0.75rem', display: 'block', opacity: 0.3 }} />
          No slides yet. Click "Add Slide" to get started.
        </div>
      ) : (
        <div style={{ display: 'grid', gap: '1rem' }}>
          {visible.map(slide => (
            <div key={slide.id} style={{ background: '#fff', borderRadius: '12px', border: '1px solid #e5e7eb', display: 'flex', alignItems: 'stretch', overflow: 'hidden', opacity: slide.isActive ? 1 : 0.6 }}>
              <div style={{ width: 140, flexShrink: 0, background: '#f3f4f6' }}>
                {slide.imageUrl ? (
                  <img src={assetUrl(slide.imageUrl) || slide.imageUrl} alt={slide.altEn || slide.titleEn || ''} style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block', minHeight: 88 }} />
                ) : (
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', minHeight: 88, color: '#9ca3af' }}>
                    <Image size={28} />
                  </div>
                )}
              </div>
              <div style={{ flex: 1, padding: '0.9rem 1.25rem', display: 'flex', flexDirection: 'column', justifyContent: 'center', gap: '0.2rem', minWidth: 0 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
                  <span style={{ fontSize: '0.95rem', fontWeight: 600, color: '#111' }}>{slide.titleEn || slide.titleJa || '(no title)'}</span>
                  <span style={{ fontSize: '0.75rem', padding: '2px 8px', borderRadius: '99px', background: slide.placement === 'HOME' ? '#dbeafe' : '#fef3c7', color: slide.placement === 'HOME' ? '#1d4ed8' : '#92400e', fontWeight: 600 }}>{slide.placement}</span>
                  <span style={{ fontSize: '0.75rem', padding: '2px 8px', borderRadius: '99px', background: slide.isActive ? '#dcfce7' : '#f3f4f6', color: slide.isActive ? '#16a34a' : '#6b7280', fontWeight: 600 }}>{slide.isActive ? 'Active' : 'Hidden'}</span>
                </div>
                {slide.titleJa && <div style={{ fontSize: '0.82rem', color: '#6b7280' }}>{slide.titleJa}</div>}
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', padding: '0 1rem', flexShrink: 0 }}>
                <button type="button" title={slide.isActive ? 'Hide' : 'Show'} onClick={() => handleToggleActive(slide)} style={outlineBtn}>
                  {slide.isActive ? <EyeOff size={15} /> : <Eye size={15} />}
                </button>
                <button type="button" onClick={() => setEditing({ ...slide })} style={outlineBtn}>Edit</button>
                <button type="button" onClick={() => handleDelete(slide.id)} style={dangerBtn}><Trash2 size={15} /></button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Add modal */}
      {adding && (
        <Modal title="Add New Slide" onClose={() => setAdding(false)}>
          <form onSubmit={handleAdd} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
            <label style={lbl}>
              Placement
              <select value={form.placement} onChange={e => setForm({ ...form, placement: e.target.value as 'HOME' | 'CONTACT' })} style={inp}>
                {PLACEMENTS.map(p => <option key={p} value={p}>{p}</option>)}
              </select>
            </label>
            <label style={lbl}>
              Title (EN)
              <input style={inp} type="text" value={form.titleEn} onChange={e => setForm({ ...form, titleEn: e.target.value })} />
            </label>
            <label style={lbl}>
              Title (JA)
              <input style={inp} type="text" value={form.titleJa} onChange={e => setForm({ ...form, titleJa: e.target.value })} />
            </label>
            <label style={lbl}>
              Alt Text
              <input style={inp} type="text" value={form.altEn} onChange={e => setForm({ ...form, altEn: e.target.value })} placeholder="Describe the image for accessibility" />
            </label>
            <ImageField
              label="Image *"
              value={form.imageUrl}
              onChange={v => setForm({ ...form, imageUrl: v })}
            />
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.75rem', marginTop: '0.5rem' }}>
              <button type="button" onClick={() => setAdding(false)} style={outlineBtn}>Cancel</button>
              <button type="submit" disabled={saving || !form.imageUrl} style={saveBtn}>{saving ? 'Adding…' : 'Add Slide'}</button>
            </div>
          </form>
        </Modal>
      )}

      {/* Edit modal */}
      {editing && (
        <Modal title="Edit Slide" onClose={() => setEditing(null)}>
          <form onSubmit={handleSaveEdit} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
            <label style={lbl}>
              Placement
              <span style={{ ...inp, background: '#f3f4f6', color: '#6b7280', cursor: 'not-allowed' }}>{editing.placement}</span>
              <span style={muted}>Placement cannot be changed after creation.</span>
            </label>
            <label style={lbl}>
              Title (EN)
              <input style={inp} type="text" value={editing.titleEn ?? ''} onChange={e => setEditing({ ...editing, titleEn: e.target.value })} />
            </label>
            <label style={lbl}>
              Title (JA)
              <input style={inp} type="text" value={editing.titleJa ?? ''} onChange={e => setEditing({ ...editing, titleJa: e.target.value })} />
            </label>
            <label style={lbl}>
              Alt Text
              <input style={inp} type="text" value={editing.altEn ?? ''} onChange={e => setEditing({ ...editing, altEn: e.target.value })} />
            </label>
            <label style={lbl}>
              Status
              <select value={editing.isActive ? 'active' : 'hidden'} onChange={e => setEditing({ ...editing, isActive: e.target.value === 'active' })} style={inp}>
                <option value="active">Active — visible on site</option>
                <option value="hidden">Hidden</option>
              </select>
            </label>
            <ImageField
              label="Image"
              value={editing.imageUrl}
              onChange={v => setEditing({ ...editing, imageUrl: v })}
            />
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.75rem', marginTop: '0.5rem' }}>
              <button type="button" onClick={() => setEditing(null)} style={outlineBtn}>Cancel</button>
              <button type="submit" disabled={saving} style={saveBtn}>{saving ? 'Saving…' : 'Save Changes'}</button>
            </div>
          </form>
        </Modal>
      )}
    </div>
  );
}

function Modal({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) {
  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100 }} onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div style={{ background: '#fff', borderRadius: '14px', padding: '1.75rem 2rem', width: '100%', maxWidth: 520, maxHeight: '90vh', overflowY: 'auto', boxShadow: '0 20px 60px rgba(0,0,0,0.25)' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.25rem' }}>
          <h2 style={{ margin: 0, fontSize: '1.1rem', fontWeight: 600 }}>{title}</h2>
          <button type="button" onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 4, color: '#6b7280' }}><X size={18} /></button>
        </div>
        {children}
      </div>
    </div>
  );
}

// ── Sub-tab labels ─────────────────────────────────────────────────────────────
const SUBTABS = ['Home Page', 'About Page', 'Page Banners', 'Carousel Slider', 'Google Reviews', 'Footer'] as const;
type SubTab = typeof SUBTABS[number];

// ── Root export ────────────────────────────────────────────────────────────────
export default function PageSettingsTab({ onOpenRestaurantSettings }: { onOpenRestaurantSettings?: () => void }) {
  const [subTab, setSubTab] = useState<SubTab>('Home Page');
  const [settings, setSettings] = useState<Settings>({});
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    apiFetch('/api/v1/settings')
      .then(r => r.json())
      .then(data => { if (data) setSettings(data); })
      .catch(() => toast.error('Could not load settings.'))
      .finally(() => setLoading(false));
  }, []);

  const patch = useCallback((partial: Partial<Settings>) => setSettings(prev => ({ ...prev, ...partial })), []);

  return (
    <div>
      {/* Sub-tab navigation */}
      <div style={{ display: 'flex', gap: 0, marginBottom: '2rem', borderBottom: '1px solid #e5e7eb', overflowX: 'auto', scrollbarWidth: 'none' }}>
        {SUBTABS.map(tab => (
          <button key={tab} onClick={() => setSubTab(tab)} style={{ padding: '0.75rem 1.1rem', background: 'none', border: 'none', borderBottom: subTab === tab ? '2px solid #111' : '2px solid transparent', fontWeight: subTab === tab ? 600 : 500, color: subTab === tab ? '#111' : '#6b7280', cursor: 'pointer', fontSize: '0.9rem', whiteSpace: 'nowrap', flexShrink: 0, transition: 'color 0.15s' }}>
            {tab}
          </button>
        ))}
      </div>

      {loading ? (
        <div style={{ padding: '3rem', textAlign: 'center', color: '#6b7280' }}>Loading settings…</div>
      ) : (
        <>
          {subTab === 'Home Page' && <HomePageTab settings={settings} setSettings={patch} />}
          {subTab === 'About Page' && <AboutPageTab settings={settings} setSettings={patch} />}
          {subTab === 'Page Banners' && <PageBannersTab settings={settings} setSettings={patch} />}
          {subTab === 'Carousel Slider' && <CarouselTab />}
          {subTab === 'Google Reviews' && <GoogleReviewsSettings />}
          {subTab === 'Footer' && <FooterSettings onOpenRestaurantSettings={onOpenRestaurantSettings} />}
        </>
      )}
    </div>
  );
}
