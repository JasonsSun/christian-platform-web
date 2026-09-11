export default function Loading() {
  return (
    <div className="min-h-[60vh] flex items-center justify-center px-4">
      <div className="text-center">
        <div className="relative w-16 h-16 mx-auto mb-6">
          <div className="absolute inset-0 rounded-full border-4 border-primary-100" />
          <div className="absolute inset-0 rounded-full border-4 border-transparent border-t-primary-500 animate-spin" />
        </div>
        <p className="text-ink-500 font-medium">加载中…</p>
        <p className="text-ink-400 text-sm mt-1">请稍候</p>
      </div>
    </div>
  );
}
