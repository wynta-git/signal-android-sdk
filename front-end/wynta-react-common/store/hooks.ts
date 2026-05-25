import { useDispatch, useSelector } from 'react-redux';
import type { TypedUseSelectorHook } from 'react-redux';
import type { RootState, AppDispatch } from './index';
import brandsReducer from './slices/brandsSlice';
import segmentsReducer from './slices/segmentsSlice';

export const useAppDispatch = useDispatch.withTypes<AppDispatch>();
export const useAppSelector = useSelector.withTypes<RootState>();

type CommonState = {
  brands: ReturnType<typeof brandsReducer>;
  segments: ReturnType<typeof segmentsReducer>;
};
export const useCommonSelector: TypedUseSelectorHook<CommonState> = useSelector;
