import { useDroppable } from '@dnd-kit/core';
import { SortableContext, verticalListSortingStrategy } from '@dnd-kit/sortable';
import { Day, AgendaItem } from '../types';
import { AgendaCard } from './AgendaCard';

interface Props {
  day: Day;
  dayIndex: number;
  highlightedItemId?: string;
  onItemClick: (item: AgendaItem) => void;
  onAddItem: () => void;
}

export function DaySection({ day, dayIndex, highlightedItemId, onItemClick, onAddItem }: Props) {
  const { setNodeRef, isOver } = useDroppable({ id: day.id });

  const formatDate = (dateStr: string) => {
    const date = new Date(dateStr);
    return date.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
  };

  return (
    <div className={`day-section ${isOver ? 'drop-target' : ''}`}>
      <div className="day-header">
        <h3>Day {dayIndex + 1} - {formatDate(day.date)}</h3>
      </div>
      <div ref={setNodeRef} className="day-items">
        <SortableContext items={day.items.map(i => i.id)} strategy={verticalListSortingStrategy}>
          {day.items.map(item => (
            <AgendaCard
              key={item.id}
              item={item}
              onClick={() => onItemClick(item)}
              isHighlighted={item.id === highlightedItemId}
            />
          ))}
        </SortableContext>
        <button className="add-item-btn" onClick={onAddItem}>
          + Add Item
        </button>
      </div>
    </div>
  );
}
