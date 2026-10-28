import { Router } from 'express';
import { Opportunity } from '../models/Opportunity.js';
import { wrap } from '../lib/errors.js';

const router = Router();

// The landing page shows a few open roles to visitors who are not logged in yet.
// Only headline fields are exposed.
router.get(
  '/opportunities',
  wrap(async (_req, res) => {
    const opps = await Opportunity.find({ status: 'open', deadline: { $gte: new Date() } })
      .sort({ deadline: 1 })
      .limit(6)
      .select('title type location pay deadline employer')
      .populate('employer', 'employer.company');
    res.json({ opportunities: opps });
  }),
);

export default router;
