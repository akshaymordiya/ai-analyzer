import axios, { AxiosInstance } from 'axios';
import { JiraConfig, JiraIssue, JiraAttachment, JiraComment } from './types.js';
import chalk from 'chalk';

export class JiraClient {
  private client: AxiosInstance;

  constructor(config: JiraConfig) {
    this.client = axios.create({
      baseURL: config.baseUrl,
      auth: {
        username: config.email,
        password: config.apiToken
      },
      headers: {
        'Accept': 'application/json',
        'Content-Type': 'application/json'
      }
    });
  }

  async getIssue(issueKey: string): Promise<JiraIssue> {
    try {
      const response = await this.client.get(`/rest/api/3/issue/${issueKey}`, {
        params: {
          expand: 'attachments,comments'
        }
      });

      const issue = response.data;
      return {
        key: issue.key,
        summary: issue.fields.summary,
        description: issue.fields.description || '',
        status: issue.fields.status.name,
        priority: issue.fields.priority.name,
        assignee: issue.fields.assignee?.displayName,
        reporter: issue.fields.reporter.displayName,
        created: issue.fields.created,
        updated: issue.fields.updated,
        attachments: issue.fields.attachment || [],
        comments: issue.fields.comment?.comments || []
      };
    } catch (error) {
      console.error(chalk.red('Error fetching Jira issue:'), error);
      throw new Error(`Failed to fetch issue ${issueKey}`);
    }
  }

  async getAttachmentContent(attachmentId: string): Promise<string> {
    try {
      // Get attachment metadata to get the download URL
      const metadataResponse = await this.client.get(`/rest/api/3/attachment/${attachmentId}`);
      const attachment = metadataResponse.data;
      
      // Download the actual file content using the direct URL
      const axiosModule = await import('axios');
      const contentResponse = await axiosModule.default.get(attachment.content, {
        responseType: 'arraybuffer',
        headers: {
          'Authorization': this.client.defaults.auth
            ? 'Basic ' + Buffer.from(this.client.defaults.auth.username + ':' + this.client.defaults.auth.password).toString('base64')
            : undefined,
          'Accept': '*/*'
        }
      });
      
      // Convert arraybuffer to UTF-8 string directly
      const content = Buffer.from(contentResponse.data).toString('utf8');
      return content;
    } catch (error) {
      console.error(chalk.red('Error fetching attachment:'), error);
      throw new Error(`Failed to fetch attachment ${attachmentId}`);
    }
  }

  async addComment(issueKey: string, comment: string): Promise<void> {
    try {
      // Parse the markdown comment and convert to ADF format
      const lines = comment.split(/\r?\n/).map(l => l.trim());
      const content = [];
      let currentSection = '';
      let currentContent: string[] = [];
      
      for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        if (!line) continue;
        
        // Check if this is a section header (starts with ** and ends with **)
        const sectionMatch = line.match(/^\*\*(.*?)\*\*:?$/);
        if (sectionMatch) {
          // Flush previous section content
          if (currentSection && currentContent.length > 0) {
            // Add section header as a paragraph with bold text
            content.push({
              type: 'paragraph',
              content: [
                { type: 'text', text: currentSection + ':', marks: [{ type: 'strong' }] }
              ]
            });
            
            // Add section content as a paragraph
            content.push({
              type: 'paragraph',
              content: [{ type: 'text', text: currentContent.join(' ') }]
            });
          }
          
          // Start new section
          currentSection = sectionMatch[1];
          currentContent = [];
        } else if (line.match(/^\d+\./)) {
          // This is a numbered list item
          if (currentContent.length > 0) {
            // Flush previous content as a paragraph
            content.push({
              type: 'paragraph',
              content: [{ type: 'text', text: currentContent.join(' ') }]
            });
            currentContent = [];
          }
          
          // Add the numbered list item
          const listItemText = line.replace(/^\d+\.\s*/, '');
          content.push({
            type: 'paragraph',
            content: [{ type: 'text', text: listItemText }]
          });
        } else {
          // Add line to current section content
          currentContent.push(line);
        }
      }
      
      // Flush the last section
      if (currentSection && currentContent.length > 0) {
        // Add section header as a paragraph with bold text
        content.push({
          type: 'paragraph',
          content: [
            { type: 'text', text: currentSection + ':', marks: [{ type: 'strong' }] }
          ]
        });
        
        // Add section content as a paragraph
        content.push({
          type: 'paragraph',
          content: [{ type: 'text', text: currentContent.join(' ') }]
        });
      }
      
      // If no sections were found, treat the entire comment as a single paragraph
      if (content.length === 0) {
        content.push({
          type: 'paragraph',
          content: [{ type: 'text', text: comment }]
        });
      }
      
      await this.client.post(`/rest/api/3/issue/${issueKey}/comment`, {
        body: {
          type: 'doc',
          version: 1,
          content
        }
      });
      console.log(chalk.green(`✅ Comment added to ${issueKey}`));
    } catch (error) {
      console.error(chalk.red('Error adding comment:'), error);
      throw new Error(`Failed to add comment to ${issueKey}`);
    }
  }

  async searchMSHIssues(query: string = 'project = MSH'): Promise<JiraIssue[]> {
    try {
      const response = await this.client.post('/rest/api/3/search', {
        jql: query,
        maxResults: 50,
        fields: ['summary', 'description', 'status', 'priority', 'assignee', 'reporter', 'created', 'updated']
      });

      return response.data.issues.map((issue: any) => ({
        key: issue.key,
        summary: issue.fields.summary,
        description: issue.fields.description || '',
        status: issue.fields.status.name,
        priority: issue.fields.priority.name,
        assignee: issue.fields.assignee?.displayName,
        reporter: issue.fields.reporter.displayName,
        created: issue.fields.created,
        updated: issue.fields.updated,
        attachments: [],
        comments: []
      }));
    } catch (error) {
      console.error(chalk.red('Error searching MSH issues:'), error);
      throw new Error('Failed to search MSH issues');
    }
  }
} 