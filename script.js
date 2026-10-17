const SUITS = ['♠', '♥', '♦', '♣'];
const RANKS = ['A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K'];

const STORAGE_KEY_SAVE = 'solitaire_saved_game_v3';
const STORAGE_KEY_STATS = 'solitaire_stats_v2';
const STORAGE_KEY_SOUND = 'solitaire_sound_v2';
const STORAGE_KEY_DRAW_COUNT = 'solitaire_draw_count_v2';

let stock = [];
let waste = [];
let foundations = [[], [], [], []];
let tableau = [[], [], [], [], [], [], []];
let initialDealJson = null;

let drawCount = parseInt(localStorage.getItem(STORAGE_KEY_DRAW_COUNT) || '1', 10);
let selectedLocation = null;
let historyStack = [];
let redoStack = [];

let currentGameNumber = 1;
let moveCount = 0;
let secondsElapsed = 0;
let timerInterval = null;
let isTimerRunning = false;
let isGameWon = false;
let hasCountedPlay = false;

let soundEnabled = localStorage.getItem(STORAGE_KEY_SOUND) !== 'false';
let hintLocations = [];
let isAutoCompleting = false;

let stockCycleCount = 0;
let movesMadeSinceStockReset = 0;

// ドラマチック演出の状態管理
let hasShownNearGoalBanner = false;
let hasShownClimaxBanner = false;
let newlyRevealedCardKey = null;

let lastTapTime = 0;
let lastTapKey = '';

let audioCtx = null;
let isAudioUnlocked = false;

function getAudioContext() {
    if (!audioCtx) {
        const AudioContextClass = window.AudioContext || window.webkitAudioContext;
        if (AudioContextClass) {
            audioCtx = new AudioContextClass();
        }
    }
    return audioCtx;
}

function unlockAudioEngine() {
    const ctx = getAudioContext();
    if (!ctx) return;

    if (ctx.state === 'suspended') {
        ctx.resume();
    }

    if (!isAudioUnlocked) {
        try {
            const buffer = ctx.createBuffer(1, 1, 22050);
            const source = ctx.createBufferSource();
            source.buffer = buffer;
            source.connect(ctx.destination);
            source.start(0);
            isAudioUnlocked = true;
        } catch (e) {}
    }
}

['touchstart', 'touchend', 'pointerdown', 'pointerup', 'click'].forEach(eventType => {
    window.addEventListener(eventType, unlockAudioEngine, { passive: true });
});

// ==========================================
// ★強化版サウンドシンセサイザー（感情豊かな効果音）
// ==========================================
function playSound(type, pitchStep = 0) {
    if (!soundEnabled) return;
    unlockAudioEngine();
    const ctx = getAudioContext();
    if (!ctx) return;

    if (ctx.state === 'suspended') {
        ctx.resume();
    }

    try {
        const now = ctx.currentTime;

        if (type === 'move') {
            const osc = ctx.createOscillator();
            const gain = ctx.createGain();
            osc.connect(gain);
            gain.connect(ctx.destination);
            osc.type = 'sine';
            osc.frequency.setValueAtTime(540, now);
            osc.frequency.exponentialRampToValueAtTime(280, now + 0.06);
            gain.gain.setValueAtTime(0.35, now);
            gain.gain.exponentialRampToValueAtTime(0.001, now + 0.06);
            osc.start(now);
            osc.stop(now + 0.06);
        } else if (type === 'flip') {
            const osc = ctx.createOscillator();
            const gain = ctx.createGain();
            osc.connect(gain);
            gain.connect(ctx.destination);
            osc.type = 'triangle';
            osc.frequency.setValueAtTime(780, now);
            osc.frequency.exponentialRampToValueAtTime(380, now + 0.05);
            gain.gain.setValueAtTime(0.3, now);
            gain.gain.exponentialRampToValueAtTime(0.001, now + 0.05);
            osc.start(now);
            osc.stop(now + 0.05);
        } else if (type === 'reveal') {
            // 裏カードが新しく表になった時の「キラッ✨」という高音ベル
            [987.77, 1318.51].forEach((freq, idx) => {
                const o = ctx.createOscillator();
                const g = ctx.createGain();
                o.connect(g);
                g.connect(ctx.destination);
                o.type = 'sine';
                o.frequency.setValueAtTime(freq, now + idx * 0.05);
                g.gain.setValueAtTime(0.25, now + idx * 0.05);
                g.gain.exponentialRampToValueAtTime(0.001, now + idx * 0.05 + 0.18);
                o.start(now + idx * 0.05);
                o.stop(now + idx * 0.05 + 0.18);
            });
        } else if (type === 'foundation') {
            // 組札に置いた時、A〜Kまでドレミ音階で上がる爽快なクリスタル音
            const scale = [523.25, 587.33, 659.25, 698.46, 783.99, 880.00, 987.77, 1046.50, 1174.66, 1318.51, 1396.91, 1567.98, 2093.00];
            const freq = scale[Math.min(12, Math.max(0, pitchStep - 1))] || 523.25;
            const osc = ctx.createOscillator();
            const gain = ctx.createGain();
            osc.connect(gain);
            gain.connect(ctx.destination);
            osc.type = 'triangle';
            osc.frequency.setValueAtTime(freq, now);
            osc.frequency.exponentialRampToValueAtTime(freq * 1.25, now + 0.12);
            gain.gain.setValueAtTime(0.4, now);
            gain.gain.exponentialRampToValueAtTime(0.001, now + 0.14);
            osc.start(now);
            osc.stop(now + 0.14);

            // K(13)が完成した時は豪華なきらめきコードを追加
            if (pitchStep === 13) {
                [1046.5, 1318.5, 1568.0, 2093.0].forEach((f, i) => {
                    const o = ctx.createOscillator();
                    const g = ctx.createGain();
                    o.connect(g);
                    g.connect(ctx.destination);
                    o.type = 'sine';
                    o.frequency.setValueAtTime(f, now + 0.06 + i * 0.05);
                    g.gain.setValueAtTime(0.3, now + 0.06 + i * 0.05);
                    g.gain.exponentialRampToValueAtTime(0.001, now + 0.35 + i * 0.05);
                    o.start(now + 0.06 + i * 0.05);
                    o.stop(now + 0.35 + i * 0.05);
                });
            }
        } else if (type === 'climax') {
            // 全ての裏カードが開いた時のハープ風上昇アルペジオ
            const notes = [523.25, 659.25, 783.99, 1046.50, 1318.51, 1567.98];
            notes.forEach((f, idx) => {
                const o = ctx.createOscillator();
                const g = ctx.createGain();
                o.connect(g);
                g.connect(ctx.destination);
                o.type = 'sine';
                o.frequency.setValueAtTime(f, now + idx * 0.06);
                g.gain.setValueAtTime(0.3, now + idx * 0.06);
                g.gain.exponentialRampToValueAtTime(0.001, now + idx * 0.06 + 0.3);
                o.start(now + idx * 0.06);
                o.stop(now + idx * 0.06 + 0.3);
            });
        } else if (type === 'win') {
            // 大勝利ファンファーレ（メロディ＋和音）
            const melody = [
                { f: 523.25, b: 261.63, d: 0.14 },
                { f: 659.25, b: 329.63, d: 0.14 },
                { f: 783.99, b: 392.00, d: 0.14 },
                { f: 1046.50, b: 523.25, d: 0.28 },
                { f: 880.00, b: 440.00, d: 0.14 },
                { f: 1046.50, b: 523.25, d: 0.65 }
            ];
            let offset = 0;
            melody.forEach(n => {
                [n.f, n.b].forEach((freq, idx) => {
                    const o = ctx.createOscillator();
                    const g = ctx.createGain();
                    o.connect(g);
                    g.connect(ctx.destination);
                    o.type = idx === 0 ? 'triangle' : 'sine';
                    o.frequency.setValueAtTime(freq, now + offset);
                    g.gain.setValueAtTime(idx === 0 ? 0.4 : 0.25, now + offset);
                    g.gain.exponentialRampToValueAtTime(0.001, now + offset + n.d);
                    o.start(now + offset);
                    o.stop(now + offset + n.d);
                });
                offset += n.d * 0.88;
            });
        } else if (type === 'firework') {
            // 花火が弾ける軽快なポンッという音
            const osc = ctx.createOscillator();
            const gain = ctx.createGain();
            osc.connect(gain);
            gain.connect(ctx.destination);
            osc.type = 'sine';
            osc.frequency.setValueAtTime(320 + Math.random() * 200, now);
            osc.frequency.exponentialRampToValueAtTime(60, now + 0.12);
            gain.gain.setValueAtTime(0.2, now);
            gain.gain.exponentialRampToValueAtTime(0.001, now + 0.12);
            osc.start(now);
            osc.stop(now + 0.12);
        } else if (type === 'lose') {
            // 手詰まり時の「ワ〜ワ〜ワ〜ン…」という残念な下降音
            const sadNotes = [
                { fStart: 392.00, fEnd: 380.00, d: 0.28 },
                { fStart: 369.99, fEnd: 358.00, d: 0.28 },
                { fStart: 349.23, fEnd: 338.00, d: 0.28 },
                { fStart: 329.63, fEnd: 270.00, d: 0.75 }
            ];
            let offset = 0;
            sadNotes.forEach(n => {
                const o = ctx.createOscillator();
                const g = ctx.createGain();
                o.connect(g);
                g.connect(ctx.destination);
                o.type = 'sawtooth';
                o.frequency.setValueAtTime(n.fStart, now + offset);
                o.frequency.linearRampToValueAtTime(n.fEnd, now + offset + n.d);
                g.gain.setValueAtTime(0.18, now + offset);
                g.gain.exponentialRampToValueAtTime(0.001, now + offset + n.d);
                o.start(now + offset);
                o.stop(now + offset + n.d);
                offset += n.d * 0.95;
            });
        }
    } catch (e) {}
}

