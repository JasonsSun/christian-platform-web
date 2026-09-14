import type { ReactNode } from 'react';
import ModuleClosed from '@/components/ModuleClosed';
import { isModuleEnabled } from '@/server/modules';

/** messages 归属于「messages」模块：后台开关关闭时不渲染内容，改为模块已暂停的占位页。 */

export default async function Layout({ children }: { children: ReactNode }) {
  const open = await isModuleEnabled('messages');
  if (!open) return <ModuleClosed label={'私信'} />;
  return <>{children}</>;
}
