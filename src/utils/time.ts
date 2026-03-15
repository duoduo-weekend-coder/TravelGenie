/**
 * Parse the start hour from an item's time string.
 * Handles "9:00 AM", "2:00 PM", "14:30", "9:00 AM - 11:00 AM", etc.
 * Returns fractional hours (e.g. 14.5 for 2:30 PM), or null if unparseable.
 */
export function parseStartHour(time: string | undefined): number | null {
  if (!time) return null;
  const match = time.match(/(\d{1,2}):(\d{2})\s*(AM|PM)?/i);
  if (!match) return null;
  let hours = parseInt(match[1], 10);
  const minutes = parseInt(match[2], 10);
  const ampm = match[3]?.toUpperCase();
  if (ampm === 'PM' && hours !== 12) hours += 12;
  if (ampm === 'AM' && hours === 12) hours = 0;
  return hours + minutes / 60;
}

/**
 * Infer 'am' or 'pm' time slot from a time string.
 * Returns 'am' if start hour < 12, 'pm' if >= 12, or null if unparseable.
 */
export function inferTimeSlot(time: string | undefined): 'am' | 'pm' | null {
  const h = parseStartHour(time);
  if (h === null) return null;
  return h < 12 ? 'am' : 'pm';
}
