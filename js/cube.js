/**
 * cube.js
 * Three.js scene setup, 27-cubie Rubik's cube, pivot-based rotation animation.
 */

import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';

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

    // Used to fire onQueueEmpty exactly once when the queue drains
    this._queueDrained = true;

    // ── Callbacks set by UI ──────────────────────────────────────────────────
    /** Called when a move begins:  fn(moveIndexInAlg, totalMovesInAlg) */
    this.onMoveStart    = null;
    /** Called when a move finishes: fn(moveIndexInAlg, totalMovesInAlg) */
    this.onMoveComplete = null;
    /** Called once when the animation queue empties */
    this.onQueueEmpty   = null;

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

  // ── Private: Cube geometry ──────────────────────────────────────────────────
  _buildCube() {
    // Dispose existing cubies.
    // All cubies share one geometry instance – dispose it only once.
    if (this.cubies.length > 0) {
      this.cubies[0].geometry.dispose();
      for (const c of this.cubies) {
        if (Array.isArray(c.material)) {
          c.material.forEach(m => m.dispose());
        }
        this.scene.remove(c);
      }
    }
    this.cubies = [];

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
    };

    this.isAnimating = true;

    if (this.onMoveStart) {
      this.onMoveStart(this._algMoveIndex, this._algMoveTotal);
    }
    this._algMoveIndex++;
  }

  // ── Private: Finish the current move animation ──────────────────────────────
  _finishCurrentMove() {
    if (!this.currentAnim) return;

    const { axis, totalAngle, currentAngle, cubies } = this.currentAnim;

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
      requestAnimationFrame(tick);

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
      this.renderer.render(this.scene, this.camera);
    };
    tick();
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
   * Queue an array of parsed move objects for animated execution.
   * Resets the per-algorithm move counter so the UI can highlight each move.
   */
  executeAlgorithm(moves) {
    this._algMoveIndex = 0;
    this._algMoveTotal = moves.length;
    this._queueDrained = false;
    moves.forEach(m => this.animQueue.push({ ...m }));
  }

  /**
   * Stop and clear the animation queue.
   */
  clearQueue() {
    this.animQueue = [];
    if (this.isAnimating && this.currentAnim) {
      this._finishCurrentMove();
    }
    this._queueDrained = true;
  }

  /**
   * Reset the cube to the solved state (clears queue and rebuilds geometry).
   */
  reset() {
    this.clearQueue();
    this._buildCube();
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
    if (this._resizeObserver) {
      this._resizeObserver.disconnect();
    }
    this._buildCube(); // disposes all cubie geometry/materials
    this.renderer.dispose();
  }

  pause()        { this.isPaused = true; }
  resume()       { this.isPaused = false; }
  togglePause()  { this.isPaused = !this.isPaused; return this.isPaused; }
  isQueueEmpty() { return !this.isAnimating && this.animQueue.length === 0; }
}
