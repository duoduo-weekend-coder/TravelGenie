import { useState, useEffect } from 'react';
import { Trip, Day, AgendaItem, Category } from './types';
import { ScheduleEntry } from './utils/scheduleParser';
import { v4 as uuid } from 'uuid';
import { demoTrip } from './demoTrip';
import { migrateGooglePhotoUrls } from './googleMaps';
import { savePhotos, loadPhotos, stripPhotosForStorage } from './photoStore';

const DEFAULT_ITINERARY_ID = 'default';
const ACTIVE_ITINERARY_KEY = 'travel-active-itinerary-id';

function getActiveItineraryId(): string {
  return localStorage.getItem(ACTIVE_ITINERARY_KEY) || DEFAULT_ITINERARY_ID;
}

function getTripStorageKey(itineraryId: string): string {
  return `travel-plan-data:${itineraryId}`;
}

export const PLAN_LIST_ID = 'plan-list';

import { generateAutoPlan } from './utils/autoPlanner';
import { planTripWithGemini } from './utils/aiPlanner';

export function useTripStore() {
  const [storageKey] = useState<string>(() => getTripStorageKey(getActiveItineraryId()));

  const [trip, setTrip] = useState<Trip>(() => {
    try {
      const saved = localStorage.getItem(storageKey);
      if (saved) {
        const parsed = JSON.parse(saved);
        // Migrate old data that lacks unassignedItems
        if (!parsed.unassignedItems) parsed.unassignedItems = [];
        return parsed;
      }
    } catch (e) {
      console.warn('Failed to load trip from localStorage:', e);
    }
    return structuredClone(demoTrip);
  });

  const [geminiKey, setGeminiKey] = useState<string>(() => {
    return import.meta.env.VITE_GEMINI_API_KEY || localStorage.getItem('gemini-api-key') || '';
  });
  const [isPlanning, setIsPlanning] = useState(false);
  const [planningError, setPlanningError] = useState<string | null>(null);
  const [planExplanation, setPlanExplanation] = useState<string | null>(null);

  // Save trip to localStorage — strip base64 photos first (they go to IndexedDB).
  useEffect(() => {
    const allItems = [
      ...trip.days.flatMap(d => d.items),
      ...trip.unassignedItems,
    ];

    // Save base64 photos to IndexedDB (large capacity)
    savePhotos(allItems).catch(e => console.warn('Failed to save photos to IndexedDB:', e));

    // Save trip to localStorage WITHOUT base64 photos (small capacity)
    try {
      const lightTrip = {
        ...trip,
        days: trip.days.map(day => ({
          ...day,
          items: stripPhotosForStorage(day.items),
        })),
        unassignedItems: stripPhotosForStorage(trip.unassignedItems),
      };
      localStorage.setItem(storageKey, JSON.stringify(lightTrip));
    } catch (e) {
      console.warn('Failed to save trip to localStorage:', e);
    }
  }, [trip, storageKey]);

  // On mount: load photos from IndexedDB back into trip state.
  useEffect(() => {
    const allItems = [
      ...trip.days.flatMap(d => d.items),
      ...trip.unassignedItems,
    ];
    // Also migrate any old Google photo URLs to base64
    migrateGooglePhotoUrls(allItems)
      .then(migrated => {
        if (migrated.length > 0) {
          const updateMap = new Map(migrated.map(m => [m.id, m]));
          setTrip(prev => ({
            ...prev,
            days: prev.days.map(day => ({
              ...day,
              items: day.items.map(item => {
                const u = updateMap.get(item.id);
                return u ? { ...item, ...u } : item;
              })
            })),
            unassignedItems: prev.unassignedItems.map(item => {
              const u = updateMap.get(item.id);
              return u ? { ...item, ...u } : item;
            })
          }));
        }
      })
      .catch(e => console.warn('Photo migration failed (non-fatal):', e));

    // Load photos from IndexedDB and merge into trip state
    loadPhotos(allItems)
      .then(() => {
        const photoMap = new Map(
          allItems
            .filter(i => i.imageUrl || i.googlePlacePhoto)
            .map(i => [i.id, { imageUrl: i.imageUrl, googlePlacePhoto: i.googlePlacePhoto }])
        );
        if (photoMap.size === 0) return;
        setTrip(prev => ({
          ...prev,
          days: prev.days.map(day => ({
            ...day,
            items: day.items.map(item => {
              const p = photoMap.get(item.id);
              return p ? { ...item, ...p } : item;
            })
          })),
          unassignedItems: prev.unassignedItems.map(item => {
            const p = photoMap.get(item.id);
            return p ? { ...item, ...p } : item;
          })
        }));
      })
      .catch(e => console.warn('Failed to load photos from IndexedDB:', e));
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (geminiKey) localStorage.setItem('gemini-api-key', geminiKey);
  }, [geminiKey]);

  const autoPlan = async () => {
    setIsPlanning(true);
    setPlanningError(null);
    setPlanExplanation(null);
    try {
      if (geminiKey) {
        console.log("Starting AI planning with key length:", geminiKey.length);
        const result = await planTripWithGemini(geminiKey, trip);
        setTrip(result.trip);
        if (result.explanation) {
          setPlanExplanation(result.explanation);
        }
      } else {
        console.log("Using basic heuristic planner");
        setTrip(prev => generateAutoPlan(prev));
      }
    } catch (e: any) {
      console.error("Auto Plan Error:", e);
      setPlanningError(e.message || "Planning failed");
    } finally {
      setIsPlanning(false);
    }
  };

  const setStartDate = (newStartDate: string) => {
    setTrip(prev => ({
      ...prev,
      startDate: newStartDate,
      days: prev.days.map((day, index) => {
        const d = new Date(newStartDate);
        d.setDate(d.getDate() + index);
        return { ...day, date: d.toISOString().split('T')[0] };
      })
    }));
  };

  const addDay = () => {
    setTrip(prev => {
      const newIndex = prev.days.length;
      const d = new Date(prev.startDate);
      d.setDate(d.getDate() + newIndex);
      const newDay: Day = {
        id: uuid(),
        date: d.toISOString().split('T')[0],
        items: []
      };
      return { ...prev, days: [...prev.days, newDay] };
    });
  };

  const addItem = (dayId: string, item: Omit<AgendaItem, 'id'>) => {
    const newItem: AgendaItem = { ...item, id: uuid() };
    setTrip({
      ...trip,
      days: trip.days.map(day =>
        day.id === dayId
          ? { ...day, items: [...day.items, newItem] }
          : day
      )
    });
  };

  const addUnassignedItem = (item: Omit<AgendaItem, 'id'>) => {
    const newItem: AgendaItem = { ...item, id: uuid() };
    setTrip(prev => ({
      ...prev,
      unassignedItems: [...prev.unassignedItems, newItem]
    }));
  };

  const addMultipleUnassignedItems = (items: Omit<AgendaItem, 'id'>[]) => {
    const newItems = items.map(item => ({ ...item, id: uuid() } as AgendaItem));
    setTrip(prev => ({
      ...prev,
      unassignedItems: [...prev.unassignedItems, ...newItems]
    }));
  };

  const removeUnassignedItem = (itemId: string) => {
    setTrip(prev => ({
      ...prev,
      unassignedItems: prev.unassignedItems.filter(i => i.id !== itemId)
    }));
  };

  const updateItem = (dayId: string, itemId: string, updates: Partial<AgendaItem>) => {
    if (dayId === PLAN_LIST_ID) {
      setTrip(prev => ({
        ...prev,
        unassignedItems: prev.unassignedItems.map(item =>
          item.id === itemId ? { ...item, ...updates } : item
        )
      }));
    } else {
      setTrip({
        ...trip,
        days: trip.days.map(day =>
          day.id === dayId
            ? {
                ...day,
                items: day.items.map(item =>
                  item.id === itemId ? { ...item, ...updates } : item
                )
              }
            : day
        )
      });
    }
  };

  const deleteItem = (dayId: string, itemId: string) => {
    if (dayId === PLAN_LIST_ID) {
      removeUnassignedItem(itemId);
    } else {
      setTrip({
        ...trip,
        days: trip.days.map(day =>
          day.id === dayId
            ? { ...day, items: day.items.filter(item => item.id !== itemId) }
            : day
        )
      });
    }
  };

  const deleteMultipleItems = (dayId: string, itemIds: string[]) => {
    const idSet = new Set(itemIds);
    if (dayId === PLAN_LIST_ID) {
      setTrip(prev => ({
        ...prev,
        unassignedItems: prev.unassignedItems.filter(i => !idSet.has(i.id))
      }));
    } else {
      setTrip(prev => ({
        ...prev,
        days: prev.days.map(day =>
          day.id === dayId
            ? { ...day, items: day.items.filter(item => !idSet.has(item.id)) }
            : day
        )
      }));
    }
  };

  const moveItem = (
    sourceId: string,
    destId: string,
    itemId: string,
    newIndex: number,
    timeSlot?: 'am' | 'pm'
  ) => {
    setTrip(prev => {
      // Find the item from source
      let item: AgendaItem | undefined;
      if (sourceId === PLAN_LIST_ID) {
        item = prev.unassignedItems.find(i => i.id === itemId);
      } else {
        const sourceDay = prev.days.find(d => d.id === sourceId);
        item = sourceDay?.items.find(i => i.id === itemId);
      }
      if (!item) return prev;

      // Apply timeSlot if provided
      const movedItem = timeSlot !== undefined ? { ...item, timeSlot } : item;

      // Remove from source
      let newUnassigned = prev.unassignedItems;
      let newDays = prev.days;

      if (sourceId === PLAN_LIST_ID) {
        newUnassigned = newUnassigned.filter(i => i.id !== itemId);
      } else {
        newDays = newDays.map(day =>
          day.id === sourceId
            ? { ...day, items: day.items.filter(i => i.id !== itemId) }
            : day
        );
      }

      // Add to destination
      if (destId === PLAN_LIST_ID) {
        // Remove timeSlot when going back to plan list
        const { timeSlot: _, ...itemWithoutSlot } = movedItem;
        newUnassigned = [...newUnassigned, itemWithoutSlot];
      } else {
        newDays = newDays.map(day => {
          if (day.id === destId) {
            const newItems = [...day.items];
            newItems.splice(newIndex, 0, movedItem);
            return { ...day, items: newItems };
          }
          return day;
        });
      }

      return { ...prev, days: newDays, unassignedItems: newUnassigned };
    });
  };

  const pasteDayItems = (targetDayId: string, items: AgendaItem[]) => {
    setTrip(prev => ({
      ...prev,
      days: prev.days.map(day => {
        if (day.id !== targetDayId) return day;
        const copied = items.map(item => ({ ...item, id: uuid() }));
        return { ...day, items: [...day.items, ...copied] };
      })
    }));
  };

  const clearDay = (dayId: string) => {
    setTrip(prev => {
      const day = prev.days.find(d => d.id === dayId);
      if (!day) return prev;
      if (day.items.length === 0 && (!day.blockedPeriods || day.blockedPeriods.length === 0)) return prev;

      // Identify items to move back
      const itemsToMove = day.items.map(item => {
        // Remove timeSlot and day-specific fields when moving back
        const { timeSlot, ...rest } = item;
        return rest;
      });

      // De-duplicate against existing unassigned items
      // We check for items with same Google Maps URL or same title+location
      const existingUnassigned = prev.unassignedItems;
      const uniqueItemsToMove = itemsToMove.filter(newItem => {
        const isDuplicate = existingUnassigned.some(existing => {
          if (newItem.googleMapsUrl && existing.googleMapsUrl) {
            return newItem.googleMapsUrl === existing.googleMapsUrl;
          }
          return newItem.title === existing.title && newItem.location === existing.location;
        });
        return !isDuplicate;
      });

      return {
        ...prev,
        days: prev.days.map(d => d.id === dayId ? { ...d, items: [], blockedPeriods: [] } : d),
        unassignedItems: [...prev.unassignedItems, ...uniqueItemsToMove]
      };
    });
  };

  const clearPlan = () => {
    setTrip(prev => {
      // Gather all items from all days
      const allItems = prev.days.flatMap(d => d.items.map(item => {
        const { timeSlot, ...rest } = item;
        return rest;
      }));

      const hasBlocked = prev.days.some(d => d.blockedPeriods && d.blockedPeriods.length > 0);
      if (allItems.length === 0 && !hasBlocked) return prev;

      // De-duplicate against existing unassigned items AND within the moved items themselves
      const existingUnassigned = prev.unassignedItems;
      const combined = [...existingUnassigned];

      allItems.forEach(newItem => {
        const isDuplicate = combined.some(existing => {
           if (newItem.googleMapsUrl && existing.googleMapsUrl) {
            return newItem.googleMapsUrl === existing.googleMapsUrl;
          }
          return newItem.title === existing.title && newItem.location === existing.location;
        });

        if (!isDuplicate) {
          combined.push(newItem);
        }
      });

      return {
        ...prev,
        days: prev.days.map(d => ({ ...d, items: [], blockedPeriods: [] })),
        unassignedItems: combined
      };
    });
  };

  const setDayLocation = (dayId: string, type: 'start' | 'end', item: Omit<AgendaItem, 'id'> | null) => {
    setTrip(prev => ({
      ...prev,
      days: prev.days.map(d => {
        if (d.id !== dayId) return d;
        const newItem = item ? { ...item, id: uuid(), category: 'other' as const } : undefined;
        if (type === 'start') return { ...d, startLocation: newItem };
        return { ...d, endLocation: newItem };
      })
    }));
  };

  const addBlockedPeriod = (dayId: string, start: string, end: string) => {
    setTrip(prev => ({
      ...prev,
      days: prev.days.map(day => {
        if (day.id !== dayId) return day;
        const blocked = day.blockedPeriods || [];
        return { ...day, blockedPeriods: [...blocked, { start, end }] };
      })
    }));
  };

  const removeBlockedPeriod = (dayId: string, index: number) => {
    setTrip(prev => ({
      ...prev,
      days: prev.days.map(day => {
        if (day.id !== dayId) return day;
        const blocked = day.blockedPeriods || [];
        return { ...day, blockedPeriods: blocked.filter((_, i) => i !== index) };
      })
    }));
  };

  const deleteDay = (dayId: string) => {
    setTrip(prev => {
      const dayToDelete = prev.days.find(d => d.id === dayId);
      if (!dayToDelete) return prev;

      // Rescue items logic (inline)
      const itemsToRescue: AgendaItem[] = [];
      dayToDelete.items.forEach(item => {
        const { timeSlot, ...rest } = item;
        itemsToRescue.push(rest as AgendaItem);
      });
      if (dayToDelete.startLocation) itemsToRescue.push({ ...dayToDelete.startLocation, category: 'other' } as AgendaItem);
      if (dayToDelete.endLocation) itemsToRescue.push({ ...dayToDelete.endLocation, category: 'other' } as AgendaItem);

      const existingUnassigned = prev.unassignedItems;
      const uniqueRescued = itemsToRescue.filter(newItem => {
        return !existingUnassigned.some(existing => 
            (newItem.googleMapsUrl && existing.googleMapsUrl === newItem.googleMapsUrl) ||
            (newItem.title === existing.title && newItem.location === existing.location)
        );
      });

      return {
        ...prev,
        days: prev.days.filter(d => d.id !== dayId),
        unassignedItems: [...prev.unassignedItems, ...uniqueRescued]
      };
    });
  };

  const updateDayDate = (dayId: string, newDate: string) => {
    setTrip(prev => {
      const newDays = prev.days.map(d => 
        d.id === dayId ? { ...d, date: newDate } : d
      );
      // Sort by date to keep timeline logical
      newDays.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
      
      const newStartDate = newDays.length > 0 ? newDays[0].date : prev.startDate;

      return { ...prev, days: newDays, startDate: newStartDate };
    });
  };

  const setTripRange = (start: string, end: string) => {
    const s = new Date(start);
    const e = new Date(end);
    if (isNaN(s.getTime()) || isNaN(e.getTime())) return;
    if (e < s) return; // invalid range

    const diffTime = Math.abs(e.getTime() - s.getTime());
    const targetDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24)) + 1;

    setTrip(prev => {
      let currentDays = [...prev.days];
      const rescuedItems: AgendaItem[] = [];

      // If we are shrinking
      if (targetDays < currentDays.length) {
        const removedDays = currentDays.splice(targetDays);
        removedDays.forEach(d => {
           d.items.forEach(i => { const { timeSlot, ...rest } = i; rescuedItems.push(rest as AgendaItem); });
           if (d.startLocation) rescuedItems.push({ ...d.startLocation, category: 'other' } as AgendaItem);
           if (d.endLocation) rescuedItems.push({ ...d.endLocation, category: 'other' } as AgendaItem);
        });
      } 
      // If we are growing
      else if (targetDays > currentDays.length) {
        const needed = targetDays - currentDays.length;
        for(let i=0; i<needed; i++) {
           currentDays.push({ id: uuid(), date: '', items: [] });
        }
      }

      // Re-date everything sequentially from start
      currentDays = currentDays.map((d, idx) => {
        const dObj = new Date(start);
        dObj.setDate(dObj.getDate() + idx);
        return { ...d, date: dObj.toISOString().split('T')[0] };
      });

      // Dedupe rescued
      const existingUnassigned = prev.unassignedItems;
      const uniqueRescued = rescuedItems.filter(newItem => {
        return !existingUnassigned.some(existing => 
            (newItem.googleMapsUrl && existing.googleMapsUrl === newItem.googleMapsUrl) ||
            (newItem.title === existing.title && newItem.location === existing.location)
        );
      });

      return {
        ...prev,
        startDate: start,
        days: currentDays,
        unassignedItems: [...prev.unassignedItems, ...uniqueRescued]
      };
    });
  };

  const importSchedule = (entries: ScheduleEntry[]) => {
    setTrip(prev => {
      const newDays = prev.days.map(day => {
        const entry = entries.find(e => e.dateStr === day.date);
        if (!entry) return day;

        const newItems: AgendaItem[] = entry.activities.map(activity => {
          const startHour = parseInt(activity.startTime.split(':')[0], 10);
          const timeSlot: 'am' | 'pm' = startHour < 12 ? 'am' : 'pm';

          const [sh, sm] = activity.startTime.split(':').map(Number);
          const [eh, em] = activity.endTime.split(':').map(Number);
          const suggestedDuration = (eh * 60 + em) - (sh * 60 + sm);

          return {
            id: uuid(),
            title: activity.name,
            time: `${activity.startTime} - ${activity.endTime}`,
            location: '',
            category: 'activity' as Category,
            timeSlot,
            suggestedDuration: suggestedDuration > 0 ? suggestedDuration : undefined,
            sourceType: 'manual' as const
          };
        });

        const newBlocked = entry.activities.map(a => ({
          start: a.startTime,
          end: a.endTime
        }));

        return {
          ...day,
          items: [...day.items, ...newItems],
          blockedPeriods: [...(day.blockedPeriods || []), ...newBlocked]
        };
      });

      return { ...prev, days: newDays };
    });
  };

  return {
    trip,
    setStartDate,
    addDay,
    addItem,
    addUnassignedItem,
    addMultipleUnassignedItems,
    removeUnassignedItem,
    updateItem,
    deleteItem,
    deleteMultipleItems,
    moveItem,
    pasteDayItems,
    autoPlan,
    isPlanning,
    planningError,
    planExplanation,
    setPlanExplanation,
    clearDay,
    clearPlan,
    setDayLocation,
    geminiKey,
    setGeminiKey,
    addBlockedPeriod,
    removeBlockedPeriod,
    deleteDay,
    updateDayDate,
    setTripRange,
    importSchedule
  };
}

// ... existing helper implementations ...

// Remove these standalone functions since we moved them inside the hook or delete them if unused
// function addBlockedPeriod(trip: Trip, dayId: string, start: string, end: string): Trip { ... }
// function removeBlockedPeriod(trip: Trip, dayId: string, index: number): Trip { ... }

// ... helper to add setDayLocation to the store ...
