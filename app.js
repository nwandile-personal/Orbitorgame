// Orbit Connect — Minimal Auto-Rotate Build (no sounds)
// Fixed settings: Auto rotate after 1s, Normal animation.
// Options shown: grid size only (4x4=default / 6x6).
// Correct winner detection + highlighted run. Direction triangles per your mapping.

(() => {
  // ----- Fixed config -----
  const CONNECT = 4;
  const AUTO_DELAY = 1000;              // auto-rotate after 1s
  const ANIM_MS = 300;                  // normal

  // ----- State -----
  let size = 4;                         // default 4x4
  let board = [];
  let currentPlayer = 1;                // 1 (blue) or 2 (red)
  let phase = "place";                  // "place" | "rotate" | "end"
  let winner = 0;                       // 0 none; 1 or 2 on win
  let winnerRun = null;                 // coords of winning 4-in-a-row
  let history = [];
  let isAnimating = false;
  let autoTimer = null;

  // ----- Direction maps EXACTLY as specified -----
  // D=Down, U=Up, L=Left, R=Right
  const DIR6 = [
    ["D","L","L","L","L","L"],
    ["D","D","L","L","L","U"],
    ["D","D","D","L","U","U"],
    ["D","D","R","U","U","U"],
    ["D","R","R","R","U","U"],
    ["R","R","R","R","R","U"],
  ];
  const DIR4 = [
    ["D","L","L","L"],
    ["D","D","L","U"],
    ["D","R","U","U"],
    ["R","R","R","U"],
  ];
  const DEG = { U: 0, R: 90, D: 180, L: 270 };

  // ----- DOM -----
  const tabSettings   = document.getElementById("tabSettings");
  const tabGame       = document.getElementById("tabGame");
  const panelSettings = document.getElementById("panelSettings");
  const panelGame     = document.getElementById("panelGame");

  const startGameBtn  = document.getElementById("startGame");

  const boardFrame = document.getElementById("boardFrame");
  const boardEl    = document.getElementById("board");
  const statusEl   = document.getElementById("status");
  const btnUndo    = document.getElementById("undo");
  const btnNew     = document.getElementById("newGame");

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
    init();
    setTab("game");
  });

  // ----- Init / Reset -----
  function init() {
    clearTimeout(autoTimer);
    autoTimer = null;

    boardEl.style.gridTemplateColumns = `repeat(${size}, var(--cell))`;
    board = Array.from({ length: size }, () => Array(size).fill(0));
    currentPlayer = 1;
    phase = "place";
    winner = 0;
    winnerRun = null;
    history = [];
    isAnimating = false;
    boardEl.classList.remove("animating");
    updateTurnGlow();

    render();
    updateHUD();
  }

  // ----- Render -----
  function render() {
    boardEl.innerHTML = "";

    for (let r = 0; r < size; r++) {
      for (let c = 0; c < size; c++) {
        const cell = document.createElement("div");
        cell.className = "cell";
        if ((r + c) % 2 === 1) cell.classList.add("cb");
        cell.dataset.r = r;
        cell.dataset.c = c;

        // Direction triangle (fixed map)
        const deg = getFixedAngle(r, c);
        const tri = document.createElement("div");
        tri.className = "tri";
        tri.style.setProperty("--deg", `${deg}deg`);
        cell.appendChild(tri);

        // Clickable only on PLACE phase & empty
        if (!winner && !isAnimating && phase === "place" && board[r][c] === 0) {
          cell.addEventListener("click", onPlace, { passive: true });
          cell.style.cursor = "pointer";
        } else {
          cell.style.cursor = "default";
        }

        // Piece
        if (board[r][c] !== 0) {
          const piece = document.createElement("div");
          piece.className = "piece " + (board[r][c] === 1 ? "p1" : "p2");
          cell.appendChild(piece);
        }

        boardEl.appendChild(cell);
      }
    }

    // Highlight winning run if present
    if (winnerRun) {
      for (const [rr, cc] of winnerRun) {
        boardEl.children[rr * size + cc]?.classList.add("win");
      }
    }
  }

  function updateHUD() {
    statusEl.textContent = winner ? `Player ${winner} wins!` : "";
  }

  function updateTurnGlow() {
    boardFrame.classList.toggle("turn1", currentPlayer === 1 && !winner);
    boardFrame.classList.toggle("turn2", currentPlayer === 2 && !winner);
    if (winner) boardFrame.classList.remove("turn1", "turn2");
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
    updateTurnGlow();

    // Always auto-rotate after 1s
    scheduleAutoRotate();
  }

  btnUndo.addEventListener("click", () => {
    if (history.length === 0 || isAnimating) return;
    clearTimeout(autoTimer); autoTimer = null;

    const s = history.pop();
    board         = s.board.map(row => row.slice());
    currentPlayer = s.currentPlayer;
    phase         = s.phase;
    winner        = s.winner;
    winnerRun     = s.winnerRun ? s.winnerRun.map(p => [...p]) : null;

    render();
    updateHUD();
    updateTurnGlow();

    if (phase === "rotate" && !winner) scheduleAutoRotate();
  });

  btnNew.addEventListener("click", () => init());

  function scheduleAutoRotate() {
    clearTimeout(autoTimer);
    autoTimer = null;
    if (winner || isAnimating || phase !== "rotate") return;
    autoTimer = setTimeout(() => {
      if (!winner && phase === "rotate") rotateAnimated();
    }, AUTO_DELAY);
  }

  // ----- Rotation -----
  async function rotateAnimated() {
    pushHistory();
    isAnimating = true;
    boardEl.classList.add("animating");

    // Build ring paths
    const rings = Math.floor(size / 2);
    const ringCoordsList = [];
    for (let ring = 0; ring < rings; ring++) ringCoordsList.push(getRingCoords(ring));

    // Animate floaters along CCW path
    await animateRingsCCW(ringCoordsList);

    // Commit data
    for (const coords of ringCoordsList) rotateRingCCW(coords);

    // Check win for the player who just rotated
    winnerRun = findWinningRun(currentPlayer);
    if (winnerRun) {
      winner = currentPlayer;
      phase  = "end";
    } else {
      currentPlayer = (currentPlayer === 1 ? 2 : 1);
      phase  = "place";
    }

    isAnimating = false;
    boardEl.classList.remove("animating");

    render();
    updateHUD();
    updateTurnGlow();
  }

  function getRingCoords(ring) {
    const t = ring, l = ring, b = size - 1 - ring, r = size - 1 - ring;
    if (t > b || l > r) return [];
    const out = [];
    for (let c = l; c <= r; c++) out.push([t, c]);          // top
    for (let rr = t + 1; rr <= b; rr++) out.push([rr, r]);  // right
    if (b > t)   for (let c = r - 1; c >= l; c--) out.push([b, c]);       // bottom
    if (r > l)   for (let rr = b - 1; rr > t; rr--) out.push([rr, l]);    // left
    return out;
  }

  function rotateRingCCW(coords) {
    if (coords.length <= 1) return;
    const vals = coords.map(([r, c]) => board[r][c]);
    vals.push(vals.shift()); // CCW shift
    coords.forEach(([r, c], i) => board[r][c] = vals[i]);
  }

  // ----- Animation engine (pixel-perfect floaters) -----
  function animateRingsCCW(ringCoordsList) {
    const floats = [];
    const promises = [];

    const boardRect = boardEl.getBoundingClientRect();
    const cellMetrics = (r, c) => {
      const cell = boardEl.children[r * size + c];
      const rect = cell.getBoundingClientRect();
      const center = {
        x: rect.left - boardRect.left + rect.width / 2,
        y: rect.top  - boardRect.top  + rect.height / 2
      };
      const dia = Math.min(rect.width, rect.height) * 0.70; // 70% circle
      return { center, dia };
    };

    for (const coords of ringCoordsList) {
      const len = coords.length;
      for (let i = 0; i < len; i++) {
        const [sr, sc] = coords[i];
        const val = board[sr][sc];
        if (val === 0) continue;

        const dst = (i - 1 + len) % len;  // CCW target
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
        floater.style.transitionDuration = `${ANIM_MS}ms`;

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

  // ----- Win detection -----
  function findWinningRun(player) {
    const dirs = [[0,1],[1,0],[1,1],[1,-1]]; // →, ↓, ↘, ↙
    for (let r = 0; r < size; r++) {
      for (let c = 0; c < size; c++) {
        if (board[r][c] !== player) continue;
        for (const [dr, dc] of dirs) {
          const run = [];
          for (let k = 0; k < CONNECT; k++) {
            const rr = r + dr * k, cc = c + dc * k;
            if (rr < 0 || rr >= size || cc < 0 || cc >= size) break;
            if (board[rr][cc] !== player) break;
            run.push([rr, cc]);
          }
          if (run.length === CONNECT) return run;
        }
      }
    }
    return null;
  }

  // ----- Direction triangles (fixed map) -----
  function getFixedAngle(r, c) {
    const map = (size === 6) ? DIR6 : DIR4;
    const d = map[r]?.[c] ?? "U";
    return DEG[d] ?? 0;
  }

  // ----- History -----
  function pushHistory() {
    history.push({
      board: board.map(row => row.slice()),
      currentPlayer,
      phase,
      winner,
      winnerRun: winnerRun ? winnerRun.map(p => [...p]) : null
    });
  }
})();