function toggleSound() {
    unlockAudioEngine();
    soundEnabled = !soundEnabled;
    localStorage.setItem(STORAGE_KEY_SOUND, soundEnabled);
    document.getElementById('sound-btn').innerText = soundEnabled ? '🔊 サウンド' : '🔇 サウンド';
    if (soundEnabled) {
        playSound('move');
    }
}

function createDeck() {
    let deck = [];
    for (let suit of SUITS) {
        for (let i = 0; i < RANKS.length; i++) {
            let isRed = (suit === '♥' || suit === '♦');
            deck.push({
                suit: suit,
                rank: RANKS[i],
                value: i + 1,
                color: isRed ? 'red' : 'black',
                faceUp: false
            });
        }
    }
    return deck;
}

function shuffle(deck) {
    for (let i = deck.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        let temp = deck[i];
        deck[i] = deck[j];
        deck[j] = temp;
    }
    return deck;
}

function startTimerIfNeeded() {
    if (!isTimerRunning && !isGameWon) {
        isTimerRunning = true;
        if (!hasCountedPlay) {
            hasCountedPlay = true;
            incrementPlayedCount();
        }
        timerInterval = setInterval(() => {
            secondsElapsed++;
            updateStatusDisplay();
            saveCurrentGame();
        }, 1000);
    }
}

function resetTimer() {
    if (timerInterval) {
        clearInterval(timerInterval);
        timerInterval = null;
    }
    isTimerRunning = false;
    secondsElapsed = 0;
    updateStatusDisplay();
}

function stopTimer() {
    if (timerInterval) {
        clearInterval(timerInterval);
        timerInterval = null;
    }
    isTimerRunning = false;
}

