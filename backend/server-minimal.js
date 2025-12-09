const express = require('express');
const multer = require('multer');
const cors = require('cors');
const path = require('path');
const fs = require('fs').promises;
const { v4: uuidv4 } = require('uuid');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const mongoose = require('mongoose');

// Initialize Express app
const app = express();
const PORT = process.env.PORT || 10000;

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
            'image/svg+xml'
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

    jwt.verify(token, process.env.JWT_SECRET || 'default-secret-key', (err, user) => {
        if (err) return res.status(403).json({ error: 'Invalid token' });
        req.user = user;
        next();
    });
};

// Routes
app.get('/', (req, res) => {
    res.json({ 
        message: '🚀 Ntando Computer API',
        version: '1.0.0',
        status: 'running',
        timestamp: new Date().toISOString()
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

        const token = jwt.sign({ userId: user._id }, process.env.JWT_SECRET || 'default-secret-key');
        
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

        const token = jwt.sign({ userId: user._id }, process.env.JWT_SECRET || 'default-secret-key');
        
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

        // Simulate deployment process
        setTimeout(() => {
            deployment.status = 'live';
            deployment.deploymentUrl = `https://${domain}`;
            deployment.save();
        }, 15000);

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

// Health check endpoint
app.get('/api/health', (req, res) => {
    res.json({ 
        status: 'healthy',
        timestamp: new Date().toISOString(),
        uptime: process.uptime(),
        environment: process.env.NODE_ENV || 'development'
    });
});

// Serve static files
app.use(express.static(path.join(__dirname, '../')));

// Error handling middleware
app.use((error, req, res, next) => {
    console.error('Unhandled error:', error);
    res.status(500).json({ error: 'Internal server error' });
});

// Start server
app.listen(PORT, () => {
    console.log(`🚀 Ntando Computer API running on port ${PORT}`);
    console.log(`📊 Dashboard: http://localhost:${PORT}`);
    console.log(`🔗 API Health: http://localhost:${PORT}/api/health`);
    
    // Create uploads directory if it doesn't exist
    const uploadsDir = path.join(__dirname, 'uploads');
    fs.mkdir(uploadsDir, { recursive: true }).catch(console.error);
});

module.exports = app;