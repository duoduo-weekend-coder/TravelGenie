# Travel Plan Timeline App Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** A drag-and-drop travel planning app with vertical time axis and synchronized map view.

**Architecture:** React + Vite app with left timeline panel (react-beautiful-dnd) and right map panel (Leaflet). LocalStorage for persistence. Google Maps URL parsing for previews.

**Tech Stack:** React 18, TypeScript, Vite, @dnd-kit/core, @dnd-kit/sortable, react-leaflet, localStorage

---

## Task 1: Scaffold Project

**Files:**
- Create: `package.json`
- Create: `vite.config.ts`
- Create: `tsconfig.json`
- Create: `index.html`
- Create: `src/main.tsx`
- Create: `src/App.tsx`
- Create: `src/index.css`

**Step 1: Create package.json**

```json
{
  "name": "travel-plan-timeline",
  "private": true,
  "version": "0.0.0",
  "type": "module",
  "scripts": {
    "dev": "vite",
    "build": "tsc && vite build",
    "preview": "vite preview"
  },
  "dependencies": {
    "@dnd-kit/core": "^6.1.0",
    "@dnd-kit/sortable": "^8.0.0",
    "@dnd-kit/utilities": "^3.2.2",
    "leaflet": "^1.9.4",
    "react": "^18.2.0",
    "react-dom": "^18.2.0",
    "react-leaflet": "^4.2.1",
    "uuid": "^9.0.0"
  },
  "devDependencies": {
    "@types/leaflet": "^1.9.8",
    "@types/react": "^18.2.43",
    "@types/react-dom": "^18.2.17",
    "@types/uuid": "^9.0.7",
    "@vitejs/plugin-react": "^4.2.1",
    "typescript": "^5.3.3",
    "vite": "^5.0.8"
  }
}
```

**Step 2: Create vite.config.ts**

```typescript
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
})
```

**Step 3: Create tsconfig.json**

```json
{
  "compilerOptions": {
    "target": "ES2020",
    "useDefineForClassFields": true,
    "lib": ["ES2020", "DOM", "DOM.Iterable"],
    "module": "ESNext",
    "skipLibCheck": true,
    "moduleResolution": "bundler",
    "allowImportingTsExtensions": true,
    "resolveJsonModule": true,
    "isolatedModules": true,
    "noEmit": true,
    "jsx": "react-jsx",
    "strict": true,
    "noUnusedLocals": true,
    "noUnusedParameters": true,
    "noFallthroughCasesInSwitch": true
  },
  "include": ["src"],
  "references": [{ "path": "./tsconfig.node.json" }]
}
```

**Step 4: Create tsconfig.node.json**

```json
{
  "compilerOptions": {
    "composite": true,
    "skipLibCheck": true,
    "module": "ESNext",
    "moduleResolution": "bundler",
    "allowSyntheticDefaultImports": true
  },
  "include": ["vite.config.ts"]
}
```

**Step 5: Create index.html**

```html
<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <link rel="icon" type="image/svg+xml" href="/vite.svg" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>Travel Plan Timeline</title>
    <link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css" />
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/src/main.tsx"></script>
  </body>
</html>
```

**Step 6: Create src/main.tsx**

```typescript
import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'
import './index.css'

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
)
```

**Step 7: Create src/App.tsx**

```typescript
function App() {
  return <div>Travel Plan App</div>
}

export default App
```

**Step 8: Create src/index.css**

```css
* {
  margin: 0;
  padding: 0;
  box-sizing: border-box;
}

body {
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
}

#root {
  height: 100vh;
}
```

**Step 9: Install dependencies**

Run: `npm install`
Expected: Install completes

**Step 10: Verify build**

Run: `npm run dev`
Expected: Dev server starts

---

## Task 2: Create Types and Store

**Files:**
- Create: `src/types.ts`
- Create: `src/store.ts`

**Step 1: Create src/types.ts**

