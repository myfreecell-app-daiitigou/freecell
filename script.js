// マークと数字の定義
const SUITS = ['♣', '♦', '♥', '♠'];
const RANKS = ['A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K'];

// LocalStorageキー
const STORAGE_KEY_SAVE = 'freecell_saved_game_v1';
const STORAGE_KEY_STATS = 'freecell_stats_v1';
const STORAGE_KEY_SOUND = 'freecell_sound_v1';

// ゲームの状態データ
let freeCells = [null, null, null, null];
let foundations = [[], [], [], []];
let tableau = [[], [], [], [], [], [], [], []];
let selectedLocation = null;
let moveHistory = [];
let redoHistory = [];

let currentGameNumber = 1;
let moveCount = 0;
let secondsElapsed = 0;
let timerInterval = null;
let isTimerRunning = false;
let isGameWon = false;
let hasCountedPlay = false;

// 効果音設定
let soundEnabled = localStorage.getItem(STORAGE_KEY_SOUND) !== 'false';
let hintLocations = [];
let isAutoCompleting = false;

// Web Audio API
let audioCtx = null;
function getAudioContext() {
    if (!audioCtx) {
        const AudioContextClass = window.AudioContext || window.webkitAudioContext;
        audioCtx = new AudioContextClass();
    }
    if (audioCtx.state === 'suspended') {
        audioCtx.resume();
    }
    return audioCtx;
}

function playSound(type) {
    if (!soundEnabled) return;
    try {
        const ctx = getAudioContext();
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.connect(gain);
        gain.connect(ctx.destination);
        const now = ctx.currentTime;

        if (type === 'move') {
            osc.type = 'sine';
            osc.frequency.setValueAtTime(440, now);
            osc.frequency.exponentialRampToValueAtTime(220, now + 0.05);
            gain.gain.setValueAtTime(0.15, now);
            gain.gain.exponentialRampToValueAtTime(0.01, now + 0.05);
            osc.start(now);
            osc.stop(now + 0.05);
        } else if (type === 'win') {
            const notes = [523.25, 659.25, 783.99, 1046.50];
            notes.forEach((freq, idx) => {
                const o = ctx.createOscillator();
                const g = ctx.createGain();
                o.connect(g);
                g.connect(ctx.destination);
                o.type = 'triangle';
                o.frequency.setValueAtTime(freq, now + idx * 0.12);
                g.gain.setValueAtTime(0.2, now + idx * 0.12);
                g.gain.exponentialRampToValueAtTime(0.01, now + idx * 0.12 + 0.3);
                o.start(now + idx * 0.12);
                o.stop(now + idx * 0.12 + 0.3);
            });
        }
    } catch (e) {}
}

function toggleSound() {
    soundEnabled = !soundEnabled;
    localStorage.setItem(STORAGE_KEY_SOUND, soundEnabled);
    document.getElementById('sound-btn').innerText = soundEnabled ? '🔊' : '🔇';
}

// 疑似乱数生成器
let rngSeed = 1;
function msRand() {
    rngSeed = (rngSeed * 214013 + 2531011) & 0x7FFFFFFF;
    return (rngSeed >> 16) & 0x7FFF;
}

function createStandardDeck() {
    let deck = [];
    for (let r = 0; r < 13; r++) {
        for (let s = 0; s < 4; s++) {
            let suit = SUITS[s];
            let isRed = (suit === '♥' || suit === '♦');
            deck.push({
                suit: suit,
                rank: RANKS[r],
                value: r + 1,
                color: isRed ? 'red' : 'black'
            });
        }
    }
    return deck;
}

function shuffleByGameNumber(gameNumber) {
    rngSeed = gameNumber;
    let deck = createStandardDeck();
    let shuffled = [];
    let cardsRemaining = 52;
    for (let i = 0; i < 52; i++) {
        let randIndex = msRand() % cardsRemaining;
        shuffled.push(deck[randIndex]);
        deck[randIndex] = deck[cardsRemaining - 1];
        cardsRemaining--;
    }
    return shuffled;
}

