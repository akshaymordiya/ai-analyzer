import chalk from 'chalk';
import { getGroqKey } from './config.js';
// Groq API client (OpenAI-compatible)
class GroqClient {
    constructor(apiKey) {
        this.apiKey = apiKey;
        this.baseURL = 'https://api.groq.com/openai/v1';
    }
    async createChatCompletion(params) {
        const response = await fetch(`${this.baseURL}/chat/completions`, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${this.apiKey}`,
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                model: params.model,
                messages: params.messages,
                temperature: params.temperature || 0.1,
                max_tokens: params.max_tokens || 4000,
            })
        });
        if (!response.ok) {
            throw new Error(`Groq API error: ${response.status} ${response.statusText}`);
        }
        const content = await response.text();
        try {
            const result = this.parseJsonFromResponse(content);
            return result;
        }
        catch (error) {
            throw new Error(`Failed to parse JSON from response: ${error.message}`);
        }
    }
    parseJsonFromResponse(content) {
        console.log(chalk.blue('🔍 DEBUG: Content starts with { and ends with }:'), content.startsWith('{'), content.endsWith('}'));
        console.log(chalk.blue('🔍 DEBUG: Content length:'), content.length);
        console.log(chalk.blue('🔍 DEBUG: Content preview:'), content.substring(0, 100));
        // Extract the actual JSON content from the response
        const jsonContent = this.extractJsonContent(content);
        if (!jsonContent) {
            console.log(chalk.red('\n❌ No JSON content found. Raw LLM output:'));
            console.log(chalk.gray('─'.repeat(50)));
            console.log(content);
            console.log(chalk.gray('─'.repeat(50)));
            throw new Error(`No JSON content found in response. Raw output shown above.`);
        }
        console.log(chalk.blue('🔍 DEBUG: Extracted JSON content length:'), jsonContent.length);
        console.log(chalk.blue('🔍 DEBUG: Extracted JSON preview:'), jsonContent.substring(0, 100));
        // Try multiple parsing strategies
        const parsingStrategies = [
            () => this.parseWithStrategy1(jsonContent),
            () => this.parseWithStrategy2(jsonContent),
            () => this.parseWithStrategy3(jsonContent),
            () => this.parseWithStrategy4(jsonContent),
            () => this.parseWithStrategy5(jsonContent)
        ];
        for (let i = 0; i < parsingStrategies.length; i++) {
            try {
                console.log(chalk.yellow(`🔧 DEBUG: Trying parsing strategy ${i + 1}`));
                const result = parsingStrategies[i]();
                if (result) {
                    console.log(chalk.green(`✅ DEBUG: Parsing strategy ${i + 1} succeeded`));
                    return this.normalizeJiraComment(result);
                }
            }
            catch (error) {
                console.log(chalk.red(`❌ DEBUG: Parsing strategy ${i + 1} failed:`, error.message));
            }
        }
        // If all strategies fail, show the raw output for debugging
        console.log(chalk.red('\n❌ All parsing strategies failed. Raw LLM output:'));
        console.log(chalk.gray('─'.repeat(50)));
        console.log(content);
        console.log(chalk.gray('─'.repeat(50)));
        throw new Error(`All JSON parsing strategies failed. Raw output shown above.`);
    }
    extractJsonContent(content) {
        // Strategy 1: Find JSON between first { and last }
        const firstBrace = content.indexOf('{');
        const lastBrace = content.lastIndexOf('}');
        if (firstBrace !== -1 && lastBrace !== -1 && lastBrace > firstBrace) {
            return content.substring(firstBrace, lastBrace + 1);
        }
        // Strategy 2: Use regex to find JSON object
        const jsonMatch = content.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
            return jsonMatch[0];
        }
        return null;
    }
    parseWithStrategy1(jsonContent) {
        // Strategy 1: Direct JSON parse
        return JSON.parse(jsonContent);
    }
    parseWithStrategy2(jsonContent) {
        // Strategy 2: Remove problematic characters and parse
        let sanitized = jsonContent
            .replace(/[\u0000-\u001F\u007F-\u009F]/g, '') // Remove control characters
            .replace(/\n\s*/g, ' ') // Replace newlines with spaces
            .replace(/\r/g, '') // Remove carriage returns
            .replace(/\t/g, ' ') // Replace tabs with spaces
            .replace(/\s+/g, ' ') // Normalize whitespace
            .trim();
        return JSON.parse(sanitized);
    }
    parseWithStrategy3(jsonContent) {
        // Strategy 3: Fix common LLM formatting issues
        let fixed = jsonContent
            .replace(/,\s*}/g, '}') // Remove trailing commas
            .replace(/,\s*]/g, ']') // Remove trailing commas in arrays
            .replace(/"\s*\n\s*"/g, '" "') // Fix broken strings
            .replace(/"\s*,\s*\n\s*"/g, '", "') // Fix broken arrays
            .replace(/\n\s*"/g, ' "') // Fix line breaks before quotes
            .replace(/"\s*\n\s*:/g, '":') // Fix line breaks before colons
            .replace(/:\s*\n\s*"/g, ': "') // Fix line breaks after colons
            .replace(/\n\s*}/g, '}') // Fix line breaks before closing braces
            .replace(/\n\s*]/g, ']') // Fix line breaks before closing brackets
            .replace(/{\s*\n\s*"/g, '{"') // Fix line breaks after opening braces
            .replace(/\[\s*\n\s*"/g, '["') // Fix line breaks after opening brackets
            .trim();
        return JSON.parse(fixed);
    }
    parseWithStrategy4(jsonContent) {
        // Strategy 4: Extract and parse individual fields manually
        const result = {};
        // Extract commentInsights
        const commentInsightsMatch = jsonContent.match(/"commentInsights"\s*:\s*"([^"]*(?:\\"[^"]*)*)"/);
        if (commentInsightsMatch) {
            result.commentInsights = commentInsightsMatch[1].replace(/\\"/g, '"');
        }
        // Extract commentSuggestions
        const commentSuggestionsMatch = jsonContent.match(/"commentSuggestions"\s*:\s*"([^"]*(?:\\"[^"]*)*)"/);
        if (commentSuggestionsMatch) {
            result.commentSuggestions = commentSuggestionsMatch[1].replace(/\\"/g, '"');
        }
        // Extract jiraComment (handle both string and object formats)
        const jiraCommentMatch = jsonContent.match(/"jiraComment"\s*:\s*(\{[^}]*\}|"[^"]*(?:\\"[^"]*)*")/);
        if (jiraCommentMatch) {
            const jiraCommentContent = jiraCommentMatch[1];
            if (jiraCommentContent.startsWith('{')) {
                // It's an object, try to parse it
                try {
                    result.jiraComment = JSON.parse(jiraCommentContent);
                }
                catch {
                    // If parsing fails, treat it as a string
                    result.jiraComment = jiraCommentContent.replace(/[{}"]/g, '').trim();
                }
            }
            else {
                // It's a string
                result.jiraComment = jiraCommentContent.replace(/"/g, '').replace(/\\"/g, '"');
            }
        }
        return Object.keys(result).length > 0 ? result : null;
    }
    parseWithStrategy5(jsonContent) {
        // Strategy 5: Last resort - try to fix the most common issues and parse
        let fixed = jsonContent
            .replace(/[\u0000-\u001F\u007F-\u009F]/g, '') // Remove all control characters
            .replace(/\n/g, '\\n') // Escape newlines
            .replace(/\r/g, '\\r') // Escape carriage returns
            .replace(/\t/g, '\\t') // Escape tabs
            .replace(/\\n\s*\\n/g, '\\n') // Fix double newlines
            .replace(/\\n\s*"/g, '\\n"') // Fix newlines before quotes
            .replace(/\\n\s*}/g, '}') // Fix newlines before closing braces
            .replace(/\\n\s*]/g, ']') // Fix newlines before closing brackets
            .replace(/\\n\s*,\s*}/g, '}') // Fix newlines before trailing commas
            .replace(/\\n\s*,\s*]/g, ']') // Fix newlines before trailing commas in arrays
            .trim();
        return JSON.parse(fixed);
    }
    normalizeJiraComment(result) {
        // If jiraComment is an object, convert it to a formatted string
        if (result.jiraComment && typeof result.jiraComment === 'object') {
            console.log(chalk.yellow('🔧 DEBUG: Converting jiraComment object to formatted string'));
            const sections = [];
            for (const [key, value] of Object.entries(result.jiraComment)) {
                if (typeof value === 'string' && value.trim()) {
                    sections.push(`**${key}:**\n${value.trim()}`);
                }
            }
            result.jiraComment = sections.join('\n\n');
            console.log(chalk.green('✅ DEBUG: jiraComment converted to formatted string'));
        }
        return result;
    }
}
// Retry configuration
const MAX_RETRIES = 3;
const BASE_DELAY = 2000; // 2 seconds
const MAX_DELAY = 30000; // 30 seconds
// Helper function to delay execution
const delay = (ms) => new Promise(resolve => setTimeout(resolve, ms));
// Helper function to calculate exponential backoff delay
const getBackoffDelay = (attempt) => {
    const delay = Math.min(BASE_DELAY * Math.pow(2, attempt), MAX_DELAY);
    return delay + Math.random() * 1000; // Add jitter
};
export async function analyzeMSHTicket(prompt) {
    const apiKey = process.env.GROQ_API_KEY || getGroqKey();
    if (!apiKey) {
        throw new Error('Groq API key not found. Set GROQ_API_KEY environment variable or run "ai-debug-helper configure"');
    }
    const groq = new GroqClient(apiKey);
    let lastError;
    for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
        try {
            // Add a small delay between attempts to respect rate limits
            if (attempt > 0) {
                const backoffDelay = getBackoffDelay(attempt - 1);
                console.log(chalk.yellow(`⚠️  Retrying in ${Math.round(backoffDelay / 1000)} seconds... (attempt ${attempt + 1}/${MAX_RETRIES + 1})`));
                await delay(backoffDelay);
            }
            const response = await groq.createChatCompletion({
                messages: [
                    {
                        role: 'system',
                        content: 'You are an expert Jira engineer and debugging specialist. Analyze the provided data and provide actionable insights.'
                    },
                    {
                        role: 'user',
                        content: prompt
                    }
                ],
                model: 'llama3-8b-8192',
                temperature: 0.1,
                max_tokens: 4000
            });
            const content = response.choices[0]?.message?.content;
            if (!content) {
                throw new Error('No content received from Groq API');
            }
            // Use the robust JSON parsing system
            const groqClient = new GroqClient(apiKey);
            return groqClient.parseJsonFromResponse(content);
        }
        catch (error) {
            lastError = error;
            // If it's a 429 error and we haven't exceeded max retries, continue to retry
            if (error.message && error.message.includes('429') && attempt < MAX_RETRIES) {
                continue;
            }
            // For other errors or if we've exceeded retries, throw immediately
            throw error;
        }
    }
    // If we get here, all retries failed
    throw lastError;
}
function generateDetailedErrorAnalysis(logs) {
    if (logs.length === 0)
        return 'No network logs available';
    const failedRequests = logs.filter(log => log.statusCode >= 400);
    if (failedRequests.length === 0)
        return 'No failed requests found';
    let analysis = '';
    // Group by status code
    const statusGroups = {};
    failedRequests.forEach(log => {
        if (!statusGroups[log.statusCode]) {
            statusGroups[log.statusCode] = [];
        }
        statusGroups[log.statusCode].push(log);
    });
    Object.entries(statusGroups).forEach(([status, requests]) => {
        analysis += `\nHTTP ${status} Errors (${requests.length} requests):\n`;
        requests.forEach(req => {
            analysis += `• ${req.method} ${req.url}\n`;
            analysis += `  Response Time: ${req.responseTime}ms\n`;
            if (req.responseBody) {
                analysis += `  Error Response: ${req.responseBody.substring(0, 200)}${req.responseBody.length > 200 ? '...' : ''}\n`;
            }
            if (req.requestBody) {
                analysis += `  Request Payload: ${req.requestBody.substring(0, 200)}${req.requestBody.length > 200 ? '...' : ''}\n`;
            }
            analysis += '\n';
        });
    });
    return analysis;
}
function generateFailedRequestsDetails(logs) {
    const failedRequests = logs.filter(log => log.statusCode >= 400);
    if (failedRequests.length === 0)
        return 'No failed requests found';
    let details = '';
    failedRequests.forEach((log, index) => {
        details += `\nFailed Request ${index + 1}:\n`;
        details += `URL: ${log.url}\n`;
        details += `Method: ${log.method}\n`;
        details += `Status: ${log.statusCode}\n`;
        details += `Response Time: ${log.responseTime}ms\n`;
        if (log.requestHeaders) {
            const contentType = log.requestHeaders['content-type'] || log.requestHeaders['Content-Type'];
            if (contentType) {
                details += `Content-Type: ${contentType}\n`;
            }
        }
        if (log.requestBody) {
            details += `Request Body: ${log.requestBody}\n`;
        }
        if (log.responseBody) {
            details += `Response Body: ${log.responseBody}\n`;
        }
        details += '\n';
    });
    return details;
}
export async function analyzeWithAI(issue, logs, diff) {
    // Try environment variable first, then config
    const apiKey = process.env.GROQ_API_KEY || getGroqKey();
    if (!apiKey) {
        throw new Error('Groq API key not found. Set GROQ_API_KEY environment variable or run "ai-debug-helper configure"');
    }
    const groq = new GroqClient(apiKey);
    const prompt = `
You are an expert software engineer helping to debug Jira issues. Always return your answer as a JSON object with the following fields:
- rootCause: a concise, specific root cause analysis
- fixSummary: a concise, actionable fix or next steps (string or array)
- testCases: a list of test scenarios to verify the fix
- confidence: a number from 0-100 indicating your confidence in the analysis

Do NOT include any extra notes, markdown, or formatting. Only output the JSON object.

Here's the Jira issue:
"""
${issue}
"""

Here are the related logs:
"""
${logs}
"""

Here is the git diff (if any):
"""
${diff}
"""
`;
    try {
        const completion = await groq.createChatCompletion({
            messages: [{ role: 'user', content: prompt }],
            model: 'llama3-8b-8192',
            temperature: 0.2,
            max_tokens: 2000
        });
        return completion.choices[0].message.content || '';
    }
    catch (error) {
        console.error(chalk.red('Error in AI analysis:'), error);
        throw new Error('Failed to analyze with AI');
    }
}
