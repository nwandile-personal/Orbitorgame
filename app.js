// Orbit Connect — Clean, Mobile-Friendly Build (NO SOUND)
// Features: 4x4/6x6, Manual/Auto rotate (1s), Animation speeds, centered board,
// floating pieces sized from actual cells (no "ballooning").

(() => {
  // ----- Config -----
  const CONNECT = 4;                // win length
  const AUTO_DELAY = 1000;          // ms for auto-rotate after placement
  const ANIM_MS = { none: 0, fast: 150, normal: 300, slow: 600 };

  // ----- State -----
  let size = 6;                     // 4 or 6
  let rotateMode = "manual";        // "manual" | "auto"
  let animMode = "normal";          // "none" | "fast" | "normal" | "slow"

  let board = [];                   // 2D array size x size
  let currentPlayer = 1;            // 1 or 2
  let phase = "place";              // "place" | "rotate" | "end"
  let winner = 0;                   // 0 none; 1 or 2 when win
  let history = [];                 // stack of states for Undo
  let isAnimating = false;
  let autoTimer = null;

  // ----- DOM -----
  const tabSettings   = document.getElementById("tabSettings");
  const tabGame       = document.getElementById("tabGame");
  const panelSettings = document.getElementById("panelSettings");
  const panelGame     = document.getElementById("panelGame");

  const startGameBtn  = document.getElementById("startGame");

  const boardEl   = document.getElementById("board");
  const statusEl  = document.getElementById("status");
  const btnRotate = document.getElementById("rotate");
  const btnUndo   = document.getElementById("undo");
  const btnNew    = document.getElementById("newGame");

  // ----- Tabs -----
  function setTab(which) {
    const isSettings = which === "settings";
    tabSettings.setAttribute("aria-selected", isSettings);
    tabGame.setAttribute("aria-selected", !isSettings);
    panelSettings.classList.toggle("hidden", !isSettings);
    panelGame.classList.toggle("hidden", isSettings);
  }
  tabSettings.addEventListener("click", () => setTab("settings"));
  tabGame.addEventListener("click", () => setTab("game"));
  setTab("settings"); // default

  // ----- Settings -----
  startGameBtn.addEventListener("click", () => {
    size = parseInt(document.querySelector("input[name='gridSize']:checked").value, 10);
    rotateMode = document.querySelector("input[name='rotateMode']:checked").value;
    animMode = document.querySelector("input[name='animSpeed']:checked").value;
    document.documentElement.style.setProperty("--anim-ms", ANIM_MS[animMode] + "ms");
    init();
    setTab("game");
  });

  // ----- Init -----
  function init() {
    clearTimeout(autoTimer);
    autoTimer = null;

    applyGridCols();
    board = Array.from({ length: size }, () => Array(size).fill(0));
    currentPlayer = 1;
    phase = "place";
    winner = 0;
    history = [];
    isAnimating = false;
    boardEl.classList.remove("animating");

    render();
    updateHUD();
  }

  // Keep board columns synced on size/orientation changes
  function applyGridCols() {
    boardEl.style.gridTemplateColumns = `repeat(${size}, var(--cell))`;
  }
  window.addEventListener("resize", applyGridCols);
  window.addEventListener("orientationchange", () => setTimeout(applyGridCols, 120));

  // ----- Rendering -----
  function render() {
    boardEl.innerHTML = "";
    for (let r = 0; r < size; r++) {
      for (let c = 0; c < size; c++) {
        const cell = document.createElement("div");
        cell.className = "cell";
        if ((r + c) % 2 === 1) cell.classList.add("cb");
        cell.dataset.r = r;
        cell.dataset.c = c;

        if (!winner && !isAnimating && phase === "place" && board[r][c] === 0) {
          cell.addEventListener("click", onPlace, { passive: true });
          cell.style.cursor = "pointer";
        } else {
          cell.style.cursor = "default";
        }

        if (board[r][c] !== 0) {
          const piece = document.createElement("div");
          piece.className = "piece " + (board[r][c] === 1 ? "p1" : "p2");
          cell.appendChild(piece);
        }
        boardEl.appendChild(cell);
      }
    }
    highlightWinIfAny();
  }

  function updateHUD() {
    if (winner) {
      statusEl.textContent = `Player ${winner} wins!`;
    } else {
      let txt = (phase === "place") ? "Place a piece" : "Rotate all rings CCW";
      if (phase === "rotate" && rotateMode === "auto") txt += " (auto in 1s)";
      statusEl.textContent = `Turn: Player ${currentPlayer} — ${txt}`;
    }
    btnRotate.disabled = (phase !== "rotate" || winner || isAnimating || rotateMode === "auto");
    btnUndo.disabled   = (history.length === 0 || isAnimating);
  }

  // ----- Interactions -----
  function onPlace(e) {
    if (winner || isAnimating || phase !== "place") return;
    const r = +e.currentTarget.dataset.r;
    const c = +e.currentTarget.dataset.c;
    if (board[r][c] !== 0) return;

    pushHistory();
    board[r][c] = currentPlayer;
    phase = "rotate";
    render();
    updateHUD();

    scheduleAutoRotateIfNeeded();
  }

  btnRotate.addEventListener("click", () => {
    if (winner || isAnimating || phase !== "rotate") return;
    clearTimeout(autoTimer); autoTimer = null;
    rotateNow();
  });

  btnUndo.addEventListener("click", () => {
    if (history.length === 0 || isAnimating) return;
    clearTimeout(autoTimer); autoTimer = null;

    const s = history.pop();
    board = s.board.map(row => row.slice());
    currentPlayer = s.currentPlayer;
    phase = s.phase;
    winner = s.winner;

    render();
    updateHUD();
    scheduleAutoRotateIfNeeded();
  });

  btnNew.addEventListener("click", () => init());

  function scheduleAutoRotateIfNeeded() {
    clearTimeout(autoTimer);
    autoTimer = null;
    if (rotateMode !== "auto" || winner || isAnimating || phase !== "rotate") return;
    autoTimer = setTimeout(() => {
      if (!winner && phase === "rotate") rotateNow();
    }, AUTO_DELAY);
  }

  function rotateNow() {
    if (animMode === "none") {
      rotateInstant();
    } else {
      rotateAnimated();
    }
  }

  // ----- Rotation paths -----
  function rotateInstant() {
    pushHistory();

    const rings = Math.floor(size / 2);
    for (let ring = 0; ring < rings; ring++) {
      rotateRingCCW(getRingCoords(ring));
    }

    afterRotate();
  }

  async function rotateAnimated() {
    pushHistory();
    isAnimating = true;
    boardEl.classList.add("animating");
    updateHUD();

    // Build rings
    const rings = Math.floor(size / 2);
    const ringCoordsList = [];
    for (let ring = 0; ring < rings; ring++) ringCoordsList.push(getRingCoords(ring));

    // Animate
    await animateRingsCCW(ringCoordsList);

    // Commit data
    for (const coords of ringCoordsList) rotateRingCCW(coords);

    isAnimating = false;
    boardEl.classList.remove("animating");

    afterRotate();
  }

  function afterRotate() {
    if (checkWin()) {
      winner = currentPlayer;
      phase = "end";
    } else {
      currentPlayer = (currentPlayer === 1 ? 2 : 1);
      phase = "place";
    }
    render();
    updateHUD();
    scheduleAutoRotateIfNeeded();
  }

  // ----- Animation engine (pixel-perfect floating pieces) -----
  function animateRingsCCW(ringCoordsList) {
    const floats = [];
    const promises = [];

    // Helper: center + piece diameter from the actual rendered cell
    const boardRect = boardEl.getBoundingClientRect();
    const cellMetrics = (r, c) => {
      const cell = boardEl.children[r * size + c];
      const rect = cell.getBoundingClientRect();
      const center = {
        x: rect.left - boardRect.left + rect.width / 2,
        y: rect.top  - boardRect.top  + rect.height / 2
      };
      const dia = Math.min(rect.width, rect.height) * 0.70; // match in-grid piece size (70%)
      return { center, dia };
    };

    for (const coords of ringCoordsList) {
      const len = coords.length;
      for (let i = 0; i < len; i++) {
        const [sr, sc] = coords[i];
        const val = board[sr][sc];
        if (val === 0) continue;

        const dst = (i - 1 + len) % len;     // CCW target index
        const [dr, dc] = coords[dst];

        const { center: from, dia } = cellMetrics(sr, sc);
        const { center: to }        = cellMetrics(dr, dc);

        const dx = to.x - from.x;
        const dy = to.y - from.y;

        const floater = document.createElement("div");
        floater.className = "floating " + (val === 1 ? "p1" : "p2");
        floater.style.left   = `${from.x}px`;
        floater.style.top    = `${from.y}px`;
        floater.style.width  = `${dia}px`;
        floater.style.height = `${dia}px`;
        floater.style.transitionDuration = `${ANIM_MS[animMode] ?? ANIM_MS.normal}ms`;

        // Kick off transform next frame
        requestAnimationFrame(() => {
          floater.style.transform = `translate(-50%, -50%) translate(${dx}px, ${dy}px)`;
        });

        const p = new Promise(res => floater.addEventListener("transitionend", res, { once: true }));
        boardEl.appendChild(floater);
        floats.push(floater);
        promises.push(p);
      }
    }

    return Promise.all(promises).then(() => floats.forEach(f => f.remove()));
  }

  // ----- Ring helpers -----
  function getRingCoords(ring) {
    const t = ring, l = ring, b = size - 1 - ring, r = size - 1 - ring;
    if (t > b || l > r) return [];
    const out = [];
    for (let c = l; c <= r; c++) out.push([t, c]);          // top
    for (let rr = t + 1; rr <= b; rr++) out.push([rr, r]);   // right
    if (b > t)   for (let c = r - 1; c >= l; c--) out.push([b, c]); // bottom
    if (r > l)   for (let rr = b - 1; rr > t; rr--) out.push([rr, l]); // left
    return out;
  }

  function rotateRingCCW(coords) {
    if (coords.length <= 1) return;
    const vals = coords.map(([r, c]) => board[r][c]);
    vals.push(vals.shift()); // CCW shift
    coords.forEach(([r, c], i) => board[r][c] = vals[i]);
  }

  // ----- Win detection & highlight -----
  function checkWin() {
    const dirs = [[0,1],[1,0],[1,1],[1,-1]];
    for (let r = 0; r < size; r++) {
      for (let c = 0; c < size; c++) {
        const p = board[r][c];
        if (p === 0) continue;
        for (const [dr, dc] of dirs) {
          let k = 0;
          for (; k < CONNECT; k++) {
            const rr = r + dr * k, cc = c + dc * k;
            if (rr < 0 || rr >= size || cc < 0 || cc >= size) break;
            if (board[rr][cc] !== p) break;
          }
          if (k === CONNECT) return true;
        }
      }
    }
    return false;
  }

  function highlightWinIfAny() {
    if (!winner) return;
    const dirs = [[0,1],[1,0],[1,1],[1,-1]];
    outer: for (let r = 0; r < size; r++) {
      for (let c = 0; c < size; c++) {
        const p = board[r][c];
        if (p !== winner) continue;
        for (const [dr, dc] of dirs) {
          const run = [];
          for (let k = 0; k < CONNECT; k++) {
            const rr = r + dr * k, cc = c + dc * k;
            if (rr < 0 || rr >= size || cc < 0 || cc >= size) break;
            if (board[rr][cc] !== p) break;
            run.push([rr, cc]);
          }
          if (run.length === CONNECT) {
            for (const [rr, cc] of run) {
              boardEl.children[rr * size + cc].classList.add("win");
            }
            break outer;
          }
        }
      }
    }
  }

  // ----- History -----
  function pushHistory() {
    history.push({
      board: board.map(row => row.slice()),
      currentPlayer,
      phase,
      winner
    });
  }
})();
