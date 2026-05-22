// ── State ──
let appCount = 0;
let resumeText = '';

// ── Resume upload ──
const uploadZone = document.getElementById('uploadZone');
const resumeFile = document.getElementById('resumeFile');
const uploadLabel = document.getElementById('uploadLabel');

uploadZone.addEventListener('click', () => resumeFile.click());

resumeFile.addEventListener('change', (e) => {
    const file = e.target.files[0];
    if (file) handleFile(file);
});

uploadZone.addEventListener('dragover', (e) => {
    e.preventDefault();
    uploadZone.classList.add('dragover');
});

uploadZone.addEventListener('dragleave', () => {
    uploadZone.classList.remove('dragover');
});

uploadZone.addEventListener('drop', (e) => {
    e.preventDefault();
    uploadZone.classList.remove('dragover');
    const file = e.dataTransfer.files[0];
    if (file) handleFile(file);
});

function handleFile(file) {
    uploadZone.classList.add('has-file');
    uploadLabel.textContent = file.name;

    // Read plain text files directly
    // For PDF/DOC the server will handle parsing — we just send the filename for now
    // and the actual file as FormData
    if (file.type === 'text/plain') {
        const reader = new FileReader();
        reader.onload = (e) => { resumeText = e.target.result; };
        reader.readAsText(file);
    } else {
        // Store the file object — sent via FormData in generate()
        uploadZone._file = file;
        resumeText = `[Resume file attached: ${file.name}]`;
    }
}

// ── Generate ──
async function generate() {
    const jobDescription = document.getElementById('jobDesc').value.trim();
    const extraContext = document.getElementById('extraContext').value.trim();
    const btn = document.getElementById('generateBtn');
    const resultCard = document.getElementById('resultCard');
    const resultDiv = document.getElementById('result');

    if (!jobDescription) {
        alert('Please paste a job description first.');
        return;
    }

    // What did they check?
    const needs = [];
    if (document.getElementById('chk-cover').checked) needs.push('Cover letter');
    if (document.getElementById('chk-qa').checked) needs.push('Application Q&A');
    if (document.getElementById('chk-contact').checked) needs.push('Contact research');
    if (document.getElementById('chk-fit').checked) needs.push('Fit score + flags');

    // Loading state
    btn.disabled = true;
    btn.classList.add('loading');
    btn.textContent = 'Generating…';
    resultCard.style.display = 'none';

    const startTime = Date.now();

    try {
        const response = await fetch('/api/generate', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                jobDescription,
                extraContext,
                resumeText,
                needs
            })
        });

        if (!response.ok) {
            const err = await response.json();
            throw new Error(err.error || 'Something went wrong');
        }

        const data = await response.json();

        // Show result
        resultDiv.innerHTML = '';
        resultDiv.classList.remove('error-text');
        resultDiv.textContent = data.result;
        resultCard.style.display = 'block';
        resultCard.scrollIntoView({ behavior: 'smooth', block: 'start' });

        // Update stats
        appCount++;
        document.getElementById('appCount').textContent = appCount;
        const mins = Math.round((Date.now() - startTime) / 60000) || 1;
        document.getElementById('timeSaved').textContent = `${appCount * mins} min`;

    } catch (err) {
        resultDiv.classList.add('error-text');
        resultDiv.textContent = 'Error: ' + err.message;
        resultCard.style.display = 'block';
    } finally {
        btn.disabled = false;
        btn.classList.remove('loading');
        btn.textContent = 'Generate application package ↗';
    }
}