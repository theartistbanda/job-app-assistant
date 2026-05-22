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

    // Build a prompt based on what the user checked
    const sections = needs && needs.length > 0 ? needs : ['Cover letter'];

    const resumeSection = resumeText
        ? `\n\nCANDIDATE RESUME:\n${resumeText}`
        : '';

    const extraSection = extraContext
        ? `\n\nEXTRA CONTEXT FROM CANDIDATE:\n${extraContext}`
        : '';

    const prompt = `You are a professional job application assistant.

JOB DESCRIPTION:
${jobDescription}
${resumeSection}
${extraSection}

Please generate the following sections, clearly separated with headings:
${sections.map((s, i) => `${i + 1}. ${s}`).join('\n')}

Guidelines:
- Cover letter: 3 paragraphs, specific to the job, warm but professional tone
- Application Q&A: anticipate 3 likely application questions with strong answers
- Contact research: suggest what type of person to find at this company and a cold outreach message template
- Fit score + flags: give a score out of 10 with 2-3 green flags and 1-2 things to address

Be specific, not generic. Reference details from the job description.`;

    try {
        const response = await client.messages.create({
            model: 'claude-opus-4-5',
            max_tokens: 2048,
            messages: [{ role: 'user', content: prompt }]
        });

        res.json({ result: response.content[0].text });

    } catch (err) {
        console.error(err);
        res.status(500).json({ error: err.message || 'API error' });
    }
});

app.listen(process.env.PORT || 3000, () => {
    console.log('Server running on http://localhost:3000');
});