import { useDispatch, useSelector } from 'react-redux';
import type { TypedUseSelectorHook } from 'react-redux';
import type { RootState, AppDispatch } from './index';
import brandsReducer from './slices/brandsSlice';

export const useAppDispatch = useDispatch.withTypes<AppDispatch>();
export const useAppSelector = useSelector.withTypes<RootState>();

type CommonState = { brands: ReturnType<typeof brandsReducer> };
export const useCommonSelector: TypedUseSelectorHook<CommonState> = useSelector;
