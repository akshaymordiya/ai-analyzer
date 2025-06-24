import { NetworkLog } from './types.js';
import chalk from 'chalk';

export interface DetailedNetworkAnalysis {
  errors: NetworkLog[];
  slowRequests: NetworkLog[];
  failedRequests: NetworkLog[];
  payloadIssues: PayloadIssue[];
  authenticationIssues: NetworkLog[];
  timeoutIssues: NetworkLog[];
  serverErrors: NetworkLog[];
  clientErrors: NetworkLog[];
  summary: string;
  detailedAnalysis: string;
}

export interface PayloadIssue {
  request: NetworkLog;
  issue: string;
  suggestion: string;
  codeExample?: string;
}

export class NetworkAnalyzer {
  static parseHARFile(harContent: string): NetworkLog[] {
    try {
      const har = JSON.parse(harContent);
      const logs: NetworkLog[] = [];

      // Handle different HAR file structures
      let entries: any[] = [];
      
      if (har.log && har.log.entries) {
        entries = har.log.entries;
      } else if (har.entries) {
        entries = har.entries;
      } else if (Array.isArray(har)) {
        entries = har;
      } else {
        console.log(chalk.yellow('HAR file structure:'), JSON.stringify(har, null, 2).substring(0, 500) + '...');
        throw new Error('Invalid HAR file structure - no entries found');
      }

      console.log(chalk.blue(`Found ${entries.length} entries in HAR file`));

      for (const entry of entries) {
        try {
          // Handle different entry structures
          const request = entry.request || entry;
          const response = entry.response || {};
          
          const log: NetworkLog = {
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
          } else {
            console.log(chalk.yellow(`Skipping invalid entry: ${JSON.stringify(entry).substring(0, 200)}...`));
          }
        } catch (entryError) {
          console.log(chalk.yellow(`Error parsing entry: ${entryError}`));
          console.log(chalk.gray(`Entry data: ${JSON.stringify(entry).substring(0, 300)}...`));
        }
      }

      return logs;
    } catch (error) {
      console.error(chalk.red('Error parsing HAR file:'), error);
      console.log(chalk.gray('HAR content preview:'), harContent.substring(0, 500) + '...');
      throw new Error(`Invalid HAR file format: ${error}`);
    }
  }

  private static extractRequestBody(request: any): string | undefined {
    if (request.postData) {
      return request.postData.text || request.postData.content || JSON.stringify(request.postData);
    }
    if (request.body) {
      return typeof request.body === 'string' ? request.body : JSON.stringify(request.body);
    }
    return undefined;
  }

  private static extractResponseBody(response: any): string | undefined {
    if (response.content) {
      return response.content.text || response.content.content || JSON.stringify(response.content);
    }
    if (response.body) {
      return typeof response.body === 'string' ? response.body : JSON.stringify(response.body);
    }
    return undefined;
  }

  private static parseHeaders(headers: any[]): Record<string, string> {
    const result: Record<string, string> = {};
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

  static analyzeNetworkLogs(logs: NetworkLog[]): DetailedNetworkAnalysis {
    const errors = logs.filter(log => log.error);
    const slowRequests = logs.filter(log => log.responseTime > 5000);
    const failedRequests = logs.filter(log => log.statusCode >= 400);
    
    // Categorize errors by type
    const authenticationIssues = logs.filter(log => 
      log.statusCode === 401 || log.statusCode === 403 || 
      log.responseBody?.toLowerCase().includes('unauthorized') ||
      log.responseBody?.toLowerCase().includes('forbidden')
    );
    
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

  private static analyzePayloadIssues(logs: NetworkLog[]): PayloadIssue[] {
    const issues: PayloadIssue[] = [];
    
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

  private static detectPayloadIssue(log: NetworkLog): PayloadIssue | null {
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

  private static generatePayloadExample(log: NetworkLog): string {
    try {
      if (log.requestBody) {
        const parsed = JSON.parse(log.requestBody);
        return `// Current payload structure:
${JSON.stringify(parsed, null, 2)}

// Expected format (based on error):
// Check API documentation for correct payload structure`;
      }
    } catch {
      return `// Malformed JSON detected in request body:
// ${log.requestBody?.substring(0, 200)}...`;
    }
    return '';
  }

  private static generateDetailedAnalysis(logs: NetworkLog[], payloadIssues: PayloadIssue[], timeoutIssues: NetworkLog[]): string {
    const analysis: string[] = [];
    
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

  private static analyzeErrorPatterns(logs: NetworkLog[]): string[] {
    const patterns: string[] = [];
    const errorLogs = logs.filter(log => log.error);
    
    // Group by status code
    const statusGroups: Record<number, NetworkLog[]> = {};
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

  private static analyzeRequestPatterns(logs: NetworkLog[]): string[] {
    const patterns: string[] = [];
    
    // Check for retry patterns
    const retryPatterns = this.detectRetryPatterns(logs);
    patterns.push(...retryPatterns);
    
    // Check for authentication patterns
    const authPatterns = this.detectAuthPatterns(logs);
    patterns.push(...authPatterns);
    
    return patterns;
  }

  private static detectRetryPatterns(logs: NetworkLog[]): string[] {
    const patterns: string[] = [];
    const urlGroups: Record<string, NetworkLog[]> = {};
    
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

  private static detectAuthPatterns(logs: NetworkLog[]): string[] {
    const patterns: string[] = [];
    const authErrors = logs.filter(log => 
      log.statusCode === 401 || log.statusCode === 403
    );
    
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

  private static calculateAverageResponseTime(logs: NetworkLog[]): number {
    if (logs.length === 0) return 0;
    const total = logs.reduce((sum, log) => sum + log.responseTime, 0);
    return Math.round(total / logs.length);
  }

  private static getMostCommonError(errors: NetworkLog[]): string {
    if (errors.length === 0) return 'None';
    
    const errorCounts: Record<string, number> = {};
    errors.forEach(error => {
      const status = error.statusCode.toString();
      errorCounts[status] = (errorCounts[status] || 0) + 1;
    });

    const mostCommon = Object.entries(errorCounts)
      .sort(([,a], [,b]) => b - a)[0];
    
    return mostCommon ? `HTTP ${mostCommon[0]} (${mostCommon[1]} times)` : 'Unknown';
  }

  static extractRelevantLogs(logs: NetworkLog[], issueDescription: string): NetworkLog[] {
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

  private static getLongestRequest(logs: NetworkLog[]): string {
    if (logs.length === 0) return 'N/A';
    
    const longest = logs.reduce((max, log) => 
      log.responseTime > max.responseTime ? log : max
    );
    
    return `${longest.method} ${longest.url} (${longest.responseTime}ms)`;
  }
} 