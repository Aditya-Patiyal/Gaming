/* ================================================
   TIC TAC TOE — NEON EDITION
   Game logic with AI (minimax) + PvP modes
   ================================================ */

// --- State ---
let gameMode = null;       // 'pvp' or 'ai'
let difficulty = 'medium'; // 'easy', 'medium', 'hard'
let board = Array(9).fill(null);
let currentPlayer = 'X';
let gameActive = false;
let scores = { X: 0, O: 0, draw: 0 };
let aiThinking = false;

const winPatterns = [
    [0, 1, 2], [3, 4, 5], [6, 7, 8], // rows
    [0, 3, 6], [1, 4, 7], [2, 5, 8], // cols
    [0, 4, 8], [2, 4, 6]             // diags
];

// Win line SVG coordinates for each pattern (in % of board)
const winLineCoords = {
    0: { x1: 8, y1: 17, x2: 92, y2: 17 },   // row 0
    1: { x1: 8, y1: 50, x2: 92, y2: 50 },   // row 1
    2: { x1: 8, y1: 83, x2: 92, y2: 83 },   // row 2
    3: { x1: 17, y1: 8, x2: 17, y2: 92 },   // col 0
    4: { x1: 50, y1: 8, x2: 50, y2: 92 },   // col 1
    5: { x1: 83, y1: 8, x2: 83, y2: 92 },   // col 2
    6: { x1: 10, y1: 10, x2: 90, y2: 90 },  // diag \
    7: { x1: 90, y1: 10, x2: 10, y2: 90 },  // diag /
};

// --- DOM Elements ---
const modeScreen = document.getElementById('mode-screen');
const gameScreen = document.getElementById('game-screen');
const resultOverlay = document.getElementById('result-overlay');
const boardEl = document.getElementById('board');
const cells = document.querySelectorAll('.cell');
const turnIndicator = document.getElementById('turn-indicator');
const turnSymbol = document.getElementById('turn-symbol');
const turnText = document.getElementById('turn-text');
const winLineSvg = document.getElementById('win-line-svg');
const winLine = document.getElementById('win-line');
const difficultySelector = document.getElementById('difficulty-selector');

// --- Sound Effects (Web Audio API) ---
const audioCtx = new (window.AudioContext || window.webkitAudioContext)();

function playTone(freq, duration, type = 'sine', volume = 0.12) {
    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, audioCtx.currentTime);
    gain.gain.setValueAtTime(volume, audioCtx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + duration);
    osc.connect(gain);
    gain.connect(audioCtx.destination);
    osc.start();
    osc.stop(audioCtx.currentTime + duration);
}

function soundPlace() {
    playTone(600, 0.1, 'sine', 0.08);
    playTone(800, 0.08, 'sine', 0.05);
}

function soundWin() {
    [523, 659, 784, 1047].forEach((f, i) => {
        setTimeout(() => playTone(f, 0.25, 'sine', 0.1), i * 100);
    });
}

function soundDraw() {
    playTone(300, 0.3, 'triangle', 0.08);
    setTimeout(() => playTone(250, 0.3, 'triangle', 0.06), 150);
}

// --- Mode Selection ---
function selectMode(mode) {
    document.querySelectorAll('.mode-btn').forEach(b => b.classList.remove('selected'));
    document.getElementById(mode === 'pvp' ? 'btn-pvp' : 'btn-ai').classList.add('selected');

    if (mode === 'pvp') {
        gameMode = 'pvp';
        difficultySelector.classList.add('hidden');
        setTimeout(() => startGame(), 350);
    } else {
        gameMode = 'ai';
        difficultySelector.classList.remove('hidden');
    }
}

function selectDifficulty(diff) {
    difficulty = diff;
    document.querySelectorAll('.diff-btn').forEach(b => b.classList.remove('selected'));
    document.getElementById('btn-' + diff).classList.add('selected');
    setTimeout(() => startGame(), 350);
}

// --- Game Flow ---
function startGame() {
    modeScreen.classList.remove('active');
    gameScreen.classList.add('active');

    // Set player names
    document.getElementById('player-x-name').textContent = 'Player X';
    document.getElementById('player-o-name').textContent = gameMode === 'ai' ? 'AI' : 'Player O';

    resetBoard();
}

