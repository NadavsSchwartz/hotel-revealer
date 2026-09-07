import { validateSearch, validateDetail } from '../domain/index.js';
import { assertJsonSize } from '../provider/size.js';

const handler = (validate, method, service) => async (req, res, next) => {
  try {
    const input = validate(req.body);
    const result = await service[method](input);
    assertJsonSize(result);
    res.set('Cache-Control', 'no-store').json(result);
  } catch (error) {
    next(error);
  }
};

export function createHotelController(service) {
  return {
    search: handler(validateSearch, 'search', service),
    detail: handler(validateDetail, 'detail', service),
  };
}
