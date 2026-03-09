import { AgendaItem } from './types';

export const DAY_COLORS = [
  '#f43f5e', // rose
  '#f97316', // orange
  '#eab308', // yellow
  '#22c55e', // green
  '#06b6d4', // cyan
  '#3b82f6', // blue
  '#8b5cf6', // violet
  '#ec4899', // pink
];

export const UNASSIGNED_COLOR = '#9ca3af';

export function getDayColor(dayIndex: number): string {
  return DAY_COLORS[dayIndex % DAY_COLORS.length];
}

export interface MapItem extends AgendaItem {
  dayIndex?: number;
  dayId?: string;
  isAnchor?: 'start' | 'end';
}
