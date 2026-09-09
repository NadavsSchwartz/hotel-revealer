import { validateSearch, validateDetail } from '../domain/index.ts';
import { serializeBoundedJson } from '../provider/size.ts';
import type { HotelService, HotelRequestHandler } from '../http-types.ts';
import type { RequestOptions } from '../provider/types.ts';

const handler = <Input>(validate: (value: unknown) => Input,
  operation: (input: Input, options: RequestOptions) => Promise<unknown>): HotelRequestHandler => async (req, res, next) => {
  try {
    const input = validate(req.body);
    req.hotelAdmission?.dispatch();
    const result = await operation(input, { requestId: req.requestId,
      admitUpstream: req.hotelAdmission?.admitUpstream, holdWork: req.hotelAdmission?.holdWork });
    if (res.destroyed) return;
    const { body } = serializeBoundedJson(result);
    res.set('Cache-Control', 'no-store').type('application/json').send(body);
  } catch (error) {
    if (res.destroyed) return;
    next(error instanceof Error ? error : new Error('Non-Error service failure', { cause: error }));
  } finally {
    req.hotelAdmission?.settle();
  }
};

export function createHotelController(service: HotelService) {
  return {
    search: handler(validateSearch, (input, options) => service.search(input, options)),
    detail: handler(validateDetail, (input, options) => service.detail(input, options)),
  };
}
