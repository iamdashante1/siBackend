// Values shared across the API. The UI uses the same strings.
export const ROLES = { STUDENT: 'STUDENT', EMPLOYER: 'EMPLOYER', ADMIN: 'ADMIN' };

export const ACCOUNT_STATUS = ['active', 'unverified', 'suspended'];

export const OPP_STATUS = ['draft', 'pending_approval', 'open', 'closed'];
export const OPP_TYPES = ['Internship', 'Graduate job'];
export const WORK_MODES = ['On-site', 'Hybrid', 'Remote'];

export const APP_STATUS = ['submitted', 'review', 'shortlisted', 'interview', 'offered', 'accepted', 'rejected', 'withdrawn'];
// An application is "in progress" while the employer or student can still act on it.
export const APP_IN_PROGRESS = ['submitted', 'review', 'shortlisted', 'interview', 'offered'];

export const INTERVIEW_STATUS = ['scheduled', 'completed', 'cancelled'];
export const INTERVIEW_FORMATS = ['Video call', 'On-site'];

export const PLACEMENT_STATUS = ['p_pending', 'p_confirmed', 'p_active', 'p_completed'];
