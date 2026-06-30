'use client';
import DjHeaderSlot from 'wynta-react-common/components/DjHeaderSlot';
import { useDispatch } from 'react-redux';
import { setSelectedBrand } from '../store/slices/uiSlice';

export default function DjHeaderSlotWrapper() {
  const dispatch = useDispatch<any>();
  return (
    <DjHeaderSlot onBrandChange={(id) => dispatch(setSelectedBrand(id))} />
  );
}
