import { useState, useMemo } from 'react';
import { DndContext } from '@dnd-kit/core';
import { SortableContext } from '@dnd-kit/sortable';
import { Trip, AgendaItem } from '../types';
import { MapItem, getDayColor } from '../dayColors';
import { MobileDayView } from './MobileDayView';
import { NearbyList } from './NearbyList';
import { MapPanel } from './MapPanel';

type Tab = 'today' | 'nearby' | 'map' | 'days';

interface Props {
  trip: Trip;
  allMapItems: MapItem[];
  onEditItem: (item: AgendaItem) => void;
  onToggleMobile: () => void;
}

function getTodayStr(): string {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

export function MobileView({ trip, allMapItems, onEditItem, onToggleMobile }: Props) {
  const [activeTab, setActiveTab] = useState<Tab>('today');
  const [selectedDayIndex, setSelectedDayIndex] = useState(0);
  const [mapFocusedDayId, setMapFocusedDayId] = useState<string | null>(null);

  const todayStr = getTodayStr();
  const todayDayIndex = trip.days.findIndex(d => d.date === todayStr);

  // Collect all item IDs for a no-op SortableContext (needed by AgendaCard's useSortable)
  const allItemIds = useMemo(() => {
    const ids: string[] = [];
    for (const day of trip.days) {
      for (const item of day.items) ids.push(item.id);
      if (day.startLocation) ids.push(day.startLocation.id);
      if (day.endLocation) ids.push(day.endLocation.id);
    }
    for (const item of trip.unassignedItems) ids.push(item.id);
    return ids;
  }, [trip]);

  return (
    <DndContext>
      <SortableContext items={allItemIds}>
        <div className="mobile-view">
          <div className="mobile-header">
            <h1 className="mobile-title">{trip.title}</h1>
            <button className="mobile-desktop-btn" onClick={onToggleMobile}>
              Desktop
            </button>
          </div>

          <div className="mobile-content">
            {activeTab === 'today' && (
              todayDayIndex >= 0 ? (
                <MobileDayView
                  day={trip.days[todayDayIndex]}
                  dayIndex={todayDayIndex}
                  isToday
                  onItemClick={onEditItem}
                />
              ) : (
                <div className="mobile-empty-tab">
                  <p>No itinerary for today</p>
                  <button
                    className="mobile-link-btn"
                    onClick={() => setActiveTab('days')}
                  >
                    Browse all days
                  </button>
                </div>
              )
            )}

            {activeTab === 'nearby' && (
              <NearbyList
                trip={trip}
                enabled={activeTab === 'nearby'}
                onItemClick={onEditItem}
              />
            )}

            {activeTab === 'map' && (
              <div className="mobile-map-tab">
                <div className="mobile-map-day-filter">
                  <button
                    className={`mobile-map-day-btn ${mapFocusedDayId === null ? 'active' : ''}`}
                    onClick={() => setMapFocusedDayId(null)}
                  >
                    All
                  </button>
                  {trip.days.map((day, idx) => (
                    <button
                      key={day.id}
                      className={`mobile-map-day-btn ${mapFocusedDayId === day.id ? 'active' : ''}`}
                      style={{
                        '--day-color': getDayColor(idx),
                      } as React.CSSProperties}
                      onClick={() => setMapFocusedDayId(prev => prev === day.id ? null : day.id)}
                    >
                      Day {idx + 1}
                    </button>
                  ))}
                </div>
                <div className="mobile-map-container">
                  <MapPanel items={allMapItems} focusedDayId={mapFocusedDayId} />
                </div>
              </div>
            )}

            {activeTab === 'days' && (
              <div className="mobile-days-tab">
                <div className="mobile-day-picker">
                  {trip.days.map((day, idx) => {
                    const isToday = day.date === todayStr;
                    return (
                      <button
                        key={day.id}
                        className={`mobile-day-chip ${idx === selectedDayIndex ? 'active' : ''} ${isToday ? 'today' : ''}`}
                        onClick={() => setSelectedDayIndex(idx)}
                      >
                        <span className="chip-day">Day {idx + 1}</span>
                        <span className="chip-date">
                          {new Date(day.date + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                        </span>
                      </button>
                    );
                  })}
                </div>
                {trip.days[selectedDayIndex] && (
                  <MobileDayView
                    day={trip.days[selectedDayIndex]}
                    dayIndex={selectedDayIndex}
                    isToday={trip.days[selectedDayIndex].date === todayStr}
                    onItemClick={onEditItem}
                  />
                )}
                {trip.days.length === 0 && (
                  <div className="mobile-empty-tab">
                    <p>No days in this trip yet</p>
                  </div>
                )}
              </div>
            )}
          </div>

          <div className="mobile-tab-bar">
            <button
              className={`mobile-tab ${activeTab === 'today' ? 'active' : ''}`}
              onClick={() => setActiveTab('today')}
            >
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="4" width="18" height="18" rx="2"/><path d="M16 2v4M8 2v4M3 10h18"/><circle cx="12" cy="16" r="1.5" fill="currentColor"/></svg>
              <span>Today</span>
            </button>
            <button
              className={`mobile-tab ${activeTab === 'nearby' ? 'active' : ''}`}
              onClick={() => setActiveTab('nearby')}
            >
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7z"/><circle cx="12" cy="9" r="2.5"/></svg>
              <span>Nearby</span>
            </button>
            <button
              className={`mobile-tab ${activeTab === 'map' ? 'active' : ''}`}
              onClick={() => setActiveTab('map')}
            >
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M1 6v16l7-4 8 4 7-4V2l-7 4-8-4-7 4z"/><path d="M8 2v16M16 6v16"/></svg>
              <span>Map</span>
            </button>
            <button
              className={`mobile-tab ${activeTab === 'days' ? 'active' : ''}`}
              onClick={() => setActiveTab('days')}
            >
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M4 6h16M4 10h16M4 14h10M4 18h6"/></svg>
              <span>Days</span>
            </button>
          </div>
        </div>
      </SortableContext>
    </DndContext>
  );
}
