import { useState, useCallback, useRef } from 'react';
import { useDroppable } from '@dnd-kit/core';
import { SortableContext, verticalListSortingStrategy } from '@dnd-kit/sortable';
import { Day, AgendaItem } from '../types';
import { AgendaCard } from './AgendaCard';
import { TimeRuler, START_HOUR, getRulerHeight } from './TimeRuler';
import { getDayColor } from '../dayColors';
import { parseStartHour } from '../utils/time';

const AM_END_HOUR = 12;
const PM_END_HOUR = 22;
const MIN_CARD_HEIGHT = 66; // minimum px reserved per card to prevent overlap

const MIN_COL_WIDTH = 150;
const MAX_COL_WIDTH = 500;

interface Props {
  day: Day;
  dayIndex: number;
  highlightedItemId?: string;
  isFocused?: boolean;
  columnWidth: number;
  onColumnWidthChange: (width: number) => void;
  onDayClick: (dayId: string) => void;
  onItemClick: (item: AgendaItem) => void;
  onAddItem: (prefill?: { time?: string; timeSlot?: 'am' | 'pm'; suggestedDuration?: number }) => void;
  onCopyDay: (items: AgendaItem[]) => void;
  onPasteDay: (dayId: string) => void;
  onClearDay: () => void;
  onSetDayLocation: (type: 'start' | 'end', item: AgendaItem | null) => void;
  onAddBlockedPeriod: (start: string, end: string) => void;
  onRemoveBlockedPeriod: (index: number) => void;
  onDeleteDay: () => void;
  onDateChange: (newDate: string) => void;
  hasClipboard: boolean;
  pixelsPerHour: number;
}

export function DayColumn({ day, dayIndex, highlightedItemId, isFocused, columnWidth, onColumnWidthChange, onDayClick, onItemClick, onAddItem, onPasteDay, onClearDay, onSetDayLocation, onAddBlockedPeriod, onRemoveBlockedPeriod, onDeleteDay, onDateChange, hasClipboard, pixelsPerHour }: Props) {
  const amItems = day.items.filter(i => i.category !== 'accommodation' && i.timeSlot !== 'pm');
  const pmItems = day.items.filter(i => i.category !== 'accommodation' && i.timeSlot === 'pm');
  const hotelItems = day.items.filter(i => i.category === 'accommodation');

  const amDropId = `${day.id}:am`;
  const pmDropId = `${day.id}:pm`;
  const hotelDropId = `${day.id}:hotel`;
  const startDropId = `${day.id}:start`;
  const endDropId = `${day.id}:end`;

  const [isEditingDate, setIsEditingDate] = useState(false);
  const dragRef = useRef<{ startX: number; startWidth: number } | null>(null);

  const handleResizeMouseDown = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    dragRef.current = { startX: e.clientX, startWidth: columnWidth };

    const onMouseMove = (ev: MouseEvent) => {
      if (!dragRef.current) return;
      const delta = ev.clientX - dragRef.current.startX;
      const newWidth = Math.min(MAX_COL_WIDTH, Math.max(MIN_COL_WIDTH, dragRef.current.startWidth + delta));
      onColumnWidthChange(newWidth);
    };
    const onMouseUp = () => {
      dragRef.current = null;
      window.removeEventListener('mousemove', onMouseMove);
      window.removeEventListener('mouseup', onMouseUp);
    };
    window.addEventListener('mousemove', onMouseMove);
    window.addEventListener('mouseup', onMouseUp);
  }, [columnWidth, onColumnWidthChange]);

  const rulerHeight = getRulerHeight(pixelsPerHour);
  const amHeight = (AM_END_HOUR - START_HOUR) * pixelsPerHour;
  const pmHeight = (PM_END_HOUR - AM_END_HOUR) * pixelsPerHour;

  const handleBlankClick = useCallback((hour: number) => {
    const h = Math.floor(hour);
    const m = Math.round((hour - h) * 60);
    const period = h >= 12 ? 'PM' : 'AM';
    const displayH = h > 12 ? h - 12 : (h === 0 ? 12 : h);
    const time = `${displayH}:${String(m).padStart(2, '0')} ${period}`;
    const timeSlot: 'am' | 'pm' = h < 12 ? 'am' : 'pm';
    onAddItem({ time, timeSlot, suggestedDuration: 45 });
  }, [onAddItem]);

  const formatDate = (dateStr: string) => {
    const date = new Date(dateStr + 'T00:00:00');
    return date.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
  };

  return (
    <div className={`day-column ${isFocused ? 'day-column-focused' : ''}`} style={{ width: columnWidth }}>
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
             pixelsPerHour={pixelsPerHour}
           />
        </div>
        <div className="day-zones-col" style={{ height: rulerHeight }}>
          <DropZone id={amDropId} label="AM" items={amItems} highlightedItemId={highlightedItemId} onItemClick={onItemClick} onBlankClick={handleBlankClick} dayDate={day.date} zoneHeight={amHeight} zoneStartHour={START_HOUR} pixelsPerHour={pixelsPerHour} />
          <DropZone id={pmDropId} label="PM" items={pmItems} highlightedItemId={highlightedItemId} onItemClick={onItemClick} onBlankClick={handleBlankClick} dayDate={day.date} zoneHeight={pmHeight} zoneStartHour={AM_END_HOUR} pixelsPerHour={pixelsPerHour} />
        </div>
      </div>
      <DropZone id={hotelDropId} label="🏠" items={hotelItems} highlightedItemId={highlightedItemId} onItemClick={onItemClick} className="accommodation-row" dayDate={day.date} />

      <StartEndZone
        id={endDropId}
        label="END"
        item={day.endLocation}
        onClear={() => onSetDayLocation('end', null)}
      />

      <button className="add-item-btn-compact" onClick={() => onAddItem()}>+</button>
      <div className="col-resize-handle" onMouseDown={handleResizeMouseDown} />
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
  onBlankClick?: (hour: number) => void;
  className?: string;
  dayDate?: string;
  zoneHeight?: number;
  zoneStartHour?: number;
  pixelsPerHour?: number;
}