```typescript
export type Category = 'transport' | 'food' | 'activity' | 'accommodation' | 'other';

export interface AgendaItem {
  id: string;
  title: string;
  time?: string;
  location?: string;
  googleMapsUrl?: string;
  googlePlaceName?: string;
  googlePlacePhoto?: string;
  notes?: string;
  imageUrl?: string;
  category: Category;
}

export interface Day {
  id: string;
  date: string;
  items: AgendaItem[];
}

export interface Trip {
  id: string;
  title: string;
  startDate: string;
  days: Day[];
}
```

**Step 2: Create src/store.ts**

```typescript
import { useState, useEffect } from 'react';
import { Trip, Day, AgendaItem } from './types';
import { v4 as uuid } from 'uuid';

const STORAGE_KEY = 'travel-plan-data';

const defaultTrip: Trip = {
  id: uuid(),
  title: 'My Trip',
  startDate: new Date().toISOString().split('T')[0],
  days: [
    { id: uuid(), date: new Date().toISOString().split('T')[0], items: [] }
  ]
};

export function useTripStore() {
  const [trip, setTrip] = useState<Trip>(() => {
    const saved = localStorage.getItem(STORAGE_KEY);
    return saved ? JSON.parse(saved) : defaultTrip;
  });

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(trip));
  }, [trip]);

  const addDay = () => {
    const lastDay = trip.days[trip.days.length - 1];
    const lastDate = lastDay ? new Date(lastDay.date) : new Date();
    const newDate = new Date(lastDate);
    newDate.setDate(newDate.getDate() + 1);
    
    const newDay: Day = {
      id: uuid(),
      date: newDate.toISOString().split('T')[0],
      items: []
    };
    setTrip({ ...trip, days: [...trip.days, newDay] });
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

  const updateItem = (dayId: string, itemId: string, updates: Partial<AgendaItem>) => {
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
  };

  const deleteItem = (dayId: string, itemId: string) => {
    setTrip({
      ...trip,
      days: trip.days.map(day =>
        day.id === dayId
          ? { ...day, items: day.items.filter(item => item.id !== itemId) }
          : day
      )
    });
  };

  const moveItem = (
    sourceDayId: string,
    destDayId: string,
    itemId: string,
    newIndex: number
  ) => {
    setTrip(prev => {
      const sourceDay = prev.days.find(d => d.id === sourceDayId);
      const item = sourceDay?.items.find(i => i.id === itemId);
      if (!item) return prev;

      const newDays = prev.days.map(day => {
        if (day.id === sourceDayId) {
          return { ...day, items: day.items.filter(i => i.id !== itemId) };
        }
        if (day.id === destDayId) {
          const newItems = [...day.items];
          newItems.splice(newIndex, 0, item);
          return { ...day, items: newItems };
        }
        return day;
      });

      return { ...prev, days: newDays };
    });
  };

  return { trip, addDay, addItem, updateItem, deleteItem, moveItem };
}
```

---

## Task 3: Build Agenda Card Component

**Files:**
- Create: `src/components/AgendaCard.tsx`

**Step 1: Create src/components/AgendaCard.tsx**

```typescript
import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { AgendaItem } from '../types';

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
}

export function AgendaCard({ item, onClick, isHighlighted }: Props) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging
  } = useSortable({ id: item.id });

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
      {...attributes}
      {...listeners}
      onClick={onClick}
      className={`agenda-card ${isHighlighted ? 'highlighted' : ''}`}
    >
      {item.time && <span className="time-badge">{item.time}</span>}
      <div className="card-content">
        <h4>{item.title}</h4>
        {item.location && <p className="location">📍 {item.location}</p>}
        {item.imageUrl && (
          <img src={item.imageUrl} alt="" className="thumbnail" />
        )}
      </div>
    </div>
  );
}
```

**Step 2: Add styles to src/index.css**

