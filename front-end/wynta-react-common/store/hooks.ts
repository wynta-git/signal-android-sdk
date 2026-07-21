import { useDispatch, useSelector } from 'react-redux';
import type { TypedUseSelectorHook } from 'react-redux';
import type { RootState, AppDispatch } from './index';
import brandsReducer from './slices/brandsSlice';
import segmentsReducer from './slices/segmentsSlice';
import usersReducer from './slices/usersSlice';
import copilotReducer from './slices/copilotSlice';

export const useAppDispatch = useDispatch.withTypes<AppDispatch>();
export const useAppSelector = useSelector.withTypes<RootState>();

type CommonState = {
  brands:    ReturnType<typeof brandsReducer>;
  segments:  ReturnType<typeof segmentsReducer>;
  users:     ReturnType<typeof usersReducer>;
  copilot:   ReturnType<typeof copilotReducer>;
};
export const useCommonSelector: TypedUseSelectorHook<CommonState> = useSelector;
