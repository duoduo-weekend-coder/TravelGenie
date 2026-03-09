import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { AgendaCard } from './AgendaCard';

vi.mock('@dnd-kit/sortable', () => ({
  useSortable: () => ({
    attributes: {},
    listeners: {},
    setNodeRef: () => {},
    transform: null,
    transition: undefined,
    isDragging: false
  })
}));

vi.mock('@dnd-kit/utilities', () => ({
  CSS: {
    Transform: {
      toString: () => undefined
    }
  }
}));

describe('AgendaCard', () => {
  it('renders 小红书 source badge for xiaohongshu items', () => {
    render(
      <AgendaCard
        item={{
          id: '1',
          title: 'Cafe',
          category: 'food',
          sourceType: 'xiaohongshu'
        }}
        onClick={vi.fn()}
      />
    );

    expect(screen.getByText('小红书')).toBeInTheDocument();
  });
});
