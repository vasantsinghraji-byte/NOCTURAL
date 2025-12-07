# PM2 Quick Reference Card

## 🚀 Start/Stop

```bash
npm run pm2:start          # Development (1 instance)
npm run pm2:start:prod     # Production (cluster mode)
npm run pm2:stop           # Stop
npm run pm2:restart        # Restart (with downtime)
npm run pm2:reload         # Reload (zero-downtime) ⭐
npm run pm2:delete         # Remove from PM2
```

## 📊 Monitoring

```bash
npm run pm2:status         # Process status table
npm run pm2:monit          # Interactive dashboard ⭐
npm run pm2:logs           # View logs (live)
pm2 logs nocturnal-api --lines 100   # Last 100 lines
pm2 logs nocturnal-api --err         # Errors only
```

## 🔧 Management

```bash
pm2 scale nocturnal-api 4   # Scale to 4 instances
pm2 info nocturnal-api      # Detailed info
npm run pm2:flush          # Clear all logs
npm run pm2:reset          # Reset restart counter
```

## 💾 System Integration

```bash
npm run pm2:save           # Save process list
npm run pm2:startup        # Configure auto-start
```

## 🎯 Common Tasks

### Deploy Code Update (Zero Downtime)
```bash
git pull
npm install
npm run pm2:reload  # ⭐ No downtime!
```

### Debug Crashes
```bash
npm run pm2:logs
pm2 logs nocturnal-api --err --lines 50
pm2 info nocturnal-api
```

### Check Performance
```bash
npm run pm2:monit  # Real-time CPU/Memory
npm run pm2:status # Quick overview
```

## ⚠️ Important

- **Production:** Always use `pm2:reload` (not restart)
- **After Reboot:** PM2 auto-starts if configured
- **Logs:** Use `pm2:flush` to clear old logs
- **Memory:** Auto-restarts at 500MB limit

## 📖 Full Guide

See [PM2_DEPLOYMENT_GUIDE.md](./PM2_DEPLOYMENT_GUIDE.md) for complete documentation.
