import { useState } from 'react';
import { useDroppable } from '@dnd-kit/core';
import { SortableContext, verticalListSortingStrategy } from '@dnd-kit/sortable';
import { Day, AgendaItem } from '../types';
import { AgendaCard } from './AgendaCard';
import { TimeRuler, START_HOUR, PIXELS_PER_HOUR, RULER_HEIGHT } from './TimeRuler';
import { getDayColor } from '../dayColors';

const AM_END_HOUR = 12;
const PM_END_HOUR = 22;
const AM_HEIGHT = (AM_END_HOUR - START_HOUR) * PIXELS_PER_HOUR;   // 6:00–12:00
const PM_HEIGHT = (PM_END_HOUR - AM_END_HOUR) * PIXELS_PER_HOUR;  // 12:00–22:00

interface Props {
  day: Day;
  dayIndex: number;
  highlightedItemId?: string;
  isFocused?: boolean;
  onDayClick: (dayId: string) => void;
  onItemClick: (item: AgendaItem) => void;
  onAddItem: () => void;
  onCopyDay: (items: AgendaItem[]) => void;
  onPasteDay: (dayId: string) => void;
  onClearDay: () => void;
  onSetDayLocation: (type: 'start' | 'end', item: AgendaItem | null) => void;
  onAddBlockedPeriod: (start: string, end: string) => void;
  onRemoveBlockedPeriod: (index: number) => void;
  onDeleteDay: () => void;
  onDateChange: (newDate: string) => void;
  hasClipboard: boolean;
}

export function DayColumn({ day, dayIndex, highlightedItemId, isFocused, onDayClick, onItemClick, onAddItem, onPasteDay, onClearDay, onSetDayLocation, onAddBlockedPeriod, onRemoveBlockedPeriod, onDeleteDay, onDateChange, hasClipboard }: Props) {
  const amItems = day.items.filter(i => i.category !== 'accommodation' && i.timeSlot !== 'pm');
  const pmItems = day.items.filter(i => i.category !== 'accommodation' && i.timeSlot === 'pm');
  const hotelItems = day.items.filter(i => i.category === 'accommodation');

  const amDropId = `${day.id}:am`;
  const pmDropId = `${day.id}:pm`;
  const hotelDropId = `${day.id}:hotel`;
  const startDropId = `${day.id}:start`;
  const endDropId = `${day.id}:end`;

  const [isEditingDate, setIsEditingDate] = useState(false);

  const formatDate = (dateStr: string) => {
    const date = new Date(dateStr + 'T00:00:00');
    return date.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
  };

  return (
    <div className={`day-column ${isFocused ? 'day-column-focused' : ''}`}>
      <div
        className="day-column-header"
        style={{ borderTop: `3px solid ${getDayColor(dayIndex)}` }}
        onClick={() => onDayClick(day.id)}
      >
        <div className="day-column-title">
          <span className="day-label" style={{ color: getDayColor(dayIndex) }}>Day {dayIndex + 1}</span>
          {isEditingDate ? (
            <input 
              type="date" 
              value={day.date} 
              className="day-date-edit"
              onClick={(e) => e.stopPropagation()}
              onChange={(e) => onDateChange(e.target.value)}
              onBlur={() => setIsEditingDate(false)}
              onKeyDown={(e) => e.key === 'Enter' && setIsEditingDate(false)}
              autoFocus
            />
          ) : (
            <span 
              className="day-date" 
              onClick={(e) => { e.stopPropagation(); setIsEditingDate(true); }}
              title="Click to edit date"
            >
              {formatDate(day.date)}
            </span>
          )}
        </div>
        <div className="day-column-actions" onClick={e => e.stopPropagation()}>
          {day.items.length > 0 && (
            <button
              className="day-action-btn delete-btn"
              title="Clear items (keep day)"
              onClick={onClearDay}
            >
              clear
            </button>
          )}
          <button
            className="day-action-btn delete-day-btn"
            title="Delete this day completely"
            onClick={onDeleteDay}
          >
            🗑️
          </button>
          {hasClipboard && (
            <button
              className="day-action-btn paste-btn"
              title="Paste items here"
              onClick={() => onPasteDay(day.id)}
            >
              paste
            </button>
          )}
        </div>
      </div>
      
      <StartEndZone
        id={startDropId}
        label="START"
        item={day.startLocation}
        onClear={() => onSetDayLocation('start', null)}
      />

      <div className="day-body-row">
        <div className="time-ruler-wrapper">
           <TimeRuler
             blockedPeriods={day.blockedPeriods || []}
             onAddBlockedPeriod={onAddBlockedPeriod}
             onRemoveBlockedPeriod={onRemoveBlockedPeriod}
           />
        </div>
        <div className="day-zones-col" style={{ height: RULER_HEIGHT }}>
          <DropZone id={amDropId} label="AM" items={amItems} highlightedItemId={highlightedItemId} onItemClick={onItemClick} dayDate={day.date} zoneHeight={AM_HEIGHT} zoneStartHour={START_HOUR} />
          <DropZone id={pmDropId} label="PM" items={pmItems} highlightedItemId={highlightedItemId} onItemClick={onItemClick} dayDate={day.date} zoneHeight={PM_HEIGHT} zoneStartHour={AM_END_HOUR} />
          <DropZone id={hotelDropId} label="🏠" items={hotelItems} highlightedItemId={highlightedItemId} onItemClick={onItemClick} className="accommodation-row" dayDate={day.date} />
        </div>
      </div>

      <StartEndZone
        id={endDropId}
        label="END"
        item={day.endLocation}
        onClear={() => onSetDayLocation('end', null)}
      />

      <button className="add-item-btn-compact" onClick={onAddItem}>+</button>
    </div>
  );
}

