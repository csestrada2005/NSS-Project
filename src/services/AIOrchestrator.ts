import type { FileSystemTree, DirectoryNode, FileNode } from '@webcontainer/api';
import { generateProjectBlueprint } from '../utils/context';
import { updateCode } from '../utils/ast';
import { contextService } from './ContextService';
import { SupabaseService } from './SupabaseService';
import { webContainerService } from './WebContainerService';
import { NEBU_SCHEMA_CONTEXT } from '../utils/schemaContext';

interface ModifiedFile {
  path: string;
  newContent: string;
}

interface LLMResponse {
  modifiedFiles: ModifiedFile[];
  installCommands?: string[];
  error?: string;
}

function selectRelevantFiles(
  userMessage: string,
  fileTree: FileSystemTree
): { path: string; content: string }[] {
  // Extract keywords: split on spaces/punctuation, filter words > 3 chars, lowercase
  const keywords = userMessage
    .split(/[\s\p{P}]+/u)
    .map(w => w.toLowerCase())
    .filter(w => w.length > 3);

  // Walk the file tree and collect all .tsx/.ts/.jsx/.js files
  const files: { path: string; content: string }[] = [];

  const walk = (node: FileSystemTree, currentPath: string) => {
    for (const [name, entry] of Object.entries(node)) {
      const entryPath = currentPath ? `${currentPath}/${name}` : name;
      if ('directory' in entry) {
        if (name === 'node_modules' || name === 'dist') continue;
        walk(entry.directory, entryPath);
      } else if ('file' in entry) {
        if (
          name.endsWith('.tsx') ||
          name.endsWith('.ts') ||
          name.endsWith('.jsx') ||
          name.endsWith('.js')
        ) {
          if ('contents' in entry.file) {
            const raw = entry.file.contents;
            const content = typeof raw === 'string'
              ? raw
              : new TextDecoder().decode(raw);
            files.push({ path: entryPath, content });
          }
        }
      }
    }
  };

  walk(fileTree, '');

  // Score each file
  const scored = files.map(f => {
    const nameLower = f.path.toLowerCase();
    const contentSnippet = f.content.slice(0, 2000).toLowerCase();
    let score = 0;
    for (const kw of keywords) {
      if (nameLower.includes(kw)) score += 3;
      if (contentSnippet.includes(kw)) score += 1;
    }
    return { ...f, score };
  });

  scored.sort((a, b) => b.score - a.score);

  return scored.slice(0, 5).map(f => ({
    path: f.path,
    content: f.content.slice(0, 3000),
  }));
}

const FORMAT_INSTRUCTION = `
CRITICAL OUTPUT FORMAT: Respond with ONLY a raw JSON object. No markdown. No code fences. No explanation before or after. The object must have this exact shape:
{"modifiedFiles":[{"path":"src/components/Foo.tsx","newContent":"...full file content..."}],"installCommands":[]}
If you cannot fulfill the request, respond with: {"modifiedFiles":[],"installCommands":[],"error":"reason"}
Never truncate file content. Never use placeholder comments like "// rest of file here".
`;

const REACT_TAILWIND_RULES = `
REACT/TAILWIND RULES:
- Always write complete file contents, never partial updates
- Use data-oid attributes exactly as they exist in the source — never add, remove, or change them
- Prefer Tailwind utility classes; avoid inline styles unless position:absolute math requires it
- For new components, follow the existing file structure and import patterns visible in the provided context
- Supabase queries: import via \`import { SupabaseService } from '@/services/SupabaseService'; const supabase = SupabaseService.getInstance().client;\`
`;