// タイマー
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
    document.getElementById('game-number').innerText = `#${currentGameNumber}`;
    document.getElementById('move-count').innerText = moveCount;
    let mins = Math.floor(secondsElapsed / 60);
    let secs = secondsElapsed % 60;
    document.getElementById('game-timer').innerText = `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
}

function dealGame(gameNumber) {
    currentGameNumber = gameNumber;
    isGameWon = false;
    hasCountedPlay = false;
    isAutoCompleting = false;
    hintLocations = [];
    document.getElementById('win-modal').classList.add('hidden');

    let deck = shuffleByGameNumber(gameNumber);
    tableau = [[], [], [], [], [], [], [], []];
    freeCells = [null, null, null, null];
    foundations = [[], [], [], []];
    selectedLocation = null;
    moveHistory = [];
    redoHistory = [];
    moveCount = 0;

    let col = 0;
    while (deck.length > 0) {
        tableau[col].push(deck.pop());
        col++;
        if (col >= 8) col = 0;
    }

    resetTimer();
    renderBoard();
    saveCurrentGame();
}

function startNewRandomGame() {
    dealGame(Math.floor(Math.random() * 1000000) + 1);
}

function selectGameNumber() {
    let input = prompt('1〜1000000 までのゲーム番号を入力してください:', currentGameNumber);
    if (input !== null) {
        let num = parseInt(input, 10);
        if (!isNaN(num) && num >= 1 && num <= 1000000) {
            dealGame(num);
        } else {
            alert('有効な数字（1〜1000000）を入力してください。');
        }
    }
}

// 保存・戦績
function saveCurrentGame() {
    if (isGameWon) {
        localStorage.removeItem(STORAGE_KEY_SAVE);
        return;
    }
    const gameState = {
        currentGameNumber, tableau, freeCells, foundations,
        moveCount, secondsElapsed, moveHistory, redoHistory, hasCountedPlay
    };
    try {
        localStorage.setItem(STORAGE_KEY_SAVE, JSON.stringify(gameState));
    } catch (e) {}
}

function loadSavedGame() {
    try {
        const saved = localStorage.getItem(STORAGE_KEY_SAVE);
        if (!saved) return false;
        const state = JSON.parse(saved);
        currentGameNumber = state.currentGameNumber || 1;
        tableau = state.tableau || [[],[],[],[],[],[],[],[]];
        freeCells = state.freeCells || [null, null, null, null];
        foundations = state.foundations || [[],[],[],[]];
        moveCount = state.moveCount || 0;
        secondsElapsed = state.secondsElapsed || 0;
        moveHistory = state.moveHistory || [];
        redoHistory = state.redoHistory || [];
        hasCountedPlay = state.hasCountedPlay || false;
        
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
    if (confirm('保存されているゲームデータおよび戦績をすべて削除しますか？\n（この操作は取り消せません）')) {
        localStorage.removeItem(STORAGE_KEY_SAVE);
        localStorage.removeItem(STORAGE_KEY_STATS);
        closeStatsModal();
        alert('データをすべて削除しました。');
        dealGame(11982);
    }
}

// ルール
function getSelectedCards(loc) {
    if (loc.area === 'freecell') return [freeCells[loc.index]];
    if (loc.area === 'foundation') {
        let col = foundations[loc.index];
        return col.length > 0 ? [col[col.length - 1]] : [];
    }
    if (loc.area === 'tableau') {
        return tableau[loc.index].slice(loc.cardIndex);
    }
    return [];
}

function isValidSequence(cards) {
    if (cards.length === 0) return false;
    if (cards.length === 1) return true;
    for (let i = 0; i < cards.length - 1; i++) {
        if (cards[i].color === cards[i+1].color || cards[i].value !== cards[i+1].value + 1) {
            return false;
        }
    }
    return true;
}

function getMaxMoveCount(toArea, toIndex) {
    let emptyFreeCells = freeCells.filter(c => c === null).length;
    let emptyTableaus = tableau.filter(col => col.length === 0).length;
    if (toArea === 'tableau' && tableau[toIndex].length === 0) {
        emptyTableaus = Math.max(0, emptyTableaus - 1);
    }
    return (1 + emptyFreeCells) * Math.pow(2, emptyTableaus);
}

function removeCards(loc, count) {
    if (loc.area === 'freecell') {
        let card = freeCells[loc.index];
        freeCells[loc.index] = null;
        return [card];
    }
    if (loc.area === 'foundation') return [foundations[loc.index].pop()];
    if (loc.area === 'tableau') return tableau[loc.index].splice(-count);
}

function addCards(loc, cards) {
    if (loc.area === 'freecell') freeCells[loc.index] = cards[0];
    if (loc.area === 'foundation') foundations[loc.index].push(cards[0]);
    if (loc.area === 'tableau') tableau[loc.index].push(...cards);
}

function checkWinCondition() {
    let totalInFoundation = foundations.reduce((sum, col) => sum + col.length, 0);
    if (totalInFoundation === 52 && !isGameWon) {
        isGameWon = true;
        stopTimer();
        recordWin();
        saveCurrentGame();
        playSound('win');
        
        let mins = Math.floor(secondsElapsed / 60);
        let secs = secondsElapsed % 60;
        document.getElementById('final-time').innerText = `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
        document.getElementById('final-moves').innerText = moveCount;
        document.getElementById('win-modal').classList.remove('hidden');
    }
}

