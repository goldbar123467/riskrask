import { render } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { DicePanel } from './DicePanel';

describe('DicePanel', () => {
  it('renders the correct number of pips across dice (3 + 5 + 2 = 10)', () => {
    const { container } = render(<DicePanel attackDice={[3, 5, 2]} defenseDice={[]} />);
    const circles = container.querySelectorAll('circle');
    expect(circles.length).toBe(10);
  });

  it('renders nothing when both rolls are empty', () => {
    const { container } = render(<DicePanel attackDice={[]} defenseDice={[]} />);
    expect(container.firstChild).toBeNull();
  });

  it('shows pip faces for mixed attacker and defender rolls', () => {
    // Attacker rolls [6, 1] → 6+1 = 7 pips; defender rolls [4] → 4 pips; total = 11.
    const { container } = render(<DicePanel attackDice={[6, 1]} defenseDice={[4]} />);
    const circles = container.querySelectorAll('circle');
    expect(circles.length).toBe(11);
  });
});
