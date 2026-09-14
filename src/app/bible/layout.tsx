import type { ReactNode } from 'react';
import ModuleClosed from '@/components/ModuleClosed';
import { isModuleEnabled } from '@/server/modules';

/** bible 归属于「bible」模块：后台开关关闭时不渲染内容，改为模块已暂停的占位页。 */
export const revalidate = 300;

export default async function Layout({ children }: { children: ReactNode }) {
  const open = await isModuleEnabled('bible');
  if (!open) return <ModuleClosed label={'圣经阅读'} />;
  return <>{children}</>;
}