function tryMove(from, to) {
    if (isGameWon) return false;
    let cardsToMove = getSelectedCards(from);
    if (cardsToMove.length === 0) return false;

    let targetCard = null;
    if (to.area === 'freecell') targetCard = freeCells[to.index];
    if (to.area === 'foundation' && foundations[to.index].length > 0) targetCard = foundations[to.index][foundations[to.index].length - 1];
    if (to.area === 'tableau' && tableau[to.index].length > 0) targetCard = tableau[to.index][tableau[to.index].length - 1];

    let firstCard = cardsToMove[0];
    let moveSuccessful = false;

    if (to.area === 'freecell') {
        if (targetCard === null && cardsToMove.length === 1) {
            addCards(to, removeCards(from, 1));
            moveSuccessful = true;
        }
    }
    else if (to.area === 'foundation') {
        if (cardsToMove.length === 1) {
            if (targetCard === null) {
                if (firstCard.value === 1) { 
                    addCards(to, removeCards(from, 1));
                    moveSuccessful = true;
                }
            } else {
                if (firstCard.suit === targetCard.suit && firstCard.value === targetCard.value + 1) {
                    addCards(to, removeCards(from, 1));
                    moveSuccessful = true;
                }
            }
        }
    }
    else if (to.area === 'tableau') {
        let maxCount = getMaxMoveCount(to.area, to.index);
        if (cardsToMove.length <= maxCount) {
            if (targetCard === null) {
                addCards(to, removeCards(from, cardsToMove.length));
                moveSuccessful = true;
            } else {
                if (firstCard.color !== targetCard.color && firstCard.value === targetCard.value - 1) {
                    addCards(to, removeCards(from, cardsToMove.length));
                    moveSuccessful = true;
                }
            }
        }
    }

    if (moveSuccessful) {
        moveHistory.push({ from: from, to: to, count: cardsToMove.length });
        redoHistory = [];
        moveCount++;
        hintLocations = [];
        updateStatusDisplay();
        playSound('move');
        checkWinCondition();
        saveCurrentGame();
        return true;
    }
    return false;
}

function undoMove() {
    if (isGameWon || moveHistory.length === 0) return;
    let lastMove = moveHistory.pop();
    redoHistory.push(lastMove);
    
    let cards = removeCards(lastMove.to, lastMove.count);
    addCards(lastMove.from, cards);
    
    selectedLocation = null;
    hintLocations = [];
    moveCount--;
    if (moveCount < 0) moveCount = 0;
    updateStatusDisplay();
    playSound('move');
    renderBoard();
    saveCurrentGame();
}

function redoMove() {
    if (isGameWon || redoHistory.length === 0) return;
    let nextMove = redoHistory.pop();
    moveHistory.push(nextMove);
    
    let cards = removeCards(nextMove.from, nextMove.count);
    addCards(nextMove.to, cards);
    
    selectedLocation = null;
    hintLocations = [];
    moveCount++;
    updateStatusDisplay();
    playSound('move');
    checkWinCondition();
    renderBoard();
    saveCurrentGame();
}

