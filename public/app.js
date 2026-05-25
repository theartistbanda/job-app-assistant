// ── Constants ──
const FREE_LIMIT = 3;
const STORAGE_KEY = 'jobapp_history';


// ── Safe DOM helper — never crashes if an element is missing ──
function el(id) {
    const node = document.getElementById(id);
    if (node) return node;
    // Return a dummy object so .style.display = x never throws
    return {
        style: new Proxy({}, { set: () => true, get: () => '' }),
        classList: { add: () => { }, remove: () => { }, toggle: () => { }, contains: () => false },
        get textContent() { return ''; }, set textContent(v) { },
        get innerHTML() { return ''; }, set innerHTML(v) { },
        get value() { return ''; },
        appendChild: () => { },
        querySelectorAll: () => []
    };
}

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
    const sidebar = el('sidebar');
    const overlay = el('sidebarOverlay');
    sidebar.classList.toggle('open');
    overlay.classList.toggle('visible');
}

function closeSidebar() {
    el('sidebar').classList.remove('open');
    el('sidebarOverlay').classList.remove('visible');
}

// ── Mobile input sheet ──
function toggleInputPanel() {
    const panel = el('inputPanel');
    const overlay = el('inputOverlay');
    const closeBtn = el('sheetCloseBtn');
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
    el('inputPanel').classList.remove('open');
    el('inputOverlay').classList.remove('visible');
    el('sheetCloseBtn').classList.remove('visible');
}

// ── New application ──
function startNew() {
    // Clear form
    el('jobDesc').value = '';
    el('extraContext').value = '';
    el('chk-cover').checked = true;
    el('chk-qa').checked = true;
    el('chk-contact').checked = true;
    el('chk-fit').checked = true;
    uploadZone.classList.remove('has-file');
    el('uploadLabel').textContent = 'Click or drag & drop';
    resumeText = '';
    currentResult = null;
    activeHistoryId = null;

    // Show empty state
    el('emptyState').style.display = 'flex';
    el('bentoWrap').style.display = 'none';
    el('topbarTitle').textContent = 'Job App Assistant';
    el('topbarPdfBtn').style.display = 'none';

    // Clear active history highlight
    document.querySelectorAll('.history-item').forEach(i => i.classList.remove('active'));

    // On mobile — open input sheet
    if (window.innerWidth <= 860) {
        el('inputPanel').classList.add('open');
        el('inputOverlay').classList.add('visible');
        el('sheetCloseBtn').classList.add('visible');
    }

    closeSidebar();
}

// ── Resume upload ──
const uploadZone = el('uploadZone');
const resumeFile = el('resumeFile');

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

async function handleFile(file) {
    // Show filename immediately so user sees something happened
    uploadZone.classList.add('has-file');
    el('uploadLabel').textContent = file.name;

    if (file.type === 'text/plain') {
        const reader = new FileReader();
        reader.onload = (e) => { resumeText = e.target.result; };
        reader.onerror = () => {
            el('uploadLabel').textContent = 'Could not read file — try again';
            uploadZone.classList.remove('has-file');
        };
        reader.readAsText(file);

    } else if (file.type === 'application/pdf') {
        // Loading state
        el('uploadLabel').textContent = 'Reading PDF...';

        try {
            // Load PDF.js from CDN
            if (!window.pdfjsLib) {
                await new Promise((resolve, reject) => {
                    const script = document.createElement('script');
                    script.src = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js';
                    script.onload = resolve;
                    script.onerror = reject;
                    document.head.appendChild(script);
                });
                window.pdfjsLib.GlobalWorkerOptions.workerSrc =
                    'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';
            }

            const arrayBuffer = await file.arrayBuffer();
            const pdf = await window.pdfjsLib.getDocument({ data: arrayBuffer }).promise;
            let fullText = '';

            for (let i = 1; i <= pdf.numPages; i++) {
                const page = await pdf.getPage(i);
                const content = await page.getTextContent();
                fullText += content.items.map(item => item.str).join(' ') + '\n';
            }

            resumeText = fullText.trim();

            if (!resumeText) {
                el('uploadLabel').textContent = 'PDF has no readable text — try a .txt or .docx';
                uploadZone.classList.remove('has-file');
                return;
            }

            el('uploadLabel').textContent = `${file.name} · ${pdf.numPages} page${pdf.numPages > 1 ? 's' : ''} read`;

        } catch (err) {
            console.error('PDF read error:', err);
            el('uploadLabel').textContent = 'Could not read PDF — try .txt instead';
            uploadZone.classList.remove('has-file');
            resumeText = '';
        }

    } else {
        // DOC, DOCX — can't parse in browser, send filename as context
        resumeText = `[Resume attached: ${file.name} — paste text manually for best results]`;
        el('uploadLabel').textContent = file.name + ' (text not extracted)';
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
    const wrap = el('progressWrap');
    const fill = el('progressFill');
    const label = el('progressLabel');
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
    const fill = el('progressFill');
    const label = el('progressLabel');
    fill.style.width = '100%';
    label.textContent = 'Done!';
    setTimeout(() => {
        el('progressWrap').style.display = 'none';
        fill.style.width = '0%';
    }, 900);
}

// ── Generate ──
async function generate() {
    const jobDescription = el('jobDesc').value.trim();
    if (!jobDescription) {
        alert('Please paste a job description first.');
        return;
    }

    if (generationCount >= FREE_LIMIT) {
        showUpgradeNudge();
        return;
    }

    const extraContext = el('extraContext').value.trim();
    const needs = [];
    if (el('chk-fit').checked) needs.push('Fit score + flags');
    if (el('chk-cover').checked) needs.push('Cover letter');
    if (el('chk-qa').checked) needs.push('Application Q&A');
    if (el('chk-contact').checked) needs.push('Contact research');

    const btn = el('generateBtn');
    btn.disabled = true;
    btn.textContent = 'Generating…';

    // Close mobile input sheet, show centre
    closeInputPanel();

    // Hide empty state while generating
    el('emptyState').style.display = 'none';
    el('bentoWrap').style.display = 'none';

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

        // If Claude returned a company name directly, use it — overrides any regex fallback
        if (currentResult.company && currentResult.company !== 'Application') {
            const label = currentResult.role
                ? `${currentResult.company} — ${currentResult.role}`.slice(0, 40)
                : currentResult.company.slice(0, 40);
            entry.company = label;
            const history = getHistory();
            history[0].company = label;
            localStorage.setItem(STORAGE_KEY, JSON.stringify(history));
        }
        activeHistoryId = entry.id;
        renderHistory();
        renderBento(currentResult, entry);

        // Update stats
        generationCount++;
        sessionStorage.setItem('genCount', generationCount);
        updateFreeLeft();
        el('appCount').textContent =
            parseInt(el('appCount').textContent) + 1;

    } catch (err) {
        finishProgress();
        el('emptyState').style.display = 'flex';
        alert('Error: ' + err.message);
    } finally {
        btn.disabled = false;
        btn.textContent = 'Generate application package ↗';
        if (generationCount >= FREE_LIMIT) showUpgradeNudge();
    }
}

