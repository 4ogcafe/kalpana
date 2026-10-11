import { useState, useEffect } from 'react';

export default function About() {
  const [settings, setSettings] = useState<any>({});

  useEffect(() => {
    fetch('http://localhost:4000/api/v1/settings')
      .then(res => res.json())
      .then(data => setSettings(data))
      .catch(console.error);
  }, []);

  return (
    <main>
      {/* About Hero */}
      <div className="home-hero" style={{ height: '50vh', minHeight: '400px' }}>
        <img src={settings.aboutHeroImage || "https://images.unsplash.com/photo-1552566626-52f8b828add9?auto=format&fit=crop&w=1920&q=80"} alt="Restaurant Interior" className="slide-bg-img" style={{ opacity: 0.5, objectFit: 'cover' }} />
        <div className="hero-content">
          <div className="hero-tag">ABOUT US</div>
          <h1 className="hero-title">私たちに<em>ついて</em></h1>
        </div>
      </div>

      {/* Story Section */}
      <div className="section" style={{ backgroundColor: 'white' }}>
        <div style={{ maxWidth: '900px', margin: '0 auto', textAlign: 'center' }}>
          <div className="section-label">{settings.aboutStoryLabelJa || '私たちの物語'}</div>
          <h2 className="section-title" dangerouslySetInnerHTML={{ __html: settings.aboutStoryTitleJa || '本場インドの味を、<em>熊谷へ</em>' }}></h2>
          <div className="divider"></div>
          
          <div style={{ marginTop: '40px', fontSize: '1.1rem', lineHeight: '2', color: 'var(--dark-bark)' }}>
            {(settings.aboutStoryJa || 'Kalpana（カルパナ）は、サンスクリット語で「想像」や「創造」を意味します。\n私たちは、インドの伝統的なスパイスと製法を守りながら、日本の皆さまの味覚に寄り添う新しいインディアン・ダイニングを創造しています。\n\n本場インドのホテルで腕を磨いたシェフが、厳選された数十種類のスパイスを巧みにブレンド。\n特注のタンドール（土窯）で焼き上げる備長炭の香ばしいナンやタンドリーチキンは、多くのお客様に愛されています。').split('\n').map((line: string, i: number) => (
              <p key={i} style={{ marginBottom: '20px' }}>{line}</p>
            ))}
          </div>
        </div>
      </div>

      {/* Spice & Ingredients Section */}
      <div className="section" style={{ backgroundColor: 'var(--cream)' }}>
        <div style={{ maxWidth: '1100px', margin: '0 auto', display: 'flex', flexWrap: 'wrap', gap: '40px', alignItems: 'center' }}>
          <div style={{ flex: '1 1 400px' }}>
            <img src={settings.aboutSpiceImage || "https://images.unsplash.com/photo-1596040033229-a9821ebd058d?auto=format&fit=crop&w=800&q=80"} alt="Indian Spices" style={{ width: '100%', borderRadius: '12px', boxShadow: '0 10px 30px rgba(0,0,0,0.1)' }} />
          </div>
          <div style={{ flex: '1 1 400px' }}>
            <div className="section-label">{settings.aboutSpiceLabelJa || 'こだわり'}</div>
            <h2 className="section-title" style={{ fontSize: '2.5rem' }} dangerouslySetInnerHTML={{ __html: settings.aboutSpiceTitleJa || '命を吹き込む、<em>スパイス</em>' }}></h2>
            <div className="divider" style={{ margin: '0 0 1.5rem 0' }}></div>
            <div style={{ lineHeight: '1.8', color: 'var(--text-muted)' }}>
              {(settings.aboutSpiceDescJa || 'カレーの味の決め手となるスパイスは、インドから直接取り寄せた最高品質のものを使用しています。クミン、コリアンダー、ターメリック、カルダモン... それぞれのスパイスが持つ薬効や香りを最大限に引き出すため、独自に配合し、挽きたてを使用しています。').split('\n').map((line: string, i: number) => (
                <p key={i} style={{ marginBottom: '10px' }}>{line}</p>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Chef Section */}
      <div className="section" style={{ backgroundColor: 'white' }}>
        <div style={{ maxWidth: '1100px', margin: '0 auto', display: 'flex', flexWrap: 'wrap', gap: '40px', alignItems: 'center', flexDirection: 'row-reverse' }}>
          <div style={{ flex: '1 1 400px' }}>
            <img src={settings.aboutChefImage || "https://images.unsplash.com/photo-1583394838336-acd977736f90?auto=format&fit=crop&w=800&q=80"} alt="Our Chef" style={{ width: '100%', borderRadius: '12px', boxShadow: '0 10px 30px rgba(0,0,0,0.1)' }} />
          </div>
          <div style={{ flex: '1 1 400px' }}>
            <div className="section-label">{settings.aboutChefLabelJa || 'シェフ紹介'}</div>
            <h2 className="section-title" style={{ fontSize: '2.5rem' }} dangerouslySetInnerHTML={{ __html: settings.aboutChefTitleJa || '熟練の<em>技</em>' }}></h2>
            <div className="divider" style={{ margin: '0 0 1.5rem 0' }}></div>
            <div style={{ lineHeight: '1.8', color: 'var(--text-muted)' }}>
              {(settings.aboutChefDescJa || '長年の経験を積み、日本の皆さまに「本物のインド料理」を届けるために来日しました。カレーの奥深さ、スパイスの魔法、そしてインドの温かいおもてなしの心を、一皿一皿に込めて提供しています。辛さの調節や、ベジタリアン対応などもお気軽にお声がけください。').split('\n').map((line: string, i: number) => (
                <p key={i} style={{ marginBottom: '10px' }}>{line}</p>
              ))}
            </div>
          </div>
        </div>
      </div>
    </main>
  );
}
