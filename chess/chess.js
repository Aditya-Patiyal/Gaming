/* ===================================================
   Chess Game Engine — Full Rules, PvP
   =================================================== */

// ---- Constants ----
const PIECES = {
    K: '♔', Q: '♕', R: '♖', B: '♗', N: '♘', P: '♙',
    k: '♚', q: '♛', r: '♜', b: '♝', n: '♞', p: '♟'
};

const PIECE_VALUES = { p: 1, n: 3, b: 3, r: 5, q: 9 };

const INITIAL_FEN = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';

// ---- Game State ----
let board = [];          // 8x8 array, null or { type, color }
let turn = 'w';          // 'w' or 'b'
let castling = { K: true, Q: true, k: true, q: true };
let enPassantTarget = null; // { row, col } or null
let halfMoveClock = 0;
let fullMoveNumber = 1;
let selectedSquare = null;
let legalMovesForSelected = [];
let moveHistory = [];
let lastMove = null;     // { from, to }
let gameOver = false;
let boardFlipped = false;

// Timers
let whiteTime = 600;  // seconds
let blackTime = 600;
let timerInterval = null;

// Player names
let player1Name = 'Player 1';
let player2Name = 'Player 2';

// Promotion
let pendingPromotion = null; // { from, to }

// State history for takeback
let stateHistory = [];

// ---- Utility ----
function isWhite(piece) { return piece && piece.color === 'w'; }
function isBlack(piece) { return piece && piece.color === 'b'; }
function isAlly(piece, color) { return piece && piece.color === color; }
function isEnemy(piece, color) { return piece && piece.color !== color; }
function inBounds(r, c) { return r >= 0 && r < 8 && c >= 0 && c < 8; }

function cloneBoard(b) {
    return b.map(row => row.map(sq => sq ? { ...sq } : null));
}

// ---- FEN Parsing ----
function parseFEN(fen) {
    const parts = fen.split(' ');
    const rows = parts[0].split('/');
    const b = [];
    for (let r = 0; r < 8; r++) {
        b[r] = [];
        let c = 0;
        for (const ch of rows[r]) {
            if (/\d/.test(ch)) {
                for (let i = 0; i < parseInt(ch); i++) b[r][c++] = null;
            } else {
                const color = ch === ch.toUpperCase() ? 'w' : 'b';
                b[r][c++] = { type: ch.toLowerCase(), color };
            }
        }
    }
    turn = parts[1];
    castling = { K: false, Q: false, k: false, q: false };
    if (parts[2] !== '-') {
        for (const ch of parts[2]) castling[ch] = true;
    }
    if (parts[3] !== '-') {
        const file = parts[3].charCodeAt(0) - 97;
        const rank = 8 - parseInt(parts[3][1]);
        enPassantTarget = { row: rank, col: file };
    } else {
        enPassantTarget = null;
    }
    halfMoveClock = parseInt(parts[4]);
    fullMoveNumber = parseInt(parts[5]);
    return b;
}

// ---- Move Generation ----
function getPseudoLegalMoves(b, row, col, includeQuiet = true) {
    const piece = b[row][col];
    if (!piece) return [];
    const moves = [];
    const color = piece.color;
    const enemy = color === 'w' ? 'b' : 'w';
    const dir = color === 'w' ? -1 : 1;

    switch (piece.type) {
        case 'p': {
            // Forward
            const fwd = row + dir;
            if (includeQuiet && inBounds(fwd, col) && !b[fwd][col]) {
                moves.push({ row: fwd, col });
                // Double push
                const startRow = color === 'w' ? 6 : 1;
                const dbl = row + 2 * dir;
                if (row === startRow && inBounds(dbl, col) && !b[dbl][col]) {
                    moves.push({ row: dbl, col });
                }
            }
            // Captures
            for (const dc of [-1, 1]) {
                if (inBounds(fwd, col + dc)) {
                    if (b[fwd][col + dc] && b[fwd][col + dc].color === enemy) {
                        moves.push({ row: fwd, col: col + dc });
                    }
                    // En passant
                    if (enPassantTarget && enPassantTarget.row === fwd && enPassantTarget.col === col + dc) {
                        moves.push({ row: fwd, col: col + dc, enPassant: true });
                    }
                }
            }
            break;
        }
        case 'n': {
            const offsets = [[-2,-1],[-2,1],[-1,-2],[-1,2],[1,-2],[1,2],[2,-1],[2,1]];
            for (const [dr, dc] of offsets) {
                const nr = row + dr, nc = col + dc;
                if (inBounds(nr, nc) && !isAlly(b[nr][nc], color)) {
                    moves.push({ row: nr, col: nc });
                }
            }
            break;
        }
        case 'b': {
            for (const [dr, dc] of [[-1,-1],[-1,1],[1,-1],[1,1]]) {
                slideMoves(b, row, col, dr, dc, color, moves);
            }
            break;
        }
        case 'r': {
            for (const [dr, dc] of [[-1,0],[1,0],[0,-1],[0,1]]) {
                slideMoves(b, row, col, dr, dc, color, moves);
            }
            break;
        }
        case 'q': {
            for (const [dr, dc] of [[-1,-1],[-1,0],[-1,1],[0,-1],[0,1],[1,-1],[1,0],[1,1]]) {
                slideMoves(b, row, col, dr, dc, color, moves);
            }
            break;
        }
        case 'k': {
            for (const [dr, dc] of [[-1,-1],[-1,0],[-1,1],[0,-1],[0,1],[1,-1],[1,0],[1,1]]) {
                const nr = row + dr, nc = col + dc;
                if (inBounds(nr, nc) && !isAlly(b[nr][nc], color)) {
                    moves.push({ row: nr, col: nc });
                }
            }
            break;
        }
    }
    return moves;
}

