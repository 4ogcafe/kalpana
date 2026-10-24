import React, { useState, useEffect } from 'react';
import { toast } from 'react-hot-toast';
import { apiFetch, assetUrl, errorMessage, getPublic } from '../lib/api';

const MAP_EMBED_PREFIX = 'https://www.google.com/maps/embed';

export default function Contact() {
  const [formData, setFormData] = useState({
    name: '',
    email: '',
    phone: '',
    message: '',
    website: ''
  });
  const [submitted, setSubmitted] = useState(false);
  const [settings, setSettings] = useState<any>({});

  useEffect(() => {
    getPublic<any>('/api/v1/settings')
      .then(data => setSettings(data))
      .catch(console.error);
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const res = await apiFetch('/api/v1/contact', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(formData)
      });
      if (res.ok) {
        setSubmitted(true);
        setFormData({ name: '', email: '', phone: '', message: '', website: '' });
      } else {
        toast.error(await errorMessage(res, 'Failed to send message.'));
      }
    } catch (err) {
      toast.error('Network error.');
    }
  };

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    setFormData({ ...formData, [e.target.name]: e.target.value });
  };

  return (
    <main>
      <title>お問い合わせ | Kalpna (カルプナ)</title>
      <meta name="description" content="カルプナへのご予約・貸し切り・ケータリングのご相談はこちらから。住所・電話番号・地図もご確認いただけます。" />
      {/* Hero Section */}
      <div className="home-hero" style={{ height: '40vh', minHeight: '300px' }}>
        <img src={assetUrl(settings.contactHeroImage) || "https://images.unsplash.com/photo-1590846406792-0adc7f928f1d?auto=format&fit=crop&w=1920&q=80"} alt="本格インド料理 Kalpna (カルプナ) お問い合わせ・店舗外観" fetchPriority="high" className="slide-bg-img" style={{ opacity: 0.5, objectFit: 'cover' }} />
        <div className="hero-content">
          <div className="hero-tag">CONTACT US</div>
          <h1 className="hero-title">お問い<em>合わせ</em></h1>
        </div>
      </div>

      <div className="section" style={{ backgroundColor: 'var(--cream)' }}>
        <div style={{ maxWidth: '1100px', margin: '0 auto', display: 'flex', flexWrap: 'wrap', gap: '40px' }}>
          
          {/* Left: Contact Form */}
          <div style={{ flex: '1 1 500px', backgroundColor: 'white', padding: '40px', borderRadius: '12px', boxShadow: '0 10px 30px rgba(0,0,0,0.05)' }}>
            <h2 style={{ fontSize: '1.8rem', color: 'var(--dark-bark)', margin: '0 0 10px 0' }}>メッセージを送信</h2>
            <p style={{ color: 'var(--text-muted)', marginBottom: '30px' }}>ご予約のお問い合わせ、貸し切りのご相談、またはその他のご質問がございましたら、お気軽にお問い合わせください。</p>
            
            {submitted ? (
              <div style={{ padding: '20px', backgroundColor: '#e6f4ea', color: '#137333', borderRadius: '8px', border: '1px solid #ceead6' }}>
                <h4 style={{ margin: '0 0 10px 0' }}>送信完了しました！</h4>
                <p style={{ margin: 0 }}>お問い合わせありがとうございます。担当者より順次ご返信させていただきます。</p>
              </div>
            ) : (
              <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
                <div>
                  <label htmlFor="contact-name" style={{ display: 'block', marginBottom: '8px', fontWeight: '600', color: 'var(--dark-bark)', fontSize: '0.9rem' }}>お名前 <span style={{ color: 'var(--spice)' }}>*</span></label>
                  <input id="contact-name" autoComplete="name" required type="text" name="name" value={formData.name} onChange={handleChange} style={{ width: '100%', padding: '12px', border: '1px solid #ddd', borderRadius: '6px', fontSize: '1rem', boxSizing: 'border-box' }} placeholder="山田 太郎" />
                </div>
                
                <div style={{ display: 'flex', gap: '20px', flexWrap: 'wrap' }}>
                  <div style={{ flex: '1 1 200px' }}>
                    <label htmlFor="contact-email" style={{ display: 'block', marginBottom: '8px', fontWeight: '600', color: 'var(--dark-bark)', fontSize: '0.9rem' }}>メールアドレス <span style={{ color: 'var(--spice)' }}>*</span></label>
                    <input id="contact-email" autoComplete="email" required type="email" name="email" value={formData.email} onChange={handleChange} style={{ width: '100%', padding: '12px', border: '1px solid #ddd', borderRadius: '6px', fontSize: '1rem', boxSizing: 'border-box' }} placeholder="example@mail.com" />
                  </div>
                  <div style={{ flex: '1 1 200px' }}>
                    <label htmlFor="contact-phone" style={{ display: 'block', marginBottom: '8px', fontWeight: '600', color: 'var(--dark-bark)', fontSize: '0.9rem' }}>電話番号</label>
                    <input id="contact-phone" autoComplete="tel" type="tel" name="phone" value={formData.phone} onChange={handleChange} style={{ width: '100%', padding: '12px', border: '1px solid #ddd', borderRadius: '6px', fontSize: '1rem', boxSizing: 'border-box' }} placeholder="090-1234-5678" />
                  </div>
                </div>

                <div>
                  <label htmlFor="contact-message" style={{ display: 'block', marginBottom: '8px', fontWeight: '600', color: 'var(--dark-bark)', fontSize: '0.9rem' }}>メッセージ <span style={{ color: 'var(--spice)' }}>*</span></label>
                  <textarea id="contact-message" required name="message" value={formData.message} onChange={handleChange} rows={5} style={{ width: '100%', padding: '12px', border: '1px solid #ddd', borderRadius: '6px', fontSize: '1rem', boxSizing: 'border-box', resize: 'vertical' }} placeholder="ご用件をご入力ください"></textarea>
                </div>

                {/* Honeypot: hidden from people; bots that fill it are ignored by the API. */}
                <input type="text" name="website" value={formData.website} onChange={handleChange} tabIndex={-1} autoComplete="off" aria-hidden="true" style={{ position: 'absolute', left: '-9999px', width: '1px', height: '1px' }} />

                <button type="submit" style={{ backgroundColor: 'var(--spice)', color: 'white', border: 'none', padding: '16px', borderRadius: '6px', fontWeight: 'bold', fontSize: '1.05rem', cursor: 'pointer', transition: 'background 0.2s', marginTop: '10px' }} onMouseOver={(e) => e.currentTarget.style.backgroundColor = 'var(--spice-hover)'} onMouseOut={(e) => e.currentTarget.style.backgroundColor = 'var(--spice)'}>
                  送信する
                </button>
              </form>
            )}
          </div>

          {/* Right: Info & Map */}
          <div style={{ flex: '1 1 400px', display: 'flex', flexDirection: 'column', gap: '30px' }}>
            
            <div style={{ backgroundColor: 'white', padding: '30px', borderRadius: '12px', boxShadow: '0 10px 30px rgba(0,0,0,0.05)' }}>
              <h3 style={{ fontSize: '1.4rem', color: 'var(--dark-bark)', margin: '0 0 20px 0' }}>店舗情報</h3>
              
              <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
                <div style={{ display: 'flex', gap: '16px', alignItems: 'flex-start' }}>
                  <div style={{ width: '36px', height: '36px', borderRadius: '50%', backgroundColor: 'var(--cream)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, border: '1px solid #e5dbcd' }}>
                    <span style={{ color: 'var(--spice)', fontSize: '1rem' }}>📍</span>
                  </div>
                  <div>
                    <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginBottom: '4px', fontWeight: 'bold' }}>住所</div>
                    <div style={{ color: 'var(--dark-bark)', fontSize: '0.95rem', lineHeight: '1.5' }}>
                      {settings.addressJa || '埼玉県熊谷市'}<br/>
                      {settings.name || 'Kalpna Indian Cuisine'}
                    </div>
                  </div>
                </div>

                <div style={{ display: 'flex', gap: '16px', alignItems: 'flex-start' }}>
                  <div style={{ width: '36px', height: '36px', borderRadius: '50%', backgroundColor: 'var(--cream)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, border: '1px solid #e5dbcd' }}>
                    <span style={{ color: 'var(--text-muted)', fontSize: '1rem' }}>📞</span>
                  </div>
                  <div>
                    <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginBottom: '4px', fontWeight: 'bold' }}>電話番号</div>
                    <div style={{ color: 'var(--dark-bark)', fontSize: '1.05rem', fontWeight: '500' }}>{settings.phone || '(店舗番号)'}</div>
                  </div>
                </div>

                <div style={{ display: 'flex', gap: '16px', alignItems: 'flex-start' }}>
                  <div style={{ width: '36px', height: '36px', borderRadius: '50%', backgroundColor: 'var(--cream)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, border: '1px solid #e5dbcd' }}>
                    <span style={{ color: 'var(--text-muted)', fontSize: '1rem' }}>✉️</span>
                  </div>
                  <div>
                    <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginBottom: '4px', fontWeight: 'bold' }}>メールアドレス</div>
                    <div style={{ color: 'var(--dark-bark)', fontSize: '0.95rem' }}>{settings.email || 'info@kalpana.com'}</div>
                  </div>
                </div>
              </div>
            </div>

            <div style={{ flex: '1', borderRadius: '12px', overflow: 'hidden', minHeight: '300px', backgroundColor: '#e5e3df', position: 'relative', boxShadow: '0 10px 30px rgba(0,0,0,0.05)' }}>
              <iframe 
                src={settings.mapUrl?.startsWith(MAP_EMBED_PREFIX) ? settings.mapUrl : "https://www.google.com/maps/embed?pb=!1m18!1m12!1m3!1d3221.724944983944!2d139.41883000000002!3d36.1251!2m3!1f0!2f0!3f0!3m2!1i1024!2i768!4f13.1!3m3!1m2!1s0x601f2b0605446c1f%3A0x1a31a406a1c1b3d6!2sKalpna%20Indian%20Cuisine!5e0!3m2!1sen!2sus!4v1700000000000!5m2!1sen!2sus"}
                title="Google マップ: Kalpna Indian Cuisine" 
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
    </main>
  );
}
