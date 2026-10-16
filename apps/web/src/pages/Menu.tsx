import React, { useState, useEffect } from 'react';
import { useParams } from 'react-router-dom';
import { assetUrl, getPublic } from '../lib/api';
import { useCart } from '../lib/cart-context';
import { yen } from '../lib/format';
import OrderButtons, { type OrderableItem } from '../components/order/OrderButtons';
import RelatedItemsPanel, { type PanelItem } from '../components/order/RelatedItemsPanel';
import OfferSticker, { MemberOfferStrip } from '../components/MemberOffers';
import NotFound from './NotFound';

const HERO_IMAGES: Record<string, string> = {
  lunch: 'https://images.unsplash.com/photo-1585937421612-70a008356fbe?auto=format&fit=crop&w=1920&q=80',
  takeout: 'https://images.unsplash.com/photo-1551224650-9c25e628120e?auto=format&fit=crop&w=1920&q=80',
  grand: 'https://images.unsplash.com/photo-1517248135467-4c7edcad34c4?auto=format&fit=crop&w=1920&q=80'
};

const DEFAULT_IMAGE = 'https://images.unsplash.com/photo-1589302168068-964664d93dc0?auto=format&fit=crop&w=800&q=80';

export default function Menu() {
  const { type } = useParams();
  
  const [selectedIndex, setSelectedIndex] = useState<number | null>(null);
  const [menuItems, setMenuItems] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [carousels, setCarousels] = useState<any[]>([]);
  const [settings, setSettings] = useState<any>({});
  const [orderingEnabled, setOrderingEnabled] = useState(false);
  const [relatedTrigger, setRelatedTrigger] = useState<PanelItem | null>(null);
  const [likedItems, setLikedItems] = useState<Set<string>>(new Set());
  const [shareOpen, setShareOpen] = useState(false);
  const [optionGroupMap, setOptionGroupMap] = useState<Map<string, any>>(new Map());
  const cart = useCart();

  useEffect(() => {
    getPublic<any>('/api/v1/menu/items')
      .then(data => {
        if(Array.isArray(data)) setMenuItems(data);
        setLoading(false);
      })
      .catch(err => {
        console.error(err);
        setLoading(false);
      });

    getPublic<any>('/api/v1/carousels')
      .then(data => {
        if(Array.isArray(data)) setCarousels(data);
      })
      .catch(console.error);

    getPublic<any>('/api/v1/settings')
      .then(data => setSettings(data))
      .catch(console.error);

    getPublic<{ enabled: boolean }>('/api/v1/orders/slots')
      .then(data => setOrderingEnabled(Boolean(data.enabled)))
      .catch(console.error);

    getPublic<any[]>('/api/v1/menu/option-groups')
      .then(groups => {
        if (Array.isArray(groups)) {
          setOptionGroupMap(new Map(groups.map(g => [g.id, g])));
        }
      })
      .catch(console.error);
  }, []);

  const menuType = (type ?? '').toLowerCase();
  const isValidType = ['lunch', 'takeout', 'grand'].includes(menuType);

  const menuTypeEnum = menuType.toUpperCase();
  // Any menu item can be ordered for pickup while the admin has online ordering switched on.
  const canOrder = orderingEnabled;
  
  const dynamicHeroImages: Record<string, string> = {
    lunch: assetUrl(settings.menuLunchHeroImage) || HERO_IMAGES.lunch,
    takeout: assetUrl(settings.menuTakeoutHeroImage) || HERO_IMAGES.takeout,
    grand: assetUrl(settings.menuGrandHeroImage) || HERO_IMAGES.grand
  };
  
  // Filter items by menu type (GRAND, LUNCH, TAKEOUT)
  const filteredItems = menuItems.filter(item => {
    if (item.menuTypes && item.menuTypes.includes(menuTypeEnum)) {
      return true;
    }
    const catName = (item.category?.nameEn || '').toLowerCase();
    if (menuTypeEnum === 'LUNCH') {
      return catName.includes('lunch') && !catName.includes('takeout');
    }
    if (menuTypeEnum === 'TAKEOUT') {
      return catName.includes('takeout');
    }
    if (menuTypeEnum === 'GRAND') {
      return !catName.includes('lunch') && !catName.includes('takeout');
    }
    return false;
  });

  // Group items by category
  const categoriesMap = new Map<string, any>();
  filteredItems.forEach(item => {
    const catName = item.category?.nameJa || item.category?.nameEn || 'Other';
    const catId = item.category?.id || 'other';
    const sortOrder = item.category?.sortOrder || 0;
    
    if (!categoriesMap.has(catId)) {
      categoriesMap.set(catId, { id: catId, name: catName, icon: '🍛', sortOrder, items: [] });
    }
    
    const resolvedGroups = Array.isArray(item.optionGroupIds)
      ? item.optionGroupIds.map((gid: string) => optionGroupMap.get(gid)).filter(Boolean)
      : [];

    categoriesMap.get(catId).items.push({
      id: item.id,
      name: item.nameJa || item.nameEn,
      desc: item.descriptionJa || item.descriptionEn,
      price: `¥${(item.price || 0).toLocaleString()}`,
      priceValue: item.price || 0,
      soldOut: Boolean(item.isSoldOut),
      recommended: Boolean(item.isRecommended),
      vegetarian: Boolean(item.isVegetarian),
      img: assetUrl(item.imageUrl) || DEFAULT_IMAGE,
      categoryId: catId,
      optionGroups: resolvedGroups.length > 0 ? resolvedGroups : undefined,
      // Only show a rating the restaurant actually entered; never invent one.
      rating: typeof item.rating === 'number' ? item.rating : null,
      stars: typeof item.rating === 'number' ? '★'.repeat(Math.round(item.rating)) + '☆'.repeat(5 - Math.round(item.rating)) : ''
    });
  });

  const categories = Array.from(categoriesMap.values()).sort((a, b) => a.sortOrder - b.sortOrder);
  const flatItems = categories.flatMap(cat => cat.items);

  const defaultHero = carousels.length > 0 ? carousels[0].imageUrl : 'https://images.unsplash.com/photo-1517248135467-4c7edcad34c4?auto=format&fit=crop&w=1920&q=80';

  const menuInfo = {
    title: menuType === 'lunch' ? 'ランチメニュー' : menuType === 'takeout' ? 'テイクアウト' : 'グランドメニュー',
    tag: menuTypeEnum + ' MENU',
    image: defaultHero
  };

  const handleNext = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (selectedIndex !== null) {
      setSelectedIndex((selectedIndex + 1) % flatItems.length);
    }
  };

  const handlePrev = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (selectedIndex !== null) {
      setSelectedIndex((selectedIndex - 1 + flatItems.length) % flatItems.length);
    }
  };

  const closeLightbox = () => setSelectedIndex(null);

  const handleAfterAdd = (item: OrderableItem) => {
    const panelItem = flatItems.find(i => i.id === item.id);
    if (panelItem) setRelatedTrigger(panelItem as PanelItem);
  };

  const scrollToCategory = (id: string) => {
    const el = document.getElementById(id);
    if (el) {
      const y = el.getBoundingClientRect().top + window.scrollY - 100;
      window.scrollTo({ top: y, behavior: 'smooth' });
    }
  };

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (selectedIndex === null) return;
      if (e.key === 'ArrowRight') setSelectedIndex((selectedIndex + 1) % flatItems.length);
      if (e.key === 'ArrowLeft') setSelectedIndex((selectedIndex - 1 + flatItems.length) % flatItems.length);
      if (e.key === 'Escape') closeLightbox();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [selectedIndex, flatItems.length]);

  // After all hooks, so the hook order is the same on every render.
  if (!isValidType) return <NotFound />;

  if (loading) return <div style={{ padding: '100px', textAlign: 'center' }}>Loading menu...</div>;

  return (
    <main>
      <title>{`${menuInfo.title} | Kalpana (カルパナ)`}</title>
      <meta name="description" content={`熊谷の本格インド料理店カルパナの${menuInfo.title}。カレー、ナン、タンドール料理などを価格とともにご紹介します。`} />
      {/* Hero Section */}
      <div className="home-hero" style={{ height: '40vh', minHeight: '300px' }}>
        <img src={dynamicHeroImages[menuType]} alt="" fetchPriority="high" className="slide-bg-img" style={{ opacity: 0.5, objectFit: 'cover' }} />
        <OfferSticker />
        <div className="hero-content">
          <div className="hero-tag">{menuInfo.tag}</div>
          <h1 className="hero-title">{menuInfo.title}</h1>
        </div>
      </div>

      <div className="section" style={{ backgroundColor: 'var(--cream)', paddingTop: '40px' }}>
        <div style={{ maxWidth: '1200px', margin: '0 auto', padding: '0 20px' }}>
          
          <MemberOfferStrip next={`/menu/${menuType}`} />

          <div className="centered" style={{ marginBottom: '40px' }}>
            <h2 className="section-title">メニューを<em>見る</em></h2>
            <div className="divider"></div>
            <p className="section-sub">各カテゴリーからお好みのメニューをお選びください</p>
          </div>

          {/* Category Navigation Buttons */}
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '15px', justifyContent: 'center', marginBottom: '60px' }}>
            {categories.map((category) => (
              <button 
                key={category.id}
                onClick={() => scrollToCategory(category.id)}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px',
                  backgroundColor: 'white',
                  color: 'var(--dark-bark)',
                  border: '1px solid #e5dbcd',
                  padding: '12px 24px',
                  borderRadius: '50px',
                  fontWeight: 'bold',
                  fontSize: '1rem',
                  cursor: 'pointer',
                  boxShadow: '0 4px 10px rgba(0,0,0,0.03)',
                  transition: 'all 0.2s ease',
                }}
                onMouseOver={(e) => {
                  e.currentTarget.style.borderColor = 'var(--gold)';
                  e.currentTarget.style.color = 'var(--spice)';
                  e.currentTarget.style.transform = 'translateY(-2px)';
                }}
                onMouseOut={(e) => {
                  e.currentTarget.style.borderColor = '#e5dbcd';
                  e.currentTarget.style.color = 'var(--dark-bark)';
                  e.currentTarget.style.transform = 'translateY(0)';
                }}
              >
                <span style={{ fontSize: '1.2rem' }}>{category.icon}</span>
                {category.name}
              </button>
            ))}
          </div>

          {categories.map((category, catIndex) => {
            const startIndex = categories.slice(0, catIndex).reduce((acc, cat) => acc + cat.items.length, 0);

            return (
              <div key={category.id} id={category.id} style={{ marginBottom: '80px', scrollMarginTop: '100px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '25px', borderBottom: '2px solid #e5dbcd', paddingBottom: '10px' }}>
                  <span style={{ fontSize: '2rem' }}>{category.icon}</span>
                  <h3 style={{ fontSize: '1.8rem', color: 'var(--dark-bark)', margin: 0 }}>
                    {category.name}
                  </h3>
                </div>
                
                {category.items.length === 0 ? (
                  <p style={{ color: 'var(--text-muted)' }}>このカテゴリーにはまだ商品がありません。</p>
                ) : (
                  <div className="menu-grid">
                    {category.items.map((item: any, itemIndex: number) => {
                      const globalIndex = startIndex + itemIndex;
                      return (
                        <article key={item.id} className={`menu-card${item.soldOut ? ' is-sold-out' : ''}`} onClick={() => setSelectedIndex(globalIndex)}>
                          <div className="menu-card-media">
                            <img src={item.img} alt={item.name} loading="lazy" decoding="async" width={400} height={300} />
                            <div className="menu-card-badges">
                              {item.soldOut && <span className="menu-badge menu-badge-dark">売り切れ</span>}
                              {!item.soldOut && item.recommended && <span className="menu-badge menu-badge-gold">おすすめ</span>}
                              {item.vegetarian && <span className="menu-badge menu-badge-green">ベジタリアン</span>}
                            </div>
                          </div>
                          <div className="menu-card-body">
                            <div className="menu-card-head">
                              {/* The title is the card's keyboard entry point to the details popup. */}
                              <h3 className="menu-card-title">
                                <button type="button" onClick={(e) => { e.stopPropagation(); setSelectedIndex(globalIndex); }}>{item.name}</button>
                              </h3>
                              <div className="menu-card-price">{item.price}<small>税抜</small></div>
                            </div>
                            {item.desc && <p className="menu-card-desc">{item.desc}</p>}
                            {item.rating !== null && (
                              <div className="menu-card-rating" aria-label={`評価 ${item.rating.toFixed(1)}`}>
                                <span aria-hidden="true">{item.stars}</span>{item.rating.toFixed(1)}
                              </div>
                            )}
                            {canOrder && <OrderButtons item={item} onAfterAdd={handleAfterAdd} />}
                          </div>
                        </article>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {canOrder && cart.count > 0 && (
        <button
          type="button"
          onClick={cart.openCart}
          className="btn-warm"
          style={{ position: 'fixed', left: '50%', bottom: '20px', transform: 'translateX(-50%)', zIndex: 900, display: 'flex', alignItems: 'center', gap: '12px', boxShadow: '0 8px 24px rgba(0,0,0,0.25)', whiteSpace: 'nowrap', borderRadius: '9999px' }}
        >
          🛒 カートを見る（{cart.count}点） {yen(cart.total)} <span style={{ fontWeight: 'normal', fontSize: '0.8rem' }}>(税抜)</span>
        </button>
      )}

      {/* Lightbox / Popup */}
      {selectedIndex !== null && (
        <div onClick={closeLightbox} style={{ position: 'fixed', top: 0, left: 0, width: '100vw', height: '100vh', backgroundColor: 'rgba(0,0,0,0.85)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '20px', boxSizing: 'border-box' }}>
          
          <button onClick={closeLightbox} aria-label="閉じる" style={{ position: 'absolute', top: '20px', right: '20px', background: 'none', border: 'none', color: 'white', fontSize: '2rem', cursor: 'pointer', padding: '10px' }}>×</button>
          
          <button onClick={handlePrev} aria-label="前の商品" style={{ position: 'absolute', left: '20px', top: '50%', transform: 'translateY(-50%)', background: 'rgba(255,255,255,0.2)', border: 'none', color: 'white', fontSize: '2rem', cursor: 'pointer', padding: '15px 20px', borderRadius: '50%' }}>❮</button>
          
          <div onClick={(e) => e.stopPropagation()} style={{ backgroundColor: 'white', borderRadius: '12px', overflowX: 'hidden', overflowY: 'auto', display: 'flex', flexDirection: 'column', maxWidth: '600px', width: '100%', maxHeight: '90vh' }}>
            {/* Shorter photo on small screens so the order buttons stay in view; the panel scrolls if needed. */}
            <div style={{ width: '100%', height: 'min(350px, 38vh)', flexShrink: 0, backgroundColor: '#f9f6f0', padding: '0', position: 'relative' }}>
              <img src={flatItems[selectedIndex].img} alt={flatItems[selectedIndex].name} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
              {/* Share + Like buttons */}
              <div style={{ position: 'absolute', top: '12px', right: '12px', display: 'flex', gap: '10px', alignItems: 'flex-start' }}>
                {/* Share button with dropdown */}
                <div style={{ position: 'relative' }}>
                  <button
                    onClick={() => setShareOpen(v => !v)}
                    title="共有する"
                    style={{ width: '44px', height: '44px', borderRadius: '50%', border: 'none', background: '#fff', boxShadow: '0 2px 8px rgba(0,0,0,0.18)', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#1a1814' }}
                  >
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M4 12v8a2 2 0 002 2h12a2 2 0 002-2v-8"/>
                      <polyline points="16 6 12 2 8 6"/>
                      <line x1="12" y1="2" x2="12" y2="15"/>
                    </svg>
                  </button>
                  {shareOpen && (
                    <>
                      {/* backdrop to close */}
                      <div onClick={() => setShareOpen(false)} style={{ position: 'fixed', inset: 0, zIndex: 10 }} />
                      <div style={{ position: 'absolute', top: '52px', right: 0, background: '#fff', borderRadius: '14px', boxShadow: '0 4px 24px rgba(0,0,0,0.18)', padding: '12px', display: 'flex', flexDirection: 'column', gap: '6px', zIndex: 11, minWidth: '160px' }}>
                        {[
                          { label: 'Facebook', color: '#1877F2', href: `https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(window.location.href)}`, icon: <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor"><path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.469h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.469h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z"/></svg> },
                          { label: 'X (Twitter)', color: '#000', href: `https://twitter.com/intent/tweet?url=${encodeURIComponent(window.location.href)}&text=${encodeURIComponent(flatItems[selectedIndex].name)}`, icon: <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor"><path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z"/></svg> },
                          { label: 'LINE', color: '#00C300', href: `https://social-plugins.line.me/lineit/share?url=${encodeURIComponent(window.location.href)}`, icon: <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor"><path d="M24 10.304c0-5.369-5.383-9.738-12-9.738-6.616 0-12 4.369-12 9.738 0 4.814 3.54 8.796 8.284 9.502.321.071.758.218.868.5.101.258.065.656.03 1.01-.036.368-.239 1.439-.29 1.742-.061.359-.283 1.391 1.22.762 1.503-.63 8.118-4.785 10.849-8.026 1.956-2.316 3.039-4.887 3.039-5.49zm-15.004 3.045H5.824a.654.654 0 01-.652-.653V7.202c0-.361.293-.653.652-.653.36 0 .653.292.653.653v4.841h2.519c.361 0 .653.292.653.653s-.292.653-.653.653zm3.013 0h-1.303a.654.654 0 01-.653-.653V7.202c0-.361.293-.653.653-.653.361 0 .652.292.652.653v5.494c0 .361-.291.653-.652.653zm4.276 0h-1.303a.654.654 0 01-.652-.653V9.124l-2.029 3.029a.656.656 0 01-.385.264.664.664 0 01-.166.021.654.654 0 01-.652-.653V7.202c0-.361.293-.653.652-.653.36 0 .653.292.653.653v3.524l2.029-3.029a.656.656 0 01.385-.264.664.664 0 01.166-.021c.361 0 .652.292.652.653v5.494c0 .361-.291.653-.652.653z"/></svg> },
                          { label: 'WhatsApp', color: '#25D366', href: `https://api.whatsapp.com/send?text=${encodeURIComponent(flatItems[selectedIndex].name + ' ' + window.location.href)}`, icon: <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/></svg> },
                          { label: 'Instagram', color: '#E1306C', href: 'https://www.instagram.com/', icon: <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor"><path d="M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204.013-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069 4.849-.069zM12 0C8.741 0 8.333.014 7.053.072 2.695.272.273 2.69.073 7.052.014 8.333 0 8.741 0 12c0 3.259.014 3.668.072 4.948.2 4.358 2.618 6.78 6.98 6.98C8.333 23.986 8.741 24 12 24c3.259 0 3.668-.014 4.948-.072 4.354-.2 6.782-2.618 6.979-6.98.059-1.28.073-1.689.073-4.948 0-3.259-.014-3.667-.072-4.947-.196-4.354-2.617-6.78-6.979-6.98C15.668.014 15.259 0 12 0zm0 5.838a6.162 6.162 0 100 12.324 6.162 6.162 0 000-12.324zM12 16a4 4 0 110-8 4 4 0 010 8zm6.406-11.845a1.44 1.44 0 100 2.881 1.44 1.44 0 000-2.881z"/></svg> },
                        ].map(({ label, color, href, icon }) => (
                          <a
                            key={label}
                            href={href}
                            target="_blank"
                            rel="noopener noreferrer"
                            onClick={() => setShareOpen(false)}
                            style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '8px 10px', borderRadius: '9px', textDecoration: 'none', color: '#1a1814', fontSize: '0.85rem', fontWeight: 600, transition: 'background 0.15s' }}
                            onMouseEnter={e => (e.currentTarget.style.background = '#f5f5f5')}
                            onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
                          >
                            <span style={{ color, display: 'flex', flexShrink: 0 }}>{icon}</span>
                            {label}
                          </a>
                        ))}
                      </div>
                    </>
                  )}
                </div>
                {/* Heart button */}
                <button
                  onClick={() => {
                    const id = String(flatItems[selectedIndex].id);
                    setLikedItems(prev => {
                      const next = new Set(prev);
                      next.has(id) ? next.delete(id) : next.add(id);
                      return next;
                    });
                  }}
                  title="お気に入り"
                  style={{ width: '44px', height: '44px', borderRadius: '50%', border: 'none', background: '#fff', boxShadow: '0 2px 8px rgba(0,0,0,0.18)', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', color: likedItems.has(String(flatItems[selectedIndex].id)) ? '#e11d48' : '#1a1814' }}
                >
                  <svg width="20" height="20" viewBox="0 0 24 24" fill={likedItems.has(String(flatItems[selectedIndex].id)) ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M20.84 4.61a5.5 5.5 0 00-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 00-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 000-7.78z"/>
                  </svg>
                </button>
              </div>
            </div>
            <div style={{ padding: '30px', textAlign: 'center' }}>
              <h2 style={{ margin: '0 0 10px 0', color: 'var(--dark-bark)' }}>{flatItems[selectedIndex].name}</h2>
              <p style={{ color: 'var(--text-muted)', lineHeight: '1.6', marginBottom: '15px' }}>{flatItems[selectedIndex].desc}</p>
              
              {flatItems[selectedIndex].rating !== null && (
                <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', gap: '6px', marginBottom: '20px' }}>
                  <span aria-hidden="true" style={{ color: 'var(--gold)', letterSpacing: '2px', fontSize: '1rem' }}>{flatItems[selectedIndex].stars}</span>
                  <span style={{ color: 'var(--text-muted)', fontSize: '0.9rem' }}>{flatItems[selectedIndex].rating.toFixed(1)}</span>
                </div>
              )}

              <div style={{ color: 'var(--spice)', fontSize: '1.8rem', fontWeight: 'bold', fontFamily: 'serif' }}>
                {flatItems[selectedIndex].price} <span style={{ fontSize: '1rem', color: 'var(--text-muted)', fontWeight: 'normal', fontFamily: 'sans-serif' }}>(税抜)</span>
              </div>

              {canOrder && <OrderButtons item={flatItems[selectedIndex]} size="popup" onAfterAdd={handleAfterAdd} />}
              
            </div>
          </div>

          <button onClick={handleNext} aria-label="次の商品" style={{ position: 'absolute', right: '20px', top: '50%', transform: 'translateY(-50%)', background: 'rgba(255,255,255,0.2)', border: 'none', color: 'white', fontSize: '2rem', cursor: 'pointer', padding: '15px 20px', borderRadius: '50%' }}>❯</button>

        </div>
      )}

      {relatedTrigger && (
        <RelatedItemsPanel
          trigger={relatedTrigger}
          allItems={flatItems as PanelItem[]}
          onClose={() => setRelatedTrigger(null)}
          onOpenCart={() => { setRelatedTrigger(null); cart.openCart(); }}
        />
      )}
    </main>
  );
}
