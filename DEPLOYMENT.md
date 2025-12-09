# 🚀 Deploy Ntando Computer to Render.com

## Quick Deployment Guide

### Step 1: Prepare Your Repository
1. Fork or clone the Ntando Computer repository
2. Make sure you have all the files in place

### Step 2: Deploy to Render.com

#### Option A: Using the Working Configuration (Recommended)
1. Go to [render.com](https://render.com)
2. Click "New" → "Web Service"
3. Connect your GitHub repository
4. Use the `render-working.yaml` configuration
5. Set:
   - **Name**: `ntando-computer`
   - **Branch**: `main`
   - **Root Directory**: `./`
   - **Runtime**: `Node 18`
   - **Build Command**: `npm install && cd backend && npm install`
   - **Start Command**: `node backend/server-minimal.js`

#### Option B: Manual Configuration
1. Create a new Web Service on Render.com
2. Configure the following:
   ```
   Name: ntando-computer
   Environment: Node 18
   Region: Oregon (or closest to you)
   Branch: main
   Root Directory: ./
   Build Command: npm install && cd backend && npm install
   Start Command: node backend/server-minimal.js
   Instance Type: Free
   ```

### Step 3: Add Database
1. Go to your dashboard → "New" → "MongoDB"
2. Name it: `ntando-mongodb`
3. Select the Free plan
4. Once created, go back to your web service settings
5. Add environment variables:
   ```
   MONGODB_URI: [Get from MongoDB database settings]
   JWT_SECRET: [Render will auto-generate this]
   NODE_ENV: production
   ```

### Step 4: Configure Storage
1. In your web service settings, add a Disk:
   - Name: `ntando-storage`
   - Mount Path: `/app/backend/uploads`
   - Size: 5 GB

### Step 5: Deploy
Click "Deploy" and wait for the build to complete (usually 2-3 minutes).

## Environment Variables Required

Add these to your Render.com service environment:

```
NODE_ENV=production
PORT=10000
JWT_SECRET=your-secret-key
MONGODB_URI=mongodb://user:password@host:port/database
```

## Troubleshooting

### If Deployment Fails:
1. **Build Error**: Check that all dependencies in `backend/package.json` are valid
2. **Start Error**: Verify the start command path is correct
3. **Database Error**: Ensure MongoDB is properly connected
4. **Port Error**: Make sure PORT is set to 10000 (Render's required port)

### Common Issues:
- **Module not found**: Run `npm install` in both root and backend directories
- **Permission denied**: Ensure the start script has execute permissions
- **Database connection**: Verify the MongoDB URI is correctly formatted

## Testing Your Deployment

Once deployed, you should be able to:

1. Visit your app at `https://your-service-name.onrender.com`
2. Test the API health endpoint: `https://your-service-name.onrender.com/api/health`
3. Access the dashboard and try deploying a test project

## Custom Domain Setup (Optional)

1. Go to your service settings → "Custom Domains"
2. Add your custom domain (e.g., `your-domain.com`)
3. Update your DNS records as instructed by Render
4. SSL certificates will be automatically configured

## Monitoring

- Check logs in the Render.com dashboard
- Monitor deployment status in the "Logs" tab
- Use the health endpoint: `https://your-service.onrender.com/api/health`

## Next Steps

After successful deployment:
1. Test the full deployment workflow
2. Connect a real domain
3. Set up monitoring and alerts
4. Consider upgrading to a paid plan for production use

## Support

If you encounter issues:
1. Check the Render.com documentation
2. Review the service logs
3. Verify all environment variables are set
4. Ensure your code follows Render.com's requirements

---

**Your app will be live at:** `https://ntando-computer.onrender.com`

**API Documentation:** `https://ntando-computer.onrender.com/api/health`

**Support:** Check the Render.com dashboard for detailed logs and metrics.