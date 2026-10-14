import bcrypt from 'bcryptjs';
import { ObjectId } from 'mongodb';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createApp } from '../src/app.js';
import { isDineInCategory, tableBill } from '../src/lib/dining.js';
import { closeMongo, db } from '../src/lib/mongo.js';
import { prisma } from '../src/lib/prisma.js';

const app = createApp();
const PASSWORD = 'correct horse battery staple';
let adminCookie: string[];
let curryId: string;
let takeoutId: string;

const cookieOf = (res: request.Response) => res.headers['set-cookie'] as unknown as string[];
const staff = (method: 'get' | 'post' | 'put' | 'patch' | 'delete', path: string) => request(app)[method](`/api/v1/dining${path}`).set('Cookie', adminCookie);
const guest = (method: 'get' | 'post', path: string) => request(app)[method](`/api/v1/dining${path}`);
const settings = (body: object) => request(app).put('/api/v1/settings').set('Cookie', adminCookie).send(body).expect(200);

async function newTable(number: string) {
  const res = await staff('post', '/tables').send({ number, seats: 4 }).expect(201);
  return res.body as { id: string; qrToken: string };
}

beforeAll(async () => {
  await db().dropDatabase();
  const now = new Date();
  await db().collection('User').insertOne({
    _id: new ObjectId(), email: 'admin@test.local', name: 'Admin', role: 'ADMIN', isActive: true,
    passwordHash: await bcrypt.hash(PASSWORD, 4), createdAt: now, updatedAt: now,
  });
  adminCookie = cookieOf(await request(app).post('/api/v1/auth/login').send({ email: 'admin@test.local', password: PASSWORD }));
  curryId = (await request(app).post('/api/v1/menu/items').set('Cookie', adminCookie).send({ nameEn: 'Curry', price: 1000, categoryName: 'Curry' }).expect(201)).body.id;
  takeoutId = (await request(app).post('/api/v1/menu/items').set('Cookie', adminCookie).send({ nameEn: 'Bento', price: 800, categoryName: 'Lunch Takeout' }).expect(201)).body.id;
  await settings({ diningEnabled: true, diningSelfOpen: false, diningTargetMinutes: 20 });
});

afterAll(async () => {
  await db().dropDatabase();
  await Promise.all([closeMongo(), prisma.$disconnect()]);
});

describe('dining rules', () => {
  it('leaves takeout-only categories off the table menu', () => {
    expect(isDineInCategory({ nameEn: 'Lunch Takeout Set Items' })).toBe(false);
    expect(isDineInCategory({ nameEn: 'Set', nameJa: 'ディナーテイクアウト' })).toBe(false);
    expect(isDineInCategory({ nameEn: 'Curry', nameJa: 'カレー' })).toBe(true);
  });

  it("follows the admin's choice, and sub-categories follow their parent", () => {
    const takeout = { _id: 'p1', nameEn: 'Takeout', parentId: null };
    const party = { _id: 'p2', nameEn: 'Party', dineIn: false };
    const byId = new Map<string, object>([['p1', takeout], ['p2', party]]);
    expect(isDineInCategory({ nameEn: 'Curry', parentId: 'p1' }, byId)).toBe(false);
    expect(isDineInCategory({ nameEn: 'Curry', parentId: 'p1', dineIn: true }, byId)).toBe(true);
    expect(isDineInCategory({ nameEn: 'Lunch Takeout', dineIn: true })).toBe(true);
    expect(isDineInCategory({ nameEn: 'Platters', parentId: 'p2' }, byId)).toBe(false);
  });

  it('adds up one bill per visit, leaving out cancelled orders', () => {
    const line = { itemId: 'c', nameEn: 'Curry', unitPrice: 1000, quantity: 1, lineTotal: 1000 };
    const bill = tableBill([
      { status: 'COMPLETED', total: 1000, tax: 80, grandTotal: 1080, items: [line] },
      { status: 'READY', total: 2000, tax: 160, grandTotal: 2160, items: [{ ...line, quantity: 2, lineTotal: 2000 }] },
      { status: 'CANCELLED', total: 5000, tax: 400, grandTotal: 5400, items: [line] },
    ]);
    expect(bill).toMatchObject({ orders: 2, subtotal: 3000, tax: 240, total: 3240, ready: 1, inProgress: 0 });
    expect(bill.lines).toEqual([{ nameEn: 'Curry', nameJa: null, unitPrice: 1000, quantity: 3, lineTotal: 3000 }]);
  });
});