function findValidMoves() {
    let moves = [];
    for (let i = 0; i < 8; i++) {
        if (tableau[i].length > 0) {
            let cardIdx = tableau[i].length - 1;
            for (let f = 0; f < 4; f++) {
                let from = { area: 'tableau', index: i, cardIndex: cardIdx };
                let to = { area: 'foundation', index: f };
                let card = tableau[i][cardIdx];
                let topF = foundations[f].length > 0 ? foundations[f][foundations[f].length - 1] : null;
                if ((topF === null && card.value === 1) || (topF !== null && card.suit === topF.suit && card.value === topF.value + 1)) {
                    moves.push({ from, to, score: 100 });
                }
            }
        }
    }
    for (let i = 0; i < 4; i++) {
        if (freeCells[i] !== null) {
            let card = freeCells[i];
            for (let f = 0; f < 4; f++) {
                let from = { area: 'freecell', index: i, cardIndex: 0 };
                let to = { area: 'foundation', index: f };
                let topF = foundations[f].length > 0 ? foundations[f][foundations[f].length - 1] : null;
                if ((topF === null && card.value === 1) || (topF !== null && card.suit === topF.suit && card.value === topF.value + 1)) {
                    moves.push({ from, to, score: 100 });
                }
            }
        }
    }
    for (let i = 0; i < 8; i++) {
        if (tableau[i].length === 0) continue;
        for (let cardIdx = 0; cardIdx < tableau[i].length; cardIdx++) {
            let sequence = tableau[i].slice(cardIdx);
            if (!isValidSequence(sequence)) continue;

            for (let t = 0; t < 8; t++) {
                if (i === t) continue;
                let from = { area: 'tableau', index: i, cardIndex: cardIdx };
                let to = { area: 'tableau', index: t };
                let maxCount = getMaxMoveCount('tableau', t);
                if (sequence.length <= maxCount) {
                    let targetTop = tableau[t].length > 0 ? tableau[t][tableau[t].length - 1] : null;
                    if (targetTop === null) {
                        if (cardIdx > 0) moves.push({ from, to, score: 20 });
                    } else if (sequence[0].color !== targetTop.color && sequence[0].value === targetTop.value - 1) {
                        moves.push({ from, to, score: 50 });
                    }
                }
            }
        }
    }
    for (let i = 0; i < 4; i++) {
        if (freeCells[i] === null) continue;
        let card = freeCells[i];
        for (let t = 0; t < 8; t++) {
            let from = { area: 'freecell', index: i, cardIndex: 0 };
            let to = { area: 'tableau', index: t };
            let targetTop = tableau[t].length > 0 ? tableau[t][tableau[t].length - 1] : null;
            if (targetTop === null) {
                moves.push({ from, to, score: 10 });
            } else if (card.color !== targetTop.color && card.value === targetTop.value - 1) {
                moves.push({ from, to, score: 40 });
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
        alert('動かせる有効な手がありません。');
        return;
    }
    const bestMove = moves[0];
    hintLocations = [bestMove.from, bestMove.to];
    renderBoard();
}

function triggerAutoComplete() {
    if (isGameWon || isAutoCompleting) return;
    isAutoCompleting = true;
    startTimerIfNeeded();

    function step() {
        let moved = false;
        const moves = findValidMoves().filter(m => m.to.area === 'foundation');
        if (moves.length > 0) {
            const m = moves[0];
            tryMove(m.from, m.to);
            renderBoard();
            moved = true;
        }

        if (moved && !isGameWon) {
            setTimeout(step, 120);
        } else {
            isAutoCompleting = false;
        }
    }
    step();
}

function handleAreaClick(area, index, cardIndex = null) {
    if (isGameWon || isAutoCompleting) return;

    startTimerIfNeeded();
    hintLocations = [];

    if (!selectedLocation) {
        if (area === 'tableau') {
            if (tableau[index].length === 0) return;
            let cards = tableau[index].slice(cardIndex);
            if (isValidSequence(cards)) {
                selectedLocation = { area: area, index: index, cardIndex: cardIndex };
                renderBoard();
            }
        } else {
            let card = null;
            if (area === 'freecell') card = freeCells[index];
            if (area === 'foundation' && foundations[index].length > 0) card = foundations[index][foundations[index].length - 1];
            
            if (card) {
                selectedLocation = { area: area, index: index, cardIndex: 0 };
                renderBoard();
            }
        }
    } else {
        if (selectedLocation.area === area && selectedLocation.index === index) {
            selectedLocation = null;
            renderBoard();
            return;
        }

        tryMove(selectedLocation, { area: area, index: index });
        selectedLocation = null;
        renderBoard();
    }
}

// カードのHTML作成（左上コーナー + 完全中央マーク）
function createCardElement(card, topOffset = 0, isSelected = false, isHint = false) {
    const div = document.createElement('div');
    let classes = `card ${card.color}`;
    if (isSelected) classes += ' selected';
    if (isHint) classes += ' hint-highlight';
    div.className = classes;
    
    div.innerHTML = `
        <div class="card-corner">
            <span class="card-rank">${card.rank}</span>
            <span class="card-suit-mini">${card.suit}</span>
        </div>
        <div class="card-center">${card.suit}</div>
    `;
    div.style.top = `${topOffset}px`;
    return div;
}

function renderBoard() {
    const isHintTarget = (area, index, cardIndex = null) => {
        return hintLocations.some(h => {
            if (h.area !== area || h.index !== index) return false;
            if (cardIndex !== null && h.cardIndex !== undefined) {
                return cardIndex >= h.cardIndex;
            }
            return true;
        });
    };

    const fcContainer = document.getElementById('freecells');
    fcContainer.innerHTML = '';
    for (let i = 0; i < 4; i++) {
        const cell = document.createElement('div');
        cell.className = 'cell' + (isHintTarget('freecell', i) ? ' hint-highlight' : '');
        cell.onclick = () => handleAreaClick('freecell', i);
        if (freeCells[i]) {
            const isSelected = selectedLocation && selectedLocation.area === 'freecell' && selectedLocation.index === i;
            const isHint = isHintTarget('freecell', i);
            const cardElement = createCardElement(freeCells[i], 0, isSelected, isHint);
            cell.appendChild(cardElement);
        }
        fcContainer.appendChild(cell);
    }

    const fdContainer = document.getElementById('foundations');
    fdContainer.innerHTML = '';
    for (let i = 0; i < 4; i++) {
        const cell = document.createElement('div');
        cell.className = 'cell' + (isHintTarget('foundation', i) ? ' hint-highlight' : '');
        cell.onclick = () => handleAreaClick('foundation', i);
        if (foundations[i].length > 0) {
            const topCard = foundations[i][foundations[i].length - 1];
            const isSelected = selectedLocation && selectedLocation.area === 'foundation' && selectedLocation.index === i;
            const isHint = isHintTarget('foundation', i);
            const cardElement = createCardElement(topCard, 0, isSelected, isHint);
            cell.appendChild(cardElement);
        }
        fdContainer.appendChild(cell);
    }

    const tbContainer = document.getElementById('tableau');
    tbContainer.innerHTML = '';
    
    // カードの高さから重ねる幅を動的に計算
    const testCell = document.querySelector('.cell');
    const cardHeight = testCell ? testCell.offsetHeight : 65;
    const overlapOffset = Math.max(16, Math.round(cardHeight * 0.28));

    for (let i = 0; i < 8; i++) {
        const colDiv = document.createElement('div');
        colDiv.className = 'column cell';
        colDiv.style.border = 'none';
        if (tableau[i].length === 0 && isHintTarget('tableau', i)) {
            colDiv.classList.add('hint-highlight');
        }
        colDiv.onclick = () => {
            if (tableau[i].length === 0) handleAreaClick('tableau', i, 0);
        };

        for (let j = 0; j < tableau[i].length; j++) {
            const card = tableau[i][j];
            let isSelected = false;
            if (selectedLocation && selectedLocation.area === 'tableau' && selectedLocation.index === i) {
                if (j >= selectedLocation.cardIndex) isSelected = true;
            }

            const isHint = isHintTarget('tableau', i, j);
            const cardElement = createCardElement(card, j * overlapOffset, isSelected, isHint);
            cardElement.onclick = (e) => {
                e.stopPropagation(); 
                handleAreaClick('tableau', i, j);
            };
            colDiv.appendChild(cardElement);
        }
        tbContainer.appendChild(colDiv);
    }
}

// 音声ボタンの初期表示
document.getElementById('sound-btn').innerText = soundEnabled ? '🔊' : '🔇';

// 起動
if (!loadSavedGame()) {
    dealGame(11982);
}