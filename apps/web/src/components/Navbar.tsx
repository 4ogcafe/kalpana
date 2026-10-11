import React, { useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { toast } from 'react-hot-toast';
import { apiFetch } from '../lib/api';

export default function Navbar() {
  const [isPopupOpen, setIsPopupOpen] = useState(false);
  const [isSubmitted, setIsSubmitted] = useState(false);
  const [formData, setFormData] = useState({
    date: '',
    time: '',
    guests: '',
    name: '',
    email: '',
    phone: '',
    message: ''
  });
  const location = useLocation();

  const handleOpen = () => setIsPopupOpen(true);
  const handleClose = () => {
    setIsPopupOpen(false);
    setTimeout(() => {
      setIsSubmitted(false);
      setFormData({ date: '', time: '', guests: '', name: '', email: '', phone: '', message: '' });
    }, 300);
  };

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => {
    setFormData({ ...formData, [e.target.name]: e.target.value });
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const res = await apiFetch('/api/v1/contact', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...formData,
          type: 'RESERVATION',
          date: `${formData.date}T${formData.time}:00`
        })
      });
      if (res.ok) {
        setIsSubmitted(true);
      } else {
        toast.error('Failed to submit reservation.');
      }
    } catch (err) {
      toast.error('Network error.');
    }
  };

  const isActive = (path: string) => {
    if (path === '/') return location.pathname === '/';
    return location.pathname.startsWith(path);
  };

  return (
    <>
      <nav className="navbar">
        <div className="nav-inner">
          <Link className="nav-logo" to="/">
            <div style={{ height: '40px', display: 'flex', alignItems: 'center' }}>
              <img src="/site-logo-01.webp" alt="Kalpana" width={40} height={40} style={{ height: '100%', width: 'auto', objectFit: 'contain' }} />
            </div>
            <div>
              <div className="nav-logo-text">カルパナ<span>.</span></div>
              <span className="nav-logo-sub">本格インド料理店 ・ 熊谷</span>
            </div>
          </Link>

          <ul className="nav-links">
            <li><Link to="/" className={isActive('/') ? 'active' : ''}>ホーム</Link></li>
            <li><Link to="/about" className={isActive('/about') ? 'active' : ''}>私たちについて</Link></li>
            <li><Link to="/menu/lunch" className={isActive('/menu/lunch') ? 'active' : ''}>ランチメニュー</Link></li>
            <li><Link to="/menu/takeout" className={isActive('/menu/takeout') ? 'active' : ''}>テイクアウト</Link></li>
            <li><Link to="/menu/grand" className={isActive('/menu/grand') ? 'active' : ''}>グランドメニュー</Link></li>
            <li><Link to="/contact" className={isActive('/contact') ? 'active' : ''}>お問い合わせ</Link></li>
          </ul>

          <div style={{ display: 'flex', alignItems: 'center' }}>
            <button className="nav-cta" onClick={handleOpen}>席を予約する</button>
          </div>
        </div>
      </nav>

      {/* Reservation Popup Modal */}
      {isPopupOpen && (
        <div style={{ position: 'fixed', top: 0, left: 0, width: '100vw', height: '100vh', backgroundColor: 'rgba(0,0,0,0.6)', zIndex: 9999, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '20px', boxSizing: 'border-box' }} onClick={handleClose}>
          
          <div style={{ backgroundColor: 'white', borderRadius: '16px', overflow: 'hidden', maxWidth: '500px', width: '100%', position: 'relative', boxShadow: '0 20px 50px rgba(0,0,0,0.2)' }} onClick={(e) => e.stopPropagation()}>
            
            <button onClick={handleClose} aria-label="閉じる" style={{ position: 'absolute', top: '15px', right: '15px', background: 'white', border: 'none', color: 'var(--text-muted)', fontSize: '1.5rem', cursor: 'pointer', width: '30px', height: '30px', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: '0 2px 10px rgba(0,0,0,0.1)', zIndex: 10 }}>×</button>
            
            {/* Header image */}
            <div style={{ height: '120px', width: '100%', backgroundImage: 'url(https://images.unsplash.com/photo-1517248135467-4c7edcad34c4?auto=format&fit=crop&w=800&q=80)', backgroundSize: 'cover', backgroundPosition: 'center', position: 'relative' }}>
              <div style={{ position: 'absolute', top: 0, left: 0, width: '100%', height: '100%', backgroundColor: 'rgba(42, 35, 33, 0.6)' }}></div>
              <div style={{ position: 'absolute', top: 0, left: 0, width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'white', fontSize: '1.8rem', fontWeight: 'bold', fontFamily: 'var(--font-display)', letterSpacing: '1px' }}>
                オンライン予約
              </div>
            </div>

            <div style={{ padding: '30px' }}>
              {isSubmitted ? (
                <div style={{ textAlign: 'center', padding: '40px 20px' }}>
                  <div style={{ fontSize: '3rem', marginBottom: '20px' }}>✅</div>
                  <h3 style={{ fontSize: '1.4rem', color: 'var(--dark-bark)', marginBottom: '10px' }}>ご予約を受け付けました</h3>
                  <p style={{ color: 'var(--text-muted)', lineHeight: '1.6' }}>ご予約リクエストを受け付けました。内容を確認のうえ、店舗よりご連絡いたします。ご来店を心よりお待ちしております。</p>
                  <button onClick={handleClose} style={{ marginTop: '30px', backgroundColor: 'var(--spice)', color: 'white', border: 'none', padding: '12px 30px', borderRadius: '50px', fontWeight: 'bold', cursor: 'pointer' }}>閉じる</button>
                </div>
              ) : (
                <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '15px' }}>
                  
                  <div style={{ display: 'flex', gap: '15px' }}>
                    <div style={{ flex: 1 }}>
                      <label style={{ display: 'block', marginBottom: '5px', fontSize: '0.85rem', fontWeight: 'bold', color: 'var(--dark-bark)' }}>日付 <span style={{color: 'var(--spice)'}}>*</span></label>
                      <input required type="date" name="date" value={formData.date} onChange={handleChange} style={{ width: '100%', padding: '12px', border: '1px solid #ddd', borderRadius: '8px', boxSizing: 'border-box', fontFamily: 'inherit' }} />
                    </div>
                    <div style={{ flex: 1 }}>
                      <label style={{ display: 'block', marginBottom: '5px', fontSize: '0.85rem', fontWeight: 'bold', color: 'var(--dark-bark)' }}>時間 <span style={{color: 'var(--spice)'}}>*</span></label>
                      <input required type="time" name="time" value={formData.time} onChange={handleChange} style={{ width: '100%', padding: '12px', border: '1px solid #ddd', borderRadius: '8px', boxSizing: 'border-box', fontFamily: 'inherit' }} />
                    </div>
                  </div>

                  <div style={{ display: 'flex', gap: '15px' }}>
                    <div style={{ flex: 1 }}>
                      <label style={{ display: 'block', marginBottom: '5px', fontSize: '0.85rem', fontWeight: 'bold', color: 'var(--dark-bark)' }}>人数 <span style={{color: 'var(--spice)'}}>*</span></label>
                      <select required name="guests" value={formData.guests} onChange={handleChange} style={{ width: '100%', padding: '12px', border: '1px solid #ddd', borderRadius: '8px', boxSizing: 'border-box', fontFamily: 'inherit', backgroundColor: 'white' }}>
                        <option value="">選択してください</option>
                        <option value="1">1名様</option>
                        <option value="2">2名様</option>
                        <option value="3">3名様</option>
                        <option value="4">4名様</option>
                        <option value="5">5名様以上</option>
                      </select>
                    </div>
                    <div style={{ flex: 1 }}>
                      <label style={{ display: 'block', marginBottom: '5px', fontSize: '0.85rem', fontWeight: 'bold', color: 'var(--dark-bark)' }}>お名前 <span style={{color: 'var(--spice)'}}>*</span></label>
                      <input required type="text" name="name" value={formData.name} onChange={handleChange} placeholder="山田 太郎" style={{ width: '100%', padding: '12px', border: '1px solid #ddd', borderRadius: '8px', boxSizing: 'border-box', fontFamily: 'inherit' }} />
                    </div>
                  </div>

                  <div>
                    <label style={{ display: 'block', marginBottom: '5px', fontSize: '0.85rem', fontWeight: 'bold', color: 'var(--dark-bark)' }}>メールアドレス <span style={{color: 'var(--spice)'}}>*</span></label>
                    <input required type="email" name="email" value={formData.email} onChange={handleChange} placeholder="taro@example.com" style={{ width: '100%', padding: '12px', border: '1px solid #ddd', borderRadius: '8px', boxSizing: 'border-box', fontFamily: 'inherit' }} />
                  </div>

                  <div>
                    <label style={{ display: 'block', marginBottom: '5px', fontSize: '0.85rem', fontWeight: 'bold', color: 'var(--dark-bark)' }}>電話番号 <span style={{color: 'var(--spice)'}}>*</span></label>
                    <input required type="tel" name="phone" value={formData.phone} onChange={handleChange} placeholder="090-1234-5678" style={{ width: '100%', padding: '12px', border: '1px solid #ddd', borderRadius: '8px', boxSizing: 'border-box', fontFamily: 'inherit' }} />
                  </div>

                  <div>
                    <label style={{ display: 'block', marginBottom: '5px', fontSize: '0.85rem', fontWeight: 'bold', color: 'var(--dark-bark)' }}>ご要望など</label>
                    <textarea name="message" value={formData.message} onChange={handleChange} rows={3} placeholder="アレルギーなどございましたらご記入ください" style={{ width: '100%', padding: '12px', border: '1px solid #ddd', borderRadius: '8px', boxSizing: 'border-box', fontFamily: 'inherit', resize: 'vertical' }}></textarea>
                  </div>

                  <button 
                    type="submit" 
                    style={{ backgroundColor: 'var(--spice)', color: 'white', border: 'none', padding: '16px', borderRadius: '8px', fontWeight: 'bold', fontSize: '1.05rem', cursor: 'pointer', transition: 'all 0.3s', marginTop: '10px' }}
                    onMouseOver={(e) => { e.currentTarget.style.backgroundColor = 'var(--spice-hover)'; e.currentTarget.style.transform = 'translateY(-2px)'; }}
                    onMouseOut={(e) => { e.currentTarget.style.backgroundColor = 'var(--spice)'; e.currentTarget.style.transform = 'translateY(0)'; }}
                  >
                    予約を確定する
                  </button>
                </form>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
