# Enable MongoDB Authentication - DO THIS NOW

## The Situation

✅ MongoDB users have been created successfully
✅ Environment files are configured with credentials
❌ MongoDB is still running WITHOUT authentication enabled

**You just need to enable authentication in the MongoDB configuration.**

---

## STEP-BY-STEP INSTRUCTIONS

### Method 1: PowerShell Script (Easiest)

1. **Close this terminal/IDE**

2. **Open PowerShell as Administrator:**
   - Press `Windows` key
   - Type: `powershell`
   - **Right-click** on "Windows PowerShell"
   - Select **"Run as administrator"**
   - Click "Yes" when prompted

3. **In the Administrator PowerShell window, run these commands:**
   ```powershell
   cd C:\Users\wgshx\Documents\nocturnal
   Set-ExecutionPolicy Bypass -Scope Process
   .\enable-mongodb-auth.ps1
   ```

4. **The script will:**
   - Backup your current MongoDB config
   - Enable authentication
   - Restart MongoDB service
   - Show you the credentials

5. **After the script completes, come back to this terminal and run:**
   ```bash
   node test-mongo-connection.js
   ```

---

### Method 2: Manual (If PowerShell Doesn't Work)

1. **Open Notepad as Administrator:**
   - Press `Windows` key
   - Type: `notepad`
   - **Right-click** on "Notepad"
   - Select **"Run as administrator"**
   - Click "Yes" when prompted

2. **In Notepad:**
   - Click `File` → `Open`
   - Navigate to: `C:\Program Files\MongoDB\Server\8.2\bin\`
   - Change file filter to: `All Files (*.*)`
   - Open: `mongod.cfg`

3. **Edit the file:**
   - Find this line (around line 22):
     ```yaml
     #security:
     ```
   - **Replace it with** (remove the # and add authorization):
     ```yaml
     security:
       authorization: enabled
     ```
   - **IMPORTANT:** Use exactly 2 spaces before "authorization"

4. **Save the file:**
   - Click `File` → `Save`
   - Close Notepad

5. **Restart MongoDB:**
   - Press `Windows` key
   - Type: `cmd`
   - **Right-click** on "Command Prompt"
   - Select **"Run as administrator"**
   - Run these commands:
     ```cmd
     net stop MongoDB
     net start MongoDB
     ```

6. **Test the connection:**
   ```bash
   node test-mongo-connection.js
   ```

---

## What You Should See After Success

```
=== MongoDB Connection Test ===
✓ Successfully connected to MongoDB!
✓ Found X collections
✓ Testing write permission...
  ✓ Write successful
✓ Testing read permission...
  ✓ Read successful
  ✓ Cleanup successful

=== All Tests Passed ===

MongoDB authentication is working correctly!
You can now start your application with: npm start
```

---

## Troubleshooting

### If MongoDB service won't start:

Check the log file:
```cmd
type "C:\Program Files\MongoDB\Server\8.2\log\mongod.log"
```

Look for errors like "YAML syntax error" - this means indentation is wrong.

### If you see "Access Denied":

You didn't run as Administrator. Go back to step 1 and make sure you:
- Right-click the application
- Select "Run as administrator"

### If authentication still fails after enabling:

Wait 5 seconds and try again. MongoDB needs a moment to fully restart.

---

## Quick Commands Reference

**Open PowerShell as Admin:**
`Windows key` → type `powershell` → Right-click → "Run as administrator"

**Run the script:**
```powershell
cd C:\Users\wgshx\Documents\nocturnal
Set-ExecutionPolicy Bypass -Scope Process
.\enable-mongodb-auth.ps1
```

**Or restart MongoDB manually:**
```cmd
net stop MongoDB
net start MongoDB
```

**Test connection:**
```bash
node test-mongo-connection.js
```

---

## Why This Needs Administrator Access

MongoDB's configuration file is located in `C:\Program Files\MongoDB\`, which is a protected system directory. Windows requires administrator privileges to:
- Edit files in Program Files
- Restart system services (MongoDB service)

This is a **security feature** to prevent unauthorized changes to critical system files.

---

## After Authentication Works

Once you see "All Tests Passed", you can:

1. **Start your application:**
   ```bash
   npm start
   ```

2. **Verify everything works:**
   - Test user registration
   - Test user login
   - Check database connections in application logs

3. **Change the default passwords** (see MONGODB_AUTH_IMPLEMENTATION.md)

---

**You're almost done! Just need to run the PowerShell script or follow the manual steps above.**
