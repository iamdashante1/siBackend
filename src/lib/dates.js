// Works out a placement end date from an opportunity's duration text ("12 weeks", "6 months").
// Returns null for open-ended roles such as "Permanent".
export function computeEndDate(start, durationText = '') {
  const m = /(\d+)\s*(week|month)/i.exec(durationText);
  if (!m || !start) return null;
  const end = new Date(start);
  if (m[2].toLowerCase() === 'week') end.setUTCDate(end.getUTCDate() + Number(m[1]) * 7);
  else end.setUTCMonth(end.getUTCMonth() + Number(m[1]));
  return end;
}
