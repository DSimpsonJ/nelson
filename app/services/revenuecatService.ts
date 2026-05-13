const REVENUECAT_SECRET_KEY = process.env.REVENUECAT_SECRET_KEY!;
const ENTITLEMENT_ID = 'nelson_pro';

export async function grantProEntitlement(
  email: string,
  duration: 'weekly' | 'monthly' | 'two_month'
): Promise<void> {
  const url = `https://api.revenuecat.com/v1/subscribers/${encodeURIComponent(email)}/entitlements/${ENTITLEMENT_ID}/promotional`;

  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${REVENUECAT_SECRET_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ duration }),
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(`RevenueCat grant failed for ${email}: ${JSON.stringify(error)}`);
  }

  console.log(`[revenuecat] Granted ${duration} entitlement to ${email}`);
}