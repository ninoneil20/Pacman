(() => {
  const canvas = document.getElementById('game');
  const ctx = canvas.getContext('2d');
  const scoreEl = document.getElementById('score');
  const highScoreEl = document.getElementById('highScore');
  const btnPlay = document.getElementById('btnPlay');
  const btnPause = document.getElementById('btnPause');
  const pacColorInput = document.getElementById('pacColor');
  const ghostColorInput = document.getElementById('ghostColor');
  const bgColorInput = document.getElementById('bgColor');
  const gridSizeSelect = document.getElementById('gridSize');
  const speedInput = document.getElementById('speed');
  const applyBtn = document.getElementById('apply');

  let TILE = parseInt(gridSizeSelect.value, 10);
  const WIDTH = canvas.width;
  const HEIGHT = canvas.height;
  let COLS = Math.floor(WIDTH / TILE);
  let ROWS = Math.floor(HEIGHT / TILE);

  let pacColor = pacColorInput.value;
  let ghostColor = ghostColorInput.value;
  let bgColor = bgColorInput.value;
  let tickDelay = parseInt(speedInput.value, 10);
  let running = false;
  let score = 0;
  let highScore = localStorage.getItem('pacmanHighScore') || 0;
  highScoreEl.textContent = `High: ${highScore}`;

  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

  function genMaze() {
    COLS = Math.floor(WIDTH / TILE);
    ROWS = Math.floor(HEIGHT / TILE);
    const maze = new Array(ROWS).fill(0).map(() => new Array(COLS).fill(0));
    for (let r = 0; r < ROWS; r++) {
      for (let c = 0; c < COLS; c++) {
        if (r === 0 || r === ROWS - 1 || c === 0 || c === COLS - 1) maze[r][c] = 1;
      }
    }
    for (let r = 2; r < ROWS - 2; r += 4) {
      for (let c = 2; c < COLS - 2; c += 6) {
        for (let rr = 0; rr < 2; rr++) {
          for (let cc = 0; cc < 3; cc++) {
            const rr2 = r + rr, cc2 = c + cc;
            if (rr2 > 0 && rr2 < ROWS - 1 && cc2 > 0 && cc2 < COLS - 1) maze[rr2][cc2] = 1;
          }
        }
      }
    }
    const midR = Math.floor(ROWS / 2), midC = Math.floor(COLS / 2);
    for (let c = 1; c < COLS - 1; c++) maze[midR][c] = 0;
    for (let r = 1; r < ROWS - 1; r++) maze[r][midC] = 0;
    return maze;
  }

  let maze = genMaze();
  let dots = [];
  let powerups = [];

  function fillDots() {
    dots = []; powerups = [];
    for (let r = 1; r < ROWS - 1; r++) {
      for (let c = 1; c < COLS - 1; c++) {
        if (maze[r][c] === 0) {
          if (Math.random() < 0.03) powerups.push({ c, r });
          else if (Math.random() < 0.65) dots.push({ c, r });
        }
      }
    }
    if (powerups.length < 2) {
      powerups.push({ c: 2, r: 2 });
      powerups.push({ c: COLS - 3, r: ROWS - 3 });
    }
  }

  const player = { c: 1, r: 1, dir: null, nextDir: null };
  const ghost = { c: COLS - 2, r: ROWS - 2, dir: null, vulnerable: false, vulnerableTimer: 0 };

  function cellX(c) { return c * TILE + TILE / 2; }
  function cellY(r) { return r * TILE + TILE / 2; }

  const dirs = {
    up: { dc: 0, dr: -1 },
    down: { dc: 0, dr: 1 },
    left: { dc: -1, dr: 0 },
    right: { dc: 1, dr: 0 }
  };

  function canMove(c, r) {
    if (c < 0 || c >= COLS || r < 0 || r >= ROWS) return false;
    return maze[r][c] === 0;
  }

  // --- Input Logic (Mobile + Keyboard Combined) ---
  function setNextDir(d) { if (running) player.nextDir = d; }

  window.addEventListener('keydown', (ev) => {
    const key = ev.key.toLowerCase();
    if (key === 'arrowup' || key === 'w') setNextDir('up');
    if (key === 'arrowdown' || key === 's') setNextDir('down');
    if (key === 'arrowleft' || key === 'a') setNextDir('left');
    if (key === 'arrowright' || key === 'd') setNextDir('right');
  });

  const mobileMap = { 'ctrl-up': 'up', 'ctrl-down': 'down', 'ctrl-left': 'left', 'ctrl-right': 'right' };
  Object.entries(mobileMap).forEach(([id, d]) => {
    document.getElementById(id).addEventListener('touchstart', (e) => { e.preventDefault(); setNextDir(d); });
  });

  let tickTimer = null;

  function startLoop() {
    stopLoop();
    tickTimer = setInterval(step, tickDelay);
    running = true;
  }
  function stopLoop() {
    running = false;
    if (tickTimer) clearInterval(tickTimer);
    tickTimer = null;
  }

  function resetGame() {
    maze = genMaze();
    fillDots();
    player.c = 1; player.r = 1; player.dir = null; player.nextDir = null;
    ghost.c = COLS - 2; ghost.r = ROWS - 2; ghost.dir = null; ghost.vulnerable = false;
    ghost.vulnerableTimer = 0;
    score = 0;
    updateScore();
    render();
  }

  function gameOver() {
    if (score > highScore) {
      highScore = score;
      localStorage.setItem('pacmanHighScore', highScore);
    }
    alert("GAME OVER!");
  }

  function chooseGhostDir() {
    const attempts = [];
    const dc = player.c - ghost.c;
    const dr = player.r - ghost.r;
    if (Math.abs(dc) > Math.abs(dr)) {
      attempts.push(dc > 0 ? 'right' : 'left');
      if (dr !== 0) attempts.push(dr > 0 ? 'down' : 'up');
    } else {
      attempts.push(dr > 0 ? 'down' : 'up');
      if (dc !== 0) attempts.push(dc > 0 ? 'right' : 'left');
    }
    ['up', 'down', 'left', 'right'].forEach(d => { if (!attempts.includes(d)) attempts.push(d); });
    for (const d of attempts) {
      const t = dirs[d];
      if (canMove(ghost.c + t.dc, ghost.r + t.dr)) return d;
    }
    return null;
  }

  function step() {
    if (player.nextDir) {
      const nd = dirs[player.nextDir];
      if (canMove(player.c + nd.dc, player.r + nd.dr)) player.dir = player.nextDir;
    }
    if (player.dir) {
      const d = dirs[player.dir];
      if (canMove(player.c + d.dc, player.r + d.dr)) {
        player.c += d.dc; player.r += d.dr;
      } else player.dir = null;
    }

    for (let i = 0; i < dots.length; i++) {
      if (dots[i].c === player.c && dots[i].r === player.r) {
        const open = findRandomOpenCell();
        if (open) dots[i] = open;
        score += 10; updateScore(); break;
      }
    }

    for (let i = 0; i < powerups.length; i++) {
      if (powerups[i].c === player.c && powerups[i].r === player.r) {
        const open = findRandomOpenCell();
        if (open) powerups[i] = open;
        ghost.vulnerable = true;
        ghost.vulnerableTimer = Math.floor(6000 / tickDelay);
        score += 50; updateScore(); break;
      }
    }

    if (Math.random() < 0.85) {
      const gdir = chooseGhostDir();
      if (gdir) ghost.dir = gdir;
    }
    if (ghost.dir) {
      const d = dirs[ghost.dir];
      if (canMove(ghost.c + d.dc, ghost.r + d.dr)) {
        ghost.c += d.dc; ghost.r += d.dr;
      } else ghost.dir = null;
    }

    if (ghost.vulnerable) {
      ghost.vulnerableTimer--;
      if (ghost.vulnerableTimer <= 0) { ghost.vulnerable = false; ghost.vulnerableTimer = 0; }
    }

    if (player.c === ghost.c && player.r === ghost.r) {
      if (ghost.vulnerable) {
        score += 200; updateScore();
        ghost.c = COLS - 2; ghost.r = ROWS - 2;
        ghost.vulnerable = false; ghost.vulnerableTimer = 0;
      } else {
        gameOver();
        score = 0; updateScore();
        TILE = [16, 20, 24, 28][Math.floor(Math.random() * 4)];
        COLS = Math.floor(WIDTH / TILE);
        ROWS = Math.floor(HEIGHT / TILE);
        maze = genMaze(); fillDots();
        player.c = 1; player.r = 1; player.dir = null; player.nextDir = null;
        ghost.c = COLS - 2; ghost.r = ROWS - 2; ghost.dir = null; ghost.vulnerable = false; ghost.vulnerableTimer = 0;
      }
    }
    render();
  }

  function findRandomOpenCell() {
    let attempts = 0;
    while (attempts < 2000) {
      const c = 1 + Math.floor(Math.random() * (COLS - 2));
      const r = 1 + Math.floor(Math.random() * (ROWS - 2));
      if (maze[r][c] === 0) return { c, r };
      attempts++;
    }
    return null;
  }

  function render() {
    ctx.fillStyle = bgColor;
    ctx.fillRect(0, 0, WIDTH, HEIGHT);
    ctx.fillStyle = '#1e90ff';
    for (let r = 0; r < ROWS; r++) {
      for (let c = 0; c < COLS; c++) {
        if (maze[r][c] === 1) {
          ctx.fillStyle = '#204080';
          ctx.fillRect(c * TILE, r * TILE, TILE, TILE);
        }
      }
    }
    ctx.fillStyle = '#fff';
    dots.forEach(pt => {
      const x = cellX(pt.c), y = cellY(pt.r);
      ctx.beginPath(); ctx.arc(x, y, TILE * 0.12, 0, Math.PI * 2); ctx.fill();
    });
    powerups.forEach(pt => {
      const x = cellX(pt.c), y = cellY(pt.r);
      ctx.beginPath(); ctx.arc(x, y, TILE * 0.28, 0, Math.PI * 2);
      ctx.fillStyle = '#ff9800'; ctx.fill();
    });

    const px = cellX(player.c), py = cellY(player.r);
    ctx.fillStyle = pacColor;
    const mouthAngle = 0.25 * Math.PI;
    let start = 0, end = Math.PI * 2;
    if (player.dir === 'right') { start = mouthAngle; end = -mouthAngle; }
    else if (player.dir === 'left') { start = Math.PI - mouthAngle; end = Math.PI + mouthAngle; }
    else if (player.dir === 'up') { start = -Math.PI / 2 + mouthAngle; end = -Math.PI / 2 - mouthAngle; }
    else if (player.dir === 'down') { start = Math.PI / 2 + mouthAngle; end = Math.PI / 2 - mouthAngle; }
    ctx.beginPath(); ctx.moveTo(px, py); ctx.arc(px, py, TILE * 0.45, start, end, false); ctx.closePath(); ctx.fill();

    const gx = cellX(ghost.c), gy = cellY(ghost.r);
    ctx.beginPath(); ctx.arc(gx, gy - TILE * 0.12, TILE * 0.36, Math.PI, 0);
    ctx.fillStyle = ghost.vulnerable ? '#66ffff' : ghostColor; ctx.fill();
    ctx.beginPath(); ctx.rect(gx - TILE * 0.36, gy - TILE * 0.12, TILE * 0.72, TILE * 0.6); ctx.fill();
    ctx.fillStyle = '#fff';
    ctx.beginPath(); ctx.arc(gx - TILE * 0.12, gy - TILE * 0.09, TILE * 0.10, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.arc(gx + TILE * 0.12, gy - TILE * 0.09, TILE * 0.10, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#000';
    ctx.beginPath(); ctx.arc(gx - TILE * 0.12, gy - TILE * 0.09, TILE * 0.05, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.arc(gx + TILE * 0.12, gy - TILE * 0.09, TILE * 0.05, 0, Math.PI * 2); ctx.fill();
  }

  function updateScore() {
    scoreEl.textContent = `Score: ${score}`;
    highScoreEl.textContent = `High: ${highScore}`;
  }

  function applySettings() {
    TILE = parseInt(gridSizeSelect.value, 10);
    COLS = Math.floor(WIDTH / TILE);
    ROWS = Math.floor(HEIGHT / TILE);
    pacColor = pacColorInput.value;
    ghostColor = ghostColorInput.value;
    bgColor = bgColorInput.value;
    tickDelay = parseInt(speedInput.value, 10);
    maze = genMaze(); fillDots();
    player.c = 1; player.r = 1; player.dir = null; player.nextDir = null;
    ghost.c = Math.max(2, COLS - 2); ghost.r = Math.max(2, ROWS - 2);
    if (running) startLoop();
    render();
  }

  btnPlay.addEventListener('click', () => { if (!running) startLoop(); });
  btnPause.addEventListener('click', () => { stopLoop(); });
  applyBtn.addEventListener('click', applySettings);

  resetGame();
  render();

  window.addEventListener('blur', () => { stopLoop(); });
})();