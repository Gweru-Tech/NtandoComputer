// Ntando Computer - Interactive JavaScript

// Global Variables
let currentTab = 'upload';
let deploymentInProgress = false;
let currentUser = null;

// DOM Elements
const modal = document.getElementById('deployModal');
const uploadArea = document.getElementById('uploadArea');
const fileInput = document.getElementById('fileInput');
const projectNameInput = document.getElementById('projectName');

// Initialize the application
document.addEventListener('DOMContentLoaded', function() {
    initializeApp();
});

function initializeApp() {
    setupEventListeners();
    setupAnimations();
    setupMobileMenu();
    setupFormValidation();
    setupDomainAvailability();
    setupDeploymentSimulation();
}

// Event Listeners Setup
function setupEventListeners() {
    // Navigation menu
    document.querySelectorAll('.nav-link').forEach(link => {
        link.addEventListener('click', smoothScroll);
    });

    // Deploy buttons
    document.querySelectorAll('.btn-primary').forEach(btn => {
        if (btn.textContent.includes('Deploy')) {
            btn.addEventListener('click', showDeployModal);
        }
    });

    // Modal controls
    document.querySelector('.close-btn').addEventListener('click', closeDeployModal);
    window.addEventListener('click', function(e) {
        if (e.target === modal) {
            closeDeployModal();
        }
    });

    // File upload
    uploadArea.addEventListener('click', () => fileInput.click());
    uploadArea.addEventListener('dragover', handleDragOver);
    uploadArea.addEventListener('drop', handleDrop);
    uploadArea.addEventListener('dragleave', handleDragLeave);
    fileInput.addEventListener('change', handleFileSelect);

    // Tab switching
    document.querySelectorAll('.tab-btn').forEach(btn => {
        btn.addEventListener('click', function() {
            switchTab(this.textContent.toLowerCase().replace(' ', ''));
        });
    });

    // Project name input for domain
    projectNameInput?.addEventListener('input', checkDomainAvailability);

    // GitHub repository validation
    const githubInput = document.querySelector('input[placeholder*="github"]');
    if (githubInput) {
        githubInput.addEventListener('blur', validateGitHubRepo);
    }

    // Keyboard shortcuts
    document.addEventListener('keydown', function(e) {
        if (e.key === 'Escape' && modal.style.display === 'block') {
            closeDeployModal();
        }
        if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
            e.preventDefault();
            showDeployModal();
        }
    });
}

// Mobile Menu Setup
function setupMobileMenu() {
    const hamburger = document.querySelector('.hamburger');
    const navMenu = document.querySelector('.nav-menu');

    hamburger.addEventListener('click', function() {
        hamburger.classList.toggle('active');
        navMenu.classList.toggle('active');
    });

    document.querySelectorAll('.nav-link').forEach(n => n.addEventListener('click', () => {
        hamburger.classList.remove('active');
        navMenu.classList.remove('active');
    }));
}

// Tab Switching
function switchTab(tab) {
    currentTab = tab;
    
    // Update tab buttons
    document.querySelectorAll('.tab-btn').forEach(btn => {
        btn.classList.remove('active');
    });
    event.target.classList.add('active');

    // Update tab content
    document.querySelectorAll('.tab-content').forEach(content => {
        content.classList.remove('active');
    });
    
    const tabMap = {
        'upload': 'uploadTab',
        'github': 'githubTab',
        'cli': 'cliTab'
    };
    
    const targetTab = document.getElementById(tabMap[tab] || 'uploadTab');
    if (targetTab) {
        targetTab.classList.add('active');
    }
}

// Modal Functions
function showDeployModal() {
    modal.style.display = 'block';
    document.body.style.overflow = 'hidden';
    setTimeout(() => {
        modal.querySelector('.modal-content').classList.add('fade-in-up');
    }, 10);
}

function closeDeployModal() {
    modal.style.display = 'none';
    document.body.style.overflow = 'auto';
    resetDeploymentForm();
}

