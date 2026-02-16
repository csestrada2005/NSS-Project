import 'dotenv/config';
import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import Anthropic from '@anthropic-ai/sdk';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());

// 1. Force HTTPs (Optional but good for Render)
app.use((req, res, next) => {
  if (req.headers['x-forwarded-proto'] === 'http') {
    return res.redirect(`https://${req.headers.host}${req.url}`);
  }
  next();
});

// 2. Set Security Headers (CRITICAL for WebContainers)
app.use((req, res, next) => {
  res.setHeader('Cross-Origin-Embedder-Policy', 'require-corp');
  res.setHeader('Cross-Origin-Opener-Policy', 'same-origin');
  next();
});

app.post('/api/ai-action', async (req, res) => {
  try {
    const { userPrompt, selectedElementContext } = req.body;
    const anthropic = new Anthropic({
      apiKey: process.env.ANTHROPIC_API_KEY,
    });

    const msg = await anthropic.messages.create({
      model: "claude-3-5-sonnet-latest",
      max_tokens: 1024,
      system: "You are an expert React/Tailwind developer. You receive a user command and a selected HTML element. Return ONLY a JSON object with: { 'action': 'update-style' | 'update-text', 'className': '...', 'text': '...' }. Do not return markdown.",
      messages: [
        { role: "user", content: `Context: ${selectedElementContext}. Command: ${userPrompt}` }
      ],
    });

    const contentBlock = msg.content.find(c => c.type === 'text');
    if (!contentBlock) {
      throw new Error('No text content in response');
    }

    let content = contentBlock.text;
    // Clean potential markdown
    content = content.replace(/```json/g, '').replace(/```/g, '').trim();

    const json = JSON.parse(content);
    res.json(json);
  } catch (error) {
    console.error('Error in /api/ai-action:', error);
    res.status(500).json({ error: 'Failed to process AI action' });
  }
});

app.post('/api/chat', async (req, res) => {
  const apiKey = process.env.ANTHROPIC_API_KEY;

  if (!apiKey) {
    return res.status(500).json({ error: 'Server misconfigured: API Key missing.' });
  }

  try {
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'x-api-key': apiKey,
        'anthropic-version': req.headers['anthropic-version'] || '2023-06-01',
        'content-type': 'application/json',
      },
      body: JSON.stringify(req.body),
    });

    const data = await response.json();
    res.status(response.status).json(data);
  } catch (error) {
    console.error('Error proxying to Anthropic:', error);
    res.status(500).json({ error: 'Internal Server Error' });
  }
});

// 3. Serve Static Files from 'dist'
app.use(express.static(path.join(__dirname, 'dist')));

// 4. Handle Client-Side Routing (SPA Fallback)
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'dist', 'index.html'));
});

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