function updateStatusDisplay() {
    document.getElementById('game-mode-display').innerText = `${drawCount}枚ドロー`;
    document.getElementById('move-count').innerText = moveCount;
    let mins = Math.floor(secondsElapsed / 60);
    let secs = secondsElapsed % 60;
    document.getElementById('game-timer').innerText = `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
}

// カットインバナー表示
let bannerTimeout = null;
function showClimaxBanner(text) {
    const banner = document.getElementById('climax-banner');
    if (!banner) return;
    banner.innerText = text;
    banner.classList.remove('hidden');
    // アニメーション再トリガー
    banner.style.animation = 'none';
    void banner.offsetWidth;
    banner.style.animation = null;

    if (bannerTimeout) clearTimeout(bannerTimeout);
    bannerTimeout = setTimeout(() => {
        banner.classList.add('hidden');
    }, 2600);
}

function resetDramaStates() {
    hasShownNearGoalBanner = false;
    hasShownClimaxBanner = false;
    newlyRevealedCardKey = null;
    document.body.classList.remove('near-goal-mode', 'climax-mode', 'gameover-mode');
    stopConfetti();
}

function dealGame(mode = null) {
    if (mode !== null) {
        drawCount = mode;
        localStorage.setItem(STORAGE_KEY_DRAW_COUNT, drawCount);
    }

    currentGameNumber = Math.floor(Math.random() * 1000000) + 1;
    isGameWon = false;
    hasCountedPlay = false;
    isAutoCompleting = false;
    hintLocations = [];
    stockCycleCount = 0;
    movesMadeSinceStockReset = 0;

    resetDramaStates();
    document.getElementById('win-modal').classList.add('hidden');
    document.getElementById('stalemate-modal').classList.add('hidden');
    closeModeSelectModal();

    let deck = shuffle(createDeck());
    tableau = [[], [], [], [], [], [], []];
    foundations = [[], [], [], []];
    waste = [];
    stock = [];
    selectedLocation = null;
    historyStack = [];
    redoStack = [];
    moveCount = 0;

    for (let i = 0; i < 7; i++) {
        for (let j = 0; j <= i; j++) {
            let card = deck.pop();
            card.faceUp = (j === i);
            tableau[i].push(card);
        }
    }

    while (deck.length > 0) {
        let card = deck.pop();
        card.faceUp = false;
        stock.push(card);
    }

    initialDealJson = JSON.stringify({ stock, tableau, drawCount });

    resetTimer();
    renderBoard();
    saveCurrentGame();
}

function retryCurrentGame() {
    if (!initialDealJson) {
        dealGame(drawCount);
        return;
    }
    const initData = JSON.parse(initialDealJson);
    stock = initData.stock;
    tableau = initData.tableau;
    drawCount = initData.drawCount || drawCount;
    waste = [];
    foundations = [[], [], [], []];
    selectedLocation = null;
    historyStack = [];
    redoStack = [];
    moveCount = 0;
    isGameWon = false;
    isAutoCompleting = false;
    hintLocations = [];
    stockCycleCount = 0;
    movesMadeSinceStockReset = 0;

    resetDramaStates();
    document.getElementById('win-modal').classList.add('hidden');
    document.getElementById('stalemate-modal').classList.add('hidden');
    closeModeSelectModal();

    resetTimer();
    playSound('flip');
    renderBoard();
    saveCurrentGame();
}

function openModeSelectModal() {
    document.getElementById('stalemate-modal').classList.add('hidden');
    document.getElementById('win-modal').classList.add('hidden');
    document.getElementById('mode-modal').classList.remove('hidden');
}

function closeModeSelectModal() {
    document.getElementById('mode-modal').classList.add('hidden');
}

function startNewGameWithMode(mode) {
    dealGame(mode);
}

function restartFromWinModal() {
    resetDramaStates();
    document.getElementById('win-modal').classList.add('hidden');
    openModeSelectModal();
}

function closeStalemateModal() {
    document.body.classList.remove('gameover-mode');
    stopConfetti();
    document.getElementById('stalemate-modal').classList.add('hidden');
}

function snapshotState() {
    return JSON.stringify({
        stock, waste, foundations, tableau, moveCount, drawCount, movesMadeSinceStockReset
    });
}

function restoreState(jsonStr) {
    const s = JSON.parse(jsonStr);
    stock = s.stock;
    waste = s.waste;
    foundations = s.foundations;
    tableau = s.tableau;
    moveCount = s.moveCount;
    drawCount = s.drawCount || 1;
    movesMadeSinceStockReset = s.movesMadeSinceStockReset || 0;
}

function recordMove() {
    historyStack.push(snapshotState());
    redoStack = [];
    moveCount++;
    movesMadeSinceStockReset++;
    updateStatusDisplay();
}

function undoMove() {
    if (isGameWon || historyStack.length === 0) return;
    redoStack.push(snapshotState());
    const prevState = historyStack.pop();
    restoreState(prevState);
    selectedLocation = null;
    hintLocations = [];
    closeStalemateModal();
    updateStatusDisplay();
    playSound('move');
    renderBoard();
    saveCurrentGame();
}

function redoMove() {
    if (isGameWon || redoStack.length === 0) return;
    historyStack.push(snapshotState());
    const nextState = redoStack.pop();
    restoreState(nextState);
    selectedLocation = null;
    hintLocations = [];
    updateStatusDisplay();
    playSound('move');
    checkWinCondition();
    renderBoard();
    saveCurrentGame();
}

function handleStockClick() {
    if (isGameWon || isAutoCompleting) return;
    startTimerIfNeeded();
    recordMove();

    if (stock.length > 0) {
        const count = Math.min(drawCount, stock.length);
        for (let i = 0; i < count; i++) {
            let card = stock.pop();
            card.faceUp = true;
            waste.push(card);
        }
        playSound('flip');
    } else {
        while (waste.length > 0) {
            let card = waste.pop();
            card.faceUp = false;
            stock.push(card);
        }
        playSound('move');

        stockCycleCount++;
        movesMadeSinceStockReset = 0;
    }
    selectedLocation = null;
    hintLocations = [];
    renderBoard();
    saveCurrentGame();

    if (!isGameWon) {
        setTimeout(checkStalemateCondition, 100);
    }
}

function getCardsAt(loc) {
    if (loc.area === 'waste') {
        return waste.length > 0 ? [waste[waste.length - 1]] : [];
    }
    if (loc.area === 'foundation') {
        let col = foundations[loc.index];
        return col.length > 0 ? [col[col.length - 1]] : [];
    }
    if (loc.area === 'tableau') {
        return tableau[loc.index].slice(loc.cardIndex);
    }
    return [];
}

function removeCardsFrom(loc, count) {
    if (loc.area === 'waste') {
        return [waste.pop()];
    }
    if (loc.area === 'foundation') {
        return [foundations[loc.index].pop()];
    }
    if (loc.area === 'tableau') {
        let removed = tableau[loc.index].splice(-count);
        if (tableau[loc.index].length > 0) {
            const exposedCard = tableau[loc.index][tableau[loc.index].length - 1];
            if (!exposedCard.faceUp) {
                exposedCard.faceUp = true;
                newlyRevealedCardKey = `${loc.index}-${tableau[loc.index].length - 1}`;
                setTimeout(() => playSound('reveal'), 60);
            }
        }
        return removed;
    }
    return [];
}

function addCardsTo(loc, cards) {
    if (loc.area === 'foundation') {
        foundations[loc.index].push(cards[0]);
    }
    if (loc.area === 'tableau') {
        tableau[loc.index].push(...cards);
    }
}

function tryMove(from, to) {
    let movingCards = getCardsAt(from);
    if (movingCards.length === 0) return false;

    let firstCard = movingCards[0];
    newlyRevealedCardKey = null;

    if (to.area === 'foundation') {
        if (movingCards.length === 1) {
            let fCol = foundations[to.index];
            let topF = fCol.length > 0 ? fCol[fCol.length - 1] : null;
            if (topF === null) {
                if (firstCard.value === 1) {
                    recordMove();
                    addCardsTo(to, removeCardsFrom(from, 1));
                    triggerFoundationSparkle(to.index, firstCard.value === 13);
                    return 'foundation';
                }
            } else {
                if (firstCard.suit === topF.suit && firstCard.value === topF.value + 1) {
                    recordMove();
                    addCardsTo(to, removeCardsFrom(from, 1));
                    triggerFoundationSparkle(to.index, firstCard.value === 13);
                    return 'foundation';
                }
            }
        }
    }

    if (to.area === 'tableau') {
        let tCol = tableau[to.index];
        let targetCard = tCol.length > 0 ? tCol[tCol.length - 1] : null;

        if (targetCard === null) {
            if (firstCard.value === 13) {
                recordMove();
                addCardsTo(to, removeCardsFrom(from, movingCards.length));
                return 'tableau';
            }
        } else {
            if (firstCard.color !== targetCard.color && firstCard.value === targetCard.value - 1) {
                recordMove();
                addCardsTo(to, removeCardsFrom(from, movingCards.length));
                return 'tableau';
            }
        }
    }

    return false;
}

function trySmartMove(fromLoc) {
    let movingCards = getCardsAt(fromLoc);
    if (movingCards.length === 0) return false;
    let firstCard = movingCards[0];

    if (movingCards.length === 1 && fromLoc.area !== 'foundation') {
        for (let f = 0; f < 4; f++) {
            if (canMoveToFoundationSpecific(firstCard, f)) {
                tryMove(fromLoc, { area: 'foundation', index: f });
                playSound('foundation', firstCard.value);
                checkWinCondition();
                saveCurrentGame();
                return true;
            }
        }
    }

    for (let t = 0; t < 7; t++) {
        if (fromLoc.area === 'tableau' && fromLoc.index === t) continue;
        if (canMoveToTableauSpecific(firstCard, t)) {
            if (fromLoc.area === 'tableau' && fromLoc.cardIndex === 0 && tableau[t].length === 0) {
                continue;
            }
            tryMove(fromLoc, { area: 'tableau', index: t });
            playSound('move');
            checkWinCondition();
            saveCurrentGame();
            return true;
        }
    }

    return false;
}

// 数値のカウントアップ演出（クリア画面用）
function animateResultNumbers(finalSeconds, finalMoves) {
    const timeEl = document.getElementById('final-time');
    const movesEl = document.getElementById('final-moves');
    let step = 0;
    const totalSteps = 25;
    const interval = setInterval(() => {
        step++;
        const progress = step / totalSteps;
        const curSec = Math.round(finalSeconds * progress);
        const curMov = Math.round(finalMoves * progress);
        const mins = Math.floor(curSec / 60);
        const secs = curSec % 60;
        timeEl.innerText = `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
        movesEl.innerText = curMov;
        if (step >= totalSteps) clearInterval(interval);
    }, 30);
}

function checkWinCondition() {
    let totalInFoundation = foundations.reduce((sum, col) => sum + col.length, 0);
    if (totalInFoundation === 52 && !isGameWon) {
        isGameWon = true;
        stopTimer();
        const isNewRecord = recordWin();
        saveCurrentGame();
        playSound('win');
        startVictoryShow(); // 花火＋トランプの滝＋紙吹雪の超豪華演出！

        const badge = document.getElementById('new-record-badge');
        if (isNewRecord) {
            badge.classList.remove('hidden');
        } else {
            badge.classList.add('hidden');
        }

        document.getElementById('win-modal').classList.remove('hidden');
        animateResultNumbers(secondsElapsed, moveCount);
    }
}

function canMoveToFoundationSpecific(card, fIndex) {
    let topF = foundations[fIndex].length > 0 ? foundations[fIndex][foundations[fIndex].length - 1] : null;
    if (topF === null) return card.value === 1;
    return card.suit === topF.suit && card.value === topF.value + 1;
}

function canMoveToTableauSpecific(card, tIndex) {
    let topT = tableau[tIndex].length > 0 ? tableau[tIndex][tableau[tIndex].length - 1] : null;
    if (topT === null) return card.value === 13;
    return card.color !== topT.color && card.value === topT.value - 1;
}

function hasKingWithFaceDown() {
    for (let i = 0; i < 7; i++) {
        for (let j = 0; j < tableau[i].length; j++) {
            let card = tableau[i][j];
            if (card.faceUp && card.value === 13 && j > 0 && !tableau[i][j - 1].faceUp) {
                return true;
            }
        }
    }
    return false;
}

