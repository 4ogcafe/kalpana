import { useEffect, useRef, useState } from 'react';
import { toast } from 'react-hot-toast';
import { useNavigate } from 'react-router-dom';
import { apiFetch, assetUrl, errorMessage } from '../lib/api';
import OrdersTab from '../components/admin/OrdersTab';
import './admin.css';
import OffersTab from '../components/admin/OffersTab';
import CustomersTab from '../components/admin/CustomersTab';
import StaffUsersTab from '../components/admin/StaffUsersTab';
import OverviewTab from '../components/admin/overview/OverviewTab';
import { GlobalSearch, NotificationBell, QuickAdd, type Navigate, type TabIntent } from '../components/admin/TopBar';
import TablesTab from '../components/admin/tables/TablesTab';
import TableCallAlerts from '../components/admin/TableCallAlerts';
import GoogleReviewsSettings from '../components/admin/GoogleReviewsSettings';
import FooterSettings from '../components/admin/FooterSettings';
import { 
  LayoutDashboard, 
  Settings, 
  Menu as MenuIcon, 
  Image as ImageIcon, 
  ShoppingBag,
  Gift,
  UserCircle,
  MessageSquare, 
  Users, 
  LogOut,
  Plus,
  MoreVertical,
  ChevronDown,
  ChevronRight,
  ChefHat,
  Armchair,
  X
} from 'lucide-react';

// STAFF may edit menu items; everything else is admin-only (enforced by the API too).
const STAFF_TABS = ['Overview', 'Orders', 'Tables', 'Menu Management'];
const STATS_POLL_MS = 30_000;

/** A short beep for new orders; browsers only allow it after the user has clicked on the page. */
function playOrderChime() {
  try {
    const audio = new AudioContext();
    const tone = audio.createOscillator();
    tone.frequency.value = 880;
    tone.connect(audio.destination);
    tone.start();
    tone.stop(audio.currentTime + 0.3);
    tone.onended = () => audio.close();
  } catch {
    // No audio available; the toast still shows.
  }
}

export default function AdminDashboard() {
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState('Overview');
  // Phones and tablets: the sidebar slides in from the ☰ button.
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [user, setUser] = useState<any>(null);
  const [unreadCount, setUnreadCount] = useState(0);
  const [newOrdersCount, setNewOrdersCount] = useState(0);
  const lastNewOrders = useRef<number | null>(null);
  const [tableCalls, setTableCalls] = useState(0);
  const lastTableCalls = useRef<number | null>(null);

  useEffect(() => {
    // The session lives in an httpOnly cookie; ask the API who is logged in.
    apiFetch('/api/v1/auth/me')
      .then(res => (res.ok ? res.json() : Promise.reject(new Error('Not logged in'))))
      .then(data => {
        // Kitchen accounts have no admin access; their screen is the kitchen display.
        if (data.user?.role === 'KITCHEN') navigate('/kitchen', { replace: true });
        else setUser(data.user);
      })
      .catch(() => navigate('/login'));

    // Poll for unread messages and new pickup orders; announce orders that arrived since the last check.
    const loadStats = () =>
      apiFetch('/api/v1/dashboard/stats')
        .then(res => res.json())
        .then(data => {
          if (data?.unreadMessagesCount !== undefined) setUnreadCount(data.unreadMessagesCount);
          if (typeof data?.newOrdersCount === 'number') {
            if (lastNewOrders.current !== null && data.newOrdersCount > lastNewOrders.current) {
              toast.success('New pickup order received!', { duration: 8000 });
              playOrderChime();
            }
            lastNewOrders.current = data.newOrdersCount;
            setNewOrdersCount(data.newOrdersCount);
          }
          // Guests calling from their table (staff, water, bill).
          if (typeof data?.tableCallsCount === 'number') {
            lastTableCalls.current = data.tableCallsCount;
            setTableCalls(data.tableCallsCount);
          }
        })
        .catch(console.error);

    loadStats();
    const intervalId = setInterval(loadStats, STATS_POLL_MS);
    return () => clearInterval(intervalId);
  }, [navigate]);

  // Top-bar search, notifications and Quick Add open a tab, optionally asking it to do something.
  const [intent, setIntent] = useState<TabIntent | null>(null);
  const navigateTo: Navigate = (tab, next) => {
    setActiveTab(tab);
    setSidebarOpen(false);
    setIntent(prev => (next ? { ...next, nonce: (prev?.nonce ?? 0) + 1 } : null));
  };

  const handleLogout = async () => {
    await apiFetch('/api/v1/auth/logout', { method: 'POST' }).catch(() => undefined);
    navigate('/login');
  };

  const tabs = [
    { name: 'Overview', icon: LayoutDashboard },
    { name: 'Orders', icon: ShoppingBag },
    { name: 'Tables', icon: Armchair },
    { name: 'Stamps, Offers & Points', icon: Gift },
    { name: 'Members', icon: UserCircle },
    { name: 'Restaurant Settings', icon: Settings },
    { name: 'Menu Management', icon: MenuIcon },
    { name: 'Page Settings', icon: ImageIcon },
    { name: 'Contact Messages', icon: MessageSquare },
    { name: 'Staff Users', icon: Users },
  ].filter(tab => user?.role === 'ADMIN' || STAFF_TABS.includes(tab.name));

  if (!user) {
    return <div style={{ padding: '40px', textAlign: 'center' }}>Loading…</div>;
  }

  return (
    <div className="adm-root" style={{ display: 'flex', height: '100vh', backgroundColor: '#f3f4f6', fontFamily: "'Inter', sans-serif" }}>
      {sidebarOpen && <div className="adm-backdrop" onClick={() => setSidebarOpen(false)} aria-hidden="true" />}
      <title>Admin | Kalpana</title>
      <meta name="robots" content="noindex, nofollow" />
      
      {/* Sidebar */}
      <div id="admin-sidebar" className={`adm-sidebar${sidebarOpen ? ' is-open' : ''}`} style={{ 
        width: '280px', 
        backgroundColor: '#ffffff', 
        borderRight: '1px solid #e5e7eb',
        display: 'flex', 
        flexDirection: 'column',
        boxShadow: '4px 0 24px rgba(0,0,0,0.02)'
      }}>
        <div style={{ padding: '2rem 1.5rem', display: 'flex', alignItems: 'center', gap: '12px' }}>
          <div style={{ width: '40px', height: '40px', backgroundColor: '#000', borderRadius: '8px', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontWeight: 'bold', fontSize: '1.2rem' }}>
            K
          </div>
          <span style={{ fontSize: '1.25rem', fontWeight: '700', color: '#111827', letterSpacing: '-0.5px' }}>Kalpana Admin</span>
          <button type="button" className="adm-close-btn" onClick={() => setSidebarOpen(false)} aria-label="Close menu">
            <X size={22} aria-hidden="true" />
          </button>
        </div>

        <nav style={{ flex: 1, padding: '0 1rem', marginTop: '1rem', display: 'flex', flexDirection: 'column', gap: '4px' }}>
          <div style={{ fontSize: '0.75rem', fontWeight: '600', color: '#9ca3af', textTransform: 'uppercase', letterSpacing: '1px', marginBottom: '8px', paddingLeft: '0.5rem' }}>Management</div>
          {tabs.map(tab => {
            const Icon = tab.icon;
            const isActive = activeTab === tab.name;
            return (
              <div 
                key={tab.name} 
                role="button"
                tabIndex={0}
                aria-current={isActive ? 'page' : undefined}
                onClick={() => navigateTo(tab.name)}
                onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); navigateTo(tab.name); } }}
                style={{ 
                  padding: '0.875rem 1rem', 
                  cursor: 'pointer',
                  backgroundColor: isActive ? '#f3f4f6' : 'transparent',
                  color: isActive ? '#000' : '#4b5563',
                  borderRadius: '8px',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '12px',
                  fontWeight: isActive ? '600' : '500',
                  transition: 'all 0.2s ease'
                }}
              >
                <Icon size={20} strokeWidth={isActive ? 2.5 : 2} style={{ color: isActive ? '#000' : '#9ca3af' }} />
                {tab.name}
                {tab.name === 'Contact Messages' && unreadCount > 0 && (
                  <span style={{ marginLeft: 'auto', backgroundColor: '#6b7280', color: '#fff', borderRadius: '9999px', padding: '2px 8px', fontSize: '0.75rem', fontWeight: 700 }} aria-label={`${unreadCount} unread`}>
                    {unreadCount}
                  </span>
                )}
                {tab.name === 'Tables' && tableCalls > 0 && (
                  <span style={{ marginLeft: 'auto', backgroundColor: '#ef4444', color: '#fff', borderRadius: '9999px', padding: '2px 8px', fontSize: '0.75rem', fontWeight: 700 }} aria-label={`${tableCalls} table calls`}>
                    🔔 {tableCalls}
                  </span>
                )}
                {tab.name === 'Orders' && newOrdersCount > 0 && (
                  <span style={{ marginLeft: 'auto', backgroundColor: '#ef4444', color: '#fff', borderRadius: '9999px', padding: '2px 8px', fontSize: '0.75rem', fontWeight: 700 }}>
                    {newOrdersCount}
                  </span>
                )}
              </div>
            );
          })}
          <a
            href="/kitchen"
            target="_blank"
            rel="noopener"
            style={{ marginTop: '8px', padding: '0.875rem 1rem', borderRadius: '8px', display: 'flex', alignItems: 'center', gap: '12px', fontWeight: 600, color: '#111827', textDecoration: 'none', border: '1px dashed #d1d5db' }}
          >
            <ChefHat size={20} style={{ color: '#d97706' }} aria-hidden="true" />
            Kitchen display ↗
          </a>
        </nav>

        <div style={{ padding: '1.5rem', borderTop: '1px solid #e5e7eb' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '1.5rem' }}>
            <div style={{ width: '36px', height: '36px', borderRadius: '50%', backgroundColor: '#e5e7eb', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 'bold', color: '#4b5563' }}>
              {user?.name?.charAt(0) || 'A'}
            </div>
            <div>
              <div style={{ fontSize: '0.875rem', fontWeight: '600', color: '#111827' }}>{user?.name || 'Admin'}</div>
              <div style={{ fontSize: '0.75rem', color: '#6b7280' }}>{user?.email || 'admin@example.com'}</div>
            </div>
          </div>
          <button 
            onClick={handleLogout} 
            style={{ 
              width: '100%', padding: '0.75rem', backgroundColor: '#fff', color: '#ef4444', 
              border: '1px solid #fca5a5', borderRadius: '8px', cursor: 'pointer', 
              display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px',
              fontWeight: '500', transition: 'background-color 0.2s'
            }}
            onMouseOver={(e) => e.currentTarget.style.backgroundColor = '#fef2f2'}
            onMouseOut={(e) => e.currentTarget.style.backgroundColor = '#fff'}
          >
            <LogOut size={18} />
            Logout
          </button>
        </div>
      </div>

      {/* Main Content Area */}
      <div className="adm-main" style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
        
        {/* Topbar */}
        <div className="adm-topbar" style={{ height: '72px', backgroundColor: '#fff', borderBottom: '1px solid #e5e7eb', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '1rem', padding: '0 2rem' }}>
          <button type="button" className="adm-menu-btn" onClick={() => setSidebarOpen(true)} aria-label="Open menu" aria-expanded={sidebarOpen} aria-controls="admin-sidebar">
            <MenuIcon size={24} aria-hidden="true" />
          </button>
          <GlobalSearch isAdmin={user.role === 'ADMIN'} onNavigate={navigateTo} />
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
            <NotificationBell onNavigate={navigateTo} />
            <QuickAdd isAdmin={user.role === 'ADMIN'} onNavigate={navigateTo} />
          </div>
        </div>

        {/* Guest calls ring here (on every tab) until someone accepts them. */}
        <TableCallAlerts onOpenTables={() => navigateTo('Tables')} />

        {/* Dynamic Content */}
        <div className="adm-content" style={{ flex: 1, padding: '2rem', overflowY: 'auto' }}>
          
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', marginBottom: '2rem' }}>
            <div>
              <h1 className="adm-title" style={{ fontSize: '2rem', fontWeight: '700', color: '#111827', margin: '0 0 0.5rem 0', letterSpacing: '-0.5px' }}>{activeTab}</h1>
              <p style={{ color: '#6b7280', margin: 0 }}>
                {activeTab === 'Overview'
                  ? user.role === 'ADMIN'
                    ? "What's happening now, and how the restaurant is doing."
                    : "What's happening in the restaurant right now."
                  : activeTab === 'Tables'
                    ? 'Dine-in: seat guests, answer table calls, and take payment. Guests order from the QR code on their table.'
                    : `Manage your restaurant's ${activeTab.toLowerCase()} data and settings.`}
              </p>
            </div>
          </div>

          {activeTab === 'Overview' && <OverviewTab isAdmin={user.role === 'ADMIN'} onNavigate={tab => navigateTo(tab)} />}
          {activeTab === 'Orders' && <OrdersTab isAdmin={user.role === 'ADMIN'} intent={intent} />}
          {activeTab === 'Tables' && <TablesTab isAdmin={user.role === 'ADMIN'} intent={intent} />}
          {activeTab === 'Stamps, Offers & Points' && <OffersTab intent={intent} />}
          {activeTab === 'Members' && <CustomersTab intent={intent} />}
          {activeTab === 'Restaurant Settings' && <SettingsTab />}
          {activeTab === 'Menu Management' && <MenuTab intent={intent} />}
          {activeTab === 'Page Settings' && <PageSettingsTab onOpenRestaurantSettings={() => navigateTo('Restaurant Settings')} />}
          {activeTab === 'Contact Messages' && <MessagesTab />}
          {activeTab === 'Staff Users' && <StaffUsersTab currentUserId={user.id} intent={intent} />}

        </div>
      </div>
    </div>
  );
}

