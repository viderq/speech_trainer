// ---------- ДАННЫЕ (из макета) ----------
const speakers = [
    { id: 'maria', name: 'Мария', icon: 'fa-user-nurse' }
];

const dictionary = {
    'behalf': '[bɪ\'hɑ:f]',
    'aeroflot': '[\'ɛərəuflɔːt]',
    'aboard': '[ə\'bɔ:d]',
    'honour': '[\'ɒnə]',
    'priority': '[praɪ\'ɔrɪtɪs]',
    'elite': '[eɪ\'liːt]',
    'bonus': '[\'bəunəs\']'
};

const recordings = {
    maria: [
        { id: 'maria_eng1', title: 'Greeting (English 1)', duration: 38, phrases: [], file: 'speaker/maria/greeting_eng1.json', audio: 'speaker/maria/greeting_eng1.mp3' },
        { id: 'maria_eng2', title: 'Greeting (English 2)', duration: 39, phrases: [], file: 'speaker/maria/greeting_eng2.json', audio: 'speaker/maria/greeting_eng2.mp3' },
        { id: 'maria_rus1', title: 'Приветствие (Русский 1)', duration: 41, phrases: [], file: 'speaker/maria/greeting_rus1.json', audio: 'speaker/maria/greeting_rus1.mp3' },
        { id: 'maria_rus2', title: 'Приветствие (Русский 2)', duration: 40, phrases: [], file: 'speaker/maria/greeting_rus2.json', audio: 'speaker/maria/greeting_rus2.mp3' }
    ]
};

// ---------- СОСТОЯНИЕ ----------
let currentSpeakerId = null;
let currentRecording = null;
const audio = new Audio();
let currentTime = 0;
let isPlaying = false;
let activePhraseIndex = -1;
let activeTooltipWord = null;

// DOM-элементы
const backBtn = document.getElementById('backBtn');
const menuBtn = document.getElementById('menuBtn');
const menuPopup = document.getElementById('menuPopup');
const headerTitle = document.getElementById('headerTitle');
const screens = document.querySelectorAll('.screen');
const speakersList = document.getElementById('speakersList');
const recordingsList = document.getElementById('recordingsList');
const lyricsContainer = document.getElementById('lyricsContainer');
const playPauseBtn = document.getElementById('playPauseBtn');
const progressFill = document.getElementById('progressFill');
const currentTimeSpan = document.getElementById('currentTime');
const totalTimeSpan = document.getElementById('totalTime');

// Создание тултипа для транскрипции
const tooltip = document.createElement('div');
tooltip.className = 'tooltip-popup';
document.body.appendChild(tooltip);

// Элементы авторизации
const loginScreen = document.getElementById('loginScreen');
const appContainer = document.getElementById('appContainer');
const loginInput = document.getElementById('loginInput');
const passwordInput = document.getElementById('passwordInput');
const loginBtn = document.getElementById('loginBtn');
const notification = document.getElementById('notification');

// ---------- АВТОРИЗАЦИЯ ----------
function showNotification(text) {
    notification.textContent = text;
    notification.classList.add('show');
    setTimeout(() => notification.classList.remove('show'), 3000);
}

async function handleLogin() {
    const login = loginInput.value.trim();
    const password = passwordInput.value;

    if (!login || !password) {
        showNotification('Введите логин и пароль');
        return;
    }

    loginBtn.disabled = true;
    loginBtn.textContent = 'Вход...';

    try {
        const response = await fetch('https://www.cocsr.na4u.ru/login.php', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ login, password })
        });

        const data = await response.json().catch(() => null);

        if (data && data.ok) {
            // Успешный вход
            localStorage.setItem('user_session', JSON.stringify(data));
            checkAuth();
        } else {
            showNotification('Ошибка входа');
        }
    } catch (error) {
        console.error('Login error:', error);
        showNotification('Ошибка сервера');
    } finally {
        loginBtn.disabled = false;
        loginBtn.textContent = 'Войти';
    }
}

function checkAuth() {
    const session = localStorage.getItem('user_session');
    if (session) {
        loginScreen.style.display = 'none';
        appContainer.style.display = 'flex';
        renderSpeakers(); // Инициализация основного контента
    } else {
        loginScreen.style.display = 'flex';
        appContainer.style.display = 'none';
    }
}

function handleLogout() {
    localStorage.removeItem('user_session');
    checkAuth();
}

