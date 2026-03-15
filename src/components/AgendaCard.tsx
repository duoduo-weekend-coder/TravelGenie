import { useState } from 'react';
import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { AgendaItem } from '../types';

const NOTES_MAX_LINES = 3;

const categoryColors: Record<string, string> = {
  transport: '#3B82F6',
  food: '#F97316',
  activity: '#22C55E',
  accommodation: '#A855F7',
  other: '#6B7280'
};

interface Props {
  item: AgendaItem;
  onClick: () => void;
  isHighlighted?: boolean;
  dayDate?: string; // YYYY-MM-DD
  disableDrag?: boolean;
}

function checkIsOpen(item: AgendaItem, dayDate?: string): { isOpen: boolean; reason?: string } {
  if (!dayDate || !item.openingHours || !item.openingHours.periods.length) return { isOpen: true };
  if (item.category === 'accommodation') return { isOpen: true };

  // Detect 24-hour places: single period, opens day 0 hour 0:00, no close time
  const periods = item.openingHours.periods;
  if (periods.length === 1 && periods[0].open.day === 0 && periods[0].open.hour === 0 && periods[0].open.minute === 0 && !periods[0].close) {
    return { isOpen: true };
  }

  const date = new Date(dayDate + 'T00:00:00');
  const dayOfWeek = date.getDay(); // 0 = Sunday

  const todaysPeriods = periods.filter(p => p.open.day === dayOfWeek);

  if (todaysPeriods.length === 0) {
    return { isOpen: false, reason: 'Closed today' };
  }

  // Check time slot overlap
  if (item.timeSlot) {
    // Define windows in minutes from midnight
    const amStart = 8 * 60;
    const amEnd = 13 * 60;
    const pmStart = 13 * 60;
    const pmEnd = 22 * 60; // 10 PM

    const slotStart = item.timeSlot === 'am' ? amStart : pmStart;
    const slotEnd = item.timeSlot === 'am' ? amEnd : pmEnd;

    const hasOverlap = todaysPeriods.some(p => {
      // Convert period to minutes
      const openTime = p.open.hour * 60 + p.open.minute;
      let closeTime = p.close ? (p.close.hour * 60 + p.close.minute) : 24 * 60;
      
      if (p.close && p.close.day !== p.open.day) {
          closeTime = 24 * 60; 
      }

      return Math.max(openTime, slotStart) < Math.min(closeTime, slotEnd);
    });

    if (!hasOverlap) {
      return { isOpen: false, reason: `Closed during ${item.timeSlot.toUpperCase()}` };
    }
  }

  return { isOpen: true };
}

function getHoursText(item: AgendaItem, dayDate?: string): string {
  if (!dayDate || !item.openingHours?.weekdayDescriptions) return '';
  const date = new Date(dayDate + 'T00:00:00');
  const dayIndex = date.getDay(); // 0 = Sun, 1 = Mon...
  // Google returns Monday first (index 0)
  const googleIndex = (dayIndex + 6) % 7;
  return item.openingHours.weekdayDescriptions[googleIndex] || '';
}

export function AgendaCard({ item, onClick, isHighlighted, dayDate, disableDrag }: Props) {
  const [hovered, setHovered] = useState(false);
  const { isOpen, reason } = checkIsOpen(item, dayDate);
  const hoursText = getHoursText(item, dayDate);
  const notesLines = item.notes ? item.notes.split('\n') : [];
  const notesIsTruncated = notesLines.length > NOTES_MAX_LINES;
  const showFullNotes = hovered;
  const tooltip = isOpen 
    ? (hoursText || item.title)
    : `${reason}. ${hoursText}`;

  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging
  } = useSortable({ id: item.id, disabled: disableDrag });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
    borderLeftColor: categoryColors[item.category]
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      {...(disableDrag ? {} : attributes)}
      {...(disableDrag ? {} : listeners)}
      onClick={onClick}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      className={`agenda-card ${isHighlighted ? 'highlighted' : ''} ${!isOpen ? 'closed-warning' : ''}`}
      title={tooltip}
    >
      {item.time && <span className="time-badge">{item.time}</span>}
      <div className="card-content">
        <h4 style={!isOpen ? { color: '#6b7280', textDecoration: 'line-through' } : {}}>{item.title}</h4>
        {item.sourceType === 'xiaohongshu' && (
          <span className="xhs-card-badge">小红书</span>
        )}
        {item.location && <p className="location">📍 {item.location}
          {(item.lat != null || item.location) && (
            <a
              className="card-map-link"
              href={item.lat != null
                ? `https://www.google.com/maps/search/?api=1&query=${item.lat},${item.lng}`
                : `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(item.location!)}`}
              target="_blank"
              rel="noopener noreferrer"
              onClick={e => e.stopPropagation()}
            >Map</a>
          )}
        </p>}
        {dayDate && hoursText && <p className="location" style={{ fontSize: '9px', color: isOpen ? '#6b7280' : '#ef4444' }}>🕒 {hoursText}</p>}
        {item.reservable && (
          <span className="location" style={{ display: 'block', fontSize: '10px', color: '#d97706', fontWeight: 600 }}>
            🎟️ Reservation required
          </span>
        )}
        {item.notes && (
          <p className="notes" style={{
            fontSize: '11px', color: '#6b7280', marginTop: '4px', fontStyle: 'italic',
            borderTop: '1px solid #eee', paddingTop: '2px', whiteSpace: 'pre-wrap',
            ...(notesIsTruncated && !showFullNotes ? {
              display: '-webkit-box',
              WebkitLineClamp: NOTES_MAX_LINES,
              WebkitBoxOrient: 'vertical' as const,
              overflow: 'hidden',
            } : {})
          }}>
            {item.notes}
          </p>
        )}
        {!isOpen && <span className="warning-badge">⚠️ {reason}</span>}
      </div>
      {(item.imageUrl || item.googlePlacePhoto) && (
        <img src={item.imageUrl || item.googlePlacePhoto} alt="" className="card-thumb" style={!isOpen ? { filter: 'grayscale(100%)' } : {}} />
      )}
    </div>
  );
}
