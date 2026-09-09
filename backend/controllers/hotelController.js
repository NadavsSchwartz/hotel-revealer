import { validateSearch, validateDetail } from '../domain/index.js';
import { serializeBoundedJson } from '../provider/size.js';

const handler = (validate, method, service) => async (req, res, next) => {
  try {
    const input = validate(req.body);
    req.hotelAdmission?.dispatch();
    const result = await service[method](input, { requestId: req.requestId, admitUpstream: req.hotelAdmission?.admitUpstream });
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

export function createHotelController(service) {
  return {
    search: handler(validateSearch, 'search', service),
    detail: handler(validateDetail, 'detail', service),
  };
}
