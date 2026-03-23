import { logger } from '../logger';

export async function appendDailyMetrics(campaignId: string, campaignName: string, metrics: {
  sent: number;
  opened: number;
  replied: number;
  bounced: number;
  positive_replies: number;
  meetings_booked: number;
  grade: string;
  decision: string;
}, leadCount: number): Promise<void> {
  const webhookUrl = process.env.MAKE_WEBHOOK_URL;
  if (!webhookUrl) {
    logger.warn('MAKE_WEBHOOK_URL not configured, skipping Make.com logging');
    return;
  }

  const openRate = metrics.sent > 0 ? ((metrics.opened / metrics.sent) * 100).toFixed(1) : '0';
  const positiveReplyRate = metrics.sent > 0 ? ((metrics.positive_replies / metrics.sent) * 100).toFixed(1) : '0';

  const payload = {
    campaign_id: campaignId,
    campaign_name: campaignName,
    new_leads: leadCount,
    replies: metrics.replied,
    completed_count: metrics.sent,
    bounces: metrics.bounced,
    leads_count: leadCount,
    emails_sent: metrics.sent,
    opens: metrics.opened,
    positive_replies: metrics.positive_replies,
    calls_booked: metrics.meetings_booked,
    open_rate: `${openRate}%`,
    positive_reply_rate: `${positiveReplyRate}%`,
  };

  try {
    await fetch(webhookUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    logger.info(`Logged metrics to Make.com for ${campaignName}`);
  } catch (err) {
    logger.error('Make.com webhook failed', { error: err });
  }
}
