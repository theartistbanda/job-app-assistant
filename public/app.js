// ── Constants ──
const FREE_LIMIT = 3;
const STORAGE_KEY = 'jobapp_history';

// ── State ──
let resumeText = '';
let generationCount = parseInt(sessionStorage.getItem('genCount') || '0');
let currentResult = null;
let activeHistoryId = null;
let progressInterval = null;

// ── Init ──
updateFreeLeft();
renderHistory();
loadOnStart();

// ── Load on start ──
function loadOnStart() {
    const history = getHistory();
    if (history.length > 0) {
        loadHistoryItem(history[0]);
    }
}

// ── Sidebar (desktop + mobile) ──
function toggleSidebar() {
    const sidebar = document.getElementById('sidebar');
    const overlay = document.getElementById('sidebarOverlay');
    sidebar.classList.toggle('open');
    overlay.classList.toggle('visible');
}

function closeSidebar() {
    document.getElementById('sidebar').classList.remove('open');
    document.getElementById('sidebarOverlay').classList.remove('visible');
}

// ── Mobile input sheet ──
function toggleInputPanel() {
    const panel = document.getElementById('inputPanel');
    const overlay = document.getElementById('inputOverlay');
    const closeBtn = document.getElementById('sheetCloseBtn');
    const isOpen = panel.classList.contains('open');
    if (isOpen) {
        panel.classList.remove('open');
        overlay.classList.remove('visible');
        closeBtn.classList.remove('visible');
    } else {
        panel.classList.add('open');
        overlay.classList.add('visible');
        closeBtn.classList.add('visible');
    }
}

function closeInputPanel() {
    document.getElementById('inputPanel').classList.remove('open');
    document.getElementById('inputOverlay').classList.remove('visible');
    document.getElementById('sheetCloseBtn').classList.remove('visible');
}

// ── New application ──
function startNew() {
    // Clear form
    document.getElementById('jobDesc').value = '';
    document.getElementById('extraContext').value = '';
    document.getElementById('chk-cover').checked = true;
    document.getElementById('chk-qa').checked = true;
    document.getElementById('chk-contact').checked = true;
    document.getElementById('chk-fit').checked = true;
    uploadZone.classList.remove('has-file');
    document.getElementById('uploadLabel').textContent = 'Click or drag & drop';
    resumeText = '';
    currentResult = null;
    activeHistoryId = null;

    // Show empty state
    document.getElementById('emptyState').style.display = 'flex';
    document.getElementById('bentoWrap').style.display = 'none';
    document.getElementById('topbarTitle').textContent = 'Job App Assistant';
    document.getElementById('topbarPdfBtn').style.display = 'none';

    // Clear active history highlight
    document.querySelectorAll('.history-item').forEach(i => i.classList.remove('active'));

    // On mobile — open input sheet
    if (window.innerWidth <= 860) {
        document.getElementById('inputPanel').classList.add('open');
        document.getElementById('inputOverlay').classList.add('visible');
        document.getElementById('sheetCloseBtn').classList.add('visible');
    }

    closeSidebar();
}

// ── Resume upload ──
const uploadZone = document.getElementById('uploadZone');
const resumeFile = document.getElementById('resumeFile');

uploadZone.addEventListener('click', () => resumeFile.click());

resumeFile.addEventListener('change', (e) => {
    const file = e.target.files[0];
    if (file) handleFile(file);
});

uploadZone.addEventListener('dragover', (e) => {
    e.preventDefault();
    uploadZone.classList.add('dragover');
});
uploadZone.addEventListener('dragleave', () => uploadZone.classList.remove('dragover'));
uploadZone.addEventListener('drop', (e) => {
    e.preventDefault();
    uploadZone.classList.remove('dragover');
    const file = e.dataTransfer.files[0];
    if (file) handleFile(file);
});

function handleFile(file) {
    uploadZone.classList.add('has-file');
    document.getElementById('uploadLabel').textContent = file.name;
    if (file.type === 'text/plain') {
        const reader = new FileReader();
        reader.onload = (e) => { resumeText = e.target.result; };
        reader.readAsText(file);
    } else {
        resumeText = `[Resume attached: ${file.name}]`;
    }
}