// File Upload Functions
function handleDragOver(e) {
    e.preventDefault();
    uploadArea.style.borderColor = '#6366f1';
    uploadArea.style.background = 'rgba(99, 102, 241, 0.05)';
}

function handleDragLeave(e) {
    e.preventDefault();
    uploadArea.style.borderColor = '#475569';
    uploadArea.style.background = 'transparent';
}

function handleDrop(e) {
    e.preventDefault();
    uploadArea.style.borderColor = '#475569';
    uploadArea.style.background = 'transparent';
    
    const files = e.dataTransfer.files;
    handleFiles(files);
}

function handleFileSelect(e) {
    const files = e.target.files;
    handleFiles(files);
}

function handleFiles(files) {
    if (files.length === 0) return;
    
    // Validate files
    const validTypes = ['text/html', 'application/javascript', 'text/css', 'application/zip', 'application/x-zip-compressed'];
    const validFiles = Array.from(files).filter(file => 
        validTypes.includes(file.type) || 
        file.name.endsWith('.zip') || 
        file.name.endsWith('.html') || 
        file.name.endsWith('.js') || 
        file.name.endsWith('.css')
    );

    if (validFiles.length === 0) {
        showNotification('Please upload valid web files (HTML, CSS, JS, or ZIP)', 'error');
        return;
    }

    // Display file names
    uploadArea.innerHTML = `
        <i class="fas fa-check-circle" style="color: #10b981; font-size: 3rem; margin-bottom: 1rem;"></i>
        <h4 style="color: #10b981;">Files Selected</h4>
        <p style="color: #94a3b8;">${validFiles.length} file(s) ready to deploy</p>
        <div style="margin-top: 1rem; font-size: 0.85rem; color: #64748b;">
            ${validFiles.map(file => `• ${file.name} (${formatFileSize(file.size)})`).join('<br>')}
        </div>
    `;
}

function formatFileSize(bytes) {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return Math.round(bytes / Math.pow(k, i) * 100) / 100 + ' ' + sizes[i];
}

// Domain Availability Checker
function setupDomainAvailability() {
    let debounceTimer;
    projectNameInput?.addEventListener('input', function() {
        clearTimeout(debounceTimer);
        debounceTimer = setTimeout(checkDomainAvailability, 500);
    });
}

function checkDomainAvailability() {
    const projectName = projectNameInput.value.toLowerCase().replace(/[^a-z0-9-]/g, '');
    const domainSelect = document.querySelector('.domain-input-group select');
    const extension = domainSelect?.value || '.ntl.cloud';
    
    if (projectName.length < 3) {
        updateDomainStatus('Too short', 'error');
        return;
    }

    // Simulate domain availability check
    const availableDomains = [
        'my-awesome-app', 'cool-project', 'demo-site', 'test-app',
        'portfolio', 'blog', 'shop', 'dashboard', 'admin', 'api'
    ];

    setTimeout(() => {
        if (availableDomains.includes(projectName) || Math.random() > 0.3) {
            updateDomainStatus('Available! ✓', 'success');
        } else {
            updateDomainStatus('Taken', 'error');
        }
    }, 300);
}

function updateDomainStatus(message, type) {
    const suggestion = document.querySelector('.domain-suggestion');
    if (suggestion) {
        suggestion.textContent = message;
        suggestion.style.color = type === 'success' ? '#10b981' : '#ef4444';
    }
}

// GitHub Repository Validation
function validateGitHubRepo(e) {
    const repoUrl = e.target.value;
    const githubRegex = /^https:\/\/github\.com\/[^\/]+\/[^\/]+\/?$/;
    
    if (!githubRegex.test(repoUrl)) {
        showNotification('Please enter a valid GitHub repository URL', 'error');
        e.target.style.borderColor = '#ef4444';
    } else {
        e.target.style.borderColor = '#10b981';
        // Simulate repo validation
        setTimeout(() => {
            showNotification('Repository validated successfully!', 'success');
        }, 1000);
    }
}

