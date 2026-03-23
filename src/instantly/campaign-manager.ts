import * as instantly from './client';
import { SequenceStep } from '../campaigns/sequence-builder';
import { query } from '../db/client';
import { logger } from '../logger';

export async function createAndUploadCampaign(
  campaignId: string,
  campaignName: string,
  leads: Array<{
    email: string;
    first_name?: string;
    last_name?: string;
    company_name?: string;
    hook?: string;
  }>,
  sequence: SequenceStep[],
): Promise<string> {
  // 1. Create campaign on Instantly
  const instantlyCampaignId = await instantly.createCampaign(campaignName);

  // 2. Upload leads with custom variables
  const instantlyLeads = leads
    .filter(l => l.email) // Only leads with emails
    .map(l => ({
      email: l.email,
      first_name: l.first_name,
      last_name: l.last_name,
      company_name: l.company_name,
      custom_variables: {
        hook: l.hook || '',
      },
    }));

  await instantly.addLeadsToCampaign(instantlyCampaignId, instantlyLeads);

  // 3. Set sequence
  await instantly.setCampaignSequence(instantlyCampaignId, sequence);

  // 4. Pause campaign (wait for approval)
  await instantly.pauseCampaign(instantlyCampaignId);

  // 5. Update DB
  await query(
    'UPDATE campaigns SET instantly_campaign_id = $1, status = $2, lead_count = $3, updated_at = NOW() WHERE id = $4',
    [instantlyCampaignId, 'ready_for_review', instantlyLeads.length, campaignId]
  );

  logger.info(`Campaign ${campaignName} uploaded to Instantly (PAUSED). ${instantlyLeads.length} leads, ${sequence.length} steps.`);
  return instantlyCampaignId;
}

export async function approveCampaign(campaignId: string): Promise<void> {
  const rows = await query<{ instantly_campaign_id: string }>(
    'SELECT instantly_campaign_id FROM campaigns WHERE id = $1',
    [campaignId]
  );

  if (!rows[0]?.instantly_campaign_id) {
    throw new Error('Campaign not found or not uploaded to Instantly yet');
  }

  await instantly.activateCampaign(rows[0].instantly_campaign_id);

  await query(
    'UPDATE campaigns SET status = $1, updated_at = NOW() WHERE id = $2',
    ['active', campaignId]
  );

  logger.info(`Campaign ${campaignId} approved and activated on Instantly`);
}
