# Rubik's Algorithm Visualizer

An interactive, browser-based 3D Rubik's Cube visualizer built with [Three.js](https://threejs.org/). Step through a guided tutorial for solving the cube, or freely experiment with algorithms in Practice Mode — all with smooth, colour-coded animations.

---

## Features

- **3D Interactive Cube** — Rendered with Three.js. Drag to rotate the view with OrbitControls.
- **Tutorial Mode** — Six guided steps walk you through a full beginner's solve:
  - White Cross
  - White Corners (First Layer)
  - Middle Layer (F2L)
  - Yellow Cross (OLL)
  - Orient Last Layer — Sune (OLL)
  - Permute Last Layer — U-Perm (PLL)
- **Ready-made Case per Step** — Opening a tutorial step sets the cube up for it: everything is solved
  except the pieces that step's algorithm puts back, so running the algorithm once finishes the cube.
  The unsolved pieces are highlighted on the 3D cube, and the setup sequence is shown in the sidebar.
- **Practice Mode** — Enter any custom algorithm using standard WCA notation, or run one of eight built-in Quick Algorithms (Sexy Move, Sledgehammer, Sune, T-Perm, U-Perms, and more).
- **Animated Execution** — Each move is animated individually; active moves are highlighted in the algorithm display.
- **Step Helper** — Click any move in the algorithm display to jump the cube to the state after that move, or use the **◀ Step / Step ▶** buttons (and arrow keys) to walk through an algorithm one move at a time — forwards or backwards. Executing then resumes from the selected position.
- **Playback Controls** — Pause, resume, stop, and adjust animation speed (1× – 10×) at any time.
- **Scramble** — Generate and instantly apply a 20-move WCA-style random scramble.
- **Reset** — One click restores the current tutorial step's starting position (or the solved cube in Practice Mode).
- **Responsive Layout** — Adapts to smaller screens (sidebar moves below the cube on narrow viewports).
- **No build step required** — Runs directly in any modern browser that supports ES modules and import maps.

---

## Getting Started

### Prerequisites

A modern browser with ES module support (Chrome 89+, Firefox 108+, Edge 89+, Safari 15.4+). No Node.js, bundler, or build tool is needed.

### Running Locally

Because the project uses ES modules, it must be served over HTTP (not opened directly as a `file://` URL). Any static file server works, for example:

```bash
# Python 3
python -m http.server 8080

# Node.js (npx)
npx serve .

# VS Code
# Use the "Live Server" extension and click "Go Live"
```

Then open `http://localhost:8080` in your browser.

### Online Demo

Simply open `index.html` through any static hosting service (GitHub Pages, Netlify, Vercel, etc.) — no build step is required.

---

## How to Use

### Tutorial Mode (default)

1. Use **← Prev** and **Next →** to navigate between the six solve steps. Each step sets the cube up
   for itself: the cube arrives solved apart from the pieces that step's algorithm restores (they pulse
   with a cyan glow), so a single run of the algorithm completes it. The sidebar shows the setup
   sequence used to create the position.
2. Read the description and tip for each step.
3. Click **▶ Execute** to animate the step's algorithm on the cube — it should end solved.
   - Click **⏹ Stop** (the same button) to cancel the animation early.
   - Or study the algorithm one move at a time: click a move token to jump straight to the state after that move, and use **◀ Step / Step ▶** (or the arrow keys) to go forwards or backwards move by move. The **Move i / n** indicator shows your position, and **▶ Execute** plays the rest from wherever you are.
4. Use the **Pause / Play** button in the footer to pause or resume at any time.
5. Adjust the **Speed** slider to slow down or speed up the animations.
6. Click **↺ Reset** in the header to put the step's starting position back — handy for replaying the
   same case after the algorithm has solved it.
7. Click **🔀 Scramble** to apply a random 20-move scramble. This replaces the step's starting position;
   **↺ Reset** brings it back.

### Practice Mode

1. Click **🎯 Practice** in the header to switch to Practice Mode.
2. **Custom Algorithm** — Type a space-separated algorithm in the input box (e.g. `R U R' U'`) and press **▶** or hit `Enter` to execute it. Unrecognised tokens are skipped with a warning.
3. **Quick Algorithms** — Click any preset button to instantly load and execute that algorithm.

---

## Supported Notation

The visualizer uses standard **WCA (World Cube Association)** notation for the six outer faces plus the three slice moves:

