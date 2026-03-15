export type Category = 'transport' | 'food' | 'activity' | 'accommodation' | 'other';
export type SourceType = 'manual' | 'google_maps' | 'xiaohongshu';

export interface OpeningHoursPeriod {
  open: { day: number; hour: number; minute: number };
  close: { day: number; hour: number; minute: number } | null;
}

export interface PlaceOpeningHours {
  periods: OpeningHoursPeriod[];
  weekdayDescriptions: string[];
}

export interface AgendaItem {
  id: string;
  title: string;
  time?: string;
  location?: string;
  lat?: number;
  lng?: number;
  googleMapsUrl?: string;
  googlePlaceName?: string;
  googlePlacePhoto?: string;
  openingHours?: PlaceOpeningHours;
  reservable?: boolean;
  notes?: string;
  suggestedDuration?: number; // in minutes
  imageUrl?: string;
  sourceType?: SourceType;
  sourceUrl?: string;
  sourceMeta?: { author?: string; publishTime?: string };
  sourceContent?: { fullText?: string; images?: string[] };
  category: Category;
  timeSlot?: 'am' | 'pm';
}

export interface Day {
  id: string;
  date: string;
  items: AgendaItem[];
  startLocation?: AgendaItem;
  endLocation?: AgendaItem;
  blockedPeriods?: { start: string; end: string }[]; // "HH:MM"
}

export interface Trip {
  id: string;
  title: string;
  startDate: string;
  days: Day[];
  unassignedItems: AgendaItem[];
  googleMapsListUrls?: string[];
}