// Deployment Simulation
function setupDeploymentSimulation() {
    // Add deployment progress simulation
    window.simulateDeployment = function() {
        return new Promise((resolve) => {
            const steps = [
                { message: 'Initializing deployment...', duration: 1000 },
                { message: 'Building project...', duration: 2000 },
                { message: 'Optimizing assets...', duration: 1500 },
                { message: 'Configuring domain...', duration: 1000 },
                { message: 'Deploying to Render...', duration: 3000 },
                { message: 'Setting up SSL certificate...', duration: 1000 }
            ];

            let currentStep = 0;
            const progressInterval = setInterval(() => {
                if (currentStep < steps.length) {
                    updateDeploymentProgress(steps[currentStep].message, 
                        (currentStep + 1) / steps.length * 100);
                    currentStep++;
                } else {
                    clearInterval(progressInterval);
                    resolve();
                }
            }, 100);
        });
    };
}

function startDeployment() {
    if (deploymentInProgress) return;

    const projectName = projectNameInput?.value || 'my-app';
    const domainSelect = document.querySelector('.domain-input-group select');
    const extension = domainSelect?.value || '.ntl.cloud';
    const domain = `${projectName.toLowerCase().replace(/[^a-z0-9-]/g, '')}${extension}`;

    // Validate form
    if (!validateDeploymentForm()) {
        return;
    }

    deploymentInProgress = true;
    
    // Create deployment progress modal
    showDeploymentProgress(domain);
    
    // Simulate deployment process
    simulateDeployment().then(() => {
        completeDeployment(domain);
    });
}

function validateDeploymentForm() {
    if (currentTab === 'upload') {
        const files = fileInput.files;
        if (files.length === 0) {
            showNotification('Please select files to upload', 'error');
            return false;
        }
    } else if (currentTab === 'github') {
        const githubInput = document.querySelector('input[placeholder*="github"]');
        if (!githubInput || !githubInput.value) {
            showNotification('Please enter a GitHub repository URL', 'error');
            return false;
        }
    }

    const projectName = projectNameInput?.value;
    if (!projectName || projectName.length < 3) {
        showNotification('Project name must be at least 3 characters', 'error');
        return false;
    }

    return true;
}

function showDeploymentProgress(domain) {
    const progressHTML = `
        <div class="deployment-progress-modal" style="
            position: fixed;
            top: 0;
            left: 0;
            width: 100%;
            height: 100%;
            background: rgba(0, 0, 0, 0.9);
            display: flex;
            align-items: center;
            justify-content: center;
            z-index: 3000;
        ">
            <div class="deployment-progress-content" style="
                background: var(--card-bg);
                padding: 3rem;
                border-radius: 1rem;
                text-align: center;
                max-width: 500px;
                border: 1px solid var(--border-color);
            ">
                <div class="deployment-spinner" style="
                    width: 60px;
                    height: 60px;
                    border: 3px solid var(--border-color);
                    border-top: 3px solid var(--primary-color);
                    border-radius: 50%;
                    animation: spin 1s linear infinite;
                    margin: 0 auto 2rem;
                "></div>
                <h3 style="font-size: 1.5rem; font-weight: 600; margin-bottom: 1rem;">
                    Deploying to ${domain}
                </h3>
                <div class="deployment-status" style="color: var(--text-secondary); margin-bottom: 2rem;">
                    Initializing deployment...
                </div>
                <div class="deployment-progress-bar" style="
                    width: 100%;
                    height: 6px;
                    background: var(--dark-bg);
                    border-radius: 3px;
                    overflow: hidden;
                    margin-bottom: 1rem;
                ">
                    <div class="deployment-progress-fill" style="
                        width: 0%;
                        height: 100%;
                        background: var(--primary-color);
                        transition: width 0.3s ease;
                    "></div>
                </div>
                <p style="font-size: 0.85rem; color: var(--text-secondary);">
                    This usually takes 10-15 seconds
                </p>
            </div>
        </div>
    `;

    document.body.insertAdjacentHTML('beforeend', progressHTML);
    addSpinnerAnimation();
}

