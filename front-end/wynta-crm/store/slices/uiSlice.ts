import { createSlice, PayloadAction } from '@reduxjs/toolkit';
import { fetchBrands } from 'wynta-react-common/store/slices/brandsSlice';

interface UiState {
  selectedBrand: number | null;
  headerFragmentFound: boolean | null;
}

const initialState: UiState = {
  selectedBrand: null,
  headerFragmentFound: null,
};

const uiSlice = createSlice({
  name: 'ui',
  initialState,
  reducers: {
    setSelectedBrand(state, action: PayloadAction<number | null>) {
      state.selectedBrand = action.payload;
    },
    setHeaderFragmentFound(state, action: PayloadAction<boolean>) {
      state.headerFragmentFound = action.payload;
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

export const { setSelectedBrand, setHeaderFragmentFound } = uiSlice.actions;
export default uiSlice.reducer;
