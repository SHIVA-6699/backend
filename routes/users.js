import express from 'express';
import { 
  createUser, getAllUsers, getUserById, updateUser, deleteUser, 
  getRoleConfig, getAllRoles 
} from '../controllers/auth.js';
import { 
  requireAdmin, requireRoleUserCreation, requireAdminOrManager,
  authenticateToken 
} from '../middleware/auth.js';

const router = express.Router();

// Role and permission management routes
router.get('/roles', getAllRoles);
router.get('/roles/:role', getRoleConfig);

// User management routes (Admin only)
router.post('/', requireAdmin, createUser);
router.get('/', requireAdminOrManager, getAllUsers);
router.get('/:id', authenticateToken, getUserById);
router.put('/:id', authenticateToken, updateUser);
router.delete('/:id', requireAdmin, deleteUser);

export default router;