| Move | Face / Slice | Direction |
|------|-------------|-----------|
| `R`  | Right face  | Clockwise |
| `L`  | Left face   | Clockwise |
| `U`  | Up face     | Clockwise |
| `D`  | Down face   | Clockwise |
| `F`  | Front face  | Clockwise |
| `B`  | Back face   | Clockwise |
| `M`  | Middle slice (like `L`) | Clockwise |
| `E`  | Equatorial slice (like `D`) | Clockwise |
| `S`  | Standing slice (like `F`) | Clockwise |

**Modifiers** can be appended to any move letter:

| Modifier | Meaning |
|----------|---------|
| *(none)* | Quarter-turn clockwise |
| `'`      | Quarter-turn counter-clockwise (prime) |
| `2`      | Half-turn (180°) |

Examples: `R'`, `U2`, `F2'` (equivalent to `F2`).

> **Note:** Wide moves (lowercase `r`, `u`, etc.) are not currently supported.

---

## Colour Scheme

The cube uses the standard Western colour scheme:

| Face  | Colour |
|-------|--------|
| Up    | White  |
| Down  | Yellow |
| Front | Red    |
| Back  | Orange |
| Right | Blue   |
| Left  | Green  |

---

## Project Structure

```
rubiks-algorithm-visualizer/
├── index.html        # Application shell — layout and import map
├── style.css         # All styling (dark theme, responsive, move-token colours)
└── js/
    ├── main.js       # Entry point — mounts RubiksCubeApp and UI
    ├── cube.js       # Three.js scene, 27-cubie geometry, animation engine
    ├── logic.js      # Move parsing, scramble generator, tutorial data, quick algorithms
    └── ui.js         # DOM bindings — sidebar, controls bar, token highlighting
```

### Key Classes & Exports

#### `RubiksCubeApp` (`js/cube.js`)

The core 3D engine. Instantiate it with a container element:

```js
const app = new RubiksCubeApp(document.getElementById('cube-container'));
```

**Public API:**

| Method / Property | Description |
|-------------------|-------------|
| `executeAlgorithm(moves)` | Queue an array of parsed move objects for animated execution |
| `applyMovesInstant(moves)` | Reset and instantly apply moves without animation (scrambles, tutorial setups) |
| `applyScramble(moves)` | Alias of `applyMovesInstant` |
| `getUnsolvedPositions()` | Positions of every cubie that is displaced or twisted out of its solved state |
| `highlightPieces(positions)` | Pulse a cyan glow on the cubies at the given `{x,y,z}` positions |
| `clearHighlight()` | Remove any active piece highlight |
| `reset()` | Return the cube to its solved state |
| `clearQueue()` | Stop and discard any queued animations |
| `setSpeed(n)` | Set animation speed — `n` from `1` (slow) to `10` (fast) |
| `pause()` / `resume()` | Pause or resume the animation loop |
| `togglePause()` | Toggle pause state; returns the new `isPaused` value |
| `isQueueEmpty()` | Returns `true` when no animation is in progress |
| `dispose()` | Tear down the Three.js renderer and release all GPU resources |
| `onMoveStart` | Callback `fn(moveIndex, total)` — fired when a move begins |
| `onMoveComplete` | Callback `fn(moveIndex, total)` — fired when a move finishes |
| `onQueueEmpty` | Callback `fn()` — fired once when the animation queue drains |

#### `logic.js` exports

| Export | Description |
|--------|-------------|
| `parseMove(token)` | Parse a single WCA token (e.g. `"R'"`) into a move object |
| `parseAlgorithm(str)` | Parse a space-separated algorithm string into an array of move objects |
| `invertToken(token)` | Invert a single token — `"R"` → `"R'"`, `"R2"` → `"R2"` |
| `invertAlgorithm(str)` | Invert a whole algorithm (reversed order, each move inverted) |
| `generateScramble(length?)` | Generate a random WCA-style scramble string (default length: 20) |
| `getStepSetup(step)` | The setup sequence for a tutorial step — its explicit `setup`, or the inverse of its algorithm |
| `TUTORIAL_STEPS` | Array of the six tutorial step objects |
| `QUICK_ALGORITHMS` | Array of built-in quick algorithm objects |

---

## Tech Stack

| Technology | Purpose |
|-----------|---------|
| [Three.js](https://threejs.org/) v0.169 | 3D rendering, geometry, lighting |
| [OrbitControls](https://threejs.org/docs/#examples/en/controls/OrbitControls) | Mouse/touch camera rotation |
| Vanilla ES Modules | No bundler — `importmap` resolves Three.js from CDN |
| CSS custom properties | Theming and move-token face colours |

---

## License

This project is licensed under the [MIT License](LICENSE).