// ── Progress bar ──
const progressSteps = [
    { label: 'Analysing job description...', pct: 12 },
    { label: 'Calculating fit score...', pct: 30 },
    { label: 'Writing cover letter...', pct: 52 },
    { label: 'Preparing Q&A answers...', pct: 70 },
    { label: 'Researching contacts...', pct: 86 },
    { label: 'Finalising package...', pct: 95 },
];

function startProgress() {
    const wrap = document.getElementById('progressWrap');
    const fill = document.getElementById('progressFill');
    const label = document.getElementById('progressLabel');
    wrap.style.display = 'flex';
    fill.style.width = '0%';
    let step = 0;
    progressInterval = setInterval(() => {
        if (step < progressSteps.length) {
            fill.style.width = progressSteps[step].pct + '%';
            label.textContent = progressSteps[step].label;
            step++;
        }
    }, 900);
}

function finishProgress() {
    clearInterval(progressInterval);
    const fill = document.getElementById('progressFill');
    const label = document.getElementById('progressLabel');
    fill.style.width = '100%';
    label.textContent = 'Done!';
    setTimeout(() => {
        document.getElementById('progressWrap').style.display = 'none';
        fill.style.width = '0%';
    }, 900);
}

// ── Generate ──
async function generate() {
    const jobDescription = document.getElementById('jobDesc').value.trim();
    if (!jobDescription) {
        alert('Please paste a job description first.');
        return;
    }

    if (generationCount >= FREE_LIMIT) {
        showUpgradeNudge();
        return;
    }

    const extraContext = document.getElementById('extraContext').value.trim();
    const needs = [];
    if (document.getElementById('chk-fit').checked) needs.push('Fit score + flags');
    if (document.getElementById('chk-cover').checked) needs.push('Cover letter');
    if (document.getElementById('chk-qa').checked) needs.push('Application Q&A');
    if (document.getElementById('chk-contact').checked) needs.push('Contact research');

    const btn = document.getElementById('generateBtn');
    btn.disabled = true;
    btn.textContent = 'Generating…';

    // Close mobile input sheet, show centre
    closeInputPanel();

    // Hide empty state while generating
    document.getElementById('emptyState').style.display = 'none';
    document.getElementById('bentoWrap').style.display = 'none';

    startProgress();

    try {
        const response = await fetch('/api/generate', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ jobDescription, extraContext, resumeText, needs })
        });

        if (!response.ok) {
            const err = await response.json();
            throw new Error(err.error || 'Something went wrong');
        }

        const data = await response.json();
        currentResult = data.result;

        finishProgress();

        // Save + render
        const entry = saveToHistory(jobDescription, currentResult);
        activeHistoryId = entry.id;
        renderHistory();
        renderBento(currentResult, entry);

        // Update stats
        generationCount++;
        sessionStorage.setItem('genCount', generationCount);
        updateFreeLeft();
        document.getElementById('appCount').textContent =
            parseInt(document.getElementById('appCount').textContent) + 1;

    } catch (err) {
        finishProgress();
        document.getElementById('emptyState').style.display = 'flex';
        alert('Error: ' + err.message);
    } finally {
        btn.disabled = false;
        btn.textContent = 'Generate application package ↗';
        if (generationCount >= FREE_LIMIT) showUpgradeNudge();
    }
}

