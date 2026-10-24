import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const webRoot = path.resolve(__dirname, '..');
const distDir = path.resolve(webRoot, 'dist');
const repoRoot = path.resolve(webRoot, '../..');
const publicHtmlDir = path.resolve(repoRoot, 'public_html');

// Read the base built index.html from dist
const templatePath = path.join(distDir, 'index.html');
if (!fs.existsSync(templatePath)) {
  console.error('dist/index.html does not exist. Run vite build first.');
  process.exit(1);
}

const baseHtml = fs.readFileSync(templatePath, 'utf8');

// Common restaurant details
const RESTAURANT = {
  name: 'Kalpna (カルプナ)',
  tagline: '埼玉・熊谷の本格インド料理',
  address: '〒360-0831 埼玉県熊谷市佐谷田2081（国道17号沿い・加賀家食堂隣・駐車場12台完備）',
  phone: '048-514-8386',
  hours: 'ランチ 11:30–15:00 / ディナー 17:00–22:00',
  closedDay: '火曜日',
  cuisine: '本格インド料理・ネパール料理',
  heroImage: 'https://kalpnacurry.com/bg-hero-img.webp',
  imageAlt: '本格インド料理 Kalpna (カルプナ) の本格カレーと焼き立てナン',
  instagram: 'https://instagram.com/kalpana_restro',
  googleMaps: 'https://maps.app.goo.gl/92p48n6Zc4X9Nq518'
};

const commonHeader = `
<header class="navbar" style="padding: 16px 24px; display: flex; justify-content: space-between; align-items: center; border-bottom: 1px solid #eee;">
  <a href="/" style="display: flex; align-items: center; gap: 10px; text-decoration: none; color: inherit;">
    <img src="/site-logo-01.webp" alt="Kalpna (カルプナ) ロゴ" width="40" height="40" />
    <span style="font-weight: bold; font-size: 1.25rem;">Kalpna (カルプナ)</span>
  </a>
  <nav aria-label="メインナビゲーション">
    <ul style="display: flex; gap: 16px; list-style: none; margin: 0; padding: 0;">
      <li><a href="/" style="text-decoration: none; color: inherit; font-weight: 500;">ホーム</a></li>
      <li><a href="/menu/lunch" style="text-decoration: none; color: inherit; font-weight: 500;">ランチメニュー</a></li>
      <li><a href="/menu/takeout" style="text-decoration: none; color: inherit; font-weight: 500;">テイクアウト</a></li>
      <li><a href="/menu/grand" style="text-decoration: none; color: inherit; font-weight: 500;">グランドメニュー</a></li>
      <li><a href="/about" style="text-decoration: none; color: inherit; font-weight: 500;">私たちについて</a></li>
      <li><a href="/contact" style="text-decoration: none; color: inherit; font-weight: 500;">お問い合わせ</a></li>
    </ul>
  </nav>
</header>
`;

const commonFooter = `
<footer style="background-color: #2a2321; color: #aaa; padding: 40px 20px; text-align: center; line-height: 1.8;">
  <div style="max-width: 1100px; margin: 0 auto;">
    <p style="color: #fff; font-weight: bold; font-size: 1.1rem; margin-bottom: 8px;">Kalpna (カルプナ) - 本格インド料理</p>
    <p style="margin-bottom: 16px;">${RESTAURANT.address} | TEL: <a href="tel:${RESTAURANT.phone}" style="color: #fff; text-decoration: none;">${RESTAURANT.phone}</a></p>
    <p style="margin-bottom: 16px;">営業時間: ${RESTAURANT.hours}（定休日: ${RESTAURANT.closedDay}）</p>
    <div style="display: flex; justify-content: center; gap: 20px; margin-bottom: 20px;">
      <a href="${RESTAURANT.instagram}" target="_blank" rel="noopener noreferrer" style="color: #ddd; text-decoration: none;">Instagram</a>
      <a href="${RESTAURANT.googleMaps}" target="_blank" rel="noopener noreferrer" style="color: #ddd; text-decoration: none;">Google マップ</a>
      <a href="/privacy-policy" style="color: #ddd; text-decoration: none;">プライバシーポリシー</a>
      <a href="/refund-policy" style="color: #ddd; text-decoration: none;">返金・キャンセルポリシー</a>
    </div>
    <p style="font-size: 0.85rem; margin: 0;">&copy; 2026 Kalpna. All Rights Reserved.</p>
  </div>
</footer>
`;

