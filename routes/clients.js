import { Router } from 'express';
import {
  createClient,
  listAll,
  deleteClient,
  clientStatus,
  scanQR,
  findByDniHandler,
  renewClient,
  getQrLink,
  scanByDni,
  scanNfc,
  publicPass
} from '../controllers/clientsController.js';

const r = Router();
import { auth } from '../services/auth.js';
import managementRouter from './management.js';

r.get('/pass', publicPass);
r.post('/scan', auth.requireSession, scanQR);
r.post('/scan-dni', auth.requireSession, scanByDni);
r.post('/scan-nfc', auth.requireSession, scanNfc);
r.use(auth.requireAdmin);

// SIN asyncHandler (temporal para debug)
r.get('/', listAll);
r.post('/', createClient);
r.delete('/:id', deleteClient);
r.get('/by-dni', findByDniHandler);
r.get('/:id/status', clientStatus);
r.post('/:id/renew', renewClient);
r.get('/:id/qr-link', getQrLink);
r.post('/:id/bind-nfc', (req, res, next) => {
  req.url = `/clients/${req.params.id}/cards`;
  return managementRouter(req, res, next);
});

export default r;