// ── Render bento ──
function renderBento(result, entry) {
    const wrap = document.getElementById('bentoWrap');
    wrap.style.display = 'flex';
    document.getElementById('emptyState').style.display = 'none';
    document.getElementById('topbarPdfBtn').style.display = 'inline-block';
    // topbar-new-btn is CSS-controlled (display:none on desktop, shown on mobile via media query)

    // Meta bar
    const meta = document.getElementById('bentoMeta');
    if (entry) {
        const scoreText = result.fitScore ? ` · ${result.fitScore.score}/10` : '';
        meta.textContent = `${entry.company}${scoreText} · ${entry.time}`;
        document.getElementById('topbarTitle').textContent = entry.company;
    }

    // Fit score
    if (result.fitScore) {
        const tile = document.getElementById('tileFit');
        tile.style.display = 'block';
        const score = result.fitScore.score;
        const circle = document.getElementById('scoreCircle');
        circle.textContent = score + '/10';
        circle.className = 'score-circle ' + (score >= 7 ? 'high' : score >= 5 ? 'mid' : 'low');
        document.getElementById('fitSummary').textContent = result.fitScore.summary || '';

        const gl = document.getElementById('greenFlags');
        gl.innerHTML = '';
        (result.fitScore.greenFlags || []).forEach(f => {
            const li = document.createElement('li'); li.textContent = f; gl.appendChild(li);
        });

        const rl = document.getElementById('redFlags');
        rl.innerHTML = '';
        (result.fitScore.redFlags || []).forEach(f => {
            const li = document.createElement('li'); li.textContent = f; rl.appendChild(li);
        });
    }

    // Cover letter
    if (result.coverLetter) {
        document.getElementById('tileCover').style.display = 'block';
        document.getElementById('coverBody').textContent = result.coverLetter;
    }

    // Q&A
    if (result.applicationQA) {
        document.getElementById('tileQA').style.display = 'block';
        const body = document.getElementById('qaBody');
        body.innerHTML = '';
        result.applicationQA.forEach(item => {
            const div = document.createElement('div');
            div.className = 'qa-item';
            div.innerHTML = `<p class="qa-q">${item.question}</p><p class="qa-a">${item.answer}</p>`;
            body.appendChild(div);
        });
    }

    // Contact
    if (result.contactResearch) {
        document.getElementById('tileContact').style.display = 'block';
        document.getElementById('contactRole').textContent = result.contactResearch.targetRole || '';
        document.getElementById('contactDesc').textContent = result.contactResearch.targetDescription || '';
        document.getElementById('contactOutreach').textContent = result.contactResearch.outreachTemplate || '';
    }

    wrap.scrollTop = 0;
}

// ── Copy tiles ──
function copyTile(type) {
    if (!currentResult) return;
    let text = '';
    if (type === 'fit' && currentResult.fitScore) {
        const f = currentResult.fitScore;
        text = `Fit Score: ${f.score}/10\n${f.summary}\n\nGreen flags:\n${(f.greenFlags || []).map(g => '• ' + g).join('\n')}\n\nWatch out:\n${(f.redFlags || []).map(r => '• ' + r).join('\n')}`;
    } else if (type === 'cover') {
        text = currentResult.coverLetter || '';
    } else if (type === 'qa') {
        text = (currentResult.applicationQA || []).map(q => `Q: ${q.question}\nA: ${q.answer}`).join('\n\n');
    } else if (type === 'contact') {
        const c = currentResult.contactResearch || {};
        text = `Who to find: ${c.targetRole}\n${c.targetDescription}\n\nOutreach:\n${c.outreachTemplate}`;
    }

    navigator.clipboard.writeText(text).then(() => {
        const types = ['fit', 'cover', 'qa', 'contact'];
        const idx = types.indexOf(type);
        const btns = document.querySelectorAll('.copy-btn');
        if (btns[idx]) {
            btns[idx].textContent = 'Copied!';
            btns[idx].classList.add('copied');
            setTimeout(() => {
                btns[idx].textContent = 'Copy';
                btns[idx].classList.remove('copied');
            }, 2000);
        }
    });
}

// ── PDF ──
function downloadPDF() { window.print(); }

// ── Free tier ──
function updateFreeLeft() {
    const left = Math.max(0, FREE_LIMIT - generationCount);
    document.getElementById('freeLeft').textContent = left;
    if (left === 0) showUpgradeNudge();
}

function showUpgradeNudge() {
    document.getElementById('upgradeNudge').style.display = 'block';
    document.getElementById('generateBtn').style.display = 'none';
}

// ── History ──
function getHistory() {
    try { return JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]'); }
    catch { return []; }
}

