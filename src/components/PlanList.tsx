import { useState, useMemo } from 'react';
import { useDroppable } from '@dnd-kit/core';
import { SortableContext, verticalListSortingStrategy } from '@dnd-kit/sortable';
import { AgendaItem } from '../types';
import { PLAN_LIST_ID } from '../store';
import { AgendaCard } from './AgendaCard';

interface Props {
  items: AgendaItem[];
  highlightedItemId?: string;
  onItemClick: (item: AgendaItem) => void;
  onDeleteItem: (itemId: string) => void;
  onDeleteMultiple: (itemIds: string[]) => void;
}

export function PlanList({ items, highlightedItemId, onItemClick, onDeleteItem, onDeleteMultiple }: Props) {
  const { setNodeRef, isOver } = useDroppable({ id: PLAN_LIST_ID });
  const [search, setSearch] = useState('');
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const selectMode = selected.size > 0;

  const filtered = useMemo(() => {
    if (!search.trim()) return items;
    const q = search.toLowerCase();
    return items.filter(item =>
      item.title.toLowerCase().includes(q) ||
      (item.location && item.location.toLowerCase().includes(q)) ||
      (item.notes && item.notes.toLowerCase().includes(q)) ||
      (item.category && item.category.toLowerCase().includes(q))
    );
  }, [items, search]);

  const toggleSelect = (id: string) => {
    setSelected(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const selectAll = () => {
    setSelected(new Set(filtered.map(i => i.id)));
  };

  const clearSelection = () => {
    setSelected(new Set());
  };

  const handleBulkDelete = () => {
    if (selected.size === 0) return;
    if (window.confirm(`Delete ${selected.size} place${selected.size > 1 ? 's' : ''}?`)) {
      onDeleteMultiple(Array.from(selected));
      setSelected(new Set());
    }
  };

  return (
    <div className={`plan-list ${isOver ? 'plan-list-over' : ''}`}>
      <div className="plan-list-header">
        <h3>Plan List</h3>
        <span className="plan-list-count">{items.length}</span>
      </div>

      {items.length > 0 && (
        <div className="plan-list-toolbar">
          <input
            type="text"
            className="plan-list-search"
            placeholder="Search places..."
            value={search}
            onChange={e => setSearch(e.target.value)}
          />
          <div className="plan-list-bulk-actions">
            {selectMode ? (
              <>
                <span className="bulk-count">{selected.size} selected</span>
                <button className="bulk-btn" onClick={selectAll}>All</button>
                <button className="bulk-btn" onClick={clearSelection}>None</button>
                <button className="bulk-btn bulk-delete" onClick={handleBulkDelete}>Delete</button>
              </>
            ) : (
              <button className="bulk-btn" onClick={selectAll}>Select all</button>
            )}
          </div>
        </div>
      )}

      <div ref={setNodeRef} className="plan-list-items">
        <SortableContext items={filtered.map(i => i.id)} strategy={verticalListSortingStrategy}>
          {filtered.map(item => (
            <div key={item.id} className={`plan-list-item-wrapper ${selected.has(item.id) ? 'item-selected' : ''}`}>
              {selectMode && (
                <input
                  type="checkbox"
                  className="plan-item-checkbox"
                  checked={selected.has(item.id)}
                  onChange={() => toggleSelect(item.id)}
                />
              )}
              <AgendaCard
                item={item}
                onClick={() => selectMode ? toggleSelect(item.id) : onItemClick(item)}
                isHighlighted={item.id === highlightedItemId}
              />
              {!selectMode && (
                <button
                  className="plan-item-delete-btn"
                  onClick={(e) => { e.stopPropagation(); onDeleteItem(item.id); }}
                  title="Remove from list"
                >
                  ×
                </button>
              )}
            </div>
          ))}
        </SortableContext>
        {items.length === 0 && (
          <div className="plan-list-empty">
            Import places or drag items here
          </div>
        )}
        {items.length > 0 && filtered.length === 0 && (
          <div className="plan-list-empty">
            No matches for "{search}"
          </div>
        )}
      </div>
    </div>
  );
}