```css
.agenda-card {
  background: white;
  border-radius: 8px;
  padding: 12px;
  margin-bottom: 8px;
  border-left: 4px solid #ccc;
  cursor: grab;
  display: flex;
  gap: 10px;
  box-shadow: 0 1px 3px rgba(0,0,0,0.1);
  transition: box-shadow 0.2s;
}

.agenda-card:hover {
  box-shadow: 0 3px 8px rgba(0,0,0,0.15);
}

.agenda-card.highlighted {
  box-shadow: 0 0 0 2px #3B82F6, 0 3px 8px rgba(59, 130, 246, 0.3);
}

.time-badge {
  background: #f3f4f6;
  padding: 4px 8px;
  border-radius: 4px;
  font-size: 12px;
  font-weight: 500;
  white-space: nowrap;
}

.card-content h4 {
  margin: 0 0 4px 0;
  font-size: 14px;
}

.card-content .location {
  font-size: 12px;
  color: #666;
  margin: 0;
}

.thumbnail {
  width: 60px;
  height: 60px;
  object-fit: cover;
  border-radius: 4px;
  margin-top: 8px;
}
```

---

## Task 4: Build Day Section Component

**Files:**
- Create: `src/components/DaySection.tsx`

**Step 1: Create src/components/DaySection.tsx**

```typescript
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
```

**Step 2: Add styles**

```css
.day-section {
  margin-bottom: 24px;
}

.day-section.drop-target {
  background: rgba(59, 130, 246, 0.05);
  border-radius: 8px;
}

.day-header h3 {
  font-size: 16px;
  font-weight: 600;
  color: #374151;
  margin-bottom: 12px;
  padding-bottom: 8px;
  border-bottom: 2px solid #e5e7eb;
}

.add-item-btn {
  width: 100%;
  padding: 10px;
  border: 2px dashed #d1d5db;
  border-radius: 8px;
  background: transparent;
  color: #6b7280;
  cursor: pointer;
  font-size: 14px;
  transition: all 0.2s;
}

.add-item-btn:hover {
  border-color: #3b82f6;
  color: #3b82f6;
  background: rgba(59, 130, 246, 0.05);
}
```

---

## Task 5: Build Edit Modal

**Files:**
- Create: `src/components/EditModal.tsx`

**Step 1: Create src/components/EditModal.tsx**

```typescript
import { useState, useEffect, useRef } from 'react';
import { AgendaItem, Category } from '../types';

interface Props {
  item?: AgendaItem;
  onSave: (item: Omit<AgendaItem, 'id'> | AgendaItem) => void;
  onDelete?: () => void;
  onClose: () => void;
}

const categories: Category[] = ['transport', 'food', 'activity', 'accommodation', 'other'];

export function EditModal({ item, onSave, onDelete, onClose }: Props) {
  const [title, setTitle] = useState(item?.title || '');
  const [time, setTime] = useState(item?.time || '');
  const [location, setLocation] = useState(item?.location || '');
  const [googleMapsUrl, setGoogleMapsUrl] = useState(item?.googleMapsUrl || '');
  const [notes, setNotes] = useState(item?.notes || '');
  const [category, setCategory] = useState<Category>(item?.category || 'activity');
  const [imageUrl, setImageUrl] = useState(item?.imageUrl || '');
  const fileRef = useRef<HTMLInputElement>(null);

  const handleGoogleUrlBlur = async () => {
    if (googleMapsUrl && googleMapsUrl.includes('google.com/maps')) {
      // Extract place info - simplified: just store URL for now
      // In production, use Places API or embed iframe parsing
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onload = () => setImageUrl(reader.result as string);
      reader.readAsDataURL(file);
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const data = { title, time, location, googleMapsUrl, notes, category, imageUrl };
    if (item) {
      onSave({ ...data, id: item.id });
    } else {
      onSave(data);
    }
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={e => e.stopPropagation()}>
        <h2>{item ? 'Edit Item' : 'Add Item'}</h2>
        <form onSubmit={handleSubmit}>
          <input
            type="text"
            placeholder="Title *"
            value={title}
            onChange={e => setTitle(e.target.value)}
            required
          />
          <input
            type="text"
            placeholder="Time (e.g., 9:00 AM)"
            value={time}
            onChange={e => setTime(e.target.value)}
          />
          <input
            type="text"
            placeholder="Location"
            value={location}
            onChange={e => setLocation(e.target.value)}
          />
          <input
            type="url"
            placeholder="Google Maps URL"
            value={googleMapsUrl}
            onChange={e => setGoogleMapsUrl(e.target.value)}
            onBlur={handleGoogleUrlBlur}
          />
          <textarea
            placeholder="Notes"
            value={notes}
            onChange={e => setNotes(e.target.value)}
            rows={3}
          />
          <select value={category} onChange={e => setCategory(e.target.value as Category)}>
            {categories.map(cat => (
              <option key={cat} value={cat}>{cat}</option>
            ))}
          </select>
          <div className="image-section">
            {imageUrl ? (
              <img src={imageUrl} alt="Preview" className="image-preview" />
            ) : null}
            <input
              type="file"
              ref={fileRef}
              onChange={handleFileChange}
              accept="image/*"
              style={{ display: 'none' }}
            />
            <button type="button" onClick={() => fileRef.current?.click()}>
              {imageUrl ? 'Change Image' : 'Add Image'}
            </button>
            {imageUrl && (
              <button type="button" onClick={() => setImageUrl('')} className="remove-img">
                Remove
              </button>
            )}
          </div>
          <div className="modal-actions">
            {item && onDelete && (
              <button type="button" className="delete-btn" onClick={onDelete}>
                Delete
              </button>
            )}
            <button type="button" onClick={onClose}>Cancel</button>
            <button type="submit" className="save-btn">Save</button>
          </div>
        </form>
      </div>
    </div>
  );
}
```

