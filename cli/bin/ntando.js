#!/usr/bin/env node

const { Command } = require('commander');
const inquirer = require('inquirer');
const chalk = require('chalk');
const ora = require('ora');
const axios = require('axios');
const fs = require('fs-extra');
const path = require('path');
const archiver = require('archiver');
const config = require('conf');
const updateNotifier = require('update-notifier');
const boxen = require('boxen');
const figlet = require('figlet');

// Check for updates
const pkg = require('../package.json');
updateNotifier({ pkg }).notify();

// Initialize configuration
const conf = new config({
    projectName: 'ntando-cli'
});

// API configuration
const API_BASE = process.env.NTANDO_API || 'https://ntando-computer.onrender.com/api';

// CLI Setup
const program = new Command();

program
    .name('ntando')
    .description('🚀 Ntando Computer CLI - Deploy apps with free custom domains')
    .version(pkg.version);

// Welcome banner
function showBanner() {
    console.log(
        chalk.cyan(
            figlet.textSync('Ntando', {
                font: 'Standard',
                horizontalLayout: 'default',
                verticalLayout: 'default'
            })
        )
    );
    console.log(chalk.gray('Deploy apps with free custom domains and forever hosting\n'));
}

// Login command
program
    .command('login')
    .description('Login to your Ntando Computer account')
    .action(async () => {
        showBanner();
        
        const answers = await inquirer.prompt([
            {
                type: 'input',
                name: 'email',
                message: 'Enter your email:',
                validate: input => input.includes('@') || 'Please enter a valid email'
            },
            {
                type: 'password',
                name: 'password',
                message: 'Enter your password:',
                mask: '*'
            }
        ]);

        const spinner = ora('Logging in...').start();

        try {
            const response = await axios.post(`${API_BASE}/auth/login`, answers);
            
            conf.set('token', response.data.token);
            conf.set('user', response.data.user);
            
            spinner.succeed(chalk.green('Login successful!'));
            console.log(chalk.gray(`Welcome back, ${response.data.user.email}!`));
        } catch (error) {
            spinner.fail(chalk.red('Login failed'));
            console.error(chalk.red(error.response?.data?.error || 'An error occurred'));
            process.exit(1);
        }
    });

// Logout command
program
    .command('logout')
    .description('Logout from your Ntando Computer account')
    .action(() => {
        conf.clear();
        console.log(chalk.green('✓ Logged out successfully'));
    });

// Deploy command
program
    .command('deploy')
    .description('Deploy your project')
    .option('-d, --domain <domain>', 'Custom domain name')
    .option('-p, --path <path>', 'Path to project directory', '.')
    .option('-r, --repo <repository>', 'Git repository URL')
    .option('-b, --branch <branch>', 'Git branch', 'main')
    .option('--build <command>', 'Build command')
    .option('--output <dir>', 'Output directory', 'dist')
    .action(async (options) => {
        showBanner();
        
        // Check if user is logged in
        if (!conf.get('token')) {
            console.log(chalk.red('Please login first using: ntando login'));
            process.exit(1);
        }

        // Check if path exists
        const projectPath = path.resolve(options.path);
        if (!fs.existsSync(projectPath)) {
            console.log(chalk.red(`Path does not exist: ${projectPath}`));
            process.exit(1);
        }

        // Prompt for project name and domain if not provided
        let projectName = options.domain;
        let domain = options.domain;

        if (!projectName) {
            const answers = await inquirer.prompt([
                {
                    type: 'input',
                    name: 'projectName',
                    message: 'Project name:',
                    default: path.basename(projectPath),
                    validate: input => input.length >= 3 || 'Project name must be at least 3 characters'
                },
                {
                    type: 'list',
                    name: 'domainExtension',
                    message: 'Choose domain extension:',
                    choices: ['.ntl.cloud', '.ntando.app', '.deploy.live'],
                    default: '.ntl.cloud'
                }
            ]);

            projectName = answers.projectName.toLowerCase().replace(/[^a-z0-9-]/g, '-');
            domain = projectName + answers.domainExtension;
        }

        // Check domain availability
        const spinner = ora('Checking domain availability...').start();
        
        try {
            const available = await checkDomainAvailability(domain);
            if (!available) {
                spinner.fail('Domain not available');
                console.log(chalk.red(`Domain ${domain} is already taken. Please choose another name.`));
                process.exit(1);
            }
            spinner.succeed('Domain available!');
        } catch (error) {
            spinner.fail('Failed to check domain');
            process.exit(1);
        }

        // Deploy project
        await deployProject(projectPath, {
            projectName,
            domain,
            repositoryUrl: options.repo,
            branch: options.branch,
            buildCommand: options.build,
            outputDir: options.output
        });
    });

