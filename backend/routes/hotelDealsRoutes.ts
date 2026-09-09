import express from 'express';
import { createHotelController } from '../controllers/hotelController.ts';
import type { HotelService } from '../http-types.ts';

export function createHotelRoutes(service: HotelService) {
  const router = express.Router();
  const controller = createHotelController(service);
  router.post('/hotelDeals', controller.search);
  router.post('/deal', controller.detail);
  return router;
}
