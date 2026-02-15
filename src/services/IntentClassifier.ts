export class IntentClassifier {
  static async classifyIntent(prompt: string): Promise<'FAST_LANE' | 'HEAVY_LANE'> {
    // specific hack for testing in node environment
    const apiKey = (import.meta as any).env?.VITE_GEMINI_API_KEY;

    if (apiKey) {
        try {
            const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${apiKey}`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    contents: [{
                        parts: [{
                            text: `Classify the following user request into FAST_LANE (simple UI edits like color, text, style, move) or HEAVY_LANE (complex tasks like install, refactor, new route, api, fix build). Return ONLY the label.\n\nRequest: ${prompt}`
                        }]
                    }]
                })
            });

            if (response.ok) {
                const data = await response.json();
                const text = data.candidates?.[0]?.content?.parts?.[0]?.text?.trim();
                if (text === 'FAST_LANE' || text === 'HEAVY_LANE') {
                    return text;
                }
            }
        } catch (error) {
            console.error('IntentClassifier: API call failed', error);
        }
    }

    console.warn('IntentClassifier: Using fallback regex.');
    const lower = prompt.toLowerCase();

    // Simple heuristics
    // Heavy tasks usually imply structural changes or external dependencies
    if (lower.match(/install|refactor|fix|create|route|api|bug|error|fail|import|package|new component/)) {
        return 'HEAVY_LANE';
    }

    // Fast tasks are usually cosmetic or small content updates
    if (lower.match(/change|update|move|color|text|style|css|background|font|align|padding|margin|border|edit|modify|navbar|footer|header|button|input/)) {
        return 'FAST_LANE';
    }

    // Default
    return 'HEAVY_LANE';
  }
}
