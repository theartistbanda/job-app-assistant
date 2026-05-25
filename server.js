require('dotenv').config();
const express = require('express');
const cors = require('cors');
const Anthropic = require('@anthropic-ai/sdk');

const app = express();
app.use(cors());
app.use(express.json({ limit: '5mb' }));
app.use(express.static('public'));

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

app.post('/api/generate', async (req, res) => {
    const { jobDescription, extraContext, resumeText, needs } = req.body;

    const sections = needs && needs.length > 0 ? needs : ['Cover letter'];

    const resumeSection = resumeText
        ? `\n\nCANDIDATE RESUME:\n${resumeText}`
        : '';

    const extraSection = extraContext
        ? `\n\nEXTRA CONTEXT FROM CANDIDATE:\n${extraContext}`
        : '';

    const prompt = `You are a professional job application assistant. Return ONLY a valid JSON object with no markdown, no code fences, no extra text.

JOB DESCRIPTION:
${jobDescription}
${resumeSection}
${extraSection}

Generate the requested sections and return them as a JSON object with exactly these keys (only include keys for requested sections):
- "company": string — the company name extracted from the job description (required always, even if other sections are not requested)
- "role": string — the job title from the job description (required always)
- "fitScore": object with "score" (number 1-10), "summary" (one sentence), "greenFlags" (array of 2-3 strings), "redFlags" (array of 1-2 strings)
- "coverLetter": string with the full cover letter (use \\n for line breaks)
- "applicationQA": array of objects, each with "question" (string) and "answer" (string), 3 items
- "contactResearch": object with "targetRole" (string), "targetDescription" (string), "outreachTemplate" (string)

Requested sections: ${sections.join(', ')}

Rules:
- Be specific to this exact job description, not generic
- Cover letter: 3 paragraphs, warm but professional
- Fit score: honest, reference specific job requirements
- Q&A: anticipate real application form questions
- Contact: realistic outreach for this specific company/role

Return ONLY the JSON object. No explanation, no markdown.`;

    try {
        const response = await client.messages.create({
            model: 'claude-opus-4-5',
            max_tokens: 2048,
            messages: [{ role: 'user', content: prompt }]
        });

        const raw = response.content[0].text.trim();
        const cleaned = raw.replace(/^```json\n?/, '').replace(/^```\n?/, '').replace(/\n?```$/, '');

        let parsed;
        try {
            parsed = JSON.parse(cleaned);
        } catch (parseErr) {
            return res.status(500).json({ error: 'Failed to parse AI response. Please try again.' });
        }

        res.json({ result: parsed });

    } catch (err) {
        console.error(err);
        res.status(500).json({ error: err.message || 'API error' });
    }
});

app.listen(process.env.PORT || 3000, () => {
    console.log('Server running on http://localhost:3000');
});