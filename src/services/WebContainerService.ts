import { WebContainer } from '@webcontainer/api';
import type { FileSystemTree } from '@webcontainer/api';
import { SHADCN_FILES, SHADCN_DEPENDENCIES } from '../utils/shadcnDefaults';

class WebContainerService {
  private static instance: WebContainerService;
  private webContainerInstance: WebContainer | null = null;
  private bootPromise: Promise<void> | null = null;
  private env: Record<string, string> = {};

  private constructor() {
    // Private constructor to enforce singleton
  }

  public static getInstance(): WebContainerService {
    if (!WebContainerService.instance) {
      WebContainerService.instance = new WebContainerService();
    }
    return WebContainerService.instance;
  }

  public async boot(): Promise<void> {
    if (this.webContainerInstance) {
      console.log('WebContainer already booted');
      return;
    }

    if (this.bootPromise) {
        return this.bootPromise;
    }

    this.bootPromise = (async () => {
        try {
          this.webContainerInstance = await WebContainer.boot();
          console.log('WebContainer Booted');
        } catch (error) {
          console.error('Failed to boot WebContainer:', error);
          this.bootPromise = null; // Reset promise on failure
          throw error;
        }
    })();

    return this.bootPromise;
  }

  public getContainer(): WebContainer | null {
    return this.webContainerInstance;
  }

  public async mount(fileTree: FileSystemTree) {
    if (!this.webContainerInstance) throw new Error('WebContainer not booted');
    await this.webContainerInstance.mount(fileTree);
  }

  public setEnv(env: Record<string, string>) {
    this.env = env;
  }

  public getEnv() {
    return this.env;
  }

  public async installDependencies(callback?: (data: string) => void) {
    if (!this.webContainerInstance) throw new Error('WebContainer not booted');
    const installProcess = await this.webContainerInstance.spawn('npm', ['install'], { env: this.env });

    installProcess.output.pipeTo(new WritableStream({
      write(data) {
        console.log('[npm install]', data);
        callback?.(data);
      }
    }));

    return installProcess.exit;
  }

  public async startDevServer(callback?: (data: string) => void) {
    if (!this.webContainerInstance) throw new Error('WebContainer not booted');
    const devProcess = await this.webContainerInstance.spawn('npm', ['run', 'dev'], { env: this.env });

    devProcess.output.pipeTo(new WritableStream({
      write(data) {
        console.log('[dev server]', data);
        callback?.(data);
      }
    }));

    return devProcess;
  }

  public onServerReady(callback: (port: number, url: string) => void) {
     if (!this.webContainerInstance) throw new Error('WebContainer not booted');
     this.webContainerInstance.on('server-ready', callback);
  }

  public async writeFile(path: string, content: string) {
    if (!this.webContainerInstance) throw new Error('WebContainer not booted');
    await this.webContainerInstance.fs.writeFile(path, content);
  }

  public async configureShadcn() {
    if (!this.webContainerInstance) {
        console.warn('WebContainer not booted, skipping Shadcn config');
        return;
    }
    const fs = this.webContainerInstance.fs;

    // 1. Ensure Shadcn files exist
    for (const [filePath, fileNode] of Object.entries(SHADCN_FILES)) {
      try {
        await fs.readFile(filePath);
        // File exists, skip
      } catch (error) {
        // File does not exist, create it
        const content = fileNode.file.contents;

        // Ensure directory exists
        const parts = filePath.split('/');
        if (parts.length > 1) {
            const dir = parts.slice(0, -1).join('/');
            try {
                await fs.mkdir(dir, { recursive: true });
            } catch (e) {
                // ignore
            }
        }

        await fs.writeFile(filePath, content);
        console.log(`[Shadcn] Created missing file: ${filePath}`);
      }
    }

    // 2. Ensure package.json has dependencies
    try {
      const packageJsonContent = await fs.readFile('package.json', 'utf-8');
      const packageJson = JSON.parse(packageJsonContent);
      let modified = false;

      if (!packageJson.dependencies) packageJson.dependencies = {};

      for (const [dep, version] of Object.entries(SHADCN_DEPENDENCIES)) {
        if (!packageJson.dependencies[dep] && !packageJson.devDependencies?.[dep]) {
          packageJson.dependencies[dep] = version;
          modified = true;
        }
      }

      if (modified) {
        await fs.writeFile('package.json', JSON.stringify(packageJson, null, 2));
        console.log('[Shadcn] Added missing dependencies to package.json');
      }
    } catch (error) {
      console.error('[Shadcn] Failed to update package.json:', error);
    }
  }
}

export const webContainerService = WebContainerService.getInstance();
