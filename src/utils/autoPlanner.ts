import { Trip, Day, AgendaItem } from '../types';

/**
 * Calculates distance between two points in km (Haversine formula)
 */
function getDistance(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371; // Radius of the earth in km
  const dLat = (lat2 - lat1) * (Math.PI / 180);
  const dLng = (lng2 - lng1) * (Math.PI / 180);
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(lat1 * (Math.PI / 180)) * Math.cos(lat2 * (Math.PI / 180)) *
    Math.sin(dLng / 2) * Math.sin(dLng / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

// Simple K-Means implementation for clustering locations (Currently unused in favor of anchor-based clustering)
// function kMeans(items: AgendaItem[], k: number): AgendaItem[][] { ... }

/**
 * Sorts items in a path to minimize travel distance (TSP heuristic)
 */
function optimizePath(items: AgendaItem[], startPoint?: { lat: number, lng: number }, endPoint?: { lat: number, lng: number }): AgendaItem[] {
  if (items.length <= 1) return items;

  // Use Cheapest Insertion if both start and end are provided
  if (startPoint && endPoint) {
    // Cheapest Insertion logic
    interface Node { lat: number; lng: number; item?: AgendaItem }
    const path: Node[] = [
      { lat: startPoint.lat, lng: startPoint.lng },
      { lat: endPoint.lat, lng: endPoint.lng }
    ];
    const remaining = [...items];
    
    while (remaining.length > 0) {
      let bestItemIdx = -1;
      let bestInsertPos = -1;
      let minCostIncrease = Infinity;
      
      remaining.forEach((item, itemIdx) => {
        for (let i = 0; i < path.length - 1; i++) {
          const p1 = path[i];
          const p2 = path[i+1];
          const currentDist = getDistance(p1.lat, p1.lng, p2.lat, p2.lng);
          const newDist = getDistance(p1.lat, p1.lng, item.lat!, item.lng!) + 
                          getDistance(item.lat!, item.lng!, p2.lat, p2.lng);
          const costIncrease = newDist - currentDist;
          
          if (costIncrease < minCostIncrease) {
            minCostIncrease = costIncrease;
            bestItemIdx = itemIdx;
            bestInsertPos = i + 1;
          }
        }
      });
      
      if (bestItemIdx !== -1) {
        const bestItem = remaining[bestItemIdx];
        path.splice(bestInsertPos, 0, { lat: bestItem.lat!, lng: bestItem.lng!, item: bestItem });
        remaining.splice(bestItemIdx, 1);
      } else { break; }
    }
    return path.filter(n => n.item).map(n => n.item!) as AgendaItem[];
  }

  // Nearest Neighbor (legacy logic) for Start only or no anchors
  const remaining = [...items];
  const sorted: AgendaItem[] = [];
  
  let current = startPoint ? { lat: startPoint.lat, lng: startPoint.lng } : { lat: remaining[0].lat!, lng: remaining[0].lng! };
  
  if (!startPoint) {
    const first = remaining.shift()!;
    sorted.push(first);
    current = { lat: first.lat!, lng: first.lng! };
  }
// ...
// Actually, let's just make `optimizePath` call `optimizePathWithAnchors` for clarity
// and handle legacy NN case inside `optimizePathWithAnchors`?
// No, existing `optimizePath` is NN.
// Let's just fix the function signature.


  while (remaining.length > 0) {
    let nearestIndex = -1;
    let minDistance = Infinity;

    remaining.forEach((item, index) => {
      const dist = getDistance(current.lat, current.lng, item.lat!, item.lng!);
      if (dist < minDistance) {
        minDistance = dist;
        nearestIndex = index;
      }
    });

    if (nearestIndex !== -1) {
      const nextItem = remaining.splice(nearestIndex, 1)[0];
      sorted.push(nextItem);
      current = { lat: nextItem.lat!, lng: nextItem.lng! };
    }
  }

  return sorted;
}

export function generateAutoPlan(currentTrip: Trip): Trip {
  const itemsToPlan = currentTrip.unassignedItems.filter(i => i.lat !== undefined && i.lng !== undefined);
  
  if (itemsToPlan.length === 0) return currentTrip;

  const assignedIds = new Set<string>();

  // Separate by Category
  const foodItems = itemsToPlan.filter(i => i.category === 'food');
  const activityItems = itemsToPlan.filter(i => i.category === 'activity' || i.category === 'other' || i.category === 'transport');

  // 1. Cluster by Region (City/Area level) - roughly 50km radius
  const regions = clusterByRegion(activityItems, 50);

  const newDays: Day[] = currentTrip.days.map(d => ({ ...d, items: [...d.items] }));
  
  // 1b. Identify Fixed Days (days with anchors)
  // Store day index and its anchor location (avg of start/end if both, or just one)
  interface DayAnchor { dayIndex: number; lat: number; lng: number; locked: boolean }
  const dayAnchors: DayAnchor[] = [];
  
  newDays.forEach((d, idx) => {
    if (d.startLocation && d.endLocation) {
      dayAnchors.push({ 
        dayIndex: idx, 
        lat: (d.startLocation.lat! + d.endLocation.lat!) / 2, 
        lng: (d.startLocation.lng! + d.endLocation.lng!) / 2,
        locked: true 
      });
    } else if (d.startLocation) {
      dayAnchors.push({ dayIndex: idx, lat: d.startLocation.lat!, lng: d.startLocation.lng!, locked: true });
    } else if (d.endLocation) {
      dayAnchors.push({ dayIndex: idx, lat: d.endLocation.lat!, lng: d.endLocation.lng!, locked: true });
    } else {
      // Floating day
    }
  });

  // 2. Assign Regions to Day Clusters
  // We want to map each Region to a set of days.
  // If a region is close to a DayAnchor, it should go there.
  
  // We'll track which days are "consumed" by regions.
  const regionAssignments: { regionIndex: number; targetDayIndices: number[] }[] = [];
  const assignedDayIndices = new Set<number>();

  regions.forEach((region, rIdx) => {
    // Calc region center
    const rLat = region.reduce((sum, i) => sum + i.lat!, 0) / region.length;
    const rLng = region.reduce((sum, i) => sum + i.lng!, 0) / region.length;

    // Find all day anchors within X km (e.g. 100km)
    const compatibleDays = dayAnchors.filter(da => getDistance(rLat, rLng, da.lat, da.lng) < 100);
    
    if (compatibleDays.length > 0) {
      // This region belongs to these days
      const dayIndices = compatibleDays.map(d => d.dayIndex);
      regionAssignments.push({ regionIndex: rIdx, targetDayIndices: dayIndices });
      dayIndices.forEach(idx => assignedDayIndices.add(idx));
    } else {
      // No nearby anchored days. Will assign to floating days later.
      regionAssignments.push({ regionIndex: rIdx, targetDayIndices: [] });
    }
  });

  // Identify Floating Days (days with no anchors)
  const floatingDayIndices = newDays.map((_, i) => i).filter(i => !dayAnchors.some(da => da.dayIndex === i));
  
  // Assign unassigned regions to floating days or spillover
  // Sort unassigned regions by size? Or TSP? 
  // Let's sort "Floating Regions" (those with empty targetDayIndices) using TSP to ensure order
  const floatingRegions = regionAssignments.filter(ra => ra.targetDayIndices.length === 0);
  
  if (floatingRegions.length > 0) {
    // Sort these regions by TSP (relative to first anchored day? or just internally?)
    // Simplified: Just sort by Longitude for now as a heuristic for "travel flow"
    floatingRegions.sort((a, b) => {
      const rA = regions[a.regionIndex];
      const rB = regions[b.regionIndex];
      return rA[0].lng! - rB[0].lng!;
    });

    // Distribute floating days to these regions
    const totalItems = floatingRegions.reduce((sum, ra) => sum + regions[ra.regionIndex].length, 0);
    const totalFloatingDays = floatingDayIndices.length;

    if (totalFloatingDays > 0) {
       let currentFloatingDayIdx = 0;
       floatingRegions.forEach(ra => {
          const region = regions[ra.regionIndex];
          const daysNeeded = Math.max(1, Math.round((region.length / totalItems) * totalFloatingDays));
          // Assign days from the pool
          const assigned = [];
          for(let i=0; i<daysNeeded && currentFloatingDayIdx < totalFloatingDays; i++) {
             assigned.push(floatingDayIndices[currentFloatingDayIdx]);
             currentFloatingDayIdx++;
          }
          // If we ran out of floating days, just put in the last one
          if (assigned.length === 0 && floatingDayIndices.length > 0) {
             assigned.push(floatingDayIndices[floatingDayIndices.length - 1]);
          }
          ra.targetDayIndices = assigned;
       });
    } else {
       // No floating days left! 
       // Assign to the geographically closest anchored day (or group)
       floatingRegions.forEach(ra => {
          const region = regions[ra.regionIndex];
          const rLat = region[0].lat!; 
          const rLng = region[0].lng!;
          let bestDay = 0;
          let minDist = Infinity;
          
          // Find closest day anchor
          dayAnchors.forEach(da => {
             const d = getDistance(rLat, rLng, da.lat, da.lng);
             if (d < minDist) { minDist = d; bestDay = da.dayIndex; }
          });
          
          if (dayAnchors.length > 0) {
             ra.targetDayIndices = [bestDay];
          } else {
             // Absolute fallback if no anchors at all and no floating days (should be impossible if >0 days)
             // But if all days are full? Just dump in day 0.
             if (newDays.length > 0) ra.targetDayIndices = [0];
          }
       });
    }
  }

  // Load Balancing / Spillover for Floating Days
  // If we still have unassigned Floating Days (e.g. user added extra days but no anchors/regions matched them),
  // AND some regions are very heavy (many items per day), assign these free days to the heavy regions.
  
  const unusedFloatingDays = floatingDayIndices.filter(dIdx => 
    !regionAssignments.some(ra => ra.targetDayIndices.includes(dIdx))
  );

  while (unusedFloatingDays.length > 0) {
    const dayIdx = unusedFloatingDays.shift()!;
    
    // Find heaviest region
    let maxDensity = -1;
    let targetRA = null;
    
    regionAssignments.forEach(ra => {
       const region = regions[ra.regionIndex];
       const currentDays = ra.targetDayIndices.length;
       const density = region.length / (currentDays || 1); // Avoid div/0, though should have >=1 day usually
       if (density > maxDensity) {
          maxDensity = density;
          targetRA = ra;
       }
    });
    
    if (targetRA && maxDensity > 2) { // Only spillover if density > 2 items/day
       (targetRA as any).targetDayIndices.push(dayIdx);
       // Sort indices to keep chronological sense?
       (targetRA as any).targetDayIndices.sort((a: number, b: number) => a - b);
    }
  }

  // 3. Process Assignments
  regionAssignments.forEach(assignment => {
     const regionItems = regions[assignment.regionIndex];
     const targetDays = assignment.targetDayIndices;
     
     if (targetDays.length === 0) return; // Should not happen with logic above

     // Distribute items among targetDays
     // If targetDays.length > 1, use K-Means to split regionItems into N clusters
     // But we should bias the clusters towards the specific day anchors if they differ!
     // e.g. Day 1 Anchor is North Tokyo, Day 2 Anchor is South Tokyo.
     
     let clusters: AgendaItem[][] = [];
     
     if (targetDays.length === 1) {
        clusters = [regionItems];
     } else {
        // Advanced K-Means: Initialize centroids with the day anchors
        // Note: For now we use simpler distance-based assignment, so initialCentroids is not used yet.
        // const initialCentroids = targetDays.map(dayIdx => { ... });
        
        // Bucket items by nearest target day anchor
        const dayBuckets = new Map<number, AgendaItem[]>();
        targetDays.forEach(d => dayBuckets.set(d, []));
        
        regionItems.forEach(item => {
           let bestDay = targetDays[0];
           let minD = Infinity;
           targetDays.forEach(dayIdx => {
              const anchor = dayAnchors.find(da => da.dayIndex === dayIdx);
              if (anchor) {
                 const d = getDistance(item.lat!, item.lng!, anchor.lat, anchor.lng);
                 if (d < minD) { minD = d; bestDay = dayIdx; }
              }
           });
           dayBuckets.get(bestDay)?.push(item);
        });
        
        // Convert map to clusters in order of targetDays
        clusters = targetDays.map(d => dayBuckets.get(d) || []);
     }
     
     // Now we have clusters[i] corresponding to targetDays[i]
     clusters.forEach((clusterItems, i) => {
        const dayIdx = targetDays[i];
        const day = newDays[dayIdx];
        
        if (clusterItems.length === 0) return;

        // Path optimization with anchors
        const dayStart = day.startLocation ? { lat: day.startLocation.lat!, lng: day.startLocation.lng! } : undefined;
        const dayEnd = day.endLocation ? { lat: day.endLocation.lat!, lng: day.endLocation.lng! } : undefined;
        
        const sortedItems = optimizePath(clusterItems, dayStart, dayEnd);
        
        const splitIndex = Math.ceil(sortedItems.length / 2);
        sortedItems.forEach((item, idx) => {
           item.timeSlot = idx < splitIndex ? 'am' : 'pm';
           day.items.push(item);
           assignedIds.add(item.id);
        });
        
        // Food assignment (Logic reused)
        const centerLat = clusterItems.reduce((sum, item) => sum + item.lat!, 0) / clusterItems.length;
        const centerLng = clusterItems.reduce((sum, item) => sum + item.lng!, 0) / clusterItems.length;
        
        const availableFood = foodItems.filter(f => !assignedIds.has(f.id));
        availableFood.sort((a, b) => {
          return getDistance(a.lat!, a.lng!, centerLat, centerLng) - getDistance(b.lat!, b.lng!, centerLat, centerLng);
        });

        let mealsAdded = 0;
        for (const meal of availableFood) {
          if (mealsAdded >= 3) break;
          const mealToAdd = { ...meal };
          if (mealsAdded === 0) mealToAdd.timeSlot = 'am';
          else if (mealsAdded === 1) mealToAdd.timeSlot = 'am';
          else mealToAdd.timeSlot = 'pm';
          
          day.items.push(mealToAdd);
          assignedIds.add(mealToAdd.id);
          mealsAdded++;
        }
     });
  });

  // Re-sort items within days (Final Cleanup)
  // ... (Logic remains same as before) ...
  // But wait, we already sorted them above inside the loop?
  // Yes, but we added Food afterwards which was appended.
  // We need to re-sort to integrate Food into the path properly.
  
  newDays.forEach((day, index) => {
      const am = day.items.filter(i => i.timeSlot === 'am' && i.category !== 'accommodation');
      const pm = day.items.filter(i => i.timeSlot === 'pm' && i.category !== 'accommodation');
      const hotels = day.items.filter(i => i.category === 'accommodation');
      
      const dayStart = currentTrip.days[index]?.startLocation ? { lat: currentTrip.days[index].startLocation!.lat!, lng: currentTrip.days[index].startLocation!.lng! } : undefined;
      const dayEnd = currentTrip.days[index]?.endLocation ? { lat: currentTrip.days[index].endLocation!.lat!, lng: currentTrip.days[index].endLocation!.lng! } : undefined;

      // Optimizing AM: Start -> Items -> Last AM Item (which will connect to PM)
      // If no dayEnd, just use NN. If dayEnd, maybe we should consider it for PM.
      // Strategy:
      // 1. Optimize AM from dayStart.
      // 2. Optimize PM from (end of AM) to dayEnd.
      
      const sortedAm = optimizePath(am, dayStart); 
      
      const pmStart = sortedAm.length > 0 ? { lat: sortedAm[sortedAm.length-1].lat!, lng: sortedAm[sortedAm.length-1].lng! } : dayStart;
      
      let sortedPm = pm;
      if (pm.length > 0) {
         sortedPm = optimizePath(pm, pmStart, dayEnd);
      }

      day.items = [...sortedAm, ...sortedPm, ...hotels];
  });

  const remainingUnassigned = currentTrip.unassignedItems.filter(i => !assignedIds.has(i.id));

  return {
    ...currentTrip,
    days: newDays,
    unassignedItems: remainingUnassigned
  };
}

function clusterByRegion(items: AgendaItem[], radiusKm: number): AgendaItem[][] {
  const regions: AgendaItem[][] = [];
  const centroids: {lat: number, lng: number}[] = [];

  // Deterministic sort
  const sortedItems = [...items].sort((a, b) => a.lng! - b.lng!);

  for (const item of sortedItems) {
    let bestRegionIdx = -1;
    let minDistance = Infinity;

    for (let i = 0; i < centroids.length; i++) {
      const dist = getDistance(item.lat!, item.lng!, centroids[i].lat, centroids[i].lng);
      if (dist < minDistance && dist <= radiusKm) {
        minDistance = dist;
        bestRegionIdx = i;
      }
    }

    if (bestRegionIdx !== -1) {
      regions[bestRegionIdx].push(item);
      // Update centroid (running average)
      const region = regions[bestRegionIdx];
      const c = centroids[bestRegionIdx];
      const n = region.length;
      centroids[bestRegionIdx] = {
        lat: c.lat + (item.lat! - c.lat) / n,
        lng: c.lng + (item.lng! - c.lng) / n
      };
    } else {
      regions.push([item]);
      centroids.push({ lat: item.lat!, lng: item.lng! });
    }
  }
  return regions;
}