**Step 2: Add modal styles**

```css
.modal-overlay {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.5);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 1000;
}

.modal {
  background: white;
  border-radius: 12px;
  padding: 24px;
  width: 90%;
  max-width: 500px;
  max-height: 90vh;
  overflow-y: auto;
}

.modal h2 {
  margin-bottom: 20px;
}

.modal form {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.modal input, .modal textarea, .modal select {
  padding: 10px 12px;
  border: 1px solid #d1d5db;
  border-radius: 6px;
  font-size: 14px;
}

.modal input:focus, .modal textarea:focus, .modal select:focus {
  outline: none;
  border-color: #3b82f6;
}

.image-section {
  display: flex;
  align-items: center;
  gap: 10px;
  flex-wrap: wrap;
}

.image-preview {
  width: 80px;
  height: 80px;
  object-fit: cover;
  border-radius: 6px;
}

.modal-actions {
  display: flex;
  gap: 10px;
  justify-content: flex-end;
  margin-top: 10px;
}

.modal-actions button {
  padding: 10px 16px;
  border-radius: 6px;
  border: none;
  cursor: pointer;
  font-size: 14px;
}

.modal-actions .delete-btn {
  background: #ef4444;
  color: white;
  margin-right: auto;
}

.modal-actions button:not(.delete-btn):not(.save-btn) {
  background: #e5e7eb;
}

.modal-actions .save-btn {
  background: #3b82f6;
  color: white;
}
```

---

## Task 6: Build Map Component

**Files:**
- Create: `src/components/MapPanel.tsx`

**Step 1: Create src/components/MapPanel.tsx**

