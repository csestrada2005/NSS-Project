export class ContextService {
  private static instance: ContextService;

  private constructor() {}

  public static getInstance(): ContextService {
    if (!ContextService.instance) {
      ContextService.instance = new ContextService();
    }
    return ContextService.instance;
  }

  public async fetchDocumentation(url: string): Promise<string> {
    try {
      const response = await fetch(`/api/proxy?url=${encodeURIComponent(url)}`);
      if (!response.ok) {
        throw new Error(`Failed to fetch documentation: ${response.statusText}`);
      }
      return await response.text();
    } catch (error) {
      console.error('ContextService Error:', error);
      return '';
    }
  }
}

export const contextService = ContextService.getInstance();
