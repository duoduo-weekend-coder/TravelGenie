import { describe, expect, it } from 'vitest';

import { detectDateFormat, isScheduleText, parseScheduleText } from './scheduleParser';

describe('detectDateFormat', () => {
  it('detects DD/MM when first number > 12', () => {
    expect(detectDateFormat(['17/03 Tennis 17 – 19.00'])).toBe('DD/MM');
  });

  it('detects MM/DD when second number > 12', () => {
    expect(detectDateFormat(['03/17 Tennis 17 – 19.00'])).toBe('MM/DD');
  });

  it('defaults to DD/MM when ambiguous', () => {
    expect(detectDateFormat(['01/02 Tennis 10 – 11.00'])).toBe('DD/MM');
  });

  it('checks multiple lines', () => {
    expect(detectDateFormat([
      '01/02 Tennis 10 – 11.00',
      '15/03 Tennis 17 – 19.00'
    ])).toBe('DD/MM');
  });
});

describe('isScheduleText', () => {
  it('returns true for schedule text', () => {
    expect(isScheduleText('17/03 Tennis 17 – 19.00')).toBe(true);
  });

  it('returns true for multi-line schedule', () => {
    const text = `17/03 Tennis 17 – 19.00
18/03 Fitness 09 – 11.00`;
    expect(isScheduleText(text)).toBe(true);
  });

  it('returns false for URLs', () => {
    expect(isScheduleText('https://maps.google.com/abc')).toBe(false);
  });

  it('returns true for single-time entry', () => {
    expect(isScheduleText('3/16 Sixt 14:00')).toBe(true);
  });

  it('returns false for plain text', () => {
    expect(isScheduleText('Visit the Eiffel Tower')).toBe(false);
  });

  it('returns false for empty text', () => {
    expect(isScheduleText('')).toBe(false);
  });
});

describe('parseScheduleText', () => {
  it('parses a single activity line', () => {
    const result = parseScheduleText('17/03 Tennis 17 – 19.00', 2026);
    expect(result).toEqual([{
      dateStr: '2026-03-17',
      activities: [{ name: 'Tennis', startTime: '17:00', endTime: '19:00' }]
    }]);
  });

  it('parses multiple activities on one line (& separator)', () => {
    const result = parseScheduleText('18/03 Tennis 09 – 11.00 & Fitness 15 -16.30', 2026);
    expect(result).toEqual([{
      dateStr: '2026-03-18',
      activities: [
        { name: 'Tennis', startTime: '09:00', endTime: '11:00' },
        { name: 'Fitness', startTime: '15:00', endTime: '16:30' }
      ]
    }]);
  });

  it('parses the full example schedule', () => {
    const text = `17/03 Tennis 17 – 19.00
18/03 Tennis 09 – 11.00 & Fitness 15 -16.30
19/03 Tennis 09 – 11.00 & Fitness 15 -16.30
20/03 Fitness 10 – 11.00 & Tennis 17 – 19.00
21/03 Tennis 09 – 11.00`;

    const result = parseScheduleText(text, 2026);
    expect(result).toHaveLength(5);
    expect(result[0].dateStr).toBe('2026-03-17');
    expect(result[0].activities).toHaveLength(1);
    expect(result[1].dateStr).toBe('2026-03-18');
    expect(result[1].activities).toHaveLength(2);
    expect(result[4].dateStr).toBe('2026-03-21');
    expect(result[4].activities[0].name).toBe('Tennis');
  });

  it('handles time with colon separator', () => {
    const result = parseScheduleText('17/03 Yoga 08:30 – 10:00', 2026);
    expect(result[0].activities[0]).toEqual({
      name: 'Yoga',
      startTime: '08:30',
      endTime: '10:00'
    });
  });

  it('handles hour-only times', () => {
    const result = parseScheduleText('17/03 Tennis 17 – 19', 2026);
    expect(result[0].activities[0]).toEqual({
      name: 'Tennis',
      startTime: '17:00',
      endTime: '19:00'
    });
  });

  it('handles hyphen as dash', () => {
    const result = parseScheduleText('17/03 Tennis 17-19', 2026);
    expect(result[0].activities[0]).toEqual({
      name: 'Tennis',
      startTime: '17:00',
      endTime: '19:00'
    });
  });

  it('handles MM/DD format when detected', () => {
    const result = parseScheduleText('03/17 Tennis 09 – 11.00', 2026);
    expect(result[0].dateStr).toBe('2026-03-17');
  });

  it('skips lines without dates', () => {
    const text = `Schedule for March:
17/03 Tennis 17 – 19.00
Have fun!`;
    const result = parseScheduleText(text, 2026);
    expect(result).toHaveLength(1);
    expect(result[0].dateStr).toBe('2026-03-17');
  });

  it('handles multi-word activity names', () => {
    const result = parseScheduleText('17/03 Hot Yoga 08:30 – 10:00', 2026);
    expect(result[0].activities[0].name).toBe('Hot Yoga');
  });

  it('parses single-time entry with default 1-hour duration', () => {
    const result = parseScheduleText('3/16 Sixt 14:00', 2026);
    expect(result).toEqual([{
      dateStr: '2026-03-16',
      activities: [{ name: 'Sixt', startTime: '14:00', endTime: '15:00' }]
    }]);
  });

  it('parses single-time with dot separator', () => {
    const result = parseScheduleText('17/03 Checkin 15.30', 2026);
    expect(result).toEqual([{
      dateStr: '2026-03-17',
      activities: [{ name: 'Checkin', startTime: '15:30', endTime: '16:30' }]
    }]);
  });

  it('parses mix of single-time and range entries', () => {
    const text = `3/16 Sixt 14:00
3/17 Tennis 17:00 - 19:00`;
    const result = parseScheduleText(text, 2026);
    expect(result).toHaveLength(2);
    expect(result[0].activities[0]).toEqual({ name: 'Sixt', startTime: '14:00', endTime: '15:00' });
    expect(result[1].activities[0]).toEqual({ name: 'Tennis', startTime: '17:00', endTime: '19:00' });
  });

  it('returns empty array for non-schedule text', () => {
    const result = parseScheduleText('Just a regular note', 2026);
    expect(result).toEqual([]);
  });
});
