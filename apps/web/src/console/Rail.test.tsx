import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { Rail } from './Rail';

describe('Rail', () => {
  it('renders all nav items', () => {
    render(<Rail activeItem="map" onSelect={vi.fn()} />);
    expect(screen.getByLabelText('MAP')).toBeInTheDocument();
    expect(screen.getByLabelText('ARMY')).toBeInTheDocument();
    expect(screen.getByLabelText('INTEL')).toBeInTheDocument();
  });

  it('calls onSelect when an item is clicked', async () => {
    const onSelect = vi.fn();
    render(<Rail activeItem="map" onSelect={onSelect} />);
    await userEvent.click(screen.getByLabelText('ARMY'));
    expect(onSelect).toHaveBeenCalledWith('army');
  });

  it('marks active item as pressed', () => {
    render(<Rail activeItem="intel" onSelect={vi.fn()} />);
    expect(screen.getByLabelText('INTEL')).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByLabelText('MAP')).toHaveAttribute('aria-pressed', 'false');
  });
});
