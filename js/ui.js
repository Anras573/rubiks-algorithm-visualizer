/**
 * ui.js
 * DOM manipulation – sidebar step display, practice panel, control bar bindings.
 */

import {
  parseMove,
  parseAlgorithm,
  generateScramble,
  getStepSetup,
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

function makeTokenHTML(token, index, total, state /* 'idle'|'active'|'done' */ = 'idle', isCurrent = false) {
  const bg  = tokenBg(token);
  const fg  = tokenFg(token);
  let cls = state === 'active' ? ' active' : state === 'done' ? ' done' : '';
  if (isCurrent) cls += ' current';
  const label = `Go to move ${index + 1} of ${total}: ${token}`;
  return `<button type="button" class="move-token${cls}"
                data-idx="${index}"
                data-token="${escapeHtml(token)}"
                aria-label="${escapeHtml(label)}"
                style="background:${bg};color:${fg};">${escapeHtml(token)}</button>`;
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
    this._cursor       = -1;   // step-helper cursor (-1 = no session loaded)
    this._cursorTotal  = 0;
    // Positions of the pieces left unsolved by the current step's setup.
    // null → the setup position is no longer on the cube (e.g. after a
    // scramble), so the step's static `pieces` list is highlighted instead.
    this._stepHighlight = null;

    this._wireCallbacks();
    this._wireControls();
    this._updateResetBtnTitle();
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
      const st = this.cube.getAlgorithmState();
      if (st && this.algTokens.length === st.total) {
        // A step-helper session is loaded – show the cursor position rather
        // than blanket-marking every token as done.
        this._renderCursorTokens();
        if (st.cursor >= st.total && st.total > 0) {
          this._updateStatusDone();
        } else {
          this._updateStatusIdle();
        }
      } else {
        // Mark all tokens as done so the user can see the completed sequence
        this._updateTokenHighlight(this.algTokens.length);
        this._updateStatusDone();
      }
      this._setExecuteBtn(false);
      // Re-apply the tutorial step's highlight now that execution has ended or been stopped
      if (this.mode === 'tutorial') {
        this._applyTutorialHighlight();
      }
    };

    this.cube.onCursorChange = (cursor, total) => {
      this._cursor      = cursor;
      this._cursorTotal = total;
      this._updateStepControls();
      // During animated playback the onMoveStart highlight drives the token
      // display; only take over rendering when idle or single-stepping.
      if (!this.isExecuting) {
        this._renderCursorTokens();
      }
    };
  }

  // ── DOM event bindings ──────────────────────────────────────────────────────
  _wireControls() {
    // Mode toggles
    this._on('btn-tutorial', 'click', () => this._setMode('tutorial'));
    this._on('btn-practice',  'click', () => this._setMode('practice'));

    // Header buttons
    this._on('btn-reset', 'click', () => {
      // In tutorial mode "reset" means "back to the start of this step", i.e.
      // the setup position — not the solved cube, which would leave the step's
      // algorithm with nothing to do.
      if (this.mode === 'tutorial') {
        this._applyStepSetup();
      } else {
        this.cube.reset();
      }
      this._clearExecutionState();
      this._reloadTutorialSession();
      this._hideBanner();
    });

    this._on('btn-scramble', 'click', () => {
      const scramble = generateScramble(20);
      const moves    = parseAlgorithm(scramble);
      this.cube.applyScramble(moves);
      this._showBanner(scramble);
      // The step's setup position is gone – fall back to the static piece list
      // and stop claiming the cube is set up for the step. ↺ Reset brings both
      // back.
      this._stepHighlight = null;
      this._renderSetupDisplay('');
      this._clearExecutionState();
      this._reloadTutorialSession();
    });

    // Tutorial navigation
    this._on('btn-prev-step', 'click', () => this._changeStep(-1));
    this._on('btn-next-step', 'click', () => this._changeStep(+1));

    this._on('btn-execute', 'click', () => {
      if (this.isExecuting) {
        this.cube.clearQueue();
        this._clearExecutionState();
      } else {
        const step   = TUTORIAL_STEPS[this.stepIndex];
        const tokens = step.algorithm.trim().split(/\s+/);
        const st     = this.cube.getAlgorithmState();

        // "Play from here": when the user has selected a mid-algorithm step,
        // resume from the cursor instead of restarting from the beginning.
        const resumeAt = (st && st.total === tokens.length &&
                          this.algTokens.join(' ') === tokens.join(' ') &&
                          st.cursor > 0 && st.cursor < st.total)
          ? st.cursor
          : null;

        this.algTokens = tokens;
        if (resumeAt !== null) {
          this._prepareForExecution();
          this._renderAlgorithmTokens('algorithm-display', this.algTokens, resumeAt);
          this.cube.playFrom(resumeAt);
        } else {
          const moves = parseAlgorithm(step.algorithm);
          if (moves.length === 0) return;
          this._prepareForExecution();
          this._renderAlgorithmTokens('algorithm-display', this.algTokens, 0);
          this.cube.executeAlgorithm(moves);
        }
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

    // Step helper – step buttons (one pair per panel, wired by class)
    document.querySelectorAll('.step-back').forEach(btn =>
      btn.addEventListener('click', () => this._step(-1)));
    document.querySelectorAll('.step-fwd').forEach(btn =>
      btn.addEventListener('click', () => this._step(+1)));

    // Step helper – clickable move tokens (delegated: tokens are re-rendered
    // via innerHTML, so per-token listeners would be lost)
    for (const id of ['algorithm-display', 'custom-alg-display']) {
      const el = document.getElementById(id);
      if (!el) continue;
      el.addEventListener('click', e => {
        const token = e.target.closest('.move-token');
        if (!token || !el.contains(token)) return;
        const idx = parseInt(token.dataset.idx, 10);
        if (Number.isInteger(idx)) this._selectStep(idx + 1);
      });
    }

    // Step helper – arrow keys step through the algorithm when focus is on
    // the algorithm display or the step controls (not hijacked globally)
    const stepKeyHandler = e => {
      if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return;
      e.preventDefault();
      this._step(e.key === 'ArrowRight' ? +1 : -1);
    };
    document.querySelectorAll('#algorithm-display, #custom-alg-display, .step-controls')
      .forEach(el => el.addEventListener('keydown', stepKeyHandler));
  }

  // ── Step helper ─────────────────────────────────────────────────────────────

  /** Step the loaded algorithm one move forward (+1) or backward (-1). */
  _step(dir) {
    if (!this._sessionMatchesTokens()) return;
    this._autoResume();
    if (dir > 0) this.cube.stepForward();
    else         this.cube.stepBackward();
  }

  /** Jump to the state after `target` moves of the loaded algorithm. */
  _selectStep(target) {
    if (!this._sessionMatchesTokens()) return;
    this._autoResume();
    this.cube.jumpTo(target);
  }

  /** True when a session is loaded and mirrors the rendered token list. */
  _sessionMatchesTokens() {
    const st = this.cube.getAlgorithmState();
    return !!st && st.total > 0 && st.total === this.algTokens.length;
  }

  /** Resume the animation loop if paused so a scheduled step plays at once. */
  _autoResume() {
    if (this.cube.isPaused) {
      this.cube.resume();
      const btn = document.getElementById('btn-play-pause');
      if (btn) btn.textContent = '⏸ Pause';
    }
  }

  _updateStepControls() {
    const cursor = this._cursor;
    const total  = this._cursorTotal;
    const hasSession = cursor >= 0 && total > 0;
    document.querySelectorAll('.step-back').forEach(btn => {
      btn.disabled = !hasSession || cursor <= 0;
    });
    document.querySelectorAll('.step-fwd').forEach(btn => {
      btn.disabled = !hasSession || cursor >= total;
    });
    document.querySelectorAll('.step-pos').forEach(el => {
      el.textContent = hasSession ? `Move ${cursor} / ${total}` : '–';
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

    // Put the cube into this step's starting position: solved except for the
    // pieces the step's algorithm puts back.
    this._applyStepSetup();
    this._hideBanner();

    // Algorithm tokens
    this.algTokens = step.algorithm.trim().split(/\s+/);
    this._renderAlgorithmTokens('algorithm-display', this.algTokens, -1);

    // Load the step's algorithm as a step-helper session (cursor 0, based on
    // the cube's current state) so tokens and step buttons work immediately.
    this.cube.loadAlgorithm(parseAlgorithm(step.algorithm));

    // Navigation buttons
    document.getElementById('btn-prev-step').disabled = this.stepIndex === 0;
    document.getElementById('btn-next-step').disabled = this.stepIndex === total - 1;

    this._applyTutorialHighlight();
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
      return makeTokenHTML(tok, i, tokens.length, state);
    }).join('');
  }

  /**
   * Render the tokens of the active panel from the step-helper cursor:
   * applied moves are 'done', the last applied move carries the 'current'
   * marker, and everything after the cursor is 'idle'.
   */
  _renderCursorTokens() {
    const tokens = this.algTokens;
    if (this._cursor < 0 || !tokens || tokens.length !== this._cursorTotal) return;
    const containerId = this.mode === 'tutorial' ? 'algorithm-display' : 'custom-alg-display';
    const el = document.getElementById(containerId);
    if (!el) return;
    // Re-rendering destroys the focused token; remember it so keyboard users
    // don't lose their place mid-stepping.
    const focused = document.activeElement;
    const focusedIdx = (focused && el.contains(focused) && focused.classList.contains('move-token'))
      ? focused.dataset.idx
      : null;
    el.innerHTML = tokens.map((tok, i) => {
      const state = i < this._cursor ? 'done' : 'idle';
      return makeTokenHTML(tok, i, tokens.length, state, i === this._cursor - 1);
    }).join('');
    if (focusedIdx !== null) {
      el.querySelector(`.move-token[data-idx="${focusedIdx}"]`)?.focus();
    }
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
      <button class="quick-alg-btn" data-alg="${qa.alg}" data-pieces="${escapeHtml(JSON.stringify(qa.pieces || []))}">
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

        // Highlight the target piece(s) for this algorithm on the 3-D cube
        // after any in-progress move has been snapped to a stable state.
        let pieces = [];
        if (btn.dataset.pieces) {
          try {
            pieces = JSON.parse(btn.dataset.pieces);
          } catch {
            pieces = [];
          }
        }
        this.cube.highlightPieces(pieces);
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

    const tokens = validPairs.map(([t]) => t);
    const st     = this.cube.getAlgorithmState();
    // "Play from here": resume from a selected mid-algorithm step when the
    // input still matches the loaded session.
    const resumeAt = (st && st.total === tokens.length &&
                      this.algTokens.join(' ') === tokens.join(' ') &&
                      st.cursor > 0 && st.cursor < st.total)
      ? st.cursor
      : null;

    this.cube.clearHighlight();
    this._prepareForExecution();
    this.algTokens  = tokens;
    const filteredAlg = this.algTokens.join(' ');
    this._renderAlgorithmTokens('custom-alg-display', this.algTokens, resumeAt ?? 0);
    if (resumeAt !== null) {
      this.cube.playFrom(resumeAt);
    } else {
      this.cube.executeAlgorithm(validPairs.map(([, m]) => m));
    }
    this._setExecuteBtn(true);
    this._updateStatusRunning(filteredAlg);
  }

  // ── Mode switching ──────────────────────────────────────────────────────────
  _setMode(mode) {
    if (mode === this.mode) return;
    // Set the mode first: session/cursor callbacks below render into the
    // panel that is about to become visible.
    this.mode = mode;
    if (!this.isExecuting) {
      if (mode === 'tutorial') {
        const step = TUTORIAL_STEPS[this.stepIndex];
        // Restore the step's starting position – practice may have left the
        // cube in any state at all.
        this._applyStepSetup();
        this._hideBanner();
        this._applyTutorialHighlight();
        // Rebase the step-helper session on the tutorial step's algorithm
        // (the loaded session may still belong to a practice algorithm).
        this.algTokens = step.algorithm.trim().split(/\s+/);
        this.cube.loadAlgorithm(parseAlgorithm(step.algorithm));
      } else {
        this.cube.clearHighlight();
        // Rebase on whatever the practice panel currently displays, so its
        // tokens stay selectable; clear the session when it displays nothing.
        const container = document.getElementById('custom-alg-display');
        const tokens = Array.from(container?.querySelectorAll('.move-token') ?? [])
          .map(n => n.dataset.token ?? '')
          .filter(Boolean);
        this.algTokens = tokens;
        if (tokens.length > 0) {
          this.cube.loadAlgorithm(parseAlgorithm(tokens.join(' ')));
        } else {
          this.cube.clearAlgorithm();
        }
      }
    }
    const tutBtn = document.getElementById('btn-tutorial');
    const pracBtn = document.getElementById('btn-practice');
    tutBtn.classList.toggle('active', mode === 'tutorial');
    tutBtn.setAttribute('aria-pressed', String(mode === 'tutorial'));
    pracBtn.classList.toggle('active', mode === 'practice');
    pracBtn.setAttribute('aria-pressed', String(mode === 'practice'));
    document.getElementById('tutorial-panel').style.display = mode === 'tutorial' ? 'flex' : 'none';
    document.getElementById('practice-panel').style.display = mode === 'practice' ? 'flex' : 'none';
    this._updateResetBtnTitle();

    // Re-render token highlights into the now-visible panel only when
    // mid-execution — avoids copying tutorial tokens into #custom-alg-display
    // (or practice tokens into #algorithm-display) while idle.
    if (this.isExecuting) {
      this._updateTokenHighlight(this.activeMoveIdx);
    }
  }

  /** Reset means different things per mode – keep the tooltip honest. */
  _updateResetBtnTitle() {
    const btn = document.getElementById('btn-reset');
    if (!btn) return;
    btn.title = this.mode === 'tutorial'
      ? "Reset to this step's starting position"
      : 'Reset to solved state';
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
      // Preserve the step-helper position when a matching session survived
      // (e.g. Stop mid-run); otherwise render all tokens idle.
      if (this._sessionMatchesTokens()) {
        this._renderCursorTokens();
      } else {
        this._renderAlgorithmTokens('algorithm-display', this.algTokens, -1);
      }
      // Re-apply the tutorial highlight when execution is explicitly cleared
      // (stop/reset/scramble). Normal queue completion is handled in onQueueEmpty.
      this._applyTutorialHighlight();
    } else {
      this.algTokens = [];
      document.getElementById('custom-alg-display').innerHTML = '';
      const warningEl = document.getElementById('alg-warning');
      if (warningEl) warningEl.textContent = '';
      // The practice display was cleared, so the session no longer matches
      // anything on screen – drop it to keep the step controls consistent.
      this.cube.clearAlgorithm();
    }
    this._setExecuteBtn(false);
    const playPauseBtn = document.getElementById('btn-play-pause');
    if (this.cube.isPaused) {
      // Keep status consistent with paused state and ensure button label matches
      if (playPauseBtn) {
        playPauseBtn.textContent = '▶ Play';
      }
    } else {
      this._updateStatusIdle();
    }
  }

  /**
   * Put the cube into the current tutorial step's starting position.
   *
   * The setup is the inverse of the step's algorithm, so the cube ends up
   * solved apart from the pieces that algorithm restores — executing the step
   * once therefore completes the cube. The pieces left out of place become the
   * step's highlight, so the glow marks exactly what is still missing.
   */
  _applyStepSetup() {
    const step = TUTORIAL_STEPS[this.stepIndex];
    if (!step) return;

    const setup = getStepSetup(step);
    this.cube.applyMovesInstant(parseAlgorithm(setup));

    const unsolved = this.cube.getUnsolvedPositions();
    this._stepHighlight = unsolved.length > 0 ? unsolved : null;

    this._renderSetupDisplay(setup);
  }

  /** Show the setup sequence that produced the current starting position. */
  _renderSetupDisplay(setup) {
    const el = document.getElementById('step-setup');
    if (!el) return;
    const movesEl = document.getElementById('setup-moves');
    if (movesEl) movesEl.textContent = setup;
    el.style.display = setup ? '' : 'none';
  }

  /**
   * Highlight the pieces this step is about: the ones its setup left unsolved
   * when that setup is still on the cube, otherwise the step's static list.
   */
  _applyTutorialHighlight() {
    const step = TUTORIAL_STEPS[this.stepIndex];
    this.cube.highlightPieces(this._stepHighlight ?? step?.pieces ?? []);
  }

  /**
   * Rebase the step-helper session on the current tutorial step, using the
   * cube's current state as move 0. Called after Reset/Scramble invalidated
   * the previous session. No-op in practice mode (a cleared practice session
   * stays cleared until the next execute).
   */
  _reloadTutorialSession() {
    if (this.mode !== 'tutorial') return;
    const step = TUTORIAL_STEPS[this.stepIndex];
    if (!step) return;
    this.algTokens = step.algorithm.trim().split(/\s+/);
    this.cube.loadAlgorithm(parseAlgorithm(step.algorithm));
  }

  _on(id, event, handler) {
    const el = document.getElementById(id);
    if (el) el.addEventListener(event, handler);
  }
}
