const express = require('express');
const multer = require('multer');
const cors = require('cors');
const path = require('path');
const fs = require('fs').promises;
const axios = require('axios');
const archiver = require('archiver');
const unzipper = require('unzipper');
const { v4: uuidv4 } = require('uuid');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const mongoose = require('mongoose');
const cron = require('cron');
const sharp = require('sharp');

// Initialize Express app
const app = express();
const PORT = process.env.PORT || 3000;

// Security middleware
app.use(helmet());
app.use(cors({
    origin: ['http://localhost:8050', 'https://ntando-computer.onrender.com'],
    credentials: true
}));

// Rate limiting
const limiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 100, // limit each IP to 100 requests per windowMs
    message: 'Too many requests from this IP, please try again later.'
});
app.use('/api/', limiter);

// Body parsing middleware
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

// File upload configuration
const storage = multer.diskStorage({
    destination: async (req, file, cb) => {
        const uploadDir = path.join(__dirname, 'uploads', req.deploymentId);
        await fs.mkdir(uploadDir, { recursive: true });
        cb(null, uploadDir);
    },
    filename: (req, file, cb) => {
        cb(null, file.originalname);
    }
});

const upload = multer({ 
    storage: storage,
    limits: { fileSize: 100 * 1024 * 1024 }, // 100MB limit
    fileFilter: (req, file, cb) => {
        const allowedTypes = [
            'text/html',
            'application/javascript',
            'text/css',
            'application/zip',
            'application/x-zip-compressed',
            'image/jpeg',
            'image/png',
            'image/svg+xml',
            'image/webp'
        ];
        
        if (allowedTypes.includes(file.type) || 
            file.originalname.endsWith('.zip') || 
            file.originalname.endsWith('.html') || 
            file.originalname.endsWith('.js') || 
            file.originalname.endsWith('.css')) {
            cb(null, true);
        } else {
            cb(new Error('Invalid file type'), false);
        }
    }
});

// Database connection
mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:ntando-computer', {
    useNewUrlParser: true,
    useUnifiedTopology: true
});

// Database schemas
const userSchema = new mongoose.Schema({
    email: { type: String, required: true, unique: true },
    password: { type: String, required: true },
    plan: { type: String, default: 'free' },
    deployments: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Deployment' }],
    createdAt: { type: Date, default: Date.now }
});

const deploymentSchema = new mongoose.Schema({
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    projectName: { type: String, required: true },
    domain: { type: String, required: true, unique: true },
    repositoryUrl: String,
    branch: { type: String, default: 'main' },
    buildCommand: String,
    outputDir: { type: String, default: 'dist' },
    status: { type: String, enum: ['building', 'deploying', 'live', 'error'], default: 'building' },
    renderServiceId: String,
    deploymentUrl: String,
    sslEnabled: { type: Boolean, default: true },
    customDomain: String,
    createdAt: { type: Date, default: Date.now },
    updatedAt: { type: Date, default: Date.now },
    metrics: {
        visitors: { type: Number, default: 0 },
        bandwidth: { type: Number, default: 0 },
        uptime: { type: Number, default: 100 }
    }
});

const User = mongoose.model('User', userSchema);
const Deployment = mongoose.model('Deployment', deploymentSchema);

// JWT middleware
const authenticateToken = (req, res, next) => {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];

    if (!token) {
        return res.status(401).json({ error: 'Access token required' });
    }

    jwt.verify(token, process.env.JWT_SECRET || 'your-secret-key', (err, user) => {
        if (err) return res.status(403).json({ error: 'Invalid token' });
        req.user = user;
        next();
    });
};

// Domain availability checker
async function checkDomainAvailability(domain) {
    try {
        const existingDeployment = await Deployment.findOne({ domain });
        return !existingDeployment;
    } catch (error) {
        console.error('Error checking domain availability:', error);
        return false;
    }
}

// Render.com API integration
class RenderAPIClient {
    constructor() {
        this.apiKey = process.env.RENDER_API_KEY;
        this.baseURL = 'https://api.render.com/v1';
    }

    async createStaticSite(projectName, repoUrl = null) {
        try {
            const payload = {
                name: projectName,
                serviceId: `srv-${uuidv4()}`,
                type: 'static_site',
                repo: repoUrl || 'https://github.com/ntando-computer/template-static-site',
                branch: 'main',
                buildCommand: 'npm run build',
                publishDir: './dist',
                envVars: [
                    { key: 'NODE_ENV', value: 'production' }
                ]
            };

            const response = await axios.post(`${this.baseURL}/services`, payload, {
                headers: {
                    'Authorization': `Bearer ${this.apiKey}`,
                    'Content-Type': 'application/json'
                }
            });

            return response.data;
        } catch (error) {
            console.error('Render API error:', error.response?.data || error.message);
            throw error;
        }
    }

    async getServiceStatus(serviceId) {
        try {
            const response = await axios.get(`${this.baseURL}/services/${serviceId}`, {
                headers: {
                    'Authorization': `Bearer ${this.apiKey}`
                }
            });
            return response.data;
        } catch (error) {
            console.error('Error getting service status:', error);
            throw error;
        }
    }

