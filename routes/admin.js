import express from 'express';
import { 
  requireAdmin, requireAdminPage, requireInventoryPage, 
  requireBankPayments, requireVendorDetails, requireRoleUserCreation 
} from '../middleware/auth.js';
import User from '../models/User.js';

const router = express.Router();

// Admin Dashboard Routes
router.get('/dashboard', requireAdminPage, async (req, res) => {
  try {
    res.json({ 
      message: 'Admin dashboard accessed successfully',
      user: req.user,
      permissions: req.user.permissions
    });
  } catch (error) {
    res.status(500).json({ message: 'Error accessing admin dashboard' });
  }
});

// Inventory Management Routes
router.get('/inventory', requireInventoryPage, async (req, res) => {
  try {
    res.json({ 
      message: 'Inventory page accessed successfully',
      user: req.user
    });
  } catch (error) {
    res.status(500).json({ message: 'Error accessing inventory page' });
  }
});

// Bank Payments Routes
router.get('/bank-payments', requireBankPayments, async (req, res) => {
  try {
    res.json({ 
      message: 'Bank payments page accessed successfully',
      user: req.user
    });
  } catch (error) {
    res.status(500).json({ message: 'Error accessing bank payments' });
  }
});

// Vendor Details Routes
router.get('/vendor-details', requireVendorDetails, async (req, res) => {
  try {
    res.json({ 
      message: 'Vendor details page accessed successfully',
      user: req.user
    });
  } catch (error) {
    res.status(500).json({ message: 'Error accessing vendor details' });
  }
});

// Role and User Creation Routes
router.get('/user-management', requireRoleUserCreation, async (req, res) => {
  try {
    res.json({ 
      message: 'User management page accessed successfully',
      user: req.user
    });
  } catch (error) {
    res.status(500).json({ message: 'Error accessing user management' });
  }
});

// Update user role (admin only)
router.put('/users/:userId/role', requireAdmin, async (req, res) => {
  try {
    const { role } = req.body;
    
    const validRoles = ['admin', 'manager', 'employee', 'vendor', 'customer'];
    if (!validRoles.includes(role)) {
      return res.status(400).json({ 
        message: `Invalid role. Must be one of: ${validRoles.join(', ')}` 
      });
    }

    const user = await User.findById(req.params.userId);
    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    // Update role and let the pre-save middleware handle access level and permissions
    user.role = role;
    await user.save();

    res.json({ 
      message: 'User role updated successfully', 
      user: {
        _id: user._id,
        name: user.name,
        email: user.email,
        role: user.role,
        accessLevel: user.accessLevel,
        permissions: user.permissions
      }
    });
  } catch (error) {
    res.status(500).json({ message: 'Error updating user role' });
  }
});

// Deactivate/Activate user (admin only)
router.put('/users/:userId/status', requireAdmin, async (req, res) => {
  try {
    const { isActive } = req.body;
    
    if (typeof isActive !== 'boolean') {
      return res.status(400).json({ message: 'isActive must be a boolean' });
    }

    const user = await User.findByIdAndUpdate(
      req.params.userId,
      { isActive },
      { new: true }
    ).select('-password -refreshToken');

    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    res.json({ 
      message: `User ${isActive ? 'activated' : 'deactivated'} successfully`, 
      user 
    });
  } catch (error) {
    res.status(500).json({ message: 'Error updating user status' });
  }
});

// Get system stats (admin only)
router.get('/stats', requireAdmin, async (req, res) => {
  try {
    const totalUsers = await User.countDocuments();
    const activeUsers = await User.countDocuments({ isActive: true });
    const adminUsers = await User.countDocuments({ role: 'admin' });
    const managerUsers = await User.countDocuments({ role: 'manager' });
    const employeeUsers = await User.countDocuments({ role: 'employee' });
    const vendorUsers = await User.countDocuments({ role: 'vendor' });
    const customerUsers = await User.countDocuments({ role: 'customer' });
    const verifiedUsers = await User.countDocuments({ isEmailVerified: true });

    res.json({
      stats: {
        totalUsers,
        activeUsers,
        inactiveUsers: totalUsers - activeUsers,
        roleBreakdown: {
          admin: adminUsers,
          manager: managerUsers,
          employee: employeeUsers,
          vendor: vendorUsers,
          customer: customerUsers
        },
        verifiedUsers,
        unverifiedUsers: totalUsers - verifiedUsers
      }
    });
  } catch (error) {
    res.status(500).json({ message: 'Error fetching stats' });
  }
});

export default router;