const BACKEND_RULES = `When the user asks for backend features (e.g., 'save this to the database' or 'create a user profile table'), you must perform a 3-step process:
1. Generate a valid PostgreSQL CREATE TABLE statement wrapped in a file named \`supabase/migrations/<timestamp>_create_<table_name>.sql\`.
2. Update or create \`src/integrations/supabase/types.ts\` to include the TypeScript interface for the new table.
   Example for types.ts:
   export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[]
   export interface Database {
     public: {
       Tables: {
         profiles: {
           Row: { id: string; created_at: string; username: string | null; }
           Insert: { id: string; created_at?: string; username?: string | null; }
           Update: { id?: string; created_at?: string; username?: string | null; }
         }
       }
     }
   }
3. Create a custom hook \`src/hooks/use<Entity>.ts\` that encapsulates the Supabase client logic (select, insert, update, delete) using the generated types.
   Example for useTodos.ts:
   import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
   import { supabase } from '../integrations/supabase/client';
   export const useTodos = () => {
     const queryClient = useQueryClient();
     const fetchTodos = async () => { const { data, error } = await supabase.from('todos').select('*'); if (error) throw error; return data; };
     const addTodo = async (todo: any) => { const { data, error } = await supabase.from('todos').insert(todo).select(); if (error) throw error; return data; };
     return { todos: useQuery({ queryKey: ['todos'], queryFn: fetchTodos }), addTodo: useMutation({ mutationFn: addTodo, onSuccess: () => queryClient.invalidateQueries({ queryKey: ['todos'] }) }) };
   };
4. Do NOT try to execute the SQL directly.
5. If the user asks to 'Mock' the data, generate a src/data.json file instead of SQL.
6. Use the \`cn()\` utility from \`src/lib/utils\` for merging Tailwind classes dynamically.
7. If the user asks for backend logic (e.g., 'handle Stripe payments' or 'Edge Function'), generate a Deno-compatible TypeScript file at \`supabase/functions/<name>/index.ts\`.
8. If you need a Shadcn component (e.g., sheet, accordion, dialog) that is not currently in the src/components/ui folder, you MUST include 'npx shadcn-ui@latest add [component-name]' in the 'installCommands' array in your JSON response.`;

export class AIOrchestrator {
  private static currentFileTree: FileSystemTree | null = null;
  private static lastModifiedFiles: string[] = [];
  private static retryCount = 0;
  private static maxRetries = 2;
  private static isInitialized = false;
  private static fileUpdateListeners: ((tree: FileSystemTree) => void)[] = [];

  static initialize() {
    if (this.isInitialized) return;
    webContainerService.onErrorDetected((error) => this.handleBuildError(error));
    this.isInitialized = true;
  }

  static onFilesUpdated(callback: (tree: FileSystemTree) => void) {
      this.fileUpdateListeners.push(callback);
  }

  static async generatePlan(userGoal: string, currentFileTree: FileSystemTree): Promise<FileSystemTree> {
      const systemPrompt = "You are a Senior Technical Project Manager. Create a detailed implementation plan for the user's request. Output ONLY the content of a PLAN.md file. The format must be a markdown checklist.\n\n" +
      "Example:\n" +
      "- [ ] 1. Setup Database Schema\n" +
      "- [ ] 2. Create API Endpoints\n" +
      "- [ ] 3. Implement Frontend Components\n\n" +
      "Keep steps atomic, clear, and focused on code implementation.";

      const planContent = await this.callLLM(userGoal, systemPrompt);

      await webContainerService.writeFile('PLAN.md', planContent);

      const newTree = JSON.parse(JSON.stringify(currentFileTree));
      this.updateFileInTree(newTree, 'PLAN.md', planContent);
      return newTree;
  }