loginBtn.addEventListener('click', handleLogin);
document.getElementById('menuLogout').addEventListener('click', handleLogout);

// Позволяем входить по нажатию Enter
passwordInput.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') handleLogin();
});

// Останавливаем аудио при уходе со страницы/сворачивании
window.addEventListener('pagehide', () => {
    if (typeof stopPlayback === 'function') stopPlayback();
});

window.addEventListener('visibilitychange', () => {
    if (document.hidden && typeof stopPlayback === 'function') {
        stopPlayback();
    }
});

// ---------- НАВИГАЦИЯ ----------
function showScreen(screenId) {
    // Если уходим с экрана плеера, останавливаем музыку
    const isLeavingPlayer = document.getElementById('playerScreen').classList.contains('active') && screenId !== 'playerScreen';
    if (isLeavingPlayer) {
        stopPlayback();
    }

    screens.forEach(s => s.classList.remove('active'));
    document.getElementById(screenId).classList.add('active');
    
    backBtn.style.visibility = (screenId === 'speakersScreen') ? 'hidden' : 'visible';
    
    if (screenId === 'speakersScreen') {
        headerTitle.textContent = 'Ифнормания';
        document.getElementById('menuRecordings').style.display = 'none';
    } else if (screenId === 'recordingsScreen') {
        headerTitle.textContent = 'Атлас голосов';
    }
    menuPopup.classList.remove('show');
}

backBtn.addEventListener('click', () => {
    if (document.getElementById('playerScreen').classList.contains('active')) {
        showScreen('recordingsScreen');
    } else if (document.getElementById('recordingsScreen').classList.contains('active')) {
        showScreen('speakersScreen');
    }
});

menuBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    menuPopup.classList.toggle('show');
});

document.addEventListener('click', () => menuPopup.classList.remove('show'));

document.getElementById('menuSpeakers').addEventListener('click', () => showScreen('speakersScreen'));
document.getElementById('menuRecordings').addEventListener('click', async () => {
    if (currentSpeakerId) {
        await renderRecordings(currentSpeakerId);
        showScreen('recordingsScreen');
    }
});

// ---------- ТРАНСКРИПЦИЯ ----------
function updateTooltipPosition() {
    if (!activeTooltipWord || !tooltip.classList.contains('show')) return;

    const rect = activeTooltipWord.getBoundingClientRect();
    const containerRect = lyricsContainer.getBoundingClientRect();

    // Проверяем, не скрылось ли слово за границами контейнера
    // Учитываем небольшой запас (padding)
    const isVisible = (
        rect.top >= containerRect.top &&
        rect.bottom <= containerRect.bottom
    );

    if (!isVisible) {
        hideTooltip();
        return;
    }

    const tooltipRect = tooltip.getBoundingClientRect();

    let top = rect.top - tooltipRect.height - 16;
    if (top < 10) {
        top = rect.bottom + 16;
    }

    const left = Math.max(10, Math.min(window.innerWidth - tooltipRect.width - 10, rect.left + (rect.width / 2) - (tooltipRect.width / 2)));

    tooltip.style.top = `${top}px`;
    tooltip.style.left = `${left}px`;
}

const hideTooltip = () => {
    tooltip.classList.remove('show');
    activeTooltipWord = null;
    document.removeEventListener('click', hideTooltip);
};

function showTranscription(event, word) {
    const transcription = dictionary[word];
    if (!transcription) return;

    activeTooltipWord = event.target;
    tooltip.innerHTML = `<div class="tooltip-transcription">${transcription}</div>`;
    tooltip.classList.add('show');

    updateTooltipPosition();

    // Задержка, чтобы текущий клик не закрыл тултип сразу
    setTimeout(() => {
        document.addEventListener('click', hideTooltip);
    }, 10);
}

// Привязываем обновление позиции к прокрутке контейнера
lyricsContainer.addEventListener('scroll', updateTooltipPosition);

// ---------- СПИКЕРЫ ----------
function renderSpeakers() {
    speakersList.innerHTML = '';
    speakers.forEach(s => {
        const card = document.createElement('div');
        card.className = 'card-item';
        card.innerHTML = `
            <div class="card-icon"><i class="fas ${s.icon}"></i></div>
            <div class="card-info">
                <h3>${s.name}</h3>
                <p>${recordings[s.id]?.length || 0} записей</p>
            </div>
        `;
        card.onclick = async () => {
            currentSpeakerId = s.id;
            await renderRecordings(s.id);
            showScreen('recordingsScreen');
            document.getElementById('recordingsTitleText').textContent = '' + s.name;
            document.getElementById('menuRecordings').style.display = 'flex';
            document.getElementById('menuRecordingsText').textContent = '(' + s.name + ')';
        };
        speakersList.appendChild(card);
    });
}

