import { useState, useRef } from 'react';

interface Props {
  blockedPeriods: { start: string; end: string }[];
  onAddBlockedPeriod: (start: string, end: string) => void;
  onRemoveBlockedPeriod: (index: number) => void;
}

export const START_HOUR = 6; // 6 AM
export const END_HOUR = 24; // Midnight
export const TOTAL_MINUTES = (END_HOUR - START_HOUR) * 60;
export const PIXELS_PER_HOUR = 20; // Compact but usable
export const RULER_HEIGHT = (END_HOUR - START_HOUR) * PIXELS_PER_HOUR;

export function TimeRuler({ blockedPeriods, onAddBlockedPeriod, onRemoveBlockedPeriod }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [dragStartY, setDragStartY] = useState<number | null>(null);
  const [currentY, setCurrentY] = useState<number | null>(null);

  const yToTime = (y: number) => {
    const clampedY = Math.max(0, Math.min(y, RULER_HEIGHT));
    const minutesFromStart = (clampedY / RULER_HEIGHT) * TOTAL_MINUTES;
    const totalMinutes = (START_HOUR * 60) + minutesFromStart;
    const hours = Math.floor(totalMinutes / 60);
    const mins = Math.floor(totalMinutes % 60);
    // Round to nearest 15 min
    const roundedMins = Math.round(mins / 15) * 15;
    const date = new Date();
    date.setHours(hours, roundedMins);
    return date.toLocaleTimeString('en-US', { hour12: false, hour: '2-digit', minute: '2-digit' });
  };

  const handleMouseDown = (e: React.MouseEvent) => {
    if (e.button !== 0) return; // Left click only
    if (!containerRef.current) return;
    
    const rect = containerRef.current.getBoundingClientRect();
    const y = e.clientY - rect.top;
    setDragStartY(y);
    setCurrentY(y);
    setIsDragging(true);
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    if (!isDragging || !containerRef.current) return;
    const rect = containerRef.current.getBoundingClientRect();
    setCurrentY(e.clientY - rect.top);
  };

  const handleMouseUp = () => {
    if (isDragging && dragStartY !== null && currentY !== null) {
      const startY = Math.min(dragStartY, currentY);
      const endY = Math.max(dragStartY, currentY);
      
      // Minimum drag threshold (e.g. 5px) to avoid accidental clicks
      if (endY - startY > 5) {
        const startTime = yToTime(startY);
        const endTime = yToTime(endY);
        if (startTime !== endTime) {
          onAddBlockedPeriod(startTime, endTime);
        }
      }
      
      setIsDragging(false);
      setDragStartY(null);
      setCurrentY(null);
    }
  };

  // Handle mouse leave as mouse up to finish drag
  const handleMouseLeave = () => {
    if (isDragging) handleMouseUp();
  };

  const timeToY = (timeStr: string) => {
    const [h, m] = timeStr.split(':').map(Number);
    const minutesFromStart = (h * 60 + m) - (START_HOUR * 60);
    return (minutesFromStart / TOTAL_MINUTES) * RULER_HEIGHT;
  };

  return (
    <div 
      className="time-ruler-container" 
      style={{ height: RULER_HEIGHT }}
      onMouseDown={handleMouseDown}
      onMouseMove={handleMouseMove}
      onMouseUp={handleMouseUp}
      onMouseLeave={handleMouseLeave}
      ref={containerRef}
    >
      {/* Hour markers */}
      {Array.from({ length: END_HOUR - START_HOUR + 1 }).map((_, i) => {
        const hour = START_HOUR + i;
        return (
          <div key={hour} className="ruler-hour-marker" style={{ top: i * PIXELS_PER_HOUR }}>
            <span className="ruler-hour-label">{hour}</span>
            <div className="ruler-tick" />
          </div>
        );
      })}

      {/* Existing Blocks */}
      {blockedPeriods.map((bp, idx) => {
        const top = timeToY(bp.start);
        const bottom = timeToY(bp.end);
        const height = Math.max(2, bottom - top); // Ensure at least 2px visible
        
        return (
          <div 
            key={idx}
            className="ruler-block"
            style={{ top, height }}
            title={`${bp.start} - ${bp.end} (Click to remove)`}
            onMouseDown={(e) => e.stopPropagation()} // Prevent creating new block when clicking existing
            onClick={(e) => { e.stopPropagation(); onRemoveBlockedPeriod(idx); }}
          >
            ×
          </div>
        );
      })}

      {/* Drag Preview */}
      {isDragging && dragStartY !== null && currentY !== null && (
        <div 
          className="ruler-drag-preview"
          style={{ 
            top: Math.min(dragStartY, currentY), 
            height: Math.abs(currentY - dragStartY) 
          }}
        />
      )}
    </div>
  );
}