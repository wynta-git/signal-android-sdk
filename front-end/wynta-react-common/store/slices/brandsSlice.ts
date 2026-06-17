import { createSlice, createAsyncThunk } from '@reduxjs/toolkit';
import { api } from '../../services/api';
import type { Brand, AsyncStatus } from '../../types';

const BRAND_COLORS = ['#0091e0', '#7c3aed', '#059669', '#d97706', '#dc2626'];

interface BrandsState {
  items: Brand[];
  status: AsyncStatus;
  error: string | null;
}

const initialState: BrandsState = { items: [], status: 'idle', error: null };

export const fetchBrands = createAsyncThunk<Brand[], number | undefined>('brands/fetchAll', (programId) => api.fetchBrands(programId));

const brandsSlice = createSlice({
  name: 'brands',
  initialState,
  reducers: {},
  extraReducers(builder) {
    builder
      .addCase(fetchBrands.pending, (state) => { state.status = 'loading'; })
      .addCase(fetchBrands.fulfilled, (state, action) => {
        state.status = 'succeeded';
        state.items = action.payload.map((b, i) => ({ ...b, color: BRAND_COLORS[i % BRAND_COLORS.length] }));
      })
      .addCase(fetchBrands.rejected, (state, action) => {
        state.status = 'failed';
        state.error = action.error.message ?? null;
      });
  },
});

export const selectAllBrands = (state: { brands: BrandsState }) => state.brands.items;
export const selectBrandsStatus = (state: { brands: BrandsState }) => state.brands.status;
export default brandsSlice.reducer;
