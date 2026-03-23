import express from 'express';
import cron from 'node-cron';
import { initDb } from './db/client';
import { runDailyTracking } from './tracking/daily-tracker';
import campaignRoutes from './routes/campaigns';
import { initSlackBot } from './slack/bot';
import { logger } from './logger';

const app = express();
app.use(express.json());

// Health check
app.get('/health', (_req, res) => {
  res.json({ status: 'ok', service: 'campaign-command-center', timestamp: new Date().toISOString() });
});

// API routes
app.use('/campaigns', campaignRoutes);

// Root
app.get('/', (_req, res) => {
  res.json({
    service: 'Campaign Command Center',
    version: '1.0.0',
    endpoints: {
      'POST /campaigns': 'Create a new campaign pipeline',
      'GET /campaigns': 'List all campaigns',
      'GET /campaigns/:id': 'Get campaign details + leads + metrics',
      'GET /campaigns/:id/leads': 'Get campaign leads',
      'POST /campaigns/:id/approve': 'Approve and launch on Instantly',
      'POST /campaigns/:id/leads/import': 'Import CSV leads',
      'POST /campaigns/daily-report': 'Force daily tracking report',
    },
  });
});

async function start() {
  // Initialize database
  await initDb();

  // Daily tracking cron — 08:00 CET every day
  cron.schedule('0 7 * * *', async () => {
    logger.info('Running scheduled daily tracking...');
    try {
      await runDailyTracking();
    } catch (err) {
      logger.error('Scheduled daily tracking failed', { error: err });
    }
  }, { timezone: 'Europe/Oslo' });

  // Initialize Slack bot (slash commands)
  initSlackBot(app);

  const port = process.env.PORT || 3000;
  app.listen(port, () => {
    logger.info(`Campaign Command Center running on port ${port}`);
  });
}

start().catch(err => {
  logger.error('Failed to start', { error: err });
  process.exit(1);
});