function slideMoves(b, row, col, dr, dc, color, moves) {
    let r = row + dr, c = col + dc;
    while (inBounds(r, c)) {
        if (b[r][c]) {
            if (!isAlly(b[r][c], color)) moves.push({ row: r, col: c });
            break;
        }
        moves.push({ row: r, col: c });
        r += dr;
        c += dc;
    }
}

// ---- Attack Detection ----
function isSquareAttackedBy(b, row, col, byColor) {
    // Check from every piece of byColor
    for (let r = 0; r < 8; r++) {
        for (let c = 0; c < 8; c++) {
            const piece = b[r][c];
            if (!piece || piece.color !== byColor) continue;
            const moves = getPseudoLegalMoves(b, r, c, false);
            // For non-pawns, also include quiet moves for sliding pieces (already included)
            // But for pawns, getPseudoLegalMoves with includeQuiet=false only returns captures
            // We need to check if pawn attacks the square
            if (piece.type === 'p') {
                const dir = piece.color === 'w' ? -1 : 1;
                for (const dc of [-1, 1]) {
                    if (r + dir === row && c + dc === col) return true;
                }
            } else {
                for (const m of moves) {
                    if (m.row === row && m.col === col) return true;
                }
            }
        }
    }
    return false;
}

function findKing(b, color) {
    for (let r = 0; r < 8; r++) {
        for (let c = 0; c < 8; c++) {
            if (b[r][c] && b[r][c].type === 'k' && b[r][c].color === color) {
                return { row: r, col: c };
            }
        }
    }
    return null;
}

function isInCheck(b, color) {
    const king = findKing(b, color);
    if (!king) return false;
    const enemy = color === 'w' ? 'b' : 'w';
    return isSquareAttackedBy(b, king.row, king.col, enemy);
}

// ---- Legal Move Generation ----
function getLegalMoves(b, row, col) {
    const piece = b[row][col];
    if (!piece) return [];
    const color = piece.color;
    const enemy = color === 'w' ? 'b' : 'w';
    let pseudoMoves = getPseudoLegalMoves(b, row, col);
    let legal = [];

    for (const move of pseudoMoves) {
        // Simulate move
        const sim = cloneBoard(b);
        sim[move.row][move.col] = sim[row][col];
        sim[row][col] = null;

        // En passant capture
        if (move.enPassant) {
            const capturedRow = color === 'w' ? move.row + 1 : move.row - 1;
            sim[capturedRow][move.col] = null;
        }

        // After move, check if our king is in check
        if (!isInCheck(sim, color)) {
            legal.push(move);
        }
    }

    // Castling
    if (piece.type === 'k') {
        const homeRow = color === 'w' ? 7 : 0;
        if (row === homeRow && col === 4) {
            // Kingside
            const ksKey = color === 'w' ? 'K' : 'k';
            if (castling[ksKey]) {
                if (!b[homeRow][5] && !b[homeRow][6] &&
                    b[homeRow][7] && b[homeRow][7].type === 'r' && b[homeRow][7].color === color) {
                    if (!isInCheck(b, color) &&
                        !isSquareAttackedBy(b, homeRow, 5, enemy) &&
                        !isSquareAttackedBy(b, homeRow, 6, enemy)) {
                        legal.push({ row: homeRow, col: 6, castle: 'K' });
                    }
                }
            }
            // Queenside
            const qsKey = color === 'w' ? 'Q' : 'q';
            if (castling[qsKey]) {
                if (!b[homeRow][3] && !b[homeRow][2] && !b[homeRow][1] &&
                    b[homeRow][0] && b[homeRow][0].type === 'r' && b[homeRow][0].color === color) {
                    if (!isInCheck(b, color) &&
                        !isSquareAttackedBy(b, homeRow, 3, enemy) &&
                        !isSquareAttackedBy(b, homeRow, 2, enemy)) {
                        legal.push({ row: homeRow, col: 2, castle: 'Q' });
                    }
                }
            }
        }
    }

    return legal;
}

