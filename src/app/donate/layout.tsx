import type { ReactNode } from 'react';
import ModuleClosed from '@/components/ModuleClosed';
import { isModuleEnabled } from '@/server/modules';

/** donate 归属于「donate」模块：后台开关关闭时不渲染内容，改为模块已暂停的占位页。 */
export const revalidate = 60;

export default async function Layout({ children }: { children: ReactNode }) {
  const open = await isModuleEnabled('donate');
  if (!open) return <ModuleClosed label={'捐赠与支出'} />;
  return <>{children}</>;
}
