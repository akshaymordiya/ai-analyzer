#!/usr/bin/env node
import { Command } from 'commander';
import chalk from 'chalk';
import { MSHAnalyzer } from './msh-analyzer.js';
import { getJiraConfig, setJiraConfig, getGroqKey, setGroqKey, isConfigured, getConfigPath } from './config.js';
import { promptForMSHLink, promptForConfiguration, promptForGroqKey } from './prompt.js';
import { runPromptFlow } from './prompt.js';
import { getGitDiff } from './git.js';
import { analyzeWithAI } from './ai.js';
import { copyToClipboard } from './utils.js';
const program = new Command();
program
    .name('ai-debug-helper')
    .description('AI-powered CLI tool for analyzing MSH tickets and network logs from Jira (using Groq LLM)')
    .version('1.0.0');
// Status command
program
    .command('status')
    .description('Check configuration status')
    .action(() => {
    console.log(chalk.blueBright('\n🔍 Configuration Status\n'));
    const jiraConfig = getJiraConfig();
    const groqKey = getGroqKey();
    const envGroqKey = process.env.GROQ_API_KEY;
    const configPath = getConfigPath();
    console.log(chalk.cyan('Config File:'));
    console.log(chalk.gray('  Location:'), configPath);
    console.log(chalk.cyan('\nJira Configuration:'));
    if (jiraConfig) {
        console.log(chalk.green('  ✅ Base URL:'), jiraConfig.baseUrl);
        console.log(chalk.green('  ✅ Email:'), jiraConfig.email);
        console.log(chalk.green('  ✅ API Token:'), jiraConfig.apiToken.substring(0, 10) + '...');
    }
    else {
        console.log(chalk.red('  ❌ Not configured'));
    }
    console.log(chalk.cyan('\nGroq API Key:'));
    if (groqKey) {
        console.log(chalk.green('  ✅ Stored in config:'), groqKey.substring(0, 10) + '...');
    }
    else {
        console.log(chalk.red('  ❌ Not stored in config'));
    }
    if (envGroqKey) {
        console.log(chalk.green('  ✅ Environment variable:'), envGroqKey.substring(0, 10) + '...');
    }
    else {
        console.log(chalk.red('  ❌ Environment variable not set'));
    }
    console.log(chalk.cyan('\nOverall Status:'));
    if (isConfigured()) {
        console.log(chalk.green('  ✅ Ready to use!'));
        console.log(chalk.gray('  Run "ai-debug-helper analyze MSH-123" to start'));
    }
    else {
        console.log(chalk.red('  ❌ Configuration incomplete'));
        console.log(chalk.gray('  Run "ai-debug-helper configure" to set up'));
    }
    console.log('');
});
// Configure command
program
    .command('configure')
    .description('Configure Jira and Groq credentials')
    .action(async () => {
    console.log(chalk.blueBright('\n🔧 AI Debug Helper Configuration\n'));
    try {
        console.log(chalk.yellow('Setting up Jira credentials...'));
        const jiraConfig = await promptForConfiguration();
        setJiraConfig(jiraConfig);
        console.log(chalk.green('✅ Jira configuration saved'));
        console.log(chalk.yellow('\nSetting up Groq API key...'));
        const groqKey = await promptForGroqKey();
        setGroqKey(groqKey);
        console.log(chalk.green('✅ Groq API key saved'));
        console.log(chalk.green('\n🎉 Configuration completed successfully!'));
        console.log(chalk.yellow('\n💡 Note: For persistent Groq API key, also run:'));
        console.log(chalk.gray('   export GROQ_API_KEY="your_key_here"'));
        console.log(chalk.gray('   Or use: ./setup-env.sh'));
        // Show status after configuration
        console.log(chalk.cyan('\n📊 Current Configuration Status:'));
        const jiraConfigCheck = getJiraConfig();
        const groqKeyCheck = getGroqKey();
        if (jiraConfigCheck) {
            console.log(chalk.green('  ✅ Jira:'), jiraConfigCheck.baseUrl);
        }
        if (groqKeyCheck) {
            console.log(chalk.green('  ✅ Groq:'), groqKeyCheck.substring(0, 10) + '...');
        }
        console.log(chalk.gray('\n💡 Run "ai-debug-helper status" to verify configuration'));
    }
    catch (error) {
        console.error(chalk.red('Configuration failed:'), error);
    }
});
// Analyze MSH ticket command
program
    .command('analyze')
    .description('Analyze an MSH ticket with AI (using Groq LLM)')
    .argument('[msh-link]', 'MSH ticket link or issue key (e.g., MSH-123)')
    .action(async (mshLink) => {
    console.log(chalk.blueBright('\n🔍 MSH Ticket Analyzer (Groq LLM)\n'));
    if (!isConfigured()) {
        console.log(chalk.red('❌ Configuration required. Run "ai-debug-helper configure" first.'));
        console.log(chalk.gray('Or check status with: ai-debug-helper status'));
        return;
    }
    try {
        const config = getJiraConfig();
        const analyzer = new MSHAnalyzer(config);
        const ticketLink = mshLink || await promptForMSHLink();
        await analyzer.analyzeTicket(ticketLink);
    }
    catch (error) {
        console.error(chalk.red('Analysis failed:'), error);
    }
});
// Search MSH issues command
program
    .command('search')
    .description('Search MSH issues')
    .argument('[query]', 'JQL query to filter issues')
    .action(async (query) => {
    console.log(chalk.blueBright('\n🔍 MSH Issue Search\n'));
    if (!isConfigured()) {
        console.log(chalk.red('❌ Configuration required. Run "ai-debug-helper configure" first.'));
        console.log(chalk.gray('Or check status with: ai-debug-helper status'));
        return;
    }
    try {
        const config = getJiraConfig();
        const analyzer = new MSHAnalyzer(config);
        await analyzer.searchMSHIssues(query);
    }
    catch (error) {
        console.error(chalk.red('Search failed:'), error);
    }
});
// Legacy debug command (original functionality)
program
    .command('debug')
    .description('Legacy debug mode - analyze issues manually (using Groq LLM)')
    .action(async () => {
    console.log(chalk.blueBright('\n🔍 AI Debug Helper CLI (Legacy Mode - Groq LLM)\n'));
    if (!getGroqKey()) {
        console.log(chalk.red('❌ Groq API key required. Run "ai-debug-helper configure" first.'));
        console.log(chalk.gray('Or check status with: ai-debug-helper status'));
        return;
    }
    const context = await runPromptFlow();
    let diff = '';
    if (context.includeDiff) {
        diff = await getGitDiff();
    }
    const aiResult = await analyzeWithAI(context.issue, context.logs, diff);
    console.log(chalk.greenBright('\n✅ AI Suggestion:\n'));
    console.log(aiResult);
    await copyToClipboard(aiResult);
    console.log(chalk.yellow('\n📝 Copied to clipboard. Paste it in Jira.\n'));
});
// Default command - show help
program
    .action(() => {
    console.log(chalk.blueBright('\n🔍 AI Debug Helper CLI (Groq LLM)\n'));
    console.log(chalk.yellow('Welcome to the AI-powered MSH ticket analyzer using Groq LLM!'));
    console.log(chalk.gray('\nAvailable commands:'));
    console.log(chalk.cyan('  status     - Check configuration status'));
    console.log(chalk.cyan('  configure  - Set up Jira and Groq credentials'));
    console.log(chalk.cyan('  analyze    - Analyze an MSH ticket with AI'));
    console.log(chalk.cyan('  search     - Search MSH issues'));
    console.log(chalk.cyan('  debug      - Legacy debug mode'));
    console.log(chalk.gray('\nRun "ai-debug-helper --help" for more information.\n'));
});
program.parse();
