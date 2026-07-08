import { env } from "$env/dynamic/private";

interface EmailInput {
  to: string;
  subject: string;
  html: string;
}

/**
 * Send via Resend. Local dev (no RESEND_API_KEY): log instead — the link in
 * the logged HTML is how you complete reset/verify flows locally.
 * Never throws; callers treat email as best-effort.
 */
export async function sendEmail({ to, subject, html }: EmailInput): Promise<boolean> {
  if (!env.RESEND_API_KEY) {
    console.log(`[email:dev] to=${to} subject="${subject}"\n${html}`);
    return true;
  }
  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${env.RESEND_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: env.EMAIL_FROM ?? "CampFinder <noreply@localhost>",
        to,
        subject,
        html,
      }),
    });
    if (!res.ok) {
      console.error(`[email] send failed: ${res.status} ${await res.text()}`);
      return false;
    }
    return true;
  } catch (e) {
    console.error("[email] send error:", e);
    return false;
  }
}

const wrap = (body: string) => `
  <div style="font-family: Georgia, serif; max-width: 480px; margin: 0 auto; padding: 24px; color: #2d2416;">
    <h2 style="font-weight: 600; border-bottom: 2px solid #4a5d3a; padding-bottom: 8px;">CampFinder</h2>
    ${body}
    <p style="font-size: 12px; color: #8a7d63; margin-top: 24px;">If you didn't request this, you can ignore this email.</p>
  </div>`;

export function resetEmail(origin: string, token: string) {
  const link = `${origin}/reset?token=${encodeURIComponent(token)}`;
  return {
    subject: "Reset your CampFinder password",
    html: wrap(`
      <p>Someone (hopefully you) asked to reset your CampFinder password.</p>
      <p><a href="${link}" style="color: #4a5d3a; font-weight: 600;">Choose a new password</a></p>
      <p style="font-size: 13px;">This link expires in 30 minutes.</p>`),
  };
}

export function verifyEmail(origin: string, token: string) {
  const link = `${origin}/api/auth/verify?token=${encodeURIComponent(token)}`;
  return {
    subject: "Verify your CampFinder email",
    html: wrap(`
      <p>Welcome to CampFinder! Confirm this is your email address:</p>
      <p><a href="${link}" style="color: #4a5d3a; font-weight: 600;">Verify my email</a></p>
      <p style="font-size: 13px;">This link expires in 24 hours.</p>`),
  };
}
