import { Trip } from './types';

/**
 * Seed trip loaded for first-time visitors (no localStorage).
 *
 * To update: click "Export Trip" in the header, copy the JSON,
 * and replace the object below. Then redeploy.
 */
export const demoTrip: Trip = {
  id: 'demo',
  title: 'My Trip',
  startDate: new Date().toISOString().split('T')[0],
  days: [
    {
      id: 'demo-day-1',
      date: new Date().toISOString().split('T')[0],
      items: [],
    },
  ],
  unassignedItems: [],
};
