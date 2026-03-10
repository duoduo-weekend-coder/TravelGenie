import { useState, useMemo } from 'react';
import { useDroppable } from '@dnd-kit/core';
import { SortableContext, verticalListSortingStrategy } from '@dnd-kit/sortable';
import { AgendaItem, Category } from '../types';
import { PLAN_LIST_ID } from '../store';
import { AgendaCard } from './AgendaCard';

const ALL_CATEGORIES: Category[] = ['food', 'activity', 'transport', 'accommodation', 'other'];

const CATEGORY_LABELS: Record<Category, string> = {
  food: 'Food',
  activity: 'Activity',
  transport: 'Transport',
  accommodation: 'Hotel',
  other: 'Other',
};

/** Extract a short region token from a location string (first comma-segment, or the whole string). */
function extractRegion(location: string): string {
  // Try to grab the last meaningful segment (often the city/area)
  // e.g. "123 Main St, Shibuya, Tokyo" → "Tokyo"
  // e.g. "Shibuya" → "Shibuya"
  const parts = location.split(',').map(s => s.trim()).filter(Boolean);
  if (parts.length === 0) return location.trim();
  // Use the last segment as the region (typically city or country)
  return parts[parts.length - 1];
}

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
  const [categoryFilter, setCategoryFilter] = useState<Category | null>(null);
  const [regionFilter, setRegionFilter] = useState<string | null>(null);
  const [showFilters, setShowFilters] = useState(false);
  const selectMode = selected.size > 0;

  // Derive available categories from items
  const availableCategories = useMemo(() => {
    const cats = new Set(items.map(i => i.category));
    return ALL_CATEGORIES.filter(c => cats.has(c));
  }, [items]);

  // Derive available regions from item locations
  const availableRegions = useMemo(() => {
    const regionMap = new Map<string, number>(); // region → count
    for (const item of items) {
      if (item.location) {
        const region = extractRegion(item.location);
        if (region) {
          regionMap.set(region, (regionMap.get(region) || 0) + 1);
        }
      }
    }
    // Sort by count descending, then alphabetically
    return [...regionMap.entries()]
      .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
      .map(([region]) => region);
  }, [items]);

  const filtered = useMemo(() => {
    let result = items;

    if (categoryFilter) {
      result = result.filter(item => item.category === categoryFilter);
    }

    if (regionFilter) {
      const rf = regionFilter.toLowerCase();
      result = result.filter(item =>
        item.location && item.location.toLowerCase().includes(rf)
      );
    }

    if (search.trim()) {
      const q = search.toLowerCase();
      result = result.filter(item =>
        item.title.toLowerCase().includes(q) ||
        (item.location && item.location.toLowerCase().includes(q)) ||
        (item.notes && item.notes.toLowerCase().includes(q)) ||
        (item.category && item.category.toLowerCase().includes(q))
      );
    }

    return result;
  }, [items, search, categoryFilter, regionFilter]);

  const activeFilterCount = (categoryFilter ? 1 : 0) + (regionFilter ? 1 : 0);

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

  const clearFilters = () => {
    setCategoryFilter(null);
    setRegionFilter(null);
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
          <div className="plan-list-filter-row">
            <button
              className={`filter-toggle-btn ${showFilters || activeFilterCount > 0 ? 'active' : ''}`}
              onClick={() => setShowFilters(prev => !prev)}
            >
              Filter{activeFilterCount > 0 ? ` (${activeFilterCount})` : ''}
            </button>
            {activeFilterCount > 0 && (
              <button className="filter-clear-btn" onClick={clearFilters}>Clear</button>
            )}
          </div>
          {showFilters && (
            <div className="plan-list-filters">
              <div className="filter-group">
                <label className="filter-label">Type</label>
                <div className="filter-chips">
                  {availableCategories.map(cat => (
                    <button
                      key={cat}
                      className={`filter-chip ${categoryFilter === cat ? 'active' : ''}`}
                      onClick={() => setCategoryFilter(prev => prev === cat ? null : cat)}
                    >
                      {CATEGORY_LABELS[cat]}
                    </button>
                  ))}
                </div>
              </div>
              {availableRegions.length > 0 && (
                <div className="filter-group">
                  <label className="filter-label">Region</label>
                  <div className="filter-chips">
                    {availableRegions.map(region => (
                      <button
                        key={region}
                        className={`filter-chip ${regionFilter === region ? 'active' : ''}`}
                        onClick={() => setRegionFilter(prev => prev === region ? null : region)}
                      >
                        {region}
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
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
            No matches{search ? ` for "${search}"` : ''}
            {activeFilterCount > 0 && (
              <>
                <br />
                <button className="filter-clear-link" onClick={clearFilters}>Clear filters</button>
              </>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