```typescript
import { useEffect, useRef } from 'react';
import L from 'leaflet';
import { AgendaItem } from '../types';

interface Props {
  items: AgendaItem[];
  highlightedItemId?: string;
}

const categoryColors: Record<string, string> = {
  transport: '#3B82F6',
  food: '#F97316',
  activity: '#22C55E',
  accommodation: '#A855F7',
  other: '#6B7280'
};

export function MapPanel({ items, highlightedItemId }: PropsProps) {
  const mapRef = useRef<L.Map | null>(null);
  const markersRef = useRef<L.Marker[]>([]);

  useEffect(() => {
    if (!mapRef.current) {
      mapRef.current = L.map('map').setView([40.7128, -74.006], 12);
      L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '© OpenStreetMap'
      }).addTo(mapRef.current);
    }
  }, []);

  useEffect(() => {
    // Clear existing markers
    markersRef.current.forEach(m => m.remove());
    markersRef.current = [];

    // Add markers for items with locations
    items.forEach(item => {
      if (item.location) {
        const marker = L.marker([40.7128, -74.006] as L.LatLngExpression, {
          // In production: geocode the location
          // For demo: all markers at same place with custom popup
        });
        
        marker.bindPopup(`
          <strong>${item.title}</strong><br/>
          ${item.location}<br/>
          ${item.googlePlaceName || ''}
        `);
        
        if (item.id === highlightedItemId) {
          marker.setOpacity(1);
          marker.openPopup();
        } else {
          marker.setOpacity(0.7);
        }
        
        marker.addTo(mapRef.current!);
        markersRef.current.push(marker);
      }
    });

    // Fit bounds if items exist
    if (markersRef.current.length > 0) {
      const group = L.featureGroup(markersRef.current);
      mapRef.current.fitBounds(group.getBounds().pad(0.1));
    }
  }, [items, highlightedItemId]);

  return <div id="map" style={{ height: '100%', width: '100%' }} />;
}
```

**Step 2: Add map styles**

```css
.map-panel {
  height: 100%;
  background: #f3f4f6;
}

#map {
  height: 100%;
  width: 100%;
}

.leaflet-popup-content-wrapper {
  border-radius: 8px;
}
```

---

## Task 7: Build Main App Layout

**Files:**
- Modify: `src/App.tsx`

**Step 1: Create src/App.tsx**

```typescript
import { useState, useCallback } from 'react';
import {
  DndContext,
  DragEndEvent,
  DragOverEvent,
  DragStartEvent,
  closestCenter,
  PointerSensor,
  useSensor,
  useSensors
} from '@dnd-kit/core';
import { Trip, AgendaItem } from './types';
import { useTripStore } from './store';
import { DaySection } from './components/DaySection';
import { EditModal } from './components/EditModal';
import { MapPanel } from './components/MapPanel';

function App() {
  const { trip, addDay, addItem, updateItem, deleteItem, moveItem } = useTripStore();
  const [selectedDayId, setSelectedDayId] = useState<string | null>(null);
  const [editingItem, setEditingItem] = useState<AgendaItem | null>(null);
  const [highlightedItemId, setHighlightedItemId] = useState<string | undefined>();
  const [modalMode, setModalMode] = useState<'add' | 'edit'>('add');

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } })
  );

  const allItems = trip.days.flatMap(d => d.items);

  const handleDragStart = (event: DragStartEvent) => {
    setHighlightedItemId(event.active.id as string);
  };

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    setHighlightedItemId(undefined);

    if (!over) return;

    const activeId = active.id as string;
    const overId = over.id as string;

    // Find source day
    const sourceDay = trip.days.find(d => d.items.some(i => i.id === activeId));
    if (!sourceDay) return;

    // Determine destination
    let destDayId = overId;
    let newIndex = 0;

    // If dropped on another item, find its day and index
    const overDay = trip.days.find(d => d.items.some(i => i.id === overId));
    if (overDay) {
      destDayId = overDay.id;
      newIndex = overDay.items.findIndex(i => i.id === overId);
    } else {
      // Dropped on day container
      const targetDay = trip.days.find(d => d.id === overId);
      if (targetDay) {
        newIndex = targetDay.items.length;
      }
    }

    if (sourceDay.id !== destDayId) {
      moveItem(sourceDay.id, destDayId, activeId, newIndex);
    }
  };

  const handleAddItem = (dayId: string) => {
    setSelectedDayId(dayId);
    setEditingItem(null);
    setModalMode('add');
  };

  const handleEditItem = (item: AgendaItem) => {
    const day = trip.days.find(d => d.items.some(i => i.id === item.id));
    setSelectedDayId(day?.id || null);
    setEditingItem(item);
    setModalMode('edit');
  };

  const handleSaveItem = (item: Omit<AgendaItem, 'id'> | AgendaItem) => {
    if ('id' in item && item.id) {
      updateItem(selectedDayId!, item.id, item);
    } else {
      addItem(selectedDayId!, item as Omit<AgendaItem, 'id'>);
    }
    setEditingItem(null);
  };

  const handleDeleteItem = () => {
    if (selectedDayId && editingItem) {
      deleteItem(selectedDayId, editingItem.id);
      setEditingItem(null);
    }
  };

  return (
    <div className="app">
      <div className="timeline-panel">
        <header>
          <h1>{trip.title}</h1>
          <p>{trip.days.length} days</p>
        </header>
        <DndContext
          sensors={sensors}
          collisionDetection={closestCenter}
          onDragStart={handleDragStart}
          onDragEnd={handleDragEnd}
        >
          <div className="timeline">
            {trip.days.map((day, index) => (
              <DaySection
                key={day.id}
                day={day}
                dayIndex={index}
                highlightedItemId={highlightedItemId}
                onItemClick={handleEditItem}
                onAddItem={() => handleAddItem(day.id)}
              />
            ))}
            <button className="add-day-btn" onClick={addDay}>
              + Add Day
            </button>
          </div>
        </DndContext>
      </div>
      <div className="map-panel">
        <MapPanel items={allItems} highlightedItemId={highlightedItemId} />
      </div>
      {(modalMode === 'add' || editingItem) && (
        <EditModal
          item={editingItem || undefined}
          onSave={handleSaveItem}
          onDelete={editingItem ? handleDeleteItem : undefined}
          onClose={() => { setEditingItem(null); }}
        />
      )}
    </div>
  );
}

export default App;
```

