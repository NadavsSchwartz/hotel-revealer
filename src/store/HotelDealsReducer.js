import {
  GET_LATEST_HOTEL_DEALS_REQUEST,
  GET_LATEST_HOTEL_DEALS_SUCCESS,
  GET_LATEST_HOTEL_DEALS_FAILUTE,
  GET_HOTEL_DEALS_REQUEST,
  GET_HOTEL_DEALS_SUCCESS,
  GET_HOTEL_DEALS_FAILURE,
  GET_USER_LOCATION_REQUEST,
  GET_USER_LOCATION_SUCCESS,
  GET_USER_LOCATION_FAILURE,
  RESET_DEALS_ERRORS,
} from './actions/HotelDealsAction';

const HotelDealsReducer = (
  state = {
    foundDeals: [],
    loading: false,
    error: null,
    latestDeals: null,
    userLocation: [],
  },
  action
) => {
  switch (action.type) {
    case GET_LATEST_HOTEL_DEALS_REQUEST:
      return { ...state, loading: true, error: null };
    case GET_LATEST_HOTEL_DEALS_SUCCESS:
      return { ...state, loading: false, latestDeals: action.payload };
    case GET_LATEST_HOTEL_DEALS_FAILUTE:
      return { ...state, loading: false, error: action.payload };
    case GET_HOTEL_DEALS_REQUEST:
      return { ...state, loading: true, error: null };
    case GET_HOTEL_DEALS_SUCCESS:
      return { ...state, loading: false, foundDeals: action.payload };
    case GET_HOTEL_DEALS_FAILURE:
      return { ...state, loading: false, error: action.payload };
    case GET_USER_LOCATION_REQUEST:
      return { ...state, loading: true, error: null };
    case GET_USER_LOCATION_SUCCESS:
      return { ...state, loading: false, userLocation: action.payload };
    case GET_USER_LOCATION_FAILURE:
      return { ...state, loading: false, error: action.payload };
    case RESET_DEALS_ERRORS:
      return { ...state, loading: false, error: null };
    default:
      return state;
  }
};
export default HotelDealsReducer;
