import { createSlice } from '@reduxjs/toolkit';
import { createPromoCode } from './configuresSlice';

const promoCodesSlice = createSlice({
  name: 'promoCodes',
  initialState: { entities: {} },
  reducers: {},
  extraReducers(builder) {
    builder.addCase(createPromoCode.fulfilled, (state, action) => {
      const code = action.payload;
      state.entities[code.id] = code;
    });
  },
});

export default promoCodesSlice.reducer;
