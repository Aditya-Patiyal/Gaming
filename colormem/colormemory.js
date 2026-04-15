/* ================================================
   COLOR MEMORY — Game Logic
   Simon Says style memory game with scoring,
   levels, speed modes, and audio feedback
   ================================================ */

// --- State ---
let sequence = [];
let playerIndex = 0;
let level = 1;
let score = 0;
let bestScore = parseInt(localStorage.getItem('colorMemoryBest') || '0');
let speed = 'normal';
let isShowingSequence = false;
let isPlayerTurn = false;
let isGameOver = false;

const speedSettings = {
    slow:   { flash: 700, gap: 400, pause: 800 },
    normal: { flash: 450, gap: 250, pause: 600 },
    fast:   { flash: 280, gap: 150, pause: 400 },
};

const padColors = ['#FF6B6B', '#4ECDC4', '#FFE66D', '#A78BFA'];
const padFreqs = [261.6, 329.6, 392.0, 523.3]; // C4, E4, G4, C5

// --- DOM ---
const startScreen = document.getElementById('start-screen');
const gameScreen = document.getElementById('game-screen');
const gameoverScreen = document.getElementById('gameover-screen');
const pads = [0,1,2,3].map(i => document.getElementById('pad-' + i));
const statusText = document.getElementById('status-text');
const statusProgress = document.getElementById('status-progress');
const levelDisplay = document.getElementById('level-display');
const scoreDisplay = document.getElementById('score-display');
const bestDisplay = document.getElementById('best-display');
const sequenceDots = document.getElementById('sequence-dots');

// --- Audio ---
const audioCtx = new (window.AudioContext || window.webkitAudioContext)();

function playNote(freq, duration = 0.2, volume = 0.15) {
    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(freq, audioCtx.currentTime);
    gain.gain.setValueAtTime(volume, audioCtx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + duration);
    osc.connect(gain);
    gain.connect(audioCtx.destination);
    osc.start();
    osc.stop(audioCtx.currentTime + duration);
}

function playErrorSound() {
    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();
    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(150, audioCtx.currentTime);
    gain.gain.setValueAtTime(0.12, audioCtx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + 0.5);
    osc.connect(gain);
    gain.connect(audioCtx.destination);
    osc.start();
    osc.stop(audioCtx.currentTime + 0.5);
}

function playLevelUpSound() {
    [523, 659, 784, 1047].forEach((f, i) => {
        setTimeout(() => playNote(f, 0.15, 0.1), i * 80);
    });
}

// --- Particles ---
function initParticles() {
    const field = document.getElementById('particle-field');
    field.innerHTML = '';
    for (let i = 0; i < 30; i++) {
        const p = document.createElement('div');
        p.classList.add('particle');
        p.style.left = Math.random() * 100 + '%';
        p.style.animationDuration = (6 + Math.random() * 10) + 's';
        p.style.animationDelay = Math.random() * 8 + 's';
        p.style.width = p.style.height = (2 + Math.random() * 3) + 'px';
        p.style.background = padColors[Math.floor(Math.random() * 4)];
        p.style.opacity = 0.25 + Math.random() * 0.25;
        field.appendChild(p);
    }
}

// --- Screen Navigation ---
function showScreen(screen) {
    [startScreen, gameScreen, gameoverScreen].forEach(s => s.classList.remove('active'));
    screen.classList.add('active');
}

function setSpeed(sp) {
    speed = sp;
    document.querySelectorAll('.speed-btn').forEach(b => b.classList.remove('selected'));
    document.getElementById('speed-' + sp).classList.add('selected');
}

// --- Update Displays ---
function updateDisplays() {
    levelDisplay.textContent = level;
    scoreDisplay.textContent = score;
    bestDisplay.textContent = bestScore;
    document.getElementById('best-score-value').textContent = bestScore;
}

function setStatus(text) {
    statusText.textContent = text;
}

function updateProgressBar() {
    const pct = sequence.length > 0 ? (playerIndex / sequence.length) * 100 : 0;
    statusProgress.style.width = pct + '%';
}

// --- Progress Display ---
function renderProgress() {
    if (sequence.length === 0) {
        sequenceDots.textContent = '';
        return;
    }
    if (isPlayerTurn) {
        sequenceDots.textContent = playerIndex + ' / ' + sequence.length;
    } else {
        sequenceDots.textContent = 'Round ' + sequence.length;
    }
}

// --- Pad Effects ---
function lightPad(index, duration = 400) {
    return new Promise(resolve => {
        pads[index].classList.add('lit');
        playNote(padFreqs[index], duration / 1000);
        setTimeout(() => {
            pads[index].classList.remove('lit');
            resolve();
        }, duration);
    });
}

function dimPads() {
    pads.forEach(p => p.classList.add('dimmed'));
}

function enablePads() {
    pads.forEach(p => p.classList.remove('dimmed'));
}

