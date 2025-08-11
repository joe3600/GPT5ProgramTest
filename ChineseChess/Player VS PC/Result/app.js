/* Xiangqi (Chinese Chess) — Front-end only, Canvas-based, with AI */

(() => {
  const canvas = document.getElementById('board');
  const ctx = canvas.getContext('2d');
  const W = canvas.width;   // 540
  const H = canvas.height;  // 600
  const CELL = 60;          // 9x10 => 60 px cells
  const COLS = 9;
  const ROWS = 10;

  const statusEl = document.getElementById('status');
  const sideSelect = document.getElementById('sideSelect');
  const depthSelect = document.getElementById('depthSelect');
  const newGameBtn = document.getElementById('newGameBtn');
  const undoBtn = document.getElementById('undoBtn');

  // Board representation: array of length 90; each item is piece code or null.
  // Red pieces are uppercase: R,N,B,A,K,C,P; Black lowercase: r,n,b,a,k,c,p
  let board = null;
  let history = []; // for undo (stores {board, turn})
  let turn = 'red'; // 'red' or 'black'
  let humanSide = 'red';
  let aiThinking = false;
  let selected = null; // index of selected square
  let legalMovesFromSelected = [];

  // Piece values (for evaluation)
  const VALUES = {
    K: 10000, A: 110, B: 110, R: 500, N: 270, C: 290, P: 60,
    k: -10000, a: -110, b: -110, r: -500, n: -270, c: -290, p: -60
  };

  // Mapping to display characters
  const CHAR = {
    R: '車', N: '馬', B: '相', A: '仕', K: '帥', C: '炮', P: '兵',
    r: '車', n: '馬', b: '象', a: '士', k: '將', c: '砲', p: '卒'
  };

  // Utility
  const idx = (r, c) => r * COLS + c;
  const rc = i => [Math.floor(i / COLS), i % COLS];
  const inBounds = (r, c) => r >= 0 && r < ROWS && c >= 0 && c < COLS;
  const sideOf = p => !p ? null : (p === p.toUpperCase() ? 'red' : 'black');

  // Initial setup
  function initialBoard() {
    const b = Array(ROWS * COLS).fill(null);

    // Black back rank
    b[idx(0,0)]='r'; b[idx(0,1)]='n'; b[idx(0,2)]='b'; b[idx(0,3)]='a'; b[idx(0,4)]='k';
    b[idx(0,5)]='a'; b[idx(0,6)]='b'; b[idx(0,7)]='n'; b[idx(0,8)]='r';
    // Black cannons
    b[idx(2,1)]='c'; b[idx(2,7)]='c';
    // Black soldiers
    [0,2,4,6,8].forEach(c => b[idx(3,c)]='p');

    // Red back rank
    b[idx(9,0)]='R'; b[idx(9,1)]='N'; b[idx(9,2)]='B'; b[idx(9,3)]='A'; b[idx(9,4)]='K';
    b[idx(9,5)]='A'; b[idx(9,6)]='B'; b[idx(9,7)]='N'; b[idx(9,8)]='R';
    // Red cannons
    b[idx(7,1)]='C'; b[idx(7,7)]='C';
    // Red soldiers
    [0,2,4,6,8].forEach(c => b[idx(6,c)]='P');

    return b;
  }

  // Drawing
  function drawBoard() {
    // Clear background (border provided by parent container)
    ctx.fillStyle = '#f5deb3';
    ctx.fillRect(0, 0, W, H);

    // River shading
    ctx.fillStyle = '#f0d9a6';
    ctx.fillRect(0, 4 * CELL, W, CELL + 0.5);

    // Grid
    ctx.strokeStyle = '#7c5f2e';
    ctx.lineWidth = 2;

    // Horizontal lines
    for (let r = 0; r < ROWS; r++) {
      line(0, r * CELL, W, r * CELL);
    }
    // Vertical lines (split at river gap as in Xiangqi design)
    for (let c = 0; c < COLS; c++) {
      // top part
      line(c * CELL, 0, c * CELL, 4 * CELL);
      // bottom part
      line(c * CELL, 5 * CELL, c * CELL, H);
    }

    // Outer border
    ctx.strokeStyle = '#5c4721';
    ctx.lineWidth = 3;
    rect(0, 0, W, H);

    // Palace diagonals
    ctx.strokeStyle = '#7c5f2e';
    ctx.lineWidth = 2;
    // Top palace (black): rows 0..2, cols 3..5
    line(3 * CELL, 0, 5 * CELL, 2 * CELL);
    line(5 * CELL, 0, 3 * CELL, 2 * CELL);
    // Bottom palace (red): rows 7..9, cols 3..5
    line(3 * CELL, 7 * CELL, 5 * CELL, 9 * CELL);
    line(5 * CELL, 7 * CELL, 3 * CELL, 9 * CELL);

    // River text (optional)
    ctx.fillStyle = 'rgba(0,0,0,0.25)';
    ctx.font = '24px serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('楚 河', W / 4, (4.5) * CELL);
    ctx.fillText('漢 界', (3 * W) / 4, (4.5) * CELL);

    // Highlights
    if (selected !== null) {
      const [sr, sc] = rc(selected);
      // Selected square
      drawCellHighlight(sr, sc, '#2b95ff');
      // Legal moves
      for (const mv of legalMovesFromSelected) {
        const [tr, tc] = rc(mv.to);
        drawDot(tr, tc, board[mv.to] ? '#d94848' : '#21c57b');
      }
    }

    // Draw pieces
    for (let i = 0; i < board.length; i++) {
      const p = board[i];
      if (!p) continue;
      const [r, c] = rc(i);
      drawPiece(r, c, p);
    }

    // Status
    statusEl.innerHTML = renderStatus();
  }

  function line(x1, y1, x2, y2) {
    ctx.beginPath();
    ctx.moveTo(0.5 + x1, 0.5 + y1);
    ctx.lineTo(0.5 + x2, 0.5 + y2);
    ctx.stroke();
  }

  function rect(x, y, w, h) {
    ctx.strokeRect(0.5 + x, 0.5 + y, w - 1, h - 1);
  }

  function drawPiece(r, c, code) {
    const x = c * CELL + CELL / 2;
    const y = r * CELL + CELL / 2;

    const isRed = code === code.toUpperCase();
    const ring = isRed ? '#b03a3a' : '#333';
    const fill = isRed ? '#ffe8e8' : '#f7f7f7';
    const text = isRed ? '#b32121' : '#1b1b1b';

    // Base disc
    ctx.beginPath();
    ctx.arc(x, y, CELL * 0.38, 0, Math.PI * 2);
    ctx.fillStyle = fill;
    ctx.fill();
    ctx.lineWidth = 3;
    ctx.strokeStyle = ring;
    ctx.stroke();

    // Inner ring
    ctx.beginPath();
    ctx.arc(x, y, CELL * 0.32, 0, Math.PI * 2);
    ctx.lineWidth = 1.5;
    ctx.strokeStyle = ring;
    ctx.stroke();

    // Character
    ctx.fillStyle = text;
    ctx.font = '28px serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(CHAR[code], x, y + 1);
  }

  function drawCellHighlight(r, c, color) {
    const x = c * CELL;
    const y = r * CELL;
    ctx.save();
    ctx.strokeStyle = color;
    ctx.lineWidth = 3;
    ctx.strokeRect(x + 3, y + 3, CELL - 6, CELL - 6);
    ctx.restore();
  }

  function drawDot(r, c, color) {
    const x = c * CELL + CELL / 2;
    const y = r * CELL + CELL / 2;
    ctx.beginPath();
    ctx.arc(x, y, 6.5, 0, Math.PI * 2);
    ctx.fillStyle = color;
    ctx.fill();
  }

  function renderStatus() {
    const inCheck = isInCheck(board, turn);
    const legal = generateLegalMoves(board, turn);
    const over = legal.length === 0;
    let s = '';

    if (over) {
      const winner = turn === 'red' ? 'Black' : 'Red';
      s += `<span class="badge">Game over</span> ${inCheck ? 'Checkmate' : 'Stalemate'} — <b>${winner}</b> wins`;
    } else {
      s += `Turn: <b class="${turn === 'red' ? 'turn-red' : 'turn-black'}">${turn.toUpperCase()}</b>`;
      if (inCheck) s += ' — <span class="badge">Check</span>';
      if (aiThinking) s += ' — AI is thinking...';
    }
    return s;
  }

  // Mouse handling
  canvas.addEventListener('mousedown', (e) => {
    if (aiThinking) return;
    const rect = canvas.getBoundingClientRect();
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;
    const x = (e.clientX - rect.left) * scaleX;
    const y = (e.clientY - rect.top) * scaleY;

    const c = Math.floor(x / CELL);
    const r = Math.floor(y / CELL);
    if (!inBounds(r, c)) return;

    const i = idx(r, c);
    const p = board[i];

    if (selected === null) {
      // pick a piece if it's yours and it's your turn
      if (p && sideOf(p) === turn && turn === humanSide) {
        selected = i;
        legalMovesFromSelected = generateLegalMoves(board, turn).filter(m => m.from === i);
        drawBoard();
      }
    } else {
      // if click same side piece, reselect
      if (p && sideOf(p) === turn && turn === humanSide) {
        selected = i;
        legalMovesFromSelected = generateLegalMoves(board, turn).filter(m => m.from === i);
        drawBoard();
        return;
      }
      // try to move
      const mv = legalMovesFromSelected.find(m => m.to === i);
      if (mv) {
        pushHistory();
        board = doMove(board, mv);
        selected = null;
        legalMovesFromSelected = [];
        switchTurn();
      } else {
        // click elsewhere cancels selection
        selected = null;
        legalMovesFromSelected = [];
        drawBoard();
      }
    }
  });

  newGameBtn.addEventListener('click', () => {
    resetGame();
  });

  undoBtn.addEventListener('click', () => {
    undo();
  });

  sideSelect.addEventListener('change', () => {
    humanSide = sideSelect.value;
    resetGame();
  });

  depthSelect.addEventListener('change', () => {
    // no immediate action; read on AI turn
  });

  function resetGame() {
    board = initialBoard();
    history = [];
    selected = null;
    legalMovesFromSelected = [];
    turn = 'red';
    aiThinking = false;
    drawBoard();
    maybeAIMove();
  }

  function pushHistory() {
    // store deep copy of board and turn for undo
    history.push({ board: board.slice(), turn });
  }

  function undo() {
    if (aiThinking || history.length === 0) return;
    const last = history.pop();
    board = last.board;
    turn = last.turn;
    selected = null;
    legalMovesFromSelected = [];
    drawBoard();
  }

  function switchTurn() {
    turn = (turn === 'red') ? 'black' : 'red';
    selected = null;
    legalMovesFromSelected = [];
    drawBoard();
    maybeAIMove();
  }

  function maybeAIMove() {
    const legal = generateLegalMoves(board, turn);
    const over = legal.length === 0;
    if (over) {
      drawBoard();
      return;
    }
    if (turn !== humanSide) {
      aiThinking = true;
      drawBoard();
      // Let UI update
      setTimeout(() => {
        const depth = parseInt(depthSelect.value, 10) || 3;
        const { move } = searchRoot(board, depth, turn);
        if (move) {
          pushHistory();
          board = doMove(board, move);
        }
        aiThinking = false;
        switchTurn();
      }, 20);
    }
  }

  // Move application
  function doMove(b, m) {
    const nb = b.slice();
    nb[m.to] = nb[m.from];
    nb[m.from] = null;
    return nb;
  }

  // Generate legal moves for side
  function generateLegalMoves(b, side) {
    const pseudo = generatePseudoMoves(b, side);
    const legal = [];
    for (const m of pseudo) {
      const nb = doMove(b, m);
      if (!isInCheck(nb, side)) {
        legal.push(m);
      }
    }
    return legal;
  }

  // Pseudo-legal moves (do not check for self-check)
  function generatePseudoMoves(b, side) {
    const moves = [];
    for (let i = 0; i < b.length; i++) {
      const p = b[i];
      if (!p || sideOf(p) !== side) continue;
      const [r, c] = rc(i);
      const isRed = (side === 'red');

      switch (p.toUpperCase()) {
        case 'R': genRook(b, r, c, side, moves); break;
        case 'N': genKnight(b, r, c, side, moves); break;
        case 'B': genElephant(b, r, c, side, moves); break;
        case 'A': genAdvisor(b, r, c, side, moves); break;
        case 'K': genGeneral(b, r, c, side, moves); break;
        case 'C': genCannon(b, r, c, side, moves); break;
        case 'P': genSoldier(b, r, c, side, moves); break;
      }
    }
    return moves;
  }

  function addMove(b, from, to, side, list) {
    const target = b[to];
    if (!target || sideOf(target) !== side) {
      list.push({ from, to });
    }
  }

  function genRook(b, r, c, side, list) {
    const from = idx(r, c);
    // four directions
    [[-1,0],[1,0],[0,-1],[0,1]].forEach(([dr, dc]) => {
      let rr = r + dr, cc = c + dc;
      while (inBounds(rr, cc)) {
        const to = idx(rr, cc);
        const target = b[to];
        if (!target) {
          list.push({ from, to });
        } else {
          if (sideOf(target) !== side) list.push({ from, to });
          break;
        }
        rr += dr; cc += dc;
      }
    });
  }

  function genCannon(b, r, c, side, list) {
    const from = idx(r, c);
    [[-1,0],[1,0],[0,-1],[0,1]].forEach(([dr, dc]) => {
      // non-capturing (no screen)
      let rr = r + dr, cc = c + dc;
      while (inBounds(rr, cc)) {
        const to = idx(rr, cc);
        if (!b[to]) {
          list.push({ from, to });
          rr += dr; cc += dc;
        } else {
          break;
        }
      }
      // capturing: exactly one screen, then next piece is capturable
      rr = r + dr; cc = c + dc;
      let screens = 0;
      while (inBounds(rr, cc)) {
        const to = idx(rr, cc);
        if (b[to]) {
          screens++;
          if (screens === 1) {
            rr += dr; cc += dc;
            break;
          } else {
            break;
          }
        }
        rr += dr; cc += dc;
      }
      // after one screen, the first piece (any color) is capturable
      while (inBounds(rr, cc)) {
        const to2 = idx(rr, cc);
        if (b[to2]) {
          if (sideOf(b[to2]) !== side) list.push({ from, to: to2 });
          break;
        }
        rr += dr; cc += dc;
      }
    });
  }

  function genKnight(b, r, c, side, list) {
    const from = idx(r, c);
    const deltas = [
      [-2,-1, -1,0], [-2,1, -1,0],
      [2,-1, 1,0], [2,1, 1,0],
      [-1,-2, 0,-1], [1,-2, 0,-1],
      [-1,2, 0,1], [1,2, 0,1],
    ];
    for (const [dr, dc, lr, lc] of deltas) {
      const legR = r + lr, legC = c + lc;
      if (!inBounds(legR, legC) || b[idx(legR, legC)]) continue; // horse-leg blocked
      const rr = r + dr, cc = c + dc;
      if (!inBounds(rr, cc)) continue;
      addMove(b, from, idx(rr, cc), side, list);
    }
  }

  function genElephant(b, r, c, side, list) {
    const from = idx(r, c);
    const isRed = side === 'red';
    const deltas = [[-2,-2],[-2,2],[2,-2],[2,2]];
    for (const [dr, dc] of deltas) {
      const rr = r + dr, cc = c + dc;
      if (!inBounds(rr, cc)) continue;
      // River restriction
      if (isRed && rr < 5) continue;
      if (!isRed && rr > 4) continue;
      // Elephant-eye (midpoint) must be empty
      const mr = r + dr/2, mc = c + dc/2;
      if (b[idx(mr, mc)]) continue;
      addMove(b, from, idx(rr, cc), side, list);
    }
  }

  function genAdvisor(b, r, c, side, list) {
    const from = idx(r, c);
    const isRed = side === 'red';
    const inPalace = (rr, cc) => {
      if (isRed) return rr >= 7 && rr <= 9 && cc >= 3 && cc <= 5;
      return rr >= 0 && rr <= 2 && cc >= 3 && cc <= 5;
    };
    const deltas = [[-1,-1],[-1,1],[1,-1],[1,1]];
    for (const [dr, dc] of deltas) {
      const rr = r + dr, cc = c + dc;
      if (!inBounds(rr, cc) || !inPalace(rr, cc)) continue;
      addMove(b, from, idx(rr, cc), side, list);
    }
  }

  function genGeneral(b, r, c, side, list) {
    const from = idx(r, c);
    const isRed = side === 'red';
    const inPalace = (rr, cc) => {
      if (isRed) return rr >= 7 && rr <= 9 && cc >= 3 && cc <= 5;
      return rr >= 0 && rr <= 2 && cc >= 3 && cc <= 5;
    };
    const deltas = [[-1,0],[1,0],[0,-1],[0,1]];
    for (const [dr, dc] of deltas) {
      const rr = r + dr, cc = c + dc;
      if (!inBounds(rr, cc) || !inPalace(rr, cc)) continue;
      addMove(b, from, idx(rr, cc), side, list);
    }
    // Flying general capture (handled by attack detection; movement itself is 1 step)
  }

  function genSoldier(b, r, c, side, list) {
    const from = idx(r, c);
    const isRed = side === 'red';
    const forward = isRed ? -1 : 1;

    // forward move
    const fr = r + forward, fc = c;
    if (inBounds(fr, fc)) addMove(b, from, idx(fr, fc), side, list);

    // after crossing river, can move sideways
    const crossed = isRed ? (r <= 4) : (r >= 5);
    if (crossed) {
      [[0,-1],[0,1]].forEach(([dr, dc]) => {
        const rr = r + dr, cc = c + dc;
        if (inBounds(rr, cc)) addMove(b, from, idx(rr, cc), side, list);
      });
    }
  }

  // Check detection
  function isInCheck(b, side) {
    // find king position for side
    let kPos = -1;
    for (let i = 0; i < b.length; i++) {
      const p = b[i];
      if (!p) continue;
      if (side === 'red' && p === 'K') { kPos = i; break; }
      if (side === 'black' && p === 'k') { kPos = i; break; }
    }
    if (kPos === -1) return false; // king captured? treat as over
    const [kr, kc] = rc(kPos);

    // if facing opposing general on same file without blockers, it's check
    const opp = side === 'red' ? 'k' : 'K';
    for (let r = kr + 1; r < ROWS; r++) {
      const q = b[idx(r, kc)];
      if (!q) continue;
      if (q === opp) return true;
      break;
    }
    for (let r = kr - 1; r >= 0; r--) {
      const q = b[idx(r, kc)];
      if (!q) continue;
      if (q === opp) return true;
      break;
    }

    // scan all opponent pieces to see if any attacks king square
    const enemy = side === 'red' ? 'black' : 'red';
    for (let i = 0; i < b.length; i++) {
      const p = b[i];
      if (!p || sideOf(p) !== enemy) continue;
      if (attacksSquare(b, i, kPos)) return true;
    }
    return false;
  }

  function attacksSquare(b, from, to) {
    const p = b[from];
    const [fr, fc] = rc(from);
    const [tr, tc] = rc(to);
    const s = sideOf(p);
    const dr = tr - fr, dc = tc - fc;

    const abs = x => Math.abs(x);
    const sign = x => (x > 0 ? 1 : x < 0 ? -1 : 0);

    switch (p.toUpperCase()) {
      case 'R': {
        if (fr !== tr && fc !== tc) return false;
        const sr = sign(dr), sc = sign(dc);
        let rr = fr + sr, cc = fc + sc;
        while (rr !== tr || cc !== tc) {
          if (b[idx(rr, cc)]) return false;
          rr += sr; cc += sc;
        }
        return true;
      }
      case 'C': {
        if (fr !== tr && fc !== tc) return false;
        const sr = sign(dr), sc = sign(dc);
        let rr = fr + sr, cc = fc + sc;
        let blockers = 0;
        while (rr !== tr || cc !== tc) {
          if (b[idx(rr, cc)]) blockers++;
          rr += sr; cc += sc;
        }
        return blockers === 1; // cannon needs exactly one screen to capture
      }
      case 'N': {
        // Knight attack with horse-leg rule
        const candidates = [
          [-2,-1, -1,0], [-2,1, -1,0],
          [2,-1, 1,0], [2,1, 1,0],
          [-1,-2, 0,-1], [1,-2, 0,-1],
          [-1,2, 0,1], [1,2, 0,1],
        ];
        for (const [r2,c2, lr, lc] of candidates) {
          if (tr === fr + r2 && tc === fc + c2) {
            const legR = fr + lr, legC = fc + lc;
            if (!b[idx(legR, legC)]) return true;
          }
        }
        return false;
      }
      case 'B': {
        if (abs(dr) !== 2 || abs(dc) !== 2) return false;
        // elephant-eye must be empty
        const mr = fr + dr / 2, mc = fc + dc / 2;
        if (b[idx(mr, mc)]) return false;
        // river constraint for attacker still applies
        if (s === 'red' && tr < 5) return false;
        if (s === 'black' && tr > 4) return false;
        return true;
      }
      case 'A': {
        if (abs(dr) !== 1 || abs(dc) !== 1) return false;
        // must remain in palace
        if (s === 'red') return tr >= 7 && tr <= 9 && tc >= 3 && tc <= 5;
        return tr >= 0 && tr <= 2 && tc >= 3 && tc <= 5;
      }
      case 'K': {
        // one step orth within palace OR facing capture handled elsewhere
        if ((abs(dr) + abs(dc)) !== 1) return false;
        if (s === 'red') return tr >= 7 && tr <= 9 && tc >= 3 && tc <= 5;
        return tr >= 0 && tr <= 2 && tc >= 3 && tc <= 5;
      }
      case 'P': {
        // Soldiers attack like they move
        if (s === 'red') {
          if (tr === fr - 1 && tc === fc) return true;
          if (fr <= 4 && tr === fr && abs(tc - fc) === 1) return true;
        } else {
          if (tr === fr + 1 && tc === fc) return true;
          if (fr >= 5 && tr === fr && abs(tc - fc) === 1) return true;
        }
        return false;
      }
    }
    return false;
  }

  // AI: Minimax with alpha-beta
  function evaluate(b) {
    // Material with slight soldier advancement bonus
    let score = 0;
    for (let i = 0; i < b.length; i++) {
      const p = b[i];
      if (!p) continue;
      score += VALUES[p] || 0;
      if (p === 'P') {
        const [r] = rc(i);
        // further up (towards 0) is better for Red
        score += (6 - r) * 2;
      } else if (p === 'p') {
        const [r] = rc(i);
        // further down is better for Black
        score -= (r - 3) * 2;
      }
    }
    return score;
  }

  function searchRoot(b, depth, side) {
    const moves = generateLegalMoves(b, side);
    // Basic ordering: captures first
    moves.sort((a, b2) => {
      const capA = b[a.to] ? 1 : 0;
      const capB = b[b2.to] ? 1 : 0;
      return capB - capA;
    });

    let bestScore = side === 'red' ? -Infinity : Infinity;
    let bestMove = null;
    let alpha = -Infinity, beta = Infinity;

    for (const m of moves) {
      const nb = doMove(b, m);
      const s2 = side === 'red' ? 'black' : 'red';
      const sc = search(nb, depth - 1, alpha, beta, s2);
      if (side === 'red') {
        if (sc > bestScore) { bestScore = sc; bestMove = m; }
        if (bestScore > alpha) alpha = bestScore;
      } else {
        if (sc < bestScore) { bestScore = sc; bestMove = m; }
        if (bestScore < beta) beta = bestScore;
      }
      if (alpha >= beta) break;
    }
    return { score: bestScore, move: bestMove };
  }

  function search(b, depth, alpha, beta, side) {
    if (depth <= 0) return evaluate(b);

    const moves = generateLegalMoves(b, side);
    if (moves.length === 0) {
      // checkmate or stalemate
      const inCheckFlag = isInCheck(b, side);
      if (inCheckFlag) return side === 'red' ? -9999 : 9999;
      return 0; // stalemate
    }

    // Simple move ordering: prioritize captures
    moves.sort((a, b2) => {
      const capA = b[a.to] ? 1 : 0;
      const capB = b[b2.to] ? 1 : 0;
      return capB - capA;
    });

    if (side === 'red') {
      let best = -Infinity;
      for (const m of moves) {
        const nb = doMove(b, m);
        const sc = search(nb, depth - 1, alpha, beta, 'black');
        if (sc > best) best = sc;
        if (best > alpha) alpha = best;
        if (alpha >= beta) break;
      }
      return best;
    } else {
      let best = Infinity;
      for (const m of moves) {
        const nb = doMove(b, m);
        const sc = search(nb, depth - 1, alpha, beta, 'red');
        if (sc < best) best = sc;
        if (best < beta) beta = best;
        if (alpha >= beta) break;
      }
      return best;
    }
  }

  // Start
  resetGame();
})();
