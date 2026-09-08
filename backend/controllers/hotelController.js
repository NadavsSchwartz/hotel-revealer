import { validateSearch, validateDetail } from '../domain/index.js';
import { assertJsonSize } from '../provider/size.js';

const handler = (validate, method, service) => async (req, res, next) => {
  try {
    const input = validate(req.body);
    const result = await service[method](input, { requestId: req.requestId });
    assertJsonSize(result);
    res.set('Cache-Control', 'no-store').json(result);
  } catch (error) {
    next(error instanceof Error ? error : new Error('Non-Error service failure', { cause: error }));
  }
};

export function createHotelController(service) {
  return {
    search: handler(validateSearch, 'search', service),
    detail: handler(validateDetail, 'detail', service),
  };
}
