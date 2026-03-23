import { query, queryOne } from '../db/client';
import { ALeadsSource } from '../sources/a-leads';
import { AirscaleSource } from '../sources/airscale';
import { AimfoxSource } from '../sources/aimfox';
import { GoogleMapsSource } from '../sources/google-maps';
import { deduplicateLeads } from '../sources/deduplicator';
import { enrichLead } from '../enrichment/enricher';
import { detectSignals, Signal } from '../enrichment/signal-detector';
import { scoreLead } from '../enrichment/scorer';
import { writeHook } from '../campaigns/hook-writer';
import { buildSequence, SequenceStep } from '../campaigns/sequence-builder';
import { createAndUploadCampaign } from '../instantly/campaign-manager';
import { LeadQuery, Lead } from '../sources/interface';
import { logger } from '../logger';

const sources = [
  new ALeadsSource(),
  new AirscaleSource(),
  new AimfoxSource(),
  new GoogleMapsSource(),
];

async function logStep(campaignId: string, step: string, status: string, result?: any, error?: string) {
  await query(
    'INSERT INTO pipeline_runs (campaign_id, step, status, result, error, completed_at) VALUES ($1, $2, $3, $4, $5, $6)',
    [campaignId, step, status, result ? JSON.stringify(result) : '{}', error || null, status !== 'running' ? new Date() : null]
  );
}

