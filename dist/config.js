import { writeFileSync, readFileSync, existsSync } from 'fs';
import { join } from 'path';
import { homedir } from 'os';
// Simple file-based configuration storage
class ConfigManager {
    constructor() {
        this.config = {};
        // Store config in user's home directory
        this.configPath = join(homedir(), '.ai-debug-helper-config.json');
        this.loadConfig();
    }
    loadConfig() {
        try {
            if (existsSync(this.configPath)) {
                const data = readFileSync(this.configPath, 'utf-8');
                this.config = JSON.parse(data);
            }
            else {
                this.config = {};
            }
        }
        catch (error) {
            console.warn('Could not load config file, starting fresh');
            this.config = {};
        }
    }
    saveConfig() {
        try {
            writeFileSync(this.configPath, JSON.stringify(this.config, null, 2));
        }
        catch (error) {
            console.error('Could not save config file:', error);
        }
    }
    get(key) {
        return this.config[key];
    }
    set(key, value) {
        this.config[key] = value;
        this.saveConfig();
    }
    // Get config file path for debugging
    getConfigPath() {
        return this.configPath;
    }
}
const config = new ConfigManager();
export function getJiraConfig() {
    const jiraConfig = config.get('jira');
    if (!jiraConfig?.baseUrl || !jiraConfig?.email || !jiraConfig?.apiToken) {
        return null;
    }
    return jiraConfig;
}
export function setJiraConfig(configData) {
    config.set('jira', configData);
}
export function getGroqKey() {
    return config.get('groq.apiKey') || null;
}
export function setGroqKey(apiKey) {
    config.set('groq.apiKey', apiKey);
}
export function isConfigured() {
    return !!(getJiraConfig() && getGroqKey());
}
// Export for debugging
export function getConfigPath() {
    return config.getConfigPath();
}
