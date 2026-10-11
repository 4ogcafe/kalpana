import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { toast } from 'react-hot-toast';

const DEFAULT_HERO_IMAGES = [
  "https://images.unsplash.com/photo-1517248135467-4c7edcad34c4?auto=format&fit=crop&w=1920&q=80",
];

const GOOGLE_REVIEWS = [
  { name: 'Akira S.', initial: 'A', color: '#e94235', text: 'カレーもナンも最高に美味しいです！特にチーズナンは絶品。店員さんも親切でリピートしています。' },
  { name: 'Yuki T.', initial: 'Y', color: '#34a853', text: '熊谷でインドカレーを食べるならここ。スパイスが効いていて本格的な味です。ランチがお得！' },
  { name: 'Kenji M.', initial: 'K', color: '#fbbc05', text: 'ボリューム満点で大満足。タンドリーチキンがとてもジューシーでした。' },
  { name: 'Sato H.', initial: 'S', color: '#4285f4', text: '家族でよく利用します。子供用のマイルドなカレーもあるので安心です。' },
  { name: 'Rina W.', initial: 'R', color: '#e94235', text: 'ここのバターチキンカレーの大ファンです！定期的に食べに行きたくなる味。' }
];

export default function Home() {
  const [currentSlide, setCurrentSlide] = useState(0);
  const [carousels, setCarousels] = useState<any[]>([]);
  const [menuItems, setMenuItems] = useState<any[]>([]);
  const [settings, setSettings] = useState<any>({});
  const [newsletterEmail, setNewsletterEmail] = useState('');
  const [menuSlideIndex, setMenuSlideIndex] = useState(0);

  const handleNewsletterSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newsletterEmail) return;
    try {
      const res = await fetch('http://localhost:4000/api/v1/contact', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: 'Newsletter Subscriber',
          email: newsletterEmail,
          message: 'Subscribed to Newsletter',
          type: 'GENERAL'
        })
      });
      if (res.ok) {
        toast.success('ご登録ありがとうございます！');
        setNewsletterEmail('');
      } else {
        toast.error('登録に失敗しました。');
      }
    } catch (err) {
      toast.error('Network error.');
    }
  };

  useEffect(() => {
    // Fetch Settings
    fetch('http://localhost:4000/api/v1/settings')
      .then(res => res.json())
      .then(data => setSettings(data))
      .catch(console.error);

    // Fetch Carousels
    fetch('http://localhost:4000/api/v1/carousels')
      .then(res => res.json())
      .then(data => setCarousels(data))
      .catch(console.error);

    // Fetch Menu Items
    fetch('http://localhost:4000/api/v1/menu/items')
      .then(res => res.json())
      .then(data => {
        if(Array.isArray(data)) setMenuItems(data);
      })
      .catch(console.error);
  }, []);

  const heroImages = carousels.length > 0 ? carousels.map(c => c.imageUrl) : DEFAULT_HERO_IMAGES;
  const recommendedItems = menuItems.filter(item => item.isRecommended).slice(0, 4);
  const regularItems = menuItems.filter(item => !item.isRecommended);

  useEffect(() => {
    if (regularItems.length <= 1) return;
    const timer = setInterval(() => {
      setMenuSlideIndex((prev) => (prev + 1) % regularItems.length);
    }, 4000);
    return () => clearInterval(timer);
  }, [regularItems.length]);

  useEffect(() => {
    const timer = setInterval(() => {
      setCurrentSlide((prev) => (prev + 1) % heroImages.length);
    }, 5000);
    return () => clearInterval(timer);
  }, [heroImages.length]);

  return (
    <main>
      {/* Hero Slider */}
      <div className="home-hero">
        {heroImages.map((img, index) => (
          <img 
            key={index}
            src={img} 
            alt="Restaurant Background" 
            className="slide-bg-img" 
            style={{ 
              opacity: currentSlide === index ? 0.6 : 0, 
              transition: 'opacity 1s ease-in-out',
              position: 'absolute',
              top: 0,
              left: 0,
              width: '100%',
              height: '100%',
              objectFit: 'cover'
            }} 
          />
        ))}
        
        <div className="hero-content">
          <div className="hero-tag">埼玉・熊谷で味わう、本場のインド料理</div>
          <h1 className="hero-title">{carousels[currentSlide]?.titleJa || 'インドの香りを、そのままに'}</h1>
          <p className="hero-sub">愛とスパイス、そして伝統に彩られた数世紀にわたるレシピを。<br/>Kalpana Indian Cuisineで皆様をお待ちしております。</p>
          <div className="hero-btns">
            <Link to="/menu/lunch" style={{ textDecoration: 'none' }}>
              <button className="btn-warm">ランチメニューを見る</button>
            </Link>
            <button className="btn-outline-warm" onClick={() => document.getElementById('locations')?.scrollIntoView({ behavior: 'smooth' })}>店舗案内</button>
          </div>
        </div>
        
        {/* Slider Indicators */}
        <div style={{ position: 'absolute', bottom: '30px', display: 'flex', gap: '10px', zIndex: 20 }}>
          {heroImages.map((_, idx) => (
            <button 
              key={idx}
              onClick={() => setCurrentSlide(idx)}
              style={{
                width: '12px', height: '12px', borderRadius: '50%', border: 'none', cursor: 'pointer',
                backgroundColor: currentSlide === idx ? 'var(--gold)' : 'rgba(255,255,255,0.5)',
                transition: 'background-color 0.3s'
              }}
              aria-label={`Go to slide ${idx + 1}`}
            />
          ))}
        </div>
      </div>

      {/* Indian Food Welcome Section */}
      {(settings.welcomeTitleJa || settings.welcomeTextJa) && (
        <div className="section" style={{ backgroundColor: 'white', padding: '4rem 20px' }}>
          <div className="centered" style={{ maxWidth: '800px', margin: '0 auto' }}>
            <div className="section-label">{settings.welcomeTitleEn || 'Welcome to Kalpana'}</div>
            <h2 className="section-title" style={{ fontSize: '2.5rem', marginBottom: '1.5rem', color: 'var(--dark-bark)' }}>
              {settings.welcomeTitleJa || '本格インドの味わい'}
            </h2>
            <div className="divider" style={{ marginBottom: '2rem' }}></div>
            <p style={{ fontSize: '1.1rem', lineHeight: '1.8', color: 'var(--text-muted)', whiteSpace: 'pre-wrap' }}>
              {settings.welcomeTextJa || 'スパイスの香り豊かな本格インド料理をお楽しみください。'}
            </p>
          </div>
        </div>
      )}

      {/* Menu Explorer */}
      <div className="section" style={{ backgroundColor: 'var(--cream)' }}>
        <div className="centered" style={{ marginBottom: '40px' }}>
          <div className="section-label">メニューを見る</div>
          <h2 className="section-title">キッチンから<em>お届け</em></h2>
          <div className="divider"></div>
          <p className="section-sub">{settings.aboutJa || '毎日手作りの新鮮な味 — 手挽きのスパイス、本格的な粘土窯（タンドール）、妥協のない調理'}</p>
        </div>

        <div style={{ maxWidth: '1200px', margin: '0 auto', padding: '0 20px' }}>
          
          {/* Tabs */}
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '10px', justifyContent: 'center', marginBottom: '40px' }}>
            <Link to="/menu/grand" style={{ textDecoration: 'none' }}><button style={{ backgroundColor: 'var(--spice)', color: 'white', border: '1px solid var(--spice)', padding: '10px 24px', borderRadius: '4px', fontWeight: 'bold', cursor: 'pointer', fontSize: '0.9rem' }}>すべて</button></Link>
            <Link to="/menu/grand" style={{ textDecoration: 'none' }}><button style={{ backgroundColor: 'white', color: 'var(--dark-bark)', border: '1px solid #e5dbcd', padding: '10px 24px', borderRadius: '4px', fontWeight: 'bold', cursor: 'pointer', fontSize: '0.9rem' }}>グランドメニュー</button></Link>
            <Link to="/menu/lunch" style={{ textDecoration: 'none' }}><button style={{ backgroundColor: 'white', color: 'var(--dark-bark)', border: '1px solid #e5dbcd', padding: '10px 24px', borderRadius: '4px', fontWeight: 'bold', cursor: 'pointer', fontSize: '0.9rem' }}>ランチメニュー</button></Link>
            <Link to="/menu/takeout" style={{ textDecoration: 'none' }}><button style={{ backgroundColor: 'white', color: 'var(--dark-bark)', border: '1px solid #e5dbcd', padding: '10px 24px', borderRadius: '4px', fontWeight: 'bold', cursor: 'pointer', fontSize: '0.9rem' }}>テイクアウト</button></Link>
          </div>

          {/* Slider */}
          <div style={{ overflow: 'hidden', padding: '10px 0' }}>
            <div 
              style={{ 
                display: 'flex', 
                gap: '24px', 
                transition: 'transform 0.6s cubic-bezier(0.25, 1, 0.5, 1)', 
                transform: `translateX(calc(-${menuSlideIndex * 304}px))` 
              }}
            >
              {regularItems.length > 0 ? [...regularItems, ...regularItems, ...regularItems].map((item, idx) => (
                <div key={`${item.id}-${idx}`} style={{ minWidth: '280px', flex: '0 0 280px', backgroundColor: 'white', borderRadius: '12px', overflow: 'hidden', boxShadow: '0 4px 15px rgba(0,0,0,0.05)', display: 'flex', flexDirection: 'column' }}>
                  <div style={{ height: '220px', width: '100%', backgroundColor: '#f9f6f0', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '20px' }}>
                    <img src={item.imageUrl || "https://images.unsplash.com/photo-1589302168068-964664d93dc0?auto=format&fit=crop&w=400&q=80"} alt={item.nameJa || item.nameEn} style={{ width: '100%', height: '100%', objectFit: 'cover', borderRadius: '8px' }} />
                  </div>
                  <div style={{ padding: '24px', display: 'flex', flexDirection: 'column', flex: '1' }}>
                    <h3 style={{ fontSize: '1.2rem', color: 'var(--dark-bark)', margin: '0 0 10px 0' }}>{item.nameJa || item.nameEn}</h3>
                    <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem', lineHeight: '1.5', margin: '0 0 16px 0', flex: '1' }}>{item.descriptionJa || item.descriptionEn || '本格インドの味をお楽しみください。'}</p>
                    
                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '12px' }}>
                      <span style={{ color: 'var(--gold)', letterSpacing: '2px', fontSize: '0.8rem' }}>★★★★☆</span>
                      <span style={{ color: 'var(--text-muted)', fontSize: '0.8rem' }}>4.5</span>
                    </div>
                    
                    <div style={{ color: 'var(--spice)', fontSize: '1.4rem', fontWeight: 'bold', fontFamily: 'serif' }}>
                      ¥{item.price.toLocaleString()} <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)', fontWeight: 'normal', fontFamily: 'sans-serif' }}>(税抜)</span>
                    </div>
                  </div>
                </div>
              )) : <div style={{ color: 'var(--text-muted)', textAlign: 'center', width: '100%' }}>メニュー項目がありません。</div>}
            </div>
          </div>
        </div>
      </div>

      {/* Recommended Menu */}
      {recommendedItems.length > 0 && (
        <div className="section" style={{ backgroundColor: 'var(--cream)', paddingTop: '0' }}>
          <div className="centered" style={{ marginBottom: '40px' }}>
            <div className="section-label">シェフの厳選</div>
            <h2 className="section-title">おすすめ<em>メニュー</em></h2>
            <div className="divider"></div>
            <p className="section-sub">全店舗で愛され続けている、不動の人気メニュー</p>
          </div>

          <div style={{ maxWidth: '1200px', margin: '0 auto', padding: '0 20px' }}>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))', gap: '24px' }}>
              {recommendedItems.map(item => (
                <div key={item.id} style={{ backgroundColor: 'white', borderRadius: '12px', overflow: 'hidden', boxShadow: '0 4px 15px rgba(0,0,0,0.05)', display: 'flex', flexDirection: 'column' }}>
                  <div style={{ height: '220px', width: '100%', backgroundColor: '#f9f6f0', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '20px' }}>
                    <img src={item.imageUrl || "https://images.unsplash.com/photo-1551224650-9c25e628120e?auto=format&fit=crop&w=400&q=80"} alt={item.nameJa || item.nameEn} style={{ width: '100%', height: '100%', objectFit: 'cover', borderRadius: '8px' }} />
                  </div>
                  <div style={{ padding: '24px', display: 'flex', flexDirection: 'column', flex: '1' }}>
                    <h3 style={{ fontSize: '1.2rem', color: 'var(--dark-bark)', margin: '0 0 10px 0' }}>{item.nameJa || item.nameEn}</h3>
                    <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem', lineHeight: '1.5', margin: '0 0 16px 0', flex: '1' }}>{item.descriptionJa || item.descriptionEn}</p>
                    
                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '12px' }}>
                      <span style={{ color: 'var(--gold)', letterSpacing: '2px', fontSize: '0.8rem' }}>★★★★★</span>
                      <span style={{ color: 'var(--text-muted)', fontSize: '0.8rem' }}>5.0</span>
                    </div>
                    
                    <div style={{ color: 'var(--spice)', fontSize: '1.4rem', fontWeight: 'bold', fontFamily: 'serif' }}>
                      ¥{item.price.toLocaleString()} <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)', fontWeight: 'normal', fontFamily: 'sans-serif' }}>(税抜)</span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Store Location Section */}
      <div id="locations" className="section" style={{ backgroundColor: 'var(--cream)', padding: '4rem 20px' }}>
        <div className="centered" style={{ marginBottom: '2rem' }}>
          <div className="section-label">{settings.storeSectionLabelJa || '店舗を探す'}</div>
          <h2 className="section-title" dangerouslySetInnerHTML={{ __html: settings.storeSectionTitleJa || '私たちの<em>店舗</em>' }}></h2>
          <div className="divider"></div>
          <p className="section-sub">{settings.storeSectionSubJa || '店舗を選択して、住所、営業時間、地図をご確認ください。'}</p>
        </div>

        <div style={{ maxWidth: '1100px', margin: '0 auto' }}>
          {/* Main Store Card */}
          <div style={{ backgroundColor: 'white', borderRadius: '12px', display: 'flex', flexWrap: 'wrap', overflow: 'hidden', boxShadow: '0 10px 30px rgba(0,0,0,0.05)' }}>
            
            {/* Left Info Column */}
            <div style={{ flex: '1 1 400px', padding: '40px', position: 'relative' }}>
              <div style={{ position: 'absolute', top: '20px', left: '30px', fontSize: '6rem', fontWeight: '900', color: 'var(--cream)', zIndex: 0, lineHeight: 1, fontFamily: 'var(--font-display)' }}>01</div>
              
              <div style={{ position: 'relative', zIndex: 1, marginBottom: '30px' }}>
                <h3 style={{ fontSize: '1.8rem', margin: '0 0 5px 0', color: 'var(--dark-bark)' }}>{settings.name || 'Kalpana Indian Cuisine'}</h3>
                <p style={{ color: 'var(--spice)', fontSize: '0.9rem', margin: '0 0 15px 0', fontWeight: 'bold' }}>{settings.storeLocationJa || '埼玉県熊谷市'}</p>
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', backgroundColor: 'var(--cream)', border: '1px solid #e5dbcd', padding: '6px 12px', borderRadius: '20px', fontSize: '0.85rem', color: 'var(--spice)', fontWeight: 'bold' }}>
                  {settings.storeBadgeJa || '🍛 インド料理'}
                </span>
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '24px', marginBottom: '30px', position: 'relative', zIndex: 1 }}>
                {/* Address */}
                <div style={{ display: 'flex', gap: '16px' }}>
                  <div style={{ width: '40px', height: '40px', borderRadius: '50%', backgroundColor: 'var(--cream)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, border: '1px solid #e5dbcd' }}>
                    <span style={{ color: 'var(--spice)', fontSize: '1.2rem' }}>📍</span>
                  </div>
                  <div>
                    <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginBottom: '4px', fontWeight: 'bold' }}>住所</div>
                    <div style={{ color: 'var(--dark-bark)', fontSize: '0.95rem', lineHeight: '1.5' }}>
                      {settings.addressJa || '埼玉県熊谷市'}
                    </div>
                  </div>
                </div>

                {/* Hours */}
                <div style={{ display: 'flex', gap: '16px' }}>
                  <div style={{ width: '40px', height: '40px', borderRadius: '50%', backgroundColor: 'var(--cream)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, border: '1px solid #e5dbcd' }}>
                    <span style={{ color: 'var(--text-muted)', fontSize: '1.2rem' }}>🕒</span>
                  </div>
                  <div>
                    <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginBottom: '4px', fontWeight: 'bold' }}>営業時間</div>
                    <div style={{ color: '#2d7a4d', fontSize: '0.95rem', fontWeight: 'bold', lineHeight: '1.5' }}>
                      {settings.weeklyHours?.monday || 'ランチ 11:30–15:00 / ディナー 17:00–22:00'}<br/>
                      ・ 定休日: {settings.holidays?.regular || '火曜日'}
                    </div>
                  </div>
                </div>

                {/* Phone */}
                <div style={{ display: 'flex', gap: '16px' }}>
                  <div style={{ width: '40px', height: '40px', borderRadius: '50%', backgroundColor: 'var(--cream)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, border: '1px solid #e5dbcd' }}>
                    <span style={{ color: 'var(--text-muted)', fontSize: '1.2rem' }}>📞</span>
                  </div>
                  <div>
                    <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginBottom: '4px', fontWeight: 'bold' }}>電話番号</div>
                    <div style={{ color: 'var(--dark-bark)', fontSize: '1.05rem', fontWeight: '500' }}>
                      {settings.phone || '(店舗番号)'}
                    </div>
                  </div>
                </div>
              </div>

              {/* Reviews Pill */}
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px', backgroundColor: 'var(--cream)', padding: '10px 16px', borderRadius: '4px', border: '1px solid #e5dbcd', marginBottom: '20px', width: 'fit-content', position: 'relative', zIndex: 1 }}>
                <span style={{ color: 'var(--gold)', letterSpacing: '2px', fontSize: '0.9rem' }}>★★★★★</span>
                <span style={{ fontWeight: 'bold', color: 'var(--dark-bark)' }}>{settings.storeReviewScore || '4.4'}</span>
                {settings.storeReviewLink ? (
                  <a href={settings.storeReviewLink} target="_blank" rel="noopener noreferrer" style={{ color: 'var(--text-muted)', fontSize: '0.8rem', textDecoration: 'none' }}>
                    ・ {settings.storeReviewText || 'Googleでレビューを見る'}
                  </a>
                ) : (
                  <span style={{ color: 'var(--text-muted)', fontSize: '0.8rem' }}>・ {settings.storeReviewText || 'Googleでレビューを見る'}</span>
                )}
              </div>

              {/* Action Button */}
              <a href="https://www.google.com/maps" target="_blank" rel="noopener noreferrer" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px', backgroundColor: '#c75626', color: 'white', textDecoration: 'none', padding: '14px', borderRadius: '4px', fontWeight: 'bold', transition: 'background 0.2s', width: '100%', borderBottom: '4px solid #a64117', position: 'relative', zIndex: 1 }}>
                🗺️ ルートを検索
              </a>

            </div>

            {/* Right Map Column */}
            <div style={{ flex: '1 1 500px', minHeight: '500px', backgroundColor: '#e5e3df', position: 'relative' }}>
              <iframe 
                src={(settings.mapUrl && settings.mapUrl.includes('embed')) ? settings.mapUrl : "https://www.google.com/maps/embed?pb=!1m18!1m12!1m3!1d3221.724944983944!2d139.41883000000002!3d36.1251!2m3!1f0!2f0!3f0!3m2!1i1024!2i768!4f13.1!3m3!1m2!1s0x601f2b0605446c1f%3A0x1a31a406a1c1b3d6!2sKalpna%20Indian%20Cuisine!5e0!3m2!1sen!2sus!4v1700000000000!5m2!1sen!2sus"} 
                width="100%" 
                height="100%" 
                style={{ border: 0, position: 'absolute', top: 0, left: 0 }} 
                allowFullScreen={false} 
                loading="lazy" 
                referrerPolicy="no-referrer-when-downgrade">
              </iframe>
            </div>
            
          </div>
        </div>
      </div>

      {/* Google Reviews Section */}
      <div className="section" style={{ backgroundColor: 'white' }}>
        <div className="centered" style={{ marginBottom: '2rem' }}>
          <div className="section-label">お客様の声</div>
          <h2 className="section-title">Google <em>Reviews</em></h2>
          <div className="divider"></div>
          <p className="section-sub">熊谷で愛される本格インド料理。多くのお客様から嬉しいお言葉をいただいております。</p>
        </div>
        
        <div style={{ width: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center', overflow: 'hidden' }}>
          <div className="review-marquee-container" style={{ marginBottom: '3rem', padding: '10px 0' }}>
            <div className="review-marquee">
              {[...GOOGLE_REVIEWS, ...GOOGLE_REVIEWS].map((review, idx) => (
                <div key={idx} style={{ width: '300px', flexShrink: 0, padding: '24px', border: '1px solid #eee', borderRadius: '8px', boxShadow: '0 4px 6px rgba(0,0,0,0.02)', backgroundColor: 'white' }}>
                  <div style={{ display: 'flex', alignItems: 'center', marginBottom: '16px' }}>
                    <div style={{ width: '40px', height: '40px', backgroundColor: review.color, color: 'white', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 'bold', marginRight: '12px' }}>{review.initial}</div>
                    <div>
                      <div style={{ fontWeight: '600', color: 'var(--dark-bark)' }}>{review.name}</div>
                      <div style={{ color: 'var(--gold)', fontSize: '0.9rem' }}>★★★★★</div>
                    </div>
                  </div>
                  <p style={{ color: 'var(--text-muted)', fontSize: '0.95rem', lineHeight: '1.5' }}>
                    「{review.text}」
                  </p>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
      
      {/* Subscription Section */}
      <div className="section" style={{ position: 'relative', padding: '100px 20px', backgroundColor: 'var(--dark-bark)', color: 'white', overflow: 'hidden' }}>
        <div style={{ position: 'absolute', top: 0, left: 0, width: '100%', height: '100%', opacity: 0.15, backgroundImage: 'url(https://images.unsplash.com/photo-1596797038530-2c107229654b?auto=format&fit=crop&w=1920&q=80)', backgroundSize: 'cover', backgroundPosition: 'center', zIndex: 0 }}></div>
        <div style={{ position: 'relative', zIndex: 1, maxWidth: '800px', margin: '0 auto', textAlign: 'center' }}>
          <h2 style={{ fontSize: '2.5rem', fontFamily: 'var(--font-display)', marginBottom: '16px', letterSpacing: '2px' }}>ニュースレターに登録</h2>
          <p style={{ fontSize: '1.1rem', color: 'rgba(255,255,255,0.8)', marginBottom: '40px', lineHeight: '1.6' }}>最新のメニュー、シークレットレシピ、そして限定のお得な情報を<br/>あなたのメールボックスへ直接お届けします。</p>
          
          <form style={{ display: 'flex', gap: '10px', maxWidth: '500px', margin: '0 auto', flexWrap: 'wrap', justifyContent: 'center' }} onSubmit={handleNewsletterSubmit}>
            <input type="email" value={newsletterEmail} onChange={(e) => setNewsletterEmail(e.target.value)} placeholder="メールアドレスを入力" required style={{ flex: '1', minWidth: '250px', padding: '16px 24px', borderRadius: '50px', border: 'none', fontSize: '1rem', outline: 'none' }} />
            <button type="submit" style={{ backgroundColor: 'var(--spice)', color: 'white', border: 'none', padding: '16px 36px', borderRadius: '50px', fontWeight: 'bold', fontSize: '1rem', cursor: 'pointer', transition: 'all 0.3s', whiteSpace: 'nowrap', boxShadow: '0 4px 15px rgba(181, 69, 27, 0.4)' }}>
              登録する
            </button>
          </form>
        </div>
      </div>
    </main>
  );
}
