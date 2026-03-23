import { App, ExpressReceiver } from '@slack/bolt';
import { Express } from 'express';
import { query, queryOne } from '../db/client';
import { runPipeline } from '../orchestrator/pipeline';
import { approveCampaign } from '../instantly/campaign-manager';
import { runDailyTracking } from '../tracking/daily-tracker';
import { logger } from '../logger';

export function initSlackBot(expressApp: Express) {
  const signingSecret = process.env.SLACK_SIGNING_SECRET;
  const botToken = process.env.SLACK_BOT_TOKEN;

  if (!signingSecret || !botToken) {
    logger.warn('SLACK_SIGNING_SECRET or SLACK_BOT_TOKEN not set — Slack bot disabled');
    return;
  }

  const receiver = new ExpressReceiver({
    signingSecret,
    app: expressApp,
    endpoints: '/slack/events',
  });

  const app = new App({ token: botToken, receiver });

  // /campaign Seidra targeting Norwegian SaaS founders 50-200 employees
  app.command('/campaign', async ({ command, ack, respond }) => {
    await ack();

    const text = command.text.trim();
    if (!text) {
      await respond('Usage: `/campaign <company> targeting <audience>`\nExample: `/campaign Seidra targeting Norwegian SaaS founders 50-200 employees`');
      return;
    }

    // Parse: "CompanyName targeting audience description"
    const match = text.match(/^(.+?)\s+targeting\s+(.+)$/i);
    if (!match) {
      await respond('Format: `/campaign <company> targeting <audience>`\nExample: `/campaign Seidra targeting Norwegian SaaS founders 50-200 employees`');
      return;
    }

    const company = match[1].trim();
    const audience = match[2].trim();

    try {
      const rows = await query<{ id: string }>(
        'INSERT INTO campaigns (company, audience) VALUES ($1, $2) RETURNING id',
        [company, audience]
      );
      const campaignId = rows[0].id;

      await respond({
        blocks: [
          {
            type: 'section',
            text: {
              type: 'mrkdwn',
              text: `:rocket: *Campaign started!*\n*Company:* ${company}\n*Audience:* ${audience}\n*ID:* \`${campaignId}\`\n\nPipeline is running: finding leads → enriching → scoring → building sequences → uploading to Instantly (paused).\n\nI'll notify you when it's ready for approval.`,
            },
          },
        ],
      });

      // Run pipeline in background
      runPipeline(campaignId)
        .then(async () => {
          const campaign = await queryOne<{ lead_count: number; status: string }>(
            'SELECT lead_count, status FROM campaigns WHERE id = $1', [campaignId]
          );

          const webhookUrl = command.response_url;
          await fetch(webhookUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              text: `:white_check_mark: *Campaign ready for review!*\n*${company}* targeting *${audience}*\n*Leads:* ${campaign?.lead_count || 0}\n*Status:* ${campaign?.status}\n\nApprove with: \`/approve ${campaignId}\``,
            }),
          });
        })
        .catch(async (err) => {
          logger.error(`Pipeline failed for ${campaignId}`, { error: err });
          await query("UPDATE campaigns SET status = 'failed', updated_at = NOW() WHERE id = $1", [campaignId]);

          const webhookUrl = command.response_url;
          await fetch(webhookUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              text: `:x: *Campaign failed:* ${company} targeting ${audience}\nError: ${err.message}\nID: \`${campaignId}\``,
            }),
          });
        });
    } catch (err: any) {
      await respond(`:x: Failed to create campaign: ${err.message}`);
    }
  });

  // /approve <campaign_id>
  app.command('/approve', async ({ command, ack, respond }) => {
    await ack();

    const campaignId = command.text.trim();
    if (!campaignId) {
      await respond('Usage: `/approve <campaign_id>`');
      return;
    }

    try {
      const campaign = await queryOne<{ company: string; audience: string; lead_count: number }>(
        'SELECT company, audience, lead_count FROM campaigns WHERE id = $1', [campaignId]
      );

      if (!campaign) {
        await respond(`:x: Campaign \`${campaignId}\` not found`);
        return;
      }

      await approveCampaign(campaignId);
      await respond(`:white_check_mark: *Campaign approved and launched!*\n*${campaign.company}* targeting *${campaign.audience}*\n*${campaign.lead_count} leads* now sending on Instantly.`);
    } catch (err: any) {
      await respond(`:x: Failed to approve: ${err.message}`);
    }
  });

  // /campaigns — list all campaigns
  app.command('/campaigns', async ({ command, ack, respond }) => {
    await ack();

    const campaigns = await query<{
      id: string; company: string; audience: string; status: string; lead_count: number; created_at: string;
    }>('SELECT id, company, audience, status, lead_count, created_at FROM campaigns ORDER BY created_at DESC LIMIT 10');

    if (campaigns.length === 0) {
      await respond('No campaigns yet. Start one with `/campaign <company> targeting <audience>`');
      return;
    }

    const statusEmoji: Record<string, string> = {
      created: ':white_circle:',
      finding_leads: ':mag:',
      enriching: ':sparkles:',
      scoring: ':bar_chart:',
      building_sequences: ':pencil:',
      uploading: ':arrow_up:',
      ready_for_review: ':eyes:',
      active: ':large_green_circle:',
      failed: ':red_circle:',
      no_leads_found: ':warning:',
    };

    const lines = campaigns.map(c => {
      const emoji = statusEmoji[c.status] || ':grey_question:';
      return `${emoji} *${c.company}* → ${c.audience} | ${c.lead_count} leads | \`${c.status}\`\n    ID: \`${c.id}\``;
    });

    await respond({
      blocks: [
        { type: 'header', text: { type: 'plain_text', text: 'Your Campaigns' } },
        { type: 'section', text: { type: 'mrkdwn', text: lines.join('\n\n') } },
      ],
    });
  });

  // /report — force daily tracking
  app.command('/report', async ({ command, ack, respond }) => {
    await ack();
    await respond(':hourglass_flowing_sand: Running daily tracking report...');

    try {
      await runDailyTracking();
      await fetch(command.response_url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: ':white_check_mark: Daily report sent! Check the channel for the digest.' }),
      });
    } catch (err: any) {
      await fetch(command.response_url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: `:x: Report failed: ${err.message}` }),
      });
    }
  });

  logger.info('Slack bot initialized with commands: /campaign, /approve, /campaigns, /report');
}
