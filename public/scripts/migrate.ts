// public/scripts/migrate.ts
import { initializeApp, cert } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import * as serviceAccount from '../../serviceAccountKey.json';

console.log('Initializing Firebase Admin...');

initializeApp({
  credential: cert(serviceAccount as any)
});

const db = getFirestore();

async function migrateNutritionNaming() {
  console.log('Starting migration...');
  
  try {
    const usersSnapshot = await db.collection('users').get();
    console.log(`Found ${usersSnapshot.size} users`);
    
    for (const userDoc of usersSnapshot.docs) {
      const userId = userDoc.id;
      console.log(`\nMigrating ${userId}...`);
      
      const momentumSnapshot = await db
        .collection('users')
        .doc(userId)
        .collection('momentum')
        .get();
      
      console.log(`  Found ${momentumSnapshot.size} momentum documents`);
      
      let updatedCount = 0;
      
      for (const checkInDoc of momentumSnapshot.docs) {
        const data = checkInDoc.data();
        if (!data.behaviorGrades) {
          console.log(`  Skipping ${checkInDoc.id} - no behaviorGrades`);
          continue;
        }
        
        const needsMigration = data.behaviorGrades.some(
          (bg: any) => bg.name === 'nutrition_pattern' || bg.name === 'energy_balance'
        );
        
        if (!needsMigration) {
          console.log(`  Skipping ${checkInDoc.id} - already migrated`);
          continue;
        }
        
        const updatedGrades = data.behaviorGrades.map((bg: any) => {
          if (bg.name === 'nutrition_pattern') {
            console.log(`    ${checkInDoc.id}: nutrition_pattern → nutrition_quality`);
            return { ...bg, name: 'nutrition_quality' };
          }
          if (bg.name === 'energy_balance') {
            console.log(`    ${checkInDoc.id}: energy_balance → portion_control`);
            return { ...bg, name: 'portion_control' };
          }
          return bg;
        });
        
        await checkInDoc.ref.update({ behaviorGrades: updatedGrades });
        updatedCount++;
      }
      
      console.log(`  ✓ Updated ${updatedCount} check-ins for ${userId}`);
    }
    
    console.log('\n✅ Migration complete!');
  } catch (error) {
    console.error('❌ Migration failed:', error);
  }
}

migrateNutritionNaming();