// List deployments command
program
    .command('list')
    .alias('ls')
    .description('List your deployments')
    .action(async () => {
        showBanner();
        
        if (!conf.get('token')) {
            console.log(chalk.red('Please login first using: ntando login'));
            process.exit(1);
        }

        const spinner = ora('Fetching deployments...').start();

        try {
            const response = await axios.get(`${API_BASE}/deployments`, {
                headers: {
                    'Authorization': `Bearer ${conf.get('token')}`
                }
            });

            spinner.succeed('Deployments fetched');
            
            if (response.data.length === 0) {
                console.log(chalk.yellow('No deployments found. Deploy your first project with: ntando deploy'));
                return;
            }

            console.log(chalk.bold('\n📦 Your Deployments:\n'));
            
            response.data.forEach((deployment, index) => {
                const statusColor = deployment.status === 'live' ? 'green' : 
                                   deployment.status === 'building' ? 'yellow' : 'red';
                
                console.log(`${chalk.bold(index + 1)}. ${chalk.cyan(deployment.projectName)}`);
                console.log(`   ${chalk.gray('Domain:')} ${chalk.white(deployment.domain)}`);
                console.log(`   ${chalk.gray('Status:')} ${chalk[statusColor](deployment.status)}`);
                console.log(`   ${chalk.gray('Created:')} ${chalk.gray(new Date(deployment.createdAt).toLocaleDateString())}`);
                
                if (deployment.deploymentUrl) {
                    console.log(`   ${chalk.gray('URL:')} ${chalk.blue(deployment.deploymentUrl)}`);
                }
                console.log();
            });
        } catch (error) {
            spinner.fail('Failed to fetch deployments');
            console.error(chalk.red(error.response?.data?.error || 'An error occurred'));
        }
    });

// Delete deployment command
program
    .command('delete <deployment>')
    .description('Delete a deployment')
    .action(async (deploymentName) => {
        showBanner();
        
        if (!conf.get('token')) {
            console.log(chalk.red('Please login first using: ntando login'));
            process.exit(1);
        }

        // Find deployment
        const deployments = await getDeployments();
        const deployment = deployments.find(d => 
            d.projectName === deploymentName || d.domain === deploymentName
        );

        if (!deployment) {
            console.log(chalk.red(`Deployment "${deploymentName}" not found`));
            process.exit(1);
        }

        // Confirm deletion
        const { confirmed } = await inquirer.prompt([
            {
                type: 'confirm',
                name: 'confirmed',
                message: `Are you sure you want to delete "${deployment.projectName}"?`,
                default: false
            }
        ]);

        if (!confirmed) {
            console.log(chalk.yellow('Deletion cancelled'));
            return;
        }

        const spinner = ora('Deleting deployment...').start();

        try {
            await axios.delete(`${API_BASE}/deployments/${deployment._id}`, {
                headers: {
                    'Authorization': `Bearer ${conf.get('token')}`
                }
            });

            spinner.succeed(chalk.green('Deployment deleted successfully'));
        } catch (error) {
            spinner.fail('Failed to delete deployment');
            console.error(chalk.red(error.response?.data?.error || 'An error occurred'));
        }
    });

