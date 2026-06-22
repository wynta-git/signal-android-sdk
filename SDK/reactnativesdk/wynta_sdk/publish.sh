#!/usr/bin/env bash

# Exit on error for safety
set -e

# Color definitions for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[0;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
NC='\033[0m' # No Color

# Print header
echo -e "${CYAN}==================================================${NC}"
echo -e "${CYAN}        Wynta SDK Release & Publish Script        ${NC}"
echo -e "${CYAN}==================================================${NC}"

# Navigate to the script's directory (ensures paths are relative to this directory)
cd "$(dirname "$0")"

# -------------------------------------------------------------
# 1. NPM Credentials Check
# -------------------------------------------------------------
echo -e "\n${BLUE}[1/5] Checking NPM Authentication...${NC}"
if ! npm whoami > /dev/null 2>&1; then
    echo -e "${YELLOW}Warning: You do not appear to be logged in to npm.${NC}"
    echo -e "${YELLOW}Please run 'npm login' first if you expect npm publish to succeed.${NC}"
    read -p "Do you want to proceed with the publish process anyway? (y/N): " -r CONTINUE_LATER
    if [[ ! $CONTINUE_LATER =~ ^[Yy]$ ]]; then
        echo -e "${RED}Publication aborted.${NC}"
        exit 1
    fi
else
    NPM_USER=$(npm whoami)
    echo -e "${GREEN}✓ Logged in to NPM as user: ${NPM_USER}${NC}"
fi

# -------------------------------------------------------------
# 2. Check Package Information & Version
# -------------------------------------------------------------
PACKAGE_NAME=$(node -p "require('./package.json').name")
LOCAL_VERSION=$(node -p "require('./package.json').version")

echo -e "\n${BLUE}[2/5] Checking Package Versions...${NC}"
echo -e "${CYAN}Package Name:${NC}      $PACKAGE_NAME"
echo -e "${CYAN}Current Local:${NC}     $LOCAL_VERSION"

echo -e "Fetching current published version from npm registry..."
# Fetch the version from registry (silently ignore if not published yet)
PUBLISHED_VERSION=$(npm view "$PACKAGE_NAME" version 2>/dev/null || echo "Not published")
echo -e "${CYAN}Current Published:${NC} $PUBLISHED_VERSION"

# -------------------------------------------------------------
# 3. Determine Bump Type
# -------------------------------------------------------------
BUMP_TYPE=$1

if [ -z "$BUMP_TYPE" ]; then
    echo -e "\n${BLUE}Select the version bump type for this release:${NC}"
    echo -e "1) ${GREEN}patch${NC}   (Bug Fixes: e.g., 1.0.0 → 1.0.1)"
    echo -e "2) ${GREEN}minor${NC}   (New Features: e.g., 1.0.0 → 1.1.0)"
    echo -e "3) ${GREEN}major${NC}   (Breaking Changes: e.g., 1.0.0 → 2.0.0)"
    echo -e "4) ${YELLOW}custom${NC}  (Enter a specific version manually)"
    echo -e "5) ${RED}none${NC}    (Skip bump, publish current local version: $LOCAL_VERSION)"
    
    read -p "Enter choice (1-5): " CHOICE
    case $CHOICE in
        1) BUMP_TYPE="patch" ;;
        2) BUMP_TYPE="minor" ;;
        3) BUMP_TYPE="major" ;;
        4) 
            read -p "Enter custom version (e.g. 1.0.1): " CUSTOM_VER
            BUMP_TYPE="$CUSTOM_VER"
            ;;
        5) BUMP_TYPE="none" ;;
        *) 
            echo -e "${RED}Invalid choice. Aborting.${NC}"
            exit 1
            ;;
    esac
fi

# Validate choice
if [ "$BUMP_TYPE" != "patch" ] && [ "$BUMP_TYPE" != "minor" ] && [ "$BUMP_TYPE" != "major" ] && [ "$BUMP_TYPE" != "none" ] && [[ ! "$BUMP_TYPE" =~ ^[0-9]+\.[0-9]+\.[0-9]+ ]]; then
    echo -e "${RED}Error: Invalid version or bump type: '$BUMP_TYPE'${NC}"
    echo -e "Must be 'patch', 'minor', 'major', 'none', or a valid semver pattern (e.g., '1.0.1')."
    exit 1
