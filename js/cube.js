/**
 * cube.js
 * Three.js scene setup, 27-cubie Rubik's cube, pivot-based rotation animation.
 */

import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { invertMove } from './logic.js';

// ── Colour palette ───────────────────────────────────────────────────────────
const COLOURS = {
  white:  0xf0f0f0,
  yellow: 0xffd600,
  red:    0xcc2200,
  orange: 0xff7700,
  green:  0x00991a,
  blue:   0x1155cc,
  black:  0x111111,
};

const CUBIE_SIZE = 0.92; // Slightly smaller than 1 unit to show gaps between pieces

// ── Material factory ─────────────────────────────────────────────────────────
// BoxGeometry face order: +X, -X, +Y, -Y, +Z, -Z
// Mapped to: Right(Blue), Left(Green), Up(White), Down(Yellow), Front(Red), Back(Orange)
function makeCubieMaterials(x, y, z) {
  const c = COLOURS;
  return [
    new THREE.MeshStandardMaterial({ color: x ===  1 ? c.blue   : c.black, roughness: 0.35, metalness: 0.05 }),
    new THREE.MeshStandardMaterial({ color: x === -1 ? c.green  : c.black, roughness: 0.35, metalness: 0.05 }),
    new THREE.MeshStandardMaterial({ color: y ===  1 ? c.white  : c.black, roughness: 0.35, metalness: 0.05 }),
    new THREE.MeshStandardMaterial({ color: y === -1 ? c.yellow : c.black, roughness: 0.35, metalness: 0.05 }),
    new THREE.MeshStandardMaterial({ color: z ===  1 ? c.red    : c.black, roughness: 0.35, metalness: 0.05 }),
    new THREE.MeshStandardMaterial({ color: z === -1 ? c.orange : c.black, roughness: 0.35, metalness: 0.05 }),
  ];
}

// ── RubiksCubeApp class ───────────────────────────────────────────────────────
export class RubiksCubeApp {
  /**
   * @param {HTMLElement} container  DOM element that will hold the canvas
   */
  constructor(container) {
    this.container = container;

    // Cubie meshes
    this.cubies = [];

    // Animation queue – each entry is a parsed move object { axis, layer, angle }
    this.animQueue = [];

    // Current animation state
    this.isAnimating   = false;
    this.isPaused      = false;
    this.animSpeed     = 5;   // 1–10
    this.pivot         = null;
    this.currentAnim   = null;

    // Move-index counters (for UI highlighting)
    this._algMoveIndex = 0;
    this._algMoveTotal = 0;

    // Loaded-algorithm session for the step helper.
    // moves     : parsed move objects of the loaded algorithm
    // cursor    : number of moves currently APPLIED to the cube (0..moves.length)
    // scheduled : cursor value after all queued-but-not-yet-applied moves land;
    //             step scheduling reads/advances this so rapid clicks can't
    //             desync the cursor from the cube state.
    this._session = null;

    // Used to fire onQueueEmpty exactly once when the queue drains
    this._queueDrained = true;

    // Render-loop state
    this._rafId    = null;
    this._disposed = false;

    // Piece highlight state
    this._highlightedCubies = [];
    this._highlightTime     = 0;

    // ── Callbacks set by UI ──────────────────────────────────────────────────
    /** Called when a move begins:  fn(moveIndexInAlg, totalMovesInAlg) */
    this.onMoveStart    = null;
    /** Called when a move finishes: fn(moveIndexInAlg, totalMovesInAlg) */
    this.onMoveComplete = null;
    /** Called once when the animation queue empties */
    this.onQueueEmpty   = null;
    /**
     * Called whenever the step-helper cursor changes: fn(cursor, total).
     * Fires with (-1, 0) when no algorithm session is loaded.
     */
    this.onCursorChange = null;

    this._setupScene();
    this._buildCube();
    this._startLoop();
  }

