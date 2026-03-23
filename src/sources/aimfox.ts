import { LeadSource, Lead, LeadQuery } from './interface';
import { logger } from '../logger';

// Aimfox is a LinkedIn automation tool — its API manages leads from existing campaigns,
// not a lead search engine. findLeads pulls leads from your Aimfox campaigns.

export class AimfoxSource implements LeadSource {
  name = 'aimfox';
  private apiKey: string;
  private baseUrl = 'https://api.aimfox.com/api/v1';

  constructor() {
    this.apiKey = process.env.AIMFOX_API_KEY || '';
  }

  isConfigured(): boolean {
    return !!this.apiKey;
  }

  async findLeads(query: LeadQuery): Promise<Lead[]> {
    if (!this.isConfigured()) return [];

    try {
      // List leads from Aimfox campaigns
      const res = await fetch(`${this.baseUrl}/leads?limit=${query.limit || 50}`, {
        headers: {
          'Authorization': `Bearer ${this.apiKey}`,
          'Content-Type': 'application/json',
        },
      });

      if (!res.ok) {
        const text = await res.text();
        logger.error(`Aimfox API error: ${res.status} ${text.slice(0, 200)}`);
        return [];
      }

      const data = await res.json() as any;
      const results = data.data || data.leads || data.results || [];

      logger.info(`Aimfox returned ${results.length} leads from campaigns`);

      return results.map((r: any) => ({
        email: r.email,
        first_name: r.first_name || r.firstName || r.name?.split(' ')[0],
        last_name: r.last_name || r.lastName || r.name?.split(' ').slice(1).join(' '),
        company_name: r.company_name || r.company || r.organization,
        title: r.title || r.headline || r.job_title,
        phone: r.phone,
        linkedin_url: r.linkedin_url || r.profile_url || r.linkedin,
        website: r.website,
        industry: r.industry,
        employee_count: r.employee_count,
        location: r.location,
        source: 'aimfox',
      }));
    } catch (err) {
      logger.error('Aimfox search failed', { error: err });
      return [];
    }
  }
}
