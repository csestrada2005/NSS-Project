import { Octokit } from '@octokit/rest';
import type { FileSystemTree } from '@webcontainer/api';
import { webContainerService } from './WebContainerService';

export class GitHubService {
  private octokit: Octokit | null = null;

  private getOctokit() {
    // Always refresh env in case secrets changed
    const env = webContainerService.getEnv() || {};
    const token = env.GITHUB_TOKEN;
    if (!token) {
      // Fallback to localStorage if not in memory service (e.g. refresh)
      const stored = localStorage.getItem('secrets');
      if (stored) {
          try {
              const secrets = JSON.parse(stored);
              const ghSecret = secrets.find((s: any) => s.key === 'GITHUB_TOKEN');
              if (ghSecret) return new Octokit({ auth: ghSecret.value });
          } catch (e) {}
      }
      throw new Error('GITHUB_TOKEN not found in secrets. Please add it in Settings.');
    }

    if (!this.octokit) {
        this.octokit = new Octokit({ auth: token });
    }
    return this.octokit;
  }

  async pushToRepo(repoName: string, branch: string, fileTree: FileSystemTree, message: string = 'Update from Open Lovable Builder') {
    const octokit = this.getOctokit();
    const [owner, repo] = repoName.split('/');
    if (!owner || !repo) {
      throw new Error('Invalid repository name. Format: username/repo');
    }

    // 1. Get the latest commit SHA
    let latestCommitSha: string;
    let baseTreeSha: string;
    try {
        const ref = await octokit.git.getRef({
            owner,
            repo,
            ref: `heads/${branch}`,
        });
        latestCommitSha = ref.data.object.sha;

        const commit = await octokit.git.getCommit({
            owner,
            repo,
            commit_sha: latestCommitSha,
        });
        baseTreeSha = commit.data.tree.sha;
    } catch (e: any) {
        // Handle case where branch doesn't exist? For now, error out.
        // Users should create the repo/branch first usually, or we can implement branch creation.
        throw new Error(`Branch ${branch} not found or access denied. Error: ${e.message}`);
    }

    // 2. Create blobs for each file
    const treeItems: { path: string; mode: '100644'; type: 'blob'; sha: string }[] = [];

    const processDirectory = async (currentPath: string, tree: FileSystemTree) => {
        for (const [name, node] of Object.entries(tree)) {
             const fullPath = currentPath ? `${currentPath}/${name}` : name;

             // Skip node_modules and .git
             if (name === 'node_modules' || name === '.git') continue;

             if ('file' in node) {
                 const content = (node as any).file.contents;
                 const blob = await octokit.git.createBlob({
                    owner,
                    repo,
                    content: typeof content === 'string' ? content : new TextDecoder().decode(content),
                    encoding: 'utf-8',
                 });
                 treeItems.push({
                    path: fullPath,
                    mode: '100644',
                    type: 'blob',
                    sha: blob.data.sha,
                 });
             } else if ('directory' in node) {
                 await processDirectory(fullPath, (node as any).directory);
             }
        }
    };

    await processDirectory('', fileTree);

    // 3. Create a new tree
    const newTree = await octokit.git.createTree({
        owner,
        repo,
        base_tree: baseTreeSha,
        tree: treeItems,
    });

    // 4. Create a commit
    const newCommit = await octokit.git.createCommit({
        owner,
        repo,
        message,
        tree: newTree.data.sha,
        parents: [latestCommitSha],
    });

    // 5. Update the branch reference
    await octokit.git.updateRef({
        owner,
        repo,
        ref: `heads/${branch}`,
        sha: newCommit.data.sha,
    });

    return newCommit.data.html_url;
  }
}

export const gitHubService = new GitHubService();
