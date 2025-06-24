export interface JiraConfig {
  baseUrl: string;
  email: string;
  apiToken: string;
}

export interface JiraIssue {
  key: string;
  summary: string;
  description: string;
  status: string;
  priority: string;
  assignee?: string;
  reporter: string;
  created: string;
  updated: string;
  attachments: JiraAttachment[];
  comments: JiraComment[];
}

export interface JiraAttachment {
  id: string;
  filename: string;
  size: number;
  mimeType: string;
  content: string;
}

export interface JiraComment {
  id: string;
  author: string;
  body: string;
  created: string;
}

export interface NetworkLog {
  url: string;
  method: string;
  statusCode: number;
  responseTime: number;
  requestHeaders: Record<string, string>;
  responseHeaders: Record<string, string>;
  requestBody?: string;
  responseBody?: string;
  error?: string;
}

export interface AnalysisResult {
  rootCause: string;
  fixSummary: string;
  testCases: string[];
  jiraComment: string;
  confidence: number;
}

export interface MSHTicket {
  issue: JiraIssue;
  networkLogs: NetworkLog[];
  attachments: JiraAttachment[];
} 