interface StartEndZoneProps {
  id: string;
  label: string;
  item?: AgendaItem;
  onClear: () => void;
  dayDate?: string;
  isStart: boolean;
}

function StartEndZone({ id, label, item, onClear }: Omit<StartEndZoneProps, 'dayDate' | 'isStart'>) {
  const { setNodeRef, isOver } = useDroppable({ id });
  
  return (
    <div ref={setNodeRef} className={`drop-zone start-end-zone ${isOver ? 'drop-zone-over' : ''} ${item ? 'filled' : ''}`}>
      {!item && <span className="zone-label-placeholder">{label}</span>}
      {item && (
        <div className="start-end-item">
           <span className="zone-label-mini">{label}</span>
           <span className="start-end-title">{item.title}</span>
           <button className="clear-se-btn" onClick={(e) => { e.stopPropagation(); onClear(); }}>✖</button>
        </div>
      )}
    </div>
  );
}

interface DropZoneProps {
  id: string;
  label: string;
  items: AgendaItem[];
  highlightedItemId?: string;
  onItemClick: (item: AgendaItem) => void;
  className?: string;
  dayDate?: string;
  zoneHeight?: number;
  zoneStartHour?: number;
}

function parseItemStartHour(item: AgendaItem): number | null {
  if (!item.time) return null;
  const match = item.time.match(/^(\d{1,2}):(\d{2})/);
  if (!match) return null;
  return parseInt(match[1], 10) + parseInt(match[2], 10) / 60;
}

function DropZone({ id, label, items, highlightedItemId, onItemClick, className, dayDate, zoneHeight, zoneStartHour }: DropZoneProps) {
  const { setNodeRef, isOver } = useDroppable({ id });

  // Sort items by their start time when we have time info
  const sortedItems = zoneStartHour != null
    ? [...items].sort((a, b) => {
        const aH = parseItemStartHour(a);
        const bH = parseItemStartHour(b);
        if (aH == null && bH == null) return 0;
        if (aH == null) return 1;
        if (bH == null) return -1;
        return aH - bH;
      })
    : items;

  const useTimePositioning = zoneStartHour != null && zoneHeight;

  return (
    <div
      ref={setNodeRef}
      className={`drop-zone ${className || ''} ${isOver ? 'drop-zone-over' : ''}`}
      style={zoneHeight ? { minHeight: zoneHeight, height: zoneHeight, position: 'relative' } : undefined}
    >
      <span className="zone-label">{label}</span>
      <SortableContext items={sortedItems.map(i => i.id)} strategy={verticalListSortingStrategy}>
        {sortedItems.map(item => {
          if (useTimePositioning) {
            const startH = parseItemStartHour(item);
            if (startH != null) {
              const top = (startH - zoneStartHour!) * PIXELS_PER_HOUR;
              return (
                <div key={item.id} style={{ position: 'absolute', left: 8, right: 8, top: Math.max(0, top) }}>
                  <AgendaCard
                    item={item}
                    onClick={() => onItemClick(item)}
                    isHighlighted={item.id === highlightedItemId}
                    dayDate={dayDate}
                  />
                </div>
              );
            }
          }

          return (
            <AgendaCard
              key={item.id}
              item={item}
              onClick={() => onItemClick(item)}
              isHighlighted={item.id === highlightedItemId}
              dayDate={dayDate}
            />
          );
        })}
      </SortableContext>
    </div>
  );
}
