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

    const systemPrompt = "You are an expert Senior React Engineer. You must output a valid JSON object containing a 'modifiedFiles' array. Do not include markdown formatting (```json) or conversational text. JSON only.";

    const userMessage = `User request: ${input}\n\nThe current file structure is:\n${context}`;

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
      }

      return newTree;
    } catch (error) {
      console.error('Error parsing AI response:', error);
      return null;
    }
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