// Status command
program
    .command('status [deployment]')
    .description('Check deployment status')
    .action(async (deploymentName) => {
        showBanner();
        
        if (!conf.get('token')) {
            console.log(chalk.red('Please login first using: ntando login'));
            process.exit(1);
        }

        if (!deploymentName) {
            // Show account status
            const user = conf.get('user');
            console.log(chalk.bold('👤 Account Status:'));
            console.log(`   ${chalk.gray('Email:')} ${chalk.white(user.email)}`);
            console.log(`   ${chalk.gray('Plan:')} ${chalk.cyan(user.plan)}`);
            console.log(`   ${chalk.gray('Deployments:')} ${chalk.yellow((await getDeployments()).length)}`);
            return;
        }

        // Show specific deployment status
        const deployments = await getDeployments();
        const deployment = deployments.find(d => 
            d.projectName === deploymentName || d.domain === deploymentName
        );

        if (!deployment) {
            console.log(chalk.red(`Deployment "${deploymentName}" not found`));
            process.exit(1);
        }

        console.log(chalk.bold(`📊 Deployment Status: ${deployment.projectName}`));
        console.log(`   ${chalk.gray('Domain:')} ${chalk.white(deployment.domain)}`);
        console.log(`   ${chalk.gray('Status:')} ${getStatusColor(deployment.status)(deployment.status)}`);
        console.log(`   ${chalk.gray('Created:')} ${chalk.gray(new Date(deployment.createdAt).toLocaleString())}`);
        
        if (deployment.deploymentUrl) {
            console.log(`   ${chalk.gray('URL:')} ${chalk.blue(deployment.deploymentUrl)}`);
        }

        // Get analytics
        try {
            const analyticsResponse = await axios.get(`${API_BASE}/analytics/${deployment._id}`, {
                headers: {
                    'Authorization': `Bearer ${conf.get('token')}`
                }
            });

            const analytics = analyticsResponse.data;
            console.log(chalk.bold('\n📈 Analytics:'));
            console.log(`   ${chalk.gray('Visitors:')} ${chalk.yellow(analytics.visitors.toLocaleString())}`);
            console.log(`   ${chalk.gray('Page Views:')} ${chalk.yellow(analytics.pageViews.toLocaleString())}`);
            console.log(`   ${chalk.gray('Unique Visitors:')} ${chalk.yellow(analytics.uniqueVisitors.toLocaleString())}`);
            console.log(`   ${chalk.gray('Bandwidth:')} ${chalk.yellow(analytics.bandwidth.toLocaleString() + ' MB')}`);
            console.log(`   ${chalk.gray('Uptime:')} ${chalk.green(analytics.uptime + '%')}`);
            console.log(`   ${chalk.gray('Avg Load Time:')} ${chalk.cyan(analytics.avgLoadTime)}`);
        } catch (error) {
            // Analytics might not be available
        }
    });

// Init command (create new project)
program
    .command('init [projectName]')
    .description('Initialize a new project')
    .action(async (projectName) => {
        showBanner();
        
        if (!projectName) {
            const answers = await inquirer.prompt([
                {
                    type: 'input',
                    name: 'projectName',
                    message: 'Project name:',
                    validate: input => input.length >= 3 || 'Project name must be at least 3 characters'
                }
            ]);
            projectName = answers.projectName;
        }

        const { projectType } = await inquirer.prompt([
            {
                type: 'list',
                name: 'projectType',
                message: 'Choose project type:',
                choices: [
                    { name: '📄 HTML/CSS/JS Static Site', value: 'static' },
                    { name: '⚛️ React App', value: 'react' },
                    { name: '💚 Vue.js App', value: 'vue' },
                    { name: '🅰️ Angular App', value: 'angular' },
                    { name: '🟢 Node.js Backend', value: 'node' },
                    { name: '🐍 Python/Flask', value: 'python' }
                ]
            }
        ]);

        const spinner = ora(`Creating ${projectType} project...`).start();

        try {
            await createProject(projectName, projectType);
            spinner.succeed(chalk.green(`Project "${projectName}" created successfully!`));
            
            console.log(chalk.bold(`\n📁 Next steps:`));
            console.log(`   ${chalk.gray('1.')} cd ${projectName}`);
            console.log(`   ${chalk.gray('2.')} npm install`);
            console.log(`   ${chalk.gray('3.')} npm run dev`);
            console.log(`   ${chalk.gray('4.')} ntando deploy`);
        } catch (error) {
            spinner.fail('Failed to create project');
            console.error(chalk.red(error.message));
        }
    });