function flashError(index) {
    return new Promise(resolve => {
        pads[index].classList.add('error-flash');
        playErrorSound();
        setTimeout(() => {
            pads[index].classList.remove('error-flash');
            resolve();
        }, 600);
    });
}

// --- Core Game ---
function startGame() {
    sequence = [];
    playerIndex = 0;
    level = 1;
    score = 0;
    isGameOver = false;

    showScreen(gameScreen);
    updateDisplays();
    setStatus('Get ready...');
    statusProgress.style.width = '0%';
    sequenceDots.innerHTML = '';

    dimPads();

    setTimeout(() => {
        nextRound();
    }, 1000);
}

function nextRound() {
    isPlayerTurn = false;
    playerIndex = 0;
    dimPads();
    updateProgressBar();

    // Add new random color
    sequence.push(Math.floor(Math.random() * 4));
    level = sequence.length;
    updateDisplays();
    renderProgress();

    setStatus('Watch closely...');

    setTimeout(() => {
        playSequence();
    }, speedSettings[speed].pause);
}

async function playSequence() {
    isShowingSequence = true;
    dimPads();

    const settings = speedSettings[speed];

    for (let i = 0; i < sequence.length; i++) {
        await lightPad(sequence[i], settings.flash);
        await wait(settings.gap);
    }

    isShowingSequence = false;
    enablePads();
    isPlayerTurn = true;
    setStatus('Your turn!');
}

function padClick(index) {
    if (!isPlayerTurn || isShowingSequence || isGameOver) return;

    // Resume audio context on first interaction
    if (audioCtx.state === 'suspended') audioCtx.resume();

    lightPad(index, 200);

    if (sequence[playerIndex] === index) {
        // Correct!
        playerIndex++;
        renderProgress();
        score += level; // More points for harder levels
        updateDisplays();
        updateProgressBar();

        if (playerIndex === sequence.length) {
            // Completed this round!
            isPlayerTurn = false;
            dimPads();
            setStatus('Nice! 🎉');
            playLevelUpSound();

            setTimeout(() => {
                nextRound();
            }, 1000);
        }
    } else {
        // Wrong!
        isPlayerTurn = false;
        handleGameOver(index);
    }
}

async function handleGameOver(wrongIndex) {
    isGameOver = true;
    dimPads();
    enablePads(); // so error flash shows

    await flashError(wrongIndex);

    // Show correct one
    await wait(300);
    await lightPad(sequence[playerIndex], 600);

    // Update best score
    let isNewRecord = false;
    if (score > bestScore) {
        bestScore = score;
        localStorage.setItem('colorMemoryBest', bestScore.toString());
        isNewRecord = true;
    }
    updateDisplays();

    showGameOver(isNewRecord);
}

function showGameOver(isNewRecord) {
    const emoji = document.getElementById('gameover-emoji');
    const title = document.getElementById('gameover-title');
    const msg = document.getElementById('go-message');
    const badge = document.getElementById('newrecord-badge');

    document.getElementById('final-score').textContent = score;
    document.getElementById('final-level').textContent = level;
    document.getElementById('final-best').textContent = bestScore;

    if (isNewRecord) {
        emoji.textContent = '🏆';
        title.textContent = 'New Record!';
        badge.classList.remove('hidden');
    } else {
        badge.classList.add('hidden');
        if (level <= 3) {
            emoji.textContent = '😅';
            title.textContent = 'Game Over';
            msg.textContent = 'Keep practicing, you\'ll get better!';
        } else if (level <= 7) {
            emoji.textContent = '🧠';
            title.textContent = 'Good Try!';
            msg.textContent = 'Your memory is getting sharper!';
        } else if (level <= 12) {
            emoji.textContent = '🔥';
            title.textContent = 'Impressive!';
            msg.textContent = 'You have a strong memory!';
        } else {
            emoji.textContent = '🤯';
            title.textContent = 'Incredible!';
            msg.textContent = 'Your memory is exceptional!';
        }
    }

    if (isNewRecord) {
        const messages = [
            'You\'ve surpassed your previous best!',
            'Outstanding memory performance!',
            'You\'re on fire! 🔥',
        ];
        msg.textContent = messages[Math.floor(Math.random() * messages.length)];
    }

    setTimeout(() => showScreen(gameoverScreen), 500);
}

function quitGame() {
    isGameOver = true;
    isPlayerTurn = false;
    isShowingSequence = false;

    let isNewRecord = false;
    if (score > bestScore) {
        bestScore = score;
        localStorage.setItem('colorMemoryBest', bestScore.toString());
        isNewRecord = true;
    }
    updateDisplays();
    showGameOver(isNewRecord);
}

function goHome() {
    showScreen(startScreen);
    updateDisplays();
}

// --- Utility ---
function wait(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

// --- Init ---
initParticles();
updateDisplays();
