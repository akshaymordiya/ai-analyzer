import chalk from 'chalk';
export class NetworkAnalyzer {
    static parseHARFile(harContent) {
        try {
            console.log(chalk.blue('🔍 DEBUG: Starting HAR parsing...'));
            console.log(chalk.blue('🔍 DEBUG: HAR content length:'), harContent.length);
            console.log(chalk.blue('🔍 DEBUG: HAR content preview:'), harContent.substring(0, 200) + '...');
            let har;
            try {
                har = JSON.parse(harContent);
            }
            catch (parseError) {
                console.log(chalk.red('❌ DEBUG: JSON parse failed at position:'), parseError.message);
                // Try to fix common JSON issues
                let fixedContent = harContent;
                // Remove any trailing commas
                fixedContent = fixedContent.replace(/,(\s*[}\]])/g, '$1');
                // Try to find the problematic position and show context
                const errorPosition = parseInt(parseError.message.match(/position (\d+)/)?.[1] || '0');
                if (errorPosition > 0) {
                    const start = Math.max(0, errorPosition - 50);
                    const end = Math.min(harContent.length, errorPosition + 50);
                    console.log(chalk.yellow('🔍 DEBUG: Error context:'), harContent.substring(start, end));
                }
                try {
                    har = JSON.parse(fixedContent);
                    console.log(chalk.green('✅ DEBUG: Fixed JSON parsing succeeded'));
                }
                catch (secondError) {
                    console.log(chalk.red('❌ DEBUG: Fixed JSON also failed:'), secondError);
                    throw parseError; // Throw original error
                }
            }
            const logs = [];
            // Handle different HAR file structures
            let entries = [];
            if (har.log && har.log.entries) {
                entries = har.log.entries;
                console.log(chalk.blue('🔍 DEBUG: Found entries in har.log.entries'));
            }
            else if (har.entries) {
                entries = har.entries;
                console.log(chalk.blue('🔍 DEBUG: Found entries in har.entries'));
            }
            else if (Array.isArray(har)) {
                entries = har;
                console.log(chalk.blue('🔍 DEBUG: Found entries as direct array'));
            }
            else {
                console.log(chalk.yellow('HAR file structure:'), JSON.stringify(har, null, 2).substring(0, 500) + '...');
                throw new Error('Invalid HAR file structure - no entries found');
            }
            console.log(chalk.blue(`Found ${entries.length} entries in HAR file`));
            for (let i = 0; i < entries.length; i++) {
                const entry = entries[i];
                try {
                    console.log(chalk.gray(`🔍 DEBUG: Processing entry ${i + 1}/${entries.length}`));
                    // Handle different entry structures
                    const request = entry.request || entry;
                    const response = entry.response || {};
                    console.log(chalk.gray(`🔍 DEBUG: Entry ${i + 1} - URL: ${request.url || 'N/A'}, Method: ${request.method || 'N/A'}`));
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
                        console.log(chalk.green(`✅ DEBUG: Entry ${i + 1} added successfully`));
                    }
                    else {
                        console.log(chalk.yellow(`⚠️ DEBUG: Skipping invalid entry ${i + 1}: missing URL or method`));
                    }
                }
                catch (entryError) {
                    console.log(chalk.yellow(`⚠️ DEBUG: Error parsing entry ${i + 1}: ${entryError}`));
                    console.log(chalk.gray(`Entry ${i + 1} data: ${JSON.stringify(entry).substring(0, 300)}...`));
                }
            }
            console.log(chalk.green(`✅ DEBUG: Successfully parsed ${logs.length} network logs`));
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
        // Enhanced summary with data analysis focus
        const successfulRequests = logs.filter(log => log.statusCode >= 200 && log.statusCode < 300);
        const dataAnalysisSummary = this.generateDataAnalysisSummary(successfulRequests);
        const timeoutDetails = timeoutIssues.length > 0 ?
            `\n- Timeout issues: ${timeoutIssues.length} (including ${timeoutIssues.filter(log => log.responseTime > 60000).length} extreme timeouts >1min)` :
            '';
        const summary = `
Network Analysis Summary:
- Total requests: ${logs.length}
- Successful requests (2xx): ${successfulRequests.length}
- Failed requests (4xx/5xx): ${failedRequests.length}
- Server errors (5xx): ${serverErrors.length}
- Client errors (4xx): ${clientErrors.length}
- Slow requests (>5s): ${slowRequests.length}
- Authentication issues: ${authenticationIssues.length}${timeoutDetails}

${failedRequests.length > 0 ? `🚨 CRITICAL: ${failedRequests.length} API failures detected - these should be investigated first` : ''}

${dataAnalysisSummary}
`;
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
        // FIRST PRIORITY: Add API failure analysis
        const failedRequests = logs.filter(log => log.statusCode >= 400);
        if (failedRequests.length > 0) {
            analysis.push('🚨 API FAILURE ANALYSIS:');
            failedRequests.forEach(log => {
                analysis.push(`  • ${log.method} ${log.url}`);
                analysis.push(`    Status: ${log.statusCode} (${this.getStatusDescription(log.statusCode)})`);
                analysis.push(`    Response time: ${log.responseTime}ms`);
                if (log.responseBody) {
                    analysis.push(`    Error response: ${log.responseBody.substring(0, 200)}${log.responseBody.length > 200 ? '...' : ''}`);
                }
                analysis.push('');
            });
        }
        // SECOND PRIORITY: Add data content analysis for successful requests
        const successfulRequests = logs.filter(log => log.statusCode >= 200 && log.statusCode < 300);
        if (successfulRequests.length > 0) {
            analysis.push('📊 DATA CONTENT ANALYSIS:');
            const dataInsights = this.analyzeDataContent(successfulRequests);
            if (dataInsights.length > 0) {
                dataInsights.forEach(insight => analysis.push(`  • ${insight}`));
            }
            else {
                analysis.push('  • All successful API calls returned expected data - no obvious data patterns that would cause UI issues');
                analysis.push('  • Issue likely in application logic or data processing, not network data');
            }
            analysis.push('');
        }
        // Only add timeout analysis for actual timeout errors (not just slow successful requests)
        const actualTimeoutErrors = timeoutIssues.filter(log => log.statusCode === 408 ||
            log.statusCode === 504 ||
            log.responseBody?.toLowerCase().includes('timeout') ||
            log.responseTime > 60000 // Only extreme timeouts
        );
        if (actualTimeoutErrors.length > 0) {
            analysis.push('🚨 TIMEOUT ANALYSIS:');
            actualTimeoutErrors.forEach(log => {
                const isExtreme = log.responseTime > 60000;
                const isGraphQL = log.url?.includes('graphql');
                analysis.push(`  • ${log.method} ${log.url}`);
                analysis.push(`    Response time: ${log.responseTime}ms (${isExtreme ? 'EXTREME' : 'timeout'})`);
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
    static getStatusDescription(statusCode) {
        switch (statusCode) {
            case 400: return 'Bad Request';
            case 401: return 'Unauthorized';
            case 403: return 'Forbidden';
            case 404: return 'Not Found';
            case 408: return 'Request Timeout';
            case 500: return 'Internal Server Error';
            case 502: return 'Bad Gateway';
            case 503: return 'Service Unavailable';
            case 504: return 'Gateway Timeout';
            default: return 'Error';
        }
    }
    static analyzeDataContent(successfulRequests) {
        const insights = [];
        // Analyze response data for UI state implications
        successfulRequests.forEach(log => {
            if (!log.responseBody)
                return;
            try {
                const data = JSON.parse(log.responseBody);
                // Check for empty data that might disable UI elements
                if (Array.isArray(data) && data.length === 0) {
                    insights.push(`Empty array response from ${log.url} - may cause UI elements to be disabled`);
                }
                if (typeof data === 'object' && Object.keys(data).length === 0) {
                    insights.push(`Empty object response from ${log.url} - may indicate missing configuration`);
                }
                // Check for permission/access data
                if (typeof data === 'object' && (data.permissions || data.access || data.authorized)) {
                    insights.push(`Permission/access data in ${log.url} - may affect UI state based on user rights`);
                }
                // Check for feature flags
                if (typeof data === 'object' && (data.enabled !== undefined || data.disabled !== undefined)) {
                    insights.push(`Feature flag data in ${log.url} - may control UI element visibility/state`);
                }
                // Check for business logic flags
                if (typeof data === 'object' && (data.available || data.ready || data.active)) {
                    insights.push(`Business logic flag in ${log.url} - may determine if actions are available`);
                }
                // Check for error flags in successful responses
                if (typeof data === 'object' && (data.error || data.errors || data.success === false)) {
                    insights.push(`Error flag in successful response from ${log.url} - may cause UI to show error state`);
                }
                // Check for loading/processing states
                if (typeof data === 'object' && (data.loading || data.processing || data.status)) {
                    insights.push(`State data in ${log.url} - may control UI loading/processing indicators`);
                }
            }
            catch (e) {
                // Skip non-JSON responses
            }
        });
        // Analyze patterns across multiple responses
        const emptyResponses = successfulRequests.filter(log => {
            if (!log.responseBody)
                return true;
            try {
                const data = JSON.parse(log.responseBody);
                return Array.isArray(data) && data.length === 0;
            }
            catch {
                return false;
            }
        });
        if (emptyResponses.length > 0) {
            insights.push(`Multiple empty responses (${emptyResponses.length}) - may indicate data loading issues or missing configuration`);
        }
        return insights;
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
    static generateDataAnalysisSummary(successfulRequests) {
        if (successfulRequests.length === 0) {
            return 'No successful requests to analyze.';
        }
        const dataAnalysis = [];
        // Analyze response data patterns
        const emptyResponses = successfulRequests.filter(log => !log.responseBody ||
            log.responseBody.trim() === '' ||
            log.responseBody === '{}' ||
            log.responseBody === '[]' ||
            log.responseBody === 'null');
        const jsonResponses = successfulRequests.filter(log => {
            if (!log.responseBody)
                return false;
            try {
                const parsed = JSON.parse(log.responseBody);
                return typeof parsed === 'object';
            }
            catch {
                return false;
            }
        });
        // Analyze JSON response patterns
        const dataPatterns = [];
        jsonResponses.forEach(log => {
            try {
                const data = JSON.parse(log.responseBody);
                // Check for empty arrays/objects
                if (Array.isArray(data) && data.length === 0) {
                    dataPatterns.push(`Empty array in ${log.url}`);
                }
                if (typeof data === 'object' && Object.keys(data).length === 0) {
                    dataPatterns.push(`Empty object in ${log.url}`);
                }
                // Check for null/undefined values
                if (data === null || data === undefined) {
                    dataPatterns.push(`Null response in ${log.url}`);
                }
                // Check for error flags in successful responses
                if (typeof data === 'object' && (data.error || data.errors || data.success === false)) {
                    dataPatterns.push(`Error flag in successful response: ${log.url}`);
                    2;
                }
                // Check for permission/access flags
                if (typeof data === 'object' && (data.access || data.permissions || data.authorized)) {
                    dataPatterns.push(`Permission data in ${log.url}`);
                }
                // Check for feature flags
                if (typeof data === 'object' && (data.enabled || data.disabled || data.featureFlags)) {
                    dataPatterns.push(`Feature flag data in ${log.url}`);
                }
            }
            catch (e) {
                // Skip non-JSON responses
            }
        });
        dataAnalysis.push(`Data Analysis:`);
        dataAnalysis.push(`- Successful API calls: ${successfulRequests.length}`);
        dataAnalysis.push(`- Empty/null responses: ${emptyResponses.length}`);
        dataAnalysis.push(`- JSON responses: ${jsonResponses.length}`);
        if (dataPatterns.length > 0) {
            dataAnalysis.push(`- Data patterns detected: ${dataPatterns.length}`);
            dataPatterns.slice(0, 5).forEach(pattern => {
                dataAnalysis.push(`  • ${pattern}`);
            });
            if (dataPatterns.length > 5) {
                dataAnalysis.push(`  • ... and ${dataPatterns.length - 5} more patterns`);
            }
        }
        else {
            dataAnalysis.push(`- No obvious data patterns that would cause UI issues detected`);
            dataAnalysis.push(`- All successful API calls returned expected data`);
        }
        // Analyze specific API endpoints for business logic
        const businessLogicAPIs = successfulRequests.filter(log => log.url.includes('permissions') ||
            log.url.includes('access') ||
            log.url.includes('config') ||
            log.url.includes('settings') ||
            log.url.includes('features') ||
            log.url.includes('enabled') ||
            log.url.includes('disabled'));
        if (businessLogicAPIs.length > 0) {
            dataAnalysis.push(`- Business logic APIs: ${businessLogicAPIs.length}`);
            businessLogicAPIs.slice(0, 3).forEach(log => {
                dataAnalysis.push(`  • ${log.method} ${log.url}`);
            });
        }
        return dataAnalysis.join('\n');
    }
}
