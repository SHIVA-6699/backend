import User from "../models/User.js";
import bcrypt from "bcryptjs";

export const initializeAdmin = async () => {
  try {
    // Check if admin already exists
    const existingAdmin = await User.findOne({ role: 'admin' });
    
    if (existingAdmin) {
      console.log('✅ Admin user already exists');
      return;
    }

    // Get admin credentials from environment variables
    const adminEmail = process.env.ADMIN_EMAIL;
    const adminPassword = process.env.ADMIN_PASSWORD;
    const adminName = process.env.ADMIN_NAME || 'Super Admin';
    const adminPhone = process.env.ADMIN_PHONE || '+1234567890';
    const adminAddress = process.env.ADMIN_ADDRESS || 'Company Headquarters';

    if (!adminEmail || !adminPassword) {
      console.log('⚠️  Admin credentials not found in environment variables');
      console.log('   Please set ADMIN_EMAIL and ADMIN_PASSWORD in your .env file');
      return;
    }

    // Hash admin password
    const saltRounds = 12;
    const hashedPassword = await bcrypt.hash(adminPassword, saltRounds);

    // Create admin user
    const adminUser = new User({
      name: adminName,
      email: adminEmail.toLowerCase(),
      password: hashedPassword,
      phone: adminPhone,
      address: adminAddress,
      role: 'admin',
      isEmailVerified: true,
      isPhoneVerified: true,
      isActive: true
    });

    await adminUser.save();
    
    console.log('✅ Admin user created successfully');
    console.log(`   Email: ${adminEmail}`);
    console.log(`   Role: ${adminUser.role}`);
    
  } catch (error) {
    console.error('❌ Error creating admin user:', error.message);
  }
};
