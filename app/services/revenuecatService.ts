const REVENUECAT_SECRET_KEY = process.env.REVENUECAT_SECRET_KEY!;
const REVENUECAT_PROJECT_ID = '409788ef';
const ENTITLEMENT_ID = 'nelson_pro';

export async function grantProEntitlement(
    email: string,
    duration: 'weekly' | 'two_week' | 'monthly'
  ): Promise<void> {
  const url = `https://api.revenuecat.com/v2/projects/${REVENUECAT_PROJECT_ID}/customers/${encodeURIComponent(email)}/actions/grant_entitlement`;

  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${REVENUECAT_SECRET_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      entitlement_identifier: ENTITLEMENT_ID,
      duration,
    }),
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(`RevenueCat grant failed for ${email}: ${JSON.stringify(error)}`);
  }

  console.log(`[revenuecat] Granted ${duration} entitlement to ${email}`);
}