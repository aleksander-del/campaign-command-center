import { Signal } from './signal-detector';
import { logger } from '../logger';

export interface ScoredLead {
  score: number; // 0-100
  tier: 'TIER_1' | 'TIER_2' | 'TIER_3' | 'TIER_4';
  breakdown: {
    icp_fit: number;      // 0-40
    signal_strength: number; // 0-35
    engagement: number;   // 0-25
  };
}

export function scoreLead(lead: {
  email?: string;
  title?: string;
  company_name?: string;
  industry?: string;
  employee_count?: number;
  linkedin_url?: string;
  website?: string;
  phone?: string;
}, signals: Signal[], audience: string): ScoredLead {
  // ICP Fit (40 points)
  let icp_fit = 0;
  if (lead.company_name) icp_fit += 10;
  if (lead.industry) icp_fit += 10;
  if (lead.employee_count && lead.employee_count >= 10) icp_fit += 10;
  if (lead.title && matchesAudience(lead.title, audience)) icp_fit += 10;

  // Signal Strength (35 points)
  let signal_strength = 0;
  const highSignals = signals.filter(s => s.strength === 'HIGH').length;
  const medSignals = signals.filter(s => s.strength === 'MEDIUM').length;
  signal_strength += Math.min(highSignals * 12, 24);
  signal_strength += Math.min(medSignals * 4, 8);
  if (signals.length >= 3) signal_strength += 3; // Diversity bonus

  // Engagement Potential (25 points)
  let engagement = 0;
  if (lead.email) engagement += 10;
  if (lead.linkedin_url) engagement += 8;
  if (lead.website) engagement += 4;
  if (lead.phone) engagement += 3;

  const score = Math.min(icp_fit + signal_strength + engagement, 100);
  const tier = score >= 80 ? 'TIER_1' : score >= 60 ? 'TIER_2' : score >= 40 ? 'TIER_3' : 'TIER_4';

  return { score, tier, breakdown: { icp_fit, signal_strength, engagement } };
}

function matchesAudience(title: string, audience: string): boolean {
  const titleLower = title.toLowerCase();
  const keywords = audience.toLowerCase().split(/\s+/);
  return keywords.some(k => k.length > 3 && titleLower.includes(k));
}

export function scoreLeadsBatch(
  leads: Array<{ email?: string; title?: string; company_name?: string; industry?: string; employee_count?: number; linkedin_url?: string; website?: string; phone?: string }>,
  signalsByIndex: Signal[][],
  audience: string,
): ScoredLead[] {
  const results = leads.map((lead, i) => scoreLead(lead, signalsByIndex[i] || [], audience));
  const tier1 = results.filter(r => r.tier === 'TIER_1').length;
  const tier2 = results.filter(r => r.tier === 'TIER_2').length;
  logger.info(`Scored ${leads.length} leads: ${tier1} TIER_1, ${tier2} TIER_2`);
  return results;
}
