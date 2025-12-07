#!/bin/bash

###############################################################################
# Git Secrets Cleanup Script
# Removes sensitive files from git history using BFG Repo-Cleaner
#
# WARNING: This rewrites git history and requires force push!
#
# Prerequisites:
#   - BFG Repo-Cleaner (https://rtyley.github.io/bfg-repo-cleaner/)
#   - Java installed
#   - Git repository backup
#
# Usage:
#   bash scripts/clean-git-secrets.sh
###############################################################################

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
NC='\033[0m' # No Color

# Functions
log_info() {
    echo -e "${CYAN}ℹ${NC} $1"
}

log_success() {
    echo -e "${GREEN}✓${NC} $1"
}

log_error() {
    echo -e "${RED}✗${NC} $1"
}

log_warn() {
    echo -e "${YELLOW}⚠${NC} $1"
}

# Check prerequisites
check_prerequisites() {
    log_info "Checking prerequisites..."

    # Check if BFG is installed
    if ! command -v bfg &> /dev/null; then
        log_error "BFG Repo-Cleaner not found!"
        log_info "Download from: https://rtyley.github.io/bfg-repo-cleaner/"
        log_info "Or install with: brew install bfg (macOS) / choco install bfg (Windows)"
        exit 1
    fi

    # Check if Java is installed
    if ! command -v java &> /dev/null; then
        log_error "Java not found! BFG requires Java."
        log_info "Download from: https://www.java.com/download/"
        exit 1
    fi

    # Check if in git repository
    if ! git rev-parse --git-dir > /dev/null 2>&1; then
        log_error "Not in a git repository!"
        exit 1
    fi

    log_success "All prerequisites met"
}

# Create backup
create_backup() {
    log_info "Creating repository backup..."

    BACKUP_DIR="../noctural-backup-$(date +%Y%m%d-%H%M%S)"

    git clone --mirror . "$BACKUP_DIR"

    if [ $? -eq 0 ]; then
        log_success "Backup created: $BACKUP_DIR"
    else
        log_error "Backup failed!"
        exit 1
    fi
}

# Create files to remove list
create_removal_list() {
    log_info "Creating list of sensitive files to remove..."

    cat > /tmp/bfg-remove-files.txt << EOF
.env
.env.local
.env.development
.env.production
.env.staging
.env.test
*.env
config/secrets.js
config/credentials.json
*.pem
*.key
*.p12
*.pfx
id_rsa
id_dsa
*.cert
serviceAccountKey.json
firebase-credentials.json
aws-credentials.json
EOF

    log_success "Removal list created"
}

# Run BFG to remove files
remove_sensitive_files() {
    log_info "Removing sensitive files from git history..."

    bfg --delete-files .env --no-blob-protection
    bfg --delete-files '*.env' --no-blob-protection
    bfg --delete-files 'secrets.js' --no-blob-protection
    bfg --delete-files 'credentials.json' --no-blob-protection
    bfg --delete-files '*.pem' --no-blob-protection
    bfg --delete-files '*.key' --no-blob-protection
    bfg --delete-files 'serviceAccountKey.json' --no-blob-protection

    if [ $? -eq 0 ]; then
        log_success "Sensitive files removed from history"
    else
        log_error "BFG failed!"
        exit 1
    fi
}

# Clean and expire reflog
clean_reflog() {
    log_info "Cleaning and expiring reflog..."

    git reflog expire --expire=now --all
    git gc --prune=now --aggressive

    log_success "Reflog cleaned"
}

# Verify cleanup
verify_cleanup() {
    log_info "Verifying cleanup..."

    # Check if .env still in history
    if git log --all --full-history -- .env | grep -q .; then
        log_warn ".env found in history (may be in protected commits)"
    else
        log_success ".env removed from history"
    fi

    # Show repository size change
    du -sh .git
}

# Show next steps
show_next_steps() {
    echo ""
    echo "=================================================================="
    log_success "GIT SECRETS CLEANUP COMPLETE"
    echo "=================================================================="
    echo ""
    log_warn "NEXT STEPS:"
    echo ""
    echo "1. Review changes:"
    echo "   git log --oneline --graph --all"
    echo ""
    echo "2. Force push to remote (DESTRUCTIVE!):"
    echo "   git push origin --force --all"
    echo "   git push origin --force --tags"
    echo ""
    echo "3. Notify all team members to re-clone repository:"
    echo "   git clone <repository-url>"
    echo ""
    echo "4. Rotate all secrets that were in history:"
    echo "   node scripts/rotate-secrets.js --all"
    echo ""
    echo "5. Update CI/CD secrets"
    echo ""
    echo "6. Add secrets to .gitignore (already done)"
    echo ""
    log_error "WARNING: All team members must delete and re-clone!"
    log_error "Old clones will have mismatched history!"
    echo ""
    echo "=================================================================="
}

# Main execution
main() {
    echo ""
    echo "=================================================================="
    echo "  NOCTURNAL PLATFORM - GIT SECRETS CLEANUP"
    echo "=================================================================="
    echo ""

    log_warn "WARNING: This will rewrite git history!"
    log_warn "All team members will need to re-clone the repository!"
    echo ""
    read -p "Do you want to continue? (yes/no): " confirm

    if [ "$confirm" != "yes" ]; then
        log_info "Cleanup cancelled"
        exit 0
    fi

    check_prerequisites
    create_backup
    create_removal_list
    remove_sensitive_files
    clean_reflog
    verify_cleanup
    show_next_steps
}

# Run main function
main