// ---- All Legal Moves for a Color ----
function allLegalMovesForColor(b, color) {
    const moves = [];
    for (let r = 0; r < 8; r++) {
        for (let c = 0; c < 8; c++) {
            if (b[r][c] && b[r][c].color === color) {
                const pieceMoves = getLegalMoves(b, r, c);
                for (const m of pieceMoves) {
                    moves.push({ from: { row: r, col: c }, to: m });
                }
            }
        }
    }
    return moves;
}

// ---- Make Move ----
function makeMove(fromRow, fromCol, toRow, toCol, moveData) {
    const piece = board[fromRow][fromCol];
    const captured = board[toRow][toCol];
    const color = piece.color;
    const enemy = color === 'w' ? 'b' : 'w';

    // Build notation
    let notation = '';
    let isCapture = !!captured || (moveData && moveData.enPassant);
    let isCastle = moveData && moveData.castle;
    let capturedPiece = captured;

    if (isCastle) {
        notation = moveData.castle === 'K' ? 'O-O' : 'O-O-O';
        // Move rook
        const homeRow = color === 'w' ? 7 : 0;
        if (moveData.castle === 'K') {
            board[homeRow][5] = board[homeRow][7];
            board[homeRow][7] = null;
        } else {
            board[homeRow][3] = board[homeRow][0];
            board[homeRow][0] = null;
        }
    } else {
        if (piece.type !== 'p') {
            notation += piece.type.toUpperCase() === 'N' ? 'N' :
                        piece.type.toUpperCase() === 'B' ? 'B' :
                        piece.type.toUpperCase() === 'R' ? 'R' :
                        piece.type.toUpperCase() === 'Q' ? 'Q' :
                        piece.type.toUpperCase() === 'K' ? 'K' : '';
            // Disambiguation
            notation += getDisambiguation(board, piece, fromRow, fromCol, toRow, toCol);
        }
        if (isCapture) {
            if (piece.type === 'p') notation += String.fromCharCode(97 + fromCol);
            notation += 'x';
        }
        notation += String.fromCharCode(97 + toCol) + (8 - toRow);
    }

    // En passant capture
    if (moveData && moveData.enPassant) {
        const capturedRow = color === 'w' ? toRow + 1 : toRow - 1;
        capturedPiece = board[capturedRow][toCol];
        board[capturedRow][toCol] = null;
    }

    // Move piece
    board[toRow][toCol] = piece;
    board[fromRow][fromCol] = null;

    // Pawn promotion
    let promoted = false;
    if (piece.type === 'p' && (toRow === 0 || toRow === 7)) {
        if (moveData && moveData.promoteTo) {
            board[toRow][toCol] = { type: moveData.promoteTo, color };
            notation += '=' + moveData.promoteTo.toUpperCase();
            promoted = true;
        } else {
            // Will be handled by promotion modal
            return { needsPromotion: true, notation, capturedPiece, isCapture };
        }
    }

    // Update en passant target
    if (piece.type === 'p' && Math.abs(toRow - fromRow) === 2) {
        enPassantTarget = { row: (fromRow + toRow) / 2, col: fromCol };
    } else {
        enPassantTarget = null;
    }

    // Update castling rights
    if (piece.type === 'k') {
        if (color === 'w') { castling.K = false; castling.Q = false; }
        else { castling.k = false; castling.q = false; }
    }
    if (piece.type === 'r') {
        if (color === 'w') {
            if (fromRow === 7 && fromCol === 0) castling.Q = false;
            if (fromRow === 7 && fromCol === 7) castling.K = false;
        } else {
            if (fromRow === 0 && fromCol === 0) castling.q = false;
            if (fromRow === 0 && fromCol === 7) castling.k = false;
        }
    }
    // If rook captured
    if (captured && captured.type === 'r') {
        if (toRow === 0 && toCol === 0) castling.q = false;
        if (toRow === 0 && toCol === 7) castling.k = false;
        if (toRow === 7 && toCol === 0) castling.Q = false;
        if (toRow === 7 && toCol === 7) castling.K = false;
    }

    // Half-move clock
    if (piece.type === 'p' || isCapture) halfMoveClock = 0;
    else halfMoveClock++;

    // Check / checkmate
    const inCheck = isInCheck(board, enemy);
    const enemyMoves = allLegalMovesForColor(board, enemy);
    const noMoves = enemyMoves.length === 0;

    if (inCheck && noMoves) {
        notation += '#';
    } else if (inCheck) {
        notation += '+';
    }

    // Switch turn
    if (turn === 'b') fullMoveNumber++;
    turn = enemy;

    // Record move
    lastMove = { from: { row: fromRow, col: fromCol }, to: { row: toRow, col: toCol } };
    moveHistory.push({
        notation,
        color,
        from: { row: fromRow, col: fromCol },
        to: { row: toRow, col: toCol },
        capturedPiece,
        isCapture
    });

    return { notation, inCheck, noMoves, capturedPiece, isCapture };
}

