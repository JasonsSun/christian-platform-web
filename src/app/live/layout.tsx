import type { ReactNode } from 'react';
import ModuleClosed from '@/components/ModuleClosed';
import { isModuleEnabled } from '@/server/modules';

/** live 归属于「live」模块：后台开关关闭时不渲染内容，改为模块已暂停的占位页。 */
export const revalidate = 15;

export default async function Layout({ children }: { children: ReactNode }) {
  const open = await isModuleEnabled('live');
  if (!open) return <ModuleClosed label={'直播'} />;
  return <>{children}</>;
}
