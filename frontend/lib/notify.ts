import { sql } from '@/lib/db';

export async function notifySlackPublished({
  title,
  url,
  storyblok_url,
  author,
}: {
  title: string;
  url: string;
  storyblok_url?: string;
  author?: string;
}) {
  const webhookUrl = process.env.SLACK_WEBHOOK_URL;
  if (!webhookUrl) return;

  const byLine = author ? ` by ${author}` : '';
  const buttons: object[] = [
    {
      type: 'button',
      text: { type: 'plain_text', text: '👁 View in Kolet SEO' },
      url,
      style: 'primary',
    },
  ];
  if (storyblok_url) {
    buttons.push({
      type: 'button',
      text: { type: 'plain_text', text: '🔗 Read live article' },
      url: storyblok_url,
    });
  }

  await fetch(webhookUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      blocks: [
        {
          type: 'section',
          text: {
            type: 'mrkdwn',
            text: `📣 *New article published${byLine} — review requested*\n\n*<${url}|${title}>*\n\nThis article just went live on Storyblok. Could you take a look and share any feedback?`,
          },
        },
        { type: 'actions', elements: buttons },
      ],
    }),
  }).catch(err => console.error('[notify] Slack error:', err));
}

export async function notifyNeedsProofreading({
  title,
  url,
}: {
  title: string;
  url: string;
}) {
  const webhookUrl = process.env.SLACK_WEBHOOK_URL;
  if (!webhookUrl) return;

  await fetch(webhookUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      blocks: [
        {
          type: 'section',
          text: {
            type: 'mrkdwn',
            text: `📝 *Ready for proofreading*\n\n*<${url}|${title}>*\n\nThe draft is done — could someone proofread and leave comments where needed?`,
          },
        },
        {
          type: 'actions',
          elements: [
            {
              type: 'button',
              text: { type: 'plain_text', text: '👁 Review in Kolet SEO' },
              url,
              style: 'primary',
            },
          ],
        },
      ],
    }),
  }).catch(err => console.error('[notify] Slack error:', err));
}

const CIO_API_KEY = process.env.CIO_APP_API_KEY;
const FROM_EMAIL  = process.env.NOTIFY_FROM_EMAIL || 'noreply@kolet.com';
const APP_URL     = process.env.NEXT_PUBLIC_APP_URL || 'https://kolet-seo-app.vercel.app';
const CIO_BASE    = process.env.CIO_REGION === 'eu'
  ? 'https://api-eu.customer.io/v1'
  : 'https://api.customer.io/v1';

// Extract @mention handles from comment body, e.g. "hey @john.doe" → ["john.doe"]
function parseMentions(body: string): string[] {
  const matches = body.match(/@([\w.]+)/g) ?? [];
  return matches.map(m => m.slice(1).toLowerCase());
}

async function sendEmail(to: string, subject: string, html: string) {
  const res = await fetch(`${CIO_BASE}/send/email`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${CIO_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ to, from: FROM_EMAIL, subject, body: html }),
  }).catch(err => { console.error('[notify] fetch error:', err); return null; });

  if (res && !res.ok) {
    const text = await res.text().catch(() => '');
    console.error(`[notify] CIO error ${res.status} sending to ${to}:`, text);
  }
  return res;
}

export async function notifyNewComment({
  articleId,
  articleTitle,
  author,
  body,
  quote,
}: {
  articleId: string;
  articleTitle: string;
  author: string;
  body: string;
  quote?: string;
}) {
  if (!CIO_API_KEY) return;

  // Fetch all users once
  const allUsers = await sql`SELECT email, name FROM users`;
  if (!allUsers.length) return;

  // Always notify admins
  const adminEmails = new Set<string>(
    (await sql`SELECT email FROM users WHERE role = 'admin'`).map(r => r.email as string)
  );

  // Find mentioned users: match @handle against name (first word, full name, email prefix)
  const mentions = parseMentions(body);
  const mentionedEmails = new Set<string>();
  if (mentions.length) {
    for (const user of allUsers) {
      const name  = (user.name as string ?? '').toLowerCase();
      const email = (user.email as string).toLowerCase();
      const emailPrefix = email.split('@')[0];
      const firstName   = name.split(' ')[0];
      if (mentions.some(m => m === emailPrefix || m === name.replace(/\s+/g, '.') || m === firstName)) {
        mentionedEmails.add(user.email as string);
      }
    }
  }

  // Merge: admins + mentioned, skip the comment author themselves
  const recipients = [...new Set([...adminEmails, ...mentionedEmails])].filter(
    e => e.toLowerCase() !== author.toLowerCase()
  );
  if (!recipients.length) return;

  const articleUrl = `${APP_URL}/library/${articleId}`;
  const quoteLine  = quote
    ? `<blockquote style="margin:8px 0;padding:8px 12px;border-left:3px solid #F5C842;font-style:italic;color:#555;">${quote}</blockquote>`
    : '';

  const buildHtml = (isMention: boolean) => `
<div style="font-family:sans-serif;max-width:520px;color:#222;">
  <h2 style="margin:0 0 4px;font-size:18px;">${isMention ? 'You were mentioned in a comment' : 'New comment'} on <em>${articleTitle}</em></h2>
  <p style="margin:0 0 12px;color:#666;font-size:13px;">From <strong>${author}</strong></p>
  ${quoteLine}
  <p style="margin:12px 0;font-size:15px;">${body}</p>
  <a href="${articleUrl}" style="display:inline-block;margin-top:16px;padding:10px 20px;background:#F5C842;color:#111;font-weight:600;text-decoration:none;border-radius:8px;">View article</a>
  <hr style="margin:24px 0;border:none;border-top:1px solid #eee;" />
  <p style="font-size:11px;color:#aaa;">Kolet SEO Studio</p>
</div>`.trim();

  await Promise.allSettled(
    recipients.map(email => {
      const isMention = mentionedEmails.has(email) && !adminEmails.has(email);
      const subject   = isMention
        ? `You were mentioned in a comment on "${articleTitle}"`
        : `New comment on "${articleTitle}"`;
      return sendEmail(email, subject, buildHtml(isMention));
    })
  );
}
