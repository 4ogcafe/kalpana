/**
 * One-time patch: updates the "私たちの物語" section with new content.
 * Run with:  npx tsx prisma/patch-about-content.ts
 */
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

const NEW_STORY_TITLE = '本場インドの味を支える、5つのこだわり';

const NEW_STORY_JA = [
  'カルプナでは、本場インドの伝統と豊かな食文化を大切にしながら、日本の皆さまに本格的なインド料理をお届けしています。',
  '新鮮な食材、厳選したスパイス、炭火で焼き上げる香ばしいナンやタンドリー料理、そして経験豊富なシェフの技と情熱。一皿一皿にこだわりを込め、「おいしい」「また食べたい」と感じていただける料理を目指しています。',
  '味・品質・価格・おもてなしを大切にし、皆さまに心からご満足いただけるお店でありたいと考えています。',
  'ここでは、カルプナが大切にしている5つのこだわりをご紹介します。',
].join('\n');

const EXT_UPDATE = {
  aboutStoryPillar1TitleJa: '高品質な料理をお手頃価格で',
  aboutStoryPillar1DescJa: '新鮮で高品質な食材を使用し、味と健康の両立を大切にしています。本格的なインド料理を、品質と価格のバランスにこだわりながら、より多くのお客さまに気軽にお楽しみいただけるよう努めています。',
  aboutStoryPillar2TitleJa: '本格的な味の秘密はタンドールに',
  aboutStoryPillar2DescJa: '伝統的なタンドール（土窯）で薪炭の火でじっくりと焼き上げることで、香ばしい香りと独特の食感が生まれます。火加減や焼き加減にもこだわり、本場インドならではの味わいをお届けします。',
  aboutStoryPillar3TitleJa: '経験豊富なシェフの技と情熱',
  aboutStoryPillar3DescJa: '伝統的な調理技法を大切にしながら、一品一品を丁寧に調理しています。ナン、ビリヤニ、カレー、タンドリー料理まで、それぞれの料理のおいしさを引き出し、皆さまにご満足いただける一皿を目指しています。',
  aboutStoryPillar4TitleJa: 'インドから厳選したスパイス',
  aboutStoryPillar4DescJa: 'スパイスの香りや風味、組み合わせを大切にし、料理ごとにバランスよく調合しています。辛さだけではなく豊かな香りと奥深い味わいを追求し、お好みに合わせて辛さも調整できます。',
  aboutStoryPillar5TitleJa: '創業者 セムワル・プラバットの経験と想い',
  aboutStoryPillar5DescJa: 'インドで10年以上の調理経験を積み、日本の有名インドレストランチェーンで18年間勤務した創業者が、本場インドの伝統的な味わいを日本の皆さまにお届けします。',
  aboutStoryFeaturesBadgeJa: '🌟 当店の5つの特徴 🌟',
  aboutStoryClosingTitleJa: 'カルプナで、心に残るお食事のひとときを',
  aboutStoryClosingTextJa: '本格的なインド料理を、もっと身近に、もっと気軽に。\nご家族やご友人とのお食事はもちろん、お一人でのランチやディナーにも、ぜひお気軽にお越しください。\n皆さまのご来店を、心よりお待ちしております。',
};

async function main() {
  const existing = await prisma.settings.findFirst();
  if (existing) {
    await prisma.settings.update({
      where: { id: existing.id },
      data: {
        aboutStoryTitleJa: NEW_STORY_TITLE,
        aboutStoryJa: NEW_STORY_JA,
        aboutStoryLabelJa: '私たちの物語',
      },
    });
    console.log('✓ settings table updated');
  } else {
    console.warn('No settings record found — run seed.ts first');
  }

  const extRecord = await prisma.appSecret.findUnique({ where: { id: 'PAGE_SETTINGS_EXT' } }).catch(() => null);
  const prev = extRecord?.publicKey ? JSON.parse(extRecord.publicKey) : {};
  const merged = { ...prev, ...EXT_UPDATE };
  await prisma.appSecret.upsert({
    where: { id: 'PAGE_SETTINGS_EXT' },
    create: { id: 'PAGE_SETTINGS_EXT', publicKey: JSON.stringify(merged), privateKey: '' },
    update: { publicKey: JSON.stringify(merged) },
  });
  console.log('✓ PAGE_SETTINGS_EXT updated with new pillar content');
  console.log('Done.');
}

main()
  .catch(e => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());
