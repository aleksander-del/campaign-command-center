import { LeadSource, Lead, LeadQuery } from './interface';
import { logger } from '../logger';

// Airscale is an enrichment API (reverse email/domain lookup), not a lead search engine.
// findLeads returns [] — use enrichByEmail() to enrich leads from other sources.

export class AirscaleSource implements LeadSource {
  name = 'airscale';
  private apiKey: string;
  private baseUrl = 'https://api.airscale.io/v1';

  constructor() {
    this.apiKey = process.env.AIRSCALE_API_KEY || '';
  }

  isConfigured(): boolean {
    return !!this.apiKey;
  }

  async findLeads(_query: LeadQuery): Promise<Lead[]> {
    // Airscale doesn't support lead search — only enrichment
    return [];
  }

  async enrichByEmail(email: string): Promise<Record<string, any> | null> {
    if (!this.isConfigured()) return null;

    try {
      const res = await fetch(`${this.baseUrl}/reverse-email`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${this.apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ email }),
      });

      if (!res.ok) return null;
      return await res.json() as Record<string, any>;
    } catch (err) {
      logger.error('Airscale enrichment failed', { error: err });
      return null;
    }
  }
}
