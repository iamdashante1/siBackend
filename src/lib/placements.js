import { Placement } from '../models/Placement.js';
import { Opportunity } from '../models/Opportunity.js';
import { User } from '../models/User.js';
import { nextCode } from '../models/Counter.js';
import { computeEndDate } from './dates.js';
import { conflict } from './errors.js';

// Business rule: a placement can only be created from an application whose offer was accepted,
// and each application has at most one placement.
export async function createPlacementFor(application) {
  if (application.status !== 'accepted') throw conflict('A placement can only be created once the student has accepted an offer.');
  if (await Placement.exists({ application: application._id })) throw conflict('This application already has a placement.');

  // A student can only hold one placement at a time.
  const busy = await Placement.exists({ student: application.student, status: { $in: ['p_pending', 'p_confirmed', 'p_active'] } });
  if (busy) throw conflict('This student already has a placement in progress.');

  const [opp, employer] = await Promise.all([Opportunity.findById(application.opportunity), User.findById(application.employer)]);
  const startDate = opp.startDate || new Date();
  return Placement.create({
    code: await nextCode('PL'),
    student: application.student,
    employer: application.employer,
    opportunity: application.opportunity,
    application: application._id,
    startDate,
    endDate: computeEndDate(startDate, opp.duration),
    supervisor: { name: employer.name, email: employer.email },
    history: [{ status: 'p_pending' }],
  });
}