function updateDeploymentProgress(message, percentage) {
    const statusElement = document.querySelector('.deployment-status');
    const progressFill = document.querySelector('.deployment-progress-fill');
    
    if (statusElement) statusElement.textContent = message;
    if (progressFill) progressFill.style.width = `${percentage}%`;
}

function completeDeployment(domain) {
    // Update progress modal with success
    const progressModal = document.querySelector('.deployment-progress-modal');
    if (progressModal) {
        progressModal.querySelector('.deployment-spinner').style.display = 'none';
        progressModal.querySelector('.deployment-progress-content').innerHTML = `
            <i class="fas fa-check-circle" style="
                font-size: 4rem;
                color: #10b981;
                margin-bottom: 2rem;
            "></i>
            <h3 style="font-size: 1.5rem; font-weight: 600; margin-bottom: 1rem;">
                🎉 Deployment Successful!
            </h3>
            <p style="color: var(--text-secondary); margin-bottom: 2rem;">
                Your app is now live at:
            </p>
            <div style="
                background: var(--dark-bg);
                padding: 1rem;
                border-radius: 0.5rem;
                margin-bottom: 2rem;
                border: 1px solid var(--border-color);
            ">
                <a href="https://${domain}" target="_blank" style="
                    color: var(--primary-color);
                    text-decoration: none;
                    font-weight: 600;
                    font-size: 1.1rem;
                ">https://${domain} <i class="fas fa-external-link-alt"></i></a>
            </div>
            <div style="display: flex; gap: 1rem; justify-content: center;">
                <button onclick="window.open('https://${domain}', '_blank')" class="btn-primary">
                    <i class="fas fa-eye"></i> View Site
                </button>
                <button onclick="closeDeploymentModal()" class="btn-secondary">
                    Close
                </button>
            </div>
            <p style="margin-top: 2rem; font-size: 0.85rem; color: var(--text-secondary);">
                • Free SSL certificate active<br>
                • Automatic deployments enabled<br>
                • Forever hosting guaranteed
            </p>
        `;
    }

    // Add to recent deployments
    addToRecentDeployments(domain);
    
    deploymentInProgress = false;
    closeDeployModal();
}

function closeDeploymentModal() {
    const progressModal = document.querySelector('.deployment-progress-modal');
    if (progressModal) {
        progressModal.remove();
    }
}

function addToRecentDeployments(domain) {
    const deploymentList = document.querySelector('.deployment-list');
    if (deploymentList) {
        const newDeployment = `
            <div class="deployment-item fade-in-up">
                <div class="deployment-info">
                    <h5>${domain.split('.')[0]}</h5>
                    <p>${domain}</p>
                </div>
                <div class="deployment-status">
                    <span class="status-badge success">Live</span>
                    <span class="deployment-time">Just now</span>
                </div>
            </div>
        `;
        deploymentList.insertAdjacentHTML('afterbegin', newDeployment);
        
        // Remove old deployments if more than 5
        const items = deploymentList.querySelectorAll('.deployment-item');
        if (items.length > 5) {
            items[items.length - 1].remove();
        }
    }
}

// Notification System
function showNotification(message, type = 'info') {
    const notification = document.createElement('div');
    notification.className = `notification ${type}`;
    notification.innerHTML = `
        <i class="fas fa-${type === 'success' ? 'check-circle' : type === 'error' ? 'exclamation-circle' : 'info-circle'}"></i>
        <span>${message}</span>
    `;
    
    // Style notification
    notification.style.cssText = `
        position: fixed;
        top: 20px;
        right: 20px;
        background: ${type === 'success' ? 'rgba(16, 185, 129, 0.1)' : type === 'error' ? 'rgba(239, 68, 68, 0.1)' : 'rgba(99, 102, 241, 0.1)'};
        border: 1px solid ${type === 'success' ? '#10b981' : type === 'error' ? '#ef4444' : '#6366f1'};
        color: ${type === 'success' ? '#10b981' : type === 'error' ? '#ef4444' : '#6366f1'};
        padding: 1rem 1.5rem;
        border-radius: 0.5rem;
        display: flex;
        align-items: center;
        gap: 0.75rem;
        z-index: 4000;
        animation: slideInRight 0.3s ease-out;
    `;

    document.body.appendChild(notification);

    // Auto remove after 5 seconds
    setTimeout(() => {
        notification.style.animation = 'slideOutRight 0.3s ease-out';
        setTimeout(() => notification.remove(), 300);
    }, 5000);
}