  // ── Private: Scene / renderer / controls ───────────────────────────────────
  _setupScene() {
    const w = this.container.clientWidth  || 800;
    const h = this.container.clientHeight || 600;

    // Renderer
    this.renderer = new THREE.WebGLRenderer({ antialias: true });
    this.renderer.setSize(w, h);
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type    = THREE.PCFSoftShadowMap;
    this.container.appendChild(this.renderer.domElement);

    // Scene
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x0f0f1a);

    // Camera
    this.camera = new THREE.PerspectiveCamera(45, w / h, 0.1, 100);
    this.camera.position.set(4.5, 3.5, 5.5);
    this.camera.lookAt(0, 0, 0);

    // Lighting
    const ambient = new THREE.AmbientLight(0xffffff, 0.65);
    this.scene.add(ambient);

    const key = new THREE.DirectionalLight(0xffffff, 0.9);
    key.position.set(6, 10, 8);
    key.castShadow = true;
    key.shadow.mapSize.set(2048, 2048);
    this.scene.add(key);

    const fill = new THREE.DirectionalLight(0x8899ff, 0.3);
    fill.position.set(-5, -4, -6);
    this.scene.add(fill);

    // OrbitControls
    this.controls = new OrbitControls(this.camera, this.renderer.domElement);
    this.controls.enableDamping  = true;
    this.controls.dampingFactor  = 0.08;
    this.controls.rotateSpeed    = 0.8;
    this.controls.minDistance    = 4;
    this.controls.maxDistance    = 14;
    this.controls.enablePan      = false;

    // Clock
    this.clock = new THREE.Clock();

