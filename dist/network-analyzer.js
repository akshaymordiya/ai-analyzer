import chalk from 'chalk';
export class NetworkAnalyzer {
    static parseHARFile(harContent) {
        try {
            const har = JSON.parse(harContent);
            const logs = [];
            // Handle different HAR file structures
            let entries = [];
            if (har.log && har.log.entries) {
                entries = har.log.entries;
            }
            else if (har.entries) {
                entries = har.entries;
            }
            else if (Array.isArray(har)) {
                entries = har;
            }
            else {
                console.log(chalk.yellow('HAR file structure:'), JSON.stringify(har, null, 2).substring(0, 500) + '...');
                throw new Error('Invalid HAR file structure - no entries found');
            }
            console.log(chalk.blue(`Found ${entries.length} entries in HAR file`));
            for (const entry of entries) {
                try {
                    // Handle different entry structures
                    const request = entry.request || entry;
                    const response = entry.response || {};
                    const log = {
                        url: request.url || request.uri || '',
                        method: request.method || 'GET',
                        statusCode: response.status || response.statusCode || 0,
                        responseTime: entry.time || entry.duration || 0,
                        requestHeaders: this.parseHeaders(request.headers || []),
                        responseHeaders: this.parseHeaders(response.headers || []),
                        requestBody: this.extractRequestBody(request),
                        responseBody: this.extractResponseBody(response),
                        error: (response.status || response.statusCode || 0) >= 400 ? `HTTP ${response.status || response.statusCode}` : undefined
                    };
                    // Validate the log entry
                    if (log.url && log.method) {
                        logs.push(log);
                    }
                    else {
                        console.log(chalk.yellow(`Skipping invalid entry: ${JSON.stringify(entry).substring(0, 200)}...`));
                    }
                }
                catch (entryError) {
                    console.log(chalk.yellow(`Error parsing entry: ${entryError}`));
                    console.log(chalk.gray(`Entry data: ${JSON.stringify(entry).substring(0, 300)}...`));
                }
            }
            return logs;
        }
        catch (error) {
            console.error(chalk.red('Error parsing HAR file:'), error);
            console.log(chalk.gray('HAR content preview:'), harContent.substring(0, 500) + '...');
            throw new Error(`Invalid HAR file format: ${error}`);
        }
    }
    static extractRequestBody(request) {
        if (request.postData) {
            return request.postData.text || request.postData.content || JSON.stringify(request.postData);
        }
        if (request.body) {
            return typeof request.body === 'string' ? request.body : JSON.stringify(request.body);
        }
        return undefined;
    }
    static extractResponseBody(response) {
        if (response.content) {
            return response.content.text || response.content.content || JSON.stringify(response.content);
        }
        if (response.body) {
            return typeof response.body === 'string' ? response.body : JSON.stringify(response.body);
        }
        return undefined;
    }
    static parseHeaders(headers) {
        const result = {};
        if (!Array.isArray(headers)) {
            return result;
        }
        for (const header of headers) {
            if (header && header.name && header.value) {
                result[header.name] = header.value;
            }
        }
        return result;
    }
    static analyzeNetworkLogs(logs) {
        const errors = logs.filter(log => log.error);
        const slowRequests = logs.filter(log => log.responseTime > 5000);
        const failedRequests = logs.filter(log => log.statusCode >= 400);
        // Categorize errors by type
        const authenticationIssues = logs.filter(log => log.statusCode === 401 || log.statusCode === 403 ||
            log.responseBody?.toLowerCase().includes('unauthorized') ||
            log.responseBody?.toLowerCase().includes('forbidden'));
        // Improved timeout detection - catch extreme response times even with successful status codes
        const timeoutIssues = logs.filter(log => {
            const isTimeoutStatus = log.statusCode === 408 || log.statusCode === 504;
            const hasTimeoutInBody = log.responseBody?.toLowerCase().includes('timeout');
            const isExtremelySlow = log.responseTime > 30000; // 30 seconds
            const isExtremelySlowWithSuccess = log.responseTime > 60000 && log.statusCode < 400; // 1+ minute with success status
            const isGraphQLTimeout = log.url?.includes('graphql') && log.responseTime > 30000;
            return isTimeoutStatus || hasTimeoutInBody || isExtremelySlow || isExtremelySlowWithSuccess || isGraphQLTimeout;
        });
        const serverErrors = logs.filter(log => log.statusCode >= 500);
        const clientErrors = logs.filter(log => log.statusCode >= 400 && log.statusCode < 500);
        // Analyze payload issues
        const payloadIssues = this.analyzePayloadIssues(logs);
        // Enhanced summary with timeout details
        const timeoutDetails = timeoutIssues.length > 0 ?
            `\n- Timeout issues: ${timeoutIssues.length} (including ${timeoutIssues.filter(log => log.responseTime > 60000).length} extreme timeouts >1min)` :
            '';
        const summary = `
Network Analysis Summary:
- Total requests: ${logs.length}
- Failed requests (4xx/5xx): ${failedRequests.length}
- Slow requests (>5s): ${slowRequests.length}
- Authentication issues: ${authenticationIssues.length}${timeoutDetails}
- Server errors (5xx): ${serverErrors.length}
- Client errors (4xx): ${clientErrors.length}
- Payload issues detected: ${payloadIssues.length}
- Average response time: ${this.calculateAverageResponseTime(logs)}ms
- Most common error: ${this.getMostCommonError(errors)}
- Longest request: ${this.getLongestRequest(logs)}
    `.trim();
        const detailedAnalysis = this.generateDetailedAnalysis(logs, payloadIssues, timeoutIssues);
        return {
            errors,
            slowRequests,
            failedRequests,
            payloadIssues,
            authenticationIssues,
            timeoutIssues,
            serverErrors,
            clientErrors,
            summary,
            detailedAnalysis
        };
    }
    static analyzePayloadIssues(logs) {
        const issues = [];
        for (const log of logs) {
            if (log.statusCode >= 400 && log.requestBody) {
                const issue = this.detectPayloadIssue(log);
                if (issue) {
                    issues.push(issue);
                }
            }
        }
        return issues;
    }
    static detectPayloadIssue(log) {
        const responseBody = log.responseBody?.toLowerCase() || '';
        const requestBody = log.requestBody || '';
        // Check for common payload issues
        if (responseBody.includes('validation') || responseBody.includes('invalid')) {
            return {
                request: log,
                issue: 'Payload validation failed',
                suggestion: 'Check request payload format and required fields',
                codeExample: this.generatePayloadExample(log)
            };
        }
        if (responseBody.includes('missing') || responseBody.includes('required')) {
            return {
                request: log,
                issue: 'Missing required fields',
                suggestion: 'Add missing required fields to request payload',
                codeExample: this.generatePayloadExample(log)
            };
        }
        if (responseBody.includes('type') || responseBody.includes('format')) {
            return {
                request: log,
                issue: 'Data type or format mismatch',
                suggestion: 'Check data types and formats in request payload',
                codeExample: this.generatePayloadExample(log)
            };
        }
        if (log.statusCode === 413) {
            return {
                request: log,
                issue: 'Payload too large',
                suggestion: 'Reduce payload size or implement chunking',
                codeExample: this.generatePayloadExample(log)
            };
        }
        if (log.statusCode === 400 && requestBody) {
            return {
                request: log,
                issue: 'Malformed request payload',
                suggestion: 'Check JSON syntax and structure',
                codeExample: this.generatePayloadExample(log)
            };
        }
        return null;
    }
    static generatePayloadExample(log) {
        try {
            if (log.requestBody) {
                const parsed = JSON.parse(log.requestBody);
                return `// Current payload structure:
${JSON.stringify(parsed, null, 2)}

// Expected format (based on error):
// Check API documentation for correct payload structure`;
            }
        }
        catch {
            return `// Malformed JSON detected in request body:
// ${log.requestBody?.substring(0, 200)}...`;
        }
        return '';
    }
    static generateDetailedAnalysis(logs, payloadIssues, timeoutIssues) {
        const analysis = [];
        // Add timeout analysis
        if (timeoutIssues.length > 0) {
            analysis.push('🚨 TIMEOUT ANALYSIS:');
            timeoutIssues.forEach(log => {
                const isExtreme = log.responseTime > 60000;
                const isGraphQL = log.url?.includes('graphql');
                analysis.push(`  • ${log.method} ${log.url}`);
                analysis.push(`    Response time: ${log.responseTime}ms (${isExtreme ? 'EXTREME' : 'slow'})`);
                analysis.push(`    Status: ${log.statusCode} ${isGraphQL ? '(GraphQL)' : ''}`);
                if (log.responseTime > 60000) {
                    analysis.push(`    ⚠️  This request took over 1 minute - likely a timeout issue`);
                }
            });
            analysis.push('');
        }
        // Add error pattern analysis
        const errorPatterns = this.analyzeErrorPatterns(logs);
        if (errorPatterns.length > 0) {
            analysis.push('🔍 ERROR PATTERNS:');
            errorPatterns.forEach(pattern => analysis.push(`  • ${pattern}`));
            analysis.push('');
        }
        // Add request pattern analysis
        const requestPatterns = this.analyzeRequestPatterns(logs);
        if (requestPatterns.length > 0) {
            analysis.push('📊 REQUEST PATTERNS:');
            requestPatterns.forEach(pattern => analysis.push(`  • ${pattern}`));
            analysis.push('');
        }
        // Add retry pattern analysis
        const retryPatterns = this.detectRetryPatterns(logs);
        if (retryPatterns.length > 0) {
            analysis.push('🔄 RETRY PATTERNS:');
            retryPatterns.forEach(pattern => analysis.push(`  • ${pattern}`));
            analysis.push('');
        }
        // Add authentication pattern analysis
        const authPatterns = this.detectAuthPatterns(logs);
        if (authPatterns.length > 0) {
            analysis.push('🔐 AUTHENTICATION PATTERNS:');
            authPatterns.forEach(pattern => analysis.push(`  • ${pattern}`));
            analysis.push('');
        }
        return analysis.join('\n');
    }
    static analyzeErrorPatterns(logs) {
        const patterns = [];
        const errorLogs = logs.filter(log => log.error);
        // Group by status code
        const statusGroups = {};
        errorLogs.forEach(log => {
            if (!statusGroups[log.statusCode]) {
                statusGroups[log.statusCode] = [];
            }
            statusGroups[log.statusCode].push(log);
        });
        // Analyze patterns
        Object.entries(statusGroups).forEach(([status, logs]) => {
            if (logs.length > 1) {
                patterns.push(`Multiple ${status} errors (${logs.length} requests) - likely systematic issue`);
            }
            // Check for specific endpoints
            const endpoints = logs.map(log => new URL(log.url).pathname);
            const uniqueEndpoints = [...new Set(endpoints)];
            if (uniqueEndpoints.length === 1) {
                patterns.push(`All ${status} errors on endpoint: ${uniqueEndpoints[0]}`);
            }
        });
        return patterns;
    }
    static analyzeRequestPatterns(logs) {
        const patterns = [];
        // Check for retry patterns
        const retryPatterns = this.detectRetryPatterns(logs);
        patterns.push(...retryPatterns);
        // Check for authentication patterns
        const authPatterns = this.detectAuthPatterns(logs);
        patterns.push(...authPatterns);
        return patterns;
    }
    static detectRetryPatterns(logs) {
        const patterns = [];
        const urlGroups = {};
        logs.forEach(log => {
            if (!urlGroups[log.url]) {
                urlGroups[log.url] = [];
            }
            urlGroups[log.url].push(log);
        });
        Object.entries(urlGroups).forEach(([url, requests]) => {
            if (requests.length > 1) {
                const failedRequests = requests.filter(req => req.statusCode >= 400);
                if (failedRequests.length > 1) {
                    patterns.push(`Multiple failed requests to ${url} - possible retry logic or persistent issue`);
                }
            }
        });
        return patterns;
    }
    static detectAuthPatterns(logs) {
        const patterns = [];
        const authErrors = logs.filter(log => log.statusCode === 401 || log.statusCode === 403);
        if (authErrors.length > 0) {
            patterns.push(`Authentication issues detected (${authErrors.length} requests)`);
            // Check if auth errors follow successful requests
            const successfulRequests = logs.filter(log => log.statusCode < 400);
            if (successfulRequests.length > 0 && authErrors.length > 0) {
                patterns.push('Authentication errors after successful requests - possible token expiration');
            }
        }
        return patterns;
    }
    static calculateAverageResponseTime(logs) {
        if (logs.length === 0)
            return 0;
        const total = logs.reduce((sum, log) => sum + log.responseTime, 0);
        return Math.round(total / logs.length);
    }
    static getMostCommonError(errors) {
        if (errors.length === 0)
            return 'None';
        const errorCounts = {};
        errors.forEach(error => {
            const status = error.statusCode.toString();
            errorCounts[status] = (errorCounts[status] || 0) + 1;
        });
        const mostCommon = Object.entries(errorCounts)
            .sort(([, a], [, b]) => b - a)[0];
        return mostCommon ? `HTTP ${mostCommon[0]} (${mostCommon[1]} times)` : 'Unknown';
    }
    static extractRelevantLogs(logs, issueDescription) {
        // Extract keywords from issue description
        const keywords = issueDescription.toLowerCase()
            .split(/\s+/)
            .filter(word => word.length > 3)
            .map(word => word.replace(/[^\w]/g, ''));
        return logs.filter(log => {
            const logText = `${log.url} ${log.method} ${log.statusCode}`.toLowerCase();
            return keywords.some(keyword => logText.includes(keyword));
        });
    }
    static getLongestRequest(logs) {
        if (logs.length === 0)
            return 'N/A';
        const longest = logs.reduce((max, log) => log.responseTime > max.responseTime ? log : max);
        return `${longest.method} ${longest.url} (${longest.responseTime}ms)`;
    }
}