function saveToHistory(jobDescription, result) {
    const history = getHistory();
    const company = extractCompany(jobDescription);
    const score = result.fitScore ? result.fitScore.score : null;
    const now = new Date();
    const entry = {
        id: Date.now(),
        company,
        time: now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        date: now.toDateString(),
        score,
        result
    };
    history.unshift(entry);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(history.slice(0, 20)));
    return entry;
}

function extractCompany(text) {
    const short = text.slice(0, 300);
    const match = short.match(/at\s+([A-Z][a-zA-Z0-9\s&]+?)[\s,\n]/);
    return match ? match[1].trim().slice(0, 28) : 'Application';
}

function groupByDate(history) {
    const today = new Date().toDateString();
    const yesterday = new Date(Date.now() - 86400000).toDateString();
    const groups = {};
    history.forEach(item => {
        let label = item.date === today ? 'Today'
            : item.date === yesterday ? 'Yesterday'
                : item.date || 'Earlier';
        if (!groups[label]) groups[label] = [];
        groups[label].push(item);
    });
    return groups;
}

function renderHistory() {
    const history = getHistory();
    const list = document.getElementById('historyList');
    const empty = document.getElementById('historyEmpty');

    if (history.length === 0) {
        list.innerHTML = '';
        list.appendChild(empty);
        empty.style.display = 'block';
        return;
    }

    empty.style.display = 'none';
    list.innerHTML = '';

    const groups = groupByDate(history);
    Object.entries(groups).forEach(([label, items]) => {
        const groupLabel = document.createElement('p');
        groupLabel.className = 'history-group-label';
        groupLabel.textContent = label;
        list.appendChild(groupLabel);

        items.forEach(entry => {
            const div = document.createElement('div');
            div.className = 'history-item' + (entry.id === activeHistoryId ? ' active' : '');
            div.dataset.id = entry.id;

            const scoreClass = entry.score >= 7 ? 'high' : entry.score >= 5 ? 'mid' : 'low';
            const scoreText = entry.score ? `${entry.score}/10` : '—';

            div.innerHTML = `
        <div class="history-item-left">
          <p class="history-company">${entry.company}</p>
          <p class="history-time">${entry.time}</p>
        </div>
        <span class="history-score ${scoreClass}">${scoreText}</span>
      `;

            div.addEventListener('click', () => {
                loadHistoryItem(entry);
                closeSidebar();
            });

            list.appendChild(div);
        });
    });
}

function loadHistoryItem(entry) {
    currentResult = entry.result;
    activeHistoryId = entry.id;
    renderBento(entry.result, entry);
    closeInputPanel();

    // Update active state in list
    document.querySelectorAll('.history-item').forEach(el => {
        el.classList.toggle('active', el.dataset.id == entry.id);
    });
}

function searchHistory(query) {
    const q = query.toLowerCase();
    document.querySelectorAll('.history-item').forEach(el => {
        const name = el.querySelector('.history-company').textContent.toLowerCase();
        el.style.display = name.includes(q) ? 'flex' : 'none';
    });
    document.querySelectorAll('.history-group-label').forEach(label => {
        label.style.display = 'block';
    });
}

function clearHistory() {
    if (!confirm('Clear all history?')) return;
    localStorage.removeItem(STORAGE_KEY);
    activeHistoryId = null;
    currentResult = null;
    renderHistory();
    document.getElementById('emptyState').style.display = 'flex';
    document.getElementById('bentoWrap').style.display = 'none';
    document.getElementById('topbarTitle').textContent = 'Job App Assistant';
}

// ── Mobile bar button wiring ──
// These are added directly in HTML via onclick but we expose functions globally
// so mobile bar buttons in the HTML below work too
window.toggleInputPanel = toggleInputPanel;
window.startNew = startNew;
window.generate = generate;
window.toggleSidebar = toggleSidebar;
window.closeSidebar = closeSidebar;
window.copyTile = copyTile;
window.downloadPDF = downloadPDF;
window.clearHistory = clearHistory;