function findValidMoves() {
    let moves = [];
    
    if (waste.length > 0) {
        let card = waste[waste.length - 1];
        for (let f = 0; f < 4; f++) {
            if (canMoveToFoundationSpecific(card, f)) {
                moves.push({ 
                    from: { area: 'waste', index: 0, cardIndex: 0 }, 
                    to: { area: 'foundation', index: f, cardIndex: 0 }, 
                    score: 100 
                });
            }
        }
    }
    
    for (let i = 0; i < 7; i++) {
        if (tableau[i].length > 0) {
            let cardIdx = tableau[i].length - 1;
            let card = tableau[i][cardIdx];
            if (card.faceUp) {
                for (let f = 0; f < 4; f++) {
                    if (canMoveToFoundationSpecific(card, f)) {
                        moves.push({ 
                            from: { area: 'tableau', index: i, cardIndex: cardIdx }, 
                            to: { area: 'foundation', index: f, cardIndex: 0 }, 
                            score: 100 
                        });
                    }
                }
            }
        }
    }

    if (waste.length > 0) {
        let card = waste[waste.length - 1];
        for (let t = 0; t < 7; t++) {
            if (canMoveToTableauSpecific(card, t)) {
                moves.push({ 
                    from: { area: 'waste', index: 0, cardIndex: 0 }, 
                    to: { area: 'tableau', index: t, cardIndex: tableau[t].length > 0 ? tableau[t].length - 1 : null }, 
                    score: 60 
                });
            }
        }
    }

    let hasUsefulKing = hasKingWithFaceDown();

    for (let i = 0; i < 7; i++) {
        if (tableau[i].length === 0) continue;
        for (let j = 0; j < tableau[i].length; j++) {
            let card = tableau[i][j];
            if (!card.faceUp) continue;

            const hasFaceDownBelow = (j > 0 && !tableau[i][j - 1].faceUp);
            const isBase = (j === 0);

            for (let t = 0; t < 7; t++) {
                if (i === t) continue;
                if (canMoveToTableauSpecific(card, t)) {
                    let isMeaningful = false;
                    let score = 0;

                    if (hasFaceDownBelow) {
                        isMeaningful = true;
                        score = 80;
                    } else if (isBase) {
                        if (card.value !== 13 && hasUsefulKing) {
                            isMeaningful = true;
                            score = 40;
                        }
                    }

                    if (isMeaningful) {
                        moves.push({ 
                            from: { area: 'tableau', index: i, cardIndex: j }, 
                            to: { area: 'tableau', index: t, cardIndex: tableau[t].length > 0 ? tableau[t].length - 1 : null }, 
                            score: score 
                        });
                    }
                }
            }
        }
    }
    
    moves.sort((a, b) => b.score - a.score);
    return moves;
}

function giveHint() {
    if (isGameWon) return;
    const moves = findValidMoves();
    if (moves.length === 0) {
        if (stock.length > 0 || waste.length > 0) {
            hintLocations = [{ area: 'stock', index: 0 }];
            renderBoard();
        } else {
            checkStalemateCondition();
        }
        return;
    }
    const best = moves[0];
    const fromLoc = { ...best.from, isDestination: false };
    const toLoc = { ...best.to, isDestination: true };
    hintLocations = [fromLoc, toLoc];
    renderBoard();
}

function triggerAutoComplete() {
    if (isGameWon || isAutoCompleting) return;
    isAutoCompleting = true;
    startTimerIfNeeded();

    function step() {
        if (isGameWon) {
            isAutoCompleting = false;
            return;
        }

        let moved = false;

        if (waste.length > 0) {
            let card = waste[waste.length - 1];
            for (let f = 0; f < 4; f++) {
                if (canMoveToFoundationSpecific(card, f)) {
                    tryMove({ area: 'waste', index: 0, cardIndex: 0 }, { area: 'foundation', index: f });
                    playSound('foundation', card.value);
                    renderBoard();
                    moved = true;
                    break;
                }
            }
        }

        if (!moved) {
            for (let i = 0; i < 7; i++) {
                if (tableau[i].length > 0) {
                    let cardIdx = tableau[i].length - 1;
                    let card = tableau[i][cardIdx];
                    if (card.faceUp) {
                        for (let f = 0; f < 4; f++) {
                            if (canMoveToFoundationSpecific(card, f)) {
                                tryMove({ area: 'tableau', index: i, cardIndex: cardIdx }, { area: 'foundation', index: f });
                                playSound('foundation', card.value);
                                renderBoard();
                                moved = true;
                                break;
                            }
                        }
                    }
                    if (moved) break;
                }
            }
        }

        if (!moved) {
            const hasFaceDownOnBoard = tableau.some(col => col.some(c => !c.faceUp));
            if (!hasFaceDownOnBoard && (stock.length > 0 || waste.length > 0)) {
                handleStockClick();
                moved = true;
            }
        }

        if (moved && !isGameWon) {
            setTimeout(step, 85);
        } else {
            isAutoCompleting = false;
            checkWinCondition();
            saveCurrentGame();
        }
    }

    step();
}

// ★手詰まり時のドラマチック残念演出
function checkStalemateCondition() {
    if (isGameWon) return;
    if (!document.getElementById('stalemate-modal').classList.contains('hidden')) return;

    const immediateMoves = findValidMoves();
    if (immediateMoves.length > 0) return;

    let allRemainingCards = [...stock, ...waste];
    let canMoveAnyCardInStock = false;

    for (let card of allRemainingCards) {
        for (let f = 0; f < 4; f++) {
            if (canMoveToFoundationSpecific(card, f)) {
                canMoveAnyCardInStock = true; break;
            }
        }
        if (canMoveAnyCardInStock) break;

        for (let t = 0; t < 7; t++) {
            if (canMoveToTableauSpecific(card, t)) {
                canMoveAnyCardInStock = true; break;
            }
        }
        if (canMoveAnyCardInStock) break;
    }

    if (!canMoveAnyCardInStock) {
        // 画面を揺らし、残念メロディと雨エフェクトを開始
        document.body.classList.remove('near-goal-mode', 'climax-mode');
        document.body.classList.add('gameover-mode');
        playSound('lose');
        startSadRainEffect();
        setTimeout(() => {
            document.getElementById('stalemate-modal').classList.remove('hidden');
        }, 550);
    }
}

function getFaceCardSVG(rank, suit, color) {
    const mainColor = color === 'red' ? '#e53935' : '#1d3557';
    const goldColor = '#f1c40f';
    const skinColor = '#ffe3d1';

    let innerContent = '';

    if (rank === 'K') {
        innerContent = `
            <rect x="10" y="8" width="50" height="74" rx="3" fill="#fdfbf7" stroke="#d4af37" stroke-width="1.2"/>
            <path d="M 16 78 L 24 45 L 46 45 L 54 78 Z" fill="${mainColor}"/>
            <path d="M 22 47 L 35 62 L 48 47 Z" fill="#ffffff" stroke="#d4af37" stroke-width="1"/>
            <rect x="25" y="22" width="20" height="20" rx="3" fill="${skinColor}"/>
            <circle cx="31" cy="30" r="1.3" fill="#222"/>
            <circle cx="39" cy="30" r="1.3" fill="#222"/>
            <path d="M 24 35 Q 35 44 46 35 L 43 41 Q 35 47 27 41 Z" fill="#e2e2e2"/>
            <polygon points="21,22 25,10 30,17 35,7 40,17 45,10 49,22" fill="${goldColor}" stroke="#b78b00" stroke-width="0.8"/>
            <circle cx="35" cy="13" r="1.5" fill="${mainColor}"/>
            <text x="35" y="74" font-size="14" text-anchor="middle" fill="${mainColor}">${suit}</text>
        `;
    } else if (rank === 'Q') {
        innerContent = `
            <rect x="10" y="8" width="50" height="74" rx="3" fill="#fdfbf7" stroke="#d4af37" stroke-width="1.2"/>
            <path d="M 16 78 Q 26 46 35 48 Q 44 46 54 78 Z" fill="${mainColor}"/>
            <path d="M 23 48 Q 35 56 47 48 Z" fill="#ffffff" stroke="#d4af37" stroke-width="1"/>
            <circle cx="35" cy="53" r="1.8" fill="${goldColor}"/>
            <path d="M 22 22 C 18 36 20 48 24 54 M 48 22 C 52 36 50 48 46 54" stroke="#c99765" stroke-width="3" fill="none"/>
            <path d="M 26 23 Q 35 20 44 23 Q 45 36 35 43 Q 25 36 26 23 Z" fill="${skinColor}"/>
            <circle cx="31" cy="29" r="1.2" fill="#222"/>
            <circle cx="39" cy="29" r="1.2" fill="#222"/>
            <path d="M 32 37 Q 35 40 38 37" stroke="#d32f2f" stroke-width="0.8" fill="none"/>
            <polygon points="24,22 28,11 35,16 42,11 46,22" fill="${goldColor}" stroke="#b78b00" stroke-width="0.8"/>
            <circle cx="35" cy="18" r="1.5" fill="${mainColor}"/>
            <text x="35" y="73" font-size="14" text-anchor="middle" fill="${mainColor}">${suit}</text>
        `;
    } else if (rank === 'J') {
        innerContent = `
            <rect x="10" y="8" width="50" height="74" rx="3" fill="#fdfbf7" stroke="#d4af37" stroke-width="1.2"/>
            <path d="M 16 78 L 24 45 L 46 45 L 54 78 Z" fill="#3a5a40"/>
            <path d="M 20 45 L 50 78 L 45 80 L 16 48 Z" fill="${mainColor}"/>
            <rect x="25" y="23" width="20" height="20" rx="3" fill="${skinColor}"/>
            <circle cx="31" cy="30" r="1.3" fill="#222"/>
            <circle cx="39" cy="30" r="1.3" fill="#222"/>
            <path d="M 22 24 C 20 32 22 38 25 38 M 48 24 C 50 32 48 38 45 38" stroke="#8d5b4c" stroke-width="2.5" fill="none"/>
            <path d="M 21 24 Q 35 15 49 24 Z" fill="${mainColor}" stroke="${goldColor}" stroke-width="0.8"/>
            <path d="M 44 21 Q 56 10 50 4 Q 43 9 45 21" fill="${goldColor}"/>
            <text x="35" y="72" font-size="14" text-anchor="middle" fill="${mainColor}">${suit}</text>
        `;
    }

    return `<svg viewBox="0 0 70 90" preserveAspectRatio="none">${innerContent}</svg>`;
}