  static async executeNextStep(currentFileTree: FileSystemTree): Promise<FileSystemTree | null> {
      this.initialize();
      this.currentFileTree = currentFileTree;
      this.retryCount = 0;

      const planContent = this.getFileContent(currentFileTree, 'PLAN.md');
      if (!planContent) return null;

      const lines = planContent.split('\n');
      let nextStepIndex = -1;
      let nextStepDescription = '';

      for (let i = 0; i < lines.length; i++) {
          if (lines[i].includes('- [ ]')) {
              nextStepIndex = i;
              nextStepDescription = lines[i].replace('- [ ]', '').trim();
              break;
          }
      }

      if (nextStepIndex === -1) return null;

      const relevantFiles = selectRelevantFiles(nextStepDescription, currentFileTree);
      const blueprint = generateProjectBlueprint(currentFileTree);

      let relevantContext = "";
      for (const f of relevantFiles) {
          relevantContext += `--- START ${f.path} ---\n${f.content}\n--- END ${f.path} ---\n`;
      }

      const systemPrompt = NEBU_SCHEMA_CONTEXT + "\n\n" +
      "You are an expert Senior React Engineer. Implement the following step from the plan.\n" +
      FORMAT_INSTRUCTION + "\n" +
      REACT_TAILWIND_RULES + "\n" +
      BACKEND_RULES + "\n\n" +
      `Task: ${nextStepDescription}`;

      const userMessage = `PROJECT BLUEPRINT (File Structure):\n${blueprint}\n\n` +
                          `RELEVANT FILE CONTEXT:\n${relevantContext}\n\n` +
                          `USER REQUEST:\n${nextStepDescription}`;

      try {
          const rawResponse = await this.callLLM(userMessage, systemPrompt);
          const cleanJson = this.cleanJsonOutput(rawResponse);
          const response: LLMResponse = JSON.parse(cleanJson);

          const newTree = JSON.parse(JSON.stringify(currentFileTree));

          if (response.installCommands && response.installCommands.length > 0) {
              for (const cmd of response.installCommands) {
                  await webContainerService.executeCommand(cmd);
              }
          }

          const modifiedPaths: string[] = [];
          for (const file of response.modifiedFiles) {
              this.updateFileInTree(newTree, file.path, file.newContent);
              modifiedPaths.push(file.path);

              if (file.path.startsWith('supabase/functions/') && file.path.endsWith('index.ts')) {
                    const parts = file.path.split('/');
                    if (parts.length === 4) {
                        const funcName = parts[2];
                        SupabaseService.getInstance().deployEdgeFunction(funcName, file.newContent);
                    }
                }
          }

          lines[nextStepIndex] = lines[nextStepIndex].replace('- [ ]', '- [x]');
          const newPlanContent = lines.join('\n');
          await webContainerService.writeFile('PLAN.md', newPlanContent);
          this.updateFileInTree(newTree, 'PLAN.md', newPlanContent);

          this.lastModifiedFiles = modifiedPaths;
          this.currentFileTree = newTree;
          return newTree;

      } catch (error) {
          console.error('Error executing step:', error);
          return null;
      }
  }