// Form Validation
function setupFormValidation() {
    const inputs = document.querySelectorAll('input[required]');
    inputs.forEach(input => {
        input.addEventListener('blur', function() {
            validateField(this);
        });
    });
}

function validateField(field) {
    if (!field.value.trim()) {
        field.style.borderColor = '#ef4444';
        return false;
    }
    field.style.borderColor = '#10b981';
    return true;
}

function resetDeploymentForm() {
    fileInput.value = '';
    uploadArea.innerHTML = `
        <i class="fas fa-cloud-upload-alt"></i>
        <h4>Drag & Drop your files here</h4>
        <p>or click to browse</p>
    `;
    projectNameInput.value = '';
    document.querySelector('input[placeholder*="github"]').value = '';
    currentTab = 'upload';
    switchTab('upload');
}

// Smooth Scrolling
function smoothScroll(e) {
    e.preventDefault();
    const targetId = this.getAttribute('href');
    if (targetId === '#') return;
    
    const targetSection = document.querySelector(targetId);
    if (targetSection) {
        targetSection.scrollIntoView({
            behavior: 'smooth',
            block: 'start'
        });
    }
}

function scrollToSection(sectionId) {
    const section = document.getElementById(sectionId);
    if (section) {
        section.scrollIntoView({
            behavior: 'smooth',
            block: 'start'
        });
    }
}

// Animations
function setupAnimations() {
    // Intersection Observer for fade-in animations
    const observerOptions = {
        threshold: 0.1,
        rootMargin: '0px 0px -50px 0px'
    };

    const observer = new IntersectionObserver((entries) => {
        entries.forEach(entry => {
            if (entry.isIntersecting) {
                entry.target.classList.add('fade-in-up');
            }
        });
    }, observerOptions);

    // Observe elements
    document.querySelectorAll('.feature-card, .stat-card, .tech-category').forEach(el => {
        observer.observe(el);
    });
}

// Add CSS animations dynamically
function addSpinnerAnimation() {
    const style = document.createElement('style');
    style.textContent = `
        @keyframes spin {
            0% { transform: rotate(0deg); }
            100% { transform: rotate(360deg); }
        }
        @keyframes slideInRight {
            from {
                transform: translateX(100%);
                opacity: 0;
            }
            to {
                transform: translateX(0);
                opacity: 1;
            }
        }
        @keyframes slideOutRight {
            from {
                transform: translateX(0);
                opacity: 1;
            }
            to {
                transform: translateX(100%);
                opacity: 0;
            }
        }
    `;
    document.head.appendChild(style);
}

// Analytics Simulation (for demo purposes)
function simulateAnalytics() {
    const visitorCount = document.querySelector('.stat-card h4');
    if (visitorCount && visitorCount.textContent.includes('K')) {
        setInterval(() => {
            const currentValue = parseFloat(visitorCount.textContent);
            const newValue = (currentValue + Math.random() * 0.1).toFixed(1);
            visitorCount.textContent = `${newValue}K`;
        }, 5000);
    }
}

// Initialize analytics after page load
setTimeout(simulateAnalytics, 2000);

// Console welcome message
console.log('%c🚀 Ntando Computer - Deploy Apps with Free Custom Domains', 'font-size: 20px; color: #6366f1; font-weight: bold;');
console.log('%cBuilt with ❤️ for developers worldwide', 'font-size: 14px; color: #94a3b8;');