import { useState, useEffect } from 'react';
import {
  DndContext,
  DragEndEvent,
  DragStartEvent,
  closestCenter,
  PointerSensor,
  useSensor,
  useSensors
} from '@dnd-kit/core';
import { AgendaItem } from './types';
import { ScheduleEntry } from './utils/scheduleParser';
import { useTripStore, PLAN_LIST_ID } from './store';
import { PlanList } from './components/PlanList';
import { DayColumn } from './components/DayColumn';
import { EditModal } from './components/EditModal';
import { ImportModal } from './components/ImportModal';
import { MapPanel } from './components/MapPanel';
import { MapItem } from './dayColors';
import { v4 as uuid } from 'uuid';

const ITINERARY_TABS_KEY = 'travel-itineraries';
const ACTIVE_ITINERARY_KEY = 'travel-active-itinerary-id';

interface ItineraryTab {
  id: string;
  name: string;
}

function loadItineraryTabs(): ItineraryTab[] {
  const saved = localStorage.getItem(ITINERARY_TABS_KEY);
  if (saved) {
    try {
      const parsed = JSON.parse(saved) as ItineraryTab[];
      if (Array.isArray(parsed) && parsed.length > 0) {
        return parsed;
      }
    } catch {
      // ignore invalid persisted format
    }
  }
  return [{ id: 'default', name: 'My Trip' }];
}

