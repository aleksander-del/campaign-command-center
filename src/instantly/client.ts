import { logger } from '../logger';

const BASE_URL = 'https://api.instantly.ai/api/v2';

async function instantlyFetch(path: string, options: RequestInit = {}): Promise<any> {
  const apiKey = process.env.INSTANTLY_API_KEY;
  if (!apiKey) throw new Error('INSTANTLY_API_KEY not set');

  const res = await fetch(`${BASE_URL}${path}`, {
    ...options,
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
      ...options.headers,
    },
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Instantly API error ${res.status}: ${text}`);
  }

  return res.json();
}

export async function listCampaigns(): Promise<any[]> {
  const data = await instantlyFetch('/campaigns');
  return data.items || data || [];
}

export async function createCampaign(name: string): Promise<string> {
  const data = await instantlyFetch('/campaigns', {
    method: 'POST',
    body: JSON.stringify({ name }),
  });
  logger.info(`Created Instantly campaign: ${data.id} (${name})`);
  return data.id;
}

export async function addLeadsToCampaign(campaignId: string, leads: Array<{
  email: string;
  first_name?: string;
  last_name?: string;
  company_name?: string;
  custom_variables?: Record<string, string>;
}>): Promise<void> {
  // Instantly accepts leads in batches
  const batchSize = 100;
  for (let i = 0; i < leads.length; i += batchSize) {
    const batch = leads.slice(i, i + batchSize);
    await instantlyFetch('/leads', {
      method: 'POST',
      body: JSON.stringify({
        campaign_id: campaignId,
        leads: batch.map(l => ({
          email: l.email,
          first_name: l.first_name,
          last_name: l.last_name,
          company_name: l.company_name,
          ...l.custom_variables,
        })),
      }),
    });
  }
  logger.info(`Added ${leads.length} leads to campaign ${campaignId}`);
}

export async function setCampaignSequence(campaignId: string, steps: Array<{
  subject: string;
  body: string;
  day: number;
}>): Promise<void> {
  await instantlyFetch(`/campaigns/${campaignId}/sequences`, {
    method: 'POST',
    body: JSON.stringify({
      sequences: [{
        steps: steps.map((s, i) => ({
          type: 'email',
          subject: s.subject,
          body: s.body,
          delay: s.day,
          variant: 'A',
          order: i,
        })),
      }],
    }),
  });
  logger.info(`Set ${steps.length}-step sequence for campaign ${campaignId}`);
}

export async function pauseCampaign(campaignId: string): Promise<void> {
  await instantlyFetch(`/campaigns/${campaignId}/status`, {
    method: 'POST',
    body: JSON.stringify({ status: 'paused' }),
  });
  logger.info(`Paused campaign ${campaignId}`);
}

export async function activateCampaign(campaignId: string): Promise<void> {
  await instantlyFetch(`/campaigns/${campaignId}/status`, {
    method: 'POST',
    body: JSON.stringify({ status: 'active' }),
  });
  logger.info(`Activated campaign ${campaignId}`);
}

export async function getCampaignAnalytics(campaignIds?: string[]): Promise<any> {
  const params = campaignIds ? `?campaign_ids=${campaignIds.join(',')}` : '';
  return instantlyFetch(`/campaigns/analytics${params}`);
}

export async function listReplies(campaignId?: string): Promise<any[]> {
  const params = campaignId ? `?campaign_id=${campaignId}` : '';
  const data = await instantlyFetch(`/emails/replies${params}`);
  return data.items || data || [];
}

export async function listSendingAccounts(): Promise<any[]> {
  const data = await instantlyFetch('/accounts');
  return data.items || data || [];
}