function getDisambiguation(b, piece, fromRow, fromCol, toRow, toCol) {
    // Find other pieces of same type and color that can move to same square
    let sameFile = false, sameRank = false, ambiguous = false;
    for (let r = 0; r < 8; r++) {
        for (let c = 0; c < 8; c++) {
            if (r === fromRow && c === fromCol) continue;
            const p = b[r][c];
            if (p && p.type === piece.type && p.color === piece.color) {
                const moves = getLegalMoves(b, r, c);
                if (moves.some(m => m.row === toRow && m.col === toCol)) {
                    ambiguous = true;
                    if (c === fromCol) sameFile = true;
                    if (r === fromRow) sameRank = true;
                }
            }
        }
    }
    if (!ambiguous) return '';
    if (!sameFile) return String.fromCharCode(97 + fromCol);
    if (!sameRank) return String(8 - fromRow);
    return String.fromCharCode(97 + fromCol) + (8 - fromRow);
}

// ---- Stalemate / Draw Detection ----
function checkGameEnd() {
    const currentMoves = allLegalMovesForColor(board, turn);
    if (currentMoves.length === 0) {
        if (isInCheck(board, turn)) {
            // Checkmate
            const winner = turn === 'w' ? 'b' : 'w';
            endGame('checkmate', winner);
            return true;
        } else {
            // Stalemate
            endGame('stalemate');
            return true;
        }
    }
    // 50-move rule
    if (halfMoveClock >= 100) {
        endGame('fifty-move');
        return true;
    }
    // Insufficient material
    if (isInsufficientMaterial()) {
        endGame('insufficient');
        return true;
    }
    return false;
}

function isInsufficientMaterial() {
    const pieces = { w: [], b: [] };
    for (let r = 0; r < 8; r++) {
        for (let c = 0; c < 8; c++) {
            if (board[r][c]) {
                pieces[board[r][c].color].push({ type: board[r][c].type, row: r, col: c });
            }
        }
    }
    const wp = pieces.w.filter(p => p.type !== 'k');
    const bp = pieces.b.filter(p => p.type !== 'k');
    // K vs K
    if (wp.length === 0 && bp.length === 0) return true;
    // K+B vs K or K+N vs K
    if (wp.length === 0 && bp.length === 1 && (bp[0].type === 'b' || bp[0].type === 'n')) return true;
    if (bp.length === 0 && wp.length === 1 && (wp[0].type === 'b' || wp[0].type === 'n')) return true;
    // K+B vs K+B on same color
    if (wp.length === 1 && bp.length === 1 && wp[0].type === 'b' && bp[0].type === 'b') {
        const wSq = (wp[0].row + wp[0].col) % 2;
        const bSq = (bp[0].row + bp[0].col) % 2;
        if (wSq === bSq) return true;
    }
    return false;
}

// ---- UI Rendering ----
function renderBoard() {
    const chessboard = document.getElementById('chessboard');
    chessboard.innerHTML = '';

    for (let r = 0; r < 8; r++) {
        for (let c = 0; c < 8; c++) {
            const sq = document.createElement('div');
            const isLight = (r + c) % 2 === 0;
            sq.className = `square ${isLight ? 'square-light' : 'square-dark'}`;
            sq.dataset.row = r;
            sq.dataset.col = c;
            sq.id = `sq-${r}-${c}`;

            // Last move highlight
            if (lastMove) {
                if ((r === lastMove.from.row && c === lastMove.from.col) ||
                    (r === lastMove.to.row && c === lastMove.to.col)) {
                    sq.classList.add('last-move');
                }
            }

            // Selected
            if (selectedSquare && selectedSquare.row === r && selectedSquare.col === c) {
                sq.classList.add('selected');
            }

            // Check highlight
            if (board[r][c] && board[r][c].type === 'k' && board[r][c].color === turn && isInCheck(board, turn)) {
                sq.classList.add('in-check');
            }

            // Piece
            if (board[r][c]) {
                const pieceEl = document.createElement('span');
                const p = board[r][c];
                pieceEl.className = `square-piece ${p.color === 'w' ? 'piece-white' : 'piece-black'}`;
                const key = p.color === 'w' ? p.type.toUpperCase() : p.type;
                pieceEl.textContent = PIECES[key];
                sq.appendChild(pieceEl);
            }

            // Move indicators
            if (selectedSquare) {
                const isLegal = legalMovesForSelected.find(m => m.row === r && m.col === c);
                if (isLegal) {
                    if (board[r][c] || isLegal.enPassant) {
                        const ring = document.createElement('div');
                        ring.className = 'capture-ring';
                        sq.appendChild(ring);
                    } else {
                        const dot = document.createElement('div');
                        dot.className = 'move-dot';
                        sq.appendChild(dot);
                    }
                }
            }

            sq.addEventListener('click', () => handleSquareClick(r, c));
            chessboard.appendChild(sq);
        }
    }
}

