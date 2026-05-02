const admin = require('firebase-admin');
const fs = require('fs');
const path = require('path');

// Read .env.local manually
const envPath = path.resolve(__dirname, '../.env.local');
const envContent = fs.readFileSync(envPath, 'utf8');
const match = envContent.match(/FIREBASE_SERVICE_ACCOUNT_BASE64=(.+)/);
if (!match) throw new Error('FIREBASE_SERVICE_ACCOUNT_BASE64 not found in .env.local');
const serviceAccountBase64 = match[1].trim();

admin.initializeApp({
  credential: admin.credential.cert(
    JSON.parse(
      Buffer.from(serviceAccountBase64, 'base64').toString('utf8')
    )
  ),
});

const db = admin.firestore();

// Old category → New category
const categoryMap = {
  'Calibration Basics':        'Rating & Awareness',
  'Momentum Truths':           'Momentum & Mindset',
  'Rebuilds and Gaps':         'Real Life & Recovery',
  'What Solid Actually Means': 'Momentum & Mindset',
  'Common Rating Errors':      'Rating & Awareness',
};

async function updateCategories() {
  const snapshot = await db.collection('articles').get();
  
  let updated = 0;
  let skipped = 0;
  let unknown = [];

  for (const doc of snapshot.docs) {
    const data = doc.data();
    const oldCategory = data.category;
    const newCategory = categoryMap[oldCategory];

    if (newCategory) {
      await doc.ref.update({ category: newCategory });
      console.log(`✅ ${doc.id}: "${oldCategory}" → "${newCategory}"`);
      updated++;
    } else {
      console.log(`⚠️  ${doc.id}: "${oldCategory}" — no mapping, skipped`);
      unknown.push({ slug: doc.id, category: oldCategory });
      skipped++;
    }
  }

  console.log(`\nDone. ${updated} updated, ${skipped} skipped.`);
  
  if (unknown.length > 0) {
    console.log('\nArticles needing manual review:');
    unknown.forEach(a => console.log(`  - ${a.slug} (current: "${a.category}")`));
  }
}

updateCategories().catch(console.error);