function resetBoard() {
    board = Array(9).fill(null);
    currentPlayer = 'X';
    gameActive = true;
    aiThinking = false;

    cells.forEach(cell => {
        cell.textContent = '';
        cell.className = 'cell';
    });

    winLine.classList.remove('animate');
    winLine.setAttribute('x1', 0);
    winLine.setAttribute('y1', 0);
    winLine.setAttribute('x2', 0);
    winLine.setAttribute('y2', 0);

    resultOverlay.classList.add('hidden');
    updateTurnIndicator();
    updateScoreHighlight();
}

function restartGame() {
    resetBoard();
}

function goToMenu() {
    window.location.href = '../index.html';
}

// --- Cell Interaction ---
function handleCellClick(index) {
    if (!gameActive || board[index] || aiThinking) return;
    if (gameMode === 'ai' && currentPlayer === 'O') return;

    makeMove(index);
}

function makeMove(index) {
    board[index] = currentPlayer;
    const cell = cells[index];
    cell.textContent = currentPlayer === 'X' ? '✕' : '○';
    cell.classList.add('taken', currentPlayer === 'X' ? 'x-cell' : 'o-cell');

    soundPlace();

    const winResult = checkWin();
    if (winResult) {
        endGame(winResult);
        return;
    }

    if (board.every(c => c !== null)) {
        endGame('draw');
        return;
    }

    currentPlayer = currentPlayer === 'X' ? 'O' : 'X';
    updateTurnIndicator();
    updateScoreHighlight();

    // AI turn
    if (gameMode === 'ai' && currentPlayer === 'O' && gameActive) {
        aiThinking = true;
        turnText.textContent = ' is thinking...';
        const delay = 350 + Math.random() * 400;
        setTimeout(() => {
            if (!gameActive) return;
            const aiMove = getAiMove();
            aiThinking = false;
            makeMove(aiMove);
        }, delay);
    }
}

// --- Win Check ---
function checkWin() {
    for (let i = 0; i < winPatterns.length; i++) {
        const [a, b, c] = winPatterns[i];
        if (board[a] && board[a] === board[b] && board[a] === board[c]) {
            return { winner: board[a], pattern: i, cells: [a, b, c] };
        }
    }
    return null;
}

// --- End Game ---
function endGame(result) {
    gameActive = false;

    if (result === 'draw') {
        scores.draw++;
        soundDraw();
        showResult('draw');
    } else {
        const winner = result.winner;
        scores[winner]++;

        // Highlight winning cells
        result.cells.forEach(i => {
            cells[i].classList.add('winning-cell');
        });

        // Draw win line
        drawWinLine(result.pattern);

        soundWin();
        setTimeout(() => {
            showResult(winner);
            spawnConfetti();
        }, 600);
    }

    updateScoreDisplay();
}

function drawWinLine(patternIndex) {
    const coords = winLineCoords[patternIndex];
    winLine.setAttribute('x1', coords.x1);
    winLine.setAttribute('y1', coords.y1);
    winLine.setAttribute('x2', coords.x2);
    winLine.setAttribute('y2', coords.y2);

    // Trigger animation
    requestAnimationFrame(() => {
        winLine.classList.add('animate');
    });
}

// --- Result Display ---
function showResult(result) {
    const overlay = resultOverlay;
    const title = document.getElementById('result-title');
    const subtitle = document.getElementById('result-subtitle');
    const emoji = document.getElementById('result-emoji');

    title.className = 'result-title';

    if (result === 'draw') {
        emoji.textContent = '🤝';
        title.textContent = "It's a Draw!";
        title.classList.add('draw');
        subtitle.textContent = 'Both players are equally matched!';
    } else {
        const isAI = gameMode === 'ai' && result === 'O';
        const playerName = isAI ? 'AI' : `Player ${result}`;

        emoji.textContent = isAI ? '🤖' : '🎉';
        title.textContent = `${playerName} Wins!`;
        title.classList.add(result === 'X' ? 'x-wins' : 'o-wins');

        const winMessages = isAI
            ? ['The machine prevails!', 'Better luck next time!', 'AI dominance!']
            : ['Amazing play!', 'What a champion!', 'Brilliant strategy!', 'Unstoppable!'];
        subtitle.textContent = winMessages[Math.floor(Math.random() * winMessages.length)];
    }

    overlay.classList.remove('hidden');
}