function renderCoordinates() {
    const filesEl = document.getElementById('coords-files');
    const ranksEl = document.getElementById('coords-ranks');
    filesEl.innerHTML = '';
    ranksEl.innerHTML = '';
    const files = boardFlipped ? 'hgfedcba' : 'abcdefgh';
    const ranks = boardFlipped ? '12345678' : '87654321';
    for (const f of files) {
        const s = document.createElement('span');
        s.textContent = f;
        filesEl.appendChild(s);
    }
    for (const r of ranks) {
        const s = document.createElement('span');
        s.textContent = r;
        ranksEl.appendChild(s);
    }
}

function renderCapturedPieces() {
    const byWhiteEl = document.getElementById('captured-by-white');
    const byBlackEl = document.getElementById('captured-by-black');
    byWhiteEl.innerHTML = '';
    byBlackEl.innerHTML = '';

    const capturedByWhite = []; // black pieces captured by white
    const capturedByBlack = []; // white pieces captured by black

    for (const move of moveHistory) {
        if (move.capturedPiece) {
            if (move.color === 'w') capturedByWhite.push(move.capturedPiece);
            else capturedByBlack.push(move.capturedPiece);
        }
    }

    // Sort by value
    const order = { q: 0, r: 1, b: 2, n: 3, p: 4 };
    capturedByWhite.sort((a, b) => order[a.type] - order[b.type]);
    capturedByBlack.sort((a, b) => order[a.type] - order[b.type]);

    for (const p of capturedByWhite) {
        const s = document.createElement('span');
        s.textContent = PIECES[p.type]; // black piece symbols
        byWhiteEl.appendChild(s);
    }
    for (const p of capturedByBlack) {
        const s = document.createElement('span');
        s.textContent = PIECES[p.type.toUpperCase()]; // white piece symbols
        byBlackEl.appendChild(s);
    }

    // Material advantage
    let whiteAdv = 0, blackAdv = 0;
    for (const p of capturedByWhite) whiteAdv += (PIECE_VALUES[p.type] || 0);
    for (const p of capturedByBlack) blackAdv += (PIECE_VALUES[p.type] || 0);
    const diff = whiteAdv - blackAdv;
    if (diff > 0) {
        const adv = document.createElement('span');
        adv.textContent = ` +${diff}`;
        adv.style.color = 'var(--accent-gold)';
        adv.style.fontWeight = '700';
        adv.style.fontSize = '0.75rem';
        byWhiteEl.appendChild(adv);
    } else if (diff < 0) {
        const adv = document.createElement('span');
        adv.textContent = ` +${-diff}`;
        adv.style.color = 'var(--accent-gold)';
        adv.style.fontWeight = '700';
        adv.style.fontSize = '0.75rem';
        byBlackEl.appendChild(adv);
    }
}

function renderMoveHistory() {
    const listEl = document.getElementById('move-list');
    const countEl = document.getElementById('move-count');
    listEl.innerHTML = '';

    const totalMoves = moveHistory.length;
    countEl.textContent = totalMoves;

    for (let i = 0; i < totalMoves; i += 2) {
        const moveNum = Math.floor(i / 2) + 1;
        const row = document.createElement('div');
        row.className = 'move-row';

        const numEl = document.createElement('span');
        numEl.className = 'move-number';
        numEl.textContent = moveNum + '.';
        row.appendChild(numEl);

        const whiteMove = document.createElement('span');
        whiteMove.className = 'move-white';
        whiteMove.textContent = moveHistory[i].notation;
        if (i === totalMoves - 1) whiteMove.classList.add('latest');
        row.appendChild(whiteMove);

        if (i + 1 < totalMoves) {
            const blackMove = document.createElement('span');
            blackMove.className = 'move-black';
            blackMove.textContent = moveHistory[i + 1].notation;
            if (i + 1 === totalMoves - 1) blackMove.classList.add('latest');
            row.appendChild(blackMove);
        }

        listEl.appendChild(row);
    }

    // Scroll to bottom
    listEl.scrollTop = listEl.scrollHeight;
}

function updatePlayerBars() {
    const whiteBar = document.getElementById('player-bar-white');
    const blackBar = document.getElementById('player-bar-black');
    whiteBar.classList.toggle('active-turn', turn === 'w' && !gameOver);
    blackBar.classList.toggle('active-turn', turn === 'b' && !gameOver);
}

function updateStatus() {
    const statusEl = document.getElementById('status-text');
    const statusBar = document.getElementById('game-status-bar');
    statusBar.classList.remove('check', 'gameover');

    if (gameOver) {
        statusBar.classList.add('gameover');
        return;
    }

    const colorName = turn === 'w' ? 'White' : 'Black';
    if (isInCheck(board, turn)) {
        statusEl.textContent = `${colorName} is in check!`;
        statusBar.classList.add('check');
    } else {
        statusEl.textContent = `${colorName} to move`;
    }
}

