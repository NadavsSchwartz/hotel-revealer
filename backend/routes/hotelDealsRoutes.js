import express from 'express';
import { createHotelController } from '../controllers/hotelController.js';

export function createHotelRoutes(service) {
  const router = express.Router();
  const controller = createHotelController(service);
  router.post('/hotelDeals', controller.search);
  router.post('/deal', controller.detail);
  return router;
}
