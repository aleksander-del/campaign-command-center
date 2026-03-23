import { google } from 'googleapis';
import { logger } from '../logger';

async function getSheetsClient() {
  const json = process.env.GOOGLE_SERVICE_ACCOUNT_JSON;
  if (!json) throw new Error('GOOGLE_SERVICE_ACCOUNT_JSON not set');

  const credentials = JSON.parse(json);
  const auth = new google.auth.GoogleAuth({
    credentials,
    scopes: ['https://www.googleapis.com/auth/spreadsheets'],
  });

  return google.sheets({ version: 'v4', auth });
}

export async function appendDailyMetrics(campaignName: string, metrics: {
  sent: number;
  opened: number;
  replied: number;
  bounced: number;
  positive_replies: number;
  meetings_booked: number;
  grade: string;
  decision: string;
}): Promise<void> {
  const sheetId = process.env.GOOGLE_SHEETS_ID;
  if (!sheetId) {
    logger.warn('GOOGLE_SHEETS_ID not configured, skipping sheet logging');
    return;
  }

  try {
    const sheets = await getSheetsClient();
    const date = new Date().toISOString().split('T')[0];
    const replyRate = metrics.sent > 0 ? ((metrics.replied / metrics.sent) * 100).toFixed(1) : '0';
    const openRate = metrics.sent > 0 ? ((metrics.opened / metrics.sent) * 100).toFixed(1) : '0';

    await sheets.spreadsheets.values.append({
      spreadsheetId: sheetId,
      range: 'Daily Metrics!A:K',
      valueInputOption: 'USER_ENTERED',
      requestBody: {
        values: [[
          date,
          campaignName,
          metrics.sent,
          metrics.opened,
          `${openRate}%`,
          metrics.replied,
          `${replyRate}%`,
          metrics.positive_replies,
          metrics.bounced,
          metrics.meetings_booked,
          `${metrics.grade} (${metrics.decision})`,
        ]],
      },
    });

    logger.info(`Logged metrics to Google Sheet for ${campaignName}`);
  } catch (err) {
    logger.error('Google Sheets logging failed', { error: err });
  }
}