// ---- Timer ----
function startTimer() {
    stopTimer();
    timerInterval = setInterval(() => {
        if (gameOver) { stopTimer(); return; }
        if (turn === 'w') {
            whiteTime--;
            if (whiteTime <= 0) {
                whiteTime = 0;
                endGame('timeout', 'b');
            }
        } else {
            blackTime--;
            if (blackTime <= 0) {
                blackTime = 0;
                endGame('timeout', 'w');
            }
        }
        renderTimers();
    }, 1000);
}

function stopTimer() {
    if (timerInterval) {
        clearInterval(timerInterval);
        timerInterval = null;
    }
}

function renderTimers() {
    const wEl = document.getElementById('timer-white-value');
    const bEl = document.getElementById('timer-black-value');
    const wBar = document.getElementById('timer-white');
    const bBar = document.getElementById('timer-black');

    wEl.textContent = formatTime(whiteTime);
    bEl.textContent = formatTime(blackTime);

    wBar.classList.toggle('timer-danger', whiteTime <= 30);
    bBar.classList.toggle('timer-danger', blackTime <= 30);
}

function formatTime(seconds) {
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    return `${m}:${s.toString().padStart(2, '0')}`;
}

// ---- Game Flow ----
function handleSquareClick(row, col) {
    if (gameOver || pendingPromotion) return;

    const piece = board[row][col];

    if (selectedSquare) {
        // Try to move to this square
        const move = legalMovesForSelected.find(m => m.row === row && m.col === col);
        if (move) {
            executeMove(selectedSquare.row, selectedSquare.col, row, col, move);
            return;
        }
        // Click on own piece = reselect
        if (piece && piece.color === turn) {
            selectSquare(row, col);
            return;
        }
        // Click elsewhere = deselect
        deselectSquare();
        return;
    }

    // Select a piece
    if (piece && piece.color === turn) {
        selectSquare(row, col);
    }
}

function selectSquare(row, col) {
    selectedSquare = { row, col };
    legalMovesForSelected = getLegalMoves(board, row, col);
    renderBoard();
    playSound('select');
}

function deselectSquare() {
    selectedSquare = null;
    legalMovesForSelected = [];
    renderBoard();
}

function executeMove(fromRow, fromCol, toRow, toCol, moveData) {
    const piece = board[fromRow][fromCol];
    const captured = board[toRow][toCol] || (moveData && moveData.enPassant ? board[fromRow][toCol] : null);

    // Save state before move for takeback
    saveState();

    // Check if promotion needed
    if (piece.type === 'p' && (toRow === 0 || toRow === 7) && !(moveData && moveData.promoteTo)) {
        pendingPromotion = { from: { row: fromRow, col: fromCol }, to: { row: toRow, col: toCol }, moveData };
        showPromotionModal(piece.color);
        return;
    }

    const result = makeMove(fromRow, fromCol, toRow, toCol, moveData);

    if (result.needsPromotion) {
        pendingPromotion = { from: { row: fromRow, col: fromCol }, to: { row: toRow, col: toCol }, moveData };
        showPromotionModal(piece.color);
        return;
    }

    selectedSquare = null;
    legalMovesForSelected = [];

    // Sound
    if (result.isCapture) playSound('capture');
    else if (moveData && moveData.castle) playSound('castle');
    else playSound('move');

    if (result.inCheck) playSound('check');

    // Render
    renderBoard();
    renderCapturedPieces();
    renderMoveHistory();
    updatePlayerBars();
    updateStatus();
    renderTimers();

    // Check game end
    checkGameEnd();
}

// ---- Promotion Modal ----
function showPromotionModal(color) {
    const modal = document.getElementById('promotion-modal');
    const choices = document.getElementById('promotion-choices');
    choices.innerHTML = '';

    const pieces = ['q', 'r', 'b', 'n'];
    const symbols = color === 'w'
        ? { q: '♕', r: '♖', b: '♗', n: '♘' }
        : { q: '♛', r: '♜', b: '♝', n: '♞' };

    for (const p of pieces) {
        const btn = document.createElement('button');
        btn.className = 'promo-btn';
        btn.textContent = symbols[p];
        btn.addEventListener('click', () => completePromotion(p));
        choices.appendChild(btn);
    }

    modal.classList.add('visible');
}

function completePromotion(pieceType) {
    const modal = document.getElementById('promotion-modal');
    modal.classList.remove('visible');

    if (!pendingPromotion) return;

    const { from, to, moveData } = pendingPromotion;
    const newMoveData = { ...moveData, promoteTo: pieceType };
    pendingPromotion = null;

    const result = makeMove(from.row, from.col, to.row, to.col, newMoveData);

    selectedSquare = null;
    legalMovesForSelected = [];

    playSound('promote');
    if (result.inCheck) playSound('check');

    renderBoard();
    renderCapturedPieces();
    renderMoveHistory();
    updatePlayerBars();
    updateStatus();
    renderTimers();

    checkGameEnd();
}

