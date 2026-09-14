import type { ReactNode } from 'react';
import ModuleClosed from '@/components/ModuleClosed';
import { isModuleEnabled } from '@/server/modules';

/** media 归属于「media」模块：后台开关关闭时不渲染内容，改为模块已暂停的占位页。 */
export const revalidate = 60;

export default async function Layout({ children }: { children: ReactNode }) {
  const open = await isModuleEnabled('media');
  if (!open) return <ModuleClosed label={'媒体中心'} />;
  return <>{children}</>;
}
