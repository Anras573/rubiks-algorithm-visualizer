/**
 * logic.js
 * Move parsing, scramble generator, tutorial step data, quick algorithm list.
 */

// ── Move definitions ─────────────────────────────────────────────────────────
// axis   : which axis the layer spins around ('x' | 'y' | 'z')
// layer  : which coordinate value selects the affected cubies (-1 | 0 | 1)
// angle  : base rotation in radians for the clockwise quarter-turn
//
// Rotation conventions (Three.js right-hand rule, Z points toward viewer):
//   R (right face CW from +X)  → -π/2 around X
//   L (left  face CW from -X)  → +π/2 around X
//   U (up    face CW from +Y)  → -π/2 around Y
//   D (down  face CW from -Y)  → +π/2 around Y
//   F (front face CW from +Z)  → -π/2 around Z
//   B (back  face CW from -Z)  → +π/2 around Z
//   M (middle slice, moves like L)  → +π/2 around X
//   E (equatorial slice, moves like D) → +π/2 around Y
//   S (standing slice, moves like F)   → -π/2 around Z
export const MOVE_DEFS = {
  R: { axis: 'x', layer:  1, angle: -Math.PI / 2 },
  L: { axis: 'x', layer: -1, angle:  Math.PI / 2 },
  U: { axis: 'y', layer:  1, angle: -Math.PI / 2 },
  D: { axis: 'y', layer: -1, angle:  Math.PI / 2 },
  F: { axis: 'z', layer:  1, angle: -Math.PI / 2 },
  B: { axis: 'z', layer: -1, angle:  Math.PI / 2 },
  M: { axis: 'x', layer:  0, angle:  Math.PI / 2 },
  E: { axis: 'y', layer:  0, angle:  Math.PI / 2 },
  S: { axis: 'z', layer:  0, angle: -Math.PI / 2 },
};

/**
 * Parse a single move token such as "R", "U'", "F2", "R2'".
 * Returns { axis, layer, angle } or null if unrecognised.
 */
export function parseMove(token) {
  if (!token) return null;
  // Accepts standard WCA notation: face letter, optional '2' for double turn,
  // optional "'" for prime (counter-clockwise). E.g. R, R', R2, R2', U, F2
  const m = token.trim().match(/^([RLUDFBMESrludfbmes])(2?)('?)$/);
  if (!m) return null;

  const face     = m[1].toUpperCase();
  const isDouble = m[2] === '2';
  const isPrime  = m[3] === "'";

  const base = MOVE_DEFS[face];
  if (!base) return null;

  let angle = base.angle;
  if (isPrime)  angle = -angle;
  if (isDouble) angle *= 2;

  return { axis: base.axis, layer: base.layer, angle };
}

/**
 * Parse a space-separated algorithm string into an array of move objects.
 */
export function parseAlgorithm(algStr) {
  if (!algStr || !algStr.trim()) return [];
  return algStr.trim().split(/\s+/).map(parseMove).filter(Boolean);
}

/**
 * Generate a random WCA-style scramble of the given length.
 * Avoids consecutive moves on the same axis.
 */
export function generateScramble(length = 20) {
  const faces = ['R', 'L', 'U', 'D', 'F', 'B'];
  const modifiers = ['', "'", '2'];
  const axisOf = { R: 'x', L: 'x', U: 'y', D: 'y', F: 'z', B: 'z' };

  const moves = [];
  let lastAxis = '';

  for (let i = 0; i < length; i++) {
    // Only choose from faces whose axis differs from the last move to guarantee
    // no consecutive same-axis moves (avoids the unreliable try-limit approach).
    const eligible = faces.filter(f => axisOf[f] !== lastAxis);
    const pool = eligible.length > 0 ? eligible : faces;
    const face = pool[Math.floor(Math.random() * pool.length)];

    const mod = modifiers[Math.floor(Math.random() * modifiers.length)];
    moves.push(face + mod);
    lastAxis = axisOf[face];
  }

  return moves.join(' ');
}

// ── Tutorial steps ───────────────────────────────────────────────────────────
export const TUTORIAL_STEPS = [
  {
    id: 1,
    stage: 'White Cross',
    title: 'The White Cross',
    description:
      'Form a white cross on the top face. Each of the four white edge pieces ' +
      'must also align with the centre colour of its adjacent side face.',
    algorithm: "F R U R' U' F'",
    tip: "💡 Hold the cube with white on top. Locate white edge pieces and bring " +
         "them up one by one to form a '+' shape while matching the side centres.",
    color: '#ffffff',
  },
  {
    id: 2,
    stage: 'First Layer',
    title: 'White Corners',
    description:
      'Complete the first layer by correctly inserting the four white corner ' +
      'pieces. Each corner should show white on top and match both adjacent side colours.',
    algorithm: "R U R' U'",
    tip: "💡 This is the Sexy Move. Position the target corner at bottom-right-front, " +
         "then repeat R U R' U' (up to 5 times) until it slots in correctly.",
    color: '#ffffff',
  },
  {
    id: 3,
    stage: 'Second Layer',
    title: 'Middle Layer (F2L)',
    description:
      'Insert the four middle-layer edge pieces to complete the first two layers. ' +
      'This algorithm places an edge into the right slot.',
    algorithm: "U R U' R' U' F' U F",
    tip: "💡 For the left slot, use the mirror: U' L' U L U F U' F'",
    color: '#ffa500',
  },
  {
    id: 4,
    stage: 'OLL',
    title: 'Yellow Cross',
    description:
      'Create a yellow cross on the top face. This is the first stage of ' +
      'Orienting the Last Layer (OLL).',
    algorithm: "F R U R' U' F'",
    tip: "💡 Repeat this algorithm while checking the top face. " +
         "Depending on your starting case (dot, L-shape, or bar) you may need 1–3 applications.",
    color: '#ffff00',
  },
  {
    id: 5,
    stage: 'OLL',
    title: 'Orient Last Layer (Sune)',
    description:
      'Orient all yellow stickers to face upward. The Sune algorithm cycles ' +
      'corner orientations to complete the OLL.',
    algorithm: "R U R' U R U2 R'",
    tip: "💡 After each Sune, check the top face and rotate (U turn) if needed. " +
         "Apply again until all yellows face up.",
    color: '#ffff00',
  },
  {
    id: 6,
    stage: 'PLL',
    title: 'Permute Last Layer (U-Perm)',
    description:
      'Move last-layer pieces to their final positions to complete the solve. ' +
      'This U-Perm cycles three edge pieces.',
    algorithm: "R U' R U R U R U' R' U' R2",
    tip: "💡 Align one side so it matches its centre colour, then execute U-Perm. " +
         "For corners use T-Perm or A-Perm as needed.",
    color: '#ffff00',
  },
];

// ── Quick algorithm reference ────────────────────────────────────────────────
export const QUICK_ALGORITHMS = [
  { name: 'Sexy Move',    alg: "R U R' U'" },
  { name: 'Sledgehammer', alg: "R' F R F'" },
  { name: 'Sune',         alg: "R U R' U R U2 R'" },
  { name: 'Anti-Sune',    alg: "L' U' L U' L' U2 L" },
  { name: 'T-Perm',       alg: "R U R' U' R' F R2 U' R' U' R U R' F'" },
  { name: 'U-Perm (a)',   alg: "R U' R U R U R U' R' U' R2" },
  { name: 'U-Perm (b)',   alg: "R2 U R U R' U' R' U' R' U R'" },
  { name: 'Y-Perm',       alg: "F R U' R' U' R U R' F' R U R' U' R' F R F'" },
];
