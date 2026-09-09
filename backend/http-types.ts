import type { RequestHandler } from 'express';
import type { ParamsDictionary } from 'express-serve-static-core';
import type { ProviderService } from './provider/service.ts';
import type { HoldWork } from './provider/types.ts';

export type HotelService = Pick<ProviderService, 'search' | 'detail'> & Partial<Pick<ProviderService, 'status'>>;
export type HotelRequestHandler = RequestHandler<ParamsDictionary, unknown, unknown>;
export interface HotelAdmission {
  dispatch(): void;
  settle(): void;
  holdWork: HoldWork;
  admitUpstream(): void;
}

declare module 'express-serve-static-core' {
  interface Request {
    requestId: string;
    hotelAdmission?: HotelAdmission;
  }
}
