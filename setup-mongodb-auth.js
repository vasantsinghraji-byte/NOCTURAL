// MongoDB Authentication Setup Script
// Run this with: "C:\Program Files\MongoDB\Server\8.2\bin\mongod.exe" --eval "load('setup-mongodb-auth.js')"
// Or connect manually and paste the commands

print("=== MongoDB Authentication Setup ===\n");

// Step 1: Switch to admin database
print("Step 1: Switching to admin database...");
db = db.getSiblingDB('admin');

// Step 2: Create admin user
print("\nStep 2: Creating admin user...");
try {
    db.createUser({
        user: "admin",
        pwd: "NocturnalAdmin2025!Secure",  // CHANGE THIS PASSWORD!
        roles: [
            { role: "userAdminAnyDatabase", db: "admin" },
            { role: "readWriteAnyDatabase", db: "admin" },
            { role: "dbAdminAnyDatabase", db: "admin" }
        ]
    });
    print("✓ Admin user created successfully");
} catch (e) {
    if (e.code === 51003) {
        print("⚠ Admin user already exists");
    } else {
        print("✗ Error creating admin user: " + e.message);
    }
}

// Step 3: Create development database user
print("\nStep 3: Creating development database user...");
db = db.getSiblingDB('nocturnal_dev');
try {
    db.createUser({
        user: "nocturnaldev",
        pwd: "DevPass2025!ChangeMe",  // CHANGE THIS PASSWORD!
        roles: [
            { role: "readWrite", db: "nocturnal_dev" },
            { role: "dbAdmin", db: "nocturnal_dev" }
        ]
    });
    print("✓ Development user created successfully");
} catch (e) {
    if (e.code === 51003) {
        print("⚠ Development user already exists");
    } else {
        print("✗ Error creating development user: " + e.message);
    }
}

// Step 4: Create production database user
print("\nStep 4: Creating production database user...");
db = db.getSiblingDB('nocturnal_prod');
try {
    db.createUser({
        user: "nocturnalprod",
        pwd: "ProdPass2025!VeryStrong",  // CHANGE THIS PASSWORD!
        roles: [
            { role: "readWrite", db: "nocturnal_prod" },
            { role: "dbAdmin", db: "nocturnal_prod" }
        ]
    });
    print("✓ Production user created successfully");
} catch (e) {
    if (e.code === 51003) {
        print("⚠ Production user already exists");
    } else {
        print("✗ Error creating production user: " + e.message);
    }
}

print("\n=== User Creation Complete ===");
print("\nNext steps:");
print("1. Enable authentication in mongod.cfg");
print("2. Restart MongoDB service");
print("3. Update .env files with the passwords");
print("\nIMPORTANT: Change the default passwords in this script before using in production!");
