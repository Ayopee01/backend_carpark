const express = require('express');
const router = express.Router();
const memberRepo = require('../data/repositories/members.repo');
const { authorize } = require('../middleware/permission');

// All member routes are restricted to super_admin as per UI requirement
router.use(authorize(['super_admin']));

router.get('/stats', async (req, res, next) => {
  try {
    const stats = await memberRepo.getMemberStats();
    res.json(stats);
  } catch (err) {
    next(err);
  }
});

router.get('/', async (req, res, next) => {
  try {
    const members = await memberRepo.listMembers(req.query);
    res.json(members);
  } catch (err) {
    next(err);
  }
});

router.post('/', async (req, res, next) => {
  try {
    const member = await memberRepo.createMember(req.body);
    res.status(201).json(member);
  } catch (err) {
    next(err);
  }
});

router.patch('/:id', async (req, res, next) => {
  try {
    const member = await memberRepo.updateMember(req.params.id, req.body);
    if (!member) return res.status(404).json({ message: 'Member not found' });
    res.json(member);
  } catch (err) {
    next(err);
  }
});

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

router.delete('/:id', async (req, res, next) => {
  try {
    const success = await memberRepo.deleteMember(req.params.id);
    if (!success) return res.status(404).json({ message: 'Member not found' });
    res.json({ message: 'Member deleted successfully' });
  } catch (err) {
    next(err);
  }
});

module.exports = router;

