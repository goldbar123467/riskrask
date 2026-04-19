import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { Shell } from './Shell';

describe('Shell', () => {
  it('renders all slot regions', () => {
    render(
      <Shell
        brand={<span>BRAND</span>}
        topbar={<span>TOPBAR</span>}
        rail={<span>RAIL</span>}
        stage={<span>STAGE</span>}
        dossier={<span>DOSSIER</span>}
        statusbar={<span>STATUSBAR</span>}
      />,
    );

    expect(screen.getByLabelText('brand')).toBeInTheDocument();
    expect(screen.getByLabelText('topbar')).toBeInTheDocument();
    expect(screen.getByLabelText('rail')).toBeInTheDocument();
    expect(screen.getByLabelText('stage')).toBeInTheDocument();
    expect(screen.getByLabelText('dossier')).toBeInTheDocument();
    expect(screen.getByLabelText('statusbar')).toBeInTheDocument();

    expect(screen.getByText('BRAND')).toBeInTheDocument();
    expect(screen.getByText('TOPBAR')).toBeInTheDocument();
    expect(screen.getByText('RAIL')).toBeInTheDocument();
    expect(screen.getByText('STAGE')).toBeInTheDocument();
    expect(screen.getByText('DOSSIER')).toBeInTheDocument();
    expect(screen.getByText('STATUSBAR')).toBeInTheDocument();
  });
});