const pages = [
  {
    path: '',
    canonical: 'https://kalpnacurry.com/',
    title: 'Kalpna (カルプナ) | 熊谷の本格インド料理',
    description: '埼玉・熊谷の本格インド料理店カルプナ。ランチ、テイクアウト、グランドメニューをご案内します。備長炭タンドール窯で焼き上げるナンと、本場スパイスカレーをお楽しみください。',
    content: `
      ${commonHeader}
      <main>
        <section class="home-hero" style="position: relative; padding: 80px 20px; background: #2a2321; color: #fff; text-align: center;">
          <div class="hero-tag" style="color: #f59e0b; font-weight: bold; margin-bottom: 12px; letter-spacing: 1px;">埼玉・熊谷で味わう、本場のインド料理</div>
          <h1 class="hero-title" style="font-size: 2.5rem; margin-bottom: 16px;">Kalpna (カルプナ) - 熊谷の本格インド料理</h1>
          <p class="hero-sub" style="font-size: 1.1rem; max-width: 700px; margin: 0 auto 30px; line-height: 1.7; opacity: 0.9;">
            愛とスパイス、そして伝統に彩られた数世紀にわたるレシピを。<br />
            Kalpna Indian Cuisineで皆様をお待ちしております。
          </p>
          <div style="display: flex; justify-content: center; gap: 16px; flex-wrap: wrap;">
            <a href="/menu/lunch" style="background-color: #c75626; color: white; padding: 12px 24px; border-radius: 6px; text-decoration: none; font-weight: bold;">ランチメニューを見る</a>
            <a href="/menu/takeout" style="background-color: transparent; border: 2px solid #fff; color: white; padding: 12px 24px; border-radius: 6px; text-decoration: none; font-weight: bold;">テイクアウトを注文</a>
          </div>
        </section>

        <section style="padding: 60px 20px; max-width: 1100px; margin: 0 auto;">
          <h2 style="font-size: 2rem; color: #2a2321; text-align: center; margin-bottom: 30px;">メニューのご案内</h2>
          <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(280px, 1fr)); gap: 24px; margin-bottom: 40px;">
            <div style="background: #faf7f2; border: 1px solid #e8e0d5; border-radius: 12px; padding: 24px;">
              <h3 style="font-size: 1.4rem; color: #c75626; margin-top: 0;">ランチメニュー (Lunch)</h3>
              <p style="color: #555; line-height: 1.6;">お得なセットメニュー。ナンまたはライスのおかわり無料サービス付き。</p>
              <ul style="list-style: none; padding: 0; margin: 16px 0; color: #333;">
                <li style="display: flex; justify-content: space-between; padding: 6px 0; border-bottom: 1px dashed #ddd;">
                  <span>ランチセット A (カレー1種・ナン/ライス・サラダ)</span>
                  <strong style="color: #c75626;">¥950</strong>
                </li>
                <li style="display: flex; justify-content: space-between; padding: 6px 0; border-bottom: 1px dashed #ddd;">
                  <span>チーズナンランチセット</span>
                  <strong style="color: #c75626;">¥1,150</strong>
                </li>
                <li style="display: flex; justify-content: space-between; padding: 6px 0;">
                  <span>バターチキンカレーランチ</span>
                  <strong style="color: #c75626;">¥1,200</strong>
                </li>
              </ul>
              <a href="/menu/lunch" style="color: #c75626; font-weight: bold; text-decoration: none;">▶ ランチメニュー一覧を見る</a>
            </div>

            <div style="background: #faf7f2; border: 1px solid #e8e0d5; border-radius: 12px; padding: 24px;">
              <h3 style="font-size: 1.4rem; color: #c75626; margin-top: 0;">テイクアウトメニュー (Takeout)</h3>
              <p style="color: #555; line-height: 1.6;">ご自宅や職場で本格インドカレー。店頭受取のご注文を承っております。</p>
              <ul style="list-style: none; padding: 0; margin: 16px 0; color: #333;">
                <li style="display: flex; justify-content: space-between; padding: 6px 0; border-bottom: 1px dashed #ddd;">
                  <span>バターチキンカレー (テイクアウト)</span>
                  <strong style="color: #c75626;">¥1,200</strong>
                </li>
                <li style="display: flex; justify-content: space-between; padding: 6px 0; border-bottom: 1px dashed #ddd;">
                  <span>キーマカレー (テイクアウト)</span>
                  <strong style="color: #c75626;">¥1,100</strong>
                </li>
                <li style="display: flex; justify-content: space-between; padding: 6px 0;">
                  <span>チーズナン (テイクアウト)</span>
                  <strong style="color: #c75626;">¥550</strong>
                </li>
              </ul>
              <a href="/menu/takeout" style="color: #c75626; font-weight: bold; text-decoration: none;">▶ テイクアウトメニュー一覧を見る</a>
            </div>

            <div style="background: #faf7f2; border: 1px solid #e8e0d5; border-radius: 12px; padding: 24px;">
              <h3 style="font-size: 1.4rem; color: #c75626; margin-top: 0;">グランドメニュー (Grand Menu)</h3>
              <p style="color: #555; line-height: 1.6;">ディナーやアラカルトに。備長炭タンドール料理や多彩なカレーをご用意。</p>
              <ul style="list-style: none; padding: 0; margin: 16px 0; color: #333;">
                <li style="display: flex; justify-content: space-between; padding: 6px 0; border-bottom: 1px dashed #ddd;">
                  <span>バターチキンカレー</span>
                  <strong style="color: #c75626;">¥1,200</strong>
                </li>
                <li style="display: flex; justify-content: space-between; padding: 6px 0; border-bottom: 1px dashed #ddd;">
                  <span>ガーリックナン</span>
                  <strong style="color: #c75626;">¥400</strong>
                </li>
                <li style="display: flex; justify-content: space-between; padding: 6px 0;">
                  <span>タンドリーチキン</span>
                  <strong style="color: #c75626;">¥600</strong>
                </li>
              </ul>
              <a href="/menu/grand" style="color: #c75626; font-weight: bold; text-decoration: none;">▶ グランドメニュー一覧を見る</a>
            </div>
          </div>
        </section>

        <section id="locations" style="padding: 60px 20px; background-color: #faf7f2;">
          <div style="max-width: 1100px; margin: 0 auto;">
            <h2 style="font-size: 2rem; color: #2a2321; text-align: center; margin-bottom: 30px;">店舗情報・アクセス</h2>
            <div style="background: white; border-radius: 12px; padding: 32px; box-shadow: 0 4px 20px rgba(0,0,0,0.06); max-width: 700px; margin: 0 auto;">
              <h3 style="font-size: 1.5rem; color: #2a2321; margin-top: 0; margin-bottom: 16px;">本格インド料理 Kalpna (カルプナ)</h3>
              <dl style="display: grid; grid-template-columns: 120px 1fr; gap: 12px; line-height: 1.6; color: #333; margin: 0;">
                <dt style="font-weight: bold; color: #666;">住所</dt>
                <dd style="margin: 0;">${RESTAURANT.address}</dd>
                <dt style="font-weight: bold; color: #666;">電話番号</dt>
                <dd style="margin: 0;"><a href="tel:${RESTAURANT.phone}" style="color: #c75626; font-weight: bold; text-decoration: none;">${RESTAURANT.phone}</a></dd>
                <dt style="font-weight: bold; color: #666;">営業時間</dt>
                <dd style="margin: 0;">
                  ランチ: 11:30～15:00<br />
                  ディナー: 17:00～22:00
                </dd>
                <dt style="font-weight: bold; color: #666;">定休日</dt>
                <dd style="margin: 0; color: #c75626; font-weight: bold;">${RESTAURANT.closedDay}</dd>
                <dt style="font-weight: bold; color: #666;">料理ジャンル</dt>
                <dd style="margin: 0;">${RESTAURANT.cuisine}</dd>
                <dt style="font-weight: bold; color: #666;">ご予算</dt>
                <dd style="margin: 0;">ランチ ¥950～¥1,500 / ディナー ¥1,500～¥2,500</dd>
              </dl>
              <div style="margin-top: 24px; text-align: center;">
                <a href="${RESTAURANT.googleMaps}" target="_blank" rel="noopener noreferrer" style="display: inline-block; background-color: #c75626; color: white; padding: 12px 28px; border-radius: 6px; text-decoration: none; font-weight: bold;">
                  Google マップで地図を見る
                </a>
              </div>
            </div>
          </div>
        </section>
      </main>
      ${commonFooter}
    `
  },
  {
    path: 'menu/lunch',
    canonical: 'https://kalpnacurry.com/menu/lunch',
    title: 'ランチメニュー | Kalpna (カルプナ)',
    description: '熊谷の本格インド料理店カルプナのランチメニュー。お得なカレーセット、チーズナンセット、焼きたてナン・ライスのおかわり無料サービスをご案内します。',
    content: `
      ${commonHeader}
      <main>
        <section style="position: relative; padding: 60px 20px; background: #2a2321; color: #fff; text-align: center;">
          <div style="color: #f59e0b; font-weight: bold; margin-bottom: 8px;">LUNCH MENU</div>
          <h1 style="font-size: 2.4rem; margin: 0 0 16px;">ランチメニュー (Lunch Menu)</h1>
          <p style="opacity: 0.9; max-width: 600px; margin: 0 auto;">平日・土日祝もランチ営業中。ナン・ライスのおかわり無料！辛さもお好みでお選びいただけます。</p>
        </section>

        <section style="padding: 50px 20px; max-width: 1000px; margin: 0 auto;">
          <h2 style="font-size: 1.8rem; color: #2a2321; margin-bottom: 24px; border-bottom: 2px solid #c75626; padding-bottom: 8px;">お得なランチセット</h2>
          <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(280px, 1fr)); gap: 20px; margin-bottom: 40px;">
            <article style="background: #faf7f2; border: 1px solid #e8e0d5; border-radius: 10px; padding: 20px;">
              <h3 style="font-size: 1.3rem; color: #2a2321; margin: 0 0 8px;">ランチセット A</h3>
              <p style="color: #666; font-size: 0.95rem; margin-bottom: 12px;">お好みのカレー1種、プレーンナンまたはライス、ミニサラダ付き。</p>
              <div style="font-size: 1.4rem; font-weight: bold; color: #c75626;">¥950</div>
            </article>
            <article style="background: #faf7f2; border: 1px solid #e8e0d5; border-radius: 10px; padding: 20px;">
              <h3 style="font-size: 1.3rem; color: #2a2321; margin: 0 0 8px;">チーズナンランチセット</h3>
              <p style="color: #666; font-size: 0.95rem; margin-bottom: 12px;">とろ〜り溢れるチーズナン、お好みのカレー、ミニサラダ付き。当店大人気！</p>
              <div style="font-size: 1.4rem; font-weight: bold; color: #c75626;">¥1,150</div>
            </article>
            <article style="background: #faf7f2; border: 1px solid #e8e0d5; border-radius: 10px; padding: 20px;">
              <h3 style="font-size: 1.3rem; color: #2a2321; margin: 0 0 8px;">ダブルカレーランチセット</h3>
              <p style="color: #666; font-size: 0.95rem; margin-bottom: 12px;">日替わりカレーとお好きなカレーの2種盛り合わせ。ナンまたはライス、サラダ付き。</p>
              <div style="font-size: 1.4rem; font-weight: bold; color: #c75626;">¥1,050</div>
            </article>
            <article style="background: #faf7f2; border: 1px solid #e8e0d5; border-radius: 10px; padding: 20px;">
              <h3 style="font-size: 1.3rem; color: #2a2321; margin: 0 0 8px;">バターチキンカレーランチ</h3>
              <p style="color: #666; font-size: 0.95rem; margin-bottom: 12px;">トマトとバターのリッチなコクが広がる特製チキンカレー、ナンまたはライス、サラダ付き。</p>
              <div style="font-size: 1.4rem; font-weight: bold; color: #c75626;">¥1,200</div>
            </article>
          </div>

          <div style="background: #fff; border: 1px solid #e5dbcd; border-radius: 10px; padding: 24px; text-align: center;">
            <h3 style="margin-top: 0; color: #2a2321;">その他のメニューもご覧ください</h3>
            <div style="display: flex; justify-content: center; gap: 16px; margin-top: 16px; flex-wrap: wrap;">
              <a href="/menu/takeout" style="color: #c75626; font-weight: bold; text-decoration: none;">テイクアウトメニューを見る &rarr;</a>
              <a href="/menu/grand" style="color: #c75626; font-weight: bold; text-decoration: none;">グランドメニューを見る &rarr;</a>
            </div>
          </div>
        </section>
      </main>
      ${commonFooter}
    `
  },
  {
    path: 'menu/takeout',
    canonical: 'https://kalpnacurry.com/menu/takeout',
    title: 'テイクアウトメニュー | Kalpna (カルプナ)',
    description: '熊谷の本格インド料理店カルプナのテイクアウトメニュー。お電話（048-514-8386）またはオンラインで事前注文、店頭で出来立てをお持ち帰りいただけます。',
    content: `
      ${commonHeader}
      <main>
        <section style="position: relative; padding: 60px 20px; background: #2a2321; color: #fff; text-align: center;">
          <div style="color: #f59e0b; font-weight: bold; margin-bottom: 8px;">TAKEOUT MENU</div>
          <h1 style="font-size: 2.4rem; margin: 0 0 16px;">テイクアウトメニュー (Takeout Menu)</h1>
          <p style="opacity: 0.9; max-width: 600px; margin: 0 auto;">ご自宅や職場で本格インドカレーをお楽しみください。お電話・WEB事前予約受付中。</p>
        </section>

        <section style="padding: 50px 20px; max-width: 1000px; margin: 0 auto;">
          <h2 style="font-size: 1.8rem; color: #2a2321; margin-bottom: 24px; border-bottom: 2px solid #c75626; padding-bottom: 8px;">テイクアウト商品一覧</h2>
          <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(280px, 1fr)); gap: 20px; margin-bottom: 40px;">
            <article style="background: #faf7f2; border: 1px solid #e8e0d5; border-radius: 10px; padding: 20px;">
              <h3 style="font-size: 1.3rem; color: #2a2321; margin: 0 0 8px;">バターチキンカレー</h3>
              <p style="color: #666; font-size: 0.95rem; margin-bottom: 12px;">トマトベースの濃厚でコクのあるクリーミーなチキンカレー。</p>
              <div style="font-size: 1.4rem; font-weight: bold; color: #c75626;">¥1,200</div>
            </article>
            <article style="background: #faf7f2; border: 1px solid #e8e0d5; border-radius: 10px; padding: 20px;">
              <h3 style="font-size: 1.3rem; color: #2a2321; margin: 0 0 8px;">キーマカレー</h3>
              <p style="color: #666; font-size: 0.95rem; margin-bottom: 12px;">スパイス香る挽肉の旨味たっぷりキーマカレー。</p>
              <div style="font-size: 1.4rem; font-weight: bold; color: #c75626;">¥1,100</div>
            </article>
            <article style="background: #faf7f2; border: 1px solid #e8e0d5; border-radius: 10px; padding: 20px;">
              <h3 style="font-size: 1.3rem; color: #2a2321; margin: 0 0 8px;">チーズナン</h3>
              <p style="color: #666; font-size: 0.95rem; margin-bottom: 12px;">とろ〜り溶け出すたっぷりチーズの本格窯焼きナン。</p>
              <div style="font-size: 1.4rem; font-weight: bold; color: #c75626;">¥550</div>
            </article>
            <article style="background: #faf7f2; border: 1px solid #e8e0d5; border-radius: 10px; padding: 20px;">
              <h3 style="font-size: 1.3rem; color: #2a2321; margin: 0 0 8px;">ガーリックナン</h3>
              <p style="color: #666; font-size: 0.95rem; margin-bottom: 12px;">香ばしいガーリックをトッピングした風味豊かなナン。</p>
              <div style="font-size: 1.4rem; font-weight: bold; color: #c75626;">¥400</div>
            </article>
            <article style="background: #faf7f2; border: 1px solid #e8e0d5; border-radius: 10px; padding: 20px;">
              <h3 style="font-size: 1.3rem; color: #2a2321; margin: 0 0 8px;">プレーンナン</h3>
              <p style="color: #666; font-size: 0.95rem; margin-bottom: 12px;">備長炭タンドール窯で焼き上げたふっくらモチモチの定番ナン。</p>
              <div style="font-size: 1.4rem; font-weight: bold; color: #c75626;">¥350</div>
            </article>
            <article style="background: #faf7f2; border: 1px solid #e8e0d5; border-radius: 10px; padding: 20px;">
              <h3 style="font-size: 1.3rem; color: #2a2321; margin: 0 0 8px;">タンドリーチキン (2P)</h3>
              <p style="color: #666; font-size: 0.95rem; margin-bottom: 12px;">自家製スパイスとヨーグルトに漬け込み、土窯で香ばしく焼き上げました。</p>
              <div style="font-size: 1.4rem; font-weight: bold; color: #c75626;">¥600</div>
            </article>
          </div>

          <div style="background: #faf7f2; border: 1px solid #e8e0d5; border-radius: 12px; padding: 24px; text-align: center;">
            <h3 style="color: #2a2321; margin-top: 0;">お電話でのご注文・お受け取り</h3>
            <p style="color: #555;">お電話で受取時間をご指定いただければ、出来立て熱々をご用意いたします。</p>
            <p style="font-size: 1.5rem; font-weight: bold; color: #c75626; margin: 12px 0;">TEL: <a href="tel:${RESTAURANT.phone}" style="color: inherit; text-decoration: none;">${RESTAURANT.phone}</a></p>
            <p style="color: #777; font-size: 0.9rem; margin-bottom: 0;">受取場所: ${RESTAURANT.address}</p>
          </div>
        </section>
      </main>
      ${commonFooter}
    `
  },
  {
    path: 'menu/grand',
    canonical: 'https://kalpnacurry.com/menu/grand',
    title: 'グランドメニュー | Kalpna (カルプナ)',
    description: '熊谷の本格インド料理店カルプナのグランドメニュー。本場仕込みのチキン・マトン・シーフードカレー、備長炭タンドール料理、ビリヤニ、焼きたてナンをご案内します。',
    content: `
      ${commonHeader}
      <main>
        <section style="position: relative; padding: 60px 20px; background: #2a2321; color: #fff; text-align: center;">
          <div style="color: #f59e0b; font-weight: bold; margin-bottom: 8px;">GRAND MENU</div>
          <h1 style="font-size: 2.4rem; margin: 0 0 16px;">グランドメニュー (Grand Menu)</h1>
          <p style="opacity: 0.9; max-width: 600px; margin: 0 auto;">熟練シェフが30種以上のスパイスを操り、本格タンドール窯で仕上げる極上の一皿。</p>
        </section>

        <section style="padding: 50px 20px; max-width: 1000px; margin: 0 auto;">
          <h2 style="font-size: 1.8rem; color: #2a2321; margin-bottom: 24px; border-bottom: 2px solid #c75626; padding-bottom: 8px;">カレー &amp; ナン・アラカルト</h2>
          <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(280px, 1fr)); gap: 20px; margin-bottom: 40px;">
            <article style="background: #faf7f2; border: 1px solid #e8e0d5; border-radius: 10px; padding: 20px;">
              <h3 style="font-size: 1.3rem; color: #2a2321; margin: 0 0 8px;">バターチキンカレー</h3>
              <p style="color: #666; font-size: 0.95rem; margin-bottom: 12px;">トマトベースの濃厚でコクのあるクリーミーなチキンカレー。</p>
              <div style="font-size: 1.4rem; font-weight: bold; color: #c75626;">¥1,200</div>
            </article>
            <article style="background: #faf7f2; border: 1px solid #e8e0d5; border-radius: 10px; padding: 20px;">
              <h3 style="font-size: 1.3rem; color: #2a2321; margin: 0 0 8px;">キーマカレー</h3>
              <p style="color: #666; font-size: 0.95rem; margin-bottom: 12px;">スパイス香る挽肉の旨味たっぷりキーマカレー。</p>
              <div style="font-size: 1.4rem; font-weight: bold; color: #c75626;">¥1,100</div>
            </article>
            <article style="background: #faf7f2; border: 1px solid #e8e0d5; border-radius: 10px; padding: 20px;">
              <h3 style="font-size: 1.3rem; color: #2a2321; margin: 0 0 8px;">マトンマサラ</h3>
              <p style="color: #666; font-size: 0.95rem; margin-bottom: 12px;">柔らかく煮込んだ羊肉の深いコクとスパイスの芳醇な香り。</p>
              <div style="font-size: 1.4rem; font-weight: bold; color: #c75626;">¥1,250</div>
            </article>
            <article style="background: #faf7f2; border: 1px solid #e8e0d5; border-radius: 10px; padding: 20px;">
              <h3 style="font-size: 1.3rem; color: #2a2321; margin: 0 0 8px;">サグチキンカレー</h3>
              <p style="color: #666; font-size: 0.95rem; margin-bottom: 12px;">新鮮なほうれん草ペーストとチキンの風味豊かなヘルシーカレー。</p>
              <div style="font-size: 1.4rem; font-weight: bold; color: #c75626;">¥1,150</div>
            </article>
            <article style="background: #faf7f2; border: 1px solid #e8e0d5; border-radius: 10px; padding: 20px;">
              <h3 style="font-size: 1.3rem; color: #2a2321; margin: 0 0 8px;">チーズナン</h3>
              <p style="color: #666; font-size: 0.95rem; margin-bottom: 12px;">とろ〜り溶け出すたっぷりチーズの本格ナン。</p>
              <div style="font-size: 1.4rem; font-weight: bold; color: #c75626;">¥550</div>
            </article>
            <article style="background: #faf7f2; border: 1px solid #e8e0d5; border-radius: 10px; padding: 20px;">
              <h3 style="font-size: 1.3rem; color: #2a2321; margin: 0 0 8px;">タンドリーチキン</h3>
              <p style="color: #666; font-size: 0.95rem; margin-bottom: 12px;">土窯でじっくりジューシーに焼き上げた本格骨付きチキン。</p>
              <div style="font-size: 1.4rem; font-weight: bold; color: #c75626;">¥600</div>
            </article>
          </div>

          <div style="background: #fff; border: 1px solid #e5dbcd; border-radius: 10px; padding: 24px; text-align: center;">
            <div style="display: flex; justify-content: center; gap: 16px; flex-wrap: wrap;">
              <a href="/menu/lunch" style="color: #c75626; font-weight: bold; text-decoration: none;">&larr; ランチメニューを見る</a>
              <a href="/menu/takeout" style="color: #c75626; font-weight: bold; text-decoration: none;">テイクアウトメニューを見る &rarr;</a>
            </div>
          </div>
        </section>
      </main>
      ${commonFooter}
    `
  },
  {
    path: 'about',
    canonical: 'https://kalpnacurry.com/about',
    title: '私たちについて | Kalpna (カルプナ)',
    description: '熊谷の本格インド料理店カルプナの物語。店名「Kalpna」に込めた想い、直輸入スパイスのこだわり、備長炭タンドール窯、シェフをご紹介します。',
    content: `
      ${commonHeader}
      <main>
        <section style="position: relative; padding: 60px 20px; background: #2a2321; color: #fff; text-align: center;">
          <div style="color: #f59e0b; font-weight: bold; margin-bottom: 8px;">ABOUT US</div>
          <h1 style="font-size: 2.4rem; margin: 0 0 16px;">私たちについて (About Us)</h1>
          <p style="opacity: 0.9; max-width: 600px; margin: 0 auto;">本場インドの豊かな食文化と真心を、埼玉・熊谷の皆様へ。</p>
        </section>

        <section style="padding: 50px 20px; max-width: 900px; margin: 0 auto; line-height: 1.8; color: #333;">
          <h2 style="font-size: 1.8rem; color: #2a2321; border-bottom: 2px solid #c75626; padding-bottom: 8px; margin-bottom: 20px;">店名「Kalpna（カルプナ）」に込めた想い</h2>
          <p>
            Kalpna（カルプナ）は、サンスクリット語で「想像」や「創造」を意味します。<br />
            私たちは、インドの伝統的なスパイスと製法を守りながら、日本の皆さまの味覚に寄り添う新しいインディアン・ダイニングを創造しています。
          </p>
          <p>
            本場インドのホテルで腕を磨いたシェフが、厳選された数十種類のスパイスを巧みにブレンド。<br />
            特注のタンドール（土窯）で焼き上げる備長炭の香ばしいナンやタンドリーチキンは、多くのお客様に愛されています。
          </p>

          <h2 style="font-size: 1.8rem; color: #2a2321; border-bottom: 2px solid #c75626; padding-bottom: 8px; margin: 40px 0 20px;">命を吹き込む、スパイスのこだわり</h2>
          <p>
            カレーの味の決め手となるスパイスは、インドから直接取り寄せた最高品質のものを使用しています。<br />
            クミン、コリアンダー、ターメリック、カルダモン... それぞれのスパイスが持つ薬効や香りを最大限に引き出すため、独自に配合し、挽きたてを使用しています。
          </p>

          <div style="background: #faf7f2; border: 1px solid #e8e0d5; border-radius: 12px; padding: 24px; margin-top: 40px;">
            <h3 style="margin-top: 0; color: #2a2321;">店舗案内</h3>
            <p style="margin: 0;">${RESTAURANT.name}<br />住所: ${RESTAURANT.address}<br />電話: ${RESTAURANT.phone}<br />営業時間: ${RESTAURANT.hours}（定休日: ${RESTAURANT.closedDay}）</p>
          </div>
        </section>
      </main>
      ${commonFooter}
    `
  },
  {
    path: 'contact',
    canonical: 'https://kalpnacurry.com/contact',
    title: 'お問い合わせ | Kalpna (カルプナ)',
    description: '熊谷の本格インド料理店カルプナへのお問い合わせ・ご予約・アクセス。住所・電話番号（048-514-8386）・地図をご確認いただけます。',
    content: `
      ${commonHeader}
      <main>
        <section style="position: relative; padding: 60px 20px; background: #2a2321; color: #fff; text-align: center;">
          <div style="color: #f59e0b; font-weight: bold; margin-bottom: 8px;">CONTACT US</div>
          <h1 style="font-size: 2.4rem; margin: 0 0 16px;">お問い合わせ (Contact Us)</h1>
          <p style="opacity: 0.9; max-width: 600px; margin: 0 auto;">ご予約、貸し切りのご相談、テイクアウトのお問い合わせはお電話にて承っております。</p>
        </section>

        <section style="padding: 50px 20px; max-width: 900px; margin: 0 auto;">
          <div style="background: white; border-radius: 12px; padding: 32px; box-shadow: 0 4px 20px rgba(0,0,0,0.06); margin-bottom: 30px;">
            <h2 style="font-size: 1.6rem; color: #2a2321; margin-top: 0; margin-bottom: 20px;">店舗情報・ご連絡先</h2>
            <dl style="display: grid; grid-template-columns: 120px 1fr; gap: 14px; line-height: 1.6; color: #333; margin: 0;">
              <dt style="font-weight: bold; color: #666;">店舗名</dt>
              <dd style="margin: 0; font-weight: bold;">${RESTAURANT.name}</dd>
              <dt style="font-weight: bold; color: #666;">住所</dt>
              <dd style="margin: 0;">${RESTAURANT.address}</dd>
              <dt style="font-weight: bold; color: #666;">電話番号</dt>
              <dd style="margin: 0;"><a href="tel:${RESTAURANT.phone}" style="color: #c75626; font-weight: bold; font-size: 1.2rem; text-decoration: none;">${RESTAURANT.phone}</a></dd>
              <dt style="font-weight: bold; color: #666;">営業時間</dt>
              <dd style="margin: 0;">${RESTAURANT.hours}</dd>
              <dt style="font-weight: bold; color: #666;">定休日</dt>
              <dd style="margin: 0; color: #c75626; font-weight: bold;">${RESTAURANT.closedDay}</dd>
            </dl>
            <div style="margin-top: 24px;">
              <a href="${RESTAURANT.googleMaps}" target="_blank" rel="noopener noreferrer" style="display: inline-block; background-color: #c75626; color: white; padding: 12px 24px; border-radius: 6px; text-decoration: none; font-weight: bold;">
                Google マップでルート案内を見る
              </a>
            </div>
          </div>
        </section>
      </main>
      ${commonFooter}
    `
  }
];

