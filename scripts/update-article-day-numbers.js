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

const dayNumbers = {
  // Days 1-21 (daily)
  'welcome-to-nelson':                    1,
  'what-nelson-is-and-isn-t':             2,
  'momentum-basics':                      3,
  'how-to-rate-yourself':                 4,
  'momentum-beats-motivation':            5,
  'keep-the-signal-clean':                6,
  'honesty-over-optimization1':           7,
  'the-daily-minimum':                    8,
  'how-momentum-actually-builds':         9,
  'success-starts-small':                 10,
  'what-to-do-when-you-miss-a-day':       11,
  'adjusting-without-resetting':          12,
  'this-is-where-people-usually-stop':    13,
  'solid-is-the-win':                     14,
  'sleep-is-a-superpower':                15,
  'protein-without-overthinking-it':      16,
  'hydration-simplified':                 17,
  'nutrition-quality-explained':          18,
  'the-weekend-momentum-trap':            19,
  'read-patterns-not-scores':             20,
  'progress-without-obsession':           21,

  // Days 23+ (every 2 days)
  'awareness-changes-everything':         23,
  'you-are-your-own-science-experiment':  25,
  'portion-control':                      27,
  'what-is-protein-and-why-do-you-need-it': 29,
  'sleep-recovery':                       31,
  'walking-still-wins':                   33,
  'bonus-activity-neat':                  35,
  'why-cardio-alone-usually-fails':       37,
  'lifting-is-for-everyone':              39,
  'the-gym-is-easier-than-you-think':     41,
  'train-for-the-next-decade':            43,
  'environment-beats-willpower':          45,
  'stop-negotiating-with-yourself':       47,
  'stop-talking-to-yourself-like-that':   49,
  'busy-days-still-count':                51,
  'do-tomorrow-a-favor-today':            53,
  'persistence-wins-late':                55,
  'the-power-of-boring-wins':             57,
  'sustaining-is-the-strategy':           59,
  'this-is-how-it-holds':                 61,
  'plateaus-are-data':                    63,
  'the-scale-is-one-tool-not-the-tool':   65,
  'why-weight-changes':                   67,
  'progress-over-time':                   69,
  'the-cost-of-starting-over':            71,
  'what-to-do-after-a-bad-week':          73,
  'alcohol-and-hydration-truths':         75,
  'you-re-closer-than-you-think':         77,
  'why-you-need-simplicity':              79,
};

async function updateDayNumbers() {
  const snapshot = await db.collection('articles').get();

  let updated = 0;
  let skipped = 0;
  let notFound = [];

  for (const doc of snapshot.docs) {
    const slug = doc.id;
    const dayNumber = dayNumbers[slug];

    if (dayNumber !== undefined) {
      await doc.ref.update({ dayNumber });
      console.log(`✅ ${slug} → Day ${dayNumber}`);
      updated++;
    } else {
      console.log(`⚠️  ${slug} — not in map, skipped`);
      notFound.push(slug);
      skipped++;
    }
  }

  console.log(`\nDone. ${updated} updated, ${skipped} skipped.`);

  if (notFound.length > 0) {
    console.log('\nArticles not in map:');
    notFound.forEach(s => console.log(`  - ${s}`));
  }
}

updateDayNumbers().catch(console.error);