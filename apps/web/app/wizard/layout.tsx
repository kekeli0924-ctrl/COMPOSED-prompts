import { ShowcaseHeader } from '@/components/ShowcaseHeader';

export default function WizardLayout({ children }: { children: React.ReactNode }) {
  return (<><ShowcaseHeader />{children}</>);
}
