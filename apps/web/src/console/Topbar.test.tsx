import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { Topbar } from './Topbar';

describe('Topbar', () => {
  it('renders all meta fields', () => {
    render(
      <Topbar
        session="SES-001"
        turn="12"
        phase="ATTACK"
        clock="01:30"
        players="3/6"
      />,
    );

    expect(screen.getByText('SES-001')).toBeInTheDocument();
    expect(screen.getByText('12')).toBeInTheDocument();
    expect(screen.getByText('ATTACK')).toBeInTheDocument();
    expect(screen.getByText('01:30')).toBeInTheDocument();
    expect(screen.getByText('3/6')).toBeInTheDocument();
  });
});
