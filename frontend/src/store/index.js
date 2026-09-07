import { applyMiddleware, createStore } from 'redux';
import thunk from 'redux-thunk';
import { travelerReducer } from '../traveler/state.js';

export default createStore(travelerReducer, applyMiddleware(thunk));
