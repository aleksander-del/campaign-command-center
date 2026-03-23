import * as instantly from '../instantly/client';
import { query } from '../db/client';
import { classifyReplies } from './reply-classifier';
import { runDiagnostics } from './campaign-diagnostics';
import { sendSlackDigest } from './slack-reporter';
import { appendDailyMetrics } from './sheets-logger';
import { logger } from '../logger';

export async function runDailyTracking(): Promise<void> {
  logger.info('Starting daily tracking run...');

  // Get all active campaigns
  const campaigns = await query<{
    id: string;
    company: string;
    audience: string;
    instantly_campaign_id: string;
    lead_count: number;
  }>(
    "SELECT id, company, audience, instantly_campaign_id, lead_count FROM campaigns WHERE status = 'active' AND instantly_campaign_id IS NOT NULL"
  );

  if (campaigns.length === 0) {
    logger.info('No active campaigns to track');
    return;
  }

  const slackData: any[] = [];

  for (const campaign of campaigns) {
    try {
      // 1. Pull analytics from Instantly
      const analytics = await instantly.getCampaignAnalytics([campaign.instantly_campaign_id]);
      const stats = analytics[0] || analytics;

      const metrics = {
        sent: stats.sent || stats.total_sent || 0,
        opened: stats.opened || stats.total_opened || 0,
        replied: stats.replied || stats.total_replied || 0,
        bounced: stats.bounced || stats.total_bounced || 0,
        positive_replies: 0,
        meetings_booked: stats.meetings_booked || 0,
      };

      // 2. Classify new replies
      const replies = await instantly.listReplies(campaign.instantly_campaign_id);
      const classified = await classifyReplies(
        replies.map((r: any) => ({ email: r.from_email || r.email, body: r.body || r.text }))
      );
      metrics.positive_replies = classified.filter(r => r.category === 'interested').length;

      // 3. Run diagnostics
      const diagnostics = runDiagnostics(metrics);

      // 4. Save to DB
      await query(
        `INSERT INTO daily_metrics (campaign_id, date, sent, opened, replied, bounced, positive_replies, meetings_booked, diagnostics)
         VALUES ($1, CURRENT_DATE, $2, $3, $4, $5, $6, $7, $8)
         ON CONFLICT (campaign_id, date) DO UPDATE SET
           sent = $2, opened = $3, replied = $4, bounced = $5,
           positive_replies = $6, meetings_booked = $7, diagnostics = $8`,
        [campaign.id, metrics.sent, metrics.opened, metrics.replied, metrics.bounced, metrics.positive_replies, metrics.meetings_booked, JSON.stringify(diagnostics)]
      );

      // 5. Log to Make.com webhook
      await appendDailyMetrics(campaign.id, `${campaign.company} — ${campaign.audience}`, {
        ...metrics,
        grade: diagnostics.grade,
        decision: diagnostics.decision,
      }, campaign.lead_count || 0);

      slackData.push({
        name: `${campaign.company} — ${campaign.audience}`,
        metrics,
        diagnostics,
        newReplies: classified,
      });
    } catch (err) {
      logger.error(`Tracking failed for campaign ${campaign.id}`, { error: err });
    }
  }

  // 6. Send Slack digest
  if (slackData.length > 0) {
    await sendSlackDigest(slackData);
  }

  logger.info(`Daily tracking complete: ${campaigns.length} campaigns processed`);
}
