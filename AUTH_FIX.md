# 401 Unauthorized Error - Quick Fix

## What's Happening:

✅ Server is running (good!)
❌ You're getting 401 Unauthorized (authentication issue)

This means your login token has expired or is invalid.

## 🚀 Quick Fix (2 minutes):

### Option 1: Logout and Login Again (EASIEST)

1. **Click the "Logout" button** in the admin dashboard
2. **Login again** with your hospital admin credentials
3. **Go to Settings** → Should work now!

### Option 2: Clear Browser Data

1. Press `Ctrl + Shift + Delete`
2. Select:
   - ✅ Cookies and site data
   - ✅ Cached images and files
3. Click "Clear data"
4. **Go to login page** and login again

### Option 3: Manual Token Clear (Developer)

1. Press `F12` to open DevTools
2. Go to **Console** tab
3. Type: `localStorage.clear()`
4. Press Enter
5. Reload page
6. Login again

## Why This Happens:

Your JWT token expired. Tokens typically expire after:
- 30 days (default)
- Or when server restarts with different JWT_SECRET

## ✅ After Logging In Again:

You should be able to:
- ✅ Access Settings page
- ✅ Save your budget
- ✅ View Analytics
- ✅ No more 401 errors

## 🔍 To Check If It's Fixed:

After logging in, check browser console (F12):
```javascript
localStorage.getItem('token')  // Should show a long string
localStorage.getItem('userType')  // Should show 'hospital'
```

If both return values, you're authenticated! ✅
