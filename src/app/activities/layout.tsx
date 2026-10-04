import type { ReactNode } from 'react';
import ModuleClosed from '@/components/ModuleClosed';
import { isModuleEnabled } from '@/server/modules';
import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: '团契活动',
  description: '教会与团契的线下线上活动，报名、日历与我的参与记录一站式管理。',
  alternates: { canonical: '/activities' },
};

/** activities 归属于「activities」模块：后台开关关闭时不渲染内容，改为模块已暂停的占位页。 */
export const revalidate = 60;

export default async function Layout({ children }: { children: ReactNode }) {
  const open = await isModuleEnabled('activities');
  if (!open) return <ModuleClosed label={'活动'} />;
  return <>{children}</>;
}
