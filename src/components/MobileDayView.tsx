import { Day, AgendaItem } from '../types';
import { getDayColor } from '../dayColors';
import { AgendaCard } from './AgendaCard';

interface Props {
  day: Day;
  dayIndex: number;
  isToday?: boolean;
  onItemClick: (item: AgendaItem) => void;
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

export function MobileDayView({ day, dayIndex, isToday, onItemClick }: Props) {
  const color = getDayColor(dayIndex);
  const amItems = day.items.filter(i => i.category !== 'accommodation' && i.timeSlot !== 'pm');
  const pmItems = day.items.filter(i => i.category !== 'accommodation' && i.timeSlot === 'pm');
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

      {amItems.length > 0 && (
        <>
          <div className="mobile-section-label">Morning</div>
          {amItems.map(item => (
            <AgendaCard
              key={item.id}
              item={item}
              onClick={() => onItemClick(item)}
              dayDate={day.date}
            />
          ))}
        </>
      )}

      {pmItems.length > 0 && (
        <>
          <div className="mobile-section-label">Afternoon / Evening</div>
          {pmItems.map(item => (
            <AgendaCard
              key={item.id}
              item={item}
              onClick={() => onItemClick(item)}
              dayDate={day.date}
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
            />
          ))}
        </>
      )}

      {day.endLocation && (
        <AnchorCard item={day.endLocation} label="END" onItemClick={onItemClick} />
      )}

      {amItems.length === 0 && pmItems.length === 0 && hotelItems.length === 0 &&
        !day.startLocation && !day.endLocation && (
        <div className="mobile-empty-day">No items for this day</div>
      )}
    </div>
  );
}
