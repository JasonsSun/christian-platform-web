import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: '讲章视听',
  description: '主日讲道、查经与福音信息，按主题与讲员浏览音频与文字稿。',
  alternates: { canonical: '/sermons' },
};

export default function SermonsLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
