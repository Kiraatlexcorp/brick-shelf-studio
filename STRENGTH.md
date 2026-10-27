# Strength note (10 kg target)

All numbers below are **estimates / guesses**, not tests. Verify with the sag test at the end.

## Print settings (assumed)
- **PETG** preferred: tougher, less brittle, handles a warm room. PLA is stiffer (E ≈ 3 GPa vs ≈ 2 GPa) and creeps less at 20 °C, but cracks at the pegs and goes soft above ~50 °C (car, sunny window). Use PETG for load-bearing cubes, PLA is fine for light ones.
- **4 walls (perimeters), 25 % gyroid infill**, 5 top/bottom layers, 0.2 mm layers.
- **Panels printed flat** (the 3MF does this), so layers run along the panel and loads are not across layer lines.
- Default: 5 mm walls, 6 mm decks, corner gussets, deck ribs, dovetails, M4 bolt holes. Use 6 mm walls with drawers.

## Simple calc (guess)
Worst case: a 4 × 4 cube (160 mm) sitting on two side supports with 10 kg (98 N) spread on the bottom deck.
- Span L = 150 mm, deck b = 160 mm, t = 6 mm. I = b·t³/12 ≈ 2 880 mm⁴, Z = b·t²/6 ≈ 960 mm³.
- Bending M = F·L/8 ≈ 1 840 N·mm → stress ≈ **1.9 MPa**. Printed PETG at 4 walls / 25 % gyroid maybe 15–25 MPa effective (guess) → safety factor ~8.
- Sag δ = 5·F·L³/(384·E·I) with E_eff ≈ 1.5 GPa (guess for a printed part) → **≈ 1 mm** short term; creep may double it over weeks. Ribs (4 mm deep) under the top deck cut the top deck sag roughly 2–3×.
- Normal use (cube sitting flat on a floor or another cube) loads the deck in compression only: 98 N over two 5 mm × 160 mm walls ≈ 0.06 MPa, trivial.
- Weak spots: small wall-edge pegs (they align, they do not carry tension) and racking. Gussets + back wall handle racking; for 10 kg stacks **bolt the corners with M4** (holes provided) or glue the pegs with CA/epoxy. Screw the back wall to the wall (two holes) for tall towers.

## Test
Load the cube with 10 kg (water bottles) for **24 h**, measure deck sag at the centre before/after with a straight edge and feeler. Target < 2 mm and no whitening at the pegs or hinge knuckles.
