import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { Statusbar } from './Statusbar';

describe('Statusbar', () => {
  it('renders link status, tick, latency, window', () => {
    render(
      <Statusbar
        link="stable"
        tickLabel="T-042"
        latencyMs={24}
        windowLabel="02:15"
      />,
    );

    expect(screen.getByText('STABLE')).toBeInTheDocument();
    expect(screen.getByText('T-042')).toBeInTheDocument();
    expect(screen.getByText('24ms')).toBeInTheDocument();
    expect(screen.getByText('02:15')).toBeInTheDocument();
  });
});
