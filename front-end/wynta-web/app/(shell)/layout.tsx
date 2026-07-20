import 'wynta-bonus/globals.css';
import DjHeaderSlot from 'wynta-react-common/components/DjHeaderSlot';

export default function ShellLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <DjHeaderSlot />
      {children}
    </>
  );
}