    async addCustomDomain(serviceId, domain) {
        try {
            const payload = {
                customDomain: domain
            };

            const response = await axios.post(`${this.baseURL}/services/${serviceId}/custom-domains`, payload, {
                headers: {
                    'Authorization': `Bearer ${this.apiKey}`,
                    'Content-Type': 'application/json'
                }
            });

            return response.data;
        } catch (error) {
            console.error('Error adding custom domain:', error);
            throw error;
        }
    }
}

const renderClient = new RenderAPIClient();

// Routes
app.get('/', (req, res) => {
    res.json({ 
        message: '🚀 Ntando Computer API',
        version: '1.0.0',
        status: 'running'
    });
});

// Authentication routes
app.post('/api/auth/register', async (req, res) => {
    try {
        const { email, password } = req.body;

        if (!email || !password) {
            return res.status(400).json({ error: 'Email and password required' });
        }

        const existingUser = await User.findOne({ email });
        if (existingUser) {
            return res.status(400).json({ error: 'User already exists' });
        }

        const hashedPassword = await bcrypt.hash(password, 10);
        const user = new User({ email, password: hashedPassword });
        await user.save();

        const token = jwt.sign({ userId: user._id }, process.env.JWT_SECRET || 'your-secret-key');
        
        res.status(201).json({ 
            message: 'User created successfully',
            token,
            user: { id: user._id, email: user.email, plan: user.plan }
        });
    } catch (error) {
        console.error('Registration error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

app.post('/api/auth/login', async (req, res) => {
    try {
        const { email, password } = req.body;

        const user = await User.findOne({ email });
        if (!user) {
            return res.status(401).json({ error: 'Invalid credentials' });
        }

        const isValidPassword = await bcrypt.compare(password, user.password);
        if (!isValidPassword) {
            return res.status(401).json({ error: 'Invalid credentials' });
        }

        const token = jwt.sign({ userId: user._id }, process.env.JWT_SECRET || 'your-secret-key');
        
        res.json({ 
            message: 'Login successful',
            token,
            user: { id: user._id, email: user.email, plan: user.plan }
        });
    } catch (error) {
        console.error('Login error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// Deployment routes
app.post('/api/deploy', authenticateToken, upload.array('files', 50), async (req, res) => {
    try {
        const { projectName, domain, repositoryUrl, buildCommand, outputDir } = req.body;
        
        // Generate deployment ID
        const deploymentId = uuidv4();
        req.deploymentId = deploymentId;

        // Check domain availability
        const isAvailable = await checkDomainAvailability(domain);
        if (!isAvailable) {
            return res.status(400).json({ error: 'Domain not available' });
        }

        // Create deployment record
        const deployment = new Deployment({
            userId: req.user.userId,
            projectName,
            domain,
            repositoryUrl,
            buildCommand,
            outputDir,
            status: 'building'
        });
        
        await deployment.save();

        // Start deployment process
        processDeployment(deployment, req.files);

        res.json({ 
            message: 'Deployment started',
            deploymentId: deployment._id,
            domain,
            estimatedTime: '15-30 seconds'
        });
    } catch (error) {
        console.error('Deployment error:', error);
        res.status(500).json({ error: 'Deployment failed' });
    }
});

async function processDeployment(deployment, files) {
    try {
        // Update status to deploying
        deployment.status = 'deploying';
        await deployment.save();

        // If files are uploaded, create a temporary repository
        if (files && files.length > 0) {
            await processFileUpload(deployment._id, files);
        }

        // Create service on Render
        const renderService = await renderClient.createStaticSite(
            deployment.projectName,
            deployment.repositoryUrl
        );

        // Update deployment with Render service info
        deployment.renderServiceId = renderService.id;
        deployment.deploymentUrl = renderService.url;
        await deployment.save();

        // Add custom domain if requested
        if (deployment.domain && !deployment.domain.includes('ntl.cloud')) {
            await renderClient.addCustomDomain(renderService.id, deployment.domain);
        }

        // Monitor deployment status
        await monitorDeployment(deployment);

    } catch (error) {
        console.error('Deployment processing error:', error);
        deployment.status = 'error';
        await deployment.save();
    }
}

async function processFileUpload(deploymentId, files) {
    const uploadDir = path.join(__dirname, 'uploads', deploymentId);
    
    // If zip file, extract it
    const zipFile = files.find(file => file.originalname.endsWith('.zip'));
    if (zipFile) {
        await extractZip(zipFile.path, uploadDir);
    }

    // Optimize images
    await optimizeImages(uploadDir);
}

async function extractZip(zipPath, extractPath) {
    return new Promise((resolve, reject) => {
        fs.createReadStream(zipPath)
            .pipe(unzipper.Parse())
            .on('entry', async (entry) => {
                const fileName = entry.path;
                const type = entry.type;
                
                if (type === 'File') {
                    const filePath = path.join(extractPath, fileName);
                    await fs.mkdir(path.dirname(filePath), { recursive: true });
                    entry.pipe(fs.createWriteStream(filePath));
                } else {
                    entry.autodrain();
                }
            })
            .on('finish', resolve)
            .on('error', reject);
    });
}

async function optimizeImages(directory) {
    try {
        const files = await fs.readdir(directory, { recursive: true });
        
        for (const file of files) {
            const filePath = path.join(directory, file);
            const stat = await fs.stat(filePath);
            
            if (stat.isFile() && /\.(jpg|jpeg|png|webp)$/i.test(file)) {
                await sharp(filePath)
                    .jpeg({ quality: 80, progressive: true })
                    .png({ quality: 80, progressive: true })
                    .toFile(filePath + '.optimized');
                
                await fs.rename(filePath + '.optimized', filePath);
            }
        }
    } catch (error) {
        console.error('Image optimization error:', error);
    }
}

async function monitorDeployment(deployment) {
    const maxAttempts = 30;
    let attempts = 0;

    const checkStatus = async () => {
        try {
            const service = await renderClient.getServiceStatus(deployment.renderServiceId);
            
            if (service.status === 'live' || service.status === 'ready') {
                deployment.status = 'live';
                deployment.deploymentUrl = service.url;
                await deployment.save();
                
                // Send webhook notification
                await sendDeploymentNotification(deployment, 'success');
                
            } else if (service.status === 'failed' || service.status === 'error') {
                deployment.status = 'error';
                await deployment.save();
                
                await sendDeploymentNotification(deployment, 'failed');
                
            } else if (attempts < maxAttempts) {
                attempts++;
                setTimeout(checkStatus, 5000);
            } else {
                deployment.status = 'error';
                await deployment.save();
            }
        } catch (error) {
            console.error('Status monitoring error:', error);
            if (attempts < maxAttempts) {
                attempts++;
                setTimeout(checkStatus, 5000);
            }
        }
    };

    setTimeout(checkStatus, 5000);
}

async function sendDeploymentNotification(deployment, status) {
    // Placeholder for webhook notifications
    console.log(`Deployment ${deployment._id} ${status}`);
}

// Get user deployments
app.get('/api/deployments', authenticateToken, async (req, res) => {
    try {
        const deployments = await Deployment.find({ userId: req.user.userId })
            .sort({ createdAt: -1 })
            .limit(10);
        
        res.json(deployments);
    } catch (error) {
        console.error('Error fetching deployments:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// Get deployment details
app.get('/api/deployments/:id', authenticateToken, async (req, res) => {
    try {
        const deployment = await Deployment.findOne({ 
            _id: req.params.id, 
            userId: req.user.userId 
        });
        
        if (!deployment) {
            return res.status(404).json({ error: 'Deployment not found' });
        }
        
        res.json(deployment);
    } catch (error) {
        console.error('Error fetching deployment:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// Delete deployment
app.delete('/api/deployments/:id', authenticateToken, async (req, res) => {
    try {
        const deployment = await Deployment.findOne({ 
            _id: req.params.id, 
            userId: req.user.userId 
        });
        
        if (!deployment) {
            return res.status(404).json({ error: 'Deployment not found' });
        }

        // Delete from Render (implement API call)
        // Delete uploaded files
        const uploadDir = path.join(__dirname, 'uploads', deployment._id);
        await fs.rmdir(uploadDir, { recursive: true });

        await Deployment.findByIdAndDelete(req.params.id);
        
        res.json({ message: 'Deployment deleted successfully' });
    } catch (error) {
        console.error('Error deleting deployment:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// Analytics endpoint
app.get('/api/analytics/:deploymentId', authenticateToken, async (req, res) => {
    try {
        const deployment = await Deployment.findOne({ 
            _id: req.params.deploymentId, 
            userId: req.user.userId 
        });
        
        if (!deployment) {
            return res.status(404).json({ error: 'Deployment not found' });
        }

        // Simulate analytics data
        const analytics = {
            visitors: deployment.metrics.visitors + Math.floor(Math.random() * 100),
            bandwidth: deployment.metrics.bandwidth + Math.floor(Math.random() * 1000),
            uptime: 99.5 + Math.random() * 0.4,
            pageViews: Math.floor(Math.random() * 1000),
            uniqueVisitors: Math.floor(Math.random() * 500),
            avgLoadTime: (1 + Math.random() * 3).toFixed(2) + 's'
        };

        res.json(analytics);
    } catch (error) {
        console.error('Analytics error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// Health check endpoint
app.get('/api/health', (req, res) => {
    res.json({ 
        status: 'healthy',
        timestamp: new Date().toISOString(),
        uptime: process.uptime()
    });
});

// Cron jobs for maintenance
cron.schedule('0 0 * * *', async () => {
    console.log('Running daily maintenance...');
    // Clean up old uploads, update metrics, etc.
});

// Error handling middleware
app.use((error, req, res, next) => {
    console.error('Unhandled error:', error);
    res.status(500).json({ error: 'Internal server error' });
});

// Serve static files
app.use(express.static(path.join(__dirname, '../')));

// Start server
app.listen(PORT, () => {
    console.log(`🚀 Ntando Computer API running on port ${PORT}`);
    console.log(`📊 Dashboard: http://localhost:${PORT}`);
    console.log(`🔗 API Documentation: http://localhost:${PORT}/api/health`);
});

module.exports = app;