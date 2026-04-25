import { useState } from 'react';

import { fetchPlaces, PlaceDetails, getCategoryFromTypes } from '../googleMaps';
import { AgendaItem, Category } from '../types';
import { classifyImportInput, ImportInputType } from '../utils/importSources';
import { mapXhsResponseToAgendaDraft, parseXiaohongshuUrl } from '../utils/xiaohongshu';
import { isScheduleText, parseScheduleText, ScheduleEntry } from '../utils/scheduleParser';

interface ImportModalProps {
  onImport: (items: Omit<AgendaItem, 'id'>[], sourceUrl?: string) => void;
  onScheduleImport?: (entries: ScheduleEntry[]) => void;
  tripDays?: { id: string; date: string }[];
  tripYear?: number;
  onClose: () => void;
  scheduleOnly?: boolean;
}

type ParseStatus = 'loading' | 'parsed' | 'partial' | 'failed';

type ImportCache = Record<string, Omit<AgendaItem, 'id'>[]>;

interface ParsedImportRow {
  rawInput: string;
  sourceType: ImportInputType;
  selected: boolean;
  loading: boolean;
  status: ParseStatus;
  title?: string;
  details?: PlaceDetails;
  draft?: Omit<AgendaItem, 'id'>;
  imageCount?: number;
  warningText?: string;
  error?: string;
}

function sourceLabel(sourceType: ImportInputType): string {
  if (sourceType === 'xiaohongshu') return '小红书';
  if (sourceType === 'google_maps') return 'Google Maps';
  return 'Text';
}

function getCacheKey(): string {
  return 'travel-import-cache';
}

function normalizeCacheKey(input: string): string {
  return input.trim().toLowerCase();
}

function loadCache(): ImportCache {
  try {
    const raw = localStorage.getItem(getCacheKey());
    if (!raw) return {};
    return JSON.parse(raw) as ImportCache;
  } catch {
    return {};
  }
}

function writeCache(cache: ImportCache): void {
  localStorage.setItem(getCacheKey(), JSON.stringify(cache));
}

function inferSourceType(draft: Omit<AgendaItem, 'id'>): ImportInputType {
  if (draft.sourceType === 'xiaohongshu') return 'xiaohongshu';
  if (draft.sourceType === 'google_maps') return 'google_maps';
  return 'text';
}

function draftToRow(rawInput: string, draft: Omit<AgendaItem, 'id'>): ParsedImportRow {
  return {
    rawInput,
    sourceType: inferSourceType(draft),
    selected: true,
    loading: false,
    status: draft.sourceType === 'xiaohongshu' && (!draft.lat || !draft.lng) ? 'partial' : 'parsed',
    title: draft.title,
    draft,
    imageCount: draft.sourceContent?.images?.length || (draft.imageUrl ? 1 : 0),
    warningText: draft.sourceType === 'xiaohongshu' && (!draft.lat || !draft.lng) ? 'Loaded from cache (no coordinates)' : undefined
  };
}