  static async parseUserCommand(
    input: string,
    currentFileTree: FileSystemTree,
    selectedElement: { tagName: string; className?: string } | null = null
  ): Promise<{ tree: FileSystemTree | null; modifiedFiles: string[] }> {
    this.initialize();
    this.currentFileTree = currentFileTree;
    this.retryCount = 0;

    if (input.toLowerCase().startsWith('plan:')) {
        const goal = input.substring(5).trim();
        const tree = await this.generatePlan(goal, currentFileTree);
        return { tree, modifiedFiles: ['PLAN.md'] };
    }

    if (input.toLowerCase().startsWith('build a')) {
        const tree = await this.generatePlan(input, currentFileTree);
        return { tree, modifiedFiles: ['PLAN.md'] };
    }

    if (input.toLowerCase().trim() === 'execute next step' || input.toLowerCase().trim() === 'continue plan') {
        const tree = await this.executeNextStep(currentFileTree);
        return { tree, modifiedFiles: tree ? this.lastModifiedFiles : [] };
    }

    // Fast Lane: If element selected, use backend API
    if (selectedElement) {
        const filePath = 'src/App.tsx';
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
                     // eslint-disable-next-line @typescript-eslint/no-explicit-any
                     newContent = updateCode(fileContent, selectedElement, { textContent: data.text } as any);
                }

                const newTree = JSON.parse(JSON.stringify(currentFileTree));
                this.updateFileInTree(newTree, filePath, newContent);
                return { tree: newTree, modifiedFiles: [filePath] };
            } catch (e) {
                console.error('Fast lane error:', e);
                return { tree: null, modifiedFiles: [] };
            }
        }
    }

    // Heavy Lane
    const relevantFiles = selectRelevantFiles(input, currentFileTree);
    const blueprint = generateProjectBlueprint(currentFileTree);

    let relevantContext = "";
    for (const f of relevantFiles) {
        relevantContext += `--- START ${f.path} ---\n${f.content}\n--- END ${f.path} ---\n`;
    }

    const systemPrompt = NEBU_SCHEMA_CONTEXT + "\n\n" +
    "You are an expert Senior React Engineer.\n" +
    FORMAT_INSTRUCTION + "\n" +
    REACT_TAILWIND_RULES + "\n" +
    BACKEND_RULES;

    let userMessage = "";

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
            } catch {
                userMessage += `Failed to fetch ${url}.\n`;
            }
        }
    }

    if (selectedElement) {
        userMessage += `CONTEXT: The user has selected this HTML element: <${selectedElement.tagName} className='${selectedElement.className || ''}' />. If their request is ambiguous (e.g., 'change color'), apply it to this element.\n\n`;
    }

    userMessage += `PROJECT BLUEPRINT (File Structure):\n${blueprint}\n\n` +
                   `RELEVANT FILE CONTEXT:\n${relevantContext}\n\n` +
                   `USER REQUEST:\n${input}`;

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

      if (response.installCommands && response.installCommands.length > 0) {
          for (const cmd of response.installCommands) {
              await webContainerService.executeCommand(cmd);
          }
      }

      const modifiedPaths: string[] = [];
      for (const file of response.modifiedFiles) {
        this.updateFileInTree(newTree, file.path, file.newContent);
        modifiedPaths.push(file.path);

        if (file.path.startsWith('supabase/functions/') && file.path.endsWith('index.ts')) {
            const parts = file.path.split('/');
            if (parts.length === 4) {
                const funcName = parts[2];
                SupabaseService.getInstance().deployEdgeFunction(funcName, file.newContent);
            }
        }
      }

      this.lastModifiedFiles = modifiedPaths;
      this.currentFileTree = newTree;
      return { tree: newTree, modifiedFiles: modifiedPaths };
    } catch (error) {
      console.error('Error parsing AI response:', error);
      return { tree: null, modifiedFiles: [] };
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
    // Try extracting from code fences first
    const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/);
    if (fenced) return fenced[1].trim();

    // Find the first { and last } to extract raw JSON
    const start = text.indexOf('{');
    const end = text.lastIndexOf('}');
    if (start !== -1 && end !== -1 && end > start) {
      return text.slice(start, end + 1);
    }

    return text.trim();
  }

  private static updateFileInTree(tree: FileSystemTree, filePath: string, newContent: string) {
    const parts = filePath.split('/');
    let currentLevel = tree;

    for (let i = 0; i < parts.length; i++) {
      const part = parts[i];
      if (i === parts.length - 1) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        if (currentLevel[part] && 'file' in (currentLevel[part] as any)) {
          (currentLevel[part] as FileNode).file.contents = newContent;
        } else {
             currentLevel[part] = {
                 file: {
                     contents: newContent
                 }
             };
        }
      } else {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        if (currentLevel[part] && 'directory' in (currentLevel[part] as any)) {
          currentLevel = (currentLevel[part] as DirectoryNode).directory;
        } else {
           currentLevel[part] = { directory: {} };
           // eslint-disable-next-line @typescript-eslint/no-explicit-any
           currentLevel = (currentLevel[part] as DirectoryNode).directory;
        }
      }
    }
  }

  private static async handleBuildError(error: string) {
      if (this.retryCount >= this.maxRetries) {
          console.warn('[Self-Correction] Max retries reached. Stopping.');
          return;
      }
      if (!this.currentFileTree) return;

      this.retryCount++;
      console.log(`[Self-Correction] Attempt ${this.retryCount}/${this.maxRetries}`);

      const systemPrompt = "You are an expert React Engineer. You recently modified files and the build failed. " +
                           FORMAT_INSTRUCTION + "\n" +
                           "Error Trace:\n" + error + "\n\n" +
                           "Recently Modified Files:\n" + this.lastModifiedFiles.join(", ");

      const userMessage = "Fix the build error.";

      try {
          const rawResponse = await this.callLLM(userMessage, systemPrompt);
          const cleanJson = this.cleanJsonOutput(rawResponse);
          const response: LLMResponse = JSON.parse(cleanJson);

          const newTree = JSON.parse(JSON.stringify(this.currentFileTree));

          const modifiedPaths: string[] = [];
          for (const file of response.modifiedFiles) {
              this.updateFileInTree(newTree, file.path, file.newContent);
              modifiedPaths.push(file.path);
              await webContainerService.writeFile(file.path, file.newContent);
          }

          this.lastModifiedFiles = modifiedPaths;
          this.currentFileTree = newTree;

          this.fileUpdateListeners.forEach(cb => cb(newTree));

          console.log('[Self-Correction] Applied fixes.');

      } catch (e) {
          console.error('[Self-Correction] Failed:', e);
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
          model: 'claude-sonnet-4-6',
          max_tokens: 8192,
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
