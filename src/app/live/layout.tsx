import type { ReactNode } from 'react';
import ModuleClosed from '@/components/ModuleClosed';
import { isModuleEnabled } from '@/server/modules';
import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: '直播',
  description: '主日崇拜与特会的实时直播与回放，与弟兄姊妹在直播间一同敬拜。',
  alternates: { canonical: '/live' },
};

/** live 归属于「live」模块：后台开关关闭时不渲染内容，改为模块已暂停的占位页。 */
export const revalidate = 15;

export default async function Layout({ children }: { children: ReactNode }) {
  const open = await isModuleEnabled('live');
  if (!open) return <ModuleClosed label={'直播'} />;
  return <>{children}</>;
}
