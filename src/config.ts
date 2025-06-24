import { JiraConfig } from './types.js';
import { writeFileSync, readFileSync, existsSync } from 'fs';
import { join } from 'path';
import { homedir } from 'os';

// Simple file-based configuration storage
class ConfigManager {
  private configPath: string;
  private config: Record<string, any> = {};

  constructor() {
    // Store config in user's home directory
    this.configPath = join(homedir(), '.ai-debug-helper-config.json');
    this.loadConfig();
  }

  private loadConfig(): void {
    try {
      if (existsSync(this.configPath)) {
        const data = readFileSync(this.configPath, 'utf-8');
        this.config = JSON.parse(data);
      } else {
        this.config = {};
      }
    } catch (error) {
      console.warn('Could not load config file, starting fresh');
      this.config = {};
    }
  }

  private saveConfig(): void {
    try {
      writeFileSync(this.configPath, JSON.stringify(this.config, null, 2));
    } catch (error) {
      console.error('Could not save config file:', error);
    }
  }

  get(key: string): any {
    return this.config[key];
  }

  set(key: string, value: any): void {
    this.config[key] = value;
    this.saveConfig();
  }

  // Get config file path for debugging
  getConfigPath(): string {
    return this.configPath;
  }
}

const config = new ConfigManager();

export function getJiraConfig(): JiraConfig | null {
  const jiraConfig = config.get('jira') as JiraConfig;
  if (!jiraConfig?.baseUrl || !jiraConfig?.email || !jiraConfig?.apiToken) {
    return null;
  }
  return jiraConfig;
}

export function setJiraConfig(configData: JiraConfig): void {
  config.set('jira', configData);
}

export function getGroqKey(): string | null {
  return config.get('groq.apiKey') as string || null;
}

export function setGroqKey(apiKey: string): void {
  config.set('groq.apiKey', apiKey);
}

export function isConfigured(): boolean {
  return !!(getJiraConfig() && getGroqKey());
}

// Export for debugging
export function getConfigPath(): string {
  return config.getConfigPath();
} 