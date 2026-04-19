import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { App } from './App';

describe('admin App', () => {
  it('renders the admin title', () => {
    render(<App />);
    expect(screen.getByText('Riskrask admin')).toBeInTheDocument();
  });
});
