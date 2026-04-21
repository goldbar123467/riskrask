# Classic Risk — Rules Reference

Canonical reference for building `riskrask` around the classic Hasbro Risk ruleset. When gameplay logic is ambiguous, this document is the source of truth. Every rule below is drawn from the official Hasbro rulebook and widely-cited rule summaries (see **Sources** at the bottom).

---

## 1. Components

- **Board** — map of 6 continents divided into **42 territories**. Each continent is a distinct color; continents contain 4–12 territories.
- **Armies** — 6 army sets, one per color. Each set contains three denominations:
  - Infantry = 1
  - Cavalry = 5 Infantry
  - Artillery = 10 Infantry (or 2 Cavalry)
  - Conversions are purely a stockpile convenience; they have no in-game power difference.
- **Dice** — 5 total: **3 red** (attacker) + **2 white** (defender).
- **Risk card deck** — **44 cards**:
  - 42 territory cards, each showing a territory + one symbol: Infantry, Cavalry, or Artillery.
  - 2 **wild** cards (no territory, all three symbols).
  - (Mission Risk variant adds 12 Secret Mission cards; not used in Classic.)

## 2. Continents and Bonuses

| Continent     | Territories | Bonus armies/turn when fully controlled |
|---------------|:-----------:|:---------------------------------------:|
| Asia          |     12      |                  **7**                  |
| North America |      9      |                  **5**                  |
| Europe        |      7      |                  **5**                  |
| Africa        |      6      |                  **3**                  |
| Australia     |      4      |                  **2**                  |
| South America |      4      |                  **2**                  |

Bonus is awarded at the start of the Reinforcement phase each turn the player owns **every** territory in the continent.

## 3. Setup

### 3.1 Starting armies (3–6 players)

| Players | Starting Infantry per player |
|:-------:|:----------------------------:|
|    3    |              35              |
|    4    |              30              |
|    5    |              25              |
|    6    |              20              |

### 3.2 Turn order

Each player rolls one die. Highest roll chooses color and goes first. Play proceeds clockwise (to the left).

### 3.3 Territory claim

Starting with player 1 and proceeding clockwise, each player places **one Infantry** on an unoccupied territory. Continue until all 42 territories are claimed.

### 3.4 Initial reinforcement

Once all territories are claimed, continue clockwise placing armies **one at a time** on any territory you already own, until every player has placed their full starting army pool.

### 3.5 Two-player variant (Classic)

Used when only two humans play. Introduces a **Neutral** army controlled notionally by the non-active opponent.

- Each human + Neutral each take **40 Infantry**.
- Remove Mission cards and the 2 wild cards from the deck. Shuffle the 42 territory cards and deal into **three equal piles of 14**. Each human picks a pile; the remaining pile is Neutral.
- Each pile-holder places one Infantry on each of the 14 territories shown in their pile.
- Then players alternate turns placing **two** of their own Infantry (either stacked or split across two owned territories), plus **one** Neutral Infantry on any Neutral territory, until all armies are placed.
- During play:
  - Neutral **never attacks** and **never receives reinforcements** or cards.
  - When a human attacks a Neutral territory, the **opponent** rolls the defender's dice.
  - You **do not** need to eliminate Neutral to win; you win by capturing all your human opponent's territories.

## 4. Turn Structure

Each player's turn has **three phases in strict order**:

1. **Reinforcement** — gain and place new armies.
2. **Attack** — optional; roll dice to take adjacent territories.
3. **Fortify** — optional; one troop movement at end of turn.

The active player **must** perform Reinforcement. Attack and Fortify are each optional.

### 4.1 Reinforcement phase

#### 4.1.1 New armies from territories
Count the number of territories you currently occupy and **divide by 3, rounding down**. Minimum **3** armies per turn regardless of the count.

```
armies = max(3, floor(territories_owned / 3))
```

#### 4.1.2 Continent bonuses
Add the bonus for each continent you **fully** control (see §2). Bonuses stack.

#### 4.1.3 Risk card trade-ins
At the **start** of Reinforcement, the player may (and sometimes must — see below) trade one matched set of exactly **3 cards**:
- 3 cards of the same symbol (all Infantry / all Cavalry / all Artillery), or
- 1 Infantry + 1 Cavalry + 1 Artillery, or
- Any 2 cards + 1 wild.

**Escalating trade-in values** (globally across the whole game, not per-player):

| Trade-in # | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | ... |
|------------|:-:|:-:|:-:|:-:|:-:|:-:|:-:|:-:|:-:|:---:|
| Armies     | 4 | 6 | 8 |10 |12 |15 |20 |25 |30 | +5  |

After the 6th set, every additional set is worth **5 more** than the previous.

**Territory match bonus**: If **any** of the 3 traded cards pictures a territory you currently occupy, place **2 extra** armies **on that specific territory**. Capped at **+2** total per turn even if multiple cards match.

**Forced trades**:
- If you hold **5 cards** at the start of your turn, you **must** trade at least one set this turn.
- If you hold **6+ cards**, you must immediately trade sets until you hold fewer than 5.
- A player can hold at most **5 cards** at the end of a turn; the above rule enforces this.

#### 4.1.4 Placement
Place all earned armies on territories **you currently own**. Any split is legal. All must be placed before starting Attack.

### 4.2 Attack phase

#### 4.2.1 Requirements
- Attacker territory must have **≥ 2 armies** (you must leave at least 1 behind).
- Defender territory must be **adjacent** to the attacker territory (land border or printed sea-lane — e.g., Kamchatka–Alaska counts).