// ── Render bento ──
function renderBento(result, entry) {
    const wrap = el('bentoWrap');
    wrap.style.display = 'flex';
    el('emptyState').style.display = 'none';
    el('topbarPdfBtn').style.display = 'inline-block';
    // topbar-new-btn is CSS-controlled (display:none on desktop, shown on mobile via media query)

    // Meta bar
    const meta = el('bentoMeta');
    if (entry) {
        const scoreText = result.fitScore ? ` · ${result.fitScore.score}/10` : '';
        meta.textContent = `${entry.company}${scoreText} · ${entry.time}`;
        el('topbarTitle').textContent = entry.company;
    } else if (result.company) {
        const label = result.role ? `${result.company} — ${result.role}` : result.company;
        el('topbarTitle').textContent = label.slice(0, 40);
    }

    // Fit score
    if (result.fitScore) {
        const tile = el('tileFit');
        tile.style.display = 'block';
        const score = result.fitScore.score;
        const circle = el('scoreCircle');
        circle.textContent = score + '/10';
        circle.className = 'score-circle ' + (score >= 7 ? 'high' : score >= 5 ? 'mid' : 'low');
        el('fitSummary').textContent = result.fitScore.summary || '';

        const gl = el('greenFlags');
        gl.innerHTML = '';
        (result.fitScore.greenFlags || []).forEach(f => {
            const li = document.createElement('li'); li.textContent = f; gl.appendChild(li);
        });

        const rl = el('redFlags');
        rl.innerHTML = '';
        (result.fitScore.redFlags || []).forEach(f => {
            const li = document.createElement('li'); li.textContent = f; rl.appendChild(li);
        });
    }

    // Cover letter
    if (result.coverLetter) {
        el('tileCover').style.display = 'block';
        el('coverBody').textContent = result.coverLetter;
    }

    // Q&A
    if (result.applicationQA) {
        el('tileQA').style.display = 'block';
        const body = el('qaBody');
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
        el('tileContact').style.display = 'block';
        el('contactRole').textContent = result.contactResearch.targetRole || '';
        el('contactDesc').textContent = result.contactResearch.targetDescription || '';
        el('contactOutreach').textContent = result.contactResearch.outreachTemplate || '';
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
    el('freeLeft').textContent = left;
    if (left === 0) showUpgradeNudge();
}

function showUpgradeNudge() {
    el('upgradeNudge').style.display = 'block';
    el('generateBtn').style.display = 'none';
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
    const short = text.slice(0, 600);

    // Pattern 1: "Company: Monzo" or "Organisation: X" or "Employer: X"
    const p1 = short.match(/(?:company|organisation|organization|employer|client|brand)[:\s]+([A-Z][a-zA-Z0-9\s&.,'-]{1,30}?)(?:\n|,|\.|–|-|$)/im);
    if (p1) return p1[1].trim().slice(0, 28);

    // Pattern 2: "About Monzo" / "About the Company" followed by company name
    const p2 = short.match(/about\s+(?:the\s+)?(?:company|role|job|us)?[:\s]*\n?\s*([A-Z][a-zA-Z0-9\s&]{2,25}?)(?:\n|is\s|was\s|–)/i);
    if (p2 && p2[1].toLowerCase() !== 'the' && p2[1].toLowerCase() !== 'us') return p2[1].trim().slice(0, 28);

    // Pattern 3: "at Monzo" / "join Monzo" / "for Monzo"
    const p3 = short.match(/(?:at|join|for|with)\s+([A-Z][a-zA-Z0-9\s&]{1,22}?)(?:\s*[,.\n!]|\s+(?:as|is|are|we|to|and))/);
    if (p3) return p3[1].trim().slice(0, 28);

    // Pattern 4: First ALL-CAPS word cluster (many JDs start with company name)
    const p4 = short.match(/^([A-Z][A-Z0-9\s&]{2,24}?)(?:\n|–|-)/m);
    if (p4) return p4[1].trim().slice(0, 28);

    // Pattern 5: Ask Claude — pull company from fitScore summary if available
    // (handled after generation via entry update below)

    return 'Application';
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
    const list = el('historyList');
    const empty = el('historyEmpty');

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
    el('emptyState').style.display = 'flex';
    el('bentoWrap').style.display = 'none';
    el('topbarTitle').textContent = 'Job App Assistant';
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