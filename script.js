const SUITS = ['♠', '♥', '♦', '♣'];
const RANKS = ['A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K'];

const STORAGE_KEY_SAVE = 'solitaire_saved_game_v2';
const STORAGE_KEY_STATS = 'solitaire_stats_v2';
const STORAGE_KEY_SOUND = 'solitaire_sound_v2';
const STORAGE_KEY_DRAW_COUNT = 'solitaire_draw_count_v2';

let stock = [];
let waste = [];
let foundations = [[], [], [], []];
let tableau = [[], [], [], [], [], [], []];

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

function playSound(type) {
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
            osc.frequency.setValueAtTime(520, now);
            osc.frequency.exponentialRampToValueAtTime(260, now + 0.06);
            gain.gain.setValueAtTime(0.4, now);
            gain.gain.exponentialRampToValueAtTime(0.001, now + 0.06);
            osc.start(now);
            osc.stop(now + 0.06);
        } else if (type === 'flip') {
            const osc = ctx.createOscillator();
            const gain = ctx.createGain();
            osc.connect(gain);
            gain.connect(ctx.destination);
            osc.type = 'triangle';
            osc.frequency.setValueAtTime(750, now);
            osc.frequency.exponentialRampToValueAtTime(350, now + 0.05);
            gain.gain.setValueAtTime(0.35, now);
            gain.gain.exponentialRampToValueAtTime(0.001, now + 0.05);
            osc.start(now);
            osc.stop(now + 0.05);
        } else if (type === 'win') {
            const notes = [
                { f: 523.25, d: 0.16 },
                { f: 659.25, d: 0.16 },
                { f: 783.99, d: 0.16 },
                { f: 1046.50, d: 0.35 },
                { f: 880.00, d: 0.16 },
                { f: 1046.50, d: 0.6 }
            ];
            let offset = 0;
            notes.forEach(n => {
                const o = ctx.createOscillator();
                const g = ctx.createGain();
                o.connect(g);
                g.connect(ctx.destination);
                o.type = 'triangle';
                o.frequency.setValueAtTime(n.f, now + offset);
                g.gain.setValueAtTime(0.4, now + offset);
                g.gain.exponentialRampToValueAtTime(0.001, now + offset + n.d);
                o.start(now + offset);
                o.stop(now + offset + n.d);
                offset += n.d * 0.88;
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

    stopConfetti();
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

    resetTimer();
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
    stopConfetti();
    document.getElementById('win-modal').classList.add('hidden');
    openModeSelectModal();
}

function closeStalemateModal() {
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
    document.getElementById('stalemate-modal').classList.add('hidden');
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
            tableau[loc.index][tableau[loc.index].length - 1].faceUp = true;
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

    if (to.area === 'foundation') {
        if (movingCards.length === 1) {
            let fCol = foundations[to.index];
            let topF = fCol.length > 0 ? fCol[fCol.length - 1] : null;
            if (topF === null) {
                if (firstCard.value === 1) {
                    recordMove();
                    addCardsTo(to, removeCardsFrom(from, 1));
                    return true;
                }
            } else {
                if (firstCard.suit === topF.suit && firstCard.value === topF.value + 1) {
                    recordMove();
                    addCardsTo(to, removeCardsFrom(from, 1));
                    return true;
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
                return true;
            }
        } else {
            if (firstCard.color !== targetCard.color && firstCard.value === targetCard.value - 1) {
                recordMove();
                addCardsTo(to, removeCardsFrom(from, movingCards.length));
                return true;
            }
        }
    }

    return false;
}

function checkWinCondition() {
    let totalInFoundation = foundations.reduce((sum, col) => sum + col.length, 0);
    if (totalInFoundation === 52 && !isGameWon) {
        isGameWon = true;
        stopTimer();
        recordWin();
        saveCurrentGame();
        playSound('win');
        startConfetti();

        let mins = Math.floor(secondsElapsed / 60);
        let secs = secondsElapsed % 60;
        document.getElementById('final-time').innerText = `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
        document.getElementById('final-moves').innerText = moveCount;
        document.getElementById('win-modal').classList.remove('hidden');
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
    
    // 1. めくり札 -> 組札
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
    
    // 2. 場札 -> 組札
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

    // 3. めくり札 -> 場札
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

    // 4. 場札 -> 場札（進展のある手のみ）
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

// ★復元・強化：ヒント機能
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

// ★復元・強化：オート完成機能
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

        // めくり札 -> 組札
        if (waste.length > 0) {
            let card = waste[waste.length - 1];
            for (let f = 0; f < 4; f++) {
                if (canMoveToFoundationSpecific(card, f)) {
                    tryMove({ area: 'waste', index: 0, cardIndex: 0 }, { area: 'foundation', index: f });
                    playSound('move');
                    renderBoard();
                    moved = true;
                    break;
                }
            }
        }

        // 場札 -> 組札
        if (!moved) {
            for (let i = 0; i < 7; i++) {
                if (tableau[i].length > 0) {
                    let cardIdx = tableau[i].length - 1;
                    let card = tableau[i][cardIdx];
                    if (card.faceUp) {
                        for (let f = 0; f < 4; f++) {
                            if (canMoveToFoundationSpecific(card, f)) {
                                tryMove({ area: 'tableau', index: i, cardIndex: cardIdx }, { area: 'foundation', index: f });
                                playSound('move');
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

        // 盤面に裏向きカードがなく、山札・めくり札が残っている場合は自動でめくって進める
        if (!moved) {
            const hasFaceDownOnBoard = tableau.some(col => col.some(c => !c.faceUp));
            if (!hasFaceDownOnBoard && (stock.length > 0 || waste.length > 0)) {
                handleStockClick();
                moved = true;
            }
        }

        if (moved && !isGameWon) {
            setTimeout(step, 110);
        } else {
            isAutoCompleting = false;
            checkWinCondition();
            saveCurrentGame();
        }
    }

    step();
}

function checkStalemateCondition() {
    if (isGameWon) return;

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
        document.getElementById('stalemate-modal').classList.remove('hidden');
    }
}

function getFaceCardSVG(rank, suit, color) {
    const mainColor = color === 'red' ? '#d32f2f' : '#1d3557';
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
    const color = card.color === 'red' ? '#d32f2f' : '#1a1a1a';
    
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

function createCardElement(card, topOffset = 0, isSelected = false, isHint = false) {
    const div = document.createElement('div');
    if (!card.faceUp) {
        div.className = 'card back';
    } else {
        let classes = `card ${card.color}`;
        if (isSelected) classes += ' selected';
        if (isHint) classes += ' hint-highlight';
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
        let moved = false;
        if (dropTarget) {
            moved = tryMove(dragInfo.from, dropTarget);
            if (moved) {
                playSound('move');
                checkWinCondition();
                saveCurrentGame();
            }
        }
        selectedLocation = null;
        hintLocations = [];
        renderBoard();
        
        if (moved && !isGameWon) {
            setTimeout(checkStalemateCondition, 100);
        }
    } else {
        handleAreaClick(dragInfo.from.area, dragInfo.from.index, dragInfo.from.cardIndex);
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
        if (clientX >= rect.left - 6 && clientX <= rect.right + 6 && clientY >= rect.top - 10 && clientY <= rect.bottom + 120) {
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

        let moved = tryMove(selectedLocation, { area, index });
        if (moved) {
            playSound('move');
            checkWinCondition();
            saveCurrentGame();
        }
        selectedLocation = null;
        renderBoard();
        
        if (moved && !isGameWon) {
            setTimeout(checkStalemateCondition, 100);
        }
    }
}

function renderBoard() {
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

    // 1. 組札 (Foundations)
    const fdContainer = document.getElementById('foundations');
    fdContainer.innerHTML = '';
    for (let i = 0; i < 4; i++) {
        const cell = document.createElement('div');
        cell.className = 'cell' + (isHintTarget('foundation', i) ? ' hint-highlight' : '');
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

    // 2. めくり札 (Waste)
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

    // 3. 山札 (Stock)
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
    const overlapOffset = Math.max(16, Math.round(cardHeight * 0.28));
    const faceDownOffset = Math.max(8, Math.round(cardHeight * 0.14));

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

        let currentTop = 0;
        for (let j = 0; j < tableau[i].length; j++) {
            const card = tableau[i][j];
            let isSelected = false;
            if (selectedLocation && selectedLocation.area === 'tableau' && selectedLocation.index === i) {
                if (j >= selectedLocation.cardIndex) isSelected = true;
            }
            const isHint = isHintTarget('tableau', i, j);
            const el = createCardElement(card, currentTop, isSelected, isHint);
            
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
}

function saveCurrentGame() {
    if (isGameWon) {
        localStorage.removeItem(STORAGE_KEY_SAVE);
        return;
    }
    const gameState = {
        currentGameNumber, stock, waste, foundations, tableau,
        moveCount, secondsElapsed, historyStack, redoStack, hasCountedPlay, drawCount
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
    if (stats.bestTime === null || secondsElapsed < stats.bestTime) {
        stats.bestTime = secondsElapsed;
    }
    if (stats.fewestMoves === null || moveCount < stats.fewestMoves) {
        stats.fewestMoves = moveCount;
    }
    saveStats(stats);
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

let confettiAnimationId = null;
let particles = [];

function startConfetti() {
    const canvas = document.getElementById('confetti-canvas');
    const ctx = canvas.getContext('2d');
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;
    particles = [];

    const colors = ['#f94144', '#f3722c', '#f8961e', '#f9c74f', '#90be6d', '#43aa8b', '#577590', '#9b5de5', '#f15bb5'];

    for (let i = 0; i < 180; i++) {
        particles.push({
            x: Math.random() * canvas.width,
            y: Math.random() * canvas.height - canvas.height,
            size: Math.random() * 8 + 6,
            color: colors[Math.floor(Math.random() * colors.length)],
            speedY: Math.random() * 4 + 3,
            speedX: Math.random() * 3 - 1.5,
            rotation: Math.random() * 360,
            rotSpeed: Math.random() * 6 - 3,
            isStar: Math.random() > 0.6
        });
    }

    function render() {
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        particles.forEach(p => {
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

        confettiAnimationId = requestAnimationFrame(render);
    }
    render();
}

function stopConfetti() {
    if (confettiAnimationId) {
        cancelAnimationFrame(confettiAnimationId);
        confettiAnimationId = null;
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