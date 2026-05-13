import { serve } from 'inngest/next';
import { inngest } from '@/app/services/inngestClient';
import { drip, dripUser, coaching, coachingUser } from '@/app/services/inngestFunctions';

export const { GET, POST, PUT } = serve({
  client: inngest,
  functions: [drip, dripUser, coaching, coachingUser],
});