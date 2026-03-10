export interface ScheduleActivity {
  name: string;       // "Tennis"
  startTime: string;  // "17:00" (HH:MM)
  endTime: string;    // "19:00" (HH:MM)
}

export interface ScheduleEntry {
  dateStr: string;        // "2026-03-17" (ISO)
  activities: ScheduleActivity[];
}

const DATE_PATTERN = /^(\d{1,2})\/(\d{1,2})\b/;
const TIME_RANGE_PATTERN = /(\d{1,2})(?:[.:]\s*(\d{2}))?\s*[–\-]\s*(\d{1,2})(?:[.:]\s*(\d{2}))?/;
const SINGLE_TIME_PATTERN = /(\d{1,2})[.:]\s*(\d{2})/;
// Matches a date followed by either time-then-place or place-then-time
const SCHEDULE_LINE_PATTERN = /^\d{1,2}\/\d{1,2}\s+.*(?:\d{1,2}(?:[.:]\d{2})?\s*[–\-]\s*\d{1,2}(?:[.:]\d{2})?|\d{1,2}[.:]\d{2})/;

/**
 * Detect whether dates in the text are DD/MM or MM/DD format.
 * If any first number > 12 → DD/MM. If any second number > 12 → MM/DD.
 * Ambiguous defaults to DD/MM.
 */
export function detectDateFormat(lines: string[]): 'DD/MM' | 'MM/DD' {
  for (const line of lines) {
    const match = line.match(DATE_PATTERN);
    if (match) {
      const a = parseInt(match[1], 10);
      const b = parseInt(match[2], 10);
      if (a > 12) return 'DD/MM';
      if (b > 12) return 'MM/DD';
    }
  }
  return 'DD/MM'; // default
}

/**
 * Check if the text looks like a schedule (at least 1 line with date + time range).
 */
export function isScheduleText(text: string): boolean {
  const lines = text.split('\n').map(l => l.trim()).filter(l => l.length > 0);
  return lines.some(line => SCHEDULE_LINE_PATTERN.test(line));
}

function normalizeTime(hour: string, minutes: string | undefined): string {
  const h = parseInt(hour, 10);
  const m = minutes ? parseInt(minutes, 10) : 0;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

/**
 * Parse a schedule text block into structured entries.
 * tripYear is used to build full ISO dates from DD/MM.
 */
export function parseScheduleText(text: string, tripYear: number): ScheduleEntry[] {
  const lines = text.split('\n').map(l => l.trim()).filter(l => l.length > 0);
  const format = detectDateFormat(lines);
  const entries: ScheduleEntry[] = [];

  for (const line of lines) {
    const dateMatch = line.match(DATE_PATTERN);
    if (!dateMatch) continue;

    const a = parseInt(dateMatch[1], 10);
    const b = parseInt(dateMatch[2], 10);
    let day: number, month: number;

    if (format === 'DD/MM') {
      day = a;
      month = b;
    } else {
      month = a;
      day = b;
    }

    const dateStr = `${tripYear}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;

    // Everything after the date
    const rest = line.slice(dateMatch[0].length).trim();
    // Split by & to get individual activity segments
    const segments = rest.split('&').map(s => s.trim()).filter(s => s.length > 0);

    const activities: ScheduleActivity[] = [];

    for (const segment of segments) {
      const timeMatch = segment.match(TIME_RANGE_PATTERN);
      if (timeMatch) {
        const startTime = normalizeTime(timeMatch[1], timeMatch[2]);
        const endTime = normalizeTime(timeMatch[3], timeMatch[4]);

        // Extract activity name from whichever side of the time range has text
        const timeStartIndex = segment.indexOf(timeMatch[0]);
        const before = segment.slice(0, timeStartIndex).trim();
        const after = segment.slice(timeStartIndex + timeMatch[0].length).trim();
        // Prefer text before the time ("Place 17-19"), fall back to after ("17-19 Place")
        const name = before || after;

        if (name) {
          activities.push({ name, startTime, endTime });
        }
        continue;
      }

      // Fallback: single time (e.g. "Sixt 14:00" or "14:00 Sixt") — default to 1 hour
      const singleMatch = segment.match(SINGLE_TIME_PATTERN);
      if (singleMatch) {
        const startTime = normalizeTime(singleMatch[1], singleMatch[2]);
        const sh = parseInt(singleMatch[1], 10);
        const sm = parseInt(singleMatch[2], 10);
        const endTotalMin = Math.min(sh * 60 + sm + 60, 24 * 60);
        const endTime = normalizeTime(
          String(Math.floor(endTotalMin / 60)),
          String(endTotalMin % 60)
        );

        const timeStartIndex = segment.indexOf(singleMatch[0]);
        const before = segment.slice(0, timeStartIndex).trim();
        const after = segment.slice(timeStartIndex + singleMatch[0].length).trim();
        const name = before || after;

        if (name) {
          activities.push({ name, startTime, endTime });
        }
      }
    }

    if (activities.length > 0) {
      entries.push({ dateStr, activities });
    }
  }

  return entries;
}
