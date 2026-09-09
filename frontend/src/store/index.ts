import { applyMiddleware, legacy_createStore as createStore } from 'redux';
import { thunk } from 'redux-thunk';
import type { ThunkDispatch, ThunkMiddleware } from 'redux-thunk';
import { useDispatch, useSelector } from 'react-redux';
import { travelerReducer } from '../traveler/state.ts';
import type { TravelerAction, TravelerState } from '../traveler/state.ts';

export type RootState = TravelerState;
export type AppDispatch = ThunkDispatch<RootState, undefined, TravelerAction>;
const middleware: ThunkMiddleware<RootState, TravelerAction> = thunk;
const store = createStore(travelerReducer, applyMiddleware(middleware));
export const useAppDispatch = useDispatch.withTypes<AppDispatch>();
export const useAppSelector = useSelector.withTypes<RootState>();
export default store;
