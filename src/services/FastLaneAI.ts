export interface ModifiedFile {
  path: string;
  newContent: string;
}

export class FastLaneAI {
  static async generateInstantEdit(userPrompt: string, fileContext: string): Promise<ModifiedFile[]> {
    // specific hack for testing in node environment
    const apiKey = (import.meta as any).env?.VITE_ANTHROPIC_API_KEY;

    if (!apiKey) {
      console.warn('FastLaneAI: No API key found. Using mock response.');

      const lowerInput = userPrompt.toLowerCase();
      // Extract current App.tsx content from fileContext
      const appTsxMatch = fileContext.match(/--- src\/App\.tsx ---\n([\s\S]*?)(\n\n---|$)/);
      let appContent = appTsxMatch ? appTsxMatch[1] : '';

      // Legacy Mock Logic (Navbar/Footer/Reset)
      if (lowerInput.includes('reset')) {
        return Promise.resolve([{
            path: 'src/App.tsx',
            newContent: `
import { useState } from 'react'
import './App.css'

function App() {
  const [count, setCount] = useState(0)

  return (
    <>
      <h1>Vite + React</h1>
      <div className="card">
        <button onClick={() => setCount((count) => count + 1)}>
          count is {count}
        </button>
        <p>
          Edit <code>src/App.tsx</code> and save to test HMR
        </p>
      </div>
    </>
  )
}

export default App
`.trim()
        }]);
      }

      if (lowerInput.includes('navbar')) {
        if (!appContent.includes('function Navbar')) {
            const navbarComponent = `
function Navbar() {
  return (
    <nav style={{ background: '#333', padding: '1rem', color: 'white', display: 'flex', gap: '1rem', marginBottom: '2rem' }}>
      <a href="#" style={{color: 'white', textDecoration: 'none'}}>Home</a>
      <a href="#" style={{color: 'white', textDecoration: 'none'}}>About</a>
      <a href="#" style={{color: 'white', textDecoration: 'none'}}>Contact</a>
    </nav>
  )
}
`;
            appContent = appContent.replace(/function App\(\) \{/, `${navbarComponent}\nfunction App() {`);
            appContent = appContent.replace(/(return \(\s*<>)/, '$1\n      <Navbar />');
        }
      }

      if (lowerInput.includes('footer')) {
        if (!appContent.includes('function Footer')) {
             const footerComponent = `
function Footer() {
  return (
    <footer style={{ background: '#eee', padding: '2rem', marginTop: '2rem', color: '#333' }}>
      <p>&copy; {new Date().getFullYear()} My App. All rights reserved.</p>
    </footer>
  )
}
`;
            appContent = appContent.replace(/function App\(\) \{/, `${footerComponent}\nfunction App() {`);
            appContent = appContent.replace(/(<\/div>\s*<\/>)/, '</div>\n      <Footer />\n    </>');
            if (!appContent.includes('<Footer />')) {
                appContent = appContent.replace(/(\s*<\/>)/, '\n      <Footer />$1');
            }
        }
      }

      if (lowerInput.includes('navbar') || lowerInput.includes('footer')) {
          return Promise.resolve([{
              path: 'src/App.tsx',
              newContent: appContent
          }]);
      }

      // Default generic mock if no specific keyword matched
      return new Promise(resolve => {
        setTimeout(() => {
            resolve([{
                path: 'src/App.tsx',
                newContent: `// Fast Lane Edit: ${userPrompt}\n` + (fileContext.match(/--- src\/App\.tsx ---\n([\s\S]*?)(\n\n---|$)/)?.[1] || '')
            }]);
        }, 500);
      });
    }

    const systemPrompt = "You are a high-speed UI builder. Return ONLY the code changes necessary. Do not explain. Focus on CSS, JSX, and React components. The output should be a JSON object with a 'modifiedFiles' key containing an array of objects with 'path' and 'newContent'.";

    try {
      const response = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'x-api-key': apiKey,
          'anthropic-version': '2023-06-01',
          'content-type': 'application/json',
          'dangerously-allow-browser': 'true' // Needed for client-side calls
        },
        body: JSON.stringify({
          model: 'claude-3-5-sonnet-20241022',
          max_tokens: 4096,
          system: systemPrompt,
          messages: [
            {
              role: 'user',
              content: `Current file context:\n${fileContext}\n\nUser request: ${userPrompt}`
            }
          ]
        })
      });

      if (!response.ok) {
        throw new Error(`Anthropic API Error: ${response.statusText}`);
      }

      const data = await response.json();
      const text = data.content[0].text;

      // Parse JSON from text (handle potential markdown code blocks)
      const jsonMatch = text.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
          const parsed = JSON.parse(jsonMatch[0]);
          return parsed.modifiedFiles || [];
      }

      console.warn('FastLaneAI: Could not parse JSON from response', text);
      return [];

    } catch (error) {
      console.error('FastLaneAI Error:', error);
      return [];
    }
  }
}