export async function runPipeline(campaignId: string): Promise<void> {
  const campaign = await queryOne<{
    id: string; company: string; audience: string; icp_config: any; sources: string[];
  }>('SELECT * FROM campaigns WHERE id = $1', [campaignId]);

  if (!campaign) throw new Error(`Campaign ${campaignId} not found`);

  const leadQuery: LeadQuery = {
    company: campaign.company,
    audience: campaign.audience,
    limit: 50,
  };

  // ── STEP 1: Find Leads ──
  await query("UPDATE campaigns SET status = 'finding_leads', updated_at = NOW() WHERE id = $1", [campaignId]);
  await logStep(campaignId, 'finding_leads', 'running');

  let allLeads: Lead[] = [];
  const activeSources = sources.filter(s => s.isConfigured());
  logger.info(`Finding leads from ${activeSources.length} sources: ${activeSources.map(s => s.name).join(', ')}`);

  const sourceResults = await Promise.allSettled(
    activeSources.map(s => s.findLeads(leadQuery))
  );

  for (const result of sourceResults) {
    if (result.status === 'fulfilled') {
      allLeads.push(...result.value);
    }
  }

  allLeads = deduplicateLeads(allLeads);
  await logStep(campaignId, 'finding_leads', 'completed', { count: allLeads.length });
  logger.info(`Found ${allLeads.length} unique leads`);

  if (allLeads.length === 0) {
    await query("UPDATE campaigns SET status = 'no_leads_found', updated_at = NOW() WHERE id = $1", [campaignId]);
    return;
  }

  // ── STEP 2: Enrich ──
  await query("UPDATE campaigns SET status = 'enriching', updated_at = NOW() WHERE id = $1", [campaignId]);
  await logStep(campaignId, 'enriching', 'running');

  for (const lead of allLeads) {
    const enrichment = await enrichLead(lead);
    lead.industry = lead.industry || enrichment.industry;
    lead.employee_count = lead.employee_count || enrichment.employee_count;
    lead.website = lead.website || enrichment.website;
    (lead as any).enrichment_data = enrichment;
  }

  await logStep(campaignId, 'enriching', 'completed', { enriched: allLeads.length });

  // ── STEP 3: Detect Signals & Score ──
  await query("UPDATE campaigns SET status = 'scoring', updated_at = NOW() WHERE id = $1", [campaignId]);
  await logStep(campaignId, 'scoring', 'running');

  const signalsByLead: Signal[][] = [];
  for (const lead of allLeads) {
    const signals = await detectSignals({
      company_name: lead.company_name,
      industry: lead.industry,
      enrichment_data: (lead as any).enrichment_data,
    });
    signalsByLead.push(signals);
  }

  const scored = allLeads.map((lead, i) => ({
    ...lead,
    ...scoreLead(lead, signalsByLead[i], campaign.audience),
    signals: signalsByLead[i],
  }));

  // Sort by score descending, keep TIER_1 and TIER_2
  const qualifiedLeads = scored
    .sort((a, b) => b.score - a.score)
    .filter(l => l.tier === 'TIER_1' || l.tier === 'TIER_2');

  await logStep(campaignId, 'scoring', 'completed', {
    total: scored.length,
    qualified: qualifiedLeads.length,
    tier1: qualifiedLeads.filter(l => l.tier === 'TIER_1').length,
    tier2: qualifiedLeads.filter(l => l.tier === 'TIER_2').length,
  });

  // Save leads to DB
  for (const lead of qualifiedLeads) {
    await query(
      `INSERT INTO leads (campaign_id, email, first_name, last_name, company_name, title, phone, linkedin_url, website, industry, employee_count, location, source, signals, score, tier, enrichment_data)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17)
       ON CONFLICT (campaign_id, email) DO NOTHING`,
      [campaignId, lead.email, lead.first_name, lead.last_name, lead.company_name, lead.title, lead.phone, lead.linkedin_url, lead.website, lead.industry, lead.employee_count, lead.location, lead.source, JSON.stringify(lead.signals), lead.score, lead.tier, JSON.stringify((lead as any).enrichment_data || {})]
    );
  }

  // ── STEP 4: Build Sequences ──
  await query("UPDATE campaigns SET status = 'building_sequences', updated_at = NOW() WHERE id = $1", [campaignId]);
  await logStep(campaignId, 'building_sequences', 'running');

  const senderCompany = campaign.icp_config?.sender_company || campaign.company;
  const senderName = campaign.icp_config?.sender_name || 'Team';

  const hooks: string[] = [];
  const sequences: SequenceStep[][] = [];

  for (let i = 0; i < qualifiedLeads.length; i++) {
    const lead = qualifiedLeads[i];
    const hook = await writeHook(lead, signalsByLead[i] || [], senderCompany);
    hooks.push(hook);

    const seq = await buildSequence(lead, signalsByLead[i] || [], hook, senderCompany, senderName);
    sequences.push(seq);

    // Update lead in DB
    await query(
      'UPDATE leads SET hook = $1, sequence = $2 WHERE campaign_id = $3 AND email = $4',
      [hook, JSON.stringify(seq), campaignId, lead.email]
    );
  }

  await logStep(campaignId, 'building_sequences', 'completed', { count: sequences.length });

  // ── STEP 5: Upload to Instantly (PAUSED) ──
  await query("UPDATE campaigns SET status = 'uploading', updated_at = NOW() WHERE id = $1", [campaignId]);
  await logStep(campaignId, 'uploading', 'running');

  const leadsWithEmails = qualifiedLeads.filter(l => l.email);
  if (leadsWithEmails.length === 0) {
    await query("UPDATE campaigns SET status = 'no_emails_found', updated_at = NOW() WHERE id = $1", [campaignId]);
    return;
  }

  // Use the first lead's sequence as the campaign sequence template
  const campaignSequence = sequences[0] || [];

  await createAndUploadCampaign(
    campaignId,
    `${campaign.company} — ${campaign.audience}`,
    leadsWithEmails.map((l, i) => ({
      email: l.email!,
      first_name: l.first_name,
      last_name: l.last_name,
      company_name: l.company_name,
      hook: hooks[i],
    })),
    campaignSequence,
  );

  await logStep(campaignId, 'uploading', 'completed', { leads_uploaded: leadsWithEmails.length });

  logger.info(`Pipeline complete for ${campaign.company}. ${leadsWithEmails.length} leads uploaded. Awaiting approval.`);
}
