// Local hour as a fraction. ?hour=19.5 previews a time of day.
export function currentHour() {
  const o = new URLSearchParams(location.search).get('hour');
  if (o !== null && !Number.isNaN(+o)) return +o;
  const d = new Date();
  return d.getHours() + d.getMinutes() / 60;
}

export function phaseOf(hour) {
  if (hour >= 5 && hour < 8) return 'dawn';
  if (hour >= 8 && hour < 12) return 'morning';
  if (hour >= 12 && hour < 17) return 'afternoon';
  if (hour >= 17 && hour < 20) return 'evening';
  return 'night';
}
