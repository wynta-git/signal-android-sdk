import { createSlice } from '@reduxjs/toolkit';
import type { PromoCode } from '@/types';
import { createPromoCode } from './configuresSlice';

interface PromoCodesState {
  entities: Record<string | number, PromoCode>;
}

const initialState: PromoCodesState = { entities: {} };

const promoCodesSlice = createSlice({
  name: 'promoCodes',
  initialState,
  reducers: {},
  extraReducers(builder) {
    builder.addCase(createPromoCode.fulfilled, (state, action) => {
      const code = action.payload;
      state.entities[code.id] = code;
    });
  },
});

export default promoCodesSlice.reducer;