// ---------- ЗАПИСИ ----------
function formatTime(seconds) {
    const m = Math.floor(seconds / 60);
    const s = Math.floor(seconds % 60);
    return `${m}:${s < 10 ? '0' : ''}${s}`;
}

async function renderRecordings(speakerId) {
    recordingsList.innerHTML = '';
    const list = recordings[speakerId] || [];
    for (const r of list) {
        const card = document.createElement('div');
        card.className = 'card-item';
        card.innerHTML = `
            <div class="card-icon"><i class="fas fa-microphone"></i></div>
            <div class="card-info">
                <h3>${r.title}</h3>
                <p>${r.phrases.length || '?'} фраз • ${formatTime(r.duration)}</p>
            </div>
        `;
        card.onclick = async () => {
            currentRecording = r;
            await loadPlayer(r);
            showScreen('playerScreen');
            
            const speaker = speakers.find(s => s.id === currentSpeakerId);
            const speakerName = speaker ? speaker.name : '';
            headerTitle.textContent = speakerName + ' ' + r.title;
        };
        recordingsList.appendChild(card);
    }
}

// ---------- ПЛЕЕР ----------
async function loadPlayer(recording) {
    stopPlayback();
    currentTime = 0;
    activePhraseIndex = -1;
    totalTimeSpan.textContent = formatTime(recording.duration);
    updateProgress();

    // Загрузка аудио
    if (recording.audio) {
        audio.src = recording.audio;
        audio.load();
    }

    // Загрузка данных из внешнего JSON, если фразы не загружены
    if (recording.file && (!recording.phrases || recording.phrases.length === 0)) {
        try {
            const response = await fetch(recording.file);
            recording.phrases = await response.json();
            // Обновить количество фраз в списке записей
            renderRecordings(currentSpeakerId);
        } catch (error) {
            console.error('Ошибка загрузки таймингов:', error);
            recording.phrases = [{ start: 0, end: recording.duration, text: 'Ошибка загрузки текста' }];
        }
    }
    
    lyricsContainer.innerHTML = '';
    recording.phrases.forEach((p, idx) => {
        const div = document.createElement('div');
        div.className = 'phrase-item';
        
        // Разбиваем текст на слова и оборачиваем нужные в span
        const words = p.text.split(/(\s+)/);
        words.forEach(word => {
            const cleanWord = word.toLowerCase().replace(/[.,!?;:()]/g, '');
            if (dictionary[cleanWord]) {
                const span = document.createElement('span');
                span.className = 'transcription-word';
                span.textContent = word;
                span.onclick = (e) => {
                    e.stopPropagation();
                    showTranscription(e, cleanWord);
                };
                div.appendChild(span);
            } else {
                const textNode = document.createTextNode(word);
                div.appendChild(textNode);
            }
        });

        div.onclick = () => playPhrase(p.start, p.end);
        lyricsContainer.appendChild(div);
    });
    
    lyricsContainer.scrollTop = 0;
}

function playPhrase(startTime, endTime) {
    if (!currentRecording) return;
    
    // Удаляем предыдущие обработчики окончания фразы
    if (audio._phraseEndHandler) {
        audio.removeEventListener('timeupdate', audio._phraseEndHandler);
    }

    // Перематываем на начало фразы
    seekTo(startTime);
    
    // Создаем новый обработчик для остановки в конце фразы
    const checkEnd = () => {
        if (audio.currentTime >= endTime) {
            stopPlayback();
            audio.removeEventListener('timeupdate', checkEnd);
            audio._phraseEndHandler = null;
        }
    };
    
    audio._phraseEndHandler = checkEnd;
    audio.addEventListener('timeupdate', checkEnd);
}

function togglePlayback() {
    // При ручном запуске/паузе сбрасываем ограничение фразы
    if (audio._phraseEndHandler) {
        audio.removeEventListener('timeupdate', audio._phraseEndHandler);
        audio._phraseEndHandler = null;
    }
    if (isPlaying) stopPlayback();
    else startPlayback();
}

