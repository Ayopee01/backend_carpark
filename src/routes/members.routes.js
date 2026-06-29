const express = require('express');
const router = express.Router();
const memberRepo = require('../data/repositories/members.repo');
const { authorize } = require('../middleware/permission');

// Apply permission check สำหรับจัดการ member
router.use(authorize('settings'));

// Route query สถิติ member เช่น จำนวนทั้งหมด active และ admin
router.get('/stats', async (req, res, next) => {
  try {
    const stats = await memberRepo.getMemberStats();
    res.json(stats);
  } catch (err) {
    next(err);
  }
});

// Route query รายการ member ทั้งหมด พร้อมรองรับ filter จาก query string
router.get('/', async (req, res, next) => {
  try {
    const members = await memberRepo.listMembers(req.query);
    res.json(members);
  } catch (err) {
    next(err);
  }
});

// Route create member ใหม่
router.post('/', async (req, res, next) => {
  try {
    const member = await memberRepo.createMember(req.body);
    res.status(201).json(member);
  } catch (err) {
    next(err);
  }
});

// Route update ข้อมูล member ตาม id
router.patch('/:id', async (req, res, next) => {
  try {
    const member = await memberRepo.updateMember(req.params.id, req.body);
    if (!member) return res.status(404).json({ message: 'Member not found' });
    res.json(member);
  } catch (err) {
    next(err);
  }
});

// Route update permissions ของ member ตาม id
router.patch('/:id/permissions', async (req, res, next) => {
  try {
    const { permissions } = req.body;
    if (!Array.isArray(permissions)) {
      return res.status(400).json({ message: 'Permissions must be an array' });
    }
    const member = await memberRepo.updateMember(req.params.id, { permissions });
    if (!member) return res.status(404).json({ message: 'Member not found' });
    res.json({ message: 'Permissions updated successfully', member });
  } catch (err) {
    next(err);
  }
});

// Route delete member ตาม id
router.delete('/:id', async (req, res, next) => {
  try {
    const success = await memberRepo.deleteMember(req.params.id);
    if (!success) return res.status(404).json({ message: 'Member not found' });
    res.json({ message: 'Member deleted successfully' });
  } catch (err) {
    next(err);
  }
});

// Export Router
module.exports = router;