function getNumberCardSVG(card) {
    const suit = card.suit;
    const color = card.color === 'red' ? '#e53935' : '#1a1a1a';
    
    if (card.value === 1) {
        return `
            <svg viewBox="0 0 50 70">
                <text x="25" y="38" font-size="30" text-anchor="middle" dominant-baseline="central" fill="${color}">${suit}</text>
            </svg>
        `;
    }

    const positions = {
        2: [[25, 20], [25, 50]],
        3: [[25, 18], [25, 35], [25, 52]],
        4: [[16, 20], [34, 20], [16, 50], [34, 50]],
        5: [[16, 20], [34, 20], [25, 35], [16, 50], [34, 50]],
        6: [[16, 20], [34, 20], [16, 35], [34, 35], [16, 50], [34, 50]],
        7: [[16, 20], [34, 20], [25, 26], [16, 35], [34, 35], [16, 50], [34, 50]],
        8: [[16, 20], [34, 20], [25, 26], [16, 35], [34, 35], [25, 44], [16, 50], [34, 50]],
        9: [[16, 17], [34, 17], [16, 28], [34, 28], [25, 35], [16, 42], [34, 42], [16, 53], [34, 53]],
        10: [[16, 16], [34, 16], [25, 22], [16, 28], [34, 28], [16, 42], [34, 42], [25, 48], [16, 54], [34, 54]]
    };

    const pts = positions[card.value] || [];
    let pipsHTML = pts.map(([x, y]) => `
        <text x="${x}" y="${y}" font-size="13.5" text-anchor="middle" dominant-baseline="central" fill="${color}">${suit}</text>
    `).join('');

    return `<svg viewBox="0 0 50 70">${pipsHTML}</svg>`;
}

function createCardElement(card, topOffset = 0, isSelected = false, isHint = false, isJustRevealed = false) {
    const div = document.createElement('div');
    if (!card.faceUp) {
        div.className = 'card back';
    } else {
        let classes = `card ${card.color}`;
        if (isSelected) classes += ' selected';
        if (isHint) classes += ' hint-highlight';
        if (isJustRevealed) classes += ' just-revealed';
        div.className = classes;

        const isFace = ['J', 'Q', 'K'].includes(card.rank);
        const artSVG = isFace 
            ? getFaceCardSVG(card.rank, card.suit, card.color) 
            : getNumberCardSVG(card);

        div.innerHTML = `
            <div class="card-corner">
                <span class="card-rank">${card.rank}</span>
                <span class="card-suit-mini">${card.suit}</span>
            </div>
            <div class="card-art-container">
                ${artSVG}
            </div>
        `;
    }
    div.style.top = `${topOffset}px`;
    return div;
}

let dragInfo = null;

function initDragEvents(el, area, index, cardIndex) {
    el.addEventListener('pointerdown', (e) => {
        if (isGameWon || isAutoCompleting) return;
        if (e.button !== undefined && e.button !== 0) return;

        unlockAudioEngine();

        const cards = getCardsAt({ area, index, cardIndex });
        if (cards.length === 0) return;

        const rect = el.getBoundingClientRect();
        dragInfo = {
            from: { area, index, cardIndex },
            cards: cards,
            startX: e.clientX,
            startY: e.clientY,
            offsetX: e.clientX - rect.left,
            offsetY: e.clientY - rect.top,
            hasMoved: false
        };

        window.addEventListener('pointermove', onPointerMove);
        window.addEventListener('pointerup', onPointerUp);
    });
}

function onPointerMove(e) {
    if (!dragInfo) return;

    const dist = Math.hypot(e.clientX - dragInfo.startX, e.clientY - dragInfo.startY);
    if (!dragInfo.hasMoved && dist < 5) return;

    if (!dragInfo.hasMoved) {
        dragInfo.hasMoved = true;
        const proxy = document.getElementById('drag-proxy');
        proxy.innerHTML = '';
        proxy.style.display = 'block';

        const testCell = document.querySelector('.cell');
        const cardHeight = testCell ? testCell.offsetHeight : 65;
        const overlapOffset = Math.max(16, Math.round(cardHeight * 0.28));

        dragInfo.cards.forEach((card, idx) => {
            const clone = createCardElement(card, idx * overlapOffset);
            proxy.appendChild(clone);
        });

        markDraggingSource(dragInfo.from, true);
    }

    const proxy = document.getElementById('drag-proxy');
    proxy.style.transform = `translate(${e.clientX - dragInfo.offsetX}px, ${e.clientY - dragInfo.offsetY}px)`;
}

function onPointerUp(e) {
    if (!dragInfo) return;

    window.removeEventListener('pointermove', onPointerMove);
    window.removeEventListener('pointerup', onPointerUp);

    const proxy = document.getElementById('drag-proxy');
    proxy.style.display = 'none';
    proxy.innerHTML = '';

    markDraggingSource(dragInfo.from, false);

    if (dragInfo.hasMoved) {
        const dropTarget = findDropTarget(e.clientX, e.clientY);
        let moveResult = false;
        if (dropTarget) {
            const topMovingCard = dragInfo.cards[0];
            moveResult = tryMove(dragInfo.from, dropTarget);
            if (moveResult) {
                if (moveResult === 'foundation') {
                    playSound('foundation', topMovingCard.value);
                } else {
                    playSound('move');
                }
                checkWinCondition();
                saveCurrentGame();
            }
        }
        selectedLocation = null;
        hintLocations = [];
        renderBoard();
        
        if (moveResult && !isGameWon) {
            setTimeout(checkStalemateCondition, 100);
        }
    } else {
        const now = Date.now();
        const tapKey = `${dragInfo.from.area}-${dragInfo.from.index}-${dragInfo.from.cardIndex}`;
        if (now - lastTapTime < 350 && lastTapKey === tapKey) {
            lastTapTime = 0;
            lastTapKey = '';
            startTimerIfNeeded();
            hintLocations = [];
            selectedLocation = null;
            const smartMoved = trySmartMove(dragInfo.from);
            renderBoard();
            if (smartMoved && !isGameWon) {
                setTimeout(checkStalemateCondition, 100);
            }
        } else {
            lastTapTime = now;
            lastTapKey = tapKey;
            handleAreaClick(dragInfo.from.area, dragInfo.from.index, dragInfo.from.cardIndex);
        }
    }

    dragInfo = null;
}