// ---- Game End ----
function endGame(reason, winner) {
    gameOver = true;
    stopTimer();

    const modal = document.getElementById('gameover-modal');
    const iconEl = document.getElementById('gameover-icon');
    const titleEl = document.getElementById('gameover-title');
    const subtitleEl = document.getElementById('gameover-subtitle');
    const statusEl = document.getElementById('status-text');
    const statusBar = document.getElementById('game-status-bar');

    statusBar.classList.add('gameover');

    let title = '', subtitle = '', icon = '';

    switch (reason) {
        case 'checkmate':
            const winnerName = winner === 'w' ? player1Name : player2Name;
            title = 'Checkmate!';
            subtitle = `${winnerName} wins`;
            icon = winner === 'w' ? '♔' : '♚';
            statusEl.textContent = `Checkmate — ${winnerName} wins!`;
            playSound('gameover');
            break;
        case 'stalemate':
            title = 'Stalemate';
            subtitle = 'The game is a draw';
            icon = '½';
            statusEl.textContent = 'Stalemate — Draw';
            break;
        case 'timeout':
            const toWinner = winner === 'w' ? player1Name : player2Name;
            title = 'Time\'s Up!';
            subtitle = `${toWinner} wins on time`;
            icon = '⏱';
            statusEl.textContent = `Time out — ${toWinner} wins!`;
            playSound('gameover');
            break;
        case 'fifty-move':
            title = 'Draw';
            subtitle = '50-move rule';
            icon = '½';
            statusEl.textContent = 'Draw — 50-move rule';
            break;
        case 'insufficient':
            title = 'Draw';
            subtitle = 'Insufficient material';
            icon = '½';
            statusEl.textContent = 'Draw — Insufficient material';
            break;
        case 'resign':
            const resignWinner = winner === 'w' ? player1Name : player2Name;
            const resignLoser = winner === 'w' ? player2Name : player1Name;
            title = 'Resignation';
            subtitle = `${resignWinner} wins`;
            icon = '⚑';
            statusEl.textContent = `${resignLoser} resigned — ${resignWinner} wins!`;
            playSound('gameover');
            break;
    }

    iconEl.textContent = icon;
    titleEl.textContent = title;
    subtitleEl.textContent = subtitle;

    updatePlayerBars();
    renderBoard();

    setTimeout(() => modal.classList.add('visible'), 500);
}

// ---- Sound (Web Audio) ----
const audioCtx = new (window.AudioContext || window.webkitAudioContext)();

function playSound(type) {
    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();
    osc.connect(gain);
    gain.connect(audioCtx.destination);

    const now = audioCtx.currentTime;

    switch (type) {
        case 'move':
            osc.frequency.setValueAtTime(600, now);
            osc.frequency.exponentialRampToValueAtTime(400, now + 0.08);
            gain.gain.setValueAtTime(0.12, now);
            gain.gain.exponentialRampToValueAtTime(0.001, now + 0.1);
            osc.start(now);
            osc.stop(now + 0.1);
            break;
        case 'capture':
            osc.type = 'sawtooth';
            osc.frequency.setValueAtTime(300, now);
            osc.frequency.exponentialRampToValueAtTime(150, now + 0.15);
            gain.gain.setValueAtTime(0.15, now);
            gain.gain.exponentialRampToValueAtTime(0.001, now + 0.15);
            osc.start(now);
            osc.stop(now + 0.15);
            break;
        case 'check':
            osc.type = 'square';
            osc.frequency.setValueAtTime(880, now);
            osc.frequency.exponentialRampToValueAtTime(440, now + 0.2);
            gain.gain.setValueAtTime(0.1, now);
            gain.gain.exponentialRampToValueAtTime(0.001, now + 0.25);
            osc.start(now);
            osc.stop(now + 0.25);
            break;
        case 'castle':
            osc.frequency.setValueAtTime(500, now);
            osc.frequency.setValueAtTime(700, now + 0.08);
            osc.frequency.exponentialRampToValueAtTime(400, now + 0.15);
            gain.gain.setValueAtTime(0.1, now);
            gain.gain.exponentialRampToValueAtTime(0.001, now + 0.18);
            osc.start(now);
            osc.stop(now + 0.18);
            break;
        case 'select':
            osc.frequency.setValueAtTime(800, now);
            gain.gain.setValueAtTime(0.05, now);
            gain.gain.exponentialRampToValueAtTime(0.001, now + 0.05);
            osc.start(now);
            osc.stop(now + 0.05);
            break;
        case 'promote':
            osc.type = 'triangle';
            osc.frequency.setValueAtTime(400, now);
            osc.frequency.linearRampToValueAtTime(1200, now + 0.3);
            gain.gain.setValueAtTime(0.12, now);
            gain.gain.exponentialRampToValueAtTime(0.001, now + 0.35);
            osc.start(now);
            osc.stop(now + 0.35);
            break;
        case 'gameover':
            osc.type = 'triangle';
            osc.frequency.setValueAtTime(523, now);
            gain.gain.setValueAtTime(0.12, now);
            gain.gain.exponentialRampToValueAtTime(0.001, now + 0.8);

            const osc2 = audioCtx.createOscillator();
            const gain2 = audioCtx.createGain();
            osc2.connect(gain2);
            gain2.connect(audioCtx.destination);
            osc2.type = 'triangle';
            osc2.frequency.setValueAtTime(659, now + 0.2);
            gain2.gain.setValueAtTime(0.12, now + 0.2);
            gain2.gain.exponentialRampToValueAtTime(0.001, now + 1);

            const osc3 = audioCtx.createOscillator();
            const gain3 = audioCtx.createGain();
            osc3.connect(gain3);
            gain3.connect(audioCtx.destination);
            osc3.type = 'triangle';
            osc3.frequency.setValueAtTime(784, now + 0.4);
            gain3.gain.setValueAtTime(0.15, now + 0.4);
            gain3.gain.exponentialRampToValueAtTime(0.001, now + 1.5);

            osc.start(now);
            osc.stop(now + 0.8);
            osc2.start(now + 0.2);
            osc2.stop(now + 1);
            osc3.start(now + 0.4);
            osc3.stop(now + 1.5);
            return;
    }
}