fi

# -------------------------------------------------------------
# 4. Build SDK
# -------------------------------------------------------------
echo -e "\n${BLUE}[3/5] Building the SDK...${NC}"
echo -e "Running 'npm run build'..."

# Temporarily disable set -e to check status of build command
set +e
npm run build
BUILD_STATUS=$?
set -e

if [ $BUILD_STATUS -ne 0 ]; then
    echo -e "${RED}Error: Build failed! Please fix typescript / compile errors first.${NC}"
    exit 1
fi
echo -e "${GREEN}✓ SDK Build succeeded.${NC}"

# Verify dist folder has files
if [ ! -d "dist" ] || [ -z "$(ls -A dist 2>/dev/null)" ]; then
    echo -e "${RED}Error: The 'dist' directory is missing or empty. Verification failed!${NC}"
    exit 1
else
    echo -e "${GREEN}✓ Verified build output in dist/:${NC}"
    ls -l dist
fi

# -------------------------------------------------------------
# 5. Increase/Bump Version
# -------------------------------------------------------------
GIT_FLAG=""
if [ "$BUMP_TYPE" != "none" ]; then
    echo -e "\n${BLUE}[4/5] Updating Version...${NC}"
    
    # Check for uncommitted changes in git repository
    if ! git diff-index --quiet HEAD -- 2>/dev/null; then
        echo -e "${YELLOW}Warning: Your git working directory is dirty (uncommitted changes exist).${NC}"
        echo -e "Running standard 'npm version' will fail if git changes are uncommitted."
        echo -e "Choose how to proceed:"
        echo -e "1) Run npm version with ${YELLOW}--no-git-tag-version${NC} (Recommended: only edits package.json)"
        echo -e "2) Run standard npm version (may fail due to uncommitted files)"
        echo -e "3) Abort release"
        read -p "Choice (1-3): " GIT_CHOICE
        case $GIT_CHOICE in
            1) GIT_FLAG="--no-git-tag-version" ;;
            2) GIT_FLAG="" ;;
            *) 
                echo -e "${RED}Aborting publication.${NC}"
                exit 1
                ;;
        esac
    fi
    
    echo -e "Running: npm version $BUMP_TYPE $GIT_FLAG"
    set +e
    NEW_VERSION=$(npm version "$BUMP_TYPE" $GIT_FLAG)
    VERSION_STATUS=$?
    set -e
    
    if [ $VERSION_STATUS -ne 0 ]; then
        echo -e "${RED}Error: Failed to bump version.${NC}"
        exit 1
    fi
    echo -e "${GREEN}✓ Updated local package.json version to: ${NEW_VERSION}${NC}"
else
    echo -e "\n${BLUE}[4/5] Skipping version bump (using current local version $LOCAL_VERSION)...${NC}"
fi

# -------------------------------------------------------------
# 6. Publish to NPM
# -------------------------------------------------------------
echo -e "\n${BLUE}[5/5] Publishing to NPM Registry...${NC}"
echo -e "${YELLOW}If NPM asks for a 2FA OTP code, please enter it when prompted.${NC}"

set +e
npm publish
PUBLISH_STATUS=$?
set -e

if [ $PUBLISH_STATUS -ne 0 ]; then
    echo -e "${RED}Error: npm publish failed!${NC}"
    exit 1
fi
echo -e "${GREEN}✓ Package published successfully!${NC}"

# -------------------------------------------------------------
# 7. Verification of Published Version
# -------------------------------------------------------------
echo -e "\n${BLUE}Verifying published version on npm...${NC}"
echo -e "Waiting 3 seconds for registry cache update..."
sleep 3

FINAL_PUBLISHED_VERSION=$(npm view "$PACKAGE_NAME" version 2>/dev/null || echo "Unknown")
echo -e "${GREEN}✓ Verification complete. Latest version on npm is: ${FINAL_PUBLISHED_VERSION}${NC}"

echo -e "\n${GREEN}==================================================${NC}"
echo -e "${GREEN}       SDK Re-publish Successfully Completed!     ${NC}"
echo -e "${GREEN}==================================================${NC}"
