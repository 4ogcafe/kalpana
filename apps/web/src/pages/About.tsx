import { useState, useEffect } from 'react';
import { Sparkles, Flame, Heart, ChefHat, Utensils } from 'lucide-react';
import { assetUrl, getPublic } from '../lib/api';
import EmphasisText from '../components/EmphasisText';

export default function About() {
  const [settings, setSettings] = useState<any>({});

  useEffect(() => {
    getPublic<any>('/api/v1/settings')
      .then(data => setSettings(data))
      .catch(console.error);
  }, []);

  const storyParagraphs = (settings.aboutStoryJa || 'カルプナでは、本場インドの伝統と豊かな食文化を大切にしながら、日本の皆さまに本格的なインド料理をお届けしています。\n新鮮な食材、厳選したスパイス、炭火で焼き上げる香ばしいナンやタンドリー料理、そして経験豊富なシェフの技と情熱。一皿一皿にこだわりを込め、「おいしい」「また食べたい」と感じていただける料理を目指しています。\n味・品質・価格・おもてなしを大切にし、皆さまに心からご満足いただけるお店でありたいと考えています。\nここでは、カルプナが大切にしている5つのこだわりをご紹介します。').split('\n').filter((p: string) => p.trim().length > 0);

  return (
    <main>
      <title>私たちについて | Kalpna (カルプナ)</title>
      <meta name="description" content="熊谷の本格インド料理店カルプナの物語、スパイスへのこだわり、シェフをご紹介します。" />
      <link rel="canonical" href="https://kalpnacurry.com/about" />

      {/* About Hero */}
      <div className="home-hero" style={{ height: '50vh', minHeight: '400px' }}>
        <img
          src={assetUrl(settings.aboutHeroImage) || ''}
          alt=""
          fetchPriority="high"
          className="slide-bg-img"
          style={{ opacity: 0.5, objectFit: 'cover' }}
        />
        <div className="hero-content">
          <div className="hero-tag">{settings.aboutHeroTag || '私たちについて'}</div>
          <h1 className="hero-title">
            <EmphasisText text={settings.aboutHeroTitle || '私たちに<em>ついて</em>'} />
          </h1>
        </div>
      </div>

      {/* Story Section */}
      <section
        style={{
          position: 'relative',
          backgroundColor: '#faf7f2',
          backgroundImage: 'radial-gradient(circle at 10% 20%, rgba(242, 168, 59, 0.08), transparent 40%), radial-gradient(circle at 90% 80%, rgba(181, 69, 27, 0.05), transparent 40%)',
          padding: 'clamp(2.5rem, 5vw, 3.5rem) 20px',
          overflow: 'hidden',
          borderBottom: '1px solid rgba(0, 0, 0, 0.05)',
        }}
      >
        <div style={{ maxWidth: '1100px', margin: '0 auto', position: 'relative', zIndex: 2 }}>

          {/* Section Header */}
          <div style={{ textAlign: 'center', maxWidth: '720px', margin: '0 auto 2rem' }}>
            <div
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '8px',
                backgroundColor: '#ffffff',
                border: '1px solid rgba(181, 69, 27, 0.25)',
                borderRadius: '9999px',
                padding: '5px 16px',
                marginBottom: '0.9rem',
              }}
            >
              <Sparkles size={13} color="var(--spice)" />
              <span style={{ color: 'var(--spice)', fontWeight: 700, letterSpacing: '2px', fontSize: '0.77rem', textTransform: 'uppercase' }}>
                {settings.aboutStoryLabelJa || '私たちの物語'}
              </span>
            </div>
            <h2
              className="section-title"
              style={{ fontSize: 'clamp(1.6rem, 4vw, 2.5rem)', lineHeight: 1.25, margin: '0 0 0.9rem', color: 'var(--dark-bark)', letterSpacing: '-0.02em' }}
            >
              <EmphasisText text={settings.aboutStoryTitleJa || '本場インドの味を支える、<em>5つのこだわり</em>'} />
            </h2>
            <div style={{ width: '48px', height: '3px', backgroundColor: 'var(--gold)', margin: '0 auto 1.1rem', borderRadius: '2px' }} />
            {/* Intro paragraphs */}
            <div style={{ fontSize: '0.97rem', lineHeight: 1.85, color: '#5c524c' }}>
              {storyParagraphs.slice(0, 3).map((para: string, i: number) => (
                <p key={i} style={{ margin: i === 0 ? 0 : '10px 0 0', fontWeight: i === 0 ? 500 : 400, color: i === 0 ? 'var(--dark-bark)' : '#5c524c' }}>
                  {para}
                </p>
              ))}
            </div>
          </div>

          {/* Features badge */}
          <div style={{ textAlign: 'center', marginBottom: '1.25rem' }}>
            <span style={{ display: 'inline-block', padding: '6px 20px', background: 'linear-gradient(135deg, #fff7ed, #fef3c7)', borderRadius: '9999px', border: '1px solid rgba(242, 168, 59, 0.45)', fontSize: '0.9rem', fontWeight: 800, color: 'var(--dark-bark)', letterSpacing: '0.04em' }}>
              {settings.aboutStoryFeaturesBadgeJa || '🌟 当店の5つの特徴 🌟'}
            </span>
          </div>

          {/* 5 Pillars — 2-column responsive grid */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 340px), 1fr))', gap: '10px', marginBottom: '1.75rem' }}>
            <StoryPillar
              icon={Flame}
              title={settings.aboutStoryPillar1TitleJa || '高品質な料理をお手頃価格で'}
              desc={settings.aboutStoryPillar1DescJa || '新鮮で高品質な食材を使用し、味と健康の両立を大切にしています。本格的なインド料理を、品質と価格のバランスにこだわりながら、より多くのお客さまに気軽にお楽しみいただけるよう努めています。'}
            />
            <StoryPillar
              icon={Sparkles}
              title={settings.aboutStoryPillar2TitleJa || '本格的な味の秘密はタンドールに'}
              desc={settings.aboutStoryPillar2DescJa || '伝統的なタンドール（土窯）で薪炭の火でじっくりと焼き上げることで、香ばしい香りと独特の食感が生まれます。火加減や焼き加減にもこだわり、本場インドならではの味わいをお届けします。'}
            />
            <StoryPillar
              icon={Heart}
              title={settings.aboutStoryPillar3TitleJa || '経験豊富なシェフの技と情熱'}
              desc={settings.aboutStoryPillar3DescJa || '伝統的な調理技法を大切にしながら、一品一品を丁寧に調理しています。ナン、ビリヤニ、カレー、タンドリー料理まで、それぞれの料理のおいしさを引き出し、皆さまにご満足いただける一皿を目指しています。'}
            />
            <StoryPillar
              icon={ChefHat}
              title={settings.aboutStoryPillar4TitleJa || 'インドから厳選したスパイス'}
              desc={settings.aboutStoryPillar4DescJa || 'スパイスの香りや風味、組み合わせを大切にし、料理ごとにバランスよく調合しています。辛さだけではなく豊かな香りと奥深い味わいを追求し、お好みに合わせて辛さも調整できます。'}
            />
            <StoryPillar
              icon={Utensils}
              title={settings.aboutStoryPillar5TitleJa || '創業者 セムワル・プラバットの経験と想い'}
              desc={settings.aboutStoryPillar5DescJa || 'インドで10年以上の調理経験を積み、日本の有名インドレストランチェーンで18年間勤務した創業者が、本場インドの伝統的な味わいを日本の皆さまにお届けします。'}
            />
          </div>

          {/* Closing statement */}
          <div style={{ textAlign: 'center', maxWidth: '640px', margin: '0 auto', padding: '1.5rem 1.75rem', background: 'rgba(255,255,255,0.85)', borderRadius: '16px', border: '1px solid rgba(242, 168, 59, 0.3)' }}>
            <h3 style={{ fontSize: 'clamp(1.1rem, 2.5vw, 1.35rem)', fontWeight: 800, color: 'var(--dark-bark)', margin: '0 0 0.75rem' }}>
              {settings.aboutStoryClosingTitleJa || 'カルプナで、心に残るお食事のひとときを'}
            </h3>
            <div style={{ color: '#5c524c', lineHeight: 1.75, fontSize: '0.92rem' }}>
              {(settings.aboutStoryClosingTextJa || '本格的なインド料理を、もっと身近に、もっと気軽に。\nご家族やご友人とのお食事はもちろん、お一人さまでも、皆さまに心地よい時間をお過ごしいただけるよう努めています。\n皆さまのご来店を、心よりお待ちしております。').split('\n').filter((p: string) => p.trim()).map((p: string, i: number) => (
                <p key={i} style={{ margin: i === 0 ? 0 : '8px 0 0' }}>{p}</p>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* Spice & Ingredients Section */}
      <div className="section" style={{ backgroundColor: 'var(--cream)' }}>
        <div style={{ maxWidth: '1100px', margin: '0 auto', display: 'flex', flexWrap: 'wrap', gap: '40px', alignItems: 'center' }}>
          <div style={{ flex: '1 1 400px' }}>
            <img
              src={assetUrl(settings.aboutSpiceImage) || "https://images.unsplash.com/photo-1596040033229-a9821ebd058d?auto=format&fit=crop&w=800&q=80"}
              alt={settings.aboutSpiceTitleJa?.replace(/<[^>]*>/g, '') || "厳選直輸入スパイス"}
              loading="lazy"
              decoding="async"
              style={{ width: '100%', borderRadius: '16px', boxShadow: '0 10px 30px rgba(0,0,0,0.1)' }}
            />
          </div>
          <div style={{ flex: '1 1 400px' }}>
            <div className="section-label">{settings.aboutSpiceLabelJa || 'こだわり'}</div>
            <h2 className="section-title" style={{ fontSize: '2.5rem' }}>
              <EmphasisText text={settings.aboutSpiceTitleJa || '命を吹き込む、<em>スパイス</em>'} />
            </h2>
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
            <img
              src={assetUrl(settings.aboutChefImage) || ''}
              alt={settings.aboutChefTitleJa?.replace(/<[^>]*>/g, '') || "熟練のシェフ"}
              loading="lazy"
              decoding="async"
              style={{ width: '100%', borderRadius: '16px', boxShadow: '0 10px 30px rgba(0,0,0,0.1)' }}
            />
          </div>
          <div style={{ flex: '1 1 400px' }}>
            <div className="section-label">{settings.aboutChefLabelJa || 'シェフ紹介'}</div>
            <h2 className="section-title" style={{ fontSize: '2.5rem' }}>
              <EmphasisText text={settings.aboutChefTitleJa || '熟練の<em>技</em>'} />
            </h2>
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

function StoryPillar({
  icon: Icon,
  title,
  desc,
}: {
  icon: React.ComponentType<{ size?: number; color?: string }>;
  title: string;
  desc: string;
}) {
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'flex-start',
        gap: '14px',
        backgroundColor: '#ffffff',
        borderRadius: '14px',
        padding: '14px 18px',
        border: '1px solid rgba(0, 0, 0, 0.06)',
        boxShadow: '0 2px 8px rgba(0, 0, 0, 0.03)',
      }}
    >
      <div
        style={{
          width: '38px',
          height: '38px',
          borderRadius: '10px',
          backgroundColor: '#fff7ed',
          border: '1px solid #fed7aa',
          display: 'grid',
          placeItems: 'center',
          color: 'var(--spice)',
          flexShrink: 0,
          marginTop: '2px',
        }}
      >
        <Icon size={18} />
      </div>
      <div>
        <h4 style={{ margin: '0 0 6px', fontSize: '0.96rem', fontWeight: 700, color: 'var(--dark-bark)' }}>
          {title}
        </h4>
        {desc.split('\n').filter(p => p.trim()).map((p, i) => (
          <p key={i} style={{ margin: i === 0 ? 0 : '6px 0 0', fontSize: '0.84rem', color: '#6b7280', lineHeight: 1.55 }}>
            {p}
          </p>
        ))}
      </div>
    </div>
  );
}