**Step 2: Add layout styles to src/index.css**

```css
.app {
  display: flex;
  height: 100vh;
}

.timeline-panel {
  width: 65%;
  padding: 20px;
  overflow-y: auto;
  background: #f9fafb;
}

.timeline-panel header {
  margin-bottom: 20px;
}

.timeline-panel header h1 {
  font-size: 24px;
  font-weight: 700;
}

.timeline {
  display: flex;
  flex-direction: column;
}

.add-day-btn {
  padding: 16px;
  border: 2px dashed #d1d5db;
  border-radius: 8px;
  background: transparent;
  color: #6b7280;
  cursor: pointer;
  font-size: 16px;
  font-weight: 500;
}

.add-day-btn:hover {
  border-color: #3b82f6;
  color: #3b82f6;
}

.map-panel {
  width: 35%;
  border-left: 1px solid #e5e7eb;
}
```

---

## Task 8: Fix Types and Test

**Files:**
- Modify: `src/components/MapPanel.tsx`

**Step 1: Fix typo in MapPanel**

```typescript
// Change PropsProps to Props
interface Props {
  items: AgendaItem[];
  highlightedItemId?: string;
}
```

**Step 2: Run build**

Run: `npm run build`
Expected: Build completes without errors

**Step 3: Run dev server**

Run: `npm run dev`
Expected: Server starts, app loads

---

## Task 9: Final Polish and Testing

**Step 1: Test drag and drop**

Verify items can be reordered within a day and moved between days.

**Step 2: Test map integration**

Verify markers appear and highlight on drag.

**Step 3: Test CRUD operations**

- Add new day
- Add items with all fields
- Edit existing items
- Delete items
- Upload images

**Step 4: Test persistence**

Refresh page and verify data persists.

---

## Plan complete!

Save this plan to: `docs/plans/2026-03-01-travel-plan-implementation.md`

**Two execution options:**

1. **Subagent-Driven (this session)** - I dispatch fresh subagent per task, review between tasks, fast iteration

2. **Parallel Session (separate)** - Open new session with executing-plans, batch execution with checkpoints

Which approach?
