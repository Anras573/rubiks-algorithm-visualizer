/**
 * main.js
 * Application entry point – initialises the 3D cube and the UI.
 */

import { RubiksCubeApp } from './cube.js';
import { UI } from './ui.js';

// Wait for the DOM to be ready before mounting
window.addEventListener('DOMContentLoaded', () => {
  const container = document.getElementById('cube-container');

  // Boot the Three.js cube
  const cubeApp = new RubiksCubeApp(container);

  // Boot the UI (wires all DOM events and callbacks).
  const ui = new UI(cubeApp);
  // Expose on window for debugging only on local dev servers.
  if (['localhost', '127.0.0.1', ''].includes(location.hostname)) {
    window.app = { cube: cubeApp, ui };
  }
});
