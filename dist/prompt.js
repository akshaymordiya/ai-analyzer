import inquirer from 'inquirer';
import chalk from 'chalk';
import { writeFileSync, readFileSync, unlinkSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { spawn } from 'child_process';
export async function runPromptFlow() {
    const { issue } = await inquirer.prompt({
        name: 'issue',
        type: 'editor',
        message: 'Paste the Jira issue title + description:',
    });
    const { logs } = await inquirer.prompt({
        name: 'logs',
        type: 'editor',
        message: 'Paste any relevant logs (stack trace, HAR error, etc.):',
    });
    const { includeDiff } = await inquirer.prompt({
        name: 'includeDiff',
        type: 'confirm',
        message: 'Do you want to include current git diff?',
    });
    return { issue, logs, includeDiff };
}
export async function promptForMSHLink() {
    const { mshLink } = await inquirer.prompt({
        name: 'mshLink',
        type: 'input',
        message: 'Enter the MSH ticket link or issue key (e.g., MSH-123):',
        validate: (input) => {
            if (!input.trim()) {
                return 'Please enter a valid MSH ticket link or issue key';
            }
            return true;
        }
    });
    return mshLink.trim();
}
export async function promptForConfiguration() {
    console.log(chalk.yellow('\n🔧 Configuration Setup\n'));
    const { baseUrl } = await inquirer.prompt({
        name: 'baseUrl',
        type: 'input',
        message: 'Enter your Jira base URL (e.g., https://yourcompany.atlassian.net):',
        validate: (input) => {
            if (!input.startsWith('http')) {
                return 'Please enter a valid URL starting with http:// or https://';
            }
            return true;
        }
    });
    const { email } = await inquirer.prompt({
        name: 'email',
        type: 'input',
        message: 'Enter your Jira email:',
        validate: (input) => {
            if (!input.includes('@')) {
                return 'Please enter a valid email address';
            }
            return true;
        }
    });
    const { apiToken } = await inquirer.prompt({
        name: 'apiToken',
        type: 'input',
        message: 'Enter your Jira API token (visible for verification):',
        validate: (input) => {
            if (input.length < 10) {
                return 'API token must be at least 10 characters long';
            }
            return true;
        }
    });
    return { baseUrl, email, apiToken };
}
export async function promptForGroqKey() {
    const { apiKey } = await inquirer.prompt({
        name: 'apiKey',
        type: 'input',
        message: 'Enter your Groq API key (starts with gsk_, visible for verification):',
        validate: (input) => {
            if (!input.startsWith('gsk_')) {
                return 'Groq API key must start with "gsk_"';
            }
            if (input.length < 20) {
                return 'API key seems too short, please check';
            }
            return true;
        }
    });
    return apiKey;
}
export async function promptForApproval(comment) {
    console.log(chalk.blue('\n📝 Generated Comment Preview:\n'));
    console.log(comment);
    console.log(chalk.yellow('\n' + '='.repeat(50) + '\n'));
    const { approved } = await inquirer.prompt({
        name: 'approved',
        type: 'confirm',
        message: 'Do you want to post this comment to Jira?',
        default: true
    });
    return approved;
}
export async function promptForModification(comment) {
    const { wantsToModify } = await inquirer.prompt([
        {
            type: 'confirm',
            name: 'wantsToModify',
            message: 'Do you want to modify the comment before posting?',
            default: false
        }
    ]);
    function extractJiraComment(raw) {
        // 1. Try to extract JSON substring if extra text/markdown is present
        let jsonStr = raw;
        const firstBrace = raw.indexOf('{');
        const lastBrace = raw.lastIndexOf('}');
        if (firstBrace !== -1 && lastBrace !== -1 && lastBrace > firstBrace) {
            jsonStr = raw.slice(firstBrace, lastBrace + 1);
        }
        // 2. Try to parse as JSON and use jiraComment if present and non-empty
        let json = null;
        try {
            json = JSON.parse(jsonStr);
        }
        catch (e) {
            // Robustly extract jiraComment as a multi-line string using regex
            // This matches "jiraComment": "..." (multi-line, greedy, handles escaped quotes)
            const match = jsonStr.match(/"jiraComment"\s*:\s*"((?:[^"\\]|\\.|\n|\r)*?)"\s*(,|\n|\r|\})/);
            if (match && match[1]) {
                // Unescape common JSON escapes
                let comment = match[1]
                    .replace(/\\n/g, '\n')
                    .replace(/\\"/g, '"')
                    .replace(/\\r/g, '')
                    .replace(/\\t/g, '  ');
                return comment.trim();
            }
            // If not found, fallback to previous logic
        }
        // If the parsed JSON is an object and has a jiraComment, return only that
        if (json && typeof json === 'object' && json.jiraComment && typeof json.jiraComment === 'string' && json.jiraComment.trim().length > 0) {
            return json.jiraComment.trim();
        }
        // If the raw string itself looks like a JSON object, but doesn't have jiraComment, fallback to extracting the largest paragraph
        if (raw.trim().startsWith('{') && raw.trim().endsWith('}')) {
            // Remove all JSON keys/values and try to extract a paragraph
            let cleaned = raw.replace(/"[^"]+"\s*:\s*([\s\S]*?)(,|$)/g, '');
            cleaned = cleaned.replace(/[\{\}\[\]"]/g, '');
            const paragraphs = cleaned.split(/\n{2,}/).map(p => p.trim()).filter(p => p.length > 20);
            if (paragraphs.length > 0) {
                return paragraphs[0];
            }
        }
        // 3. If output contains a markdown/paragraph after JSON, prefer that
        const jsonEnd = raw.lastIndexOf('}');
        if (jsonEnd !== -1 && jsonEnd < raw.length - 1) {
            const afterJson = raw.slice(jsonEnd + 1).trim();
            const paragraphs = afterJson.split(/\n{2,}/).map(p => p.trim()).filter(p => p.length > 20);
            if (paragraphs.length > 0) {
                return paragraphs[0];
            }
        }
        // 4. If code block, extract first paragraph inside
        const codeBlockMatch = raw.match(/```[a-zA-Z]*\n([\s\S]*?)```/);
        if (codeBlockMatch) {
            const inside = codeBlockMatch[1].trim();
            if (inside.length > 20) {
                return inside;
            }
        }
        // 5. Remove code blocks, JSON, meta-notes, and use first large paragraph
        let cleaned = raw.replace(/```[\s\S]*?```/g, '');
        cleaned = cleaned.replace(/Here is the analysis in the required JSON format:[\s\S]*?({[\s\S]*?})/g, '');
        cleaned = cleaned.replace(/\{[\s\S]*?\}/g, '');
        cleaned = cleaned.replace(/^[ \t]*\n/gm, '');
        const paragraphs = cleaned.split(/\n{2,}/).map(p => p.trim()).filter(p => p.length > 20);
        if (paragraphs.length > 0) {
            return paragraphs[0];
        }
        // 6. Fallback: prompt user to manually edit
        return '';
    }
    if (wantsToModify) {
        const tempFile = join(tmpdir(), `jira-comment-${Date.now()}.txt`);
        writeFileSync(tempFile, comment, 'utf8');
        let editor = process.env.EDITOR;
        let usedDefault = false;
        if (!editor) {
            if (process.platform === 'darwin') {
                editor = 'code --wait';
                usedDefault = true;
            }
            else if (process.platform === 'win32') {
                editor = 'code --wait';
                usedDefault = true;
            }
            else {
                editor = 'nano';
                usedDefault = true;
            }
        }
        if (usedDefault) {
            console.log(chalk.yellow.bold('\n💡 Tip: For best experience, set your $EDITOR to your preferred IDE (e.g., export EDITOR=\'code --wait\')'));
        }
        console.log(chalk.yellow.bold('\n✏️  Edit the comment in your IDE/editor. To save your changes, simply close the file/tab. The CLI will continue automatically.'));
        console.log(chalk.gray(`\nEditing: ${tempFile}\n`));
        return new Promise((resolve) => {
            let editorProcess;
            const editorArgs = editor.split(' ');
            const editorCmd = editorArgs[0];
            const args = [...editorArgs.slice(1), tempFile];
            editorProcess = spawn(editorCmd, args, { stdio: 'inherit' });
            editorProcess.on('close', (code) => {
                if (code === 0 || code === null) {
                    try {
                        let editedComment = readFileSync(tempFile, 'utf8');
                        try {
                            unlinkSync(tempFile);
                        }
                        catch (err) { }
                        editedComment = extractJiraComment(editedComment);
                        if (!editedComment || editedComment.trim().length === 0) {
                            console.error(chalk.red('❌ The comment is empty after processing. Aborting post. Please ensure your comment is a plain paragraph.'));
                            resolve('');
                            return;
                        }
                        resolve(editedComment.trim());
                    }
                    catch (err) {
                        console.error(chalk.red('Failed to read edited comment:'), err);
                        resolve(comment);
                    }
                }
                else {
                    console.error(chalk.red(`Editor exited with code ${code}`));
                    resolve(comment);
                }
            });
            editorProcess.on('error', (err) => {
                console.error(chalk.red(`Failed to launch editor (${editor}):`), err);
                resolve(comment);
            });
        });
    }
    // Also process the AI output if not modified
    const processed = extractJiraComment(comment);
    if (!processed || processed.trim().length === 0) {
        console.error(chalk.red('❌ The comment is empty after processing. Aborting post. Please ensure your comment is a plain paragraph.'));
        return '';
    }
    return processed;
}
