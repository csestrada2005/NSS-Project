import type { FileSystemTree, DirectoryNode, FileNode } from '@webcontainer/api';
import { flattenFileTree } from '../utils/context';
import { updateCode } from '../utils/ast';
import { contextService } from './ContextService';
import { SupabaseService } from './SupabaseService';

interface ModifiedFile {
  path: string;
  newContent: string;
}

interface LLMResponse {
  modifiedFiles: ModifiedFile[];
}

export class AIOrchestrator {
  static async parseUserCommand(
    input: string,
    currentFileTree: FileSystemTree,
    selectedElement: { tagName: string; className?: string } | null = null
  ): Promise<FileSystemTree | null> {
    // Fast Lane: If element selected, use backend API
    if (selectedElement) {
        const filePath = 'src/App.tsx'; // Hardcoded active file for now
        const fileContent = this.getFileContent(currentFileTree, filePath);

        if (fileContent) {
            try {
                const response = await fetch('/api/ai-action', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        userPrompt: input,
                        selectedElementContext: `<${selectedElement.tagName} className='${selectedElement.className || ''}' />`
                    })
                });

                const data = await response.json();

                let newContent = fileContent;
                if (data.action === 'update-style') {
                    newContent = updateCode(fileContent, selectedElement, { className: data.className });
                } else if (data.action === 'update-text') {
                     // Cast to any to bypass potential TS error until ast.ts is updated
                     newContent = updateCode(fileContent, selectedElement, { textContent: data.text } as any);
                }

                const newTree = JSON.parse(JSON.stringify(currentFileTree));
                this.updateFileInTree(newTree, filePath, newContent);
                return newTree;
            } catch (e) {
                console.error('Fast lane error:', e);
                return null;
            }
        }
    }

    // Heavy Lane (Original Logic)
    const context = flattenFileTree(currentFileTree);

    const systemPrompt = "You are an expert Senior React Engineer. You must output a valid JSON object containing a 'modifiedFiles' array. Do not include markdown formatting (```json) or conversational text. JSON only.\n\n" +
    "When the user asks for backend features (e.g., 'save this to the database' or 'create a user profile table'):\n" +
    "1. Generate a valid PostgreSQL CREATE TABLE statement.\n" +
    "2. Wrap this SQL in a generic file block named supabase/migrations/<timestamp>_create_table.sql.\n" +
    "3. Do NOT try to execute the SQL directly.\n" +
    "4. If the user asks to 'Mock' the data, generate a src/data.json file instead of SQL.\n" +
    "5. Always prefer using the src/services/data abstraction layer when fetching data in React components.\n" +
    "6. Use the `cn()` utility from `src/lib/utils` for merging Tailwind classes dynamically.\n" +
    "7. If the user asks for backend logic (e.g., 'handle Stripe payments' or 'Edge Function'), generate a Deno-compatible TypeScript file at `supabase/functions/<name>/index.ts`."

    let userMessage = "";

    // Check for "Read [URL]" commands
    const readUrlRegex = /Read \[(.*?)\]/g;
    let match;
    const urlsToFetch: string[] = [];
    while ((match = readUrlRegex.exec(input)) !== null) {
        urlsToFetch.push(match[1]);
    }

    if (urlsToFetch.length > 0) {
        userMessage += "EXTERNAL DOCUMENTATION:\n";
        for (const url of urlsToFetch) {
            userMessage += `Fetching ${url}...\n`;
            try {
                const content = await contextService.fetchDocumentation(url);
                userMessage += `--- START CONTENT FROM ${url} ---\n${content}\n--- END CONTENT FROM ${url} ---\n\n`;
            } catch (e) {
                userMessage += `Failed to fetch ${url}.\n`;
            }
        }
    }

    // Removed selectedElement context from here as it's handled above, but keeping fallback just in case?
    // Actually, if selectedElement was passed but fileContent wasn't found (rare), we fall through here.
    if (selectedElement) {
        userMessage += `CONTEXT: The user has selected this HTML element: <${selectedElement.tagName} className='${selectedElement.className || ''}' />. If their request is ambiguous (e.g., 'change color'), apply it to this element.\n\n`;
    }

    userMessage += `User request: ${input}\n\nThe current file structure is:\n${context}`;

    try {
      const rawResponse = await this.callLLM(userMessage, systemPrompt);
      const cleanJson = this.cleanJsonOutput(rawResponse);

      let response: LLMResponse;
      try {
        response = JSON.parse(cleanJson);
      } catch (parseError) {
        console.error('Failed to parse JSON:', parseError);
        console.error('Raw output:', cleanJson);
        throw parseError;
      }

      const newTree = JSON.parse(JSON.stringify(currentFileTree));

      for (const file of response.modifiedFiles) {
        this.updateFileInTree(newTree, file.path, file.newContent);

        // Check for Edge Function deployment
        if (file.path.startsWith('supabase/functions/') && file.path.endsWith('index.ts')) {
            const parts = file.path.split('/');
            // supabase/functions/<name>/index.ts
            if (parts.length === 4) {
                const funcName = parts[2];
                SupabaseService.getInstance().deployEdgeFunction(funcName, file.newContent);
            }
        }
      }

      return newTree;
    } catch (error) {
      console.error('Error parsing AI response:', error);
      return null;
    }
  }

  private static getFileContent(tree: FileSystemTree, path: string): string | null {
    const parts = path.split('/');
    let current: any = tree;
    for (const part of parts) {
      if (!current) return null;
      if (current[part]) {
        current = current[part];
      } else if (current.directory && current.directory[part]) {
        current = current.directory[part];
      } else {
        return null;
      }
    }
    if (current && current.file && 'contents' in current.file) {
      return typeof current.file.contents === 'string'
        ? current.file.contents
        : new TextDecoder().decode(current.file.contents);
    }
    return null;
  }

  private static cleanJsonOutput(text: string): string {
    const match = text.match(/```json([\s\S]*?)```/);
    return match ? match[1].trim() : text.trim();
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

  static async callLLM(userMessage: string, systemPrompt: string): Promise<string> {
    try {
      const response = await fetch('/api/chat', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'anthropic-version': '2023-06-01'
        },
        body: JSON.stringify({
          model: 'claude-3-5-sonnet-20240620',
          max_tokens: 4096,
          system: systemPrompt,
          messages: [{ role: 'user', content: userMessage }]
        })
      });

      const data = await response.json();

      if (data.error) {
        throw new Error(data.error.message || JSON.stringify(data.error));
      }

      if (!data.content || !data.content[0] || !data.content[0].text) {
          console.error('Unexpected response format:', data);
          return JSON.stringify({ modifiedFiles: [] });
      }

      return data.content[0].text;
    } catch (error) {
      console.error('Error calling LLM:', error);
      return JSON.stringify({ modifiedFiles: [] });
    }
  }
}