// --- SUB-COMPONENTS FOR EACH TAB ---

function SettingsTab() {
  const [settings, setSettings] = useState<any>({
    name: '',
    email: '',
    phone: '',
    addressEn: '',
    addressJa: '',
    mapUrl: '',
    weeklyHours: { monday: '' },
    holidays: { regular: '' },
    socials: { instagram: '', facebook: '', x: '', youtube: '' }
  });

  useEffect(() => {
    apiFetch('/api/v1/settings')
      .then(res => res.json())
      .then(data => {
        if (data && (data._id || data.id)) {
          setSettings({
            name: data.name || '',
            email: data.email || '',
            phone: data.phone || '',
            addressEn: data.addressEn || '',
            addressJa: data.addressJa || '',
            mapUrl: data.mapUrl || '',
            aboutEn: data.aboutEn || '',
            aboutJa: data.aboutJa || '',
            aboutStoryLabelJa: data.aboutStoryLabelJa || '',
            aboutStoryTitleJa: data.aboutStoryTitleJa || '',
            aboutStoryJa: data.aboutStoryJa || '',
            aboutSpiceLabelJa: data.aboutSpiceLabelJa || '',
            aboutSpiceTitleJa: data.aboutSpiceTitleJa || '',
            aboutSpiceDescJa: data.aboutSpiceDescJa || '',
            aboutSpiceImage: data.aboutSpiceImage || '',
            aboutChefLabelJa: data.aboutChefLabelJa || '',
            aboutChefTitleJa: data.aboutChefTitleJa || '',
            aboutChefDescJa: data.aboutChefDescJa || '',
            aboutChefImage: data.aboutChefImage || '',
            aboutHeroImage: data.aboutHeroImage || '',
            contactHeroImage: data.contactHeroImage || '',
            grandMenuHeroImage: data.grandMenuHeroImage || '',
            lunchMenuHeroImage: data.lunchMenuHeroImage || '',
            takeoutMenuHeroImage: data.takeoutMenuHeroImage || '',
            welcomeTitleEn: data.welcomeTitleEn || '',
            welcomeTitleJa: data.welcomeTitleJa || '',
            welcomeTextJa: data.welcomeTextJa || '',
            weeklyHours: data.weeklyHours || { monday: '' },
            holidays: data.holidays || { regular: '' },
            socials: {
              instagram: data.socials?.instagram || '',
              facebook: data.socials?.facebook || '',
              x: data.socials?.x || '',
              youtube: data.socials?.youtube || ''
            }
          });
        }
      })
      .catch(console.error);
  }, []);

  const handleSave = async () => {
    try {
      const res = await apiFetch('/api/v1/settings', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(settings)
      });
      if (res.ok) {
        toast.success('Settings saved successfully!');
      } else {
        toast.error(await errorMessage(res, 'Failed to save settings.'));
      }
    } catch (err) {
      toast.error('Network error while saving settings.');
    }
  };

  const handleChange = (e: any) => {
    const { name, value } = e.target;
    
    let processedValue = value;
    // Auto-extract src from iframe if user pasted the full embed code
    if (name === 'mapUrl' && value.includes('<iframe')) {
      const match = value.match(/src="([^"]+)"/);
      if (match) {
        processedValue = match[1];
      }
    }

    if (name.includes('.')) {
      const [parent, child] = name.split('.');
      setSettings((prev: any) => ({
        ...prev,
        [parent]: {
          ...(prev as any)[parent],
          [child]: processedValue
        }
      }));
    } else {
      setSettings((prev: any) => ({ ...prev, [name]: processedValue }));
    }
  };

  return (
    <div style={{ backgroundColor: '#fff', borderRadius: '12px', boxShadow: '0 1px 3px rgba(0,0,0,0.05)', border: '1px solid #e5e7eb', overflow: 'hidden' }}>
      <div style={{ padding: '1.5rem', borderBottom: '1px solid #e5e7eb' }}>
        <h3 style={{ margin: 0, fontSize: '1.25rem', fontWeight: '600' }}>General Information</h3>
        <p style={{ margin: '0.25rem 0 0 0', color: '#6b7280', fontSize: '0.875rem' }}>Update your restaurant's core details and location.</p>
      </div>
      <div style={{ padding: '2rem' }}>
        <form style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1.5rem' }}>
          <div style={{ gridColumn: '1 / -1' }}>
            <label style={labelStyle}>Restaurant Name</label>
            <input name="name" type="text" value={settings.name} onChange={handleChange} style={inputStyle} />
          </div>
          <div>
            <label style={labelStyle}>Email Address</label>
            <input name="email" type="email" value={settings.email} onChange={handleChange} style={inputStyle} />
          </div>
          <div>
            <label style={labelStyle}>Phone Number</label>
            <input name="phone" type="text" value={settings.phone} onChange={handleChange} style={inputStyle} />
          </div>
          <div style={{ gridColumn: '1 / -1' }}>
            <label style={labelStyle}>Address (EN)</label>
            <input name="addressEn" type="text" value={settings.addressEn} onChange={handleChange} style={inputStyle} />
          </div>
          <div style={{ gridColumn: '1 / -1' }}>
            <label style={labelStyle}>Address (JA)</label>
            <input name="addressJa" type="text" value={settings.addressJa} onChange={handleChange} style={inputStyle} />
          </div>
          <div style={{ gridColumn: '1 / -1' }}>
            <label style={labelStyle}>Google Maps Embed URL</label>
            <input name="mapUrl" type="text" placeholder="https://www.google.com/maps/embed?..." value={settings.mapUrl} onChange={handleChange} style={inputStyle} />
            <p style={{ margin: '0.25rem 0 0 0', fontSize: '0.75rem', color: '#6b7280' }}>
              On Google Maps, click "Share" -&gt; "Embed a map" -&gt; "Copy HTML". Paste it here, and the URL will automatically be extracted! (Do not use standard Google Maps links).
            </p>
          </div>
          <div style={{ gridColumn: '1 / -1', margin: '1rem 0 -0.5rem 0' }}>
            <h4 style={{ margin: 0, fontSize: '1.1rem', fontWeight: '600', color: '#111827' }}>Business Details</h4>
            <div style={{ borderBottom: '1px solid #e5e7eb', marginTop: '0.5rem' }}></div>
          </div>
          <div>
            <label style={labelStyle}>Weekly Hours</label>
            <input name="weeklyHours.monday" type="text" placeholder="e.g. ランチ 11:30–15:00 / ディナー 17:00–22:00" value={settings.weeklyHours.monday} onChange={handleChange} style={inputStyle} />
          </div>
          <div>
            <label style={labelStyle}>Regular Holiday</label>
            <input name="holidays.regular" type="text" placeholder="e.g. 火曜日 (Tuesday)" value={settings.holidays.regular} onChange={handleChange} style={inputStyle} />
          </div>
          <div style={{ gridColumn: '1 / -1', margin: '1rem 0 -0.5rem 0' }}>
            <h4 style={{ margin: 0, fontSize: '1.1rem', fontWeight: '600', color: '#111827' }}>Social Media Links</h4>
            <div style={{ borderBottom: '1px solid #e5e7eb', marginTop: '0.5rem' }}></div>
          </div>
          <div>
            <label style={labelStyle}>Instagram URL</label>
            <input name="socials.instagram" type="text" placeholder="https://instagram.com/..." value={settings.socials.instagram} onChange={handleChange} style={inputStyle} />
          </div>
          <div>
            <label style={labelStyle}>Facebook URL</label>
            <input name="socials.facebook" type="text" placeholder="https://facebook.com/..." value={settings.socials.facebook} onChange={handleChange} style={inputStyle} />
          </div>
          <div>
            <label style={labelStyle}>X (Twitter) URL</label>
            <input name="socials.x" type="text" placeholder="https://x.com/..." value={settings.socials.x} onChange={handleChange} style={inputStyle} />
          </div>
          <div>
            <label style={labelStyle}>YouTube URL</label>
            <input name="socials.youtube" type="text" placeholder="https://youtube.com/..." value={settings.socials.youtube} onChange={handleChange} style={inputStyle} />
          </div>
          <div style={{ gridColumn: '1 / -1', marginTop: '1rem', display: 'flex', justifyContent: 'flex-end' }}>
            <button 
              type="button" 
              onClick={handleSave}
              style={{ padding: '0.75rem 1.5rem', backgroundColor: '#000', color: '#fff', border: 'none', borderRadius: '8px', fontWeight: '500', cursor: 'pointer' }}
            >
              Save Settings
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

/** What "Automatic" means for a category on the table QR menu (same rule as the API's lib/dining.ts). */
function dineInByDefault(category: any, categories: any[]): boolean {
  const looksTakeout = (c: any) => /takeout|take-out|take out/i.test(c?.nameEn ?? '') || /テイクアウト|持ち帰り/.test(c?.nameJa ?? '');
  if (looksTakeout(category)) return false;
  const seen = new Set<string>();
  for (let parent = categories.find(c => c.id === category.parentId); parent && !seen.has(parent.id); parent = categories.find(c => c.id === parent.parentId)) {
    seen.add(parent.id);
    if (typeof parent.dineIn === 'boolean') return parent.dineIn;
    if (looksTakeout(parent)) return false;
  }
  return true;
}

function MenuTab({ intent }: { intent: TabIntent | null }) {
  const [categories, setCategories] = useState<any[]>([]);
  const [items, setItems] = useState<any[]>([]);
  
  const [selectedCategory, setSelectedCategory] = useState<any>(null);
  const [isAdding, setIsAdding] = useState(false);
  const [isAddingCategory, setIsAddingCategory] = useState(false);
  // Quick Add → "Menu item" opens the add form straight away.
  useEffect(() => {
    if (intent?.action === 'add-item') setIsAdding(true);
  }, [intent]);
  const [newCategoryName, setNewCategoryName] = useState('');
  const [newCategoryParentId, setNewCategoryParentId] = useState('');
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});

  
  const [uploading, setUploading] = useState(false);
  const [newItem, setNewItem] = useState({
    id: '',
    nameEn: '',
    price: '',
    categoryName: '',
    descriptionEn: '',
    imageUrl: '',
    rating: '5',
    isRecommended: false,
    isVegetarian: false,
    isVegan: false,
    isGlutenFree: false
  });

  const fetchData = async () => {
    try {
      const catRes = await apiFetch('/api/v1/menu/categories');
      const catData = await catRes.json();
      if (Array.isArray(catData)) {
        setCategories(catData);
        if (catData.length > 0 && !selectedCategory) {
          setSelectedCategory(catData[0]);
          setNewItem(prev => ({ ...prev, categoryName: catData[0].nameEn }));
        }
      }
      
      const itemRes = await apiFetch('/api/v1/menu/items');
      const itemData = await itemRes.json();
      if (Array.isArray(itemData)) {
        setItems(itemData);
      }
    } catch (err) {
      console.error('Failed to fetch data', err);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  const handleFileUpload = async (e: any) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    const formData = new FormData();
    formData.append('image', file);
    try {
      const res = await apiFetch('/api/v1/upload', {
        method: 'POST',
        body: formData
      });
      const data = await res.json();
      if (data.imageUrl) {
        setNewItem(prev => ({ ...prev, imageUrl: data.imageUrl }));
      } else {
        toast.error('Upload failed.');
      }
    } catch (err) {
      toast.error('Error uploading image.');
    } finally {
      setUploading(false);
    }
  };

  const handleSaveItem = async (e: any) => {
    e.preventDefault();
    try {
      const url = newItem.id ? `/api/v1/menu/items/${newItem.id}` : '/api/v1/menu/items';
      const method = newItem.id ? 'PUT' : 'POST';
      const res = await apiFetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(newItem)
      });
      if (res.ok) {
        toast.success(newItem.id ? 'Food item updated successfully!' : 'Food item added successfully!');
        setIsAdding(false);
        setNewItem({
          id: '', nameEn: '', price: '', categoryName: selectedCategory?.nameEn || '', descriptionEn: '', imageUrl: '', rating: '5', isRecommended: false, isVegetarian: false, isVegan: false, isGlutenFree: false
        });
        fetchData();
      } else {
        toast.error(await errorMessage(res, 'Failed to save food item.'));
      }
    } catch (err) {
      toast.error('Network error.');
    }
  };

  const handleEditItem = (item: any) => {
    setNewItem({
      id: item.id,
      nameEn: item.nameEn || '',
      price: item.price || '',
      categoryName: selectedCategory?.nameEn || '',
      descriptionEn: item.descriptionEn || '',
      imageUrl: item.imageUrl || '',
      rating: item.rating || '5',
      isRecommended: item.isRecommended || false,
      isVegetarian: item.isVegetarian || false,
      isVegan: item.isVegan || false,
      isGlutenFree: item.isGlutenFree || false
    });
    setIsAdding(true);
  };

  const handleToggleSoldOut = async (item: any) => {
    try {
      const res = await apiFetch(`/api/v1/menu/items/${item.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ isSoldOut: !item.isSoldOut })
      });
      if (res.ok) {
        toast.success(item.isSoldOut ? `${item.nameEn} is back in stock.` : `${item.nameEn} marked sold out; it can no longer be ordered.`);
        fetchData();
      } else {
        toast.error(await errorMessage(res, 'Failed to update stock.'));
      }
    } catch {
      toast.error('Network error.');
    }
  };

  const handleDeleteItem = async (id: string) => {
    if (!window.confirm('Are you sure you want to delete this item?')) return;
    try {
      const res = await apiFetch(`/api/v1/menu/items/${id}`, { method: 'DELETE' });
      if (res.ok) {
        fetchData();
      } else {
        toast.error('Failed to delete item.');
      }
    } catch (err) {
      toast.error('Network error.');
    }
  };

  const handleAddCategory = async (e: any) => {
    e.preventDefault();
    if (!newCategoryName.trim()) return;
    try {
      const payload: any = { nameEn: newCategoryName };
      if (newCategoryParentId) payload.parentId = newCategoryParentId;

      const res = await apiFetch('/api/v1/menu/categories', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      if (res.ok) {
        const addedCat = await res.json();
        setNewCategoryName('');
        setNewCategoryParentId('');
        setIsAddingCategory(false);
        fetchData();
        setSelectedCategory(addedCat);
      }
    } catch (err) {
      toast.error('Failed to add category.');
    }
  };

  const handleEditCategory = async (id: string, newName: string) => {
    try {
      const res = await apiFetch(`/api/v1/menu/categories/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ nameEn: newName })
      });
      if (res.ok) {
        fetchData();
        setSelectedCategory((prev: any) => ({ ...prev, nameEn: newName }));
      }
    } catch (err) {
      toast.error('Network error.');
    }
  };

  // Show or hide a category on the table QR menu (null = automatic).
  const handleCategoryDineIn = async (id: string, dineIn: boolean | null) => {
    try {
      const res = await apiFetch(`/api/v1/menu/categories/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ dineIn })
      });
      if (res.ok) {
        toast.success(dineIn === null ? 'Table menu: automatic.' : dineIn ? 'Shown on the table menu.' : 'Hidden from the table menu.');
        fetchData();
        setSelectedCategory((prev: any) => ({ ...prev, dineIn }));
      } else toast.error(await errorMessage(res, 'Could not save.'));
    } catch {
      toast.error('Network error.');
    }
  };

  const handleDeleteCategory = async (id: string) => {
    if (!window.confirm('Are you sure you want to delete this category? This will also delete all items inside it!')) return;
    try {
      const res = await apiFetch(`/api/v1/menu/categories/${id}`, { method: 'DELETE' });
      if (res.ok) {
        fetchData();
        setSelectedCategory(null);
      } else {
        toast.error(await errorMessage(res, 'Failed to delete category.'));
      }
    } catch (err) {
      toast.error('Network error.');
    }
  };

  const filteredItems = items.filter(item => item.categoryId === selectedCategory?.id);

  const lunchCategories = categories.filter(c => !c.parentId && c.nameEn.toLowerCase().includes('lunch') && !c.nameEn.toLowerCase().includes('takeout'));
  const takeoutCategories = categories.filter(c => !c.parentId && c.nameEn.toLowerCase().includes('takeout'));
  const grandCategories = categories.filter(c => !c.parentId && !c.nameEn.toLowerCase().includes('lunch') && !c.nameEn.toLowerCase().includes('takeout'));

  const renderCategory = (cat: any) => {
    const subCats = categories.filter(sub => sub.parentId === cat.id);
    const hasChildren = subCats.length > 0;
    const isExpanded = expanded[cat.id];
    
    return (
      <div key={cat.id}>
        <div 
          onClick={() => {
            if (hasChildren) {
              setExpanded(prev => ({ ...prev, [cat.id]: !prev[cat.id] }));
            }
            setSelectedCategory(cat);
            setNewItem(prev => ({ ...prev, categoryName: cat.nameEn }));
            setIsAdding(false);
          }}
          style={{ 
            display: 'flex', alignItems: 'center', gap: '8px',
            padding: '0.6rem 1rem', 
            cursor: 'pointer', 
            fontSize: '0.95rem',
            color: selectedCategory?.id === cat.id ? '#8b4513' : '#374151',
            borderRadius: '8px',
            backgroundColor: selectedCategory?.id === cat.id ? '#faebd7' : 'transparent',
            fontWeight: selectedCategory?.id === cat.id ? '700' : '500',
            marginBottom: '4px',
            transition: 'all 0.2s'
          }}
          onMouseOver={e => {
            if (selectedCategory?.id !== cat.id) e.currentTarget.style.backgroundColor = '#f9fafb';
          }}
          onMouseOut={e => {
            if (selectedCategory?.id !== cat.id) e.currentTarget.style.backgroundColor = 'transparent';
          }}
        >
          {hasChildren && (
            <span style={{ color: '#6b7280', display: 'flex', alignItems: 'center' }}>
              {isExpanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
            </span>
          )}
          <span style={{ flex: 1, paddingLeft: hasChildren ? 0 : '22px' }}>{cat.nameEn}</span>
        </div>
        
        {/* Subcategories */}
        {hasChildren && isExpanded && subCats.map(sub => (
          <div 
            key={sub.id}
            onClick={() => {
              setSelectedCategory(sub);
              setNewItem(prev => ({ ...prev, categoryName: sub.nameEn }));
              setIsAdding(false);
            }}
            style={{ 
              padding: '0.5rem 1rem 0.5rem 3rem', 
              cursor: 'pointer', 
              fontSize: '0.9rem',
              color: selectedCategory?.id === sub.id ? '#8b4513' : '#4b5563',
              borderRadius: '8px',
              backgroundColor: selectedCategory?.id === sub.id ? '#faebd7' : 'transparent',
              fontWeight: selectedCategory?.id === sub.id ? '600' : '400',
              marginBottom: '2px',
              transition: 'all 0.2s'
            }}
            onMouseOver={e => {
              if (selectedCategory?.id !== sub.id) e.currentTarget.style.backgroundColor = '#f9fafb';
            }}
            onMouseOut={e => {
              if (selectedCategory?.id !== sub.id) e.currentTarget.style.backgroundColor = 'transparent';
            }}
          >
            {sub.nameEn}
          </div>
        ))}
      </div>
    );
  };

  return (
    <div className="adm-menu-layout" style={{ display: 'flex', gap: '2rem', height: '100%', alignItems: 'flex-start' }}>
      
      {/* Sidebar Section */}
      <div className="adm-menu-categories" style={{ 
        width: '320px', 
        backgroundColor: '#fff', 
        borderRadius: '12px', 
        boxShadow: '0 1px 3px rgba(0,0,0,0.05)', 
        border: '1px solid #e5e7eb',
        display: 'flex',
        flexDirection: 'column',
        padding: '1.5rem',
        fontFamily: "'Inter', sans-serif"
      }}>
        
        <div style={{ marginBottom: '1.5rem', flex: 1, overflowY: 'auto' }}>
          
          {/* LUNCH MENU */}
          {lunchCategories.length > 0 && (
            <div style={{ marginBottom: '1.5rem' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
                <span style={{ fontWeight: '800', fontSize: '1.05rem', color: '#111827' }}>Lunch Menu</span>
                <span style={{ fontSize: '0.85rem', color: '#6b7280' }}>11:00–15:00</span>
              </div>
              {lunchCategories.map(renderCategory)}
              <hr style={{ margin: '1rem 0', border: 'none', borderTop: '1px solid #e5e7eb' }} />
            </div>
          )}

          {/* TAKEOUT MENU */}
          {takeoutCategories.length > 0 && (
            <div style={{ marginBottom: '1.5rem' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
                <span style={{ fontWeight: '800', fontSize: '1.05rem', color: '#111827' }}>Takeout Menu</span>
                <span style={{ fontSize: '0.85rem', color: '#6b7280' }}>Tax 8%</span>
              </div>
              {takeoutCategories.map(renderCategory)}
              <hr style={{ margin: '1rem 0', border: 'none', borderTop: '1px solid #e5e7eb' }} />
            </div>
          )}

          {/* GRAND MENU */}
          {grandCategories.length > 0 && (
            <div style={{ marginBottom: '1.5rem' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
                <span style={{ fontWeight: '800', fontSize: '1.05rem', color: '#111827' }}>Grand Menu</span>
                <span style={{ fontSize: '0.85rem', color: '#6b7280' }}>All day</span>
              </div>
              {grandCategories.map(renderCategory)}
            </div>
          )}
          
        </div>

        {/* Add Category Form/Button */}
        {isAddingCategory ? (
          <form onSubmit={handleAddCategory} style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', marginTop: '1rem' }}>
            <select
              value={newCategoryParentId}
              onChange={e => setNewCategoryParentId(e.target.value)}
              style={{ ...inputStyle, padding: '0.5rem', fontSize: '0.875rem' }}
            >
              <option value="">No Parent (Root Category)</option>
              {categories.filter(c => !c.parentId).map(c => (
                <option key={c.id} value={c.id}>{c.nameEn}</option>
              ))}
            </select>
            <input 
              autoFocus
              value={newCategoryName}
              onChange={e => setNewCategoryName(e.target.value)}
              placeholder="Category Name"
              style={{ ...inputStyle, padding: '0.5rem', fontSize: '0.875rem' }}
            />
            <div style={{ display: 'flex', gap: '0.5rem' }}>
              <button type="submit" style={{ flex: 1, padding: '0.5rem', backgroundColor: '#000', color: '#fff', border: 'none', borderRadius: '6px', cursor: 'pointer', fontWeight: '500' }}>Add</button>
              <button type="button" onClick={() => setIsAddingCategory(false)} style={{ flex: 1, padding: '0.5rem', backgroundColor: '#f3f4f6', color: '#4b5563', border: 'none', borderRadius: '6px', cursor: 'pointer', fontWeight: '500' }}>Cancel</button>
            </div>
          </form>
        ) : (
          <button 
            onClick={() => setIsAddingCategory(true)}
            style={{ 
              width: '100%', 
              padding: '0.75rem', 
              backgroundColor: '#fff', 
              border: '1px dashed #d1d5db', 
              borderRadius: '8px',
              color: '#4b5563',
              fontSize: '0.9rem',
              fontWeight: '500',
              cursor: 'pointer',
              marginTop: 'auto',
              display: 'flex',
              justifyContent: 'center',
              alignItems: 'center',
              gap: '8px',
              transition: 'all 0.2s'
            }}
            onMouseOver={e => { e.currentTarget.style.backgroundColor = '#f9fafb'; e.currentTarget.style.borderColor = '#9ca3af'; }}
            onMouseOut={e => { e.currentTarget.style.backgroundColor = '#fff'; e.currentTarget.style.borderColor = '#d1d5db'; }}
          >
            <Plus size={16} /> Add category
          </button>
        )}
      </div>

      {/* Main Content Area - Item Details */}
      <div className="adm-menu-items" style={{ flex: 1, backgroundColor: '#fff', borderRadius: '12px', boxShadow: '0 1px 3px rgba(0,0,0,0.05)', border: '1px solid #e5e7eb', padding: '2rem', overflowY: 'auto' }}>
        
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '1rem', marginBottom: '2rem' }}>
          <div style={{ display: 'flex', gap: '1rem', alignItems: 'center' }}>
            <div>
              <h2 style={{ fontSize: '1.5rem', fontWeight: '700', margin: 0, color: '#111827' }}>
                {isAdding ? (newItem.id ? 'Edit Food Item' : 'Add New Food Item') : selectedCategory?.nameEn || 'Select a Category'}
              </h2>
              {!isAdding && <div style={{ color: '#6b7280', fontSize: '0.9rem', marginTop: '4px' }}>
                {filteredItems.length} items in this category
              </div>}
            </div>
            {!isAdding && selectedCategory && (
              <div style={{ display: 'flex', gap: '0.5rem', marginLeft: '1rem' }}>
                <button 
                  onClick={() => {
                    const newName = prompt('Enter new category name:', selectedCategory.nameEn);
                    if (newName && newName.trim() !== '') {
                      handleEditCategory(selectedCategory.id, newName.trim());
                    }
                  }}
                  style={{ padding: '0.3rem 0.6rem', fontSize: '0.8rem', backgroundColor: '#f3f4f6', border: '1px solid #d1d5db', borderRadius: '4px', cursor: 'pointer', fontWeight: '500' }}
                >
                  Rename
                </button>
                <label style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', fontSize: '0.8rem', color: '#374151' }} title="Whether these dishes appear on the menu guests see from the table QR code">
                  Table QR menu
                  <select
                    value={selectedCategory.dineIn === true ? 'show' : selectedCategory.dineIn === false ? 'hide' : 'auto'}
                    onChange={e => handleCategoryDineIn(selectedCategory.id, e.target.value === 'auto' ? null : e.target.value === 'show')}
                    style={{ padding: '0.25rem 0.4rem', fontSize: '0.8rem', border: '1px solid #d1d5db', borderRadius: '4px', background: '#fff' }}
                  >
                    <option value="auto">Automatic ({dineInByDefault(selectedCategory, categories) ? 'shown' : 'hidden'})</option>
                    <option value="show">Show</option>
                    <option value="hide">Hide</option>
                  </select>
                </label>
                <button 
                  onClick={() => handleDeleteCategory(selectedCategory.id)}
                  style={{ padding: '0.3rem 0.6rem', fontSize: '0.8rem', backgroundColor: '#fee2e2', border: '1px solid #fca5a5', color: '#ef4444', borderRadius: '4px', cursor: 'pointer', fontWeight: '500' }}
                >
                  Delete
                </button>
              </div>
            )}
          </div>
          
          {selectedCategory && !isAdding ? (
            <button 
              onClick={() => {
                setNewItem(prev => ({ ...prev, categoryName: selectedCategory.nameEn }));
                setIsAdding(true);
              }}
              style={{ padding: '0.6rem 1.25rem', backgroundColor: '#000', color: '#fff', border: 'none', borderRadius: '8px', fontWeight: '500', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '8px' }}
            >
              <Plus size={16} />
              Add Food Item
            </button>
          ) : isAdding ? (
            <button 
              onClick={() => setIsAdding(false)}
              style={{ padding: '0.6rem 1.25rem', backgroundColor: '#fff', color: '#4b5563', border: '1px solid #d1d5db', borderRadius: '8px', fontWeight: '500', cursor: 'pointer' }}
            >
              Cancel
            </button>
          ) : null}
        </div>

        {isAdding ? (
          <form onSubmit={handleSaveItem} style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1.5rem' }}>
            <div style={{ gridColumn: '1 / -1' }}>
              <label style={labelStyle}>Image Upload</label>
              <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
                {newItem.imageUrl && (
                  <img src={assetUrl(newItem.imageUrl)} alt="Preview" style={{ width: '80px', height: '80px', objectFit: 'cover', borderRadius: '8px', border: '1px solid #e5e7eb' }} />
                )}
                <div style={{ flex: 1 }}>
                  <input type="file" accept="image/*" onChange={handleFileUpload} style={{...inputStyle, padding: '0.5rem'}} />
                  {uploading && <p style={{fontSize: '0.75rem', color: '#6b7280', marginTop: '0.5rem'}}>Uploading image...</p>}
                </div>
              </div>
            </div>

            <div>
              <label style={labelStyle}>Food Name (English)</label>
              <input required value={newItem.nameEn} onChange={e => setNewItem({...newItem, nameEn: e.target.value})} type="text" style={inputStyle} placeholder="e.g. Chicken Curry" />
            </div>

            <div>
              <label style={labelStyle}>Category</label>
              <select value={newItem.categoryName} onChange={e => setNewItem({...newItem, categoryName: e.target.value})} style={inputStyle}>
                {categories.map(cat => (
                  <option key={cat.id} value={cat.nameEn}>{cat.nameEn}</option>
                ))}
              </select>
            </div>

            <div>
              <label style={labelStyle}>Price (¥)</label>
              <input required value={newItem.price} onChange={e => setNewItem({...newItem, price: e.target.value})} type="number" style={inputStyle} placeholder="e.g. 1000" />
            </div>

            <div>
              <label style={labelStyle}>Rating (1-5)</label>
              <input required value={newItem.rating} onChange={e => setNewItem({...newItem, rating: e.target.value})} type="number" step="0.1" min="1" max="5" style={inputStyle} />
            </div>

            <div style={{ gridColumn: '1 / -1' }}>
              <label style={labelStyle}>Food Description</label>
              <textarea 
                value={newItem.descriptionEn} 
                onChange={e => setNewItem({...newItem, descriptionEn: e.target.value})} 
                style={{ ...inputStyle, minHeight: '80px', resize: 'vertical' }} 
                placeholder="Describe the ingredients, taste, and preparation..."
              />
            </div>

            <div style={{ gridColumn: '1 / -1', display: 'flex', gap: '2rem', padding: '1rem', backgroundColor: '#f9fafb', borderRadius: '8px', border: '1px solid #e5e7eb' }}>
              <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer', fontSize: '0.9rem', fontWeight: '500' }}>
                <input type="checkbox" checked={newItem.isRecommended} onChange={e => setNewItem({...newItem, isRecommended: e.target.checked})} style={{ width: '16px', height: '16px' }} />
                Highly Recommended
              </label>
              <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer', fontSize: '0.9rem', fontWeight: '500' }}>
                <input type="checkbox" checked={newItem.isVegetarian} onChange={e => setNewItem({...newItem, isVegetarian: e.target.checked})} style={{ width: '16px', height: '16px' }} />
                Vegetarian
              </label>
              <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer', fontSize: '0.9rem', fontWeight: '500' }}>
                <input type="checkbox" checked={newItem.isVegan} onChange={e => setNewItem({...newItem, isVegan: e.target.checked})} style={{ width: '16px', height: '16px' }} />
                Vegan
              </label>
              <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer', fontSize: '0.9rem', fontWeight: '500' }}>
                <input type="checkbox" checked={newItem.isGlutenFree} onChange={e => setNewItem({...newItem, isGlutenFree: e.target.checked})} style={{ width: '16px', height: '16px' }} />
                Gluten Free
              </label>
            </div>

            <div style={{ gridColumn: '1 / -1', display: 'flex', justifyContent: 'flex-end', marginTop: '1rem' }}>
              <button type="submit" disabled={uploading} style={{ padding: '0.75rem 2rem', backgroundColor: '#000', color: '#fff', border: 'none', borderRadius: '8px', fontWeight: '600', cursor: uploading ? 'not-allowed' : 'pointer' }}>
                Save Food Item
              </button>
            </div>
          </form>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
            {filteredItems.length === 0 ? (
              <div style={{ padding: '3rem', textAlign: 'center', backgroundColor: '#f9fafb', borderRadius: '8px', border: '1px dashed #d1d5db', color: '#6b7280' }}>
                <p>No food items found in this category.</p>
                <button 
                  onClick={() => setIsAdding(true)}
                  style={{ marginTop: '1rem', padding: '0.5rem 1rem', backgroundColor: '#fff', color: '#111827', border: '1px solid #d1d5db', borderRadius: '6px', fontWeight: '500', cursor: 'pointer' }}
                >
                  Add your first item
                </button>
              </div>
            ) : (
              filteredItems.map(item => (
                <div key={item.id} style={{ display: 'flex', gap: '1.5rem', padding: '1.5rem', backgroundColor: '#f9fafb', borderRadius: '12px', border: '1px solid #e5e7eb', alignItems: 'center' }}>
                  {item.imageUrl ? (
                    <img src={assetUrl(item.imageUrl)} alt={item.nameEn} style={{ width: '100px', height: '100px', objectFit: 'cover', borderRadius: '8px', flexShrink: 0 }} />
                  ) : (
                    <div style={{ width: '100px', height: '100px', backgroundColor: '#e5e7eb', borderRadius: '8px', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#9ca3af', fontSize: '0.8rem', flexShrink: 0 }}>No Image</div>
                  )}
                  <div style={{ flex: 1 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                      <h3 style={{ margin: '0 0 0.5rem 0', fontSize: '1.1rem', fontWeight: '700', color: '#111827' }}>{item.nameEn}</h3>
                      <div style={{ fontWeight: '700', color: '#8b4513', fontSize: '1.1rem' }}>¥{item.price}</div>
                    </div>
                    {item.descriptionEn && <p style={{ margin: '0 0 0.75rem 0', color: '#6b7280', fontSize: '0.9rem', lineHeight: '1.4' }}>{item.descriptionEn}</p>}
                    
                    <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
                      {item.isSoldOut && <span style={{ padding: '2px 8px', backgroundColor: '#fee2e2', color: '#b91c1c', borderRadius: '9999px', fontSize: '0.75rem', fontWeight: '600' }}>Sold out</span>}
                      {item.isRecommended && <span style={{ padding: '2px 8px', backgroundColor: '#fef3c7', color: '#d97706', borderRadius: '9999px', fontSize: '0.75rem', fontWeight: '600' }}>Recommended</span>}
                      {item.isVegetarian && <span style={{ padding: '2px 8px', backgroundColor: '#d1fae5', color: '#059669', borderRadius: '9999px', fontSize: '0.75rem', fontWeight: '600' }}>Vegetarian</span>}
                      {item.isVegan && <span style={{ padding: '2px 8px', backgroundColor: '#dcfce3', color: '#16a34a', borderRadius: '9999px', fontSize: '0.75rem', fontWeight: '600' }}>Vegan</span>}
                      {item.isGlutenFree && <span style={{ padding: '2px 8px', backgroundColor: '#e0e7ff', color: '#4f46e5', borderRadius: '9999px', fontSize: '0.75rem', fontWeight: '600' }}>Gluten Free</span>}
                    </div>
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                    <button onClick={() => handleEditItem(item)} style={{ padding: '0.5rem', backgroundColor: '#fff', border: '1px solid #d1d5db', borderRadius: '6px', color: '#4b5563', cursor: 'pointer', fontWeight: '500' }}>Edit</button>
                    <button onClick={() => handleToggleSoldOut(item)} style={{ padding: '0.5rem', backgroundColor: '#fff', border: '1px solid #d1d5db', borderRadius: '6px', color: item.isSoldOut ? '#059669' : '#b45309', cursor: 'pointer', fontWeight: '500' }}>{item.isSoldOut ? 'Back in stock' : 'Mark sold out'}</button>
                    <button onClick={() => handleDeleteItem(item.id)} style={{ padding: '0.5rem', backgroundColor: '#fee2e2', border: '1px solid #fca5a5', borderRadius: '6px', color: '#ef4444', cursor: 'pointer', fontWeight: '500' }}>Delete</button>
                  </div>
                </div>
              ))
            )}
          </div>
        )}
      </div>
    </div>
  );
}

/** Settings that have their own editor elsewhere in the admin. */
const OTHER_SCREEN_SETTINGS = /^(footer|stamp|dining|delivery|pickup|points|google|featuredReviews$|storeReviewCount$|orderingPausedUntil$|publicSiteUrl$|signupBonusPoints$|pointValueYen$|taxRatePercent$)/;

function PageSettingsTab({ onOpenRestaurantSettings }: { onOpenRestaurantSettings?: () => void }) {
  const [subTab, setSubTab] = useState('Home Page');
  const [settings, setSettings] = useState<any>({});
  
  const [carousels, setCarousels] = useState<any[]>([]);
  const [rawData, setRawData] = useState<any[]>([]);
  const [editing, setEditing] = useState<any>(null);
  const [isAdding, setIsAdding] = useState(false);
  const [newSlide, setNewSlide] = useState({ titleEn: '', titleJa: '', imageUrl: '', placement: 'HOME', isActive: true });
  const [uploading, setUploading] = useState(false);

  const fetchCarousels = () => {
    apiFetch('/api/v1/carousels?all=true')
      .then(res => res.json())
      .then(data => {
        if (Array.isArray(data)) {
          setRawData(data);
          setCarousels(data.map(c => [
            c.imageUrl ? `[Image: ${c.imageUrl.substring(0, 15)}]` : '[No Image]', 
            c.placement || 'HOME', 
            c.titleEn || '-', 
            c.titleJa || '-', 
            c.isActive,
            '', // for action column
            c.id // hidden id
          ]));
        }
      })
      .catch(console.error);
  };

  useEffect(() => {
    fetchCarousels();
    apiFetch('/api/v1/settings')
      .then(res => res.json())
      .then(data => {
        if (data && (data._id || data.id)) {
          setSettings(data);
        }
      })
      .catch(console.error);
  }, []);

  const handleEdit = (row: any[]) => {
    const id = row[row.length - 1];
    const item = rawData.find(d => d.id === id);
    if (item) setEditing({ ...item });
  };

  const handleFileUpload = async (e: any, setFormState: Function, currentState: any) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    const formData = new FormData();
    formData.append('image', file);
    try {
      const res = await apiFetch('/api/v1/upload', {
        method: 'POST',
        body: formData
      });
      const data = await res.json();
      if (data.imageUrl) {
        setFormState({ ...currentState, imageUrl: data.imageUrl });
      } else {
        toast.error('Upload failed.');
      }
    } catch (err) {
      toast.error('Error uploading image.');
    } finally {
      setUploading(false);
    }
  };

  const handleSettingImageUpload = async (e: any, fieldName: string) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    const formData = new FormData();
    formData.append('image', file);
    try {
      const res = await apiFetch('/api/v1/upload', {
        method: 'POST',
        body: formData
      });
      const data = await res.json();
      if (data.imageUrl) {
        setSettings((prev: any) => ({ ...prev, [fieldName]: data.imageUrl }));
      } else {
        toast.error('Upload failed.');
      }
    } catch (err) {
      toast.error('Error uploading image.');
    } finally {
      setUploading(false);
    }
  };

  const handleChangeSettings = (e: any) => {
    const { name, value } = e.target;
    setSettings((prev: any) => ({ ...prev, [name]: value }));
  };

  const handleSaveSettings = async (e: any) => {
    e.preventDefault();
    // Only this page's own fields: settings edited on other screens (footer, ordering, stamps, reviews…)
    // must not be overwritten with the copy loaded when this page opened.
    const ownFields = Object.fromEntries(Object.entries(settings).filter(([key]) => !OTHER_SCREEN_SETTINGS.test(key)));
    try {
      const res = await apiFetch('/api/v1/settings', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(ownFields)
      });
      if (res.ok) toast.success('Settings saved successfully!');
      else toast.error(await errorMessage(res, 'Failed to save settings.'));
    } catch (err) {
      toast.error('Network error while saving settings.');
    }
  };

  const handleSaveCarousel = async (e: any) => {
    e.preventDefault();
    try {
      const res = await apiFetch(`/api/v1/carousels/${editing.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(editing)
      });
      if (res.ok) {
        setEditing(null);
        fetchCarousels(); // refresh
      } else {
        toast.error('Failed to save.');
      }
    } catch (err) {
      toast.error('Network error.');
    }
  };

  const handleAddSubmit = async (e: any) => {
    e.preventDefault();
    try {
      const res = await apiFetch(`/api/v1/carousels`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(newSlide)
      });
      if (res.ok) {
        setIsAdding(false);
        setNewSlide({ titleEn: '', titleJa: '', imageUrl: '', placement: 'HOME', isActive: true });
        fetchCarousels();
      } else {
        toast.error('Failed to add.');
      }
    } catch (err) {
      toast.error('Network error.');
    }
  };

  return (
    <div style={{ position: 'relative' }}>
      <div style={{ display: 'flex', gap: '1rem', marginBottom: '2rem', borderBottom: '1px solid #e5e7eb', overflowX: 'auto', scrollbarWidth: 'none' }}>
        {['Home Page', 'About Page', 'Carousel Slider', 'Page Banners', 'Footer'].map(tab => (
          <button
            key={tab}
            onClick={() => setSubTab(tab)}
            style={{
              padding: '0.75rem 1rem',
              background: 'none',
              border: 'none',
              whiteSpace: 'nowrap',
              flexShrink: 0,
              borderBottom: subTab === tab ? '2px solid #000' : '2px solid transparent',
              fontWeight: subTab === tab ? '600' : '500',
              color: subTab === tab ? '#000' : '#6b7280',
              cursor: 'pointer',
              fontSize: '1rem'
            }}
          >
            {tab}
          </button>
        ))}
      </div>

      {subTab === 'Footer' && <FooterSettings onOpenRestaurantSettings={onOpenRestaurantSettings} />}

      {subTab === 'Page Banners' && (
        <div style={{ backgroundColor: '#fff', borderRadius: '12px', padding: '2rem', boxShadow: '0 1px 3px rgba(0,0,0,0.1)' }}>
          <h3 style={{ marginTop: 0, marginBottom: '1.5rem', fontSize: '1.25rem' }}>Page Banners (Hero Images)</h3>
          <form onSubmit={handleSaveSettings} style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
            <div>
              <label style={labelStyle}>About Us Hero Image URL</label>
              <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
                <input type="text" name="aboutHeroImage" value={settings.aboutHeroImage || ''} onChange={handleChangeSettings} style={{...inputStyle, flex: 1}} placeholder="https://images.unsplash.com/..." />
                <input type="file" accept="image/*" onChange={(e) => handleSettingImageUpload(e, 'aboutHeroImage')} style={{width: '200px'}} />
              </div>
            </div>
            <div>
              <label style={labelStyle}>Contact Us Hero Image URL</label>
              <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
                <input type="text" name="contactHeroImage" value={settings.contactHeroImage || ''} onChange={handleChangeSettings} style={{...inputStyle, flex: 1}} placeholder="https://images.unsplash.com/..." />
                <input type="file" accept="image/*" onChange={(e) => handleSettingImageUpload(e, 'contactHeroImage')} style={{width: '200px'}} />
              </div>
            </div>
            <div>
              <label style={labelStyle}>Grand Menu Hero Image URL</label>
              <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
                <input type="text" name="grandMenuHeroImage" value={settings.grandMenuHeroImage || ''} onChange={handleChangeSettings} style={{...inputStyle, flex: 1}} placeholder="https://images.unsplash.com/..." />
                <input type="file" accept="image/*" onChange={(e) => handleSettingImageUpload(e, 'grandMenuHeroImage')} style={{width: '200px'}} />
              </div>
            </div>
            <div>
              <label style={labelStyle}>Lunch Menu Hero Image URL</label>
              <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
                <input type="text" name="lunchMenuHeroImage" value={settings.lunchMenuHeroImage || ''} onChange={handleChangeSettings} style={{...inputStyle, flex: 1}} placeholder="https://images.unsplash.com/..." />
                <input type="file" accept="image/*" onChange={(e) => handleSettingImageUpload(e, 'lunchMenuHeroImage')} style={{width: '200px'}} />
              </div>
            </div>
            <div>
              <label style={labelStyle}>Takeout Menu Hero Image URL</label>
              <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
                <input type="text" name="takeoutMenuHeroImage" value={settings.takeoutMenuHeroImage || ''} onChange={handleChangeSettings} style={{...inputStyle, flex: 1}} placeholder="https://images.unsplash.com/..." />
                <input type="file" accept="image/*" onChange={(e) => handleSettingImageUpload(e, 'takeoutMenuHeroImage')} style={{width: '200px'}} />
              </div>
            </div>
            {uploading && <p style={{fontSize: '0.85rem', color: 'var(--gold)', margin: 0}}>Uploading image...</p>}
            <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
              <button type="submit" style={{ padding: '0.75rem 1.5rem', backgroundColor: '#000', color: '#fff', border: 'none', borderRadius: '8px', fontWeight: '500', cursor: 'pointer' }}>Save Images</button>
            </div>
          </form>
        </div>
      )}

      {subTab === 'Home Page' && (
        <div style={{ backgroundColor: '#fff', borderRadius: '12px', padding: '2rem', boxShadow: '0 1px 3px rgba(0,0,0,0.1)' }}>
          <h3 style={{ marginTop: 0, marginBottom: '1.5rem', fontSize: '1.25rem' }}>Home Page Content</h3>
          <form onSubmit={handleSaveSettings} style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
            <div style={{ borderBottom: '1px solid #eee', paddingBottom: '1.5rem', marginBottom: '1.5rem' }}>
              <h4 style={{ marginBottom: '1rem', color: '#111827' }}>Indian Food Section</h4>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                <div>
                  <label style={labelStyle}>Title (EN)</label>
                  <input type="text" name="welcomeTitleEn" value={settings.welcomeTitleEn || ''} onChange={handleChangeSettings} style={inputStyle} placeholder="e.g. Authentic Indian Flavors" />
                </div>
                <div>
                  <label style={labelStyle}>Title (JA)</label>
                  <input type="text" name="welcomeTitleJa" value={settings.welcomeTitleJa || ''} onChange={handleChangeSettings} style={inputStyle} placeholder="e.g. 本格インドの味わい" />
                </div>
                <div>
                  <label style={labelStyle}>Text (JA)</label>
                  <textarea name="welcomeTextJa" value={settings.welcomeTextJa || ''} onChange={handleChangeSettings} style={{...inputStyle, height: '120px', resize: 'vertical'}} placeholder="スパイスの香り豊かな..." />
                </div>
              </div>
            </div>

            <div style={{ borderBottom: '1px solid #eee', paddingBottom: '1.5rem', marginBottom: '1.5rem' }}>
              <h4 style={{ marginBottom: '1rem', color: '#111827' }}>Our Store Section</h4>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                <div>
                  <label style={labelStyle}>Label (e.g. 店舗を探す)</label>
                  <input type="text" name="storeSectionLabelJa" value={settings.storeSectionLabelJa || ''} onChange={handleChangeSettings} style={inputStyle} placeholder="店舗を探す" />
                </div>
                <div>
                  <label style={labelStyle}>Title (e.g. 私たちの店舗)</label>
                  <input type="text" name="storeSectionTitleJa" value={settings.storeSectionTitleJa || ''} onChange={handleChangeSettings} style={inputStyle} placeholder="私たちの店舗" />
                </div>
                <div>
                  <label style={labelStyle}>Subtitle Text</label>
                  <textarea name="storeSectionSubJa" value={settings.storeSectionSubJa || ''} onChange={handleChangeSettings} style={{...inputStyle, height: '80px', resize: 'vertical'}} placeholder="店舗を選択して、住所、営業時間、地図をご確認ください。" />
                </div>
                <div>
                  <label style={labelStyle}>Location Tag (e.g. 埼玉県熊谷市)</label>
                  <input type="text" name="storeLocationJa" value={settings.storeLocationJa || ''} onChange={handleChangeSettings} style={inputStyle} placeholder="埼玉県熊谷市" />
                </div>
                <div>
                  <label style={labelStyle}>Badge Text (e.g. 🍛 インド料理)</label>
                  <input type="text" name="storeBadgeJa" value={settings.storeBadgeJa || ''} onChange={handleChangeSettings} style={inputStyle} placeholder="🍛 インド料理" />
                </div>
                <div>
                  <label style={labelStyle}>Review Score (e.g. 4.4)</label>
                  <input type="text" name="storeReviewScore" value={settings.storeReviewScore || ''} onChange={handleChangeSettings} style={inputStyle} placeholder="4.4" />
                </div>
                <div>
                  <label style={labelStyle}>Review Link Text (e.g. Googleでレビューを見る)</label>
                  <input type="text" name="storeReviewText" value={settings.storeReviewText || ''} onChange={handleChangeSettings} style={inputStyle} placeholder="Googleでレビューを見る" />
                </div>
                <div>
                  <label style={labelStyle}>Review Link URL</label>
                  <input type="text" name="storeReviewLink" value={settings.storeReviewLink || ''} onChange={handleChangeSettings} style={inputStyle} placeholder="https://..." />
                </div>
              </div>
            </div>
            
            <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
              <button type="submit" style={{ padding: '0.75rem 1.5rem', backgroundColor: '#000', color: '#fff', border: 'none', borderRadius: '8px', fontWeight: '500', cursor: 'pointer' }}>Save Content</button>
            </div>
          </form>
          <GoogleReviewsSettings />
        </div>
      )}

      {subTab === 'About Page' && (
        <div style={{ backgroundColor: '#fff', borderRadius: '12px', padding: '2rem', boxShadow: '0 1px 3px rgba(0,0,0,0.1)' }}>
          <h3 style={{ marginTop: 0, marginBottom: '1.5rem', fontSize: '1.25rem' }}>About Us Content</h3>
          <form onSubmit={handleSaveSettings} style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
            
            <div style={{ borderBottom: '1px solid #eee', paddingBottom: '1.5rem' }}>
              <h4 style={{ marginBottom: '1rem', color: '#111827' }}>私たちの物語 (Story Section)</h4>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                <div>
                  <label style={labelStyle}>Label</label>
                  <input type="text" name="aboutStoryLabelJa" value={settings.aboutStoryLabelJa || ''} onChange={handleChangeSettings} style={inputStyle} placeholder="私たちの物語" />
                </div>
                <div>
                  <label style={labelStyle}>Title</label>
                  <input type="text" name="aboutStoryTitleJa" value={settings.aboutStoryTitleJa || ''} onChange={handleChangeSettings} style={inputStyle} placeholder="本場インドの味を、熊谷へ" />
                </div>
                <div>
                  <label style={labelStyle}>Story Text</label>
                  <textarea name="aboutStoryJa" value={settings.aboutStoryJa || ''} onChange={handleChangeSettings} style={{...inputStyle, height: '150px', resize: 'vertical'}} placeholder="レストランの歴史やミッションについて..." />
                </div>
              </div>
            </div>

            <div style={{ borderBottom: '1px solid #eee', paddingBottom: '1.5rem' }}>
              <h4 style={{ marginBottom: '1rem', color: '#111827' }}>こだわり (Spice Section)</h4>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                <div>
                  <label style={labelStyle}>Label</label>
                  <input type="text" name="aboutSpiceLabelJa" value={settings.aboutSpiceLabelJa || ''} onChange={handleChangeSettings} style={inputStyle} placeholder="こだわり" />
                </div>
                <div>
                  <label style={labelStyle}>Title</label>
                  <input type="text" name="aboutSpiceTitleJa" value={settings.aboutSpiceTitleJa || ''} onChange={handleChangeSettings} style={inputStyle} placeholder="命を吹き込む、スパイス" />
                </div>
                <div>
                  <label style={labelStyle}>Description (Use \n for new lines)</label>
                  <textarea name="aboutSpiceDescJa" value={settings.aboutSpiceDescJa || ''} onChange={handleChangeSettings} style={{...inputStyle, height: '100px'}} />
                </div>
                <div>
                  <label style={labelStyle}>Image URL</label>
                  <div style={{ display: 'flex', gap: '10px' }}>
                    <input type="text" name="aboutSpiceImage" value={settings.aboutSpiceImage || ''} onChange={handleChangeSettings} style={{...inputStyle, flex: 1}} />
                    <input type="file" accept="image/*" onChange={(e) => handleSettingImageUpload(e, 'aboutSpiceImage')} style={{width: '200px'}} />
                  </div>
                </div>
              </div>
            </div>

            <div style={{ borderBottom: '1px solid #eee', paddingBottom: '1.5rem' }}>
              <h4 style={{ marginBottom: '1rem', color: '#111827' }}>シェフ紹介 (Chef Section)</h4>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                <div>
                  <label style={labelStyle}>Label</label>
                  <input type="text" name="aboutChefLabelJa" value={settings.aboutChefLabelJa || ''} onChange={handleChangeSettings} style={inputStyle} placeholder="シェフ紹介" />
                </div>
                <div>
                  <label style={labelStyle}>Title</label>
                  <input type="text" name="aboutChefTitleJa" value={settings.aboutChefTitleJa || ''} onChange={handleChangeSettings} style={inputStyle} placeholder="熟練の技" />
                </div>
                <div>
                  <label style={labelStyle}>Description (Use \n for new lines)</label>
                  <textarea name="aboutChefDescJa" value={settings.aboutChefDescJa || ''} onChange={handleChangeSettings} style={{...inputStyle, height: '100px'}} />
                </div>
                <div>
                  <label style={labelStyle}>Image URL</label>
                  <div style={{ display: 'flex', gap: '10px' }}>
                    <input type="text" name="aboutChefImage" value={settings.aboutChefImage || ''} onChange={handleChangeSettings} style={{...inputStyle, flex: 1}} />
                    <input type="file" accept="image/*" onChange={(e) => handleSettingImageUpload(e, 'aboutChefImage')} style={{width: '200px'}} />
                  </div>
                </div>
              </div>
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
              <button type="submit" style={{ padding: '0.75rem 1.5rem', backgroundColor: '#000', color: '#fff', border: 'none', borderRadius: '8px', fontWeight: '500', cursor: 'pointer' }}>Save Content</button>
            </div>
          </form>
        </div>
      )}

      {subTab === 'Carousel Slider' && (
        <>
          <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: '1.5rem' }}>
            <button 
              onClick={() => setIsAdding(true)}
              style={{ padding: '0.5rem 1rem', backgroundColor: '#000', color: '#fff', border: 'none', borderRadius: '8px', fontWeight: '500', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '8px' }}
            >
              <Plus size={16} />
              Add New Carousel
            </button>
          </div>

          <div style={{ backgroundColor: '#fff', borderRadius: '12px', boxShadow: '0 1px 3px rgba(0,0,0,0.05)', border: '1px solid #e5e7eb' }}>
            <Table 
              headers={['Preview', 'Placement', 'Title (EN)', 'Title (JA)', 'Status', '']}
              rows={carousels}
              onEdit={handleEdit}
            />
          </div>
        </>
      )}

      {isAdding && (
        <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 50 }}>
          <div style={{ backgroundColor: '#fff', padding: '2rem', borderRadius: '12px', width: '100%', maxWidth: '500px' }}>
            <h2 style={{ marginTop: 0, marginBottom: '1.5rem', fontSize: '1.25rem' }}>Add New Carousel</h2>
            <form onSubmit={handleAddSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
              <div>
                <label style={labelStyle}>Title (EN)</label>
                <input required value={newSlide.titleEn} onChange={e => setNewSlide({...newSlide, titleEn: e.target.value})} type="text" style={inputStyle} />
              </div>
              <div>
                <label style={labelStyle}>Title (JA)</label>
                <input required value={newSlide.titleJa} onChange={e => setNewSlide({...newSlide, titleJa: e.target.value})} type="text" style={inputStyle} />
              </div>
              <div>
                <label style={labelStyle}>Image URL</label>
                <input required value={newSlide.imageUrl} onChange={e => setNewSlide({...newSlide, imageUrl: e.target.value})} type="text" style={inputStyle} placeholder="Or upload an image below" />
              </div>
              <div>
                <label style={labelStyle}>Upload Image</label>
                <input type="file" accept="image/*" onChange={(e) => handleFileUpload(e, setNewSlide, newSlide)} style={{...inputStyle, padding: '0.5rem'}} />
                {uploading && <p style={{fontSize: '0.75rem', color: '#6b7280', marginTop: '0.5rem'}}>Uploading...</p>}
              </div>
              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '1rem', marginTop: '1rem' }}>
                <button type="button" onClick={() => setIsAdding(false)} style={{ padding: '0.5rem 1rem', border: '1px solid #d1d5db', background: '#fff', borderRadius: '8px', cursor: 'pointer' }}>Cancel</button>
                <button type="submit" disabled={uploading} style={{ padding: '0.5rem 1rem', background: '#000', color: '#fff', border: 'none', borderRadius: '8px', cursor: uploading ? 'not-allowed' : 'pointer' }}>Add Slide</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {editing && (
        <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 50 }}>
          <div style={{ backgroundColor: '#fff', padding: '2rem', borderRadius: '12px', width: '100%', maxWidth: '500px' }}>
            <h2 style={{ marginTop: 0, marginBottom: '1.5rem', fontSize: '1.25rem' }}>Edit Carousel</h2>
            <form onSubmit={handleSaveCarousel} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
              <div>
                <label style={labelStyle}>Title (EN)</label>
                <input required value={editing.titleEn || ''} onChange={e => setEditing({...editing, titleEn: e.target.value})} type="text" style={inputStyle} />
              </div>
              <div>
                <label style={labelStyle}>Title (JA)</label>
                <input required value={editing.titleJa || ''} onChange={e => setEditing({...editing, titleJa: e.target.value})} type="text" style={inputStyle} />
              </div>
              <div>
                <label style={labelStyle}>Image URL</label>
                <input required value={editing.imageUrl || ''} onChange={e => setEditing({...editing, imageUrl: e.target.value})} type="text" style={inputStyle} />
              </div>
              <div>
                <label style={labelStyle}>Upload Image</label>
                <input type="file" accept="image/*" onChange={(e) => handleFileUpload(e, setEditing, editing)} style={{...inputStyle, padding: '0.5rem'}} />
                {uploading && <p style={{fontSize: '0.75rem', color: '#6b7280', marginTop: '0.5rem'}}>Uploading...</p>}
              </div>
              <div>
                <label style={labelStyle}>Status</label>
                <select value={editing.isActive ? 'true' : 'false'} onChange={e => setEditing({...editing, isActive: e.target.value === 'true'})} style={inputStyle}>
                  <option value="true">Active</option>
                  <option value="false">Inactive</option>
                </select>
              </div>
              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '1rem', marginTop: '1rem' }}>
                <button type="button" onClick={() => setEditing(null)} style={{ padding: '0.5rem 1rem', border: '1px solid #d1d5db', background: '#fff', borderRadius: '8px', cursor: 'pointer' }}>Cancel</button>
                <button type="submit" disabled={uploading} style={{ padding: '0.5rem 1rem', background: '#000', color: '#fff', border: 'none', borderRadius: '8px', cursor: uploading ? 'not-allowed' : 'pointer' }}>Save</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

