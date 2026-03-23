import { Router } from 'express';
import { z } from 'zod';
import { query, queryOne } from '../db/client';
import { runPipeline } from '../orchestrator/pipeline';
import { approveCampaign } from '../instantly/campaign-manager';
import { parseCsvLeads } from '../sources/csv-import';
import { runDailyTracking } from '../tracking/daily-tracker';
import { logger } from '../logger';
import multer from 'multer';

const router = Router();
const upload = multer({ storage: multer.memoryStorage() });

const createCampaignSchema = z.object({
  company: z.string().min(1),
  audience: z.string().min(1),
  icp_config: z.record(z.any()).optional(),
  sources: z.array(z.string()).optional(),
});

// POST /campaigns — Create and start a new campaign pipeline
router.post('/', async (req, res) => {
  try {
    const { company, audience, icp_config, sources } = createCampaignSchema.parse(req.body);

    const rows = await query<{ id: string }>(
      'INSERT INTO campaigns (company, audience, icp_config, sources) VALUES ($1, $2, $3, $4) RETURNING id',
      [company, audience, JSON.stringify(icp_config || {}), sources || []]
    );

    const campaignId = rows[0].id;
    logger.info(`Campaign created: ${campaignId} — ${company} targeting ${audience}`);

    // Run pipeline in background
    runPipeline(campaignId).catch(err => {
      logger.error(`Pipeline failed for ${campaignId}`, { error: err });
      query("UPDATE campaigns SET status = 'failed', updated_at = NOW() WHERE id = $1", [campaignId]);
    });

    res.json({ campaign_id: campaignId, status: 'finding_leads', message: `Campaign started for ${company}. Pipeline is running.` });
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});

// GET /campaigns — List all campaigns
router.get('/', async (_req, res) => {
  const campaigns = await query(
    'SELECT id, company, audience, status, lead_count, instantly_campaign_id, created_at, updated_at FROM campaigns ORDER BY created_at DESC'
  );
  res.json(campaigns);
});

// GET /campaigns/:id — Get campaign details
router.get('/:id', async (req, res) => {
  const campaign = await queryOne('SELECT * FROM campaigns WHERE id = $1', [req.params.id]);
  if (!campaign) return res.status(404).json({ error: 'Campaign not found' });

  const leads = await query('SELECT * FROM leads WHERE campaign_id = $1 ORDER BY score DESC', [req.params.id]);
  const steps = await query('SELECT * FROM pipeline_runs WHERE campaign_id = $1 ORDER BY started_at', [req.params.id]);
  const metrics = await query('SELECT * FROM daily_metrics WHERE campaign_id = $1 ORDER BY date DESC LIMIT 30', [req.params.id]);

  res.json({ ...campaign, leads, pipeline_steps: steps, metrics });
});

// GET /campaigns/:id/leads — Get campaign leads
router.get('/:id/leads', async (req, res) => {
  const leads = await query('SELECT * FROM leads WHERE campaign_id = $1 ORDER BY score DESC', [req.params.id]);
  res.json(leads);
});

// POST /campaigns/:id/approve — Approve and activate campaign on Instantly
router.post('/:id/approve', async (req, res) => {
  try {
    await approveCampaign(req.params.id);
    res.json({ status: 'approved', message: 'Campaign activated on Instantly. Emails will start sending.' });
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});

// POST /campaigns/:id/leads/import — Import CSV leads to existing campaign
router.post('/:id/leads/import', upload.single('file'), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'No CSV file uploaded' });

    const csvContent = req.file.buffer.toString('utf-8');
    const leads = parseCsvLeads(csvContent, 'csv-import');

    let imported = 0;
    for (const lead of leads) {
      try {
        await query(
          `INSERT INTO leads (campaign_id, email, first_name, last_name, company_name, title, phone, linkedin_url, website, industry, employee_count, location, source)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)
           ON CONFLICT (campaign_id, email) DO NOTHING`,
          [req.params.id, lead.email, lead.first_name, lead.last_name, lead.company_name, lead.title, lead.phone, lead.linkedin_url, lead.website, lead.industry, lead.employee_count, lead.location, lead.source]
        );
        imported++;
      } catch { /* skip duplicates */ }
    }

    res.json({ imported, total: leads.length, message: `Imported ${imported} leads` });
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});

// POST /campaigns/daily-report — Force a daily tracking run
router.post('/daily-report', async (_req, res) => {
  try {
    await runDailyTracking();
    res.json({ status: 'ok', message: 'Daily tracking report sent' });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
