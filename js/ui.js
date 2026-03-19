/**
 * ui.js
 * DOM manipulation – sidebar step display, practice panel, control bar bindings.
 */

import {
  parseMove,
  parseAlgorithm,
  generateScramble,
  TUTORIAL_STEPS,
  QUICK_ALGORITHMS,
} from './logic.js';

// ── Move-token colour helpers (delegate to CSS variables – single source of truth) ─
const FACE_LETTERS = new Set(['R', 'L', 'U', 'D', 'F', 'B']);

function tokenBg(token) {
  const face = token[0].toUpperCase();
  return FACE_LETTERS.has(face) ? `var(--col-${face})` : 'var(--col-slice)';
}
function tokenFg(token) {
  const face = token[0].toUpperCase();
  return FACE_LETTERS.has(face) ? `var(--col-${face}-fg)` : 'var(--col-slice-fg)';
}

// ── HTML escape helper (prevents XSS when rendering user-supplied tokens) ─────
function escapeHtml(str) {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function makeTokenHTML(token, index, state /* 'idle'|'active'|'done' */ = 'idle') {
  const bg  = tokenBg(token);
  const fg  = tokenFg(token);
  const cls = state === 'active' ? ' active' : state === 'done' ? ' done' : '';
  return `<span class="move-token${cls}"
                data-idx="${index}"
                data-token="${escapeHtml(token)}"
                style="background:${bg};color:${fg};">${escapeHtml(token)}</span>`;
}

// ── UI class ──────────────────────────────────────────────────────────────────
export class UI {
  constructor(cubeApp) {
    this.cube          = cubeApp;
    this.stepIndex     = 0;
    this.mode          = 'tutorial';
    this.isExecuting   = false;
    this.activeMoveIdx = -1;
    this.algTokens     = [];   // raw token strings for current algorithm

    this._wireCallbacks();
    this._wireControls();
    this._renderTutorialStep();
    this._renderQuickAlgs();
    this._updateStatusIdle();
  }

  // ── Cube event callbacks ────────────────────────────────────────────────────
  _wireCallbacks() {
    this.cube.onMoveStart = (idx /*, total*/) => {
      this.activeMoveIdx = idx;
      this._updateTokenHighlight(idx);
    };

    this.cube.onMoveComplete = (idx /*, total*/) => {
      // Token "done" state is handled via activeMoveIdx in _updateTokenHighlight
    };

    this.cube.onQueueEmpty = () => {
      this.isExecuting   = false;
      this.activeMoveIdx = -1;
      // Mark all tokens as done so the user can see the completed sequence
      this._updateTokenHighlight(this.algTokens.length);
      this._setExecuteBtn(false);
      this._updateStatusDone();
    };
  }

  // ── DOM event bindings ──────────────────────────────────────────────────────
  _wireControls() {
    // Mode toggles
    this._on('btn-tutorial', 'click', () => this._setMode('tutorial'));
    this._on('btn-practice',  'click', () => this._setMode('practice'));

    // Header buttons
    this._on('btn-reset', 'click', () => {
      this.cube.reset();
      this._clearExecutionState();
      this._hideBanner();
    });

    this._on('btn-scramble', 'click', () => {
      const scramble = generateScramble(20);
      const moves    = parseAlgorithm(scramble);
      this.cube.applyScramble(moves);
      this._showBanner(scramble);
      this._clearExecutionState();
    });

    // Tutorial navigation
    this._on('btn-prev-step', 'click', () => this._changeStep(-1));
    this._on('btn-next-step', 'click', () => this._changeStep(+1));

    this._on('btn-execute', 'click', () => {
      if (this.isExecuting) {
        this.cube.clearQueue();
        this._clearExecutionState();
      } else {
        const step  = TUTORIAL_STEPS[this.stepIndex];
        const moves = parseAlgorithm(step.algorithm);
        if (moves.length === 0) return;
        this._prepareForExecution();
        this.algTokens = step.algorithm.trim().split(/\s+/);
        this._renderAlgorithmTokens('algorithm-display', this.algTokens, 0);
        this.cube.executeAlgorithm(moves);
        this._setExecuteBtn(true);
        this._updateStatusRunning(step.algorithm);
      }
    });

    // Controls bar
    this._on('btn-play-pause', 'click', () => {
      const paused = this.cube.togglePause();
      document.getElementById('btn-play-pause').textContent = paused ? '▶ Play' : '⏸ Pause';
      if (paused) {
        this._updateStatus('status-paused', '⏸ Paused', '');
      } else if (this.isExecuting) {
        this._updateStatusRunning();
      } else {
        // Unpausing when no execution is in progress → restore idle state
        this._updateStatusIdle();
      }
    });

    this._on('btn-stop', 'click', () => {
      this.cube.clearQueue();
      this._clearExecutionState();
    });

    const slider = document.getElementById('speed-slider');
    const label  = document.getElementById('speed-label');
    slider.addEventListener('input', () => {
      const v = parseInt(slider.value, 10);
      label.textContent = v + '×';
      this.cube.setSpeed(v);
    });

    // Practice – custom algorithm
    this._on('btn-execute-custom', 'click', () => this._executeCustom());
    document.getElementById('custom-algorithm').addEventListener('keydown', e => {
      if (e.key === 'Enter') this._executeCustom();
    });
  }

  // ── Tutorial rendering ──────────────────────────────────────────────────────
  _renderTutorialStep() {
    const step  = TUTORIAL_STEPS[this.stepIndex];
    const total = TUTORIAL_STEPS.length;

    // Progress bar
    const pct = ((this.stepIndex + 1) / total) * 100;
    document.getElementById('progress-fill').style.width = pct + '%';

    // Stage indicators
    this._renderStageIndicators();

    // Step meta
    document.getElementById('step-badge').textContent       = `Step ${step.id} / ${total}`;
    document.getElementById('step-title').textContent       = step.title;
    document.getElementById('step-stage-label').textContent = step.stage;
    document.getElementById('step-description').textContent = step.description;
    document.getElementById('step-tip').textContent         = step.tip;

    // Algorithm tokens
    this.algTokens = step.algorithm.trim().split(/\s+/);
    this._renderAlgorithmTokens('algorithm-display', this.algTokens, -1);

    // Navigation buttons
    document.getElementById('btn-prev-step').disabled = this.stepIndex === 0;
    document.getElementById('btn-next-step').disabled = this.stepIndex === total - 1;
  }

  _renderStageIndicators() {
    const stages        = [...new Set(TUTORIAL_STEPS.map(s => s.stage))];
    const currentStage  = TUTORIAL_STEPS[this.stepIndex].stage;
    const doneStages    = new Set(
      TUTORIAL_STEPS.slice(0, this.stepIndex).map(s => s.stage)
    );

    const container = document.getElementById('stage-indicators');
    container.innerHTML = stages.map(stage => {
      let cls = 'stage-indicator';
      if (stage === currentStage)    cls += ' active';
      else if (doneStages.has(stage)) cls += ' done';
      return `<span class="${cls}">${stage}</span>`;
    }).join('');
  }

  _renderAlgorithmTokens(containerId, tokens, activeIdx) {
    const el = document.getElementById(containerId);
    if (!el) return;
    el.innerHTML = tokens.map((tok, i) => {
      const state = i === activeIdx ? 'active' : (i < activeIdx ? 'done' : 'idle');
      return makeTokenHTML(tok, i, state);
    }).join('');
  }

  _updateTokenHighlight(activeIdx) {
    const tokens = this.algTokens;
    if (!tokens || tokens.length === 0) return;

    const containerId = this.mode === 'tutorial' ? 'algorithm-display' : 'custom-alg-display';
    const container   = document.getElementById(containerId);
    if (!container) return;

    const nodes = container.querySelectorAll('.move-token');

    // Fall back to a full re-render if the DOM doesn't match the current token list
    // — either different length, or same length but different token text/order
    // (can happen after a mode switch where the hidden panel has stale content).
    if (nodes.length !== tokens.length) {
      this._renderAlgorithmTokens(containerId, tokens, activeIdx);
      return;
    }
    const nodeArray = Array.from(nodes);
    const identityMismatch = nodeArray.some((n, i) => (n.dataset.token ?? '') !== tokens[i]);
    if (identityMismatch) {
      this._renderAlgorithmTokens(containerId, tokens, activeIdx);
      return;
    }

    // Incremental update: only touch the nodes that need to change class.
    if (activeIdx >= tokens.length) {
      // All tokens are now done.
      nodeArray.forEach(n => { n.classList.remove('active'); n.classList.add('done'); });
    } else if (activeIdx < 0) {
      // All tokens reset to idle.
      nodeArray.forEach(n => { n.classList.remove('active', 'done'); });
    } else {
      // Mark the newly active token.
      nodeArray[activeIdx].classList.remove('done');
      nodeArray[activeIdx].classList.add('active');
      // Mark the previously active token as done.
      if (activeIdx > 0) {
        nodeArray[activeIdx - 1].classList.remove('active');
        nodeArray[activeIdx - 1].classList.add('done');
      }
    }
  }

  // ── Tutorial step navigation ─────────────────────────────────────────────────
  _changeStep(delta) {
    const next = this.stepIndex + delta;
    if (next < 0 || next >= TUTORIAL_STEPS.length) return;

    this.cube.clearQueue();
    this._clearExecutionState();
    this.stepIndex = next;
    this._renderTutorialStep();
    this._updateStatusIdle();
  }

  // ── Practice panel ──────────────────────────────────────────────────────────
  _renderQuickAlgs() {
    const container = document.getElementById('quick-algs');
    container.innerHTML = QUICK_ALGORITHMS.map(qa => `
      <button class="quick-alg-btn" data-alg="${qa.alg}">
        <span class="quick-alg-name">${qa.name}</span>
        <span class="quick-alg-seq">${qa.alg}</span>
      </button>`
    ).join('');

    container.querySelectorAll('.quick-alg-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const alg   = btn.dataset.alg;
        const moves = parseAlgorithm(alg);
        if (moves.length === 0) return;

        this._prepareForExecution();
        document.getElementById('custom-algorithm').value = alg;
        this.algTokens = alg.trim().split(/\s+/);
        this._renderAlgorithmTokens('custom-alg-display', this.algTokens, 0);
        this.cube.executeAlgorithm(moves);
        this._setExecuteBtn(true);
        this._updateStatusRunning(alg);
      });
    });
  }

  _executeCustom() {
    const input = document.getElementById('custom-algorithm').value.trim();
    if (!input) return;

    // Parse each token individually so that algTokens exactly mirrors the
    // moves the cube will execute.  Collect rejected tokens to warn the user.
    const rawTokens    = input.split(/\s+/).filter(Boolean);
    const validPairs   = [];
    const rejectedToks = [];
    for (const t of rawTokens) {
      const m = parseMove(t);
      if (m !== null) {
        validPairs.push([t, m]);
      } else {
        rejectedToks.push(t);
      }
    }

    // Surface a warning for any unrecognised tokens.
    const warningEl = document.getElementById('alg-warning');
    if (warningEl) {
      if (rejectedToks.length > 0) {
        const label = rejectedToks.length > 1 ? 'tokens' : 'token';
        warningEl.textContent = `⚠ Skipped unrecognised ${label}: ${rejectedToks.join(', ')}`;
      } else {
        warningEl.textContent = '';
      }
    }

    if (validPairs.length === 0) return;

    this._prepareForExecution();
    this.algTokens  = validPairs.map(([t]) => t);
    const moves     = validPairs.map(([, m]) => m);
    const filteredAlg = this.algTokens.join(' ');
    this._renderAlgorithmTokens('custom-alg-display', this.algTokens, 0);
    this.cube.executeAlgorithm(moves);
    this._setExecuteBtn(true);
    this._updateStatusRunning(filteredAlg);
  }

  // ── Mode switching ──────────────────────────────────────────────────────────
  _setMode(mode) {
    this.mode = mode;
    const tutBtn = document.getElementById('btn-tutorial');
    const pracBtn = document.getElementById('btn-practice');
    tutBtn.classList.toggle('active', mode === 'tutorial');
    tutBtn.setAttribute('aria-pressed', String(mode === 'tutorial'));
    pracBtn.classList.toggle('active', mode === 'practice');
    pracBtn.setAttribute('aria-pressed', String(mode === 'practice'));
    document.getElementById('tutorial-panel').style.display = mode === 'tutorial' ? 'flex' : 'none';
    document.getElementById('practice-panel').style.display = mode === 'practice' ? 'flex' : 'none';

    // Re-render token highlights into the now-visible panel only when
    // mid-execution — avoids copying tutorial tokens into #custom-alg-display
    // (or practice tokens into #algorithm-display) while idle.
    if (this.isExecuting) {
      this._updateTokenHighlight(this.activeMoveIdx);
    }
  }

  // ── Execute button state ────────────────────────────────────────────────────
  _setExecuteBtn(running) {
    const btn = document.getElementById('btn-execute');
    if (running) {
      btn.textContent = '⏹ Stop';
      btn.classList.add('stop-mode');
    } else {
      btn.textContent = '▶ Execute';
      btn.classList.remove('stop-mode');
    }
  }

  // ── Status display ──────────────────────────────────────────────────────────
  _updateStatus(cls, text, title = '') {
    const el = document.getElementById('status-display');
    el.className   = cls;
    el.textContent = text;
    el.title       = title;
  }
  _updateStatusIdle()            { this._updateStatus('status-idle',    'Ready', ''); }
  _updateStatusRunning(alg = '') { this._updateStatus('status-running', alg ? `▶ ${alg}` : '▶ Running…', alg); }
  _updateStatusDone()            { this._updateStatus('status-done',    '✓ Done', ''); }

  // ── Scramble banner ──────────────────────────────────────────────────────────
  _showBanner(scramble) {
    const banner = document.getElementById('scramble-banner');
    const textEl = document.getElementById('scramble-text');
    textEl.textContent = '';
    const strong = document.createElement('strong');
    strong.textContent = 'Scramble: ';
    textEl.appendChild(strong);
    textEl.appendChild(document.createTextNode(scramble));
    banner.style.display = 'block';
  }
  _hideBanner() {
    document.getElementById('scramble-banner').style.display = 'none';
  }

  // ── Helpers ─────────────────────────────────────────────────────────────────

  /**
   * Called before starting any new algorithm execution.
   * Stops any in-progress run, resets UI execution state, and auto-resumes
   * the animation loop if the cube is currently paused.
   */
  _prepareForExecution() {
    // Reset move index before clearing so any in-flight onMoveComplete
    // callback sees index -1 and does not try to highlight stale tokens
    this.activeMoveIdx = -1;
    this.cube.clearQueue();
    this.isExecuting   = true;
    this.activeMoveIdx = 0;
    // Auto-resume if paused so the animation plays immediately
    if (this.cube.isPaused) {
      this.cube.resume();
      document.getElementById('btn-play-pause').textContent = '⏸ Pause';
    }
  }

  _clearExecutionState() {
    this.isExecuting   = false;
    this.activeMoveIdx = -1;
    if (this.mode === 'tutorial') {
      const alg = TUTORIAL_STEPS[this.stepIndex]?.algorithm;
      this.algTokens = alg ? alg.trim().split(/\s+/) : [];
      this._renderAlgorithmTokens('algorithm-display', this.algTokens, -1);
    } else {
      this.algTokens = [];
      document.getElementById('custom-alg-display').innerHTML = '';
      const warningEl = document.getElementById('alg-warning');
      if (warningEl) warningEl.textContent = '';
    }
    this._setExecuteBtn(false);
    this._updateStatusIdle();
  }

  _on(id, event, handler) {
    const el = document.getElementById(id);
    if (el) el.addEventListener(event, handler);
  }
}
