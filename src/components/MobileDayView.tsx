import { Day, AgendaItem } from '../types';
import { getDayColor } from '../dayColors';
import { AgendaCard } from './AgendaCard';
import { parseStartHour } from '../utils/time';

interface Props {
  day: Day;
  dayIndex: number;
  isToday?: boolean;
  onItemClick: (item: AgendaItem) => void;
  onAddItem?: () => void;
}

function formatDate(dateStr: string): string {
  const d = new Date(dateStr + 'T00:00:00');
  return d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
}

function AnchorCard({ item, label, onItemClick }: { item: AgendaItem; label: string; onItemClick: (item: AgendaItem) => void }) {
  return (
    <div className="mobile-anchor-card" onClick={() => onItemClick(item)}>
      <span className="mobile-anchor-label">{label}</span>
      <span className="mobile-anchor-title">{item.title}</span>
      {item.location && <span className="mobile-anchor-location">{item.location}</span>}
    </div>
  );
}

export function MobileDayView({ day, dayIndex, isToday, onItemClick, onAddItem }: Props) {
  const color = getDayColor(dayIndex);
  const sortByTime = (a: AgendaItem, b: AgendaItem) => {
    const aH = parseStartHour(a.time);
    const bH = parseStartHour(b.time);
    if (aH == null && bH == null) return 0;
    if (aH == null) return 1;
    if (bH == null) return -1;
    return aH - bH;
  };

  // Resolve effective period using parsed time first, then timeSlot fallback
  const getItemPeriod = (item: AgendaItem): 'morning' | 'afternoon' | 'evening' => {
    const h = parseStartHour(item.time);
    if (h !== null) {
      if (h < 12) return 'morning';
      if (h < 19) return 'afternoon';
      return 'evening';
    }
    // Fallback to timeSlot property
    if (item.timeSlot === 'pm') return 'afternoon';
    return 'morning';
  };

  const nonAccom = day.items.filter(i => i.category !== 'accommodation');
  const morningItems = nonAccom.filter(i => getItemPeriod(i) === 'morning').sort(sortByTime);
  const afternoonItems = nonAccom.filter(i => getItemPeriod(i) === 'afternoon').sort(sortByTime);
  const eveningItems = nonAccom.filter(i => getItemPeriod(i) === 'evening').sort(sortByTime);
  const hotelItems = day.items.filter(i => i.category === 'accommodation');

  return (
    <div className="mobile-day-view">
      <div className="mobile-day-header" style={{ borderLeftColor: color }}>
        <span className="mobile-day-number" style={{ color }}>Day {dayIndex + 1}</span>
        <span className="mobile-day-date">{formatDate(day.date)}</span>
        {isToday && <span className="mobile-today-badge">Today</span>}
      </div>

      {day.startLocation && (
        <AnchorCard item={day.startLocation} label="START" onItemClick={onItemClick} />
      )}

      {morningItems.length > 0 && (
        <>
          <div className="mobile-section-label">Morning</div>
          {morningItems.map(item => (
            <AgendaCard
              key={item.id}
              item={item}
              onClick={() => onItemClick(item)}
              dayDate={day.date}
              disableDrag
            />
          ))}
        </>
      )}

      {afternoonItems.length > 0 && (
        <>
          <div className="mobile-section-label">Afternoon</div>
          {afternoonItems.map(item => (
            <AgendaCard
              key={item.id}
              item={item}
              onClick={() => onItemClick(item)}
              dayDate={day.date}
              disableDrag
            />
          ))}
        </>
      )}

      {eveningItems.length > 0 && (
        <>
          <div className="mobile-section-label">Evening</div>
          {eveningItems.map(item => (
            <AgendaCard
              key={item.id}
              item={item}
              onClick={() => onItemClick(item)}
              dayDate={day.date}
              disableDrag
            />
          ))}
        </>
      )}

      {hotelItems.length > 0 && (
        <>
          <div className="mobile-section-label">Accommodation</div>
          {hotelItems.map(item => (
            <AgendaCard
              key={item.id}
              item={item}
              onClick={() => onItemClick(item)}
              dayDate={day.date}
              disableDrag
            />
          ))}
        </>
      )}

      {day.endLocation && (
        <AnchorCard item={day.endLocation} label="END" onItemClick={onItemClick} />
      )}

      {morningItems.length === 0 && afternoonItems.length === 0 && eveningItems.length === 0 && hotelItems.length === 0 &&
        !day.startLocation && !day.endLocation && (
        <div className="mobile-empty-day">
          <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="#d1d5db" strokeWidth="1.5" style={{ marginBottom: 8 }}>
            <rect x="3" y="4" width="18" height="18" rx="2"/><path d="M16 2v4M8 2v4M3 10h18"/><path d="M8 15h4m0 0h4m-4 0v-4m0 4v4" stroke="#d1d5db"/>
          </svg>
          <p>No items for this day</p>
          {onAddItem && (
            <button className="mobile-link-btn" onClick={onAddItem} style={{ marginTop: 16 }}>
              + Add first item
            </button>
          )}
        </div>
      )}

      {(morningItems.length > 0 || afternoonItems.length > 0 || eveningItems.length > 0 || hotelItems.length > 0 ||
        day.startLocation || day.endLocation) && onAddItem && (
        <button className="mobile-add-item-btn" onClick={onAddItem}>
          + Add item
        </button>
      )}
    </div>
  );
}
