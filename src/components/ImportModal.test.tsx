import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { ImportModal } from './ImportModal';

const fetchPlacesMock = vi.fn();
const parseXhsMock = vi.fn();

vi.mock('../googleMaps', () => ({
  fetchPlaces: (...args: unknown[]) => fetchPlacesMock(...args),
  getCategoryFromTypes: () => 'food'
}));

vi.mock('../utils/xiaohongshu', () => ({
  parseXiaohongshuUrl: (...args: unknown[]) => parseXhsMock(...args),
  mapXhsResponseToAgendaDraft: (payload: any) => ({
    title: payload.title || 'XHS',
    category: 'other',
    sourceType: 'xiaohongshu',
    sourceUrl: payload.originalUrl,
    sourceContent: {
      fullText: payload.fullText,
      images: payload.images || []
    },
    lat: payload.location?.lat,
    lng: payload.location?.lng,
    notes: (payload.warnings || []).join('; ')
  })
}));

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
  localStorage.clear();
});

describe('ImportModal', () => {
  it('supports mixed line parsing and renders xiaohongshu preview data', async () => {
    fetchPlacesMock.mockResolvedValueOnce([
      {
        name: 'Google Spot',
        formatted_address: 'Address 1',
        lat: 1,
        lng: 2,
        photos: ['https://img-g'],
        types: ['restaurant']
      }
    ]);

    parseXhsMock.mockResolvedValueOnce({
      status: 'parsed',
      originalUrl: 'https://www.xiaohongshu.com/explore/abc',
      title: 'XHS Cafe',
      fullText: 'Long text',
      images: ['https://img1', 'https://img2'],
      location: { placeName: 'XHS Cafe', lat: 3, lng: 4 }
    });

    render(<ImportModal onImport={vi.fn()} onClose={vi.fn()} />);

    const textarea = screen.getByRole('textbox');
    fireEvent.change(textarea, {
      target: {
        value: [
          'https://maps.google.com/?q=Google+Spot',
          'https://www.xiaohongshu.com/explore/abc'
        ].join('\n')
      }
    });

    fireEvent.click(screen.getByRole('button', { name: /parse/i }));

    await waitFor(() => {
      expect(fetchPlacesMock).toHaveBeenCalledTimes(1);
      expect(parseXhsMock).toHaveBeenCalledTimes(1);
    });

    expect(await screen.findByText('小红书')).toBeInTheDocument();
    expect(screen.getByText('2 images')).toBeInTheDocument();
  });

  it('keeps partial xiaohongshu parse importable', async () => {
    parseXhsMock.mockResolvedValueOnce({
      status: 'partial',
      originalUrl: 'https://xhslink.com/partial',
      title: 'Partial spot',
      fullText: 'No coordinates',
      images: ['https://img1'],
      warnings: ['location not found'],
      location: { placeName: 'Unknown place' }
    });

    const onImport = vi.fn();
    render(<ImportModal onImport={onImport} onClose={vi.fn()} />);

    fireEvent.change(screen.getByRole('textbox'), {
      target: { value: 'https://xhslink.com/partial' }
    });

    fireEvent.click(screen.getByRole('button', { name: /parse/i }));

    expect(await screen.findByText(/location not found/i)).toBeInTheDocument();

    const importButton = screen.getByRole('button', { name: /import 1 place/i });
    expect(importButton).toBeEnabled();
    fireEvent.click(importButton);

    expect(onImport).toHaveBeenCalledWith(
      expect.arrayContaining([
        expect.objectContaining({
          sourceType: 'xiaohongshu',
          title: 'Partial spot'
        })
      ])
    );
  });
});
