import type { FileSystemTree, DirectoryNode, FileNode } from '@webcontainer/api';
import { flattenFileTree } from '../utils/context';

interface ModifiedFile {
  path: string;
  newContent: string;
}

interface LLMResponse {
  modifiedFiles: ModifiedFile[];
}

export class AIOrchestrator {
  static async parseUserCommand(input: string, currentFileTree: FileSystemTree): Promise<FileSystemTree | null> {
    const context = flattenFileTree(currentFileTree);
    const systemPrompt = `
You are an expert software engineer.
The current file structure is:
${context}

User request: ${input}

Return a JSON object with the key "modifiedFiles" containing an array of objects with "path" and "newContent" for the files that need to be changed.
    `.trim();

    try {
      const responseJson = await this.callLLM(input, systemPrompt);
      const response: LLMResponse = JSON.parse(responseJson);

      const newTree = JSON.parse(JSON.stringify(currentFileTree));

      for (const file of response.modifiedFiles) {
        this.updateFileInTree(newTree, file.path, file.newContent);
      }

      return newTree;
    } catch (error) {
      console.error('Error parsing AI response:', error);
      return null;
    }
  }

  private static updateFileInTree(tree: FileSystemTree, filePath: string, newContent: string) {
    const parts = filePath.split('/');
    let currentLevel = tree;

    for (let i = 0; i < parts.length; i++) {
      const part = parts[i];
      if (i === parts.length - 1) {
        // File
        if (currentLevel[part] && 'file' in (currentLevel[part] as any)) {
          (currentLevel[part] as FileNode).file.contents = newContent;
        } else {
             // Create if not exists
             currentLevel[part] = {
                 file: {
                     contents: newContent
                 }
             };
        }
      } else {
        // Directory
        if (currentLevel[part] && 'directory' in (currentLevel[part] as any)) {
          currentLevel = (currentLevel[part] as DirectoryNode).directory;
        } else {
           // Create directory if missing
           currentLevel[part] = { directory: {} };
           currentLevel = (currentLevel[part] as DirectoryNode).directory;
        }
      }
    }
  }

  static async callLLM(input: string, prompt: string): Promise<string> {
    // Simulate API delay
    await new Promise(resolve => setTimeout(resolve, 500));

    const lowerInput = input.toLowerCase();

    // Extract current App.tsx content from prompt
    const appTsxMatch = prompt.match(/<document path="src\/App\.tsx">\n([\s\S]*?)\n<\/document>/);
    let appContent = appTsxMatch ? appTsxMatch[1] : '';

    if (lowerInput.includes('reset')) {
        return JSON.stringify({
            modifiedFiles: [{
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
            }]
        });
    }

    if (!appContent) {
        return JSON.stringify({ modifiedFiles: [] });
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
            // Insert component before App function
            appContent = appContent.replace(/function App\(\) \{/, `${navbarComponent}\nfunction App() {`);

            // Insert JSX inside App
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
            // Insert component before App function
            appContent = appContent.replace(/function App\(\) \{/, `${footerComponent}\nfunction App() {`);

            // Insert JSX inside App
            // Try to append before closing fragment
            appContent = appContent.replace(/(<\/div>\s*<\/>)/, '</div>\n      <Footer />\n    </>');
            // Fallback if the previous regex fails (e.g. slight formatting differences)
            if (!appContent.includes('<Footer />')) {
                appContent = appContent.replace(/(\s*<\/>)/, '\n      <Footer />$1');
            }
        }
    }

    if (lowerInput.includes('navbar') || lowerInput.includes('footer')) {
        return JSON.stringify({
            modifiedFiles: [{
                path: 'src/App.tsx',
                newContent: appContent
            }]
        });
    }

    // Default: return empty
    return JSON.stringify({ modifiedFiles: [] });
  }
}
