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

CRITICAL INSTRUCTIONS:
You are an expert Jira engineer and application debugging specialist. Your job is to INVESTIGATE and ANALYZE both network failures AND data/content from the network logs.

⚠️ IMPORTANT RULES:
1. FIRST PRIORITY: Identify and analyze any API failures (4xx/5xx status codes) - these are critical issues
2. SECOND PRIORITY: Analyze data content for UI state issues (permission flags, feature flags, empty data)
3. IGNORE response times for successful requests (status 200-299) - these don't cause UI issues
4. Be specific about what data actually causes UI issues
5. If no API failures AND no relevant data patterns found, say "All network calls look good - issue likely in application logic or data processing."

Based on the detailed network analysis, provide a comprehensive INVESTIGATION that includes:

1. API FAILURE ANALYSIS: Are there any failed API calls (4xx/5xx status codes)? If yes, analyze:
   - Specific error codes and their meanings
   - Failed endpoints and their purpose
   - Error messages in response bodies
   - Patterns across multiple failures

2. DATA CONTENT ANALYSIS: What specific data is being returned by the successful API calls? Look for:
   - Data that might cause UI elements to be disabled (empty arrays, null values, false flags)
   - Business logic conditions that affect UI state
   - Missing or incomplete data that could cause functionality issues
   - Permission flags, feature flags, or configuration settings

3. UI STATE IMPLICATIONS: Based on the data returned, what would be the expected UI behavior? Consider:
   - What conditions would cause buttons to be disabled/grayed out?
   - What data patterns would indicate a "loading" or "error" state?
   - What business rules might be affecting the UI state?

4. EVIDENCE-BASED FINDINGS: What specific evidence from the network logs supports your analysis? Reference exact APIs, error codes, data patterns, and content that explains the observed behavior.

5. CONTEXT FROM JIRA: How do the Jira issue details (summary, description, status, etc.) relate to the network failures and data being returned? What does this tell us about the user's experience and expectations?

6. BUSINESS LOGIC ANALYSIS: Based on the API responses, what business rules or conditions might be causing the reported issue? Look for:
   - Permission/authorization data that might restrict functionality
   - Configuration data that might disable features
   - State data that might indicate why certain actions are unavailable

7. ACTIONABLE NEXT STEPS: Based on your analysis, what specific investigation should be done? Prioritize:
   - First: Fix any API failures identified
   - Then: Investigate data processing and business logic
   - Finally: Check application code for UI state handling

Output ONLY a JSON object with the following fields:
{
  "apiFailureAnalysis": "Analysis of any failed API calls (4xx/5xx status codes), including specific error codes, failed endpoints, and error patterns. If no failures, state 'No API failures detected.'",
  "dataAnalysis": "A detailed analysis of the actual data/content returned by the APIs, focusing on what the data contains and how it might affect UI state. Reference specific response bodies and data patterns. If no relevant patterns found, state 'No obvious data patterns that would cause UI issues detected.'",
  "uiStateAnalysis": "Analysis of how the returned data would affect UI behavior, including conditions that might cause buttons to be disabled or features to be unavailable. Be specific about what data actually controls UI state.",
  "businessLogicInsights": "Insights about business rules, permissions, or configuration that might be affecting the application's behavior based on the data returned.",
  "evidenceFromData": "Specific evidence from the API response data that supports the analysis, including exact data patterns, values, or content that explains the observed behavior.",
  "investigationSteps": "Specific steps to investigate the root cause, prioritizing API failures first, then data validation, business logic verification, and configuration checks.",
  "codeInvestigationAreas": "Specific areas in the application code that should be examined based on the analysis, such as error handling, permission checks, feature flags, or business logic conditions."
}
- Output ONLY the JSON object, nothing else.
- PRIORITIZE API failures over data analysis - if there are 4xx/5xx errors, focus on those first
- Focus on DATA ANALYSIS and BUSINESS LOGIC for successful requests, not network performance
- Be specific about what the response data actually contains and how it affects the application
- If no API failures AND no relevant data patterns are found, clearly state that the issue is likely in application logic, not network data
- Provide insights that would help a developer understand what is causing the issue and where to look in the code
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

CRITICAL INSTRUCTIONS:
You are an expert Jira engineer creating a comprehensive, actionable comment for the team. Your job is to synthesize the network analysis findings and comment insights into a detailed, structured comment that helps the team understand and resolve the issue.

⚠️ IMPORTANT RULES:
1. FIRST PRIORITY: Address any API failures (4xx/5xx status codes) - these are critical issues
2. SECOND PRIORITY: Analyze data content for UI state issues (permission flags, feature flags, empty data)
3. IGNORE response times for successful requests (status 200-299) - these don't cause UI issues
4. Be specific about what data actually causes UI issues
5. If no API failures AND no relevant data patterns found, clearly state that the issue is likely in application logic, not network data

Create a comprehensive Jira comment that includes:

1. API FAILURE SUMMARY: If there are any failed API calls (4xx/5xx status codes), summarize the specific error codes, failed endpoints, and error patterns. If no failures, state "No API failures detected."

2. DATA ANALYSIS SUMMARY: Summarize the key findings from the data analysis, including what specific data patterns were found and how they might affect the application's behavior. If no relevant patterns found, state "No obvious data patterns that would cause UI issues detected."

3. UI STATE IMPLICATIONS: Based on the data analysis, explain what UI behavior would be expected and what conditions might cause UI elements to be disabled or unavailable. Be specific about what data actually controls UI state.

4. BUSINESS LOGIC INSIGHTS: What business rules, permissions, or configuration settings might be affecting the application's behavior based on the data returned? Only mention if there's specific data evidence.

5. INVESTIGATION STEPS: What specific areas should be investigated? Prioritize API failures first, then data processing and business logic.

6. ACTIONABLE RECOMMENDATIONS: What specific technical actions should be taken to resolve the issue? Be specific and actionable.

The comment should be structured, technical, and immediately actionable for the development team. Prioritize API failures over data analysis.

Output ONLY a JSON object with the following fields:
{
  "commentInsights": "Analysis of what the actual comment content reveals about the issue, team understanding, and progression. Reference specific comments and their implications.",
  "commentSuggestions": "Based on the comment analysis, what specific insights or actions would be most valuable for the team to consider.",
  "jiraComment": "A comprehensive, structured Jira comment that includes: 1) API failure summary (if any 4xx/5xx errors found) or clear statement if no failures, 2) Data analysis summary with specific findings from API responses (or clear statement if no relevant data found), 3) UI state implications explaining how the data affects application behavior, 4) Business logic insights about permissions, configuration, or rules that might be affecting the issue (only if supported by data), 5) Specific investigation steps prioritizing API failures first, then code areas to examine, 6) Actionable recommendations for resolution. The comment should be technical, evidence-based, and immediately actionable. For Actionable Recommendations, use phrases like 'To resolve this issue, we need to check...' or 'The resolution requires...' instead of 'The developer should...'"
}
- Output ONLY the JSON object, nothing else.
- The jiraComment should be comprehensive and include all the technical details from Phase 1 analysis.
- Focus on providing actionable, technical guidance based on the evidence.
- Structure the comment clearly with sections for API failures, data analysis, UI implications, business logic, investigation steps, and recommendations.
- Do NOT include a "Context from Comments" section.
- Make Actionable Recommendations less directive by using "we need to" or "the resolution requires" instead of "the developer should".
- PRIORITIZE API failures over data analysis - if there are 4xx/5xx errors, focus on those first
- If no API failures AND no relevant data patterns are found, clearly state that the issue is likely in application logic, not network data
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
