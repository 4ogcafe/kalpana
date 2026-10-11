import express from 'express';
import { prisma } from '../lib/prisma.js';
import { MongoClient, ObjectId } from 'mongodb';

const router = express.Router();

// GET settings (using native mongodb driver)
router.get('/', async (req, res) => {
  const client = new MongoClient(process.env.DATABASE_URL || 'mongodb://localhost:27017/kalpanarestro');
  try {
    await client.connect();
    const db = client.db();
    const settings = await db.collection('Settings').findOne({});
    res.json(settings || {});
  } catch (error) {
    console.error('Error fetching settings natively:', error);
    res.status(500).json({ error: 'Failed to fetch settings' });
  } finally {
    await client.close();
  }
});

// PUT settings (using native mongodb driver to bypass Prisma's Replica Set restriction)
router.put('/', async (req, res) => {
  const client = new MongoClient(process.env.DATABASE_URL || 'mongodb://localhost:27017/kalpanarestro');
  try {
    const { 
      name, email, phone, addressEn, addressJa, weeklyHours, holidays, socials, mapUrl, googleMapsLink, 
      aboutEn, aboutJa,
      aboutStoryJa, aboutStoryLabelJa, aboutStoryTitleJa, 
      aboutSpiceLabelJa, aboutSpiceTitleJa, aboutSpiceDescJa, aboutSpiceImage,
      aboutChefLabelJa, aboutChefTitleJa, aboutChefDescJa, aboutChefImage,
      welcomeTitleEn, welcomeTitleJa, welcomeTextJa, storeSectionLabelJa, storeSectionTitleJa, storeSectionSubJa, storeLocationJa, storeBadgeJa, storeReviewScore, storeReviewText, storeReviewLink,
      aboutHeroImage, contactHeroImage, grandMenuHeroImage, lunchMenuHeroImage, takeoutMenuHeroImage
    } = req.body;
    
    await client.connect();
    const db = client.db();
    const settingsCol = db.collection('Settings');
    
    // Update the first document, or insert if none exists
    const existing = await settingsCol.findOne({});
    if (existing) {
      await settingsCol.updateOne({ _id: existing._id }, {
        $set: { 
          name, 
          email, 
          phone, 
          addressEn, 
          addressJa, 
          weeklyHours: weeklyHours || existing.weeklyHours, 
          holidays: holidays || existing.holidays, 
          socials: socials || existing.socials,
          mapUrl: mapUrl !== undefined ? mapUrl : existing.mapUrl,
          googleMapsLink: googleMapsLink !== undefined ? googleMapsLink : existing.googleMapsLink, googleMapsLink,
          aboutEn: aboutEn !== undefined ? aboutEn : existing.aboutEn,
          aboutJa: aboutJa !== undefined ? aboutJa : existing.aboutJa,
          aboutStoryJa: aboutStoryJa !== undefined ? aboutStoryJa : existing.aboutStoryJa,
          aboutStoryLabelJa: aboutStoryLabelJa !== undefined ? aboutStoryLabelJa : existing.aboutStoryLabelJa,
          aboutStoryTitleJa: aboutStoryTitleJa !== undefined ? aboutStoryTitleJa : existing.aboutStoryTitleJa,
          aboutSpiceLabelJa: aboutSpiceLabelJa !== undefined ? aboutSpiceLabelJa : existing.aboutSpiceLabelJa,
          aboutSpiceTitleJa: aboutSpiceTitleJa !== undefined ? aboutSpiceTitleJa : existing.aboutSpiceTitleJa,
          aboutSpiceDescJa: aboutSpiceDescJa !== undefined ? aboutSpiceDescJa : existing.aboutSpiceDescJa,
          aboutSpiceImage: aboutSpiceImage !== undefined ? aboutSpiceImage : existing.aboutSpiceImage,
          aboutChefLabelJa: aboutChefLabelJa !== undefined ? aboutChefLabelJa : existing.aboutChefLabelJa,
          aboutChefTitleJa: aboutChefTitleJa !== undefined ? aboutChefTitleJa : existing.aboutChefTitleJa,
          aboutChefDescJa: aboutChefDescJa !== undefined ? aboutChefDescJa : existing.aboutChefDescJa,
          aboutChefImage: aboutChefImage !== undefined ? aboutChefImage : existing.aboutChefImage,
          welcomeTitleEn: welcomeTitleEn !== undefined ? welcomeTitleEn : existing.welcomeTitleEn,
          welcomeTitleJa: welcomeTitleJa !== undefined ? welcomeTitleJa : existing.welcomeTitleJa,
          welcomeTextJa: welcomeTextJa !== undefined ? welcomeTextJa : existing.welcomeTextJa,
          storeSectionLabelJa: storeSectionLabelJa !== undefined ? storeSectionLabelJa : existing.storeSectionLabelJa,
          storeSectionTitleJa: storeSectionTitleJa !== undefined ? storeSectionTitleJa : existing.storeSectionTitleJa,
          storeSectionSubJa: storeSectionSubJa !== undefined ? storeSectionSubJa : existing.storeSectionSubJa,
          storeLocationJa: storeLocationJa !== undefined ? storeLocationJa : existing.storeLocationJa,
          storeBadgeJa: storeBadgeJa !== undefined ? storeBadgeJa : existing.storeBadgeJa,
          storeReviewScore: storeReviewScore !== undefined ? storeReviewScore : existing.storeReviewScore,
          storeReviewText: storeReviewText !== undefined ? storeReviewText : existing.storeReviewText,
          storeReviewLink: storeReviewLink !== undefined ? storeReviewLink : existing.storeReviewLink,
          aboutHeroImage: aboutHeroImage !== undefined ? aboutHeroImage : existing.aboutHeroImage,
          contactHeroImage: contactHeroImage !== undefined ? contactHeroImage : existing.contactHeroImage,
          grandMenuHeroImage: grandMenuHeroImage !== undefined ? grandMenuHeroImage : existing.grandMenuHeroImage,
          lunchMenuHeroImage: lunchMenuHeroImage !== undefined ? lunchMenuHeroImage : existing.lunchMenuHeroImage,
          takeoutMenuHeroImage: takeoutMenuHeroImage !== undefined ? takeoutMenuHeroImage : existing.takeoutMenuHeroImage,
          updatedAt: new Date() 
        }
      });
    } else {
      await settingsCol.insertOne({
        _id: new ObjectId(),
        name, email, phone, addressEn, addressJa, mapUrl, googleMapsLink,
        aboutEn, aboutJa,
        aboutStoryJa, aboutStoryLabelJa, aboutStoryTitleJa,
        aboutSpiceLabelJa, aboutSpiceTitleJa, aboutSpiceDescJa, aboutSpiceImage,
        aboutChefLabelJa, aboutChefTitleJa, aboutChefDescJa, aboutChefImage,
        welcomeTitleEn, welcomeTitleJa, welcomeTextJa, storeSectionLabelJa, storeSectionTitleJa, storeSectionSubJa, storeLocationJa, storeBadgeJa, storeReviewScore, storeReviewText, storeReviewLink,
        aboutHeroImage, contactHeroImage, grandMenuHeroImage, lunchMenuHeroImage, takeoutMenuHeroImage,
        lat: 36.1473, lng: 139.3886, timezone: 'Asia/Tokyo', currency: 'JPY',
        weeklyHours: { monday: "11:00-15:00, 17:00-22:00" }, holidays: { regular: "Tuesday" }, socials: { instagram: "@kalpana_restro" },
        updatedAt: new Date()
      });
    }

    // Fetch the updated doc
    const updated = await settingsCol.findOne({});
    res.json(updated);
  } catch (error) {
    console.error('Error saving settings:', error);
    res.status(500).json({ error: 'Failed to save settings natively' });
  } finally {
    await client.close();
  }
});

export default router;