function generateHtml(page) {
  let html = baseHtml;

  // Replace title
  html = html.replace(/<title>.*?<\/title>/, `<title>${page.title}</title>`);
  
  // Replace description
  html = html.replace(/<meta name="description" content=".*?" \/>/, `<meta name="description" content="${page.description}" />`);

  // Replace canonical
  if (html.includes('<link rel="canonical"')) {
    html = html.replace(/<link rel="canonical" href=".*?" \/>/, `<link rel="canonical" href="${page.canonical}" />`);
  } else {
    html = html.replace('</head>', `  <link rel="canonical" href="${page.canonical}" />\n</head>`);
  }

  // Replace Open Graph metadata
  html = html.replace(/<meta property="og:url" content=".*?" \/>/, `<meta property="og:url" content="${page.canonical}" />`);
  html = html.replace(/<meta property="og:title" content=".*?" \/>/, `<meta property="og:title" content="${page.title}" />`);
  html = html.replace(/<meta property="og:description" content=".*?" \/>/, `<meta property="og:description" content="${page.description}" />`);

  // Replace Twitter metadata
  html = html.replace(/<meta name="twitter:title" content=".*?" \/>/, `<meta name="twitter:title" content="${page.title}" />`);
  html = html.replace(/<meta name="twitter:description" content=".*?" \/>/, `<meta name="twitter:description" content="${page.description}" />`);

  // For subpages, keep Restaurant JSON-LD strictly on the homepage as requested in Task 4,
  // and inject BreadcrumbList structured data for search engine & AI SEO hierarchy.
  if (page.path !== '') {
    html = html.replace(/<!-- Restaurant Structured Data \(JSON-LD\) -->[\s\S]*?<\/script>\n?/i, '');
    html = html.replace(/<!-- FAQ Structured Data for AI Engines & Search \(AI SEO \/ GEO\) -->[\s\S]*?<\/script>\n?/i, '');

    const breadcrumbsJson = {
      "@context": "https://schema.org",
      "@type": "BreadcrumbList",
      "itemListElement": [
        {
          "@type": "ListItem",
          "position": 1,
          "name": "ホーム",
          "item": "https://kalpnacurry.com/"
        },
        {
          "@type": "ListItem",
          "position": 2,
          "name": page.title.split(' | ')[0],
          "item": page.canonical
        }
      ]
    };
    const breadcrumbsTag = `  <script type="application/ld+json">\n  ${JSON.stringify(breadcrumbsJson, null, 2)}\n  </script>\n</head>`;
    html = html.replace('</head>', breadcrumbsTag);
  }

  // Replace #root inner content
  const rootRegex = /<div id="root">([\s\S]*?)<\/div>/;
  html = html.replace(rootRegex, `<div id="root">${page.content}</div>`);

  return html;
}

