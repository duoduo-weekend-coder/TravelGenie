import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { EditModal } from './EditModal';

describe('EditModal', () => {
  it('shows source url and source image preview for xiaohongshu items', () => {
    render(
      <EditModal
        item={{
          id: '1',
          title: 'XHS spot',
          category: 'other',
          sourceType: 'xiaohongshu',
          sourceUrl: 'https://www.xiaohongshu.com/explore/abc',
          sourceMeta: { author: 'Alice' },
          sourceContent: {
            fullText: 'Long text',
            images: ['https://img1', 'https://img2']
          }
        }}
        onSave={vi.fn()}
        onClose={vi.fn()}
      />
    );

    expect(screen.getByText('Source URL')).toBeInTheDocument();
    expect(screen.getByDisplayValue('https://www.xiaohongshu.com/explore/abc')).toBeInTheDocument();
    expect(screen.getAllByAltText('Source preview')).toHaveLength(2);
  });
});
