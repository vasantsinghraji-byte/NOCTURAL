# 🚀 Quick Start After Rename

## ✅ Rename Complete: NOCTURAL → NOCTURNAL

---

## 📋 What You Need to Do NOW

### **Option 1: Quick Start (If MongoDB data doesn't matter)**

```bash
# 1. Just start the server with new database name
npm start

# Server will create a fresh nocturnal_dev database
# Register new users and start fresh
```

### **Option 2: Migrate Existing Data (Recommended)**

```bash
# 1. Run the automated migration script
node scripts/rename-database.js

# 2. Verify migration completed
mongosh
use nocturnal_dev
db.users.countDocuments()
exit

# 3. Start the server
npm start

# 4. Test in browser
# Open: http://localhost:5000
```

### **Option 3: Windows Automated Migration**

```bash
# Just double-click this file:
migrate-to-nocturnal.bat

# It will:
# - Backup old database
# - Migrate to new database
# - Test server startup
# - Show you next steps
```

---

## 🔍 Verify Everything Works

### 1. Check Database Connection

```bash
# View current .env database setting
cat .env | grep MONGODB_URI

# Should show:
# MONGODB_URI=mongodb://nocturnaldev:...@localhost:27017/nocturnal_dev?authSource=nocturnal_dev
```

### 2. Start Server

```bash
npm start

# Expected output:
# ✅ Server Started Successfully
# ✅ MongoDB Connected: localhost:27017/nocturnal_dev
```

### 3. Test Frontend

Open browser: `http://localhost:5000`

**Should see:**
- ✅ Title: "Nocturnal - Healthcare Staffing Platform"
- ✅ Logo: "🌙 Nocturnal"
- ✅ All pages load correctly

### 4. Test API

```bash
# Health check
curl http://localhost:5000/api/health

# Should return: {"status":"ok","service":"nocturnal"}
```

---

## 🐛 Troubleshooting

### Server Won't Start

**Error:** `MongoServerError: Authentication failed`

**Solution:**
```bash
# Database user might not exist yet
# Run migration script first:
node scripts/rename-database.js
```

---

**Error:** `MongoServerError: connect ECONNREFUSED`

**Solution:**
```bash
# MongoDB is not running
# Start MongoDB:
net start MongoDB
# or
mongod
```

---

**Error:** `Cannot find database nocturnal_dev`

**Solution:**
```bash
# Either:
# A) Run migration to copy old data:
node scripts/rename-database.js

# OR
# B) Let server create fresh database:
# Just start the server, it will auto-create the database
npm start
```

---

### PM2 Issues

**Error:** `Process noctural-api not found`

**Solution:**
```bash
# Old process name doesn't exist anymore
# Start with new name:
pm2 start ecosystem.config.js --env development

# Or delete old and start new:
pm2 delete noctural-api
pm2 start ecosystem.config.js --env development
```

---

### Frontend Shows Old Name

**Solution:**
```bash
# Hard refresh browser:
# Windows: Ctrl + Shift + R
# Mac: Cmd + Shift + R

# Or clear browser cache
```

---

## 📊 What Changed vs What Stayed Same

### ✅ Changed (Name Only)

| Item | Old | New |
|------|-----|-----|
| Platform Name | NOCTURAL | NOCTURNAL |
| Database Name | `noctural_dev` | `nocturnal_dev` |
| DB User | `nocturaldev` | `nocturnaldev` |
| PM2 Process | `noctural-api` | `nocturnal-api` |
| Package Name | `noctural` | `nocturnal` |

### ✅ Stayed Same (Everything Else)

- ✅ All data (after migration)
- ✅ All API endpoints
- ✅ All functionality
- ✅ All user accounts
- ✅ All passwords
- ✅ JWT tokens
- ✅ File uploads
- ✅ Database structure
- ✅ Code logic
- ✅ Performance
- ✅ Security settings

---

## 🎯 Common Commands Updated

```bash
# OLD Commands (Don't work anymore)
pm2 restart noctural-api
pm2 logs noctural-api
pm2 stop noctural-api

# NEW Commands (Use these now)
pm2 restart nocturnal-api
pm2 logs nocturnal-api
pm2 stop nocturnal-api
```

---

## 📝 Files You Might Need to Update

### If you have custom scripts:

```bash
# Check these files for hardcoded "noctural":
- Your deployment scripts
- Your backup scripts
- Your monitoring dashboards
- Your CI/CD pipelines
- Your documentation
```

### Update them manually:

```bash
# Find any references you might have:
grep -r "noctural" your-custom-scripts/
```

---

## ✅ Final Checklist

Before considering migration complete:

- [ ] Database migrated (or fresh start accepted)
- [ ] Server starts successfully
- [ ] Can see "Nocturnal" in browser title
- [ ] Can login to application
- [ ] API endpoints respond
- [ ] PM2 shows `nocturnal-api` process
- [ ] All tests pass (if any)
- [ ] Old `noctural_dev` database backed up
- [ ] Monitoring/alerts updated (if any)
- [ ] Team notified of name change

---

## 🆘 Need Help?

### Check logs:
```bash
# Application logs
pm2 logs nocturnal-api

# Error logs
tail -f logs/error.log

# Combined logs
tail -f logs/combined.log
```

### Test database connection:
```bash
mongosh mongodb://nocturnaldev:DevPass2025!ChangeMe@localhost:27017/nocturnal_dev?authSource=nocturnal_dev
```

### Verify migration:
```bash
node scripts/rename-database.js
```

---

## 📚 Full Documentation

For complete details, see:
- **[PLATFORM_RENAME_COMPLETE.md](PLATFORM_RENAME_COMPLETE.md)** - Complete documentation
- **[scripts/rename-database.js](scripts/rename-database.js)** - Migration script
- **[migrate-to-nocturnal.bat](migrate-to-nocturnal.bat)** - Windows auto-migration

---

**Remember:** This is just a name change. All your data and functionality remain exactly the same! 🎉

---

**Quick Links:**
- Start server: `npm start`
- Start with PM2: `pm2 start ecosystem.config.js --env development`
- Migrate database: `node scripts/rename-database.js`
- View in browser: http://localhost:5000
- API docs: http://localhost:5000/api-docs

---

**Status:** ✅ Ready to Use
**Platform:** NOCTURNAL Healthcare Staffing Platform
**Version:** 1.0.1
