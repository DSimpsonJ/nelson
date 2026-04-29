import { NextRequest, NextResponse } from 'next/server';
import { adminDb, adminAuth } from '@/app/firebase/admin';

export type Article = {
  slug: string;
  title: string;
  format: 'read' | 'watch';
  duration: string;
  category: string;
  content: string;
  releaseType: 'drip' | 'broadcast';
  dayNumber?: number;
  publishedAt?: string;
  isPublished: boolean;
  imageUrl?: string;
};

export async function GET(req: NextRequest) {
  // 1. Verify auth token
  const authHeader = req.headers.get('Authorization');
  if (!authHeader?.startsWith('Bearer ')) {
    return NextResponse.json({ error: 'Missing authorization header' }, { status: 401 });
  }

  const idToken = authHeader.slice(7);
  let email: string;

  try {
    const decoded = await adminAuth.verifyIdToken(idToken);
    if (!decoded.email) {
      return NextResponse.json({ error: 'Token has no email claim' }, { status: 401 });
    }
    email = decoded.email;
  } catch {
    return NextResponse.json({ error: 'Invalid token' }, { status: 401 });
  }

  try {
    // 2. Get firstCheckinDate from metadata/accountInfo
    const metaSnap = await adminDb
      .collection('users').doc(email)
      .collection('metadata').doc('accountInfo')
      .get();

    if (!metaSnap.exists) {
      return NextResponse.json({ articles: [], readSlugs: [] });
    }

    const firstCheckinDate: string | undefined = metaSnap.data()?.firstCheckinDate;
    if (!firstCheckinDate) {
      return NextResponse.json({ articles: [], readSlugs: [] });
    }

    // 3. Calculate accountAgeDays — same logic as learnService.calculateAccountAge
    const today = new Date().toLocaleDateString('en-CA');
    const accountAgeDays =
      Math.floor(
        (new Date(today).getTime() - new Date(firstCheckinDate).getTime()) /
          (1000 * 60 * 60 * 24)
      ) + 1;

    // 4. Get readLearnSlugs and seenLearnSlugs from user doc
    const userSnap = await adminDb.collection('users').doc(email).get();
    const readSlugs: string[] = userSnap.data()?.readLearnSlugs ?? [];
    const seenSlugs: string[] = userSnap.data()?.seenLearnSlugs ?? [];

    // 5. Fetch all published articles
    const articlesSnap = await adminDb
      .collection('articles')
      .where('isPublished', '==', true)
      .get();

    const allArticles: Article[] = articlesSnap.docs.map(
      doc => doc.data() as Article
    );

    // 6. Filter to eligible drip articles, sort by dayNumber asc
    const eligible = allArticles
      .filter(
        a => a.releaseType === 'drip' && a.dayNumber !== undefined && a.dayNumber <= accountAgeDays
      )
      .sort((a, b) => (a.dayNumber ?? 0) - (b.dayNumber ?? 0));

      return NextResponse.json({ articles: eligible, readSlugs, seenSlugs });
  } catch (err) {
    console.error('[learn-articles] Error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}