import { useState, useMemo } from 'react';
import { DndContext } from '@dnd-kit/core';
import { SortableContext } from '@dnd-kit/sortable';
import { Trip, AgendaItem } from '../types';
import { MapItem, getDayColor } from '../dayColors';
import { MobileDayView } from './MobileDayView';
import { NearbyList } from './NearbyList';
import { MapPanel } from './MapPanel';
import { AgendaCard } from './AgendaCard';

type Tab = 'today' | 'nearby' | 'map' | 'days' | 'list';

interface Props {
  trip: Trip;
  allMapItems: MapItem[];
  onEditItem: (item: AgendaItem) => void;
  onAddItem: (dayId: string) => void;
  onToggleMobile: () => void;
  onImport?: () => void;
  onSync?: () => void;
  syncing?: boolean;
  syncMessage?: string | null;
}

function getTodayStr(): string {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

export function MobileView({ trip, allMapItems, onEditItem, onAddItem, onToggleMobile, onImport, onSync, syncing, syncMessage }: Props) {
  const [activeTab, setActiveTab] = useState<Tab>('today');
  const [selectedDayIndex, setSelectedDayIndex] = useState(() => {
    const todayStr = getTodayStr();
    const idx = trip.days.findIndex(d => d.date === todayStr);
    return Math.max(0, idx);
  });
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
            <div className="mobile-header-title-group">
              <h1 className="mobile-title">{trip.title}</h1>
              {trip.days.length > 0 && (() => {
                const startDate = new Date(trip.days[0].date + 'T00:00:00');
                const endDate = new Date(trip.days[trip.days.length - 1].date + 'T00:00:00');
                const fmt = (d: Date) => d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
                const dayLabel = todayDayIndex >= 0
                  ? `Day ${todayDayIndex + 1} of ${trip.days.length}`
                  : `${trip.days.length} day${trip.days.length !== 1 ? 's' : ''}`;
                return (
                  <p className="mobile-subtitle" aria-label={`${dayLabel}, ${fmt(startDate)} to ${fmt(endDate)}`}>
                    {dayLabel} · {fmt(startDate)}–{fmt(endDate)}
                  </p>
                );
              })()}
            </div>
            <div className="mobile-header-actions">
              {onSync && trip.googleMapsListUrls && trip.googleMapsListUrls.length > 0 && (
                <button
                  className="mobile-sync-btn"
                  onClick={onSync}
                  disabled={syncing}
                  title="Sync new places from Google Maps lists"
                  aria-label="Sync new places from Google Maps lists"
                >
                  <svg className={syncing ? 'spin' : ''} width="14" height="14" viewBox="0 0 16 16" fill="currentColor" aria-hidden="true">
                    <path d="M11.534 7h3.932a.25.25 0 0 1 .192.41l-1.966 2.36a.25.25 0 0 1-.384 0l-1.966-2.36a.25.25 0 0 1 .192-.41zm-11 2h3.932a.25.25 0 0 0 .192-.41L2.692 6.23a.25.25 0 0 0-.384 0L.342 8.59A.25.25 0 0 0 .534 9z"/>
                    <path fillRule="evenodd" d="M8 3c-1.552 0-2.94.707-3.857 1.818a.5.5 0 1 1-.771-.636A6.002 6.002 0 0 1 13.917 7H12.9A5.002 5.002 0 0 0 8 3zM3.1 9a5.002 5.002 0 0 0 8.757 2.182.5.5 0 1 1 .771.636A6.002 6.002 0 0 1 2.083 9H3.1z"/>
                  </svg>
                  {syncing ? 'Syncing...' : 'Sync'}
                </button>
              )}
              <span className="mobile-sync-message" aria-live="polite">{syncMessage ?? ''}</span>
              <button className="mobile-desktop-btn" onClick={onToggleMobile}>
                Desktop
              </button>
            </div>
          </div>

          <div className="mobile-content">
            {activeTab === 'today' && (
              todayDayIndex >= 0 ? (
                <MobileDayView
                  day={trip.days[todayDayIndex]}
                  dayIndex={todayDayIndex}
                  isToday
                  onItemClick={onEditItem}
                  onAddItem={() => onAddItem(trip.days[todayDayIndex].id)}
                />
              ) : (
                <div className="mobile-empty-tab">
                  <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="#d1d5db" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                    <rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/>
                  </svg>
                  <p className="mobile-empty-title">No itinerary for today</p>
                  <p className="mobile-empty-hint">Today isn't in your trip yet</p>
                  <div className="mobile-empty-actions">
                    <button className="mobile-link-btn" onClick={() => setActiveTab('days')}>
                      Browse all days
                    </button>
                    {onImport && (
                      <button className="mobile-link-btn mobile-link-btn-primary" onClick={onImport}>
                        Import places
                      </button>
                    )}
                  </div>
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
                    onAddItem={() => onAddItem(trip.days[selectedDayIndex].id)}
                  />
                )}
                {trip.days.length === 0 && (
                  <div className="mobile-empty-tab">
                    <p>No days in this trip yet</p>
                  </div>
                )}
              </div>
            )}

            {activeTab === 'list' && (
              <div className="mobile-list-tab">
                <div className="mobile-list-header">
                  <span className="mobile-list-count">{trip.unassignedItems.length} unassigned place{trip.unassignedItems.length !== 1 ? 's' : ''}</span>
                </div>
                {trip.unassignedItems.length > 0 ? (
                  <div className="mobile-list-items">
                    {trip.unassignedItems.map(item => (
                      <AgendaCard
                        key={item.id}
                        item={item}
                        onClick={() => onEditItem(item)}
                        disableDrag
                      />
                    ))}
                  </div>
                ) : (
                  <div className="mobile-empty-tab">
                    <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="#d1d5db" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                      <path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7z"/><circle cx="12" cy="9" r="2.5"/>
                    </svg>
                    <p className="mobile-empty-title">No places yet</p>
                    <p className="mobile-empty-hint">Import from Google Maps, paste a link, or add manually</p>
                    {onImport && (
                      <div className="mobile-empty-actions">
                        <button className="mobile-link-btn mobile-link-btn-primary" onClick={onImport}>
                          Import places
                        </button>
                      </div>
                    )}
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
            <button
              className={`mobile-tab ${activeTab === 'list' ? 'active' : ''}`}
              onClick={() => setActiveTab('list')}
            >
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/></svg>
              {trip.unassignedItems.length > 0 && <span className="mobile-tab-badge">{trip.unassignedItems.length}</span>}
              <span>List</span>
            </button>
          </div>
        </div>
      </SortableContext>
    </DndContext>
  );
}