    // Responsive resize – store observer so it can be disconnected if needed
    this._resizeObserver = new ResizeObserver(() => this._onResize());
    this._resizeObserver.observe(this.container);
  }

  _onResize() {
    const w = this.container.clientWidth;
    const h = this.container.clientHeight;
    if (w > 0 && h > 0) {
      this.camera.aspect = w / h;
      this.camera.updateProjectionMatrix();
      this.renderer.setSize(w, h);
    }
  }

  // ── Private: Dispose all cubie GPU resources (without rebuilding) ─────────────
  _disposeCubies() {
    if (this.cubies.length > 0) {
      // All cubies share one geometry instance – dispose it only once
      this.cubies[0].geometry.dispose();
      for (const c of this.cubies) {
        if (Array.isArray(c.material)) {
          c.material.forEach(m => m.dispose());
        }
        // Use the actual parent reference: mid-animation a cubie may be
        // parented under this.pivot rather than directly under the scene.
        c.parent?.remove(c);
      }
    }
    this.cubies = [];
  }

  // ── Private: Cube geometry ──────────────────────────────────────────────────
  _buildCube() {
    this._disposeCubies();

    // Create one shared geometry instance for all 27 cubies
    const geo = new THREE.BoxGeometry(CUBIE_SIZE, CUBIE_SIZE, CUBIE_SIZE);

    for (let x = -1; x <= 1; x++) {
      for (let y = -1; y <= 1; y++) {
        for (let z = -1; z <= 1; z++) {
          const mesh = new THREE.Mesh(geo, makeCubieMaterials(x, y, z));
          mesh.position.set(x, y, z);
          mesh.castShadow    = true;
          mesh.receiveShadow = true;
          this.scene.add(mesh);
          this.cubies.push(mesh);
        }
      }
    }
  }

  // ── Private: Layer selection ────────────────────────────────────────────────
  _cubiesOnLayer(axis, layer) {
    return this.cubies.filter(c => Math.round(c.position[axis]) === layer);
  }

  // ── Private: Start the next queued move ─────────────────────────────────────
  _startNextMove() {
    if (this.animQueue.length === 0) return;

    const move = this.animQueue.shift();
    const { axis, layer, angle } = move;

    // Create a pivot group at the origin
    this.pivot = new THREE.Group();
    this.scene.add(this.pivot);

    // Reparent the relevant cubies into the pivot (world transform preserved)
    const selected = this._cubiesOnLayer(axis, layer);
    selected.forEach(c => this.pivot.attach(c));

    this.currentAnim = {
      axis,
      totalAngle:   angle,
      currentAngle: 0,
      cubies:       selected,
      move,
    };

    this.isAnimating = true;

    // Session-tagged moves (steps, playFrom) carry their own algorithm index;
    // untagged moves fall back to the sequential counter.
    const idx = move._algIdx !== undefined ? move._algIdx : this._algMoveIndex;
    if (this.onMoveStart) {
      this.onMoveStart(idx, this._algMoveTotal);
    }
    this._algMoveIndex = idx + 1;
  }

  // ── Private: Finish the current move animation ──────────────────────────────
  _finishCurrentMove() {
    if (!this.currentAnim) return;

    const { axis, totalAngle, currentAngle, cubies, move } = this.currentAnim;

    // Snap pivot to the exact target angle
    this.pivot.rotation[axis] += (totalAngle - currentAngle);

    // Re-attach cubies to the scene (world transform preserved)
    cubies.forEach(c => {
      this.scene.attach(c);
      this._snapCubie(c);
    });

    this.scene.remove(this.pivot);
    this.pivot       = null;
    this.currentAnim = null;
    this.isAnimating = false;

    if (this.onMoveComplete) {
      this.onMoveComplete(this._algMoveIndex - 1, this._algMoveTotal);
    }

    this._commitSessionMove(move);
  }

  // ── Private: Session cursor bookkeeping ─────────────────────────────────────

  /** Advance the session cursor for a move that has just been applied. */
  _commitSessionMove(move) {
    if (this._session && move && move._cursorAfter !== undefined) {
      this._session.cursor = move._cursorAfter;
      this._emitCursor();
    }
  }

  _emitCursor() {
    if (!this.onCursorChange) return;
    if (this._session) {
      this.onCursorChange(this._session.cursor, this._session.moves.length);
    } else {
      this.onCursorChange(-1, 0);
    }
  }

  /**
   * Snap any in-flight animation and apply all queued moves instantly so the
   * cube state catches up with everything already scheduled.
   */
  _flushQueueInstant() {
    if (this.isAnimating && this.currentAnim) {
      this._finishCurrentMove();
    }
    while (this.animQueue.length > 0) {
      const m = this.animQueue.shift();
      this._applyInstant(m);
      this._commitSessionMove(m);
    }
    this._queueDrained = true;
  }

  // ── Private: Snap cubie to nearest valid grid position + rotation ───────────
  _snapCubie(cubie) {
    // Round position to nearest integer
    cubie.position.x = Math.round(cubie.position.x);
    cubie.position.y = Math.round(cubie.position.y);
    cubie.position.z = Math.round(cubie.position.z);

    // Snap rotation matrix: all valid Rubik's rotations have elements 0, ±1
    const m = new THREE.Matrix4().makeRotationFromQuaternion(cubie.quaternion);
    const e = m.elements;
    // Only touch the 3×3 rotation submatrix (column-major indices 0–2, 4–6, 8–10)
    for (const i of [0, 1, 2, 4, 5, 6, 8, 9, 10]) {
      e[i] = Math.round(e[i]);
    }
    cubie.quaternion.setFromRotationMatrix(m);
    cubie.rotation.setFromQuaternion(cubie.quaternion);
  }

  // ── Private: Render loop ────────────────────────────────────────────────────
  _startLoop() {
    const tick = () => {
      // Stop the loop if dispose() has been called
      if (this._disposed) return;

      this._rafId = requestAnimationFrame(tick);

      // Cap delta to avoid huge jumps after tab becomes visible again
      const delta = Math.min(this.clock.getDelta(), 0.1);

      if (!this.isPaused) {
        if (this.isAnimating && this.currentAnim) {
          this._stepAnimation(delta);
        } else if (!this.isAnimating && this.animQueue.length > 0) {
          this._queueDrained = false;
          this._startNextMove();
        } else if (!this.isAnimating && this.animQueue.length === 0 && !this._queueDrained) {
          this._queueDrained = true;
          if (this.onQueueEmpty) this.onQueueEmpty();
        }
      }

      this.controls.update();

      // Pulse the emissive intensity of any highlighted cubies
      if (this._highlightedCubies.length > 0) {
        this._highlightTime += delta;
        // Gentle 1 Hz pulse between 0.25 and 0.55 intensity
        const intensity = 0.4 + 0.15 * Math.sin(this._highlightTime * 2 * Math.PI);
        for (const c of this._highlightedCubies) {
          if (Array.isArray(c.material)) {
            c.material.forEach(m => { m.emissiveIntensity = intensity; });
          } else if (c.material) {
            c.material.emissiveIntensity = intensity;
          }
        }
      }

      this.renderer.render(this.scene, this.camera);
    };
    this._rafId = requestAnimationFrame(tick);
  }

  // ── Private: Advance the current animation by one frame ─────────────────────
  _stepAnimation(delta) {
    const { axis, totalAngle, currentAngle } = this.currentAnim;

    // Angular velocity: at speed=5 → π rad/s → 90° in 0.5 s
    const angVel   = (Math.PI * this.animSpeed) / 5;
    const remaining = totalAngle - currentAngle;
    const step      = Math.sign(remaining) * angVel * delta;

    if (Math.abs(step) >= Math.abs(remaining)) {
      // Overshoot → snap to final angle this frame
      this.pivot.rotation[axis] += remaining;
      this.currentAnim.currentAngle = totalAngle;
      this._finishCurrentMove();
    } else {
      this.pivot.rotation[axis]      += step;
      this.currentAnim.currentAngle  += step;
    }
  }

  // ── Private: Apply a single move instantly (no animation) ───────────────────
  _applyInstant(moveDef) {
    const { axis, layer, angle } = moveDef;
    const cubies = this._cubiesOnLayer(axis, layer);

    const pivot = new THREE.Group();
    this.scene.add(pivot);
    cubies.forEach(c => pivot.attach(c));
    pivot.rotation[axis] = angle;
    pivot.updateMatrixWorld(true);
    cubies.forEach(c => {
      this.scene.attach(c);
      this._snapCubie(c);
    });
    this.scene.remove(pivot);
  }

  // ── Public API ──────────────────────────────────────────────────────────────

  /**
   * Load an algorithm session for the step helper without playing it.
   * The cube's current state becomes the session's base state (cursor 0).
   * Any in-progress run is snapped to completion first.
   */
  loadAlgorithm(moves) {
    this._clearQueueSilently();
    this._session = {
      moves:     moves.map(m => ({ ...m })),
      cursor:    0,
      scheduled: 0,
    };
    this._algMoveIndex = 0;
    this._algMoveTotal = moves.length;
    this._emitCursor();
  }

  /** Drop the loaded algorithm session (cursor becomes meaningless). */
  clearAlgorithm() {
    if (!this._session) return;
    this._session = null;
    this._emitCursor();
  }

  /** Current session state as { cursor, total }, or null when none is loaded. */
  getAlgorithmState() {
    if (!this._session) return null;
    return { cursor: this._session.cursor, total: this._session.moves.length };
  }

  /**
   * Animate the next move of the loaded algorithm. Returns true if a move was
   * scheduled. Repeated calls queue up cleanly while an animation is running.
   */
  stepForward() {
    const s = this._session;
    if (!s || s.scheduled >= s.moves.length) return false;
    const idx = s.scheduled++;
    this._enqueueMove({ ...s.moves[idx], _algIdx: idx, _cursorAfter: idx + 1 });
    return true;
  }

  /**
   * Animate the inverse of the previous move of the loaded algorithm, so the
   * cube visually rewinds one step. Returns true if a move was scheduled.
   */
  stepBackward() {
    const s = this._session;
    if (!s || s.scheduled <= 0) return false;
    const idx = --s.scheduled;
    this._enqueueMove({ ...invertMove(s.moves[idx]), _algIdx: idx, _cursorAfter: idx });
    return true;
  }

  /**
   * Jump instantly to the state after `idx` moves of the loaded algorithm
   * (idx 0 = the session's base state). Applies the delta from the current
   * position — forward moves or inverses — without animation, so a scrambled
   * base state is preserved. Fires onQueueEmpty if a run was in progress.
   */
  jumpTo(idx) {
    const s = this._session;
    if (!s) return;
    const target = Math.max(0, Math.min(s.moves.length, Math.round(idx)));

    const wasRunning = this.animQueue.length > 0 || (this.isAnimating && this.currentAnim);
    // Catch the cube up with everything already scheduled before computing
    // the delta, so cursor and cube state agree.
    this._flushQueueInstant();

    while (s.cursor < target) {
      this._applyInstant(s.moves[s.cursor]);
      s.cursor++;
    }
    while (s.cursor > target) {
      this._applyInstant(invertMove(s.moves[s.cursor - 1]));
      s.cursor--;
    }
    s.scheduled = target;
    this._algMoveIndex = target;

    if (wasRunning && this.onQueueEmpty) this.onQueueEmpty();
    this._emitCursor();
  }

  /**
   * Jump to position `idx`, then play the rest of the algorithm animated.
   * Returns true if any moves were queued (false when already at the end).
   */
  playFrom(idx) {
    const s = this._session;
    if (!s) return false;
    this.jumpTo(idx);

    const len = s.moves.length;
    if (s.cursor >= len) return false;
    for (let i = s.cursor; i < len; i++) {
      this._enqueueMove({ ...s.moves[i], _algIdx: i, _cursorAfter: i + 1 });
    }
    s.scheduled = len;
    return true;
  }

  /** Internal: push a move onto the animation queue. */
  _enqueueMove(move) {
    this._queueDrained = false;
    this.animQueue.push(move);
  }

  /**
   * Load `moves` as the current algorithm session and play it from the start.
   * Any in-progress move is snapped to completion first (via loadAlgorithm)
   * so that onMoveComplete fires with the old algorithm's index before counters
   * are reset — preventing a -1 index from reaching UI callbacks.
   * An empty move array is treated as a no-op (no state changes, no callbacks).
   */
  executeAlgorithm(moves) {
    if (moves.length === 0) return;
    this.loadAlgorithm(moves);
    this.playFrom(0);
  }

  /**
   * Stop and clear the animation queue.
   * Fires onQueueEmpty when the queue/animation was actually running.
   */
  clearQueue() {
    const wasRunning = this.animQueue.length > 0 || (this.isAnimating && this.currentAnim);
    this._clearQueueSilently();
    if (wasRunning && this.onQueueEmpty) this.onQueueEmpty();
  }

  /**
   * Internal: clear queue + snap animation without firing onQueueEmpty.
   * Used by executeAlgorithm (which is about to start a new run) and dispose.
   */
  _clearQueueSilently() {
    this.animQueue = [];
    if (this.isAnimating && this.currentAnim) {
      this._finishCurrentMove();
    }
    this._queueDrained = true;
    // Queued-but-unapplied session moves were just dropped: pull the
    // scheduling pointer back to the moves that actually landed.
    if (this._session) {
      this._session.scheduled = this._session.cursor;
    }
  }

  /**
   * Reset the cube to the solved state (clears queue and rebuilds geometry).
   */
  reset() {
    this.clearQueue();
    this.clearHighlight();
    this._buildCube();
    // The cube state changed out from under any loaded session – invalidate it
    // so a stale cursor can never be applied.
    this.clearAlgorithm();
  }

  /**
   * Apply a scramble (array of parsed moves) instantly, then display result.
   * Resets the cube first.
   */
  applyScramble(moves) {
    this.reset();
    for (const m of moves) {
      this._applyInstant(m);
    }
  }

  /** Set animation speed (1 = slow … 10 = fast). */
  setSpeed(speed) {
    this.animSpeed = Math.max(1, Math.min(10, speed));
  }

  /** Disconnect the resize observer and free WebGL resources. */
  dispose() {
    // Signal the render loop to stop before the next frame
    this._disposed = true;
    if (this._rafId !== null) {
      cancelAnimationFrame(this._rafId);
      this._rafId = null;
    }
    // Finish / cancel any in-progress animation so cubies are re-parented back
    // to the scene before we dispose them.  Temporarily null the onMoveComplete
    // callback so that _finishCurrentMove() (called inside _clearQueueSilently)
    // cannot fire into already-torn-down UI state.
    const savedOnMoveComplete = this.onMoveComplete;
    this.onMoveComplete = null;
    try {
      this._clearQueueSilently();
    } finally {
      this.onMoveComplete = savedOnMoveComplete;
    }
    // Belt-and-suspenders: remove pivot group if it somehow still exists
    if (this.pivot) {
      this.scene.remove(this.pivot);
      this.pivot = null;
    }
    if (this._resizeObserver) {
      this._resizeObserver.disconnect();
    }
    this.clearHighlight();
    this._disposeCubies();
    this.controls.dispose();
    this.renderer.dispose();
    if (this.renderer.domElement.parentNode) {
      this.renderer.domElement.parentNode.removeChild(this.renderer.domElement);
    }
  }

  pause()        { this.isPaused = true; }
  resume()       { this.isPaused = false; }
  togglePause()  { this.isPaused = !this.isPaused; return this.isPaused; }
  isQueueEmpty() { return !this.isAnimating && this.animQueue.length === 0; }

  /**
   * Highlight the cubies currently located at the given positions.
   * Each position is an {x, y, z} object with integer coordinates (-1, 0, 1).
   * The highlight pulses (animated emissive glow) until clearHighlight() is called.
   */
  highlightPieces(positions) {
    this.clearHighlight();
    if (!Array.isArray(positions) || positions.length === 0) return;

    const validPositions = positions
      .filter(p =>
        p &&
        typeof p === 'object' &&
        Number.isFinite(p.x) &&
        Number.isFinite(p.y) &&
        Number.isFinite(p.z)
      )
      .map(p => ({
        x: Math.round(p.x),
        y: Math.round(p.y),
        z: Math.round(p.z),
      }));

    if (validPositions.length === 0) return;

    this._highlightTime = 0;
    for (const cubie of this.cubies) {
      const cx = Math.round(cubie.position.x);
      const cy = Math.round(cubie.position.y);
      const cz = Math.round(cubie.position.z);
      if (validPositions.some(p => p.x === cx && p.y === cy && p.z === cz)) {
        if (Array.isArray(cubie.material)) {
          cubie.material.forEach(m => {
            m.emissive.setHex(0x00ddff);
            m.emissiveIntensity = 0.4;
          });
        } else if (cubie.material) {
          cubie.material.emissive.setHex(0x00ddff);
          cubie.material.emissiveIntensity = 0.4;
        }
        this._highlightedCubies.push(cubie);
      }
    }
  }

  /**
   * Remove any active piece highlight applied by highlightPieces().
   */
  clearHighlight() {
    for (const cubie of this._highlightedCubies) {
      if (Array.isArray(cubie.material)) {
        cubie.material.forEach(m => {
          m.emissive.setHex(0x000000);
          m.emissiveIntensity = 0;
        });
      } else if (cubie.material) {
        cubie.material.emissive.setHex(0x000000);
        cubie.material.emissiveIntensity = 0;
      }
    }
    this._highlightedCubies = [];
  }
}
