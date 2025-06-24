import { JiraClient } from './jira.js';
import { NetworkAnalyzer } from './network-analyzer.js';
import { promptForApproval, promptForModification } from './prompt.js';
import chalk from 'chalk';
import ora from 'ora';
export class MSHAnalyzer {
    constructor(config) {
        this.jiraClient = new JiraClient(config);
    }
    async analyzeTicket(issueKey) {
        const spinner = ora('Fetching Jira ticket...').start();
        try {
            // Fetch Jira issue
            const issue = await this.jiraClient.getIssue(issueKey);
            spinner.succeed(`Fetched ticket: ${issue.summary}`);
            const { analyzeMSHTicket } = await import('./ai.js');
            // Parse network logs from HAR files in attachments
            const networkLogs = [];
            const harAttachments = issue.attachments.filter((att) => att.filename.toLowerCase().endsWith('.har') ||
                att.mimeType === 'application/json');
            const harContents = [];
            let mostRecentHar = '';
            if (harAttachments.length > 0) {
                for (const attachment of harAttachments) {
                    try {
                        const content = await this.jiraClient.getAttachmentContent(attachment.id);
                        harContents.push(`Filename: ${attachment.filename}\n${content.substring(0, 10000)}`); // Truncate if too large
                        mostRecentHar = content;
                        const logs = NetworkAnalyzer.parseHARFile(content);
                        networkLogs.push(...logs);
                    }
                    catch (error) {
                        // skip
                    }
                }
            }
            // Analyze network logs to get structured error information
            let networkAnalysis = null;
            if (networkLogs.length > 0) {
                networkAnalysis = NetworkAnalyzer.analyzeNetworkLogs(networkLogs);
            }
            // Create detailed network summary for LLM
            const networkSummary = networkAnalysis ? `
NETWORK ANALYSIS SUMMARY:
${networkAnalysis.summary}

DETAILED FAILED REQUESTS ANALYSIS:
${networkAnalysis.failedRequests.map((req, index) => `
FAILED REQUEST #${index + 1}:
• URL: ${req.url}
• Method: ${req.method}
• Status Code: ${req.statusCode}
• Response Time: ${req.responseTime}ms
• Error: ${req.error || 'No specific error message'}
${req.requestHeaders ? `• Request Headers: ${JSON.stringify(req.requestHeaders, null, 2)}` : ''}
${req.requestBody ? `• Request Body: ${req.requestBody.substring(0, 500)}${req.requestBody.length > 500 ? '...' : ''}` : ''}
${req.responseBody ? `• Response Body: ${req.responseBody.substring(0, 500)}${req.responseBody.length > 500 ? '...' : ''}` : ''}
`).join('\n')}

SERVER ERRORS (5xx) - DETAILED:
${networkAnalysis.serverErrors.map((req, index) => `
SERVER ERROR #${index + 1}:
• URL: ${req.url}
• Method: ${req.method}
• Status: ${req.statusCode} (${req.statusCode === 500 ? 'Internal Server Error' : req.statusCode === 503 ? 'Service Unavailable' : req.statusCode === 502 ? 'Bad Gateway' : 'Server Error'})
• Response Time: ${req.responseTime}ms
• Likely Cause: ${req.statusCode === 500 ? 'Server-side application error or misconfiguration' : req.statusCode === 503 ? 'Server overloaded or temporarily unavailable' : 'Server infrastructure issue'}
${req.responseBody ? `• Error Response: ${req.responseBody.substring(0, 300)}${req.responseBody.length > 300 ? '...' : ''}` : ''}
`).join('\n')}

CLIENT ERRORS (4xx) - DETAILED:
${networkAnalysis.clientErrors.map((req, index) => `
CLIENT ERROR #${index + 1}:
• URL: ${req.url}
• Method: ${req.method}
• Status: ${req.statusCode} (${req.statusCode === 400 ? 'Bad Request' : req.statusCode === 401 ? 'Unauthorized' : req.statusCode === 403 ? 'Forbidden' : req.statusCode === 404 ? 'Not Found' : 'Client Error'})
• Response Time: ${req.responseTime}ms
• Likely Cause: ${req.statusCode === 400 ? 'Invalid request format or parameters' : req.statusCode === 401 ? 'Authentication required or invalid credentials' : req.statusCode === 403 ? 'Insufficient permissions' : req.statusCode === 404 ? 'Resource not found' : 'Client-side request issue'}
${req.requestBody ? `• Request Payload: ${req.requestBody.substring(0, 300)}${req.requestBody.length > 300 ? '...' : ''}` : ''}
`).join('\n')}

PATTERN ANALYSIS:
• Most Common Error: ${networkAnalysis.serverErrors.length > 0 ? `HTTP ${networkAnalysis.serverErrors[0].statusCode} (${networkAnalysis.serverErrors.length} occurrences)` : 'No server errors'}
• Longest Request: ${Math.max(...networkLogs.map(log => log.responseTime))}ms
• Average Response Time: ${Math.round(networkLogs.reduce((sum, log) => sum + log.responseTime, 0) / networkLogs.length)}ms
• Failed Request Rate: ${((networkAnalysis.failedRequests.length / networkLogs.length) * 100).toFixed(1)}%

IMMEDIATE ACTION ITEMS:
${networkAnalysis.serverErrors.length > 0 ? `
1. SERVER-SIDE INVESTIGATION REQUIRED:
   • Check server logs for the exact timestamps of these ${networkAnalysis.serverErrors.length} server errors
   • Review application error logs for stack traces or error messages
   • Verify server resource usage (CPU, memory, disk space) during these failures
   • Check if there are any recent deployments or configuration changes

2. API ENDPOINT ANALYSIS:
   • Verify the API endpoints are correctly configured and accessible
   • Check if the GraphQL queries are valid and properly formatted
   • Review API rate limits and throttling settings
   • Test the endpoints manually to reproduce the errors

3. INFRASTRUCTURE CHECKS:
   • Monitor server health and performance metrics
   • Check database connectivity and performance
   • Verify network connectivity between services
   • Review load balancer and proxy configurations
` : ''}
${networkAnalysis.clientErrors.length > 0 ? `
4. CLIENT-SIDE INVESTIGATION:
   • Review request payloads for malformed data
   • Verify authentication tokens and permissions
   • Check if API endpoints have changed or been deprecated
   • Review client-side error handling and retry logic
` : ''}
` : 'No network logs available.';
            // Phase 1: Analyze Jira issue fields + HAR files together
            const phase1Prompt = `
You are an expert Jira engineer analyzing network logs and Jira issue data to identify technical root causes. Your job is to provide evidence-based analysis based ONLY on the data provided.

JIRA ISSUE DATA:
Key: ${issue.key}
Summary: ${issue.summary}
Description: ${issue.description}

NETWORK LOGS ANALYSIS:
${networkAnalysis ? networkAnalysis.summary : 'No network logs available'}

${networkAnalysis ? `DETAILED NETWORK FINDINGS:
${networkAnalysis.detailedAnalysis || 'No detailed analysis available'}` : ''}

INSTRUCTIONS:
You are an expert Jira engineer and network debugging specialist. Your job is to INVESTIGATE and ANALYZE the actual evidence from the network logs and Jira issue, not to provide generic troubleshooting steps.

Based on the detailed network analysis, provide a comprehensive INVESTIGATION that includes:

1. ROOT CAUSE ANALYSIS: Based on the actual HTTP status codes, error messages, and request patterns in the network logs, what is the most likely technical root cause? Be specific about what the evidence shows.

2. EVIDENCE-BASED FINDINGS: What specific evidence from the network logs supports your analysis? Reference exact APIs, error codes, response times, and patterns.

3. CONTEXT FROM JIRA: How do the Jira issue details (summary, description, status, etc.) relate to the network failures? What does this tell us about the user's experience?

4. SPECIFIC INSIGHTS: What specific technical insights can you draw from the failed requests, response bodies, headers, and timing data?

5. ACTIONABLE NEXT STEPS: Based on your investigation, what are the most logical next steps need to be taken to resolve the issue? Focus on what the evidence suggests should be investigated first.

Output ONLY a JSON object with the following fields:
{
  "rootCause": "A detailed, evidence-based explanation of the root cause based on the actual HTTP status codes, error details, and request patterns found in the network logs. Reference specific APIs and error types.",
  "fixSummary": "Based on the investigation findings, what specific actions should be taken to resolve the issues identified in the network logs.",
  "testCases": ["Specific test scenarios that would verify the root cause and validate the fix based on the actual error conditions found."],
  "networkFindings": "A detailed summary of the specific evidence found in the network logs - failed APIs, their HTTP status codes, error messages, response times, and any patterns or correlations identified.",
  "networkFixSuggestions": "Based on the specific errors and patterns found, what targeted actions should be taken to resolve each type of issue identified."
}
- Output ONLY the JSON object, nothing else.
- Focus on INVESTIGATION and ANALYSIS of the actual evidence, not generic troubleshooting.
- Be specific about what the network logs and Jira data actually show.
- Provide insights that would help a developer understand what happened and why.
`;
            spinner.start('Analyzing Jira issue fields and HAR files...');
            let phase1Analysis;
            try {
                phase1Analysis = await analyzeMSHTicket(phase1Prompt);
                spinner.succeed('Jira issue fields and HAR files analyzed.');
            }
            catch (err) {
                if (err.message && err.message.includes('429')) {
                    spinner.fail('Too many requests to LLM API. Please wait and try again.');
                }
                else {
                    spinner.fail('Failed to analyze Jira issue fields and HAR files.');
                }
                throw err;
            }
            console.log(chalk.cyan.bold('\n📝 Phase 1 Analysis (Issue Fields + HAR Files):'));
            console.log(JSON.stringify(phase1Analysis, null, 2));
            // Add a longer delay between phases to respect rate limits
            console.log(chalk.yellow('\n⏳ Waiting 12 seconds before Phase 2 to respect API rate limits...'));
            await new Promise(resolve => setTimeout(resolve, 12000));
            // Phase 2: Analyze comments + generate final Jira comment
            const recentComments = (issue.comments || []).slice(-5); // last 5 comments
            const commentsText = recentComments
                .map((c) => `Author: ${c.author}\nDate: ${c.created}\n${c.body}`)
                .join('\n---\n');
            const phase2Prompt = `
PREVIOUS ANALYSIS (Phase 1):
${JSON.stringify(phase1Analysis, null, 2)}

RECENT COMMENTS (last 5):
${commentsText || 'No recent comments.'}

INSTRUCTIONS:
You are an expert Jira engineer creating a comprehensive, actionable comment for the team. Your job is to synthesize the network analysis findings and comment insights into a detailed, structured comment that helps the team understand and resolve the issue.

Create a comprehensive Jira comment that includes:

1. ROOT CAUSE ANALYSIS: Summarize the technical root cause identified from the network logs, including specific error codes, failed APIs, and evidence.

2. ERROR DETAILS: Provide specific details about the failed requests, including HTTP status codes, response times, and any patterns identified.

3. ACTIONABLE RECOMMENDATIONS: What specific technical actions should be taken to resolve the issue?

The comment should be structured, technical, and immediately actionable for the development team.

Output ONLY a JSON object with the following fields:
{
  "commentInsights": "Analysis of what the actual comment content reveals about the issue, team understanding, and progression. Reference specific comments and their implications.",
  "commentSuggestions": "Based on the comment analysis, what specific insights or actions would be most valuable for the team to consider.",
  "jiraComment": "A comprehensive, structured Jira comment that includes: 1) Root cause analysis with specific technical details from the network logs, 2) Error details including HTTP status codes and failed APIs, 3) Specific next steps and technical actions to take, 4) Actionable recommendations for resolution. The comment should be technical, evidence-based, and immediately actionable. For Actionable Recommendations, use phrases like 'To resolve this issue, we need to check...' or 'The resolution requires...' instead of 'The developer should...'"
}
- Output ONLY the JSON object, nothing else.
- The jiraComment should be comprehensive and include all the technical details from Phase 1 analysis.
- Focus on providing actionable, technical guidance based on the evidence.
- Structure the comment clearly with sections for root cause, errors, next steps, and recommendations.
- Do NOT include a "Context from Comments" section.
- Make Actionable Recommendations less directive by using "we need to" or "the resolution requires" instead of "the developer should".
`;
            spinner.start('Analyzing comments and generating final Jira comment...');
            let phase2Analysis;
            try {
                phase2Analysis = await analyzeMSHTicket(phase2Prompt);
                spinner.succeed('Comments analyzed and final Jira comment generated.');
            }
            catch (err) {
                if (err.message && err.message.includes('429')) {
                    spinner.fail('Too many requests to LLM API. Please wait and try again.');
                }
                else {
                    spinner.fail('Failed to analyze comments and generate final Jira comment.');
                }
                throw err;
            }
            // Display results
            console.log(chalk.cyan.bold('\n📝 Phase 2 Analysis (Comments + Final Comment):'));
            console.log(JSON.stringify(phase2Analysis, null, 2));
            console.log(chalk.green.bold('\n🤖 Final AI Analysis Results:'));
            console.log(chalk.cyan.bold('\n💬 Generated Jira Comment:'));
            console.log(chalk.gray('─'.repeat(50)));
            console.log(phase2Analysis.jiraComment);
            console.log(chalk.gray('─'.repeat(50)));
            // Ask for modification and then approval to post comment
            const finalComment = await promptForModification(phase2Analysis.jiraComment);
            if (!finalComment || finalComment.trim().length === 0) {
                spinner.fail('Comment is empty after processing. Aborting post.');
                console.error(chalk.red('❌ The comment is empty after processing. Please ensure your comment is a plain paragraph.'));
                return;
            }
            const approved = await promptForApproval(finalComment);
            if (approved) {
                spinner.text = 'Posting comment to Jira...';
                await this.jiraClient.addComment(issueKey, finalComment);
                spinner.succeed('Comment posted to Jira successfully!');
            }
            else {
                console.log(chalk.yellow('Comment not posted to Jira.'));
            }
        }
        catch (error) {
            spinner.fail('Analysis failed');
            console.error(chalk.red('Error:'), error);
            throw error;
        }
    }
    async analyzeTicketWithGitDiff(issueKey, gitDiff) {
        const spinner = ora('Fetching Jira ticket...').start();
        try {
            // Fetch Jira issue
            const issue = await this.jiraClient.getIssue(issueKey);
            spinner.succeed(`Fetched ticket: ${issue.summary}`);
            // Parse network logs from HAR files in attachments
            const networkLogs = [];
            const harAttachments = issue.attachments.filter((att) => att.filename.toLowerCase().endsWith('.har') ||
                att.mimeType === 'application/json');
            if (harAttachments.length > 0) {
                console.log(chalk.blue(`Found ${harAttachments.length} HAR file(s)`));
                for (const attachment of harAttachments) {
                    try {
                        const content = await this.jiraClient.getAttachmentContent(attachment.id);
                        const logs = NetworkAnalyzer.parseHARFile(content);
                        networkLogs.push(...logs);
                        console.log(chalk.green(`✓ Parsed ${logs.length} network requests from ${attachment.filename}`));
                    }
                    catch (error) {
                        console.log(chalk.yellow(`⚠ Could not parse ${attachment.filename}: ${error}`));
                    }
                }
            }
            // Analyze network logs with enhanced analysis
            let networkAnalysis = null;
            if (networkLogs.length > 0) {
                spinner.text = 'Analyzing network logs...';
                networkAnalysis = NetworkAnalyzer.analyzeNetworkLogs(networkLogs);
                spinner.succeed(`Analyzed ${networkLogs.length} network requests`);
                // Display enhanced network analysis
                console.log(chalk.cyan.bold('\n📊 Enhanced Network Analysis:'));
                console.log(networkAnalysis.summary);
                if (networkAnalysis.payloadIssues.length > 0) {
                    console.log(chalk.red('\n🚨 Specific Payload Issues:'));
                    networkAnalysis.payloadIssues.forEach(issue => {
                        console.log(chalk.red(`• ${issue.request.method} ${issue.request.url}`));
                        console.log(chalk.red(`  Issue: ${issue.issue}`));
                        console.log(chalk.yellow(`  Suggestion: ${issue.suggestion}`));
                        if (issue.codeExample) {
                            console.log(chalk.gray(`  Code Example:\n${issue.codeExample}`));
                        }
                        console.log('');
                    });
                }
                if (networkAnalysis.detailedAnalysis) {
                    console.log(chalk.cyan('\n🔍 Pattern Analysis:'));
                    console.log(networkAnalysis.detailedAnalysis);
                }
            }
            // Create enhanced MSH ticket object
            const mshTicket = {
                issue,
                attachments: issue.attachments,
                networkLogs
            };
            // Enhanced AI Analysis with git diff
            spinner.text = 'Performing enhanced AI analysis with code changes...';
            // Create enhanced prompt with git diff
            const enhancedAnalysis = await this.performEnhancedAnalysis(mshTicket, gitDiff, networkAnalysis);
            spinner.succeed('Enhanced AI analysis completed');
            // Display enhanced results
            console.log(chalk.green.bold('\n🤖 Enhanced AI Analysis Results:'));
            console.log(chalk.cyan('Root Cause:'), enhancedAnalysis.rootCause);
            console.log(chalk.cyan('Fix Summary:'), enhancedAnalysis.fixSummary);
            console.log(chalk.cyan('Confidence:'), `${enhancedAnalysis.confidence}%`);
            console.log(chalk.cyan.bold('\n💬 Enhanced Jira Comment:'));
            console.log(chalk.gray('─'.repeat(50)));
            console.log(enhancedAnalysis.jiraComment);
            console.log(chalk.gray('─'.repeat(50)));
            // Ask for modification and then approval to post comment
            const finalComment = await promptForModification(enhancedAnalysis.jiraComment);
            if (!finalComment || finalComment.trim().length === 0) {
                spinner.fail('Comment is empty after processing. Aborting post.');
                console.error(chalk.red('❌ The comment is empty after processing. Please ensure your comment is a plain paragraph.'));
                return;
            }
            const approved = await promptForApproval(finalComment);
            if (approved) {
                spinner.text = 'Posting enhanced comment to Jira...';
                await this.jiraClient.addComment(issueKey, finalComment);
                spinner.succeed('Enhanced comment posted to Jira successfully!');
            }
            else {
                console.log(chalk.yellow('Comment not posted to Jira.'));
            }
        }
        catch (error) {
            spinner.fail('Enhanced analysis failed');
            console.error(chalk.red('Error:'), error);
            throw error;
        }
    }
    async performEnhancedAnalysis(ticket, gitDiff, networkAnalysis) {
        const { analyzeMSHTicket } = await import('./ai.js');
        // Gather HAR contents
        const harAttachments = ticket.attachments.filter((att) => att.filename.toLowerCase().endsWith('.har') ||
            att.mimeType === 'application/json');
        const harContents = [];
        let mostRecentHar = '';
        for (const attachment of harAttachments) {
            if (attachment.content) {
                harContents.push(`Filename: ${attachment.filename}\n${attachment.content}`);
                mostRecentHar = attachment.content;
            }
        }
        // Gather previous comments
        const commentsText = (ticket.issue.comments || [])
            .map((c) => `Author: ${c.author}\nDate: ${c.created}\n${c.body}`)
            .join('\n---\n');
        // Build the full prompt for the LLM
        const prompt = `
JIRA ISSUE DETAILS:
Key: ${ticket.issue.key}
Summary: ${ticket.issue.summary}
Description: ${ticket.issue.description}
Status: ${ticket.issue.status}
Priority: ${ticket.issue.priority}
Assignee: ${ticket.issue.assignee}
Reporter: ${ticket.issue.reporter}
Created: ${ticket.issue.created}
Updated: ${ticket.issue.updated}

PREVIOUS COMMENTS:
${commentsText || 'No previous comments.'}

HAR FILES (most recent last):
${harContents.length > 0 ? harContents.join('\n\n') : 'No HAR files attached.'}

NETWORK ANALYSIS SUMMARY:
${networkAnalysis ? networkAnalysis.summary : 'No network analysis available.'}

GIT DIFF (if any):
${gitDiff || 'No git diff provided.'}

INSTRUCTIONS:
You are an expert Jira engineer. Analyze the above Jira issue, its attachments (including all HAR files, using the most recent for the main verdict), all previous comments, and any attached video files if possible. Output ONLY a JSON object with the following fields:
{
  "rootCause": "A detailed, specific, and technical explanation of the most likely root cause(s).",
  "fixSummary": "A step-by-step summary of the recommended fix.",
  "testCases": ["A list of specific test cases to verify the fix."],
  "jiraComment": "A full, ready-to-post Jira comment. It should be structured, specific, and human-like, referencing all failed API calls, previous comments, and relevant attachments."
}
- In the Error Analysis and Root Cause sections of jiraComment, enumerate every failed API call found in the logs, including HTTP method, full URL, status code, response time, and a brief error description. Use a bullet or numbered list if there is more than one failure. Do NOT summarize or omit any failures.
- If logs are missing, state this and suggest what information needs to be collected.
- If logs are present, base your entire analysis on the logs. Quote relevant URLs, status codes, and response snippets.
- Reference previous comments and video attachments if relevant.
- Output ONLY the JSON object, nothing else.
`;
        // Perform the analysis
        return await analyzeMSHTicket(prompt);
    }
    async searchMSHIssues(query) {
        const spinner = ora('Searching MSH issues...').start();
        try {
            const jql = query ? `project = MSH AND ${query}` : 'project = MSH ORDER BY created DESC';
            const issues = await this.jiraClient.searchMSHIssues(jql);
            spinner.succeed(`Found ${issues.length} MSH issues`);
            console.log(chalk.blue('\n📋 MSH Issues:\n'));
            issues.forEach((issue) => {
                console.log(chalk.green(`${issue.key}:`), issue.summary);
                console.log(chalk.gray(`  Status: ${issue.status} | Priority: ${issue.priority} | Reporter: ${issue.reporter}`));
                console.log('');
            });
        }
        catch (error) {
            spinner.fail('Search failed');
            console.error(chalk.red('Error:'), error);
            throw error;
        }
    }
}
