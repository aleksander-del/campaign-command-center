import { DiagnosticResult } from './campaign-diagnostics';
import { ClassifiedReply } from './reply-classifier';
import { logger } from '../logger';

export async function sendSlackDigest(campaigns: Array<{
  name: string;
  metrics: { sent: number; opened: number; replied: number; bounced: number; positive_replies: number; meetings_booked: number };
  diagnostics: DiagnosticResult;
  newReplies: ClassifiedReply[];
}>): Promise<void> {
  const webhookUrl = process.env.SLACK_WEBHOOK_URL;
  if (!webhookUrl) {
    logger.warn('SLACK_WEBHOOK_URL not configured, skipping Slack digest');
    return;
  }

  const date = new Date().toISOString().split('T')[0];
  const blocks: any[] = [
    {
      type: 'header',
      text: { type: 'plain_text', text: `Daily Campaign Report — ${date}` },
    },
  ];

  let totalSent = 0, totalReplied = 0, totalMeetings = 0;

  for (const campaign of campaigns) {
    const { metrics, diagnostics, newReplies } = campaign;
    totalSent += metrics.sent;
    totalReplied += metrics.replied;
    totalMeetings += metrics.meetings_booked;

    const gradeEmoji = { A: ':large_green_circle:', B: ':large_yellow_circle:', C: ':large_orange_circle:', D: ':red_circle:' }[diagnostics.grade];
    const interested = newReplies.filter(r => r.category === 'interested').length;

    blocks.push(
      { type: 'divider' },
      {
        type: 'section',
        text: {
          type: 'mrkdwn',
          text: `${gradeEmoji} *${campaign.name}* — Grade: *${diagnostics.grade}* (${diagnostics.decision})\n` +
            `Sent: ${metrics.sent} | Opens: ${metrics.opened} | Replies: ${metrics.replied} | Meetings: ${metrics.meetings_booked}\n` +
            (interested > 0 ? `*${interested} interested replies need follow-up!*\n` : '') +
            (diagnostics.tips.length > 0 ? `Tips: ${diagnostics.tips.join('; ')}` : ''),
        },
      },
    );
  }

  // Summary
  blocks.push(
    { type: 'divider' },
    {
      type: 'section',
      text: {
        type: 'mrkdwn',
        text: `*Portfolio Summary:* ${campaigns.length} campaigns | ${totalSent} sent | ${totalReplied} replies | ${totalMeetings} meetings`,
      },
    },
  );

  try {
    await fetch(webhookUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ blocks }),
    });
    logger.info('Slack daily digest sent');
  } catch (err) {
    logger.error('Slack digest failed', { error: err });
  }
}
