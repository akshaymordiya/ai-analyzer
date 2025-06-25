#!/bin/bash

# Enable color support
export TERM=xterm-256color

# Color codes with proper escaping - Medium/Subtle tones
RED='\033[38;5;160m'
GREEN='\033[38;5;34m'
YELLOW='\033[38;5;178m'
BLUE='\033[38;5;33m'
CYAN='\033[38;5;37m'
MAGENTA='\033[38;5;127m'
ORANGE='\033[38;5;172m'
PURPLE='\033[38;5;99m'
NC='\033[0m'

# Animation frames
SPINNER=("⠋" "⠙" "⠹" "⠸" "⠼" "⠴" "⠦" "⠧" "⠇" "⠏")

# Function to show spinner
show_spinner() {
    local pid=$1
    local delay=0.1
    local spinstr='|/-\'
    while [ "$(ps a | awk '{print $1}' | grep $pid)" ]; do
        local temp=${spinstr#?}
        printf " [%c]  " "$spinstr"
        local spinstr=$temp${spinstr%"$temp"}
        sleep $delay
        printf "\b\b\b\b\b\b"
    done
    printf "    \b\b\b\b"
}

# Function to print colored text with animation
print_animated() {
    local text="$1"
    local color="$2"
    local delay=0.03
    
    for ((i=0; i<${#text}; i++)); do
        printf "${color}%s${NC}" "${text:$i:1}"
        sleep $delay
    done
    echo
}

# Clear screen and show banner
clear

# Modern Minimalist Banner Design
echo -e ""
echo -e "${CYAN}┌──────────────────────────────────────────────────────────────┐${NC}"
echo -e "${CYAN}│${NC}                                                              ${CYAN}│${NC}"
echo -e "${CYAN}│${NC}  ${BLUE}██████╗ ██╗${NC}    ${PURPLE}██████╗ ███████╗███████╗ ██████╗${NC}  ${CYAN}│${NC}"
echo -e "${CYAN}│${NC}  ${BLUE}██╔══██╗██║${NC}    ${PURPLE}██╔══██╗██╔════╝██╔════╝██╔════╝${NC}  ${CYAN}│${NC}"
echo -e "${CYAN}│${NC}  ${BLUE}██████╔╝██║${NC}    ${PURPLE}██████╔╝█████╗  █████╗  ██║${NC}     ${CYAN}│${NC}"
echo -e "${CYAN}│${NC}  ${BLUE}██╔══██╗██║${NC}    ${PURPLE}██╔══██╗██╔══╝  ██╔══╝  ██║${NC}     ${CYAN}│${NC}"
echo -e "${CYAN}│${NC}  ${BLUE}██████╔╝███████╗${NC}  ${PURPLE}██████╔╝███████╗██║     ╚██████╗${NC}  ${CYAN}│${NC}"
echo -e "${CYAN}│${NC}  ${BLUE}╚═════╝ ╚══════╝${NC}   ${PURPLE}╚═════╝ ╚══════╝╚═╝      ╚═════╝${NC}   ${CYAN}│${NC}"
echo -e "${CYAN}│${NC}                                                              ${CYAN}│${NC}"
echo -e "${CYAN}│${NC}              ${MAGENTA}🤖 AI Debug Helper v2.0 🚀${NC}              ${CYAN}│${NC}"
echo -e "${CYAN}│${NC}           ${YELLOW}Intelligent JIRA Ticket Analysis${NC}           ${CYAN}│${NC}"
echo -e "${CYAN}│${NC}                                                              ${CYAN}│${NC}"
echo -e "${CYAN}└──────────────────────────────────────────────────────────────┘${NC}"
echo -e ""

# Progress bar function
show_progress() {
    local current=$1
    local total=$2
    local width=50
    local percentage=$((current * 100 / total))
    local filled=$((width * current / total))
    local empty=$((width - filled))
    
    printf "\r${CYAN}[${NC}"
    printf "${GREEN}%${filled}s${NC}" | tr ' ' '█'
    printf "${BLUE}%${empty}s${NC}" | tr ' ' '░'
    printf "${CYAN}]${NC} ${YELLOW}%d%%${NC}" $percentage
}

# Animated welcome message
print_animated "🚀 Initializing AI Debug Helper Installation..." "${MAGENTA}"
echo

# Detect OS and architecture with style
print_animated "🔍 Detecting your system..." "${CYAN}"
OS=$(uname -s | tr '[:upper:]' '[:lower:]')
ARCH=$(uname -m)

# Map architecture
if [ "$ARCH" = "x86_64" ]; then
    ARCH="x64"
elif [ "$ARCH" = "aarch64" ] || [ "$ARCH" = "arm64" ]; then
    ARCH="arm64"
fi

# Determine binary name and OS icon
if [ "$OS" = "darwin" ]; then
    BINARY_NAME="ai-debug-helper-macos"
    OS_NAME="macOS"
    OS_ICON="🍎"
elif [ "$OS" = "linux" ]; then
    BINARY_NAME="ai-debug-helper-linux-${ARCH}"
    OS_NAME="Linux"
    OS_ICON="🐧"
elif [[ "$OS" == *"mingw"* ]] || [[ "$OS" == *"cygwin"* ]]; then
    BINARY_NAME="ai-debug-helper-win-${ARCH}.exe"
    OS_NAME="Windows"
    OS_ICON="🪟"
else
    echo -e "${RED}❌ Unsupported operating system: $OS${NC}"
    exit 1
fi

echo -e "${GREEN}✅ Detected: ${OS_ICON} ${OS_NAME} (${ARCH})${NC}"
echo -e "${BLUE}📦 Binary: ${BINARY_NAME}${NC}"
echo

# Check for required tools
print_animated "🔧 Checking system requirements..." "${CYAN}"

# Check for curl or wget
if command -v curl &> /dev/null; then
    echo -e "${GREEN}✅ curl found${NC}"
    DOWNLOAD_CMD="curl"
elif command -v wget &> /dev/null; then
    echo -e "${GREEN}✅ wget found${NC}"
    DOWNLOAD_CMD="wget"
else
    echo -e "${RED}❌ Neither curl nor wget found${NC}"
    echo -e "${YELLOW}💡 Please install curl or wget and try again${NC}"
    exit 1
fi

echo

# Create installation directory
INSTALL_DIR="/usr/local/bin"
if [ ! -w "$INSTALL_DIR" ]; then
    echo -e "${YELLOW}⚠️  No write permission to ${INSTALL_DIR}${NC}"
    INSTALL_DIR="$HOME/.local/bin"
    mkdir -p "$INSTALL_DIR"
    echo -e "${BLUE}📁 Using: ${INSTALL_DIR}${NC}"
else
    echo -e "${GREEN}✅ Installation directory: ${INSTALL_DIR}${NC}"
fi

echo

# Download URL (replace with your actual release URL)
RELEASE_URL="https://github.com/nirajc4409/ai-analyzer/releases/latest/download/${BINARY_NAME}"

# Download with progress
print_animated "📥 Downloading AI Debug Helper..." "${MAGENTA}"
echo -e "${BLUE}🔗 URL: ${RELEASE_URL}${NC}"
echo

# Check if the URL is accessible first
print_animated "🔍 Checking URL accessibility..." "${CYAN}"
if [ "$DOWNLOAD_CMD" = "curl" ]; then
    # Use curl with verbose output to see what's happening
    echo -e "${BLUE}🔍 Testing URL with curl...${NC}"
    HTTP_CODE=$(curl -s -o /dev/null -w "%{http_code}" -L "$RELEASE_URL")
    echo -e "${BLUE}📊 HTTP Status Code: ${HTTP_CODE}${NC}"
elif [ "$DOWNLOAD_CMD" = "wget" ]; then
    echo -e "${BLUE}🔍 Testing URL with wget...${NC}"
    HTTP_CODE=$(wget --spider -S "$RELEASE_URL" 2>&1 | grep "HTTP/" | tail -1 | cut -d' ' -f2)
    echo -e "${BLUE}📊 HTTP Status Code: ${HTTP_CODE}${NC}"
fi

if [ "$HTTP_CODE" != "200" ]; then
    echo -e "${RED}❌ URL not accessible (HTTP $HTTP_CODE)${NC}"
    echo -e "${YELLOW}💡 Let's try a different approach...${NC}"
    
    # Try with different curl options
    echo -e "${BLUE}🔄 Trying with different curl options...${NC}"
    if [ "$DOWNLOAD_CMD" = "curl" ]; then
        # Try with user agent and follow redirects
        HTTP_CODE_ALT=$(curl -s -o /dev/null -w "%{http_code}" -L -H "User-Agent: Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36" "$RELEASE_URL")
        echo -e "${BLUE}📊 Alternative HTTP Status Code: ${HTTP_CODE_ALT}${NC}"
        
        if [ "$HTTP_CODE_ALT" = "200" ]; then
            echo -e "${GREEN}✅ URL accessible with user agent!${NC}"
            HTTP_CODE="200"
        else
            echo -e "${YELLOW}💡 Please check if the release exists at:${NC}"
            echo -e "${BLUE}   https://github.com/nirajc4409/ai-analyzer/releases${NC}"
            echo -e "${YELLOW}💡 Or verify the binary name: ${BINARY_NAME}${NC}"
            echo -e "${YELLOW}💡 You can also try downloading manually from:${NC}"
            echo -e "${BLUE}   $RELEASE_URL${NC}"
            exit 1
        fi
    fi
else
    echo -e "${GREEN}✅ URL is accessible${NC}"
fi
echo

# Download the binary with progress indicator
echo -e "${BLUE}📥 Starting download...${NC}"
if [ "$DOWNLOAD_CMD" = "curl" ]; then
    # Use curl with user agent and follow redirects
    curl -L -H "User-Agent: Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36" -o "/tmp/${BINARY_NAME}" "$RELEASE_URL" --progress-bar
    DOWNLOAD_EXIT_CODE=$?
elif [ "$DOWNLOAD_CMD" = "wget" ]; then
    wget -O "/tmp/${BINARY_NAME}" "$RELEASE_URL" --progress=bar:force --user-agent="Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36"
    DOWNLOAD_EXIT_CODE=$?
fi

if [ $DOWNLOAD_EXIT_CODE -ne 0 ]; then
    echo -e "${RED}❌ Download failed with exit code: $DOWNLOAD_EXIT_CODE${NC}"
    echo -e "${YELLOW}💡 Please check your internet connection and try again${NC}"
    exit 1
fi

# Check if file was downloaded and has content
if [ ! -f "/tmp/${BINARY_NAME}" ]; then
    echo -e "${RED}❌ Downloaded file not found!${NC}"
    exit 1
fi

FILE_SIZE=$(stat -f%z "/tmp/${BINARY_NAME}" 2>/dev/null || stat -c%s "/tmp/${BINARY_NAME}" 2>/dev/null || echo "0")
if [ "$FILE_SIZE" -eq 0 ]; then
    echo -e "${RED}❌ Downloaded file is empty!${NC}"
    echo -e "${YELLOW}💡 This might indicate the binary doesn't exist at the specified URL${NC}"
    exit 1
fi

echo -e "${GREEN}✅ Download completed! (${FILE_SIZE} bytes)${NC}"
echo

# Make executable
print_animated "🔐 Setting permissions..." "${CYAN}"
chmod +x "/tmp/${BINARY_NAME}"
if [ $? -ne 0 ]; then
    echo -e "${RED}❌ Failed to make binary executable!${NC}"
    exit 1
fi
echo -e "${GREEN}✅ Binary is now executable${NC}"
echo

# Install to system path
print_animated "📦 Installing to system..." "${MAGENTA}"
if [ "$INSTALL_DIR" = "/usr/local/bin" ]; then
    sudo mv "/tmp/${BINARY_NAME}" "${INSTALL_DIR}/ai-debug-helper"
    INSTALL_EXIT_CODE=$?
else
    mv "/tmp/${BINARY_NAME}" "${INSTALL_DIR}/ai-debug-helper"
    INSTALL_EXIT_CODE=$?
fi

if [ $INSTALL_EXIT_CODE -ne 0 ]; then
    echo -e "${RED}❌ Installation failed with exit code: $INSTALL_EXIT_CODE${NC}"
    echo -e "${YELLOW}💡 Check if you have write permissions to ${INSTALL_DIR}${NC}"
    exit 1
fi

# Verify installation
if [ ! -f "${INSTALL_DIR}/ai-debug-helper" ]; then
    echo -e "${RED}❌ Installation verification failed!${NC}"
    echo -e "${YELLOW}💡 The binary was not found at ${INSTALL_DIR}/ai-debug-helper${NC}"
    exit 1
fi

echo -e "${GREEN}✅ Installed to: ${INSTALL_DIR}/ai-debug-helper${NC}"
echo

# Add to PATH if using ~/.local/bin
if [ "$INSTALL_DIR" = "$HOME/.local/bin" ]; then
    print_animated "🔧 Configuring PATH..." "${CYAN}"
    
    # Add to bashrc
    if ! grep -q "$INSTALL_DIR" ~/.bashrc 2>/dev/null; then
        echo "export PATH=\"$INSTALL_DIR:\$PATH\"" >> ~/.bashrc
        echo -e "${GREEN}✅ Added to ~/.bashrc${NC}"
    fi
    
    # Add to zshrc
    if ! grep -q "$INSTALL_DIR" ~/.zshrc 2>/dev/null; then
        echo "export PATH=\"$INSTALL_DIR:\$PATH\"" >> ~/.zshrc
        echo -e "${GREEN}✅ Added to ~/.zshrc${NC}"
    fi
fi

echo

# Success celebration with new design
echo -e ""
echo -e "${GREEN}┌──────────────────────────────────────────────────────────────┐${NC}"
echo -e "${GREEN}│${NC}                                                              ${GREEN}│${NC}"
echo -e "${GREEN}│${NC}                    ${YELLOW}🎉 INSTALLATION COMPLETE! 🎉${NC}                    ${GREEN}│${NC}"
echo -e "${GREEN}│${NC}                                                              ${GREEN}│${NC}"
echo -e "${GREEN}└──────────────────────────────────────────────────────────────┘${NC}"
echo -e ""

# Next steps with style
echo -e "${MAGENTA}🚀 Your AI Debug Helper is ready to use!${NC}"
echo
echo -e "${YELLOW}📋 Next Steps:${NC}"
echo -e "${GREEN}1.${NC} ${CYAN}Configure your AI assistant:${NC}"
echo -e "   ${BLUE}   ai-debug-helper configure${NC}"
echo
echo -e "${GREEN}2.${NC} ${CYAN}Analyze your first JIRA ticket:${NC}"
echo -e "   ${BLUE}   ai-debug-helper analyze <ticket-id>${NC}"
echo
echo -e "${GREEN}3.${NC} ${CYAN}Get help and examples:${NC}"
echo -e "   ${BLUE}   ai-debug-helper --help${NC}"

if [ "$INSTALL_DIR" = "$HOME/.local/bin" ]; then
    echo
    echo -e "${ORANGE}💡 Note: If you installed to ~/.local/bin, restart your terminal or run:${NC}"
    echo -e "${BLUE}   source ~/.bashrc${NC} ${CYAN}or${NC} ${BLUE}source ~/.zshrc${NC}"
fi

echo
echo -e "${PURPLE}✨ Happy debugging with AI! 🤖🔍✨${NC}"
echo -e "${CYAN}   Your intelligent JIRA ticket analyzer is now at your service!${NC}"
echo 