// Orbit Connect — Logic Chess Track Game
// New: Sound packs, custom audio uploads (place/rotate/win), and a mute icon in the Game panel.
// Keeps: grid size (4/6), rotate mode (manual/auto), animation speed (none/fast/normal/slow), rotate all rings CCW.

(() => {
  // ------- Config -------
  const CONNECT_N = 4;               // win length
  const AUTO_ROTATE_DELAY = 1000;    // 1s after placement when rotate mode = 'auto'
  const ANIM_DUR = { none: 0, fast: 180, normal: 320, slow: 500 }; // ms

  // ------- State -------
  let size = 6;                      // 4 or 6
  let rotateMode = 'manual';         // 'manual' | 'auto'
  let animMode = 'normal';           // 'none' | 'fast' | 'normal' | 'slow'
  let soundEnabled = true;           // on/off
  let soundPack = 'classic';         // 'classic' | 'chimes' | 'clicks' | 'arcade' | 'custom'

  const PHASE_PLACE  = 'place';
  const PHASE_ROTATE = 'rotate';
  const PHASE_END    = 'end';

  let board;             // 2D array [size][size]
  let currentPlayer;     // 1 or 2
  let phase;             // 'place' | 'rotate' | 'end'
  let winner;            // 0 none, else 1/2
  let history;           // for Undo
  let lastWinRun;        // coords of last winning line
  let isAnimating = false;
  let autoTimer = null;  // pending auto-rotate timeout id

  // Custom audio buffers (when soundPack==='custom')
  let audioCtx = null;
  const customBuffers = { place: null, rotate: null, win: null };

  // ------- DOM: Tabs -------
  const tabSettings   = document.getElementById('tabSettings');
  const tabGame       = document.getElementById('tabGame');
  const panelSettings = document.getElementById('panelSettings');
  const panelGame     = document.getElementById('panelGame');

  // ------- DOM: Settings -------
  const startGameBtn  = document.getElementById('startGame');
  const soundPackSel  = document.getElementById('soundPack');
  const customWrap    = document.getElementById('customSoundFields');
  const filePlace     = document.getElementById('filePlace');
  const fileRotate    = document.getElementById('fileRotate');
  const fileWin       = document.getElementById('fileWin');

  // ------- DOM: Game -------
  const boardEl   = document.getElementById('board');
  const statusEl  = document.getElementById('status');
  const btnMute   = document.getElementById('muteBtn');
  const btnRotate = document.getElementById('rotate');
  const btnUndo   = document.getElementById('undo');
  const btnNew    = document.getElementById('newGame');

  // ------------ Tabs ------------
  function setActiveTab(which) {
    const isSettings = which === 'settings';
    tabSettings.setAttribute('aria-selected', String(isSettings));
    tabGame.setAttribute('aria-selected', String(!isSettings));
    panelSettings.classList.toggle('hidden', !isSettings);
    panelGame.classList.toggle('hidden', isSettings);
  }
  tabSettings.addEventListener('click', () => setActiveTab('settings'));
  tabGame.addEventListener('click', () => setActiveTab('game'));
  setActiveTab('settings'); // show Settings on load

  // ------------ Settings listeners ------------
  soundPackSel.addEventListener('change', () => {
    const isCustom = soundPackSel.value === 'custom';
    customWrap.style.display = isCustom ? 'flex' : 'none';
  });

  filePlace?.addEventListener('change', async (e) => {
    customBuffers.place = await fileToBuffer(e.target.files?.[0]);
  });
  fileRotate?.addEventListener('change', async (e) => {
    customBuffers.rotate = await fileToBuffer(e.target.files?.[0]);
  });
  fileWin?.addEventListener('change', async (e) => {
    customBuffers.win = await fileToBuffer(e.target.files?.[0]);
  });

  startGameBtn.addEventListener('click', () => {
    const sz   = document.querySelector('input[name="gridSize"]:checked')?.value || '6';
    const rm   = document.querySelector('input[name="rotateMode"]:checked')?.value || 'manual';
    const am   = document.querySelector('input[name="animSpeed"]:checked')?.value || 'normal';
    const snd  = document.querySelector('input[name="sound"]:checked')?.value || 'on';

    size = parseInt(sz, 10);              // only 4 or 6 now
    rotateMode = rm;
    animMode = am;
    soundEnabled = (snd === 'on');
    soundPack = soundPackSel.value;

    applyAnimationSpeed();
    init();           // reset state with these settings
    setActiveTab('game');
    updateMuteIcon();
  });

  function applyAnimationSpeed() {
    const dur = ANIM_DUR[animMode] ?? ANIM_DUR.normal;
    document.documentElement.style.setProperty('--anim-ms', `${dur}ms`);
  }

  // ------------ Game Init ------------
  function init() {
    clearTimeout(autoTimer);
    autoTimer = null;

    // Make grid columns match size
    boardEl.style.gridTemplateColumns = `repeat(${size}, var(--cell))`;

    board = Array.from({ length: size }, () => Array(size).fill(0));
    currentPlayer = 1;
    phase = PHASE_PLACE;
    winner = 0;
    history = [];
    lastWinRun = null;
    isAnimating = false;
    boardEl.classList.remove('animating');

    render();
    updateHUD();
  }

  // ------------ Rendering ------------
  function render() {
    boardEl.innerHTML = '';
    for (let r = 0; r < size; r++) {
      for (let c = 0; c < size; c++) {
        const cell = document.createElement('div');
        cell.className = 'cell';
        if ((r + c) % 2 === 1) cell.classList.add('cb'); // checkerboard

        cell.dataset.r = r;
        cell.dataset.c = c;

        if (!winner && !isAnimating && phase === PHASE_PLACE && board[r][c] === 0) {
          cell.addEventListener('click', onPlaceClick, { passive: true });
          cell.title = `Place at (${r+1}, ${c+1})`;
          cell.style.cursor = 'pointer';
        } else {
          cell.style.cursor = 'default';
        }

        if (board[r][c] !== 0) {
          const piece = document.createElement('div');
          piece.className = 'piece ' + (board[r][c] === 1 ? 'p1' : 'p2');
          cell.appendChild(piece);
        }
        boardEl.appendChild(cell);
      }
    }
    highlightWinIfAny();
  }

  function updateHUD() {
    if (winner) {
      statusEl.innerHTML = `🎉 <strong>Player ${winner}</strong> wins!`;
    } else {
      const modeNote = (rotateMode === 'auto' ? ' (auto in 1s)' : '');
      const phaseText = (phase === PHASE_PLACE)
        ? 'Place a piece'
        : `Rotate all rings (anti‑clockwise)${modeNote}`;
      statusEl.innerHTML = `Turn: <strong>Player ${currentPlayer}</strong> — ${phaseText}`;
    }
    btnRotate.disabled = (phase !== PHASE_ROTATE || !!winner || isAnimating || rotateMode === 'auto');
    btnUndo.disabled   = history.length === 0 || isAnimating;
  }

  // ------------ Mute toggle in Game panel ------------
  btnMute.addEventListener('click', () => {
    soundEnabled = !soundEnabled;
    updateMuteIcon();
  });
  function updateMuteIcon() {
    btnMute.textContent = soundEnabled ? '🔊' : '🔇';
    btnMute.title = soundEnabled ? 'Mute' : 'Unmute';
  }

  // ------------ Interactions ------------
  function onPlaceClick(e) {
    if (winner || isAnimating || phase !== PHASE_PLACE) return;
    const r = +e.currentTarget.dataset.r;
    const c = +e.currentTarget.dataset.c;
    if (board[r][c] !== 0) return;

    pushHistory();
    board[r][c] = currentPlayer;

    playPlace();

    phase = PHASE_ROTATE;
    render();
    updateHUD();

    scheduleAutoRotateIfNeeded();
  }

  // Manual rotate button
  btnRotate.addEventListener('click', async () => {
    if (winner || isAnimating || phase !== PHASE_ROTATE) return;
    clearTimeout(autoTimer); autoTimer = null;

    if (animMode === 'none') {
      doRotateAllNoAnimation();
    } else {
      await doRotateAllAnimated();
    }
  });

  // Undo / New Game
  btnUndo.addEventListener('click', () => {
    if (history.length === 0 || isAnimating) return;
    clearTimeout(autoTimer); autoTimer = null;

    const s = history.pop();
    board         = deepClone(s.board);
    currentPlayer = s.currentPlayer;
    phase         = s.phase;
    winner        = s.winner;
    lastWinRun    = s.lastWinRun ? s.lastWinRun.map(p => [...p]) : null;

    render();
    updateHUD();
    scheduleAutoRotateIfNeeded();
  });

  btnNew.addEventListener('click', () => {
    clearTimeout(autoTimer); autoTimer = null;
    init();
  });

  function scheduleAutoRotateIfNeeded() {
    clearTimeout(autoTimer); autoTimer = null;
    if (rotateMode !== 'auto' || winner || isAnimating || phase !== PHASE_ROTATE) return;

    autoTimer = setTimeout(async () => {
      if (winner || phase !== PHASE_ROTATE) return; // state changed
      if (animMode === 'none') {
        doRotateAllNoAnimation();
      } else {
        await doRotateAllAnimated();
      }
    }, AUTO_ROTATE_DELAY);
  }

  function pushHistory() {
    history.push({
      board: deepClone(board),
      currentPlayer,
      phase,
      winner,
      lastWinRun: lastWinRun ? lastWinRun.map(p => [...p]) : null
    });
  }

  // ------------ Rotation (ALL rings CCW) ------------
  function doRotateAllNoAnimation() {
    pushHistory();

    const ringsCount = Math.floor(size / 2);
    for (let ring = 0; ring < ringsCount; ring++) {
      const coords = getRingCoords(ring, size);
      rotateRingCCW(coords);
    }

    playRotate();

    if (checkWin(currentPlayer)) {
      winner = currentPlayer;
      phase = PHASE_END;
      playWin();
    } else {
      currentPlayer = (currentPlayer === 1) ? 2 : 1;
      phase = PHASE_PLACE;
    }
    render();
    updateHUD();
  }

  async function doRotateAllAnimated() {
    pushHistory();
    isAnimating = true;
    boardEl.classList.add('animating');
    updateHUD();

    const ringsCount = Math.floor(size / 2);
    const ringCoordsList = [];
    for (let ring = 0; ring < ringsCount; ring++) {
      ringCoordsList.push(getRingCoords(ring, size));
    }

    await animateRingsCCW(ringCoordsList);

    for (const coords of ringCoordsList) {
      rotateRingCCW(coords);
    }

    playRotate();

    if (checkWin(currentPlayer)) {
      winner = currentPlayer;
      phase = PHASE_END;
      playWin();
    } else {
      currentPlayer = (currentPlayer === 1) ? 2 : 1;
      phase = PHASE_PLACE;
    }

    isAnimating = false;
    boardEl.classList.remove('animating');

    render();
    updateHUD();
  }

  // Animate all rings CCW by sliding floating clones from src -> dst
  function animateRingsCCW(ringCoordsList) {
    const floats = [];
    const promises = [];

    const boardRect = boardEl.getBoundingClientRect();
    const cellCenter = (r, c) => {
      const cell = boardEl.children[r * size + c];
      const rect = cell.getBoundingClientRect();
      return {
        x: rect.left - boardRect.left + rect.width / 2,
        y: rect.top  - boardRect.top  + rect.height / 2
      };
    };

    for (const coords of ringCoordsList) {
      const len = coords.length;
      for (let i = 0; i < len; i++) {
        const [sr, sc] = coords[i];
        const val = board[sr][sc];
        if (val === 0) continue;

        const dstIndex = (i - 1 + len) % len;  // CCW target
        const [dr, dc] = coords[dstIndex];

        const from = cellCenter(sr, sc);
        const to   = cellCenter(dr, dc);
        const dx = to.x - from.x;
        const dy = to.y - from.y;

        const floater = document.createElement('div');
        floater.className = 'floating ' + (val === 1 ? 'p1' : 'p2');
        floater.style.left = `${from.x}px`;
        floater.style.top  = `${from.y}px`;

        const durMs = ANIM_DUR[animMode] ?? ANIM_DUR.normal;
        floater.style.transitionDuration = `${durMs}ms`;

        requestAnimationFrame(() => {
          floater.style.transform = `translate(-50%, -50%) translate(${dx}px, ${dy}px)`;
        });

        const p = new Promise(resolve => floater.addEventListener('transitionend', resolve, { once: true }));
        boardEl.appendChild(floater);
        floats.push(floater);
        promises.push(p);
      }
    }

    return Promise.all(promises).then(() => { for (const f of floats) f.remove(); });
  }

  // Ring perimeter coordinates (clockwise)
  function getRingCoords(ring, N) {
    const top = ring, left = ring;
    const bottom = N - 1 - ring, right = N - 1 - ring;
    if (top > bottom || left > right) return [];

    const coords = [];
    for (let c = left; c <= right; c++) coords.push([top, c]);          // top
    for (let r = top + 1; r <= bottom; r++) coords.push([r, right]);    // right
    if (bottom > top) {
      for (let c = right - 1; c >= left; c--) coords.push([bottom, c]); // bottom
    }
    if (right > left) {
      for (let r = bottom - 1; r > top; r--) coords.push([r, left]);    // left
    }
    return coords;
  }

  // Commit data rotation CCW along given perimeter
  function rotateRingCCW(coords) {
    if (coords.length <= 1) return;
    const values = coords.map(([r, c]) => board[r][c]);
    values.push(values.shift()); // CCW: first -> end
    coords.forEach(([r, c], i) => board[r][c] = values[i]);
  }

  // ------ Audio helpers ------
  function ensureAudio() {
    if (!soundEnabled) return false;
    if (!audioCtx) {
      try { audioCtx = new (window.AudioContext || window.webkitAudioContext)(); }
      catch { audioCtx = null; }
    }
    return !!audioCtx;
  }

  async function fileToBuffer(file) {
    if (!file) return null;
    if (!ensureAudio()) return null;
    const arrayBuf = await file.arrayBuffer();
    try {
      return await audioCtx.decodeAudioData(arrayBuf);
    } catch {
      return null;
    }
  }

  function playBuffer(buf) {
    if (!ensureAudio() || !buf) return;
    const src = audioCtx.createBufferSource();
    const gain = audioCtx.createGain();
    gain.gain.value = 0.18;
    src.buffer = buf;
    src.connect(gain).connect(audioCtx.destination);
    src.start();
  }

  // Synth tones for built-in packs
  function tone(freq = 440, ms = 120, type = 'sine', gainMax = 0.12, when = 0, glideTo = null) {
    if (!ensureAudio()) return;
    const t0 = audioCtx.currentTime + when;
    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();
    osc.type = type;
    osc.frequency.value = freq;
    if (glideTo) {
      osc.frequency.setValueAtTime(freq, t0);
      osc.frequency.linearRampToValueAtTime(glideTo, t0 + ms/1000);
    }
    gain.gain.value = 0;
    osc.connect(gain).connect(audioCtx.destination);
    gain.gain.setValueAtTime(0, t0);
    gain.gain.linearRampToValueAtTime(gainMax, t0 + 0.01);
    gain.gain.exponentialRampToValueAtTime(0.0001, t0 + ms/1000);
    osc.start(t0);
    osc.stop(t0 + ms/1000 + 0.02);
  }

  function playPlace() {
    if (!soundEnabled) return;
    if (soundPack === 'custom' && customBuffers.place) return playBuffer(customBuffers.place);
    switch (soundPack) {
      case 'chimes': return tone(740, 140, 'sine', 0.12);
      case 'clicks': return tone(220, 60,  'square', 0.08);
      case 'arcade': return tone(500, 90,  'sawtooth', 0.10, 0, 650);
      default:       return tone(380, 90,  'triangle', 0.10); // classic
    }
  }

  function playRotate() {
    if (!soundEnabled) return;
    if (soundPack === 'custom' && customBuffers.rotate) return playBuffer(customBuffers.rotate);
    switch (soundPack) {
      case 'chimes': return tone(620, 180, 'sine',    0.12);
      case 'clicks': return tone(160, 80,  'square',  0.10);
      case 'arcade': return tone(420, 120, 'sawtooth',0.12, 0, 520);
      default:       return tone(520, 110, 'square',  0.10); // classic
    }
  }

  function playWin() {
    if (!soundEnabled) return;
    if (soundPack === 'custom' && customBuffers.win) return playBuffer(customBuffers.win);
    switch (soundPack) {
      case 'chimes':
        tone(660, 160, 'sine', 0.12, 0.00);
        tone(880, 180, 'sine', 0.12, 0.12);
        tone(990, 220, 'sine', 0.12, 0.26);
        break;
      case 'clicks':
        tone(180, 70, 'square', 0.08);
        tone(260, 70, 'square', 0.08, 0.08);
        tone(340, 70, 'square', 0.08, 0.16);
        break;
      case 'arcade':
        tone(520, 120, 'sawtooth', 0.12, 0.00, 660);
        tone(660, 120, 'sawtooth', 0.12, 0.12, 780);
        tone(780, 200, 'sawtooth', 0.12, 0.24, 920);
        break;
      default: // classic
        tone(440, 160, 'sine', 0.12, 0.00);
        tone(554, 160, 'sine', 0.12, 0.12);
        tone(659, 240, 'sine', 0.12, 0.24);
        break;
    }
  }

  // ------------ Win Check & helpers ------------
  function checkWin(player) {
    const dirs = [[0,1],[1,0],[1,1],[1,-1]]; // →, ↓, ↘, ↙
    lastWinRun = null;

    for (let r = 0; r < size; r++) {
      for (let c = 0; c < size; c++) {
        if (board[r][c] !== player) continue;
        for (const [dr, dc] of dirs) {
          let count = 0;
          const run = [];
          for (let k = 0; k < CONNECT_N; k++) {
            const nr = r + dr*k, nc = c + dc*k;
            if (nr < 0 || nr >= size || nc < 0 || nc >= size) break;
            if (board[nr][nc] !== player) break;
            count++; run.push([nr, nc]);
          }
          if (count === CONNECT_N) {
            lastWinRun = run;
            return true;
          }
        }
      }
    }
    return false;
  }

  function highlightWinIfAny() {
    if (!lastWinRun) return;
    const cells = boardEl.querySelectorAll('.cell');
    for (const [r, c] of lastWinRun) {
      const idx = r * size + c;
      cells[idx]?.classList.add('win');
    }
  }

  // ------------ Utils ------------
  function deepClone(arr2d) { return arr2d.map(row => row.slice()); }

  // (Re)render helpers used above are defined earlier in this IIFE
})();