export function ImportModal({ onImport, onScheduleImport, tripDays, tripYear, onClose, scheduleOnly }: ImportModalProps) {
  const [inputText, setInputText] = useState(scheduleOnly ? '' : 'https://maps.app.goo.gl/NnicMDnxgKkreb878');
  const [places, setPlaces] = useState<ParsedImportRow[]>([]);
  const [isParsing, setIsParsing] = useState(false);
  const [scheduleMode, setScheduleMode] = useState(false);
  const [scheduleEntries, setScheduleEntries] = useState<ScheduleEntry[]>([]);

  const looksLikeSchedule = onScheduleImport && tripYear && isScheduleText(inputText);

  const parseInput = async () => {
    setIsParsing(true);

    // Check for schedule text first
    if (onScheduleImport && tripYear && isScheduleText(inputText)) {
      const entries = parseScheduleText(inputText, tripYear);
      if (entries.length > 0) {
        setScheduleMode(true);
        setScheduleEntries(entries);

        const tripDateSet = new Set(tripDays?.map(d => d.date) || []);

        // Flatten entries into ParsedImportRow[] for preview
        const rows: ParsedImportRow[] = entries.flatMap(entry =>
          entry.activities.map(activity => ({
            rawInput: `${entry.dateStr} ${activity.name} ${activity.startTime} – ${activity.endTime}`,
            sourceType: 'text' as ImportInputType,
            selected: true,
            loading: false,
            status: 'parsed' as ParseStatus,
            title: activity.name,
            draft: {
              title: activity.name,
              location: '',
              category: 'activity' as Category,
              time: `${activity.startTime} - ${activity.endTime}`,
              sourceType: 'manual' as const
            },
            warningText: !tripDateSet.has(entry.dateStr) ? `No matching day for ${entry.dateStr}` : undefined
          }))
        );

        setPlaces(rows);
        setIsParsing(false);
        return;
      }
    }

    setScheduleMode(false);
    setScheduleEntries([]);

    const lines = inputText
      .split('\n')
      .map((line) => line.trim())
      .filter((line) => line.length > 0);

    if (lines.length === 0) {
      alert('Please paste URLs or place names (one per line).');
      setIsParsing(false);
      return;
    }

    setPlaces(
      lines.map((line) => ({
        rawInput: line,
        sourceType: classifyImportInput(line),
        selected: true,
        loading: true,
        status: 'loading'
      }))
    );

    const cache = loadCache();
    let resolvedSoFar: ParsedImportRow[] = [];

    try {
      for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        const sourceType = classifyImportInput(line);
        const cacheKey = normalizeCacheKey(line);
        const cachedDrafts = cache[cacheKey];

        if (cachedDrafts && cachedDrafts.length > 0) {
          const cachedRows = cachedDrafts.map((draft) => draftToRow(line, draft));
          resolvedSoFar = [...resolvedSoFar, ...cachedRows];
        } else {
          try {
            if (sourceType === 'google_maps') {
              const detailsArr = await fetchPlaces(line);
              const newEntries: ParsedImportRow[] = detailsArr.length > 0
                ? detailsArr.map((details) => {
                    const draft: Omit<AgendaItem, 'id'> = {
                      title: details.name || line,
                      location: details.formatted_address || '',
                      lat: details.lat,
                      lng: details.lng,
                      googleMapsUrl: line.startsWith('http')
                        ? line
                        : `https://www.google.com/maps/search/${encodeURIComponent(line)}`,
                      googlePlaceName: details.name || '',
                      googlePlacePhoto: details.photoUrls?.[0] || details.photos?.[0] || '',
                      imageUrl: details.photos?.[0] || '',
                      category: getCategoryFromTypes(details.types || []) as Category,
                      openingHours: details.openingHours,
                      reservable: details.reservable,
                      notes: details.comment || '',
                      sourceType: 'google_maps',
                      sourceUrl: line
                    };

                    return {
                      rawInput: line,
                      sourceType,
                      title: details.name || line,
                      details,
                      draft,
                      selected: true,
                      loading: false,
                      status: 'parsed',
                      imageCount: details.photos?.length || 0
                    };
                  })
                : [{
                    rawInput: line,
                    sourceType,
                    selected: false,
                    loading: false,
                    status: 'failed',
                    error: 'No Google Maps results found'
                  }];

              if (newEntries.length > 0 && newEntries[0].status !== 'failed') {
                cache[cacheKey] = newEntries
                  .map((entry) => entry.draft)
                  .filter((draft): draft is Omit<AgendaItem, 'id'> => Boolean(draft));
                writeCache(cache);
              }
              resolvedSoFar = [...resolvedSoFar, ...newEntries];
            } else if (sourceType === 'xiaohongshu') {
              const payload = await parseXiaohongshuUrl(line);
              const warningText = payload.warnings?.join('; ');

              if (payload.status === 'failed') {
                resolvedSoFar = [...resolvedSoFar, {
                  rawInput: line,
                  sourceType,
                  selected: false,
                  loading: false,
                  status: 'failed',
                  error: payload.errorMessage || payload.errorCode || 'Parsing failed',
                  warningText
                }];
              } else {
                const draft = mapXhsResponseToAgendaDraft(payload);
                cache[cacheKey] = [draft];
                writeCache(cache);

                resolvedSoFar = [...resolvedSoFar, {
                  rawInput: line,
                  sourceType,
                  selected: true,
                  loading: false,
                  status: payload.status,
                  title: draft.title,
                  draft,
                  imageCount: payload.images?.length || draft.sourceContent?.images?.length || 0,
                  warningText
                }];
              }
            } else {
              const draft: Omit<AgendaItem, 'id'> = {
                title: line,
                location: '',
                category: 'other' as Category,
                sourceType: 'manual',
                sourceUrl: line
              };
              cache[cacheKey] = [draft];
              writeCache(cache);

              resolvedSoFar = [...resolvedSoFar, {
                rawInput: line,
                sourceType,
                selected: true,
                loading: false,
                status: 'parsed',
                title: line,
                draft
              }];
            }
          } catch (e: any) {
            resolvedSoFar = [...resolvedSoFar, {
              rawInput: line,
              sourceType,
              selected: false,
              loading: false,
              status: 'failed',
              error: e?.message || 'Unknown parse error'
            }];
          }
        }

        const remainingPlaceholders = lines.slice(i + 1).map((remainingLine) => ({
          rawInput: remainingLine,
          sourceType: classifyImportInput(remainingLine),
          selected: true,
          loading: true,
          status: 'loading' as const
        }));

        setPlaces([...resolvedSoFar, ...remainingPlaceholders]);
      }
    } finally {
      setIsParsing(false);
    }
  };

  const toggleSelect = (index: number) => {
    setPlaces((prev) => prev.map((place, idx) => {
      if (idx !== index || place.loading) return place;
      return { ...place, selected: !place.selected };
    }));
  };

  const handleImport = () => {
    if (scheduleMode && onScheduleImport) {
      // Filter to only selected rows, then rebuild entries from selected activities
      const selectedTitles = new Set(
        places
          .filter(p => p.selected && p.status !== 'failed')
          .map(p => p.rawInput)
      );

      const filteredEntries = scheduleEntries
        .map(entry => ({
          ...entry,
          activities: entry.activities.filter(a =>
            selectedTitles.has(`${entry.dateStr} ${a.name} ${a.startTime} – ${a.endTime}`)
          )
        }))
        .filter(entry => entry.activities.length > 0);

      onScheduleImport(filteredEntries);
      onClose();
      return;
    }

    const items: Omit<AgendaItem, 'id'>[] = places
      .filter((place) => place.selected && !place.loading && place.status !== 'failed')
      .map((place) => place.draft)
      .filter((draft): draft is Omit<AgendaItem, 'id'> => Boolean(draft));

    // Pass the source URL if this was a single Google Maps list import
    const sourceUrl = inputText.trim().startsWith('http') ? inputText.trim() : undefined;
    onImport(items, sourceUrl);
    onClose();
  };

  const selectedCount = places.filter((place) => place.selected && !place.loading && place.status !== 'failed').length;

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal import-modal" onClick={(e) => e.stopPropagation()}>
        <button className="modal-close-x" onClick={onClose} title="Close" aria-label="Close">×</button>
        <h2>{scheduleOnly ? 'Import Schedule' : 'Import Places and Posts'}</h2>
        <p className="import-hint">
          {scheduleOnly
            ? 'Paste your schedule below. Activities will be placed on matching days with blocked time slots.'
            : looksLikeSchedule
              ? 'Schedule detected — activities will be placed on matching days with blocked time slots.'
              : 'Paste Google Maps links, plain place names, or a schedule (DD/MM Activity HH – HH).'}
        </p>

        <textarea
          value={inputText}
          onChange={(e) => setInputText(e.target.value)}
          placeholder={scheduleOnly
            ? "17/03 Tennis 17 – 19.00\n18/03 Tennis 09 – 11.00 & Fitness 15 - 16.30\n19/03 Yoga 08:30 – 10:00"
            : "https://maps.google.com/...\nShibuya Sky\n\nor paste a schedule:\n17/03 Tennis 17 – 19.00\n18/03 Fitness 09 – 11.00"}
          rows={scheduleOnly ? 8 : 5}
          autoFocus={!!scheduleOnly}
        />

        <button className="parse-btn" onClick={parseInput} disabled={!inputText.trim() || isParsing}>
          {isParsing ? 'Parsing...' : (looksLikeSchedule || scheduleOnly) ? 'Accept Schedule' : 'Parse Inputs'}
        </button>

        {places.length > 0 && (
          <div className="places-list">
            {places.map((place, idx) => {
              const previewImage = place.draft?.imageUrl || place.details?.photos?.[0] || place.draft?.sourceContent?.images?.[0];

              return (
                <div
                  key={`${place.rawInput}-${idx}`}
                  className={`place-item ${place.loading ? 'loading' : ''} ${place.selected ? 'selected' : ''}`}
                >
                  <input
                    type="checkbox"
                    checked={place.selected}
                    disabled={place.loading}
                    onChange={() => toggleSelect(idx)}
                  />
                  {previewImage && <img src={previewImage} alt="" className="place-thumb" />}
                  <div className="place-info">
                    <strong>{place.title || place.details?.name || place.rawInput}</strong>
                    <div className="place-meta-row">
                      {scheduleMode
                        ? <span className="source-badge source-text">Schedule</span>
                        : <span className={`source-badge source-${place.sourceType}`}>{sourceLabel(place.sourceType)}</span>
                      }
                      {scheduleMode && place.draft?.time && (
                        <span className="schedule-time">{place.draft.time}</span>
                      )}
                      {typeof place.imageCount === 'number' && place.imageCount > 0 && (
                        <span className="image-count">{place.imageCount} images</span>
                      )}
                      {place.status === 'partial' && <span className="status-badge partial">Partial</span>}
                    </div>
                    {(place.draft?.location || place.details?.formatted_address) && <span>{place.draft?.location || place.details?.formatted_address}</span>}
                    {place.warningText && <span className="warning-text">{place.warningText}</span>}
                    {place.error && <span className="error">Error: {place.error}</span>}
                  </div>
                </div>
              );
            })}
          </div>
        )}

        <div className="modal-actions">
          <button onClick={onClose}>Cancel</button>
          <button className="save-btn" onClick={handleImport} disabled={selectedCount === 0}>
            Import {selectedCount} {scheduleMode ? 'activit' : 'place'}{selectedCount !== 1 ? (scheduleMode ? 'ies' : 's') : (scheduleMode ? 'y' : '')}
          </button>
        </div>
      </div>
    </div>
  );
}