function findDropTarget(clientX, clientY) {
    const elements = document.elementsFromPoint(clientX, clientY);
    for (let el of elements) {
        if (el.dataset && el.dataset.dropArea) {
            return {
                area: el.dataset.dropArea,
                index: parseInt(el.dataset.dropIndex, 10)
            };
        }
    }

    const colDivs = document.querySelectorAll('#tableau .column');
    for (let i = 0; i < colDivs.length; i++) {
        const rect = colDivs[i].getBoundingClientRect();
        if (clientX >= rect.left - 6 && clientX <= rect.right + 6 && clientY >= rect.top - 10 && clientY <= rect.bottom + 140) {
            return { area: 'tableau', index: i };
        }
    }

    const fCells = document.querySelectorAll('#foundations .cell');
    for (let i = 0; i < fCells.length; i++) {
        const rect = fCells[i].getBoundingClientRect();
        if (clientX >= rect.left - 6 && clientX <= rect.right + 6 && clientY >= rect.top - 6 && clientY <= rect.bottom + 20) {
            return { area: 'foundation', index: i };
        }
    }

    return null;
}

function markDraggingSource(loc, isDragging) {
    if (loc.area === 'tableau') {
        const colDiv = document.querySelectorAll('#tableau .column')[loc.index];
        if (colDiv) {
            const cards = colDiv.querySelectorAll('.card');
            for (let i = loc.cardIndex; i < cards.length; i++) {
                if (isDragging) cards[i].classList.add('dragging-source');
                else cards[i].classList.remove('dragging-source');
            }
        }
    } else if (loc.area === 'waste') {
        const wasteCard = document.querySelector('#waste-slot .card:last-child');
        if (wasteCard) {
            if (isDragging) wasteCard.classList.add('dragging-source');
            else wasteCard.classList.remove('dragging-source');
        }
    } else if (loc.area === 'foundation') {
        const fCells = document.querySelectorAll('#foundations .cell');
        if (fCells[loc.index]) {
            const fCard = fCells[loc.index].querySelector('.card');
            if (fCard) {
                if (isDragging) fCard.classList.add('dragging-source');
                else fCard.classList.remove('dragging-source');
            }
        }
    }
}

function handleAreaClick(area, index, cardIndex = null) {
    if (isGameWon || isAutoCompleting) return;
    unlockAudioEngine();
    startTimerIfNeeded();
    hintLocations = [];

    if (!selectedLocation) {
        if (area === 'tableau') {
            if (tableau[index].length === 0) return;
            let card = tableau[index][cardIndex];
            if (!card.faceUp) return;
            selectedLocation = { area, index, cardIndex };
            renderBoard();
        } else if (area === 'waste') {
            if (waste.length === 0) return;
            selectedLocation = { area, index: 0, cardIndex: 0 };
            renderBoard();
        } else if (area === 'foundation') {
            if (foundations[index].length === 0) return;
            selectedLocation = { area, index, cardIndex: 0 };
            renderBoard();
        }
    } else {
        if (selectedLocation.area === area && selectedLocation.index === index && selectedLocation.cardIndex === cardIndex) {
            selectedLocation = null;
            renderBoard();
            return;
        }

        const movingCards = getCardsAt(selectedLocation);
        const topCard = movingCards[0];
        let moveResult = tryMove(selectedLocation, { area, index });
        if (moveResult) {
            if (moveResult === 'foundation' && topCard) {
                playSound('foundation', topCard.value);
            } else {
                playSound('move');
            }
            checkWinCondition();
            saveCurrentGame();
        }
        selectedLocation = null;
        renderBoard();
        
        if (moveResult && !isGameWon) {
            setTimeout(checkStalemateCondition, 100);
        }
    }
}

// ★進行度ゲージ＆クライマックス状態の更新
function updateDramaAndProgress() {
    const autoBtn = document.getElementById('auto-btn');
    const progBar = document.getElementById('progress-bar');
    const progText = document.getElementById('progress-text');

    let faceDownCount = 0;
    tableau.forEach(col => col.forEach(c => { if (!c.faceUp) faceDownCount++; }));
    const totalInFoundation = foundations.reduce((sum, col) => sum + col.length, 0);

    // ゲージ更新
    if (progBar && progText) {
        const pct = Math.round((totalInFoundation / 52) * 100);
        progBar.style.width = `${pct}%`;
        if (faceDownCount === 0 && totalInFoundation < 52) {
            progText.innerText = `🌟 ぜんぶ表！オートでクリアできるよ！ (${totalInFoundation}/52枚)`;
            progBar.classList.add('hot');
        } else if (faceDownCount <= 5 && faceDownCount > 0) {
            progText.innerText = `💓 ドキドキ！裏カード残り ${faceDownCount}枚 (${totalInFoundation}/52枚)`;
            progBar.classList.add('hot');
        } else {
            progText.innerText = `ゴールまで: ${totalInFoundation} / 52枚 (裏カード残り ${faceDownCount}枚)`;
            progBar.classList.remove('hot');
        }
    }

    // クライマックス演出のトリガー
    if (!isGameWon && moveCount > 0) {
        if (faceDownCount === 0 && totalInFoundation < 52) {
            document.body.classList.remove('near-goal-mode');
            document.body.classList.add('climax-mode');
            if (autoBtn) autoBtn.classList.add('auto-ready');
            if (!hasShownClimaxBanner) {
                hasShownClimaxBanner = true;
                playSound('climax');
                showClimaxBanner('🌟 チャンス！ぜんぶ表になったよ！ 🌟');
            }
        } else if (faceDownCount <= 5 && faceDownCount > 0) {
            document.body.classList.add('near-goal-mode');
            document.body.classList.remove('climax-mode');
            if (autoBtn) autoBtn.classList.remove('auto-ready');
            if (!hasShownNearGoalBanner) {
                hasShownNearGoalBanner = true;
                showClimaxBanner(`💓 あと少し！裏カード残り ${faceDownCount}枚！`);
            }
        } else {
            document.body.classList.remove('near-goal-mode', 'climax-mode');
            if (autoBtn) autoBtn.classList.remove('auto-ready');
        }
    } else if (isGameWon && autoBtn) {
        autoBtn.classList.remove('auto-ready');
    }
}

