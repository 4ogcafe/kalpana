import { PrismaClient, MenuType, Role } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  console.log('Start seeding...');

  // 1. Create Admin User
  let admin = await prisma.user.findUnique({ where: { email: 'admin@example.com' } });
  if (!admin) {
    admin = await prisma.user.create({
      data: {
        email: 'admin@example.com',
        passwordHash: '$2a$10$7b/C9W/d5z/7jCqR4N/.4.4g5bX/Tz/4r/.KqjY./r1g2L/G/.R/.', // "admin123"
        name: 'Kalpana Admin',
        role: Role.ADMIN,
      },
    });
  }
  console.log(`Created admin user with id: ${admin.id}`);

  // 2. Create Categories
  const catChicken = await prisma.category.create({ data: { nameEn: 'Chicken Curries', nameJa: 'チキンカレー', sortOrder: 1 } });
  const catMutton = await prisma.category.create({ data: { nameEn: 'Mutton Curries', nameJa: 'マトンカレー', sortOrder: 2 } });
  const catBread = await prisma.category.create({ data: { nameEn: 'Breads (Naan)', nameJa: 'ナン', sortOrder: 3 } });
  const catLunch = await prisma.category.create({ data: { nameEn: 'Lunch Sets', nameJa: 'ランチセット', sortOrder: 4 } });
  console.log('Created categories');

  // 3. Create Menu Items
  await prisma.menuItem.create({
    data: { categoryId: catChicken.id, nameEn: 'Butter Chicken Curry', nameJa: 'バターチキンカレー', descriptionEn: 'Creamy and rich tomato based chicken curry', price: 1200, spiceLevel: 1, menuTypes: [MenuType.GRAND, MenuType.TAKEOUT] }
  });
  await prisma.menuItem.create({
    data: { categoryId: catMutton.id, nameEn: 'Keema Curry', nameJa: 'キーマカレー', descriptionEn: 'Minced mutton curry with peas', price: 1100, spiceLevel: 3, menuTypes: [MenuType.GRAND] }
  });
  await prisma.menuItem.create({
    data: { categoryId: catBread.id, nameEn: 'Garlic Naan', nameJa: 'ガーリックナン', descriptionEn: 'Naan topped with fresh garlic and cilantro', price: 400, spiceLevel: 0, menuTypes: [MenuType.GRAND, MenuType.TAKEOUT] }
  });
  await prisma.menuItem.create({
    data: { categoryId: catLunch.id, nameEn: 'Lunch Set A', nameJa: 'ランチセット A', descriptionEn: 'One curry of your choice, plain naan, and mini salad', price: 950, spiceLevel: 0, menuTypes: [MenuType.LUNCH] }
  });
  console.log('Created menu items');

  // 4. Create Settings
  await prisma.settings.create({
    data: {
      name: 'Kalpana Indian Cuisine',
      addressEn: 'Kumagaya, Saitama, Japan',
      addressJa: '埼玉県熊谷市',
      lat: 36.1473,
      lng: 139.3886,
      phone: '048-XXX-XXXX',
      email: 'info@kalpana.com',
      weeklyHours: { monday: "11:00-15:00, 17:00-22:00" },
      holidays: { regular: "Tuesday" },
      socials: { instagram: "@kalpana_restro" }
    }
  });
  console.log('Created settings');

  console.log('Seeding finished.');
}

main()
  .then(async () => {
    await prisma.$disconnect();
  })
  .catch(async (e) => {
    console.error(e);
    await prisma.$disconnect();
    process.exit(1);
  });
