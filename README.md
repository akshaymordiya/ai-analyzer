# AI Debug Helper CLI

An AI-powered CLI tool for analyzing MSH (Microservice Health) tickets from Jira, investigating network logs, and providing automated root cause analysis using **Groq LLM** (free and fast).

## Features

- 🔍 **Automated MSH Ticket Analysis**: Fetch and analyze MSH tickets directly from Jira
- 📊 **Network Log Analysis**: Parse HAR files and analyze network requests for debugging
- 🤖 **AI-Powered Root Cause Analysis**: Use Groq LLM (Llama-3, Mixtral, Gemma) to identify issues and suggest solutions
- 💬 **Automated Jira Comments**: Generate and post detailed analysis comments to Jira tickets
- 🔧 **Easy Configuration**: Simple setup for Jira and Groq credentials
- 📋 **MSH Issue Search**: Search and browse MSH project issues
- 🆓 **Free LLM Access**: Uses Groq API (free tier available)

## Installation

1. Clone the repository:
```bash
git clone <repository-url>
cd ai-debug-helper
```

2. Install dependencies:
```bash
npm install
```

3. Build the project:
```bash
npm run build
```

4. Link the CLI tool globally:
```bash
npm link
```

## Setup Groq API Key (Free)

### Option 1: Automated Setup
```bash
./setup-env.sh
```

### Option 2: Manual Setup
1. **Get your Groq API key:**
   - Go to [console.groq.com](https://console.groq.com/)
   - Sign up or log in
   - Click "API Keys" → "Create API Key"
   - Copy the key (starts with `gsk_...`)

2. **Set environment variable:**
   ```bash
   # For zsh (macOS/Linux)
   echo 'export GROQ_API_KEY="your_groq_api_key_here"' >> ~/.zshrc
   source ~/.zshrc
   
   # For bash (Linux)
   echo 'export GROQ_API_KEY="your_groq_api_key_here"' >> ~/.bashrc
   source ~/.bashrc
   ```

## Configuration

Before using the tool, you need to configure your Jira credentials:

```bash
ai-debug-helper configure
```

You'll be prompted to enter:
- **Jira Base URL**: Your Jira instance URL (e.g., `https://yourcompany.atlassian.net`)
- **Jira Email**: Your Jira account email
- **Jira API Token**: Your Jira API token (generate from [Atlassian Account Settings](https://id.atlassian.com/manage-profile/security/api-tokens))
- **Groq API Key**: Your Groq API key (already set as environment variable)

## Usage

### Analyze an MSH Ticket

```bash
# Analyze a specific MSH ticket
ai-debug-helper analyze MSH-123

# Or just the number
ai-debug-helper analyze 123

# Or full Jira URL
ai-debug-helper analyze https://company.atlassian.net/browse/MSH-123

# Interactive mode (will prompt for ticket)
ai-debug-helper analyze
```

The tool will:
1. Fetch the MSH ticket details from Jira
2. Download and analyze any attached network logs (HAR files, etc.)
3. Use Groq LLM to analyze the issue and network logs
4. Generate a comprehensive root cause analysis
5. Show you the generated comment and ask for approval
6. Post the comment to Jira if approved

### Search MSH Issues

```bash
# Search all MSH issues
ai-debug-helper search

# Search with custom JQL query
ai-debug-helper search "status = 'In Progress' AND priority = 'High'"
```

### Legacy Debug Mode

For manual analysis without Jira integration:

```bash
ai-debug-helper debug
```

This will prompt you to manually enter:
- Jira issue details
- Logs/error messages
- Git diff (optional)

## How It Works

### 1. Ticket Fetching
- Extracts issue key from various formats (MSH-123, full URL, etc.)
- Fetches complete ticket details including attachments and comments
- Downloads network log files (HAR, JSON, etc.)

### 2. Network Log Analysis
- Parses HAR files to extract network requests
- Identifies failed requests, slow responses, and errors
- Analyzes request/response headers and bodies
- Provides network performance metrics

### 3. AI Analysis (Groq LLM)
- Combines ticket information with network log analysis
- Uses Groq's Llama-3, Mixtral, or Gemma models to identify root causes
- Generates comprehensive solutions and test cases
- Creates formatted Jira comments with proper markdown

### 4. Automated Commenting
- Shows preview of generated comment
- Asks for user approval before posting
- Posts comment directly to Jira using REST API
- Handles Jira's document format requirements

## Example Output

```
🔍 Analysis Results

Root Cause:
The issue is caused by a timeout in the authentication service API call. 
The network logs show a 504 Gateway Timeout error when calling /auth/validate 
endpoint, which is causing the user session to fail.

Fix Summary:
1. Increase timeout settings for auth service calls
2. Implement retry logic with exponential backoff
3. Add circuit breaker pattern for auth service
4. Monitor auth service performance metrics

Test Cases:
1. Test authentication with slow network conditions
2. Verify retry logic works correctly
3. Test circuit breaker activation and recovery
4. Validate timeout settings in different environments

Confidence: 85%
```

## Supported File Types

The tool can analyze various network log formats:
- **HAR files** (.har) - Browser network logs
- **JSON logs** (.json) - Structured log files
- **Text logs** (.log, .txt) - Plain text logs
- Files containing "network", "har", or "log" in the filename

## Groq LLM Models

The tool uses Groq's free models:
- **llama3-8b-8192**: Fast and efficient for most tasks
- **mixtral-8x7b-32768**: More capable for complex analysis
- **gemma-7b-it**: Good balance of speed and quality

## Troubleshooting

### Common Issues

1. **Configuration Error**
   ```
   ❌ Configuration required. Run "ai-debug-helper configure" first.
   ```
   Solution: Run the configure command and enter your credentials.

2. **Groq API Key Error**
   ```
   Error: GROQ_API_KEY environment variable is required
   ```
   Solution: Set your Groq API key using `./setup-env.sh` or manually.

3. **Invalid MSH Ticket Format**
   ```
   Error: Invalid MSH ticket format. Please use MSH-123 or full Jira URL.
   ```
   Solution: Use the correct format: MSH-123, 123, or full Jira URL.

4. **Jira API Error**
   ```
   Error: Failed to fetch issue MSH-123
   ```
   Solution: Check your Jira credentials and ensure the issue exists.

### Getting Help

```bash
# Show all available commands
ai-debug-helper --help

# Show help for specific command
ai-debug-helper analyze --help
```

## Development

### Project Structure

```
src/
├── index.ts          # Main CLI entry point
├── types.ts          # TypeScript interfaces
├── config.ts         # Configuration management
├── jira.ts           # Jira API client
├── network-analyzer.ts # Network log analysis
├── msh-analyzer.ts   # Main MSH analysis logic
├── ai.ts             # Groq LLM integration
├── prompt.ts         # User prompts and validation
├── git.ts            # Git integration
└── utils.ts          # Utility functions
```

### Development Commands

```bash
# Run in development mode
npm run dev

# Build the project
npm run build

# Run built version
npm start
```

## Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Add tests if applicable
5. Submit a pull request

## License

ISC License 