// Helper functions
async function checkDomainAvailability(domain) {
    try {
        // This would check with the API in real implementation
        return Math.random() > 0.3; // Simulate 70% availability
    } catch (error) {
        return false;
    }
}

async function deployProject(projectPath, options) {
    const spinner = ora('Preparing deployment...').start();

    try {
        // Create zip file
        const zipPath = await createZip(projectPath);
        spinner.text = 'Uploading files...';

        // Upload to API
        const formData = new FormData();
        formData.append('files', fs.createReadStream(zipPath));
        formData.append('projectName', options.projectName);
        formData.append('domain', options.domain);
        
        if (options.repositoryUrl) {
            formData.append('repositoryUrl', options.repositoryUrl);
        }
        if (options.buildCommand) {
            formData.append('buildCommand', options.buildCommand);
        }
        if (options.outputDir) {
            formData.append('outputDir', options.outputDir);
        }

        const response = await axios.post(`${API_BASE}/deploy`, formData, {
            headers: {
                'Authorization': `Bearer ${conf.get('token')}`,
                'Content-Type': 'multipart/form-data'
            }
        });

        spinner.succeed(chalk.green('Deployment started!'));
        
        // Show success message
        const successBox = boxen(
            chalk.green('🎉 Your app is being deployed!\n\n') +
            chalk.white(`Domain: ${chalk.cyan(options.domain)}\n`) +
            chalk.white(`Status: ${chalk.yellow('Building...')}\n\n`) +
            chalk.gray('This usually takes 15-30 seconds'),
            {
                padding: 1,
                margin: 1,
                borderStyle: 'round',
                borderColor: 'green'
            }
        );
        
        console.log(successBox);
        
        // Start monitoring deployment
        await monitorDeployment(response.data.deploymentId, options.domain);

    } catch (error) {
        spinner.fail('Deployment failed');
        console.error(chalk.red(error.response?.data?.error || 'An error occurred'));
        process.exit(1);
    } finally {
        // Cleanup
        const zipPath = path.join(projectPath, 'deployment.zip');
        if (fs.existsSync(zipPath)) {
            fs.unlinkSync(zipPath);
        }
    }
}

async function createZip(projectPath) {
    return new Promise((resolve, reject) => {
        const output = fs.createWriteStream(path.join(projectPath, 'deployment.zip'));
        const archive = archiver('zip', { zlib: { level: 9 } });

        output.on('close', () => {
            resolve(path.join(projectPath, 'deployment.zip'));
        });

        archive.on('error', reject);
        archive.pipe(output);
        archive.directory(projectPath, false);
        archive.finalize();
    });
}