function startPlayback() {
    if (!currentRecording) return;
    isPlaying = true;
    playPauseBtn.innerHTML = '<i class="fas fa-pause"></i>';
    audio.play().catch(e => console.error("Ошибка воспроизведения:", e));
}

function stopPlayback() {
    isPlaying = false;
    playPauseBtn.innerHTML = '<i class="fas fa-play"></i>';
    audio.pause();
}

function seekTo(time) {
    if (!currentRecording) return;
    
    // Обновляем локальное состояние и интерфейс сразу
    currentTime = time;
    updateProgress();
    updateLyrics();

    // Функция для применения перемотки
    const applySeek = () => {
        try {
            audio.currentTime = time;
        } catch (e) {
            console.warn("Ошибка установки currentTime:", e);
        }
    };

    if (audio.readyState >= 1) {
        if (!isPlaying) {
            // Если сейчас не играет, сначала запускаем и ждем начала воспроизведения
            // чтобы некоторые браузеры не сбросили время в 0 при старте
            audio.addEventListener('playing', applySeek, { once: true });
            startPlayback();
        } else {
            // Если уже играет, просто перематываем
            applySeek();
        }
    } else {
        // Если метаданные еще не загружены, ждем их
        audio.addEventListener('loadedmetadata', () => {
            if (!isPlaying) {
                audio.addEventListener('playing', applySeek, { once: true });
                startPlayback();
            } else {
                applySeek();
            }
        }, { once: true });
        // Даем команду на загрузку, если она еще не началась
        if (audio.src) audio.play().then(() => {
            if (!isPlaying) stopPlayback(); // Останавливаем если не должны были играть
        }).catch(() => {});
    }
}

// Синхронизация с аудио
audio.ontimeupdate = () => {
    currentTime = audio.currentTime;
    updateProgress();
    updateLyrics();
};

audio.onended = () => {
    stopPlayback();
};

function updateProgress() {
    if (!currentRecording) return;
    const progress = (currentTime / currentRecording.duration) * 100;
    progressFill.style.width = progress + '%';
    currentTimeSpan.textContent = formatTime(currentTime);
}

function updateLyrics() {
    if (!currentRecording) return;
    
    let newIndex = -1;
    currentRecording.phrases.forEach((p, idx) => {
        if (currentTime >= p.start && currentTime < p.end) {
            newIndex = idx;
        }
    });

    if (newIndex !== activePhraseIndex) {
        const items = lyricsContainer.querySelectorAll('.phrase-item');
        items.forEach(item => item.classList.remove('active'));
        
        if (newIndex !== -1) {
            const activeItem = items[newIndex];
            activeItem.classList.add('active');
            
            // Центрирование активной фразы
            const containerHeight = lyricsContainer.offsetHeight;
            const itemOffset = activeItem.offsetTop;
            const itemHeight = activeItem.offsetHeight;
            
            lyricsContainer.scrollTo({
                top: itemOffset - containerHeight / 2 + itemHeight / 2,
                behavior: 'smooth'
            });
        }
        activePhraseIndex = newIndex;
    }
}

playPauseBtn.onclick = togglePlayback;

document.getElementById('prevBtn').onclick = () => {
    if (audio._phraseEndHandler) {
        audio.removeEventListener('timeupdate', audio._phraseEndHandler);
        audio._phraseEndHandler = null;
    }
    seekTo(Math.max(0, currentTime - 5));
};

document.getElementById('nextBtn').onclick = () => {
    if (audio._phraseEndHandler) {
        audio.removeEventListener('timeupdate', audio._phraseEndHandler);
        audio._phraseEndHandler = null;
    }
    seekTo(Math.min(currentRecording.duration, currentTime + 5));
};

document.getElementById('progressBar').onclick = (e) => {
    if (audio._phraseEndHandler) {
        audio.removeEventListener('timeupdate', audio._phraseEndHandler);
        audio._phraseEndHandler = null;
    }
    const rect = e.currentTarget.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const percentage = x / rect.width;
    seekTo(percentage * currentRecording.duration);
};

// Инициализация
checkAuth();

// Если пользователь уже авторизован, принудительно вызываем renderSpeakers, 
// так как checkAuth может сработать до того, как все DOM элементы будут готовы для рендеринга
if (localStorage.getItem('user_session')) {
    renderSpeakers();
}