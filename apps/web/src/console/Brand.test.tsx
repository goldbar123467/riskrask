import { render } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { Brand } from './Brand';

describe('Brand', () => {
  it('renders without crashing', () => {
    const { container } = render(<Brand />);
    expect(container.firstChild).toBeTruthy();
  });
});
