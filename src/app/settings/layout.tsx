import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: '设置',
  description: '管理你的账户、隐私、通知方式、两步验证与登录设备。',
};

export default function SettingsLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