function renderBoard() {
    updateDramaAndProgress();

    const isHintTarget = (area, index, cardIndex = null) => {
        return hintLocations.some(h => {
            if (h.area !== area) return false;
            if (h.index !== undefined && h.index !== index) return false;
            if (cardIndex !== null && h.cardIndex !== undefined && h.cardIndex !== null) {
                if (h.isDestination) {
                    return cardIndex === h.cardIndex;
                } else {
                    return cardIndex >= h.cardIndex;
                }
            }
            return true;
        });
    };

    // 1. 組札
    const fdContainer = document.getElementById('foundations');
    fdContainer.innerHTML = '';
    for (let i = 0; i < 4; i++) {
        const cell = document.createElement('div');
        cell.className = 'cell foundation-cell' + (isHintTarget('foundation', i) ? ' hint-highlight' : '');
        cell.dataset.dropArea = 'foundation';
        cell.dataset.dropIndex = i;
        cell.onclick = () => handleAreaClick('foundation', i);

        if (foundations[i].length > 0) {
            const topCard = foundations[i][foundations[i].length - 1];
            const isSelected = selectedLocation && selectedLocation.area === 'foundation' && selectedLocation.index === i;
            const isHint = isHintTarget('foundation', i);
            const el = createCardElement(topCard, 0, isSelected, isHint);
            el.dataset.dropArea = 'foundation';
            el.dataset.dropIndex = i;
            initDragEvents(el, 'foundation', i, 0);
            cell.appendChild(el);
        }
        fdContainer.appendChild(cell);
    }

    // 2. めくり札
    const wasteSlot = document.getElementById('waste-slot');
    wasteSlot.innerHTML = '';
    wasteSlot.className = 'cell' + (isHintTarget('waste', 0) ? ' hint-highlight' : '');
    wasteSlot.onclick = () => handleAreaClick('waste', 0);

    if (waste.length > 0) {
        if (drawCount === 1) {
            const topCard = waste[waste.length - 1];
            const isSelected = selectedLocation && selectedLocation.area === 'waste';
            const isHint = isHintTarget('waste', 0);
            const el = createCardElement(topCard, 0, isSelected, isHint);
            initDragEvents(el, 'waste', 0, 0);
            wasteSlot.appendChild(el);
        } else {
            const countToShow = Math.min(3, waste.length);
            const startIndex = waste.length - countToShow;
            for (let k = startIndex; k < waste.length; k++) {
                const card = waste[k];
                const isTop = (k === waste.length - 1);
                const isSelected = isTop && selectedLocation && selectedLocation.area === 'waste';
                const isHint = isTop && isHintTarget('waste', 0);
                const el = createCardElement(card, 0, isSelected, isHint);
                el.style.left = `${(k - startIndex) * 14}px`;
                if (isTop) {
                    initDragEvents(el, 'waste', 0, 0);
                }
                wasteSlot.appendChild(el);
            }
        }
    }

    // 3. 山札
    const stockSlot = document.getElementById('stock-slot');
    stockSlot.innerHTML = '';
    if (stock.length > 0) {
        stockSlot.className = 'cell' + (isHintTarget('stock', 0) ? ' hint-highlight' : '');
        const backCard = document.createElement('div');
        backCard.className = 'card back';
        stockSlot.appendChild(backCard);
    } else {
        stockSlot.className = 'cell empty';
    }

    // 4. 場札 7列
    const tbContainer = document.getElementById('tableau');
    tbContainer.innerHTML = '';

    const testCell = document.querySelector('.cell');
    const cardHeight = testCell ? testCell.offsetHeight : 65;
    const baseOverlap = Math.max(16, Math.round(cardHeight * 0.28));
    const baseFaceDown = Math.max(8, Math.round(cardHeight * 0.14));

    for (let i = 0; i < 7; i++) {
        const colDiv = document.createElement('div');
        colDiv.className = 'column cell';
        colDiv.style.border = 'none';
        colDiv.dataset.dropArea = 'tableau';
        colDiv.dataset.dropIndex = i;

        if (tableau[i].length === 0 && isHintTarget('tableau', i)) {
            colDiv.classList.add('hint-highlight');
        }
        colDiv.onclick = () => {
            if (tableau[i].length === 0) handleAreaClick('tableau', i, 0);
        };

        const colLen = tableau[i].length;
        const scaleFactor = colLen > 10 ? Math.max(0.68, 10 / colLen) : 1;
        const overlapOffset = Math.round(baseOverlap * scaleFactor);
        const faceDownOffset = Math.round(baseFaceDown * scaleFactor);

        let currentTop = 0;
        for (let j = 0; j < colLen; j++) {
            const card = tableau[i][j];
            let isSelected = false;
            if (selectedLocation && selectedLocation.area === 'tableau' && selectedLocation.index === i) {
                if (j >= selectedLocation.cardIndex) isSelected = true;
            }
            const isHint = isHintTarget('tableau', i, j);
            const isJustRevealed = (newlyRevealedCardKey === `${i}-${j}`);
            const el = createCardElement(card, currentTop, isSelected, isHint, isJustRevealed);
            
            el.dataset.dropArea = 'tableau';
            el.dataset.dropIndex = i;

            if (card.faceUp) {
                initDragEvents(el, 'tableau', i, j);
            }

            colDiv.appendChild(el);
            currentTop += card.faceUp ? overlapOffset : faceDownOffset;
        }
        tbContainer.appendChild(colDiv);
    }
    newlyRevealedCardKey = null;
}

function saveCurrentGame() {
    if (isGameWon) {
        localStorage.removeItem(STORAGE_KEY_SAVE);
        return;
    }
    const gameState = {
        currentGameNumber, stock, waste, foundations, tableau,
        moveCount, secondsElapsed, historyStack, redoStack, hasCountedPlay, drawCount, initialDealJson
    };
    try {
        localStorage.setItem(STORAGE_KEY_SAVE, JSON.stringify(gameState));
    } catch (e) {}
}

function loadSavedGame() {
    try {
        const saved = localStorage.getItem(STORAGE_KEY_SAVE);
        if (!saved) return false;
        const s = JSON.parse(saved);
        currentGameNumber = s.currentGameNumber || 1;
        stock = s.stock || [];
        waste = s.waste || [];
        foundations = s.foundations || [[],[],[],[]];
        tableau = s.tableau || [[],[],[],[],[],[],[]];
        moveCount = s.moveCount || 0;
        secondsElapsed = s.secondsElapsed || 0;
        historyStack = s.historyStack || [];
        redoStack = s.redoStack || [];
        hasCountedPlay = s.hasCountedPlay || false;
        drawCount = s.drawCount || 1;
        initialDealJson = s.initialDealJson || null;
        
        isGameWon = false;
        selectedLocation = null;
        hintLocations = [];
        updateStatusDisplay();
        renderBoard();
        return true;
    } catch (e) {
        return false;
    }
}

function getStats() {
    const defaultStats = { played: 0, won: 0, bestTime: null, fewestMoves: null };
    try {
        const data = localStorage.getItem(STORAGE_KEY_STATS);
        return data ? Object.assign(defaultStats, JSON.parse(data)) : defaultStats;
    } catch (e) {
        return defaultStats;
    }
}

function saveStats(stats) {
    try {
        localStorage.setItem(STORAGE_KEY_STATS, JSON.stringify(stats));
    } catch (e) {}
}

function incrementPlayedCount() {
    let stats = getStats();
    stats.played++;
    saveStats(stats);
}

function recordWin() {
    let stats = getStats();
    stats.won++;
    let isNewRecord = false;
    if (stats.bestTime === null || secondsElapsed < stats.bestTime) {
        stats.bestTime = secondsElapsed;
        isNewRecord = true;
    }
    if (stats.fewestMoves === null || moveCount < stats.fewestMoves) {
        stats.fewestMoves = moveCount;
        isNewRecord = true;
    }
    saveStats(stats);
    return isNewRecord;
}

