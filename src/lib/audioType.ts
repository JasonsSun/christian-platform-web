import type { AudioType } from './types';

/** 音频类型的展示文案与配色，列表页 / 详情页 / 后台共用，避免各处再靠 URL 猜类型 */
export const AUDIO_TYPE_META: Record<AudioType, { label: string; tone: string; hint: string }> = {
  vocal: {
    label: '人声',
    tone: 'bg-emerald-50 text-emerald-700',
    hint: '真人演唱版本',
  },
  instrumental: {
    label: '伴奏',
    tone: 'bg-amber-50 text-amber-700',
    hint: '纯伴奏/合成音频，暂无人声演唱',
  },
  none: {
    label: '无音频',
    tone: 'bg-ink-100 text-ink-500',
    hint: '暂无音频，欢迎上传你演唱的版本',
  },
};

export function audioTypeMeta(t?: AudioType) {
  return AUDIO_TYPE_META[t || 'none'];
}

/** 非人声版本统一提示语，用于引导社区补齐原唱 */
export const VOCAL_WANTED_HINT = '这首还没有人声版本，欢迎上传你自己或诗班演唱的录音';

/** 没有登记外链时，降级去哪个平台找——站内有大量用户上传的演唱版 */
export const VOCAL_FALLBACK_SOURCE = 'B站';

/**
 * 非人声曲目的「找人声版」入口。
 *
 * 平台不搬运版权音频（下载别人的录音存进自己服务器属于侵权，而公有领域音源
 * 在境内网络又不可达），所以只把听众送过去：
 *   - 管理员已核实并登记 listenUrl → 直接用那个地址，标注为「已核实」
 *   - 没登记 → 按「歌名 + 作者」去 B 站搜索，不构造死链
 *
 * 这样无论将来换成哪个来源（教会自有录音、其他平台、采购曲库），
 * 都只改 listen_url 一个字段，页面逻辑不用动。
 */
export function vocalListenTarget(s: {
  title: string;
  author?: string;
  listenUrl?: string;
  listenSource?: string;
}) {
  const url = (s.listenUrl || '').trim();
  if (url) {
    return {
      url,
      source: (s.listenSource || '').trim() || '外部平台',
      verified: true,
      label: `已核实：${(s.listenSource || '').trim() || '外部平台'}`,
    };
  }
  const kw = `${s.title}${s.author ? ` ${s.author}` : ''} 赞美诗 演唱`;
  return {
    url: `https://search.bilibili.com/all?keyword=${encodeURIComponent(kw)}`,
    source: VOCAL_FALLBACK_SOURCE,
    verified: false,
    label: `去${VOCAL_FALLBACK_SOURCE}找这首歌的人声版`,
  };
}