function parseItemStartHour(item: AgendaItem): number | null {
  return parseStartHour(item.time);
}

function DropZone({ id, label, items, highlightedItemId, onItemClick, onBlankClick, className, dayDate, zoneHeight, zoneStartHour, pixelsPerHour }: DropZoneProps) {
  const { setNodeRef, isOver } = useDroppable({ id });
  const zoneRef = useRef<HTMLDivElement>(null);

  const handleZoneClick = useCallback((e: React.MouseEvent) => {
    // Only trigger if clicking on the zone background itself, not on a card
    if (!onBlankClick || !zoneRef.current || zoneStartHour == null || !pixelsPerHour) return;
    const target = e.target as HTMLElement;
    // Check we clicked the zone div or zone-label, not a card
    if (target.closest('.agenda-card')) return;
    const rect = zoneRef.current.getBoundingClientRect();
    const y = e.clientY - rect.top;
    const clickedHour = zoneStartHour + y / pixelsPerHour;
    // Round to nearest 15 minutes
    const rounded = Math.round(clickedHour * 4) / 4;
    onBlankClick(Math.max(zoneStartHour, rounded));
  }, [onBlankClick, zoneStartHour, pixelsPerHour]);

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

  const useTimePositioning = zoneStartHour != null && zoneHeight && pixelsPerHour;

  // Compute positions with overlap prevention
  let positions: { item: AgendaItem; top: number }[] | null = null;
  if (useTimePositioning) {
    positions = [];
    let bottomEdge = 0; // tracks the bottom of the last positioned card
    for (const item of sortedItems) {
      const startH = parseItemStartHour(item);
      if (startH != null) {
        const idealTop = (startH - zoneStartHour!) * pixelsPerHour!;
        // Push down if it would overlap the previous card
        const top = Math.max(idealTop, bottomEdge);
        positions.push({ item, top });
        bottomEdge = top + MIN_CARD_HEIGHT;
      } else {
        // Items without a time: stack after the last positioned item
        positions.push({ item, top: bottomEdge });
        bottomEdge += MIN_CARD_HEIGHT;
      }
    }
  }

  // If items overflow the zone, expand to fit
  const contentHeight = positions && positions.length > 0
    ? positions[positions.length - 1].top + MIN_CARD_HEIGHT
    : 0;
  const effectiveHeight = zoneHeight ? Math.max(zoneHeight, contentHeight) : undefined;

  // Merge refs for droppable + click handling
  const mergedRef = useCallback((node: HTMLDivElement | null) => {
    setNodeRef(node);
    (zoneRef as React.MutableRefObject<HTMLDivElement | null>).current = node;
  }, [setNodeRef]);

  return (
    <div
      ref={mergedRef}
      className={`drop-zone ${className || ''} ${isOver ? 'drop-zone-over' : ''}`}
      style={effectiveHeight ? { minHeight: effectiveHeight, height: effectiveHeight, position: 'relative', cursor: onBlankClick ? 'pointer' : undefined } : undefined}
      onClick={handleZoneClick}
    >
      <span className="zone-label">{label}</span>
      <SortableContext items={sortedItems.map(i => i.id)} strategy={verticalListSortingStrategy}>
        {positions
          ? positions.map(({ item, top }) => (
              <div key={item.id} style={{ position: 'absolute', left: 8, right: 8, top: Math.max(0, top) }}>
                <AgendaCard
                  item={item}
                  onClick={() => onItemClick(item)}
                  isHighlighted={item.id === highlightedItemId}
                  dayDate={dayDate}
                />
              </div>
            ))
          : sortedItems.map(item => (
              <AgendaCard
                key={item.id}
                item={item}
                onClick={() => onItemClick(item)}
                isHighlighted={item.id === highlightedItemId}
                dayDate={dayDate}
              />
            ))
        }
      </SortableContext>
    </div>
  );
}