function openStatsModal() {
    const stats = getStats();
    document.getElementById('stat-played').innerText = stats.played;
    document.getElementById('stat-won').innerText = stats.won;
    const winRate = stats.played > 0 ? Math.round((stats.won / stats.played) * 100) : 0;
    document.getElementById('stat-winrate').innerText = `${winRate}%`;
    
    if (stats.bestTime !== null) {
        let mins = Math.floor(stats.bestTime / 60);
        let secs = stats.bestTime % 60;
        document.getElementById('stat-best-time').innerText = `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
    } else {
        document.getElementById('stat-best-time').innerText = '--:--';
    }
    document.getElementById('stat-fewest-moves').innerText = stats.fewestMoves !== null ? stats.fewestMoves : '-';
    document.getElementById('stats-modal').classList.remove('hidden');
}

function closeStatsModal() {
    document.getElementById('stats-modal').classList.add('hidden');
}

function resetAllStats() {
    if (confirm('保存されているプレイデータを全削除（リセット）しますか？\n（この操作は取り消せません）')) {
        localStorage.removeItem(STORAGE_KEY_SAVE);
        localStorage.removeItem(STORAGE_KEY_STATS);
        closeStatsModal();
        alert('プレイデータをリセットしました。');
        dealGame(1);
    }
}

// ==========================================
// ★統合ビジュアルFXエンジン（スパークル・花火・トランプの滝・雨）
// ==========================================
let fxAnimationId = null;
let fxMode = 'none'; // 'sparkle', 'victory', 'rain'
let sparkles = [];
let confettiList = [];
let fireworks = [];
let bouncingCards = [];
let raindrops = [];
let victoryFrame = 0;

function ensureCanvasSize() {
    const canvas = document.getElementById('confetti-canvas');
    if (canvas.width !== window.innerWidth || canvas.height !== window.innerHeight) {
        canvas.width = window.innerWidth;
        canvas.height = window.innerHeight;
    }
    return canvas;
}

// 組札にカードを置いた時のキラキラ・スパークル
function triggerFoundationSparkle(fIndex, isKingComplete = false) {
    const fCells = document.querySelectorAll('#foundations .cell');
    if (!fCells[fIndex]) return;
    const rect = fCells[fIndex].getBoundingClientRect();
    const cx = rect.left + rect.width / 2;
    const cy = rect.top + rect.height / 2;

    const colors = ['#ffea00', '#f9c74f', '#ff9f1c', '#ffffff', '#00f5d4', '#f72585'];
    const count = isKingComplete ? 45 : 18;

    for (let i = 0; i < count; i++) {
        const angle = (Math.PI * 2 * i) / count + (Math.random() * 0.3);
        const speed = (Math.random() * 4 + 2) * (isKingComplete ? 1.6 : 1);
        sparkles.push({
            x: cx,
            y: cy,
            vx: Math.cos(angle) * speed,
            vy: Math.sin(angle) * speed - 1,
            size: Math.random() * 5 + 4,
            color: colors[Math.floor(Math.random() * colors.length)],
            alpha: 1,
            decay: isKingComplete ? 0.018 : 0.03
        });
    }

    if (!fxAnimationId) {
        fxLoop();
    }
}

// クリア時の超豪華フィナーレ（打ち上げ花火 ＋ バウンドするトランプの滝 ＋ 紙吹雪）
function startVictoryShow() {
    stopConfetti();
    fxMode = 'victory';
    victoryFrame = 0;
    const canvas = ensureCanvasSize();
    const colors = ['#f94144', '#f3722c', '#f8961e', '#ffea00', '#90be6d', '#00f5d4', '#9b5de5', '#f72585'];

    // 紙吹雪とスター
    for (let i = 0; i < 140; i++) {
        confettiList.push({
            x: Math.random() * canvas.width,
            y: Math.random() * canvas.height - canvas.height,
            size: Math.random() * 8 + 5,
            color: colors[Math.floor(Math.random() * colors.length)],
            speedY: Math.random() * 3.5 + 2.5,
            speedX: Math.random() * 3 - 1.5,
            rotation: Math.random() * 360,
            rotSpeed: Math.random() * 6 - 3,
            isStar: Math.random() > 0.5
        });
    }

    if (!fxAnimationId) {
        fxLoop();
    }
}

// 手詰まり時の「涙の雨」エフェクト
function startSadRainEffect() {
    stopConfetti();
    fxMode = 'rain';
    const canvas = ensureCanvasSize();
    raindrops = [];

    for (let i = 0; i < 90; i++) {
        raindrops.push({
            x: Math.random() * canvas.width,
            y: Math.random() * canvas.height,
            length: Math.random() * 18 + 12,
            speedY: Math.random() * 6 + 7,
            alpha: Math.random() * 0.4 + 0.2
        });
    }

    if (!fxAnimationId) {
        fxLoop();
    }
}

function spawnFirework(canvas) {
    const cx = Math.random() * (canvas.width * 0.8) + canvas.width * 0.1;
    const cy = Math.random() * (canvas.height * 0.45) + canvas.height * 0.1;
    const colors = ['#ffea00', '#ff007f', '#00f5d4', '#ff5400', '#9b5de5', '#ffffff'];
    const baseColor = colors[Math.floor(Math.random() * colors.length)];

    for (let i = 0; i < 36; i++) {
        const angle = (Math.PI * 2 * i) / 36;
        const speed = Math.random() * 4.5 + 1.5;
        sparkles.push({
            x: cx,
            y: cy,
            vx: Math.cos(angle) * speed,
            vy: Math.sin(angle) * speed,
            size: Math.random() * 4 + 3,
            color: baseColor,
            alpha: 1,
            decay: 0.02
        });
    }
    playSound('firework');
}

function spawnBouncingCard(canvas) {
    const suit = SUITS[Math.floor(Math.random() * 4)];
    const rank = RANKS[Math.floor(Math.random() * 13)];
    const isRed = (suit === '♥' || suit === '♦');
    bouncingCards.push({
        x: Math.random() * (canvas.width - 60) + 20,
        y: 60,
        vx: (Math.random() > 0.5 ? 1 : -1) * (Math.random() * 4 + 2),
        vy: Math.random() * -3,
        suit: suit,
        rank: rank,
        color: isRed ? '#e53935' : '#1a1a1a',
        bounces: 0
    });
}

function fxLoop() {
    const canvas = ensureCanvasSize();
    const ctx = canvas.getContext('2d');
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    // 1. スパークル（星・花火の火花）の描画
    for (let i = sparkles.length - 1; i >= 0; i--) {
        const s = sparkles[i];
        ctx.save();
        ctx.globalAlpha = Math.max(0, s.alpha);
        ctx.fillStyle = s.color;
        ctx.beginPath();
        ctx.arc(s.x, s.y, s.size, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();

        s.x += s.vx;
        s.y += s.vy;
        s.vy += 0.12; // 重力
        s.alpha -= s.decay;
        if (s.alpha <= 0) sparkles.splice(i, 1);
    }

    // 2. クリア時のフィナーレ演出
    if (fxMode === 'victory') {
        victoryFrame++;
        if (victoryFrame % 38 === 0) spawnFirework(canvas);
        if (victoryFrame % 22 === 0 && bouncingCards.length < 18) spawnBouncingCard(canvas);

        // バウンドするトランプの描画
        for (let i = bouncingCards.length - 1; i >= 0; i--) {
            const c = bouncingCards[i];
            ctx.save();
            ctx.fillStyle = '#ffffff';
            ctx.strokeStyle = '#333333';
            ctx.lineWidth = 1.5;
            ctx.beginPath();
            ctx.roundRect(c.x, c.y, 44, 62, 5);
            ctx.fill();
            ctx.stroke();

            ctx.fillStyle = c.color;
            ctx.font = 'bold 13px sans-serif';
            ctx.fillText(c.rank, c.x + 5, c.y + 15);
            ctx.font = '22px sans-serif';
            ctx.textAlign = 'center';
            ctx.fillText(c.suit, c.x + 22, c.y + 42);
            ctx.restore();

            c.x += c.vx;
            c.y += c.vy;
            c.vy += 0.45; // 重力

            // 地面でバウンド
            if (c.y + 62 > canvas.height) {
                c.y = canvas.height - 62;
                c.vy = -c.vy * 0.78;
                c.bounces++;
            }
            if (c.x < -60 || c.x > canvas.width + 60 || c.bounces > 6) {
                bouncingCards.splice(i, 1);
            }
        }

        // 紙吹雪とスターの描画
        confettiList.forEach(p => {
            ctx.save();
            ctx.translate(p.x, p.y);
            ctx.rotate((p.rotation * Math.PI) / 180);
            ctx.fillStyle = p.color;

            if (p.isStar) {
                ctx.beginPath();
                for (let i = 0; i < 5; i++) {
                    ctx.lineTo(Math.cos((18 + i * 72) * Math.PI / 180) * p.size, -Math.sin((18 + i * 72) * Math.PI / 180) * p.size);
                    ctx.lineTo(Math.cos((54 + i * 72) * Math.PI / 180) * (p.size / 2), -Math.sin((54 + i * 72) * Math.PI / 180) * (p.size / 2));
                }
                ctx.closePath();
                ctx.fill();
            } else {
                ctx.fillRect(-p.size / 2, -p.size / 2, p.size, p.size * 1.5);
            }
            ctx.restore();

            p.y += p.speedY;
            p.x += p.speedX;
            p.rotation += p.rotSpeed;

            if (p.y > canvas.height) {
                p.y = -20;
                p.x = Math.random() * canvas.width;
            }
        });
    }

    // 3. 手詰まり時の「涙の雨」描画
    if (fxMode === 'rain') {
        ctx.strokeStyle = 'rgba(174, 214, 241, 0.55)';
        ctx.lineWidth = 2;
        raindrops.forEach(r => {
            ctx.beginPath();
            ctx.moveTo(r.x, r.y);
            ctx.lineTo(r.x - 1, r.y + r.length);
            ctx.stroke();

            r.y += r.speedY;
            if (r.y > canvas.height) {
                r.y = -20;
                r.x = Math.random() * canvas.width;
            }
        });
    }

    if (sparkles.length > 0 || fxMode !== 'none') {
        fxAnimationId = requestAnimationFrame(fxLoop);
    } else {
        fxAnimationId = null;
        ctx.clearRect(0, 0, canvas.width, canvas.height);
    }
}

function stopConfetti() {
    fxMode = 'none';
    sparkles = [];
    confettiList = [];
    fireworks = [];
    bouncingCards = [];
    raindrops = [];
    if (fxAnimationId) {
        cancelAnimationFrame(fxAnimationId);
        fxAnimationId = null;
    }
    const canvas = document.getElementById('confetti-canvas');
    if (canvas) {
        const ctx = canvas.getContext('2d');
        ctx.clearRect(0, 0, canvas.width, canvas.height);
    }
}

document.getElementById('sound-btn').innerText = soundEnabled ? '🔊 サウンド' : '🔇 サウンド';

if (!loadSavedGame()) {
    dealGame(1);
}