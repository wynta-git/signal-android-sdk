import { createSlice, createAsyncThunk } from '@reduxjs/toolkit';
import { api } from '@/services/api';

const BRAND_COLORS = ['#0091e0', '#7c3aed', '#059669', '#d97706', '#dc2626'];

export const fetchBrands = createAsyncThunk('brands/fetchAll', () => api.fetchBrands());

const brandsSlice = createSlice({
  name: 'brands',
  initialState: { items: [], status: 'idle', error: null },
  reducers: {},
  extraReducers(builder) {
    builder
      .addCase(fetchBrands.pending, (state) => { state.status = 'loading'; })
      .addCase(fetchBrands.fulfilled, (state, action) => {
        state.status = 'succeeded';
        state.items = action.payload.map((b, i) => ({ ...b, color: BRAND_COLORS[i % BRAND_COLORS.length] }));
      })
      .addCase(fetchBrands.rejected, (state, action) => { state.status = 'failed'; state.error = action.error.message; });
  },
});

export const selectAllBrands = (state) => state.brands.items;
export const selectBrandsStatus = (state) => state.brands.status;
export default brandsSlice.reducer;