function App() {
  const { trip, addDay, addItem, addUnassignedItem, addMultipleUnassignedItems, updateItem, deleteItem, deleteMultipleItems, moveItem, pasteDayItems, autoPlan, isPlanning, planningError, clearDay, clearPlan, setDayLocation, geminiKey, setGeminiKey, addBlockedPeriod, removeBlockedPeriod, deleteDay, updateDayDate, setTripRange, importSchedule } = useTripStore();
  const [selectedDayId, setSelectedDayId] = useState<string | null>(null);
  const [editingItem, setEditingItem] = useState<AgendaItem | null>(null);
  const [highlightedItemId, setHighlightedItemId] = useState<string | undefined>();
  const [focusedDayId, setFocusedDayId] = useState<string | null>(null);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [showImport, setShowImport] = useState(false);
  const [showScheduleImport, setShowScheduleImport] = useState(false);
  const [clipboard, setClipboard] = useState<AgendaItem[] | null>(null);
  const [isApiKeyModalOpen, setIsApiKeyModalOpen] = useState(false);
  const [apiKeyInput, setApiKeyInput] = useState('');
  const [itineraryTabs, setItineraryTabs] = useState<ItineraryTab[]>(() => loadItineraryTabs());
  const [activeItineraryId, setActiveItineraryId] = useState<string>(() => {
    return localStorage.getItem(ACTIVE_ITINERARY_KEY) || 'default';
  });

  useEffect(() => {
    console.log("Environment API Key:", import.meta.env.VITE_GEMINI_API_KEY ? "Loaded" : "Not Found");
  }, []);

  useEffect(() => {
    localStorage.setItem(ITINERARY_TABS_KEY, JSON.stringify(itineraryTabs));
  }, [itineraryTabs]);

  useEffect(() => {
    if (itineraryTabs.some(tab => tab.id === activeItineraryId)) {
      return;
    }
    const fallbackId = itineraryTabs[0]?.id || 'default';
    localStorage.setItem(ACTIVE_ITINERARY_KEY, fallbackId);
    setActiveItineraryId(fallbackId);
  }, [itineraryTabs, activeItineraryId]);

  const switchItinerary = (itineraryId: string) => {
    localStorage.setItem(ACTIVE_ITINERARY_KEY, itineraryId);
    setActiveItineraryId(itineraryId);
    window.location.reload();
  };

  const createItinerary = () => {
    const nameInput = window.prompt('Itinerary name', `Trip ${itineraryTabs.length + 1}`);
    const name = nameInput?.trim();
    if (!name) return;

    const newTab: ItineraryTab = {
      id: uuid(),
      name
    };
    setItineraryTabs(prev => [...prev, newTab]);
    switchItinerary(newTab.id);
  };

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } })
  );

  const allMapItems: MapItem[] = [
    ...trip.days.flatMap((d, dayIdx) => {
      const dayItems: MapItem[] = d.items.map(item => ({ ...item, dayIndex: dayIdx, dayId: d.id }));
      if (d.startLocation) {
        dayItems.unshift({ ...d.startLocation, dayIndex: dayIdx, dayId: d.id, isAnchor: 'start' });
      }
      if (d.endLocation) {
        dayItems.push({ ...d.endLocation, dayIndex: dayIdx, dayId: d.id, isAnchor: 'end' });
      }
      return dayItems;
    }),
    ...trip.unassignedItems.map(item => ({ ...item, dayIndex: undefined, dayId: undefined }))
  ];

  const handleAutoPlanClick = () => {
    if (!geminiKey) {
      setIsApiKeyModalOpen(true);
    } else {
      autoPlan();
    }
  };

  const handleSaveApiKey = () => {
    if (apiKeyInput.trim()) {
      setGeminiKey(apiKeyInput.trim());
      setIsApiKeyModalOpen(false);
      // Optionally trigger plan immediately
      // autoPlan(); // Can't call async easily here without wrapper, user can click again
    }
  };

  const handleDragStart = (event: DragStartEvent) => {
    setHighlightedItemId(event.active.id as string);
  };

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    setHighlightedItemId(undefined);

    if (!over) return;

    const activeId = active.id as string;
    const overId = over.id as string;

    // Find source: plan list or a day
    let sourceId: string | null = null;
    if (trip.unassignedItems.some(i => i.id === activeId)) {
      sourceId = PLAN_LIST_ID;
    } else {
      const sourceDay = trip.days.find(d => d.items.some(i => i.id === activeId));
      sourceId = sourceDay?.id || null;
    }
    if (!sourceId) return;

    // Determine destination
    let destId: string;
    let newIndex = 0;
    let timeSlot: 'am' | 'pm' | undefined;

    if (overId === PLAN_LIST_ID) {
      // Dropped on plan list
      destId = PLAN_LIST_ID;
    } else if (overId.includes(':')) {
      // Dropped on a zone like "dayId:am" or "dayId:pm" or "dayId:hotel" or "dayId:start"
      const [dayId, zone] = overId.split(':');
      
      if (zone === 'start' || zone === 'end') {
         // Special handling for Start/End zones: Clone the item there
         let itemToClone: AgendaItem | undefined;
         if (trip.unassignedItems.some(i => i.id === activeId)) {
            itemToClone = trip.unassignedItems.find(i => i.id === activeId);
         } else {
            const sDay = trip.days.find(d => d.items.some(i => i.id === activeId));
            itemToClone = sDay?.items.find(i => i.id === activeId);
         }
         
         if (itemToClone) {
            // Remove timeSlot/notes to clean up
            const { id, timeSlot, ...rest } = itemToClone; 
            setDayLocation(dayId, zone as 'start' | 'end', rest);
         }
         return; // Done, don't move the original item
      }

      destId = dayId;
      if (zone === 'am') timeSlot = 'am';
      else if (zone === 'pm') timeSlot = 'pm';
      // hotel zone: no timeSlot change, category handles it
      const targetDay = trip.days.find(d => d.id === dayId);
      if (targetDay) {
        // Append at end of zone
        if (zone === 'am') {
          newIndex = targetDay.items.filter(i => i.category !== 'accommodation' && i.timeSlot !== 'pm').length;
        } else if (zone === 'pm') {
          const amCount = targetDay.items.filter(i => i.category !== 'accommodation' && i.timeSlot !== 'pm').length;
          newIndex = amCount + targetDay.items.filter(i => i.category !== 'accommodation' && i.timeSlot === 'pm').length;
        } else {
          newIndex = targetDay.items.length;
        }
      }
    } else {
      // Dropped on an item — find which day and zone it's in
      const overDay = trip.days.find(d => d.items.some(i => i.id === overId));
      if (overDay) {
        destId = overDay.id;
        const overItem = overDay.items.find(i => i.id === overId);
        newIndex = overDay.items.findIndex(i => i.id === overId);
        if (overItem) {
          timeSlot = overItem.timeSlot;
        }
      } else if (trip.unassignedItems.some(i => i.id === overId)) {
        destId = PLAN_LIST_ID;
      } else {
        return;
      }
    }

    if (sourceId === destId! && sourceId !== PLAN_LIST_ID) {
      // Same day — still move to update timeSlot or reorder
      moveItem(sourceId, destId!, activeId, newIndex, timeSlot);
    } else {
      moveItem(sourceId, destId!, activeId, newIndex, timeSlot);
    }
  };

  const handleAddItem = (dayId: string) => {
    setSelectedDayId(dayId);
    setEditingItem(null);
    setIsModalOpen(true);
  };

  const handleEditItem = (item: AgendaItem) => {
    // Check if item is in plan list or in a day
    if (trip.unassignedItems.some(i => i.id === item.id)) {
      setSelectedDayId(PLAN_LIST_ID);
    } else {
      const day = trip.days.find(d => d.items.some(i => i.id === item.id));
      setSelectedDayId(day?.id || null);
    }
    setEditingItem(item);
    setIsModalOpen(true);
  };

  const handleSaveItem = (item: Omit<AgendaItem, 'id'> | AgendaItem, targetDate?: string) => {
    if (!selectedDayId) return;

    // If editing an item in the plan list and a date is selected, move it to that day
    if (targetDate && selectedDayId === PLAN_LIST_ID) {
      const targetDay = trip.days.find(d => d.date === targetDate);
      if (targetDay) {
        if ('id' in item && item.id) {
          // Update the item first, then move it
          updateItem(PLAN_LIST_ID, item.id, item);
          moveItem(PLAN_LIST_ID, targetDay.id, item.id, targetDay.items.length, item.timeSlot);
        } else {
          // New item — add directly to the target day
          addItem(targetDay.id, item as Omit<AgendaItem, 'id'>);
        }
        setEditingItem(null);
        setIsModalOpen(false);
        return;
      }
    }

    if ('id' in item && item.id) {
      updateItem(selectedDayId, item.id, item);
    } else {
      if (selectedDayId === PLAN_LIST_ID) {
        addUnassignedItem(item as Omit<AgendaItem, 'id'>);
      } else {
        addItem(selectedDayId, item as Omit<AgendaItem, 'id'>);
      }
    }
    setEditingItem(null);
    setIsModalOpen(false);
  };

  const handleDeleteItem = () => {
    if (selectedDayId && editingItem) {
      deleteItem(selectedDayId, editingItem.id);
      setEditingItem(null);
      setIsModalOpen(false);
    }
  };

  const handleCopyItem = () => {
    if (editingItem) {
      // Remove ID to treat as new template
      const { id, ...rest } = editingItem;
      // We store it as an array to compatible with pasteDayItems
      setClipboard([rest as AgendaItem]); 
      setIsModalOpen(false);
      setEditingItem(null);
    }
  };

  const handleImport = (items: Omit<AgendaItem, 'id'>[]) => {
    try {
      addMultipleUnassignedItems(items);
    } catch (e) {
      console.error('Import error:', e);
    }
  };

  const handleScheduleImport = (entries: ScheduleEntry[]) => {
    importSchedule(entries);
  };

  const handleDayClick = (dayId: string) => {
    setFocusedDayId(prev => prev === dayId ? null : dayId);
  };

  // Calculate end date based on days array
  // Assuming consecutive days, end date is start date + days.length - 1
  const endDate = (() => {
    if (trip.days.length === 0) return trip.startDate;
    // Just use the last day's date if available, or calc from start
    // If days are sorted, last one is end.
    return trip.days[trip.days.length - 1].date;
  })();

  const handleRangeChange = (start: string, end: string) => {
    setTripRange(start, end);
  };

  return (
    <div className="app">
      <header className="app-header">
        <div className="header-row">
          <div className="header-left">
            <h1>{trip.title}</h1>
            <div className="itinerary-tabs">
              {itineraryTabs.map(tab => (
                <button
                  key={tab.id}
                  className={`itinerary-tab ${tab.id === activeItineraryId ? 'active' : ''}`}
                  onClick={() => switchItinerary(tab.id)}
                >
                  {tab.name}
                </button>
              ))}
              <button className="itinerary-tab add" onClick={createItinerary}>+ Itinerary</button>
            </div>
          </div>
          <div className="header-actions">
            <div className="date-range-inputs">
              <input
                type="date"
                className="date-input"
                value={trip.startDate}
                onChange={e => handleRangeChange(e.target.value, endDate)}
                title="Start Date"
              />
              <span className="date-arrow">→</span>
              <input
                type="date"
                className="date-input"
                value={endDate}
                onChange={e => handleRangeChange(trip.startDate, e.target.value)}
                title="End Date"
              />
            </div>
            <span className="day-count">{trip.days.length} days</span>
            <button 
              className="auto-plan-btn"
              onClick={handleAutoPlanClick}
              disabled={isPlanning}
              title={geminiKey ? "Auto Plan with Gemini AI" : "Auto Plan (Click to set API Key)"}
            >
              {isPlanning ? '✨ Planning...' : (geminiKey ? '✨ AI Plan' : '✨ Auto Plan')}
            </button>
            {planningError && <span style={{ color: 'red', fontSize: '12px' }}>Error: {planningError}</span>}
            <button 
              className="clear-plan-btn"
              onClick={() => {
                if (window.confirm('Are you sure you want to clear the plan? All items will be moved back to the list.')) {
                  clearPlan();
                }
              }}
              title="Clear all days and move items back to list"
            >
              🗑️ Clear Plan
            </button>
            <button className="import-btn" onClick={() => setShowScheduleImport(true)}>
              Import Schedule
            </button>
            <button className="import-btn" onClick={() => setShowImport(true)}>
              Import Places
            </button>
          </div>
        </div>
      </header>

      <DndContext
        sensors={sensors}
        collisionDetection={closestCenter}
        onDragStart={handleDragStart}
        onDragEnd={handleDragEnd}
      >
        <div className="main-content">
          <PlanList
            items={trip.unassignedItems}
            highlightedItemId={highlightedItemId}
            onItemClick={handleEditItem}
            onDeleteItem={(itemId) => deleteItem(PLAN_LIST_ID, itemId)}
            onDeleteMultiple={(ids) => deleteMultipleItems(PLAN_LIST_ID, ids)}
          />
          <div className="day-grid">
            {trip.days.map((day, index) => (
              <DayColumn
                key={day.id}
                day={day}
                dayIndex={index}
                highlightedItemId={highlightedItemId}
                isFocused={focusedDayId === day.id}
                onDayClick={handleDayClick}
                onItemClick={handleEditItem}
                onAddItem={() => handleAddItem(day.id)}
                onCopyDay={(items) => setClipboard(items)}
                onPasteDay={(dayId) => { if (clipboard) pasteDayItems(dayId, clipboard); }}
                onClearDay={() => {
                  if (window.confirm('Clear all items from this day?')) {
                    clearDay(day.id);
                  }
                }}
                onSetDayLocation={(type, item) => setDayLocation(day.id, type, item)}
                onAddBlockedPeriod={(start, end) => addBlockedPeriod(day.id, start, end)}
                onRemoveBlockedPeriod={(index) => removeBlockedPeriod(day.id, index)}
                onDeleteDay={() => {
                  if (window.confirm('Delete this day completely? Items will be moved to the plan list.')) {
                    deleteDay(day.id);
                  }
                }}
                onDateChange={(newDate) => updateDayDate(day.id, newDate)}
                hasClipboard={!!clipboard}
              />
            ))}
            <button className="add-day-btn" onClick={addDay}>
              + Day
            </button>
          </div>
        </div>
      </DndContext>

      <div className="map-strip">
        <MapPanel items={allMapItems} highlightedItemId={highlightedItemId} focusedDayId={focusedDayId} />
      </div>

      {isModalOpen && (
        <EditModal
          item={editingItem || undefined}
          onSave={handleSaveItem}
          onDelete={editingItem ? handleDeleteItem : undefined}
          onCopy={editingItem ? handleCopyItem : undefined}
          onClose={() => { setEditingItem(null); setIsModalOpen(false); }}
          availableDays={trip.days.map(d => ({ id: d.id, date: d.date }))}
          showDatePicker={selectedDayId === PLAN_LIST_ID}
        />
      )}
      {showImport && (
        <ImportModal
          onImport={handleImport}
          onScheduleImport={handleScheduleImport}
          tripDays={trip.days.map(d => ({ id: d.id, date: d.date }))}
          tripYear={new Date(trip.startDate).getFullYear()}
          onClose={() => setShowImport(false)}
        />
      )}
      {showScheduleImport && (
        <ImportModal
          onImport={handleImport}
          onScheduleImport={handleScheduleImport}
          tripDays={trip.days.map(d => ({ id: d.id, date: d.date }))}
          tripYear={new Date(trip.startDate).getFullYear()}
          onClose={() => setShowScheduleImport(false)}
          scheduleOnly
        />
      )}
      {isApiKeyModalOpen && (
        <div className="modal-overlay" onClick={() => setIsApiKeyModalOpen(false)}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            <h2>Set Gemini API Key</h2>
            <p style={{ marginBottom: 16, fontSize: 14, color: '#666' }}>
              To use AI-powered planning, please enter your Google Gemini API Key. 
              The key is stored locally in your browser.
            </p>
            <input 
              type="password" 
              placeholder="Enter API Key" 
              value={apiKeyInput}
              onChange={e => setApiKeyInput(e.target.value)}
              style={{ width: '100%', marginBottom: 16 }}
            />
            <div className="modal-actions">
              <button onClick={() => setIsApiKeyModalOpen(false)}>Cancel</button>
              <button 
                className="save-btn" 
                onClick={handleSaveApiKey}
                disabled={!apiKeyInput.trim()}
              >
                Save & Enable AI
              </button>
            </div>
            <div style={{ marginTop: 20, paddingTop: 20, borderTop: '1px solid #eee' }}>
               <p style={{ fontSize: 13, color: '#888' }}>
                 Don't have a key? You can <a href="https://aistudio.google.com/app/apikey" target="_blank" rel="noopener noreferrer">get one here</a>.
                 <br/>
                 Or <button style={{ background: 'none', border: 'none', color: '#6366f1', cursor: 'pointer', padding: 0, textDecoration: 'underline' }} onClick={() => { setIsApiKeyModalOpen(false); autoPlan(); }}>use basic planner instead</button>.
               </p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default App;
