import { useState, useEffect, useRef } from 'react';
import {
  DndContext,
  DragEndEvent,
  DragStartEvent,
  closestCenter,
  PointerSensor,
  useSensor,
  useSensors
} from '@dnd-kit/core';
import { AgendaItem, Category } from './types';
import { syncGoogleMapsList, getCategoryFromTypes } from './googleMaps';
import { ScheduleEntry } from './utils/scheduleParser';
import { useTripStore, PLAN_LIST_ID } from './store';
import { PlanList } from './components/PlanList';
import { DayColumn } from './components/DayColumn';
import { EditModal } from './components/EditModal';
import { ImportModal } from './components/ImportModal';
import { XhsPanel } from './components/XhsPanel';
import { MapPanel } from './components/MapPanel';
import { MobileView } from './components/MobileView';
import { MapItem } from './dayColors';
import { useMobileDetect } from './hooks/useMobileDetect';
import { START_HOUR } from './components/TimeRuler';
import { v4 as uuid } from 'uuid';
import { savePhotos, stripPhotosForStorage } from './photoStore';
import { saveSharedTrip, loadSharedTrip, getShareIdFromUrl, clearShareIdFromUrl, setShareId, getItineraryByShareId } from './utils/shareTrip';

const AM_END_HOUR = 12;
const PM_END_HOUR = 22;
const MIN_CARD_HEIGHT = 66;
const MIN_PIXELS_PER_HOUR = 40;

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
  const [activeItineraryId, setActiveItineraryId] = useState<string>(() => {
    return localStorage.getItem(ACTIVE_ITINERARY_KEY) || 'default';
  });
  const { trip, setTitle: _setTitle, addDay, addItem, addUnassignedItem, addMultipleUnassignedItems, updateItem, deleteItem, deleteMultipleItems, moveItem, pasteDayItems, autoPlan, isPlanning, planningError, planExplanation, setPlanExplanation, clearDay, clearPlan, setDayLocation, geminiKey, setGeminiKey, addBlockedPeriod, removeBlockedPeriod, deleteDay, updateDayDate, setTripRange, importSchedule, addGoogleMapsListUrl, undo, redo, canUndo, canRedo } = useTripStore(activeItineraryId);
  const tripTitleRef = useRef(trip.title);
  tripTitleRef.current = trip.title;
  const setTitle = (title: string) => { tripTitleRef.current = title; _setTitle(title); };
  const [selectedDayId, setSelectedDayId] = useState<string | null>(null);
  const [editingItem, setEditingItem] = useState<AgendaItem | null>(null);
  const [highlightedItemId, setHighlightedItemId] = useState<string | undefined>();
  const [focusedDayId, setFocusedDayId] = useState<string | null>(null);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [showImport, setShowImport] = useState(false);
  const [showXhsImport, setShowXhsImport] = useState(false);
  const [showScheduleImport, setShowScheduleImport] = useState(false);
  const [clipboard, setClipboard] = useState<AgendaItem[] | null>(null);
  const [isApiKeyModalOpen, setIsApiKeyModalOpen] = useState(false);
  const [showPlanList, setShowPlanList] = useState(true);
  const [importMenuOpen, setImportMenuOpen] = useState(false);
  const [fileMenuOpen, setFileMenuOpen] = useState(false);
  const importMenuRef = useRef<HTMLDivElement>(null);
  const fileMenuRef = useRef<HTMLDivElement>(null);
  const tripFileInputRef = useRef<HTMLInputElement>(null);
  const [apiKeyInput, setApiKeyInput] = useState('');
  const [itineraryTabs, _setItineraryTabs] = useState<ItineraryTab[]>(() => loadItineraryTabs());
  const itineraryTabsRef = useRef(itineraryTabs);
  const setItineraryTabs: typeof _setItineraryTabs = (action) => {
    _setItineraryTabs(prev => {
      const next = typeof action === 'function' ? action(prev) : action;
      itineraryTabsRef.current = next;
      return next;
    });
  };
  const [dayColumnWidths, setDayColumnWidths] = useState<Record<string, number>>(() => {
    const saved = localStorage.getItem('travel-day-column-widths');
    if (saved) {
      try { return JSON.parse(saved); } catch { /* ignore */ }
    }
    return {};
  });
  const { isMobile, toggleMobile, manualOverride } = useMobileDetect();
  const [isSharing, setIsSharing] = useState(false);
  const [shareUrl, setShareUrl] = useState<string | null>(null);
  const [shareError, setShareError] = useState<string | null>(null);
  const [isLoadingShared, setIsLoadingShared] = useState(false);
  const [loadShareError, setLoadShareError] = useState<string | null>(null);
  const [syncing, setSyncing] = useState(false);
  const [syncMessage, setSyncMessage] = useState<string | null>(null);

  useEffect(() => {
    console.log("Environment API Key:", import.meta.env.VITE_GEMINI_API_KEY ? "Loaded" : "Not Found");
  }, []);

  // Close dropdowns on outside click
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (importMenuRef.current && !importMenuRef.current.contains(e.target as Node)) {
        setImportMenuOpen(false);
      }
      if (fileMenuRef.current && !fileMenuRef.current.contains(e.target as Node)) {
        setFileMenuOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  useEffect(() => {
    localStorage.setItem(ITINERARY_TABS_KEY, JSON.stringify(itineraryTabs));
  }, [itineraryTabs]);

  useEffect(() => {
    localStorage.setItem('travel-day-column-widths', JSON.stringify(dayColumnWidths));
  }, [dayColumnWidths]);

  useEffect(() => {
    if (itineraryTabs.some(tab => tab.id === activeItineraryId)) {
      return;
    }
    const fallbackId = itineraryTabs[0]?.id || 'default';
    localStorage.setItem(ACTIVE_ITINERARY_KEY, fallbackId);
    setActiveItineraryId(fallbackId);
  }, [itineraryTabs, activeItineraryId]);

  // On mount: check for ?share=<id> and load shared trip
  useEffect(() => {
    const shareId = getShareIdFromUrl();
    if (!shareId) return;

    clearShareIdFromUrl();

    setIsLoadingShared(true);

    // Check if we already have a local itinerary for this shareId
    const existingItineraryId = getItineraryByShareId(shareId);

    loadSharedTrip(shareId)
      .then((sharedTrip) => {
        const { _itineraryTabName, ...tripData } = sharedTrip;
        const lightTrip = {
          ...tripData,
          days: tripData.days.map((day: any) => ({
            ...day,
            items: stripPhotosForStorage(day.items || []),
          })),
          unassignedItems: stripPhotosForStorage(tripData.unassignedItems || []),
        };
        const tabName = _itineraryTabName || sharedTrip.title || 'Shared Trip';

        if (existingItineraryId && itineraryTabs.some(t => t.id === existingItineraryId)) {
          // Replace existing local data with fresh content from server
          localStorage.setItem(`travel-plan-data:${existingItineraryId}`, JSON.stringify(lightTrip));
          // Update tab name in case it changed
          setItineraryTabs(prev => prev.map(t =>
            t.id === existingItineraryId ? { ...t, name: tabName } : t
          ));
          switchItinerary(existingItineraryId);
        } else {
          // Create a new itinerary tab
          const newId = uuid();
          const newTab: ItineraryTab = { id: newId, name: tabName };

          localStorage.setItem(`travel-plan-data:${newId}`, JSON.stringify(lightTrip));
          setItineraryTabs(prev => [...prev, newTab]);
          setShareId(newId, shareId);
          switchItinerary(newId);
        }
      })
      .catch((err) => {
        setLoadShareError(err.message || 'Failed to load shared trip');
      })
      .finally(() => {
        setIsLoadingShared(false);
      });
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const handleShare = async () => {
    setIsSharing(true);
    setShareError(null);
    try {
      const tabName = itineraryTabsRef.current.find(t => t.id === activeItineraryId)?.name;
      const tripToShare = tripTitleRef.current !== trip.title
        ? { ...trip, title: tripTitleRef.current }
        : trip;
      const shareId = await saveSharedTrip(tripToShare, activeItineraryId, tabName);
      const url = `${window.location.origin}${window.location.pathname}?share=${shareId}`;
      setShareUrl(url);
    } catch (err: any) {
      setShareError(err.message || 'Failed to share trip');
    } finally {
      setIsSharing(false);
    }
  };

  const switchItinerary = (itineraryId: string) => {
    localStorage.setItem(ACTIVE_ITINERARY_KEY, itineraryId);
    setActiveItineraryId(itineraryId);
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

  const deleteItinerary = (tabId: string) => {
    if (itineraryTabs.length <= 1) return;
    if (!window.confirm('Delete this itinerary? This cannot be undone.')) return;
    localStorage.removeItem(`travel-plan-data:${tabId}`);
    setItineraryTabs(prev => prev.filter(t => t.id !== tabId));
    if (activeItineraryId === tabId) {
      const remaining = itineraryTabs.filter(t => t.id !== tabId);
      switchItinerary(remaining[0].id);
    }
  };

  const handleImportTrip = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      let imported: any;
      try {
        // Strip BOM and surrounding whitespace
        const text = (reader.result as string).replace(/^\uFEFF/, '').trim();
        imported = JSON.parse(text);
      } catch (parseErr) {
        console.error('JSON parse error:', parseErr);
        alert('Could not parse trip file. Make sure it is valid JSON.');
        return;
      }

      if (!imported.title || !imported.days) {
        alert('Invalid trip file: missing "title" or "days" field.');
        return;
      }

      // Save photos to IndexedDB, then stripped trip to localStorage
      const allItems = [
        ...imported.days.flatMap((d: any) => d.items || []),
        ...(imported.unassignedItems || []),
      ];
      savePhotos(allItems)
        .catch(() => {}) // best-effort photo save
        .finally(() => {
          try {
            const lightTrip = {
              ...imported,
              days: imported.days.map((day: any) => ({
                ...day,
                items: stripPhotosForStorage(day.items || []),
              })),
              unassignedItems: stripPhotosForStorage(imported.unassignedItems || []),
            };
            const newId = uuid();
            const newTab: ItineraryTab = { id: newId, name: imported.title };
            localStorage.setItem(`travel-plan-data:${newId}`, JSON.stringify(lightTrip));
            setItineraryTabs(prev => [...prev, newTab]);
            switchItinerary(newId);
          } catch (storageErr) {
            console.error('Storage error:', storageErr);
            alert('Failed to save trip — localStorage may be full. Try clearing old itineraries first.');
          }
        });
    };
    reader.readAsText(file);
    // Reset so the same file can be re-imported
    e.target.value = '';
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

  // Compute pixelsPerHour so cards don't overlap on the time axis
  const pixelsPerHour = (() => {
    let maxNeeded = MIN_PIXELS_PER_HOUR;
    const amHours = AM_END_HOUR - START_HOUR;  // 6
    const pmHours = PM_END_HOUR - AM_END_HOUR; // 10
    for (const day of trip.days) {
      const amCount = day.items.filter(i => i.category !== 'accommodation' && i.timeSlot !== 'pm').length;
      const pmCount = day.items.filter(i => i.category !== 'accommodation' && i.timeSlot === 'pm').length;
      if (amCount > 0) maxNeeded = Math.max(maxNeeded, (amCount * MIN_CARD_HEIGHT) / amHours);
      if (pmCount > 0) maxNeeded = Math.max(maxNeeded, (pmCount * MIN_CARD_HEIGHT) / pmHours);
    }
    return Math.ceil(maxNeeded);
  })();

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
    let dropTime: string | undefined;

    // Helper: compute time from drop position within a zone
    const computeDropTime = (zone: 'am' | 'pm') => {
      const activeRect = active.rect.current.translated;
      if (!activeRect || !over.rect) return;
      const zoneStartHour = zone === 'am' ? START_HOUR : AM_END_HOUR;
      const relativeY = activeRect.top - over.rect.top;
      const dropHour = zoneStartHour + relativeY / pixelsPerHour;
      // Round to nearest 15 minutes
      const totalMin = Math.round(dropHour * 60 / 15) * 15;
      const zoneEndHour = zone === 'am' ? AM_END_HOUR : PM_END_HOUR;
      const clampedMin = Math.max(zoneStartHour * 60, Math.min(totalMin, (zoneEndHour - 1) * 60 + 45));
      let h = Math.floor(clampedMin / 60);
      const m = clampedMin % 60;
      const ampm = h >= 12 ? 'PM' : 'AM';
      if (h > 12) h -= 12;
      if (h === 0) h = 12;
      dropTime = `${h}:${m.toString().padStart(2, '0')} ${ampm}`;
    };

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
      if (zone === 'am') {
        timeSlot = 'am';
        computeDropTime('am');
      } else if (zone === 'pm') {
        timeSlot = 'pm';
        computeDropTime('pm');
      }
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

    moveItem(sourceId, destId!, activeId, newIndex, timeSlot, dropTime);
  };

  const [addItemPrefill, setAddItemPrefill] = useState<{ time?: string; timeSlot?: 'am' | 'pm'; suggestedDuration?: number } | null>(null);

  const handleAddItem = (dayId: string, prefill?: { time?: string; timeSlot?: 'am' | 'pm'; suggestedDuration?: number }) => {
    setSelectedDayId(dayId);
    setEditingItem(null);
    setAddItemPrefill(prefill || null);
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

  const handleEnrichItem = (itemId: string, data: Partial<AgendaItem>) => {
    // Persist fetched extras (photos, hours) to trip state immediately
    // so thumbnails survive modal close without requiring Save
    if (trip.unassignedItems.some(i => i.id === itemId)) {
      updateItem(PLAN_LIST_ID, itemId, data);
    } else {
      const day = trip.days.find(d => d.items.some(i => i.id === itemId));
      if (day) updateItem(day.id, itemId, data);
    }
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

  const handleImport = (items: Omit<AgendaItem, 'id'>[], sourceUrl?: string) => {
    try {
      addMultipleUnassignedItems(items);
      // Save the list URL only if multiple Google Maps items were imported (i.e. it was a list, not a single place)
      const gmItems = items.filter(i => i.sourceType === 'google_maps');
      if (sourceUrl && gmItems.length >= 2) {
        addGoogleMapsListUrl(sourceUrl);
      }
    } catch (e) {
      console.error('Import error:', e);
    }
  };

  const handleSyncGoogleMaps = async () => {
    const urls = trip.googleMapsListUrls;
    if (!urls || urls.length === 0) return;

    setSyncing(true);
    setSyncMessage(null);
    try {
      // Collect all existing place names (normalized)
      const existingNames = new Set<string>();
      const allItems = [...trip.days.flatMap(d => d.items), ...trip.unassignedItems];
      for (const item of allItems) {
        if (item.googlePlaceName) existingNames.add(item.googlePlaceName.trim().toLowerCase());
      }

      let totalNew = 0;
      for (const url of urls) {
        const newPlaces = await syncGoogleMapsList(url, existingNames);
        if (newPlaces.length > 0) {
          const newItems: Omit<AgendaItem, 'id'>[] = newPlaces.map(details => ({
            title: details.name || '',
            location: details.formatted_address || '',
            lat: details.lat,
            lng: details.lng,
            googleMapsUrl: details.url || `https://www.google.com/maps/search/${encodeURIComponent(details.name)}`,
            googlePlaceName: details.name || '',
            googlePlacePhoto: details.photoUrls?.[0] || details.photos?.[0] || '',
            imageUrl: details.photos?.[0] || '',
            category: getCategoryFromTypes(details.types || []) as Category,
            openingHours: details.openingHours,
            reservable: details.reservable,
            notes: details.comment || '',
            sourceType: 'google_maps' as const,
            sourceUrl: url,
          }));
          addMultipleUnassignedItems(newItems);
          // Add new names to the set so subsequent URLs don't re-add them
          for (const p of newPlaces) {
            existingNames.add(p.name.trim().toLowerCase());
          }
          totalNew += newPlaces.length;
        }
      }

      setSyncMessage(totalNew > 0 ? `Added ${totalNew} new place${totalNew !== 1 ? 's' : ''}` : 'No new places found');
      setTimeout(() => setSyncMessage(null), 4000);
    } catch (e: any) {
      console.error('Sync error:', e);
      setSyncMessage(`Sync failed: ${e.message || 'Unknown error'}`);
      setTimeout(() => setSyncMessage(null), 5000);
    } finally {
      setSyncing(false);
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

  const appClassName = `app${manualOverride === true ? ' mobile-mode' : manualOverride === false ? ' desktop-mode' : ''}`;

  if (isMobile) {
    return (
      <div className={appClassName}>
        <MobileView
          trip={trip}
          allMapItems={allMapItems}
          onEditItem={handleEditItem}
          onAddItem={(dayId) => handleAddItem(dayId)}
          onToggleMobile={toggleMobile}
          onImport={() => setShowImport(true)}
          onSync={handleSyncGoogleMaps}
          syncing={syncing}
          syncMessage={syncMessage}
        />
        {isModalOpen && (
          <EditModal
            item={editingItem || undefined}
            prefill={!editingItem ? addItemPrefill : null}
            onSave={handleSaveItem}
            onDelete={editingItem ? handleDeleteItem : undefined}
            onCopy={editingItem ? handleCopyItem : undefined}
            onClose={() => { setEditingItem(null); setIsModalOpen(false); setAddItemPrefill(null); }}
            onEnrichItem={handleEnrichItem}
            availableDays={trip.days.map(d => ({ id: d.id, date: d.date }))}
            showDatePicker={selectedDayId === PLAN_LIST_ID}
          />
        )}
      </div>
    );
  }

  return (
    <div className={appClassName}>
      <header className="app-header">
        <div className="header-row">
          <div className="header-left">
            <h1
              contentEditable
              suppressContentEditableWarning
              spellCheck={false}
              onBlur={(e) => {
                const text = e.currentTarget.textContent?.trim() || '';
                if (text && text !== trip.title) setTitle(text);
                else e.currentTarget.textContent = trip.title;
              }}
              onKeyDown={(e) => {
                if (e.key === 'Enter') { e.preventDefault(); e.currentTarget.blur(); }
              }}
            >{trip.title}</h1>
            <div className="itinerary-tabs">
              {itineraryTabs.map(tab => (
                <div key={tab.id} className={`itinerary-tab ${tab.id === activeItineraryId ? 'active' : ''}`}>
                  <span
                    className="itinerary-tab-label"
                    onClick={() => switchItinerary(tab.id)}
                    onDoubleClick={(e) => {
                      e.currentTarget.contentEditable = 'true';
                      e.currentTarget.focus();
                      // Select all text
                      const range = document.createRange();
                      range.selectNodeContents(e.currentTarget);
                      const sel = window.getSelection();
                      sel?.removeAllRanges();
                      sel?.addRange(range);
                    }}
                    onBlur={(e) => {
                      e.currentTarget.contentEditable = 'false';
                      const text = e.currentTarget.textContent?.trim() || '';
                      if (text && text !== tab.name) {
                        setItineraryTabs(prev => prev.map(t =>
                          t.id === tab.id ? { ...t, name: text } : t
                        ));
                      } else {
                        e.currentTarget.textContent = tab.name;
                      }
                    }}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') { e.preventDefault(); e.currentTarget.blur(); }
                    }}
                    suppressContentEditableWarning
                    spellCheck={false}
                  >
                    {tab.name}
                  </span>
                  {itineraryTabs.length > 1 && (
                    <button
                      className="itinerary-tab-delete"
                      onClick={(e) => { e.stopPropagation(); deleteItinerary(tab.id); }}
                      title="Delete itinerary"
                      aria-label="Delete itinerary"
                    >
                      ×
                    </button>
                  )}
                </div>
              ))}
              <button className="itinerary-tab add" onClick={createItinerary}>+ Itinerary</button>
            </div>
          </div>
          <div className="header-actions">
            <button
              className={`sidebar-toggle-btn ${showPlanList ? 'active' : ''}`}
              onClick={() => setShowPlanList(prev => !prev)}
              title={showPlanList ? 'Hide Plan List' : 'Show Plan List'}
            >
              <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor"><path d="M2 2h5v12H2V2zm7 0h5v12H9V2zM3 3v10h3V3H3z"/></svg>
              {showPlanList ? 'Hide List' : 'Show List'}
            </button>
            <button
              className={`sidebar-toggle-btn ${showXhsImport ? 'active' : ''}`}
              onClick={() => setShowXhsImport(prev => !prev)}
              title={showXhsImport ? 'Hide XHS Panel' : 'Show XHS Panel'}
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="3" width="18" height="18" rx="3"/><path d="M8 7l4 5-4 5M13 7l4 5-4 5"/></svg>
              {showXhsImport ? 'Hide XHS' : 'Show XHS'}
            </button>
            <div className="header-separator" />
            <div className="undo-redo-buttons">
              <button onClick={undo} disabled={!canUndo} title="Undo (Ctrl+Z)" aria-label="Undo" className="undo-btn">
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <path d="M3 7v6h6"/><path d="M21 17a9 9 0 0 0-9-9 9 9 0 0 0-6 2.3L3 13"/>
                </svg>
              </button>
              <button onClick={redo} disabled={!canRedo} title="Redo (Ctrl+Shift+Z)" aria-label="Redo" className="redo-btn">
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <path d="M21 7v6h-6"/><path d="M3 17a9 9 0 0 1 9-9 9 9 0 0 1 6 2.3L21 13"/>
                </svg>
              </button>
            </div>
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
              aria-label={geminiKey ? "Auto Plan with Gemini AI" : "Auto Plan (click to set API Key)"}
            >
              {isPlanning ? 'Planning...' : (geminiKey ? 'AI Plan' : 'Auto Plan')}
            </button>
            {planningError && <span className="planning-error">Error: {planningError}</span>}
            <button
              className="clear-plan-btn"
              onClick={() => {
                if (window.confirm('Are you sure you want to clear the plan? All items will be moved back to the list.')) {
                  clearPlan();
                }
              }}
              title="Clear all days and move items back to list"
              aria-label="Clear plan"
            >
              Clear Plan
            </button>

            {/* Import dropdown */}
            <div className="dropdown" ref={importMenuRef}>
              <button className="import-btn dropdown-trigger" onClick={() => { setImportMenuOpen(prev => !prev); setFileMenuOpen(false); }}>
                Import ▾
              </button>
              {importMenuOpen && (
                <div className="dropdown-menu">
                  <button className="dropdown-item" onClick={() => { setShowScheduleImport(true); setImportMenuOpen(false); }}>
                    <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor"><path d="M4 1h8a1 1 0 011 1v12a1 1 0 01-1 1H4a1 1 0 01-1-1V2a1 1 0 011-1zm1 3v1h6V4H5zm0 3v1h6V7H5zm0 3v1h4v-1H5z"/></svg>
                    Import Schedule
                  </button>
                  <button className="dropdown-item" onClick={() => { setShowImport(true); setImportMenuOpen(false); }}>
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none"><path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7z" fill="#EA4335"/><circle cx="12" cy="9" r="2.5" fill="white"/></svg>
                    Import Places
                  </button>
                  <button className="dropdown-item" onClick={() => { setShowXhsImport(true); setImportMenuOpen(false); }}>
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none"><rect width="24" height="24" rx="5" fill="#FF2442"/><text x="12" y="16.5" textAnchor="middle" fontSize="8" fontWeight="bold" fill="white">小红书</text></svg>
                    Import XHS
                  </button>
                </div>
              )}
            </div>

            {/* Sync button — only visible when list URLs are saved */}
            {trip.googleMapsListUrls && trip.googleMapsListUrls.length > 0 && (
              <button
                className="sync-btn"
                onClick={handleSyncGoogleMaps}
                disabled={syncing}
                title="Sync new places from imported Google Maps lists"
              >
                <svg className={syncing ? 'spin' : ''} width="14" height="14" viewBox="0 0 16 16" fill="currentColor">
                  <path d="M11.534 7h3.932a.25.25 0 0 1 .192.41l-1.966 2.36a.25.25 0 0 1-.384 0l-1.966-2.36a.25.25 0 0 1 .192-.41zm-11 2h3.932a.25.25 0 0 0 .192-.41L2.692 6.23a.25.25 0 0 0-.384 0L.342 8.59A.25.25 0 0 0 .534 9z"/>
                  <path fillRule="evenodd" d="M8 3c-1.552 0-2.94.707-3.857 1.818a.5.5 0 1 1-.771-.636A6.002 6.002 0 0 1 13.917 7H12.9A5.002 5.002 0 0 0 8 3zM3.1 9a5.002 5.002 0 0 0 8.757 2.182.5.5 0 1 1 .771.636A6.002 6.002 0 0 1 2.083 9H3.1z"/>
                </svg>
                {syncing ? 'Syncing...' : 'Sync'}
              </button>
            )}
            <span className="sync-message" aria-live="polite">{syncMessage ?? ''}</span>

            {/* File dropdown */}
            <div className="dropdown" ref={fileMenuRef}>
              <button className="export-btn dropdown-trigger" onClick={() => { setFileMenuOpen(prev => !prev); setImportMenuOpen(false); }}>
                File ▾
              </button>
              {fileMenuOpen && (
                <div className="dropdown-menu">
                  <button className="dropdown-item" onClick={() => {
                    tripFileInputRef.current?.click();
                    setFileMenuOpen(false);
                  }}>
                    <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor"><path d="M1 3.5A1.5 1.5 0 012.5 2h3.879a1.5 1.5 0 011.06.44l.622.621a.5.5 0 00.354.147H13.5A1.5 1.5 0 0115 4.708V12.5a1.5 1.5 0 01-1.5 1.5h-11A1.5 1.5 0 011 12.5v-9z"/></svg>
                    Import Trip
                  </button>
                  <button className="dropdown-item" onClick={() => {
                    const json = JSON.stringify(trip, null, 2);
                    const blob = new Blob([json], { type: 'application/json' });
                    const url = URL.createObjectURL(blob);
                    const a = document.createElement('a');
                    a.href = url;
                    const tabName = itineraryTabs.find(t => t.id === activeItineraryId)?.name || trip.title;
                    a.download = `${tabName.replace(/\s+/g, '-')}.json`;
                    a.click();
                    URL.revokeObjectURL(url);
                    setFileMenuOpen(false);
                  }}>
                    <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor"><path d="M8 1a.5.5 0 01.5.5v8.793l2.146-2.147a.5.5 0 01.708.708l-3 3a.5.5 0 01-.708 0l-3-3a.5.5 0 11.708-.708L7.5 10.293V1.5A.5.5 0 018 1zM2 13.5a.5.5 0 01.5-.5h11a.5.5 0 010 1h-11a.5.5 0 01-.5-.5z"/></svg>
                    Export Trip
                  </button>
                </div>
              )}
            </div>
            <input
              ref={tripFileInputRef}
              type="file"
              accept=".json"
              style={{ display: 'none' }}
              onChange={handleImportTrip}
            />

            <button
              className="share-btn"
              onClick={handleShare}
              disabled={isSharing}
              title="Share this trip via link"
              aria-label="Share trip"
            >
              {isSharing ? 'Sharing...' : 'Share'}
            </button>
            <button
              className="mobile-toggle-btn"
              onClick={toggleMobile}
              title="Switch to Mobile View"
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="5" y="2" width="14" height="20" rx="2"/><path d="M12 18h.01"/></svg>
              Mobile
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
          {showPlanList && (
            <PlanList
              items={trip.unassignedItems}
              highlightedItemId={highlightedItemId}
              onItemClick={handleEditItem}
              onDeleteItem={(itemId) => deleteItem(PLAN_LIST_ID, itemId)}
              onDeleteMultiple={(ids) => deleteMultipleItems(PLAN_LIST_ID, ids)}
              onUpdateItemCategory={(itemId, category) => updateItem(PLAN_LIST_ID, itemId, { category })}
            />
          )}
          <XhsPanel
            geminiKey={geminiKey}
            onClose={() => setShowXhsImport(false)}
            hidden={!showXhsImport}
          />
          <div className="day-grid">
            {trip.days.map((day, index) => (
              <DayColumn
                key={day.id}
                day={day}
                dayIndex={index}
                highlightedItemId={highlightedItemId}
                isFocused={focusedDayId === day.id}
                columnWidth={dayColumnWidths[day.id] ?? 210}
                onColumnWidthChange={(w) => setDayColumnWidths(prev => ({ ...prev, [day.id]: w }))}
                onDayClick={handleDayClick}
                onItemClick={handleEditItem}
                onAddItem={(prefill) => handleAddItem(day.id, prefill)}
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
                pixelsPerHour={pixelsPerHour}
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
          prefill={!editingItem ? addItemPrefill : null}
          onSave={handleSaveItem}
          onDelete={editingItem ? handleDeleteItem : undefined}
          onCopy={editingItem ? handleCopyItem : undefined}
          onClose={() => { setEditingItem(null); setIsModalOpen(false); setAddItemPrefill(null); }}
          onEnrichItem={handleEnrichItem}
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
      {planExplanation && (
        <div className="modal-overlay" onClick={() => setPlanExplanation(null)}>
          <div className="modal plan-explanation-modal" onClick={e => e.stopPropagation()}>
            <h2>✨ AI Plan Explanation</h2>
            <div className="plan-explanation-body">
              {planExplanation.split('\n').map((line, i) => (
                <p key={i}>{line}</p>
              ))}
            </div>
            <div className="modal-actions">
              <button className="save-btn" onClick={() => setPlanExplanation(null)}>
                Got it!
              </button>
            </div>
          </div>
        </div>
      )}
      {isLoadingShared && (
        <div className="modal-overlay">
          <div className="modal">
            <h2>Loading Shared Trip...</h2>
            <p className="modal-subtitle">Please wait while the shared trip is being loaded.</p>
          </div>
        </div>
      )}
      {loadShareError && (
        <div className="modal-overlay" onClick={() => setLoadShareError(null)}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            <h2>Failed to Load Shared Trip</h2>
            <p className="modal-error-text">{loadShareError}</p>
            <div className="modal-actions">
              <button className="save-btn" onClick={() => setLoadShareError(null)}>OK</button>
            </div>
          </div>
        </div>
      )}
      {shareUrl && (
        <div className="modal-overlay" onClick={() => setShareUrl(null)}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            <h2>Trip Shared!</h2>
            <p className="modal-subtitle">
              Anyone with this link can view your trip. The link expires in 90 days.
            </p>
            <div className="share-url-row">
              <input
                className="share-url-input"
                value={shareUrl}
                readOnly
                onClick={e => (e.target as HTMLInputElement).select()}
              />
              <button
                className="save-btn"
                onClick={() => {
                  navigator.clipboard.writeText(shareUrl);
                }}
              >
                Copy
              </button>
            </div>
            <div className="modal-actions">
              <button onClick={() => setShareUrl(null)}>Close</button>
            </div>
          </div>
        </div>
      )}
      {shareError && (
        <div className="modal-overlay" onClick={() => setShareError(null)}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            <h2>Share Failed</h2>
            <p className="modal-error-text">{shareError}</p>
            <div className="modal-actions">
              <button className="save-btn" onClick={() => setShareError(null)}>OK</button>
            </div>
          </div>
        </div>
      )}
      {isApiKeyModalOpen && (
        <div className="modal-overlay" onClick={() => setIsApiKeyModalOpen(false)}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            <h2>Set Gemini API Key</h2>
            <p className="modal-subtitle">
              To use AI-powered planning, please enter your Google Gemini API Key.
              The key is stored locally in your browser.
            </p>
            <input
              type="password"
              placeholder="Enter API Key"
              value={apiKeyInput}
              onChange={e => setApiKeyInput(e.target.value)}
              className="api-key-input"
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
            <div className="api-key-modal-footer">
              <p className="api-key-hint">
                Don't have a key? You can <a href="https://aistudio.google.com/app/apikey" target="_blank" rel="noopener noreferrer">get one here</a>.
                <br />
                Or <button className="inline-link-btn" onClick={() => { setIsApiKeyModalOpen(false); autoPlan(); }}>use basic planner instead</button>.
              </p>
            </div>
          </div>
        </div>
      )}
      {manualOverride === false && (
        <button className="mobile-float-btn" onClick={toggleMobile}>
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="5" y="2" width="14" height="20" rx="2"/><path d="M12 18h.01"/></svg>
          Mobile
        </button>
      )}
    </div>
  );
}

export default App;
