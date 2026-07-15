import { db } from '../db';

/**
 * Demo-build only (VITE_DEMO=1): fills the local database with sample data on
 * first load so every view has something to show. Never bundled in the real app.
 */
export async function seedDemo(): Promise<void> {
  const existing = await db.dumps.count();
  if (existing > 0) return;

  const now = Date.now();
  const h = 3600e3;
  const d = 24 * h;

  await db.goals.bulkAdd([
    { title: 'Grow AI Driver ROI revenue', color: '#5eead4', createdAt: now - 20 * d },
    { title: 'Launch content engine', color: '#a78bfa', createdAt: now - 12 * d }
  ]);
  const [goalRevenue, goalContent] = await db.goals.toCollection().primaryKeys();

  const dump1 = await db.dumps.add({
    createdAt: now - 2 * h,
    duration: 143,
    transcript:
      "Okay so I was thinking about the outreach campaign again. We really need to follow up with the three dealerships from last week, especially the one in Tampa because they seemed ready to sign. Also had this idea about turning our onboarding calls into short case study videos, that could be huge for outreach. And I keep forgetting to fix the pricing page — the ROI calculator is showing the wrong monthly number. Oh and Marcus mentioned some scheduling tool for demo bookings, should look into that at some point.",
    title: 'Outreach, case studies & pricing fix',
    summary:
      'Follow-ups with the dealerships from last week, an idea to turn onboarding calls into case-study videos, and a bug on the pricing page.',
    status: 'processed'
  });

  const dump2 = await db.dumps.add({
    createdAt: now - 2 * d,
    duration: 87,
    transcript:
      "Random thought while driving — what if the weekly review was voice-first too? Every Friday I just ramble about how the week went and it compares that against my goals. Also the ROI calculator could be its own lead magnet, like a standalone shareable page that captures emails before showing the full breakdown.",
    title: 'Voice reviews & ROI lead magnet',
    summary: 'Two product ideas: a voice-first weekly review and the ROI calculator as a standalone lead magnet.',
    status: 'processed'
  });

  await db.tasks.bulkAdd([
    {
      dumpId: dump1,
      goalId: goalRevenue,
      title: 'Follow up with Tampa dealership',
      detail: 'They seemed ready to sign after last week’s demo.',
      status: 'today',
      priority: 'urgent',
      revenueImpact: 3,
      createdAt: now - 2 * h
    },
    {
      dumpId: dump1,
      goalId: goalRevenue,
      title: 'Fix ROI calculator monthly number on pricing page',
      status: 'today',
      priority: 'high',
      revenueImpact: 2,
      createdAt: now - 2 * h
    },
    {
      dumpId: dump1,
      goalId: goalRevenue,
      title: 'Email the other two dealerships a recap',
      status: 'inbox',
      priority: 'medium',
      revenueImpact: 2,
      createdAt: now - 2 * h
    },
    {
      dumpId: dump1,
      goalId: goalContent,
      title: 'Storyboard onboarding-call case study video',
      status: 'inbox',
      priority: 'medium',
      revenueImpact: 1,
      createdAt: now - 2 * h
    },
    {
      title: 'Check Stripe payout schedule',
      status: 'done',
      priority: 'low',
      revenueImpact: 0,
      createdAt: now - d,
      completedAt: now - 5 * h
    }
  ]);

  await db.notes.bulkAdd([
    {
      dumpId: dump1,
      kind: 'idea',
      title: 'Case study videos from onboarding calls',
      content: 'Turn recorded onboarding calls into short case-study clips for outreach and the website.',
      theme: 'marketing',
      createdAt: now - 2 * h
    },
    {
      dumpId: dump2,
      kind: 'idea',
      title: 'ROI calculator as lead magnet',
      content: 'Standalone shareable ROI calculator that captures emails before showing the full breakdown.',
      theme: 'marketing',
      createdAt: now - 2 * d
    },
    {
      dumpId: dump2,
      kind: 'idea',
      title: 'Voice-first weekly review',
      content: 'Every Friday, ramble a review; the app compares it against the week’s goals.',
      theme: 'app idea',
      createdAt: now - 2 * d
    },
    {
      dumpId: dump1,
      kind: 'note',
      title: 'Tampa dealership is warm',
      content: 'They responded well to the demo and asked about contract terms.',
      theme: 'sales',
      createdAt: now - 2 * h
    },
    {
      dumpId: dump1,
      kind: 'note',
      title: 'Marcus recommended a scheduling tool',
      content: 'For demo bookings — get the name from him and trial it.',
      theme: 'ops',
      createdAt: now - 2 * h
    }
  ]);
}
