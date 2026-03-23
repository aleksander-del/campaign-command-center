import { LeadSource, Lead, LeadQuery } from './interface';
import { logger } from '../logger';

export class AimfoxSource implements LeadSource {
  name = 'aimfox';
  private apiKey: string;
  private baseUrl = 'https://api.aimfox.com/v1';

  constructor() {
    this.apiKey = process.env.AIMFOX_API_KEY || '';
  }

  isConfigured(): boolean {
    return !!this.apiKey;
  }

  async findLeads(query: LeadQuery): Promise<Lead[]> {
    if (!this.isConfigured()) return [];

    try {
      const res = await fetch(`${this.baseUrl}/leads/search`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${this.apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          keywords: query.audience,
          company: query.company,
          location: query.location,
          limit: query.limit || 50,
        }),
      });

      if (!res.ok) {
        logger.error(`Aimfox API error: ${res.status} ${await res.text()}`);
        return [];
      }

      const data = await res.json() as any;
      const results = data.leads || data.results || data.data || [];

      return results.map((r: any) => ({
        email: r.email,
        first_name: r.first_name || r.firstName,
        last_name: r.last_name || r.lastName,
        company_name: r.company_name || r.company,
        title: r.title || r.headline,
        phone: r.phone,
        linkedin_url: r.linkedin_url || r.profile_url,
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
