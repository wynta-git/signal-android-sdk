'use client';
import { useEffect } from 'react';
import Icon from './Icon';
import { useAppDispatch } from '@/store/hooks';
import { clearToast } from '@/store/slices/uiSlice';

export default function Toast({ message }) {
  const dispatch = useAppDispatch();
  useEffect(() => {
    if (!message) return;
    const t = setTimeout(() => dispatch(clearToast()), 2400);
    return () => clearTimeout(t);
  }, [message, dispatch]);
  if (!message) return null;
  return (
    <div className="toast">
      <span className="ok-icon"><Icon name="check" size={13} color="#fff" strokeWidth={3}/></span>
      {message}
    </div>
  );
}
