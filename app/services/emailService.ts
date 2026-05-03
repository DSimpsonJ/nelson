import { Resend } from 'resend';

const resend = new Resend(process.env.RESEND_API_KEY);

const FROM = 'Nelson <hello@thenelson.app>';

export async function sendWelcomeEmail(email: string, firstName?: string): Promise<void> {
  const name = firstName || 'there';
  await resend.emails.send({
    from: FROM,
    to: email,
    subject: 'Welcome to Nelson',
    html: welcomeTemplate(name),
  });
}

export async function sendPasswordResetEmail(email: string, resetLink: string): Promise<void> {
  await resend.emails.send({
    from: FROM,
    to: email,
    subject: 'Reset your Nelson password',
    html: passwordResetTemplate(resetLink),
  });
}

export async function sendPrePaywallEmail(email: string, firstName?: string): Promise<void> {
  const name = firstName || 'there';
  await resend.emails.send({
    from: FROM,
    to: email,
    subject: "You're almost through the first two weeks",
    html: prePaywallTemplate(name),
  });
}

export async function sendConversionEmail(email: string, firstName?: string): Promise<void> {
  const name = firstName || 'there';
  await resend.emails.send({
    from: FROM,
    to: email,
    subject: 'Keep going — Founding Members pricing ends soon',
    html: conversionTemplate(name),
  });
}

export async function sendReengagementEmail(email: string, firstName?: string): Promise<void> {
  const name = firstName || 'there';
  await resend.emails.send({
    from: FROM,
    to: email,
    subject: 'Nelson is still here',
    html: reengagementTemplate(name),
  });
}

// ─── Templates ────────────────────────────────────────────────────────────────

const baseStyle = `
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
  background-color: #000000;
  color: #ffffff;
  margin: 0;
  padding: 0;
`;

const containerStyle = `
  max-width: 560px;
  margin: 0 auto;
  padding: 48px 32px;
`;

const headingStyle = `
  font-size: 28px;
  font-weight: 700;
  color: #ffffff;
  margin: 0 0 16px 0;
  line-height: 1.2;
`;

const bodyStyle = `
  font-size: 16px;
  color: rgba(255,255,255,0.7);
  line-height: 1.7;
  margin: 0 0 16px 0;
`;

const buttonStyle = `
  display: inline-block;
  background-color: #f59e0b;
  color: #000000;
  font-weight: 700;
  font-size: 15px;
  padding: 14px 28px;
  border-radius: 10px;
  text-decoration: none;
  margin: 24px 0;
`;

const dividerStyle = `
  border: none;
  border-top: 1px solid rgba(255,255,255,0.08);
  margin: 32px 0;
`;

const footerStyle = `
  font-size: 12px;
  color: rgba(255,255,255,0.3);
  line-height: 1.6;
`;

function wrapper(content: string): string {
  return `
    <!DOCTYPE html>
    <html>
      <head>
        <meta charset="utf-8">
        <meta name="viewport" content="width=device-width, initial-scale=1">
        <title>Nelson</title>
      </head>
      <body style="${baseStyle}">
        <div style="${containerStyle}">
          <div style="margin-bottom: 32px;">
            <span style="font-size: 22px; font-weight: 800; color: #ffffff; letter-spacing: -0.5px;">Nelson</span>
          </div>
          ${content}
          <hr style="${dividerStyle}">
          <p style="${footerStyle}">
            You're receiving this because you created a Nelson account.<br>
            <a href="https://thenelson.app" style="color: rgba(255,255,255,0.3);">thenelson.app</a>
          </p>
        </div>
      </body>
    </html>
  `;
}

function welcomeTemplate(name: string): string {
  return wrapper(`
    <h1 style="${headingStyle}">You're in.</h1>
    <p style="${bodyStyle}">
      Hey ${name} — Nelson is built around one idea: momentum beats motivation.
    </p>
    <p style="${bodyStyle}">
      You don't need a perfect week. You need honest check-ins, repeated often enough that patterns start to emerge. That's what Nelson tracks.
    </p>
    <p style="${bodyStyle}">
      Your first check-in is the most important one. It starts the clock.
    </p>
    <a href="https://thenelson.app" style="${buttonStyle}">Open Nelson</a>
    <p style="${bodyStyle}">
      — Nelson
    </p>
  `);
}

function passwordResetTemplate(resetLink: string): string {
  return wrapper(`
    <h1 style="${headingStyle}">Reset your password</h1>
    <p style="${bodyStyle}">
      Someone requested a password reset for your Nelson account. If that was you, tap the button below.
    </p>
    <a href="${resetLink}" style="${buttonStyle}">Reset password</a>
    <p style="${bodyStyle}">
      This link expires in 1 hour. If you didn't request a reset, you can ignore this email — your password hasn't changed.
    </p>
  `);
}

function prePaywallTemplate(name: string): string {
  return wrapper(`
    <h1 style="${headingStyle}">Two weeks in.</h1>
    <p style="${bodyStyle}">
      Hey ${name} — you've been at this for almost two weeks.
    </p>
    <p style="${bodyStyle}">
      That's the part most people don't get through. Not because they can't — because it doesn't feel dialed in yet, and uncertain things are easy to walk away from.
    </p>
    <p style="${bodyStyle}">
      A few more honest check-ins is where it starts to get clear. What your days actually look like. What tends to throw you off. What holds when life gets busy.
    </p>
    <p style="${bodyStyle}">
      Keep going.
    </p>
    <a href="https://thenelson.app" style="${buttonStyle}">Open Nelson</a>
  `);
}

function conversionTemplate(name: string): string {
  return wrapper(`
    <h1 style="${headingStyle}">Founding Members pricing.</h1>
    <p style="${bodyStyle}">
      Hey ${name} — Nelson is now a paid product, and you're one of the first people here.
    </p>
    <p style="${bodyStyle}">
      Founding Members get $60/year — locked for life as long as your subscription stays active. That price goes away in 90 days.
    </p>
    <p style="${bodyStyle}">
      If Nelson has been useful, this is the moment to lock it in.
    </p>
    <a href="https://thenelson.app" style="${buttonStyle}">Become a Founding Member</a>
    <p style="${bodyStyle}">
      If now's not the right time, no pressure. Your data stays intact.
    </p>
  `);
}

function reengagementTemplate(name: string): string {
  return wrapper(`
    <h1 style="${headingStyle}">Nelson is still here.</h1>
    <p style="${bodyStyle}">
      Hey ${name} — you haven't checked in for a few days. That's fine. Life happens.
    </p>
    <p style="${bodyStyle}">
      Momentum doesn't reset. Missing days creates a gap, not a restart. Whatever's going on, the next check-in is still worth doing.
    </p>
    <a href="https://thenelson.app" style="${buttonStyle}">Check in now</a>
    <p style="${bodyStyle}">
      — Nelson
    </p>
  `);
}