#### 4.2.2 Dice
- **Attacker** rolls 1, 2, or 3 red dice:
  - Must have `(armies − 1) ≥ dice_count`. Example: 3 armies → may roll up to 2 dice; 4 armies → up to 3.
- **Defender** rolls 1 or 2 white dice:
  - Must have `armies ≥ dice_count`. Example: 1 army → 1 die; 2+ armies → up to 2.
- Both players **announce dice counts and roll simultaneously**.

#### 4.2.3 Resolution
- Sort each side's dice **descending**.
- Compare the highest die of each. If multiple dice were rolled on each side, also compare the second-highest pair.
- For each comparison:
  - Attacker strictly higher → defender loses **1 army** from the defending territory.
  - Otherwise (defender equal or higher) → attacker loses **1 army** from the attacking territory.
- **Ties go to the defender.**
- Each roll can produce **at most 2 casualties** (one per compared pair).

#### 4.2.4 Continuing and stopping
- The attacker may keep rolling against the same target as long as they still have ≥ 2 armies in the attacking territory and the target still has defenders.
- The attacker may switch to another adjacent target at any point, attack from a different origin, or end the Attack phase at any time.
- If the attacker drops to 1 army in the source territory, they **cannot attack from that territory** anymore.

#### 4.2.5 Capture
When the defending territory is reduced to 0 armies, the attacker **must immediately** move **at least** as many armies as the number of dice last rolled (min **1**, up to **all but one** in the source). Some editions simplify this to "at least 1, up to all but one."

#### 4.2.6 Card award
- At the end of the Attack phase, if the player captured **at least one** territory that turn, they draw **exactly one** Risk card. Multiple captures still earn only **one** card.
- If not, no card.
- If this draw takes the player to 6 cards, they are not forced to trade until the start of their next turn (§4.1.3 forced-trade rule triggers then).

#### 4.2.7 Eliminating a player
If your attack removes an opponent's last territory:
- You take **all** of their Risk cards.
- If you now hold **≥ 6 cards**, you must **immediately** (before continuing to attack) trade sets down to **fewer than 5** cards. The armies from these trades are placed on your territories right away and may be used to continue attacking this turn.

### 4.3 Fortify phase

At the **end** of your turn, you may perform **one** troop movement:

> **Classic rule (Hasbro 2008+ official)**: Move **as many armies as you like** from **one** of your territories into **one adjacent territory you also own**. Must leave at least 1 army behind. You may only make this move once per turn.

Common house variants (pick **one** explicitly in the engine):
- **"Connected-through-owned" (a.k.a. Free Move / 1993 rules)**: move between any two of your territories connected by an unbroken chain of your own territories.
- **"Directly adjacent" (classic)**: as above — only to an immediately adjacent owned territory.

Fortify is optional and may be skipped. You may fortify even if you did not attack this turn.

## 5. Winning

- **Classic**: First player to control **all 42 territories** wins.
- **Mission Risk** (optional variant): Each player draws a secret Mission card at setup; first to complete their mission wins. Typical missions: conquer two specific continents, conquer Europe + one other continent + 1 more, occupy 18 territories with ≥ 2 armies each, eliminate a specific color, etc. Not required for classic play.

## 6. Worked examples

**Dice**: Attacker has 4 armies in Brazil and attacks North Africa (defender: 3 armies). Attacker rolls 3 red dice → 6, 4, 2. Defender rolls 2 white dice → 5, 4. Compare top pair: 6 vs 5 → defender loses 1 (now 2). Compare 2nd pair: 4 vs 4 → tie, attacker loses 1 (Brazil now 3 armies). No third comparison because defender only has 2 dice.

**Reinforcement**: Player owns 14 territories, all of Australia, and all of South America. Armies = max(3, ⌊14/3⌋) + 2 + 2 = 4 + 4 = **8 armies**.

**Card trade**: 4th trade-in of the game = **10 armies**. If one of the cards shows "Ural" and player owns Ural, they also place **+2 armies on Ural**, so total from trade-in = 12 armies.

## 7. Open design questions for riskrask

These are implementation choices for the project; call them out explicitly in code:

1. **Fortify rule**: Classic (adjacent-only) or connected-through-owned? Choose one and document.
2. **Capture movement minimum**: "≥ 1" vs "≥ dice rolled"? Pick one per-edition-standard.
3. **Card award on conquest via elimination**: standard rule is still only 1 card at end of turn, even if you eliminated someone. Confirm engine matches.
4. **Attack-from-source lock-in**: Classic allows abandoning an attack at any point; ensure UI supports mid-attack switching and stopping.
5. **Two-player Neutral variant**: low priority for v1; stub but don't ship.

---

## Sources

- [Hasbro — Risk rulebook PDF (official)](https://www.hasbro.com/common/instruct/risk.pdf)
- [Hasbro — Risk game instructions](https://instructions.hasbro.com/en-us/instruction/risk-board-game)
- [Wizards of the Coast / Avalon Hill — Risk rules PDF](https://media.wizards.com/2015/downloads/ah/Risk_rules.pdf)
- [UltraBoardGames — How to play Risk](https://www.ultraboardgames.com/risk/game-rules.php)
- [UltraBoardGames — Risk for 2 players](https://www.ultraboardgames.com/risk/risk-for-2-players.php)
- [Wikipedia — Risk (game)](https://en.wikipedia.org/wiki/Risk_\(game\))
- [1j1ju CDN — Risk Rulebook](https://cdn.1j1ju.com/medias/ad/d9/a3-risk-rulebook.pdf)
- [GamingCorner — Risk UK rules PDF](http://www.gamingcorner.nl/rules/boardgames/risk_uk.pdf)