function MessagesTab() {
  const [messages, setMessages] = useState<any[]>([]);
  const [rawData, setRawData] = useState<any[]>([]);
  const [editing, setEditing] = useState<any>(null);

  const fetchMessages = () => {
    apiFetch('/api/v1/contact')
      .then(res => res.json())
      .then(data => {
        if (Array.isArray(data)) {
          setRawData(data);
          setMessages(data.map(m => [
            new Date(m.createdAt).toLocaleDateString(),
            m.name,
            m.type || 'GENERAL',
            m.message.substring(0, 30) + '...',
            m.isRead,
            '',
            m.id
          ]));
        }
      })
      .catch(console.error);
  };

  useEffect(() => {
    fetchMessages();
  }, []);

  const handleEdit = (row: any[]) => {
    const id = row[row.length - 1];
    const item = rawData.find(d => d.id === id);
    if (item) setEditing({ ...item });
  };

  const handleSave = async (e: any) => {
    e.preventDefault();
    try {
      const res = await apiFetch(`/api/v1/contact/${editing.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(editing)
      });
      if (res.ok) {
        setEditing(null);
        fetchMessages();
      } else {
        toast.error('Failed to update.');
      }
    } catch (err) {
      toast.error('Network error.');
    }
  };

  return (
    <div style={{ position: 'relative' }}>
      <div style={{ backgroundColor: '#fff', borderRadius: '12px', boxShadow: '0 1px 3px rgba(0,0,0,0.05)', border: '1px solid #e5e7eb' }}>
        <Table 
          headers={['Date', 'Name', 'Type', 'Message Snippet', 'Status', '']}
          rows={messages}
          isMessages
          onEdit={handleEdit}
        />
      </div>

      {editing && (
        <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 50 }}>
          <div style={{ backgroundColor: '#fff', padding: '2rem', borderRadius: '12px', width: '100%', maxWidth: '500px' }}>
            <h2 style={{ marginTop: 0, marginBottom: '1.5rem', fontSize: '1.25rem' }}>View Message</h2>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
              <div>
                <label style={labelStyle}>From</label>
                <div style={{ padding: '0.75rem', backgroundColor: '#f3f4f6', borderRadius: '8px' }}>{editing.name} ({editing.email}) - {editing.phone || 'No phone'}</div>
              </div>
              {editing.type === 'RESERVATION' && (
                <div style={{ display: 'flex', gap: '1rem' }}>
                  <div style={{ flex: 1 }}>
                    <label style={labelStyle}>Date & Time</label>
                    <div style={{ padding: '0.75rem', backgroundColor: '#e0e7ff', borderRadius: '8px', fontWeight: 'bold' }}>
                      {editing.date ? new Date(editing.date).toLocaleString('ja-JP') : 'N/A'}
                    </div>
                  </div>
                  <div style={{ flex: 1 }}>
                    <label style={labelStyle}>Guests</label>
                    <div style={{ padding: '0.75rem', backgroundColor: '#e0e7ff', borderRadius: '8px', fontWeight: 'bold' }}>
                      {editing.guests || 'N/A'}
                    </div>
                  </div>
                </div>
              )}
              <div>
                <label style={labelStyle}>Message</label>
                <div style={{ padding: '0.75rem', backgroundColor: '#f3f4f6', borderRadius: '8px', minHeight: '100px', whiteSpace: 'pre-wrap' }}>{editing.message || 'No additional message.'}</div>
              </div>
              <div>
                <label style={labelStyle}>Status</label>
                <select value={editing.isRead ? 'true' : 'false'} onChange={e => setEditing({...editing, isRead: e.target.value === 'true'})} style={inputStyle}>
                  <option value="false">New / Unread</option>
                  <option value="true">Read</option>
                </select>
              </div>
              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '1rem', marginTop: '1rem' }}>
                <button type="button" onClick={() => setEditing(null)} style={{ padding: '0.5rem 1rem', border: '1px solid #d1d5db', background: '#fff', borderRadius: '8px', cursor: 'pointer' }}>Close</button>
                <button type="button" onClick={handleSave} style={{ padding: '0.5rem 1rem', background: '#000', color: '#fff', border: 'none', borderRadius: '8px', cursor: 'pointer' }}>Update Status</button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// --- SHARED UI COMPONENTS ---

const labelStyle = { display: 'block', fontSize: '0.875rem', fontWeight: '500', color: '#374151', marginBottom: '0.5rem' };
const inputStyle = { width: '100%', padding: '0.75rem', border: '1px solid #d1d5db', borderRadius: '8px', outline: 'none', transition: 'border-color 0.2s', backgroundColor: '#f9fafb' };

function Table({ headers, rows, isMessages = false, onEdit }: { headers: string[], rows: any[][], isMessages?: boolean, onEdit?: (row: any[]) => void }) {
  return (
    <div style={{ overflowX: 'auto' }}>
      <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left' }}>
        <thead>
          <tr style={{ backgroundColor: '#f9fafb', borderBottom: '1px solid #e5e7eb' }}>
            {headers.map((h, i) => (
              <th key={i} style={{ padding: '1rem 1.5rem', fontSize: '0.75rem', textTransform: 'uppercase', color: '#6b7280', fontWeight: '600', letterSpacing: '0.5px' }}>{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, i) => (
            <tr key={i} style={{ borderBottom: '1px solid #e5e7eb', transition: 'background-color 0.15s', cursor: 'pointer' }} onMouseOver={e => e.currentTarget.style.backgroundColor = '#f9fafb'} onMouseOut={e => e.currentTarget.style.backgroundColor = 'transparent'}>
              {row.map((cell, j) => {
                if (j >= headers.length) return null;
                if (j === headers.length - 1) { // Actions column
                  return (
                    <td key={j} style={{ padding: '1rem 1.5rem', textAlign: 'right' }}>
                      <button 
                        onClick={(e) => {
                          e.stopPropagation();
                          onEdit?.(row);
                        }}
                        style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#9ca3af' }}
                      >
                        <MoreVertical size={18} />
                      </button>
                    </td>
                  );
                }
                if (typeof cell === 'boolean') { // Status column
                  if (isMessages && j === headers.length - 2) {
                    return (
                      <td key={j} style={{ padding: '1rem 1.5rem' }}>
                        <span style={{ backgroundColor: cell ? '#f3f4f6' : '#fee2e2', color: cell ? '#4b5563' : '#ef4444', padding: '4px 10px', borderRadius: '9999px', fontSize: '0.75rem', fontWeight: '600' }}>
                          {cell ? 'Read' : 'New'}
                        </span>
                      </td>
                    );
                  }
                  return (
                    <td key={j} style={{ padding: '1rem 1.5rem' }}>
                      <span style={{ backgroundColor: cell ? '#d1fae5' : '#f3f4f6', color: cell ? '#059669' : '#6b7280', padding: '4px 10px', borderRadius: '9999px', fontSize: '0.75rem', fontWeight: '600' }}>
                        {cell ? 'Active' : 'Inactive'}
                      </span>
                    </td>
                  );
                }
                return (
                  <td key={j} style={{ padding: '1rem 1.5rem', fontSize: '0.875rem', color: j === 0 ? '#111827' : '#4b5563', fontWeight: j === 0 ? '500' : '400' }}>
                    {cell}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
