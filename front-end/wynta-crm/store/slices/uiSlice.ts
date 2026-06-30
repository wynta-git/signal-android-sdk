import { createSlice, PayloadAction } from '@reduxjs/toolkit';
import { fetchBrands } from 'wynta-react-common/store/slices/brandsSlice';

interface UiState {
  selectedBrand: number | null;
}

const initialState: UiState = {
  selectedBrand: null,
};

const uiSlice = createSlice({
  name: 'ui',
  initialState,
  reducers: {
    setSelectedBrand(state, action: PayloadAction<number | null>) {
      state.selectedBrand = action.payload;
    },
  },
  extraReducers(builder) {
    builder.addCase(fetchBrands.fulfilled, (state, action) => {
      if (state.selectedBrand === null && action.payload.length > 0) {
        state.selectedBrand = action.payload[0].site_id;
      }
    });
  },
});

export const { setSelectedBrand } = uiSlice.actions;
export default uiSlice.reducer;