// --- Confetti ---
function spawnConfetti() {
    const colors = ['#00f0ff', '#ff2d75', '#b44dff', '#00ff88', '#ffe44d'];
    for (let i = 0; i < 40; i++) {
        const el = document.createElement('div');
        el.classList.add('confetti');
        el.style.left = Math.random() * 100 + 'vw';
        el.style.width = (6 + Math.random() * 8) + 'px';
        el.style.height = (6 + Math.random() * 8) + 'px';
        el.style.background = colors[Math.floor(Math.random() * colors.length)];
        el.style.borderRadius = Math.random() > 0.5 ? '50%' : '2px';
        el.style.animationDuration = (2 + Math.random() * 3) + 's';
        el.style.animationDelay = Math.random() * 0.5 + 's';
        el.style.opacity = 0.8 + Math.random() * 0.2;
        document.body.appendChild(el);
        setTimeout(() => el.remove(), 5500);
    }
}

// --- UI Updates ---
function updateTurnIndicator() {
    turnSymbol.textContent = currentPlayer === 'X' ? '✕' : '○';
    turnSymbol.style.color = currentPlayer === 'X' ? 'var(--neon-cyan)' : 'var(--neon-pink)';
    turnText.textContent = "'s Turn";

    turnIndicator.classList.remove('x-turn', 'o-turn');
    turnIndicator.classList.add(currentPlayer === 'X' ? 'x-turn' : 'o-turn');
}

function updateScoreDisplay() {
    document.getElementById('score-x').textContent = scores.X;
    document.getElementById('score-o').textContent = scores.O;
    document.getElementById('score-draw').textContent = scores.draw;
}

function updateScoreHighlight() {
    document.getElementById('score-x-card').classList.toggle('active', currentPlayer === 'X');
    document.getElementById('score-o-card').classList.toggle('active', currentPlayer === 'O');
}

// --- AI Logic ---
function getAiMove() {
    const emptyIndices = board.map((v, i) => v === null ? i : null).filter(v => v !== null);

    if (difficulty === 'easy') {
        // 70% random, 30% smart
        if (Math.random() < 0.7) {
            return emptyIndices[Math.floor(Math.random() * emptyIndices.length)];
        }
        return getBestMove();
    }

    if (difficulty === 'medium') {
        // 35% random, 65% smart
        if (Math.random() < 0.35) {
            return emptyIndices[Math.floor(Math.random() * emptyIndices.length)];
        }
        return getBestMove();
    }

    // Hard — always minimax
    return getBestMove();
}

function getBestMove() {
    let bestScore = -Infinity;
    let bestMove = null;

    for (let i = 0; i < 9; i++) {
        if (board[i] === null) {
            board[i] = 'O';
            const score = minimax(board, 0, false, -Infinity, Infinity);
            board[i] = null;
            if (score > bestScore) {
                bestScore = score;
                bestMove = i;
            }
        }
    }
    return bestMove;
}

function minimax(boardState, depth, isMaximizing, alpha, beta) {
    // Check terminal states
    const winner = getWinner(boardState);
    if (winner === 'O') return 10 - depth;
    if (winner === 'X') return depth - 10;
    if (boardState.every(c => c !== null)) return 0;

    if (isMaximizing) {
        let best = -Infinity;
        for (let i = 0; i < 9; i++) {
            if (boardState[i] === null) {
                boardState[i] = 'O';
                best = Math.max(best, minimax(boardState, depth + 1, false, alpha, beta));
                boardState[i] = null;
                alpha = Math.max(alpha, best);
                if (beta <= alpha) break;
            }
        }
        return best;
    } else {
        let best = Infinity;
        for (let i = 0; i < 9; i++) {
            if (boardState[i] === null) {
                boardState[i] = 'X';
                best = Math.min(best, minimax(boardState, depth + 1, true, alpha, beta));
                boardState[i] = null;
                beta = Math.min(beta, best);
                if (beta <= alpha) break;
            }
        }
        return best;
    }
}

function getWinner(boardState) {
    for (const [a, b, c] of winPatterns) {
        if (boardState[a] && boardState[a] === boardState[b] && boardState[a] === boardState[c]) {
            return boardState[a];
        }
    }
    return null;
}
