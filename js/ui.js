/**
 * ui.js
 * DOM manipulation – sidebar step display, practice panel, control bar bindings.
 */

import {
  parseAlgorithm,
  generateScramble,
  TUTORIAL_STEPS,
  QUICK_ALGORITHMS,
} from './logic.js';

// ── Move-token colour map (matches CSS variables) ─────────────────────────────
const TOKEN_BG = {
  R: '#1155cc', L: '#00991a', U: '#e8e8e8',
  D: '#ffd600', F: '#cc2200', B: '#ff7700',
  M: '#6b7280', E: '#6b7280', S: '#6b7280',
};
const TOKEN_FG = {
  R: '#fff', L: '#fff', U: '#222',
  D: '#222', F: '#fff', B: '#fff',
  M: '#fff', E: '#fff', S: '#fff',
};

function tokenBg(token) { return TOKEN_BG[token[0].toUpperCase()] ?? '#6b7280'; }
function tokenFg(token) { return TOKEN_FG[token[0].toUpperCase()] ?? '#fff'; }

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
      this._updateTokenHighlight(-1);
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
        this._updateStatus('status-paused', '⏸ Paused');
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

    // Re-render current algorithm display with updated highlight
    const containerId = this.mode === 'tutorial' ? 'algorithm-display' : 'custom-alg-display';
    this._renderAlgorithmTokens(containerId, tokens, activeIdx);
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
    const moves = parseAlgorithm(input);
    if (moves.length === 0) return;

    this._prepareForExecution();
    this.algTokens = input.split(/\s+/).filter(Boolean);
    this._renderAlgorithmTokens('custom-alg-display', this.algTokens, 0);
    this.cube.executeAlgorithm(moves);
    this._setExecuteBtn(true);
    this._updateStatusRunning(input);
  }

  // ── Mode switching ──────────────────────────────────────────────────────────
  _setMode(mode) {
    this.mode = mode;
    document.getElementById('btn-tutorial').classList.toggle('active', mode === 'tutorial');
    document.getElementById('btn-practice').classList.toggle('active', mode === 'practice');
    document.getElementById('tutorial-panel').style.display = mode === 'tutorial' ? 'flex' : 'none';
    document.getElementById('practice-panel').style.display = mode === 'practice' ? 'flex' : 'none';
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
  _updateStatus(cls, text) {
    const el = document.getElementById('status-display');
    el.className = cls;
    el.textContent = text;
  }
  _updateStatusIdle()              { this._updateStatus('status-idle',    'Ready'); }
  _updateStatusRunning(alg = '')   { this._updateStatus('status-running', alg ? `▶ ${alg}` : '▶ Running…'); }
  _updateStatusDone()              { this._updateStatus('status-done',    '✓ Done'); }

  // ── Scramble banner ──────────────────────────────────────────────────────────
  _showBanner(scramble) {
    const el = document.getElementById('scramble-banner');
    document.getElementById('scramble-text').innerHTML =
      `<strong>Scramble:</strong> ${scramble}`;
    el.style.display = 'block';
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
    this.algTokens     = TUTORIAL_STEPS[this.stepIndex]?.algorithm.trim().split(/\s+/) ?? [];
    if (this.mode === 'tutorial') {
      this._renderAlgorithmTokens('algorithm-display', this.algTokens, -1);
    } else {
      document.getElementById('custom-alg-display').innerHTML = '';
    }
    this._setExecuteBtn(false);
    this._updateStatusIdle();
  }

  _on(id, event, handler) {
    const el = document.getElementById(id);
    if (el) el.addEventListener(event, handler);
  }
}
