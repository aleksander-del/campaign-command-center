import { logger } from '../logger';

export interface DiagnosticResult {
  grade: 'A' | 'B' | 'C' | 'D';
  decision: 'SCALE' | 'OPTIMIZE' | 'KILL' | 'WAIT';
  layers: {
    deliverability: { score: string; detail: string };
    engagement: { score: string; detail: string };
    response: { score: string; detail: string };
    quality: { score: string; detail: string };
    conversion: { score: string; detail: string };
  };
  tips: string[];
}

// 2026 benchmarks from your campaign-analyzer
const BENCHMARKS = {
  reply_rate: { poor: 3, average: 3.43, good: 5.5, elite: 10.7 },
  open_rate: { poor: 30, average: 40, good: 60, elite: 70 },
  bounce_rate: { excellent: 1, safe: 2, warning: 5, critical: 10 },
  positive_reply_rate: { poor: 1, average: 2, good: 3, elite: 8 },
  reply_to_meeting: { poor: 20, average: 30, good: 40, elite: 50 },
};

export function runDiagnostics(metrics: {
  sent: number;
  opened: number;
  replied: number;
  bounced: number;
  positive_replies: number;
  meetings_booked: number;
}): DiagnosticResult {
  const { sent, opened, replied, bounced, positive_replies, meetings_booked } = metrics;

  if (sent < 200) {
    return {
      grade: 'B',
      decision: 'WAIT',
      layers: {
        deliverability: { score: 'N/A', detail: `${sent} sent — need 200+ for statistical significance` },
        engagement: { score: 'N/A', detail: 'Insufficient data' },
        response: { score: 'N/A', detail: 'Insufficient data' },
        quality: { score: 'N/A', detail: 'Insufficient data' },
        conversion: { score: 'N/A', detail: 'Insufficient data' },
      },
      tips: ['Keep running — need 200+ emails sent for reliable diagnostics'],
    };
  }

  const bounceRate = (bounced / sent) * 100;
  const openRate = sent > 0 ? (opened / sent) * 100 : 0;
  const replyRate = sent > 0 ? (replied / sent) * 100 : 0;
  const positiveRate = sent > 0 ? (positive_replies / sent) * 100 : 0;
  const meetingRate = replied > 0 ? (meetings_booked / replied) * 100 : 0;

  const tips: string[] = [];

  // Layer 1: Deliverability
  let delivScore: string;
  if (bounceRate <= BENCHMARKS.bounce_rate.excellent) delivScore = 'Excellent';
  else if (bounceRate <= BENCHMARKS.bounce_rate.safe) delivScore = 'Safe';
  else if (bounceRate <= BENCHMARKS.bounce_rate.warning) { delivScore = 'Warning'; tips.push('Bounce rate high — verify email list quality'); }
  else { delivScore = 'Critical'; tips.push('URGENT: Bounce rate critical — pause and clean list'); }

  // Layer 2: Engagement
  let engScore: string;
  if (openRate >= BENCHMARKS.open_rate.elite) engScore = 'Elite';
  else if (openRate >= BENCHMARKS.open_rate.good) engScore = 'Good';
  else if (openRate >= BENCHMARKS.open_rate.average) engScore = 'Average';
  else { engScore = 'Poor'; tips.push('Low open rate — test new subject lines'); }

  // Layer 3: Response
  let respScore: string;
  if (replyRate >= BENCHMARKS.reply_rate.elite) respScore = 'Elite';
  else if (replyRate >= BENCHMARKS.reply_rate.good) respScore = 'Good';
  else if (replyRate >= BENCHMARKS.reply_rate.average) respScore = 'Average';
  else { respScore = 'Poor'; tips.push('Low reply rate — review copy and targeting'); }

  // Layer 4: Quality
  let qualScore: string;
  if (positiveRate >= BENCHMARKS.positive_reply_rate.elite) qualScore = 'Elite';
  else if (positiveRate >= BENCHMARKS.positive_reply_rate.good) qualScore = 'Good';
  else if (positiveRate >= BENCHMARKS.positive_reply_rate.average) qualScore = 'Average';
  else { qualScore = 'Poor'; tips.push('Low positive reply rate — refine ICP or value prop'); }

  // Layer 5: Conversion
  let convScore: string;
  if (meetingRate >= BENCHMARKS.reply_to_meeting.elite) convScore = 'Elite';
  else if (meetingRate >= BENCHMARKS.reply_to_meeting.good) convScore = 'Good';
  else if (meetingRate >= BENCHMARKS.reply_to_meeting.average) convScore = 'Average';
  else { convScore = 'Poor'; tips.push('Low conversion — improve follow-up speed on positive replies'); }

  // Overall grade
  const scores = [delivScore, engScore, respScore, qualScore, convScore];
  const eliteCount = scores.filter(s => s === 'Elite' || s === 'Excellent').length;
  const poorCount = scores.filter(s => s === 'Poor' || s === 'Critical').length;

  let grade: 'A' | 'B' | 'C' | 'D';
  let decision: 'SCALE' | 'OPTIMIZE' | 'KILL' | 'WAIT';

  if (eliteCount >= 3 && poorCount === 0) { grade = 'A'; decision = 'SCALE'; }
  else if (poorCount <= 1) { grade = 'B'; decision = 'OPTIMIZE'; }
  else if (poorCount <= 2) { grade = 'C'; decision = 'OPTIMIZE'; }
  else { grade = 'D'; decision = 'KILL'; }

  return {
    grade,
    decision,
    layers: {
      deliverability: { score: delivScore, detail: `Bounce: ${bounceRate.toFixed(1)}%` },
      engagement: { score: engScore, detail: `Open: ${openRate.toFixed(1)}%` },
      response: { score: respScore, detail: `Reply: ${replyRate.toFixed(1)}%` },
      quality: { score: qualScore, detail: `Positive: ${positiveRate.toFixed(1)}%` },
      conversion: { score: convScore, detail: `Meeting: ${meetingRate.toFixed(1)}%` },
    },
    tips,
  };
}
