import { useState, useMemo } from 'react';
import { Trip, AgendaItem, Category } from '../types';
import { useGeolocation } from '../hooks/useGeolocation';
import { sortByDistance, ItemWithDistance } from '../utils/geo';
import { getDayColor, UNASSIGNED_COLOR } from '../dayColors';
import { AgendaCard } from './AgendaCard';

interface Props {
  trip: Trip;
  enabled: boolean;
  onItemClick: (item: AgendaItem) => void;
}

const FILTERS: { key: Category | 'all'; label: string }[] = [
  { key: 'all', label: 'All' },
  { key: 'food', label: 'Food' },
  { key: 'activity', label: 'Activity' },
  { key: 'accommodation', label: 'Hotel' },
  { key: 'transport', label: 'Transport' },
  { key: 'other', label: 'Other' },
];

export function NearbyList({ trip, enabled, onItemClick }: Props) {
  const { position, error, loading, refresh } = useGeolocation(enabled);
  const [filter, setFilter] = useState<Category | 'all'>('all');

  const flatItems = useMemo(() => {
    const result: { item: AgendaItem; dayIndex: number; dayLabel: string }[] = [];
    trip.days.forEach((day, idx) => {
      for (const item of day.items) {
        result.push({ item, dayIndex: idx, dayLabel: `Day ${idx + 1}` });
      }
      if (day.startLocation) {
        result.push({ item: day.startLocation, dayIndex: idx, dayLabel: `Day ${idx + 1}` });
      }
      if (day.endLocation) {
        result.push({ item: day.endLocation, dayIndex: idx, dayLabel: `Day ${idx + 1}` });
      }
    });
    for (const item of trip.unassignedItems) {
      result.push({ item, dayIndex: -1, dayLabel: 'Unassigned' });
    }
    return result;
  }, [trip]);

  const sorted: ItemWithDistance[] = useMemo(() => {
    if (!position) return [];
    return sortByDistance({ lat: position.lat, lng: position.lng }, flatItems);
  }, [position, flatItems]);

  const filtered = useMemo(() => {
    if (filter === 'all') return sorted;
    return sorted.filter(s => s.item.category === filter);
  }, [sorted, filter]);

  if (loading && !position) {
    return (
      <div className="nearby-status">
        <div className="nearby-spinner" />
        <p>Getting your location...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="nearby-status">
        <p className="nearby-error">{error}</p>
        <button className="nearby-retry-btn" onClick={refresh}>
          Retry Location
        </button>
      </div>
    );
  }

  if (!position) return null;

  const itemCount = filtered.filter(s => s.distance !== null).length;

  return (
    <div className="nearby-list">
      <div className="nearby-header">
        <span>{itemCount} places</span>
        <button className="nearby-refresh-btn" onClick={refresh}>
          Refresh
        </button>
      </div>
      <div className="nearby-filters">
        {FILTERS.map(f => (
          <button
            key={f.key}
            className={`nearby-filter-btn ${filter === f.key ? 'active' : ''}`}
            onClick={() => setFilter(f.key)}
          >
            {f.label}
          </button>
        ))}
      </div>
      {filtered.map(({ item, dayIndex, dayLabel, distanceLabel, distance }) => (
        <div key={item.id} className="nearby-item">
          <div className="nearby-badges">
            <span
              className="nearby-distance-badge"
              style={distance === null ? { background: '#e5e7eb', color: '#6b7280' } : {}}
            >
              {distanceLabel}
            </span>
            <span
              className="nearby-day-badge"
              style={{ background: dayIndex >= 0 ? getDayColor(dayIndex) : UNASSIGNED_COLOR }}
            >
              {dayLabel}
            </span>
          </div>
          <AgendaCard item={item} onClick={() => onItemClick(item)} disableDrag />
        </div>
      ))}
      {filtered.length === 0 && sorted.length > 0 && (
        <div className="nearby-status">
          <p>No {filter === 'all' ? '' : filter} places found</p>
        </div>
      )}
      {sorted.length === 0 && (
        <div className="nearby-status">
          <p>No items in your trip yet.</p>
        </div>
      )}
    </div>
  );
}