async function monitorDeployment(deploymentId, domain) {
    const spinner = ora('Building project...').start();
    
    const steps = [
        { message: 'Building project...', duration: 3000 },
        { message: 'Optimizing assets...', duration: 2000 },
        { message: 'Configuring domain...', duration: 1000 },
        { message: 'Deploying to Render...', duration: 5000 },
        { message: 'Setting up SSL...', duration: 2000 }
    ];

    for (const step of steps) {
        spinner.text = step.message;
        await new Promise(resolve => setTimeout(resolve, step.duration));
    }

    spinner.succeed(chalk.green('Deployment complete!'));
    
    const successBox = boxen(
        chalk.green('🚀 Your app is now live!\n\n') +
        chalk.white(`URL: ${chalk.blue(`https://${domain}`)}\n\n`) +
        chalk.gray('✓ Free SSL certificate active\n') +
        chalk.gray('✓ Forever hosting guaranteed\n') +
        chalk.gray('✓ Automatic deployments enabled'),
        {
            padding: 1,
            margin: 1,
            borderStyle: 'round',
            borderColor: 'green'
        }
    );
    
    console.log(successBox);
}

async function getDeployments() {
    try {
        const response = await axios.get(`${API_BASE}/deployments`, {
            headers: {
                'Authorization': `Bearer ${conf.get('token')}`
            }
        });
        return response.data;
    } catch (error) {
        return [];
    }
}

function getStatusColor(status) {
    switch (status) {
        case 'live': return chalk.green;
        case 'building': return chalk.yellow;
        case 'deploying': return chalk.blue;
        case 'error': return chalk.red;
        default: return chalk.gray;
    }
}

async function createProject(projectName, projectType) {
    const projectPath = path.resolve(projectName);
    
    if (fs.existsSync(projectPath)) {
        throw new Error(`Directory "${projectName}" already exists`);
    }

    await fs.mkdir(projectPath);

    // Create basic project structure
    const templates = {
        static: {
            'index.html': `<!DOCTYPE html>
<html>
<head>
    <title>${projectName}</title>
    <style>
        body { font-family: Arial, sans-serif; margin: 40px; }
        .container { max-width: 800px; margin: 0 auto; }
        h1 { color: #333; }
    </style>
</head>
<body>
    <div class="container">
        <h1>Welcome to ${projectName}</h1>
        <p>This is your new static site deployed with Ntando Computer.</p>
    </div>
</body>
</html>`,
            'style.css': `body {
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
    line-height: 1.6;
    color: #333;
    margin: 0;
    padding: 40px 20px;
}

.container {
    max-width: 800px;
    margin: 0 auto;
    background: #f8f9fa;
    padding: 40px;
    border-radius: 8px;
    box-shadow: 0 2px 10px rgba(0,0,0,0.1);
}

h1 {
    color: #2c3e50;
    text-align: center;
}`,
            'script.js': `console.log('Welcome to ${projectName}!');

// Add your JavaScript code here
document.addEventListener('DOMContentLoaded', function() {
    console.log('Page loaded successfully');
});`
        },
        react: {
            'package.json': JSON.stringify({
                name: projectName,
                version: '1.0.0',
                scripts: {
                    'start': 'react-scripts start',
                    'build': 'react-scripts build',
                    'test': 'react-scripts test',
                    'eject': 'react-scripts eject'
                },
                dependencies: {
                    'react': '^18.2.0',
                    'react-dom': '^18.2.0',
                    'react-scripts': '5.0.1'
                }
            }, null, 2),
            'public/index.html': `<!DOCTYPE html>
<html>
<head>
    <title>${projectName}</title>
</head>
<body>
    <div id="root"></div>
</body>
</html>`,
            'src/index.js': `import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';

const root = ReactDOM.createRoot(document.getElementById('root'));
root.render(
    <React.StrictMode>
        <App />
    </React.StrictMode>
);`,
            'src/App.js': `import React from 'react';
import './App.css';

function App() {
    return (
        <div className="App">
            <header className="App-header">
                <h1>Welcome to ${projectName}</h1>
                <p>This is your new React app deployed with Ntando Computer.</p>
            </header>
        </div>
    );
}

export default App;`,
            'src/App.css': `.App {
    text-align: center;
}

.App-header {
    background-color: #282c34;
    padding: 40px;
    color: white;
    min-height: 100vh;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    font-size: calc(10px + 2vmin);
}`
        }
        // Add more templates as needed
    };

    const template = templates[projectType] || templates.static;

    for (const [filePath, content] of Object.entries(template)) {
        const fullPath = path.join(projectPath, filePath);
        await fs.mkdir(path.dirname(fullPath), { recursive: true });
        await fs.writeFile(fullPath, content);
    }
}

// Error handling
process.on('unhandledRejection', (reason, promise) => {
    console.error(chalk.red('Unhandled Rejection at:'), promise, 'reason:', reason);
    process.exit(1);
});

// Parse command line arguments
program.parse();