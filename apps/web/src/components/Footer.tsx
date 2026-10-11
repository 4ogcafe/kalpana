import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';

export default function Footer() {
  const [settings, setSettings] = useState({
    name: 'Kalpana Indian Cuisine',
    email: 'info@kalpana.com',
    phone: '(店舗番号)',
    addressJa: '埼玉県 熊谷市'
  });

  useEffect(() => {
    fetch('http://localhost:4000/api/v1/settings')
      .then(res => res.json())
      .then(data => {
        if (data && data._id) {
          setSettings(data);
        }
      })
      .catch(console.error);
  }, []);

  return (
    <footer className="footer">
      <div style={{ maxWidth: '1200px', margin: '0 auto', display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(250px, 1fr))', gap: '40px' }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '20px' }}>
             <div style={{ height: '50px' }}>
              <img src="/logo-white-01.png.webp" alt="Kalpana Logo White" style={{ height: '100%', width: 'auto', objectFit: 'contain' }} />
            </div>
            <h3 style={{ margin: 0 }}>Kalpana<span>.</span></h3>
          </div>
          <p>埼玉・熊谷にある本格インド料理店。古代インドのスパイスルートを旅するような体験をお届けします。</p>
        </div>
        
        <div>
          <h3>リンク</h3>
          <ul style={{ listStyle: 'none', padding: 0, margin: 0, lineHeight: '2' }}>
            <li><Link to="/" style={{ color: 'var(--gold)', textDecoration: 'none' }}>ホーム</Link></li>
            <li><Link to="/about" style={{ color: 'rgba(255,255,255,0.8)', textDecoration: 'none' }}>私たちについて</Link></li>
            <li><Link to="/menu/grand" style={{ color: 'rgba(255,255,255,0.8)', textDecoration: 'none' }}>メニュー</Link></li>
            <li><Link to="/contact" style={{ color: 'rgba(255,255,255,0.8)', textDecoration: 'none' }}>お問い合わせ</Link></li>
            <li><Link to="/login" style={{ color: 'rgba(255,255,255,0.8)', textDecoration: 'none' }}>管理者ログイン</Link></li>
          </ul>
        </div>

        <div>
          <h3>店舗情報</h3>
          <p>
            {settings.name}<br/>
            {settings.addressJa}<br/>
            <br/>
            Phone: {settings.phone}<br/>
            Email: {settings.email}
          </p>
        </div>
      </div>
      
      <div style={{ maxWidth: '1200px', margin: '40px auto 0', paddingTop: '20px', borderTop: '1px solid rgba(255,255,255,0.1)', textAlign: 'center', fontSize: '0.85rem' }}>
        &copy; {new Date().getFullYear()} Kalpana Authentic Indian Cuisine. All Rights Reserved.
      </div>
    </footer>
  );
}