describe('QR code address', () => {
  it('saves the website address the QR codes open, and offers network addresses while developing', async () => {
    const base = await staff('get', '/qr-base').expect(200);
    expect(base.body.siteUrl).toBeNull();
    expect(Array.isArray(base.body.lanAddresses)).toBe(true);
    await settings({ publicSiteUrl: 'https://kalpana.example/' });
    expect((await staff('get', '/qr-base')).body.siteUrl).toBe('https://kalpana.example');
    expect((await request(app).put('/api/v1/settings').set('Cookie', adminCookie).send({ publicSiteUrl: 'kalpana.example/menu?x' })).status).toBe(400);
    await settings({ publicSiteUrl: '' });
    expect((await guest('get', '/qr-base')).status).toBe(401);
  });
});

describe('a table visit', () => {
  it('waits for staff to open the table, then takes orders onto one bill and closes after payment', async () => {
    const table = await newTable('5');
    const menu = await guest('get', '/menu').expect(200);
    expect(menu.body.flatMap((group: { items: { id: string }[] }) => group.items.map((item) => item.id))).toEqual([curryId]);
    // An admin can put a takeout category on the table menu after all.
    const categories = (await request(app).get('/api/v1/menu/categories')).body as { id: string; nameEn: string }[];
    const lunchTakeout = categories.find((c) => c.nameEn === 'Lunch Takeout')!;
    await request(app).put(`/api/v1/menu/categories/${lunchTakeout.id}`).set('Cookie', adminCookie).send({ dineIn: true }).expect(200);
    expect((await guest('get', '/menu')).body.flatMap((group: { items: { id: string }[] }) => group.items.map((item) => item.id)).sort()).toEqual([curryId, takeoutId].sort());
    await request(app).put(`/api/v1/menu/categories/${lunchTakeout.id}`).set('Cookie', adminCookie).send({ dineIn: null }).expect(200);
    expect((await request(app).get('/api/v1/menu/categories')).body.find((c: { id: string }) => c.id === lunchTakeout.id).dineIn).toBeNull();

    let view = await guest('get', `/t/${table.qrToken}`).expect(200);
    expect(view.body).toMatchObject({ table: { number: '5' }, session: null });
    expect((await guest('post', `/t/${table.qrToken}/open`)).body.error.code).toBe('TABLE_NOT_OPEN');

    await staff('post', `/tables/${table.id}/open`).send({ guests: 3 }).expect(201);
    view = await guest('get', `/t/${table.qrToken}`).expect(200);
    const sessionId = view.body.session.id;

    const order = (body: object) => guest('post', `/t/${table.qrToken}/orders`).send({ sessionId, ...body });
    expect((await order({ items: [{ itemId: takeoutId, quantity: 1 }] })).body.error.code).toBe('NOT_DINE_IN');
    const first = await order({ items: [{ itemId: curryId, quantity: 2 }], note: 'mild' }).expect(201);
    expect(first.body).toMatchObject({ total: 2000, tax: 160, grandTotal: 2160 });
    await order({ items: [{ itemId: curryId, quantity: 1 }] }).expect(201);
    expect(first.body.session.bill).toMatchObject({ total: 2160 });

    // The kitchen sees it as a dine-in order for table 5.
    const kitchen = await request(app).get('/api/v1/orders/kitchen').set('Cookie', adminCookie).expect(200);
    const ticket = kitchen.body.active.find((o: { number: number }) => o.number === first.body.number);
    expect(ticket).toMatchObject({ fulfillment: 'DINE_IN', tableNumber: '5', customerName: 'Table 5', note: 'mild' });

    // Guests call for the bill; asking twice doesn't add a second call.
    await guest('post', `/t/${table.qrToken}/call`).send({ sessionId, type: 'BILL' }).expect(200);
    await guest('post', `/t/${table.qrToken}/call`).send({ sessionId, type: 'BILL' }).expect(200);
    await guest('post', `/t/${table.qrToken}/call`).send({ sessionId, type: 'WATER' }).expect(200);
    let calls = (await staff('get', '/calls').expect(200)).body;
    expect(calls.map((c: { type: string; tableNumber: string }) => `${c.tableNumber}:${c.type}`)).toEqual(['5:BILL', '5:WATER']);
    // Accepting the water request leaves the bill request ringing.
    const water = calls.find((c: { type: string }) => c.type === 'WATER');
    await staff('post', `/sessions/${water.sessionId}/calls/resolve`).send({ callId: water.callId }).expect(200);
    calls = (await staff('get', '/calls')).body;
    expect(calls.map((c: { type: string }) => c.type)).toEqual(['BILL']);
    expect((await guest('get', '/calls')).status).toBe(401);
    const floor = await staff('get', '/tables').expect(200);
    const five = floor.body.tables.find((t: { number: string }) => t.number === '5');
    expect(five.session).toMatchObject({ status: 'BILL_REQUESTED', guests: 3, orders: 2, inProgress: 2, total: 3240 });
    expect(five.session.calls).toHaveLength(1);
    expect((await request(app).get('/api/v1/dashboard/stats').set('Cookie', adminCookie)).body).toMatchObject({ tableCallsCount: 1, occupiedTablesCount: 1 });

    // Can't close while food is still being made.
    const close = () => staff('post', `/sessions/${sessionId}/close`).send({ paymentMethod: 'CASH' });
    expect((await close()).body.error.code).toBe('ORDERS_IN_PROGRESS');
    const detail = await staff('get', `/sessions/${sessionId}`).expect(200);
    for (const o of detail.body.orders) {
      for (const status of ['CONFIRMED', 'READY', 'COMPLETED']) {
        await request(app).patch(`/api/v1/orders/${o.id}/status`).set('Cookie', adminCookie).send({ status }).expect(200);
      }
    }
    expect((await close().expect(200)).body.total).toBe(3240);

    // Table is free again; an old page can't add to the next party's bill.
    view = await guest('get', `/t/${table.qrToken}`).expect(200);
    expect(view.body.session).toBeNull();
    await staff('post', `/tables/${table.id}/open`).send({ guests: 2 }).expect(201);
    expect((await order({ items: [{ itemId: curryId, quantity: 1 }] })).body.error.code).toBe('STALE_SESSION');

    const after = await staff('get', '/tables').expect(200);
    expect(after.body.closedToday[0]).toMatchObject({ tableNumber: '5', total: 3240, paymentMethod: 'CASH' });
  });

  it('lets guests open the table themselves when self-service is on', async () => {
    await settings({ diningSelfOpen: true });
    const table = await newTable('6');
    const opened = await guest('post', `/t/${table.qrToken}/open`).send({ guests: 2 }).expect(201);
    expect(opened.body.session).toMatchObject({ status: 'OPEN', guests: 2 });
    // A second phone at the same table joins the same visit.
    const again = await guest('post', `/t/${table.qrToken}/open`).expect(201);
    expect(again.body.session.id).toBe(opened.body.session.id);
    await settings({ diningSelfOpen: false });
  });

  it('stops orders when dine-in is switched off, and rejects unknown or replaced QR codes', async () => {
    const table = await newTable('7');
    await staff('post', `/tables/${table.id}/open`).expect(201);
    const sessionId = (await guest('get', `/t/${table.qrToken}`)).body.session.id;
    await settings({ diningEnabled: false });
    expect((await guest('post', `/t/${table.qrToken}/orders`).send({ sessionId, items: [{ itemId: curryId, quantity: 1 }] })).body.error.code).toBe('DINING_OFF');
    await settings({ diningEnabled: true });

    expect((await guest('get', '/t/AAAAAAAAAAAAAAAA')).status).toBe(404);
    const renewed = await staff('post', `/tables/${table.id}/qr`).expect(200);
    expect(renewed.body.qrToken).not.toBe(table.qrToken);
    expect((await guest('get', `/t/${table.qrToken}`)).status).toBe(404);
  });

  it('lets staff take an order for a table and manage tables, but keeps it from guests', async () => {
    const bulk = await staff('post', '/tables/bulk').send({ from: 1, to: 8 }).expect(201);
    expect(bulk.body).toEqual({ created: 5, skipped: 3 });
    const table = (await staff('get', '/tables')).body.tables.find((t: { number: string }) => t.number === '1');
    await staff('post', `/tables/${table.id}/open`).send({ guests: 1 }).expect(201);
    const sessionId = (await staff('get', '/tables')).body.tables.find((t: { number: string }) => t.number === '1').session.id;
    await staff('post', `/sessions/${sessionId}/orders`).send({ items: [{ itemId: curryId, quantity: 1 }] }).expect(201);
    expect((await staff('delete', `/tables/${table.id}`)).body.error.code).toBe('TABLE_IN_USE');
    expect((await staff('post', '/tables').send({ number: '1' })).status).toBe(409);
    expect((await guest('get', '/tables')).status).toBe(401);
    expect((await guest('post', `/sessions/${sessionId}/close`).send({ paymentMethod: 'CASH' })).status).toBe(401);
  });
});