console.log('Generating pre-rendered HTML files...');

for (const page of pages) {
  const targetDir = page.path ? path.join(distDir, page.path) : distDir;
  fs.mkdirSync(targetDir, { recursive: true });
  const targetFile = path.join(targetDir, 'index.html');
  const rendered = generateHtml(page);
  fs.writeFileSync(targetFile, rendered, 'utf8');
  console.log(`✓ Generated ${targetFile.replace(distDir, 'dist')}`);
}

// Copy public assets if missing in dist
const publicRobots = path.join(webRoot, 'public/robots.txt');
const publicSitemap = path.join(webRoot, 'public/sitemap.xml');
const publicLlms = path.join(webRoot, 'public/llms.txt');
if (fs.existsSync(publicRobots)) {
  fs.copyFileSync(publicRobots, path.join(distDir, 'robots.txt'));
}
if (fs.existsSync(publicSitemap)) {
  fs.copyFileSync(publicSitemap, path.join(distDir, 'sitemap.xml'));
}
if (fs.existsSync(publicLlms)) {
  fs.copyFileSync(publicLlms, path.join(distDir, 'llms.txt'));
}

// Sync dist files to public_html so deployment is in sync
if (fs.existsSync(publicHtmlDir)) {
  console.log('Syncing dist to public_html...');
  // Copy directory recursively
  fs.cpSync(distDir, publicHtmlDir, { recursive: true });
  console.log('✓ Successfully synced dist to public_html');
}

console.log('Pre-rendering complete.');
