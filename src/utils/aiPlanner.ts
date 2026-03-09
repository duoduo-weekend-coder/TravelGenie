import { GoogleGenerativeAI } from '@google/generative-ai';
import { Trip } from '../types';

export async function planTripWithGemini(apiKey: string, currentTrip: Trip): Promise<Trip> {
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

    return {
      dayId: day.id,
      dayIndex: index + 1,
      date: day.date,
      startLocation: day.startLocation ? { name: day.startLocation.title, lat: day.startLocation.lat, lng: day.startLocation.lng } : null,
      endLocation: day.endLocation ? { name: day.endLocation.title, lat: day.endLocation.lat, lng: day.endLocation.lng } : null,
      accommodation: dayAccommodations.length > 0 ? dayAccommodations[0] : null,
      blockedPeriods: day.blockedPeriods,
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

  if (places.length === 0) return currentTrip;

  // 2. Construct Prompt
  const prompt = `
    You are an expert travel planner. I have a list of places to visit and a ${days.length}-day trip itinerary.
    Please assign the places to the days to create a logical, efficient travel plan.

    **Constraints & Rules:**
    1. **Geography**: Group places that are physically close to each other in the same day. Minimize travel time.
    2. **Anchors**:
       - If a day has a 'startLocation', the first activity should be near it.
       - If a day has an 'endLocation', the last activity should be near it.
    3. **Accommodations**:
       - Some days have an 'accommodation' field showing where the traveler is staying that night.
       - Use the accommodation location for geography: the last activities of the day should be near the accommodation so the traveler can easily return.
       - Do NOT add accommodations as visit items. They are already handled separately.
    4. **Time Slots**: Assign a 'timeSlot' ("am" or "pm") to each place.
       - "am": Morning to Early Afternoon (e.g. 08:00 - 14:00)
       - "pm": Late Afternoon to Evening (e.g. 14:00 - 22:00)
    5. **Meals**: Try to identify breakfast/lunch/dinner spots (category: 'food') and place them appropriately.
    6. **Opening Hours**: Use the provided opening hours text to avoid placing closed venues.
    7. **Capacity & Pacing**:
       - Don't overcrowd days.
       - Respect the 'suggestedDuration' (in minutes) for each place.
       - **BLOCKED TIME**: Some days have 'blockedPeriods' (HH:MM - HH:MM). Do NOT plan activities during these times. Adjust the plan around them.
    8. **Unassigned**: If a place really doesn't fit or there isn't time, you can leave it out.

    **Input Data:**

    Days (with accommodation and blocked times): ${JSON.stringify(days, null, 2)}
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
          "order": number // 1-based order within the day
        }
      ]
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

    // Keep accommodations and unassigned visit items in the unassigned list
    const remainingUnassigned = unassigned.filter(i =>
      i.category === 'accommodation' || !assignedIds.has(i.id)
    );

    return {
      ...currentTrip,
      days: newDays,
      unassignedItems: remainingUnassigned
    };

  } catch (error) {
    console.error("Gemini Planning Failed:", error);
    alert("AI Planning failed. Please check your API key and try again.");
    return currentTrip;
  }
}