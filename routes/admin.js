// routes/admin.js
import { Router } from 'express';
import { getExpiring, notifyExpiring } from '../controllers/adminController.js';
import { auth } from '../services/auth.js';

const r = Router();
r.use(auth.requireAdmin);
r.get('/expiring', getExpiring);
r.get('/notify-expiring', notifyExpiring);

export default r;