// ---- Board Flip ----
function flipBoard() {
    boardFlipped = !boardFlipped;
    const chessboard = document.getElementById('chessboard');
    chessboard.classList.toggle('flipped', boardFlipped);
    renderCoordinates();
}

// ---- Navigation ----
function startGame() {
    const p1Input = document.getElementById('player1-name');
    const p2Input = document.getElementById('player2-name');
    player1Name = p1Input.value.trim() || 'Player 1';
    player2Name = p2Input.value.trim() || 'Player 2';

    document.getElementById('display-p1').textContent = player1Name;
    document.getElementById('display-p2').textContent = player2Name;

    document.getElementById('start-screen').classList.remove('active');
    document.getElementById('game-screen').classList.add('active');

    initGame();
}

function goBack() {
    stopTimer();
    gameOver = true;
    window.location.href = '../index.html';
}

function resetGame() {
    document.getElementById('gameover-modal').classList.remove('visible');
    initGame();
}

// ---- Save / Restore State for Takeback ----
function saveState() {
    stateHistory.push({
        board: cloneBoard(board),
        turn,
        castling: { ...castling },
        enPassantTarget: enPassantTarget ? { ...enPassantTarget } : null,
        halfMoveClock,
        fullMoveNumber,
        lastMove: lastMove ? { from: { ...lastMove.from }, to: { ...lastMove.to } } : null,
        moveHistory: moveHistory.map(m => ({ ...m, capturedPiece: m.capturedPiece ? { ...m.capturedPiece } : null })),
        whiteTime,
        blackTime
    });
}

function takeBack() {
    if (gameOver || stateHistory.length === 0 || pendingPromotion) return;

    const prev = stateHistory.pop();
    board = prev.board;
    turn = prev.turn;
    castling = prev.castling;
    enPassantTarget = prev.enPassantTarget;
    halfMoveClock = prev.halfMoveClock;
    fullMoveNumber = prev.fullMoveNumber;
    lastMove = prev.lastMove;
    moveHistory = prev.moveHistory;
    whiteTime = prev.whiteTime;
    blackTime = prev.blackTime;

    selectedSquare = null;
    legalMovesForSelected = [];

    playSound('move');
    renderBoard();
    renderCoordinates();
    renderCapturedPieces();
    renderMoveHistory();
    updatePlayerBars();
    updateStatus();
    renderTimers();
}

// ---- Resign ----
function resignGame() {
    if (gameOver) return;
    const winner = turn === 'w' ? 'b' : 'w';
    endGame('resign', winner);
}

function initGame() {
    board = parseFEN(INITIAL_FEN);
    turn = 'w';
    castling = { K: true, Q: true, k: true, q: true };
    enPassantTarget = null;
    halfMoveClock = 0;
    fullMoveNumber = 1;
    selectedSquare = null;
    legalMovesForSelected = [];
    moveHistory = [];
    lastMove = null;
    gameOver = false;
    whiteTime = 600;
    blackTime = 600;
    boardFlipped = false;
    pendingPromotion = null;
    stateHistory = [];

    const chessboard = document.getElementById('chessboard');
    chessboard.classList.remove('flipped');

    renderBoard();
    renderCoordinates();
    renderCapturedPieces();
    renderMoveHistory();
    updatePlayerBars();
    updateStatus();
    renderTimers();
    startTimer();
}

// ---- Keyboard shortcuts ----
document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
        if (pendingPromotion) return;
        deselectSquare();
    }
    if (e.key === 'f' || e.key === 'F') {
        if (document.activeElement.tagName === 'INPUT') return;
        flipBoard();
    }
});
