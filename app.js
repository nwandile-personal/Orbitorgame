// Orbiter Logic Chess — Vs AI build (pass-n-play + AI levels + alternating starter + win counters)
(() => {
  // ---------- Config ----------
  const AUTO_DELAY = 1000;
  const ANIM_MS = 300;
  const HUMAN = 1;
  const AI = 2;

  // ---------- State ----------
  let size = 4;
  let connect = 4;
  let board = [];
  let currentPlayer = HUMAN;
  let phase = "place";
  let winner = 0;
  let winnerRun = null;
  let history = [];
  let isAnimating = false;
  let autoTimer = null;
  let mode = 'ai';
  let aiLevel = 'medium';
  let wins = { p1: 0, p2: 0 };
  let startingPlayer = HUMAN;
  let aiThinking = false;

  // ---------- Direction maps (visual only) ----------
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

  // ---------- DOM ----------
  const tabSettings = document.getElementById("tabSettings");
  const tabGame = document.getElementById("tabGame");
  const panelSettings = document.getElementById("panelSettings");
  const panelGame = document.getElementById("panelGame");
  const startGameBtn = document.getElementById("startGame");
  const boardFrame = document.getElementById("boardFrame");
  const boardEl = document.getElementById("board");
  const statusEl = document.getElementById("status");
  const winsEl = document.getElementById("wins");
  const btnUndo = document.getElementById("undo");
  const btnNew = document.getElementById("newGame");
  const postGameBar = document.getElementById("postGameBar");
  const postGameMsg = document.getElementById("postGameMsg");
  const btnContinue = document.getElementById("btnContinue");
  const btnGoBack = document.getElementById("btnGoBack");
  const aiConfigGroup = document.getElementById("aiConfig");

  // ---------- Tabs ----------
  function setTab(which) {
    const isSettings = which === "settings";
    tabSettings.setAttribute("aria-selected", isSettings);
    tabGame.setAttribute("aria-selected", !isSettings);
    panelSettings.classList.toggle("hidden", !isSettings);
    panelGame.classList.toggle("hidden", isSettings);
  }
  tabSettings.addEventListener("click", () => setTab("settings"));
  tabGame.addEventListener("click", () => setTab("game"));
  setTab("settings");

  // ---------- Settings ----------
  document.querySelectorAll("input[name='mode']").forEach(radio => {
    radio.addEventListener("change", () => {
      const val = document.querySelector("input[name='mode']:checked").value;
      aiConfigGroup.style.display = (val === 'ai') ? '' : 'none';
    });
  });
  aiConfigGroup.style.display = '';

  startGameBtn.addEventListener("click", () => {
    mode = document.querySelector("input[name='mode']:checked")?.value ?? 'ai';
    aiLevel = document.querySelector("input[name='aiLevel']:checked")?.value ?? 'medium';
    size = parseInt(document.querySelector("input[name='gridSize']:checked").value, 10);
    connect = (size === 6 ? 5 : 4);
    wins = { p1: 0, p2: 0 };
    startingPlayer = HUMAN;
    hidePostBar();
    init();
    setTab("game");
  });

  // ---------- Init ----------
  function init() {
    clearTimeout(autoTimer); autoTimer = null;
    aiThinking = false;
    boardEl.style.gridTemplateColumns = `repeat(${size}, var(--cell))`;
    board = Array.from({ length: size }, () => Array(size).fill(0));
    currentPlayer = startingPlayer;
    phase = "place";
    winner = 0;
    winnerRun = null;
    history = [];
    isAnimating = false;
    boardEl.classList.remove("animating");
    updateTurnGlow();
    render();
    updateHUD();

    if (maybeDeclareDrawIfNoMoves()) return;
    maybeTriggerAI();
  }

  // ---------- Render ----------
  function render() {
    const allowHumanClicks = (mode === 'pass') || (mode === 'ai' && currentPlayer === HUMAN);
    boardEl.innerHTML = "";
    for (let r = 0; r < size; r++) {
      for (let c = 0; c < size; c++) {
        const cell = document.createElement("div");
        cell.className = "cell";
        if ((r + c) % 2 === 1) cell.classList.add("cb");
        cell.dataset.r = r; cell.dataset.c = c;

        const deg = getFixedAngle(r, c);
        const tri = document.createElement("div");
        tri.className = "tri";
        tri.style.setProperty("--deg", `${deg}deg`);
        cell.appendChild(tri);

        if (board[r][c] !== 0) {
          const piece = document.createElement("div");
          piece.className = "piece " + (board[r][c] === 1 ? "p1" : "p2");
          cell.appendChild(piece);
          cell.classList.add("has-piece");
        }

        if (!winner && !isAnimating && phase === "place" && board[r][c] === 0 && allowHumanClicks) {
          cell.addEventListener("click", onPlace, { passive: true });
          cell.style.cursor = "pointer";
        } else {
          cell.style.cursor = "default";
        }
        boardEl.appendChild(cell);
      }
    }

    if (winnerRun) {
      for (const [rr, cc] of winnerRun) {
        boardEl.children[rr * size + cc]?.classList.add("win");
      }
    }
  }

  function updateHUD() {
    let text = "";
    if (phase === "end" && winner === 0) text = "Draw!";
    else if (winner) text = `Player ${winner} wins!`;
    else if (phase === "place") text = (currentPlayer === 1 ? "White to move" : "Black to move");
    statusEl.textContent = text;
    winsEl.textContent = `P1 (White): ${wins.p1}   P2 (Black): ${wins.p2}`;
  }

  function updateTurnGlow() {
    const active = !winner && phase !== "end";
    boardFrame.classList.toggle("turn1", active && currentPlayer === 1);
    boardFrame.classList.toggle("turn2", active && currentPlayer === 2);
    if (!active) boardFrame.classList.remove("turn1", "turn2");
  }

  // ---------- Interactions ----------
  function onPlace(e) {
    if (winner || isAnimating || phase !== "place") return;
    const r = +e.currentTarget.dataset.r;
    const c = +e.currentTarget.dataset.c;
    if (board[r][c] !== 0) return;
    placeAt(r, c);
  }

  function placeAt(r, c) {
    pushHistory();
    board[r][c] = currentPlayer;
    phase = "rotate";
    render();
    updateHUD();
    updateTurnGlow();
    scheduleAutoRotate();
  }

  btnUndo.addEventListener("click", () => {
    if (history.length === 0 || isAnimating) return;
    clearTimeout(autoTimer); autoTimer = null;
    aiThinking = false;
    const s = history.pop();
    board = s.board.map(row => row.slice());
    currentPlayer = s.currentPlayer;
    phase = s.phase;
    winner = s.winner;
    winnerRun = s.winnerRun ? s.winnerRun.map(p => [...p]) : null;
    render();
    updateHUD();
    updateTurnGlow();
    if (phase === "rotate" && !winner) scheduleAutoRotate();
  });

  btnNew.addEventListener("click", () => {
    hidePostBar();
    init();
  });

  function scheduleAutoRotate() {
    clearTimeout(autoTimer); autoTimer = null;
    if (winner || isAnimating || phase !== "rotate") return;
    autoTimer = setTimeout(() => {
      if (!winner && phase === "rotate") rotateAnimated();
    }, AUTO_DELAY);
  }

  // ---------- Rotation ----------
  async function rotateAnimated() {
    pushHistory();
    isAnimating = true;
    boardEl.classList.add("animating");

    const rings = Math.floor(size / 2);
    const ringCoordsList = [];
    for (let ring = 0; ring < rings; ring++) ringCoordsList.push(getRingCoords(size, ring));

    await animateRingsCCW(ringCoordsList);
    for (const coords of ringCoordsList) rotateRingCCW(board, coords);

    const other = (currentPlayer === 1 ? 2 : 1);
    const runCur = findWinningRunOn(board, size, connect, currentPlayer);
    const runOther = findWinningRunOn(board, size, connect, other);

    if (runCur && runOther) {
      winner = 0; winnerRun = null; phase = "end";
      onRoundDraw();
    } else if (runCur) {
      winner = currentPlayer; winnerRun = runCur; phase = "end";
      onRoundEnd();
    } else if (runOther) {
      winner = other; winnerRun = runOther; phase = "end";
      onRoundEnd();
    } else {
      currentPlayer = other;
      phase = "place";
      if (maybeDeclareDrawIfNoMoves()) {
        isAnimating = false; boardEl.classList.remove("animating");
        render(); updateHUD(); updateTurnGlow();
        return;
      }
    }

    isAnimating = false;
    boardEl.classList.remove("animating");
    render(); updateHUD(); updateTurnGlow();
    maybeTriggerAI();
  }

  // ---------- Ring helpers ----------
  function getRingCoords(n, ring) {
    const t = ring, l = ring, b = n - 1 - ring, r = n - 1 - ring;
    if (t > b || l > r) return [];
    const out = [];
    for (let c = l; c <= r; c++) out.push([t, c]);
    for (let rr = t + 1; rr <= b; rr++) out.push([rr, r]);
    if (b > t) for (let c = r - 1; c >= l; c--) out.push([b, c]);
    if (r > l) for (let rr = b - 1; rr > t; rr--) out.push([rr, l]);
    return out;
  }

  function rotateRingCCW(mat, coords) {
    if (coords.length <= 1) return;
    const vals = coords.map(([r, c]) => mat[r][c]);
    vals.push(vals.shift());
    coords.forEach(([r, c], i) => mat[r][c] = vals[i]);
  }

  // ---------- Animation engine ----------
  function animateRingsCCW(ringCoordsList) {
    const floats = [];
    const promises = [];
    const boardRect = boardEl.getBoundingClientRect();

    const cellMetrics = (r, c) => {
      const cell = boardEl.children[r * size + c];
      const rect = cell.getBoundingClientRect();
      const center = {
        x: rect.left - boardRect.left + rect.width / 2,
        y: rect.top - boardRect.top + rect.height / 2
      };
      const dia = Math.min(rect.width, rect.height) * 0.70;
      return { center, dia };
    };

    for (const coords of ringCoordsList) {
      const len = coords.length;
      for (let i = 0; i < len; i++) {
        const [sr, sc] = coords[i];
        const val = board[sr][sc];
        if (val === 0) continue;

        const dst = (i - 1 + len) % len;
        const [dr, dc] = coords[dst];
        const { center: from, dia } = cellMetrics(sr, sc);
        const { center: to } = cellMetrics(dr, dc);
        const dx = to.x - from.x, dy = to.y - from.y;

        const floater = document.createElement("div");
        floater.className = "floating " + (val === 1 ? "p1" : "p2");
        floater.style.left = `${from.x}px`;
        floater.style.top = `${from.y}px`;
        floater.style.width = `${dia}px`;
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

  // ---------- Win detection ----------
  function findWinningRunOn(mat, n, K, player) {
    const dirs = [[0,1],[1,0],[1,1],[1,-1]];
    for (let r = 0; r < n; r++) {
      for (let c = 0; c < n; c++) {
        if (mat[r][c] !== player) continue;
        for (const [dr, dc] of dirs) {
          const run = [];
          for (let k = 0; k < K; k++) {
            const rr = r + dr * k, cc = c + dc * k;
            if (rr < 0 || rr >= n || cc < 0 || cc >= n) break;
            if (mat[rr][cc] !== player) break;
            run.push([rr, cc]);
          }
          if (run.length === K) return run;
        }
      }
    }
    return null;
  }

  // ---------- Direction triangles (visual map) ----------
  function getFixedAngle(r, c) {
    const map = (size === 6) ? DIR6 : DIR4;
    const d = map[r]?.[c] ?? "U";
    return DEG[d] ?? 0;
  }

  // ---------- History ----------
  function pushHistory() {
    history.push({
      board: board.map(row => row.slice()),
      currentPlayer,
      phase,
      winner,
      winnerRun: winnerRun ? winnerRun.map(p => [...p]) : null
    });
  }

  // ---------- Round end / post bar ----------
  function onRoundEnd() {
    if (winner === 1) wins.p1++;
    else if (winner === 2) wins.p2++;
    updateHUD();
    postGameMsg.textContent = `Player ${winner} wins!`;
    showPostBar();
  }

  function onRoundDraw() {
    updateHUD();
    postGameMsg.textContent = `Draw!`;
    showPostBar();
  }

  function showPostBar() { postGameBar.classList.remove("hidden"); }
  function hidePostBar() { postGameBar.classList.add("hidden"); postGameMsg.textContent = ""; }

  btnContinue.addEventListener("click", () => {
    startingPlayer = (startingPlayer === HUMAN ? AI : HUMAN);
    hidePostBar();
    init();
  });

  btnGoBack.addEventListener("click", () => {
    wins = { p1: 0, p2: 0 };
    hidePostBar();
    updateHUD();
    setTab("settings");
  });

  // ---------- AI ----------
  function maybeTriggerAI() {
    if (mode !== 'ai') return;
    if (winner || isAnimating || phase !== "place") return;
    if (currentPlayer !== AI) return;
    if (aiThinking) return;

    aiThinking = true;
    setTimeout(() => {
      const [r, c] = chooseAIMove(board, size, connect, currentPlayer, aiLevel);
      aiThinking = false;
      if (winner || isAnimating || phase !== "place") return;
      if (r != null && c != null && board[r][c] === 0) {
        placeAt(r, c);
      } else {
        const empties = [];
        for (let rr = 0; rr < size; rr++)
          for (let cc = 0; cc < size; cc++)
            if (board[rr][cc] === 0) empties.push([rr, cc]);
        if (empties.length) {
          const [rr, cc] = empties[Math.floor(Math.random() * empties.length)];
          placeAt(rr, cc);
        }
      }
    }, 180);
  }

  function chooseAIMove(mat, n, K, playerAI, level) {
    const opponent = (playerAI === 1 ? 2 : 1);
    const tact = findImmediateWinMove(mat, n, K, playerAI);
    if (tact) return tact;

    if (level === 'easy') {
      const block = findImmediateWinMove(mat, n, K, opponent);
      if (block) return block;
      const empties = getEmptyCells(mat, n);
      return empties.length ? empties[Math.floor(Math.random()*empties.length)] : [null, null];
    }

    const depth = (level === 'hard') ? 3 : 2;
    const moves = getEmptyCells(mat, n).sort((a, b) => centerScore(b, n) - centerScore(a, n));
    let best = -Infinity, bestMove = null;
    let alpha = -Infinity, beta = Infinity;
    for (const [r, c] of moves) {
      const next = simulatePlaceRotate(mat, n, K, playerAI, r, c);
      const value = minimax(next.board, n, K, depth - 1, false, playerAI, alpha, beta);
      if (value > best) { best = value; bestMove = [r, c]; }
      alpha = Math.max(alpha, best);
      if (beta <= alpha) break;
    }
    return bestMove ?? [null, null];
  }

  function minimax(mat, n, K, depth, isMax, perspective, alpha, beta) {
    const opp = (perspective === 1 ? 2 : 1);
    if (findWinningRunOn(mat, n, K, perspective)) return 1000000 + depth;
    if (findWinningRunOn(mat, n, K, opp)) return -1000000 - depth;
    if (depth === 0 || getEmptyCells(mat, n).length === 0) {
      return heuristic(mat, n, K, perspective);
    }

    const moves = getEmptyCells(mat, n).sort((a, b) => centerScore(b, n) - centerScore(a, n));

    if (isMax) {
      let best = -Infinity;
      for (const [r, c] of moves) {
        const next = simulatePlaceRotate(mat, n, K, perspective, r, c);
        const val = minimax(next.board, n, K, depth - 1, false, perspective, alpha, beta);
        best = Math.max(best, val);
        alpha = Math.max(alpha, best);
        if (beta <= alpha) break;
      }
      return best;
    } else {
      let best = Infinity;
      const oppPlayer = (perspective === 1 ? 2 : 1);
      for (const [r, c] of moves) {
        const next = simulatePlaceRotate(mat, n, K, oppPlayer, r, c);
        const val = minimax(next.board, n, K, depth - 1, true, perspective, alpha, beta);
        best = Math.min(best, val);
        beta = Math.min(beta, best);
        if (beta <= alpha) break;
      }
      return best;
    }
  }

  // --- AI helpers (pure) ---
  function getEmptyCells(mat, n) {
    const out = [];
    for (let r = 0; r < n; r++)
      for (let c = 0; c < n; c++)
        if (mat[r][c] === 0) out.push([r, c]);
    return out;
  }
  function centerScore([r, c], n) {
    const cr = (n - 1) / 2, cc = (n - 1) / 2;
    const dr = Math.abs(r - cr), dc = Math.abs(c - cc);
    return -(dr + dc);
  }
  function cloneBoard(mat) { return mat.map(row => row.slice()); }
  function simulatePlaceRotate(mat, n, K, player, r, c) {
    const b = cloneBoard(mat);
    b[r][c] = player;
    const rings = Math.floor(n / 2);
    for (let ring = 0; ring < rings; ring++) {
      const coords = getRingCoords(n, ring);
      rotateRingCCW(b, coords);
    }
    const run = findWinningRunOn(b, n, K, player);
    return { board: b, win: !!run };
  }
  function findImmediateWinMove(mat, n, K, player) {
    for (let r = 0; r < n; r++) {
      for (let c = 0; c < n; c++) {
        if (mat[r][c] !== 0) continue;
        const next = simulatePlaceRotate(mat, n, K, player, r, c);
        if (next.win) return [r, c];
      }
    }
    return null;
  }
  function heuristic(mat, n, K, perspective) {
    const opp = (perspective === 1 ? 2 : 1);
    const dirs = [[0,1],[1,0],[1,1],[1,-1]];
    const W = (K === 4) ? [0,1,4,12,1000] : [0,1,3,9,30,1200];
    let score = 0;

    for (let r = 0; r < n; r++) {
      for (let c = 0; c < n; c++) {
        for (const [dr, dc] of dirs) {
          const cells = [];
          for (let k = 0; k < K; k++) {
            const rr = r + dr * k, cc = c + dc * k;
            if (rr < 0 || rr >= n || cc < 0 || cc >= n) { cells.length = 0; break; }
            cells.push(mat[rr][cc]);
          }
          if (cells.length !== K) continue;
          const own = cells.filter(v => v === perspective).length;
          const enm = cells.filter(v => v === opp).length;
          if (own > 0 && enm > 0) continue;
          if (own > 0) score += W[own];
          if (enm > 0) score -= W[enm] * 1.1;
        }
      }
    }

    for (let r = 0; r < n; r++)
      for (let c = 0; c < n; c++)
        if (mat[r][c] === perspective) score += 0.05 * (-centerScore([r, c], n));
        else if (mat[r][c] === opp) score -= 0.05 * (-centerScore([r, c], n));
    return score;
  }

  // ---------- Draw helpers ----------
  function onRoundDraw() {
    updateHUD();
    postGameMsg.textContent = `Draw!`;
    showPostBar();
  }
  function maybeDeclareDrawIfNoMoves() {
    const empties = getEmptyCells(board, size);
    if (empties.length === 0 && !winner && phase === "place") {
      winner = 0; winnerRun = null; phase = "end";
      onRoundDraw();
      return true;
    }
    return false;
  }
})();
