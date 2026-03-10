import { GoogleGenerativeAI } from '@google/generative-ai';
import { Trip } from '../types';

export interface PlanResult {
  trip: Trip;
  explanation: string;
}

export async function summarizeXhsPosts(
  apiKey: string,
  posts: { title: string; fullText?: string }[]
): Promise<string> {
  const genAI = new GoogleGenerativeAI(apiKey);
  const model = genAI.getGenerativeModel({ model: 'gemini-3-flash-preview' });

  const combined = posts
    .map((p, i) => `--- Post ${i + 1}: ${p.title} ---\n${p.fullText || '(no text)'}`)
    .join('\n\n');

  const prompt = `Summarize these Xiaohongshu travel posts into concise, actionable travel tips grouped by topic. Use bullet points. Keep it concise. Write in the same language as the posts.\n\n${combined}`;

  const result = await model.generateContent(prompt);
  return result.response.text();
}

export async function planTripWithGemini(apiKey: string, currentTrip: Trip): Promise<PlanResult> {
  const genAI = new GoogleGenerativeAI(apiKey);
  const model = genAI.getGenerativeModel({ model: 'gemini-3-flash-preview' });

  // 1. Prepare Data
  const unassigned = currentTrip.unassignedItems;

  // Separate accommodations from places to visit
  const accommodationItems = unassigned.filter(item => item.category === 'accommodation');
  const visitItems = unassigned.filter(item => item.category !== 'accommodation');

  // Minimal item representation to save tokens and reduce noise
  const places = visitItems.map(item => ({
    id: item.id,
    name: item.title,
    location: item.location,
    lat: item.lat,
    lng: item.lng,
    category: item.category,
    openingHours: item.openingHours?.weekdayDescriptions,
    reservable: item.reservable,
    suggestedDuration: item.suggestedDuration,
    notes: item.notes
  }));

  const days = currentTrip.days.map((day, index) => {
    // Include existing accommodation items from the day's hotel zone
    const dayAccommodations = day.items
      .filter(i => i.category === 'accommodation')
      .map(i => ({ name: i.title, lat: i.lat, lng: i.lng }));

    // Include existing non-accommodation items already scheduled on this day
    const existingItems = day.items
      .filter(i => i.category !== 'accommodation')
      .map(i => ({
        name: i.title,
        time: i.time,
        timeSlot: i.timeSlot,
        category: i.category,
        suggestedDuration: i.suggestedDuration,
      }));

    // Day of week for opening hours reference (0=Sun, 1=Mon, ...)
    const dateObj = new Date(day.date + 'T00:00:00');
    const dayOfWeek = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'][dateObj.getDay()];

    return {
      dayId: day.id,
      dayIndex: index + 1,
      date: day.date,
      dayOfWeek,
      startLocation: day.startLocation ? { name: day.startLocation.title, lat: day.startLocation.lat, lng: day.startLocation.lng } : null,
      endLocation: day.endLocation ? { name: day.endLocation.title, lat: day.endLocation.lat, lng: day.endLocation.lng } : null,
      accommodation: dayAccommodations.length > 0 ? dayAccommodations[0] : null,
      blockedPeriods: day.blockedPeriods || [],
      existingItems,
    };
  });

  // Unassigned accommodations as general context
  const accommodationContext = accommodationItems.length > 0
    ? accommodationItems.map(item => ({
        name: item.title,
        location: item.location,
        lat: item.lat,
        lng: item.lng,
      }))
    : null;

  if (places.length === 0) return { trip: currentTrip, explanation: '' };

  // 2. Construct Prompt
  const prompt = `
    You are an expert travel planner. I have a list of places to visit and a ${days.length}-day trip itinerary.
    Please assign the places to the days to create a logical, efficient travel plan.

    **Constraints & Rules (in priority order):**

    1. **BLOCKED TIME (CRITICAL)**: Some days have 'blockedPeriods' (HH:MM - HH:MM) AND 'existingItems' already scheduled.
       - You MUST NOT schedule any new activities that overlap with blocked periods.
       - You MUST NOT schedule during times already occupied by existing items.
       - Plan around these constraints — use the remaining free time windows only.

    2. **OPENING HOURS (CRITICAL)**: Each place may have 'openingHours' listing hours per weekday (e.g. "Monday: 9:00 AM – 5:00 PM", "Tuesday: Closed").
       - Each day has a 'date' and 'dayOfWeek' field. Cross-reference the place's opening hours with the specific day's weekday.
       - Do NOT assign a place to a day when it is CLOSED on that weekday.
       - If a place is closed on one day but open on another, move it to the open day.
       - If a place is closed on ALL available days, leave it unassigned.

    3. **Geography**: Group places that are physically close to each other on the same day. Minimize travel time.
       - **OUTLIER DETECTION**: If a place's lat/lng is very far from the main cluster of places (e.g. in a different city or region), DROP it — leave it unassigned. It's better to skip an outlier than waste a whole day traveling to it.

    4. **Anchors**:
       - If a day has a 'startLocation', the first activity should be near it.
       - If a day has an 'endLocation', the last activity should be near it.

    5. **Accommodations**:
       - Some days have an 'accommodation' field showing where the traveler is staying that night.
       - The last activities of the day should be near the accommodation so the traveler can easily return.
       - Do NOT add accommodations as visit items. They are already handled separately.

    6. **DAYTIME ONLY (CRITICAL)**: All sightseeing, activities, and visits MUST be scheduled during daytime hours.
       - Activities/visits (category: 'activity', 'transport', 'other') must END by 19:00 (7 PM) at the latest.
       - Dinner (category: 'food' at dinner time) can be scheduled up to 21:00 (9 PM).
       - Do NOT schedule any visiting or sightseeing after 19:00. Evenings are for dinner and rest only.

    7. **Time Slots**: Assign a 'timeSlot' ("am" or "pm") to each place.
       - "am": Morning to Early Afternoon (e.g. 08:00 - 13:00)
       - "pm": Afternoon to Early Evening (e.g. 13:00 - 19:00 for visits, up to 21:00 for dinner)
       - Make sure the chosen time slot does not overlap with any blocked period or existing item in that slot.

    8. **Meals**: Try to identify breakfast/lunch/dinner spots (category: 'food') and place them at appropriate meal times.
       - Breakfast: around 08:00 - 09:00
       - Lunch: around 12:00 - 13:30
       - Dinner: around 18:00 - 20:00 (this is the ONLY type of activity allowed after 19:00)

    9. **Capacity & Pacing**:
       - Don't overcrowd days. Account for travel time between places.
       - Respect the 'suggestedDuration' (in minutes) for each place.
       - After subtracting blocked periods and existing items, only schedule what fits in the remaining free time.
       - Remember: the effective day for visits ends at 19:00, so plan accordingly.

    10. **Unassigned**: If a place really doesn't fit (no time, closed all days, geographic outlier), leave it out of assignments.

    **Input Data:**

    Days (with existing schedule, blocked times, and accommodation): ${JSON.stringify(days, null, 2)}
${accommodationContext ? `
    Traveler's Accommodations (for geography reference only — do NOT assign these): ${JSON.stringify(accommodationContext, null, 2)}
` : ''}
    Places to Assign: ${JSON.stringify(places, null, 2)}

    **Output Format:**
    Return ONLY a raw JSON object (no markdown formatting, no code blocks) with the following structure:
    {
      "assignments": [
        {
          "placeId": "string",
          "dayId": "string",
          "timeSlot": "am" | "pm",
          "order": number // 1-based order within the day (accounting for existing items)
        }
      ],
      "dropped": [
        {
          "placeId": "string",
          "reason": "string" // e.g. "closed on all available days", "too far from other places"
        }
      ],
      "explanation": "A brief, friendly explanation (2-4 sentences per day) of why you organized the plan this way — geographic clustering, meal timing, opening hours, blocked time avoidance, etc."
    }
  `;

  // 3. Call API
  try {
    const result = await model.generateContent(prompt);
    const response = result.response;
    const text = response.text();

    // Clean markdown if present
    const jsonStr = text.replace(/```json/g, '').replace(/```/g, '').trim();
    const parsed = JSON.parse(jsonStr);

    // 4. Apply Plan
    const newDays = currentTrip.days.map(d => ({ ...d, items: [...d.items] })); // Deep copy existing items
    const assignedIds = new Set<string>();

    if (parsed.assignments && Array.isArray(parsed.assignments)) {
      parsed.assignments.forEach((assignment: any) => {
        // Only assign visit items, skip any accommodation IDs the AI might return
        const item = visitItems.find(i => i.id === assignment.placeId);
        if (item) {
          const targetDay = newDays.find(d => d.id === assignment.dayId);
          if (targetDay) {
            targetDay.items.push({
              ...item,
              timeSlot: assignment.timeSlot
            });
            assignedIds.add(item.id);
          }
        }
      });
    }

    // Sort items in each day based on the AI's order
    const orderMap = new Map<string, number>();
    if (parsed.assignments) {
      parsed.assignments.forEach((a: any) => orderMap.set(a.placeId, a.order || 99));
    }

    newDays.forEach(day => {
      day.items.sort((a, b) => {
        const orderA = orderMap.get(a.id) ?? 999;
        const orderB = orderMap.get(b.id) ?? 999;
        return orderA - orderB;
      });
    });

    // Build explanation including dropped places
    let explanation = parsed.explanation || '';
    if (parsed.dropped && parsed.dropped.length > 0) {
      const droppedLines = parsed.dropped.map((d: any) => `• ${visitItems.find(i => i.id === d.placeId)?.title || d.placeId}: ${d.reason}`);
      explanation += '\n\nDropped places:\n' + droppedLines.join('\n');
    }

    // Keep accommodations and unassigned visit items in the unassigned list
    const remainingUnassigned = unassigned.filter(i =>
      i.category === 'accommodation' || !assignedIds.has(i.id)
    );

    return {
      trip: {
        ...currentTrip,
        days: newDays,
        unassignedItems: remainingUnassigned
      },
      explanation,
    };

  } catch (error) {
    console.error("Gemini Planning Failed:", error);
    alert("AI Planning failed. Please check your API key and try again.");
    return { trip: currentTrip, explanation: '' };
  }
}
