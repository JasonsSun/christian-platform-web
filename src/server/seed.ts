import type { Pool } from 'mysql2/promise';
import bcrypt from 'bcryptjs';
import { ts, newId } from './db';
import { VERSES } from './bible';

const COLORS = ['#4f6df5', '#f59e0b', '#10b981', '#8b5cf6', '#ef4444', '#06b6d4', '#ec4899', '#84cc16'];

type U = {
  username: string; email: string; password: string; name: string;
  role: string; bio: string; city: string; church: string;
};

const USERS: U[] = [
  { username: 'jasonssun', email: '18639246787@163.com', password: 'Hang.0212', name: '平台管理员', role: 'admin', bio: '平台管理员 · 负责内容与权限治理', city: '上海', church: '恩典堂' },
  { username: 'moderator', email: 'moderator@platform.dev', password: 'Mod.2026#init', name: '李同工', role: 'moderator', bio: '内容审核同工 · 守护社区纯净', city: '北京', church: '守望教会' },
  { username: 'grace', email: 'grace@platform.dev', password: 'User.2026#init', name: '陈恩惠', role: 'member', bio: '蒙恩的罪人，两个孩子的妈妈', city: '上海', church: '恩典堂' },
  { username: 'david', email: 'david@platform.dev', password: 'User.2026#init', name: '王大卫', role: 'member', bio: '青年团契带领者 · 爱读诗篇', city: '杭州', church: '迦南堂' },
  { username: 'sarah', email: 'sarah@platform.dev', password: 'User.2026#init', name: '刘撒拉', role: 'member', bio: '敬拜主领 · 用诗歌服事', city: '广州', church: '锡安堂' },
  { username: 'timothy', email: 'timothy@platform.dev', password: 'User.2026#init', name: '赵提摩', role: 'member', bio: '神学生 · 正在学习系统神学', city: '成都', church: '生命堂' },
  { username: 'mary', email: 'mary@platform.dev', password: 'User.2026#init', name: '孙马利亚', role: 'member', bio: '退休教师 · 每日灵修不间断', city: '南京', church: '以马内利堂' },
  { username: 'peter', email: 'peter@platform.dev', password: 'User.2026#init', name: '周彼得', role: 'member', bio: '职场弟兄 · 周三小组组长', city: '深圳', church: '光盐教会' },
];

type C = {
  title: string; body: string; type: string; status: string; tags: string; cover: string;
  author: string; likes: number; comments: string[]; createdDaysAgo: number;
};

const CONTENTS: C[] = [
  {
    title: '在职场中活出信仰：一个项目经理的十年',
    body: '十年前我刚入职时，以为信仰只属于周日。直到一次项目失败，我在深夜的办公室里第一次认真祷告，才发现神一直在等我转向他。\n\n这几年我慢慢学会三件事：第一，把结果交给神，把过程交给自己；第二，诚实比聪明更重要；第三，每周固定一天不加班，用来陪伴家人和聚会。\n\n如果你也在职场中挣扎，请记住：你的工位就是你的禾场。',
    type: 'testimony', status: 'published', tags: '职场,见证,门徒训练', cover: '💼',
    author: 'peter', likes: 42, createdDaysAgo: 2,
    comments: ['太有共鸣了，我也在学着把结果交托。', '谢谢分享，第三点对我帮助很大。'],
  },
  {
    title: '诗篇 23 篇灵修：牧者与幽谷',
    body: '"耶和华是我的牧者，我必不至缺乏。"大卫写这首诗时，自己曾经就是牧羊人。他知道羊需要什么：青草、活水、安稳的路。\n\n"我虽然行过死荫的幽谷，也不怕遭害。"注意，是"行过"，不是"住下"。幽谷是路，不是终点。\n\n今天的你也许正在谷中，请记住两件事：杖和竿都在牧人手里，而不是在你手里。',
    type: 'devotion', status: 'published', tags: '灵修,诗篇,安慰', cover: '📖',
    author: 'david', likes: 88, createdDaysAgo: 4,
    comments: ['"幽谷是路，不是终点"——这句话我要记下来。', '感谢分享，正在低谷中被安慰到。'],
  },
  {
    title: '敬拜不是唱歌：从诗章、颂词、灵歌说起',
    body: '很多人把敬拜等同于唱诗。但保罗说要"用诗章、颂词、灵歌彼此教导，互相劝戒，心被恩感歌颂神"。\n\n诗章指向旧约的诗篇，颂词是教会的宣告，灵歌则是圣灵当下的感动。三者缺一，敬拜就会失衡——只有情感没有真理，或只有真理没有情感。\n\n好的敬拜，是真理与心灵同时被点燃。',
    type: 'article', status: 'published', tags: '敬拜,音乐,神学', cover: '🎵',
    author: 'sarah', likes: 65, createdDaysAgo: 6,
    comments: ['受教了，一直在找这个平衡。'],
  },
  {
    title: '如何在忙碌中建立稳定的读经习惯',
    body: '很多人问我：怎么才能坚持读经？我的答案很朴素：把它绑定到已有的习惯上。\n\n1. 选定一个"锚点习惯"，比如早晨第一杯咖啡；\n2. 读经量从少开始，一天十节就够；\n3. 用一句话写下今天神对你说的话；\n4. 找一个同伴，每周一起分享一次。\n\n坚持三十天后，你会发现读经不再是任务，而是呼吸。',
    type: 'article', status: 'published', tags: '读经,灵修,习惯', cover: '⏰',
    author: 'timothy', likes: 120, createdDaysAgo: 8,
    comments: ['锚点习惯这个方法真的有用！', '第三点写下来很关键，我已经写了三个月。'],
  },
  {
    title: '小组带领者的三个陷阱',
    body: '带小组五年，我踩过三个坑，分享给同样服事的你：\n\n第一，讲太多听太少。小组不是第二场讲道。\n第二，急着给答案。有时候陪伴比建议更重要。\n第三，独自承担。你没有义务拯救任何人，只有主能。\n\n服事是恩典，不是绩效。',
    type: 'article', status: 'published', tags: '小组,服事,门徒训练', cover: '🤝',
    author: 'peter', likes: 74, createdDaysAgo: 11,
    comments: [],
  },
  {
    title: '退休之后，我开始了第二人生',
    body: '退休那年我很失落，觉得不再被需要。直到教会邀请我参与探访事工。\n\n如今每周我探访三位独居长者，听他们讲过去的故事。我发现，被需要的不是能力，而是一颗愿意的心。',
    type: 'testimony', status: 'published', tags: '见证,服事,长者', cover: '🌿',
    author: 'mary', likes: 96, createdDaysAgo: 14,
    comments: ['阿姨的分享让我很感动。', '愿意的心，阿们。'],
  },
  {
    title: '当我为孩子的前途焦虑时',
    body: '孩子中考那年，我天天失眠。我把焦虑包装成"为他好"，其实是我不信神掌权。\n\n有一天读到"你们要先求他的国和他的义，这些东西都要加给你们了"，我哭了。我把孩子交还给神，也开始每天为他祷告而不是唠叨。\n\n现在他高二，我们的关系比从前好太多。',
    type: 'testimony', status: 'published', tags: '家庭,见证,祷告', cover: '🙏',
    author: 'grace', likes: 133, createdDaysAgo: 18,
    comments: ['正在经历同样的事，谢谢姊妹。', '把焦虑包装成"为他好"，一针见血。'],
  },
  {
    title: '教会历史小课堂：尼西亚信经说了什么',
    body: '公元 325 年的尼西亚会议，是为了回答一个问题：耶稣到底是谁？\n\n信经宣告基督是"出于真神的真神，受生而非被造，与父同质"。这句话捍卫了一个核心：如果基督不是完全的神，他就不能拯救我们。\n\n了解历史，会让我们今天的信仰更扎实。',
    type: 'article', status: 'published', tags: '神学,历史,信经', cover: '🏛️',
    author: 'timothy', likes: 58, createdDaysAgo: 22,
    comments: [],
  },
  {
    title: '关于奉献的几点思考（草稿）',
    body: '这是一篇还没写完的草稿，主要想讨论十一奉献在新约时代的实践。先保存，等读完几本书再补充。',
    type: 'article', status: 'draft', tags: '奉献', cover: '📝',
    author: 'timothy', likes: 0, createdDaysAgo: 1, comments: [],
  },
  {
    title: '主日讲章：彼此相爱的新命令',
    body: '"我赐给你们一条新命令，乃是叫你们彼此相爱。"这条命令"新"在哪里？不是因为爱是新事，而是因为爱的标准被更新了——"像我爱你们一样"。\n\n基督的爱是舍己的爱、主动的爱、不计代价的爱。这就是教会在世人面前的见证。',
    type: 'devotion', status: 'published', tags: '讲章,爱,约翰福音', cover: '✝️',
    author: 'jasonssun', likes: 150, createdDaysAgo: 5,
    comments: ['主日听这篇讲道很得着。'],
  },
  {
    title: '我该不该和非信徒结婚？',
    body: '这是一个常见的提问。圣经明确教导"信与不信不能同负一轭"，但更重要的是理解背后的原则：婚姻是属灵的同盟，需要在最核心的事上同心。\n\n文章写得比较直接，需要审核方确认措辞是否合适。',
    type: 'article', status: 'pending_review', tags: '婚姻,辅导', cover: '💍',
    author: 'timothy', likes: 0, createdDaysAgo: 1, comments: [],
  },
  {
    title: '关于医治祷告的一些见证分享',
    body: '收集了几位弟兄姊妹在祷告中得医治的经历，整理成文。内容涉及个人经历，提交审核。',
    type: 'testimony', status: 'pending_review', tags: '祷告,医治,见证', cover: '🕊️',
    author: 'mary', likes: 0, createdDaysAgo: 0, comments: [],
  },
  {
    title: '广告：加微信领资料',
    body: '添加微信 xxxxx 领取属灵资料大礼包，并推荐投资理财项目。',
    type: 'article', status: 'rejected', tags: '违规', cover: '⛔',
    author: 'david', likes: 0, createdDaysAgo: 3, comments: [],
  },
];

type A = {
  title: string; desc: string; category: string; location: string; city: string;
  startInDays: number; hours: number; capacity: number; cover: string; organizer: string;
  registrants: string[];
};

const ACTIVITIES: A[] = [
  {
    title: '主日联合崇拜 · 复活节的盼望',
    desc: '四堂联合崇拜，主题信息：空坟墓带来的改变。设有儿童主日学与爱筵。',
    category: 'worship', location: '恩典堂主堂', city: '上海', startInDays: 3, hours: 2,
    capacity: 300, cover: '⛪', organizer: 'jasonssun', registrants: ['grace', 'david', 'sarah', 'timothy', 'mary', 'peter'],
  },
  {
    title: '青年团契：查经《腓立比书》',
    desc: '每周五晚查经，本期四课：喜乐的秘诀、基督的心、天上的国民、靠主知足。欢迎 18-35 岁青年参加。',
    category: 'fellowship', location: '迦南堂副堂', city: '杭州', startInDays: 5, hours: 2,
    capacity: 40, cover: '📖', organizer: 'david', registrants: ['grace', 'timothy', 'peter'],
  },
  {
    title: '敬拜赞美练习 & 诗班招募',
    desc: '为下半年诗歌布道会预备，招募各声部与乐手。无需专业基础，愿意委身即可。',
    category: 'worship', location: '锡安堂琴房', city: '广州', startInDays: 8, hours: 3,
    capacity: 25, cover: '🎶', organizer: 'sarah', registrants: ['grace', 'mary'],
  },
  {
    title: '户外洗礼 & 郊游',
    desc: '本年度第二次洗礼，随后有午餐与交通分享。受洗者请提前参加两次慕道班。',
    category: 'fellowship', location: '青浦淀山湖', city: '上海', startInDays: 16, hours: 6,
    capacity: 80, cover: '💧', organizer: 'jasonssun', registrants: ['grace', 'peter'],
  },
  {
    title: '职场门徒训练营（周六全天）',
    desc: '面向在职弟兄姊妹：如何在工作中操练诚实、卓越与服事。含三次工作坊。',
    category: 'training', location: '光盐教会', city: '深圳', startInDays: 12, hours: 8,
    capacity: 60, cover: '💼', organizer: 'peter', registrants: ['david', 'timothy'],
  },
  {
    title: '长者探访关怀行',
    desc: '探访社区独居长者，送生活物资并陪伴聊天。分为三个小组，需要提前报名。',
    category: 'service', location: '以马内利堂集合', city: '南京', startInDays: 2, hours: 4,
    capacity: 30, cover: '🤝', organizer: 'mary', registrants: ['grace', 'sarah'],
  },
  {
    title: '线上晨祷会 · 21 天守望',
    desc: '每天清晨 6:30-7:00，线上一起读经祷告。为教会、城市与家庭守望。',
    category: 'prayer', location: '线上会议', city: '全国', startInDays: 1, hours: 1,
    capacity: 200, cover: '🙏', organizer: 'grace', registrants: ['david', 'mary', 'timothy', 'sarah'],
  },
];

type G = {
  name: string; desc: string; category: string; city: string; cover: string;
  owner: string; members: string[]; posts: string[];
};

const GROUPS: G[] = [
  {
    name: '青年团契 · 同行', desc: '18-35 岁青年人的家。每周查经、每月一次户外活动，彼此陪伴走信仰路。',
    category: 'fellowship', city: '杭州', cover: '🔥', owner: 'david',
    members: ['grace', 'timothy', 'peter', 'sarah'],
    posts: ['本周查经腓立比书第 2 章，记得预习。', '上周大家分享的代祷事项我整理好了，欢迎补充。'],
  },
  {
    name: '妈妈祷告小组', desc: '为丈夫、孩子与家庭守望的妈妈们。每周三上午线上聚会。',
    category: 'prayer', city: '上海', cover: '🌸', owner: 'grace',
    members: ['mary', 'sarah'],
    posts: ['本周为孩子升学祷告，求主赐下平安。', '感谢大家的代祷，先生的检查结果良好！'],
  },
  {
    name: '敬拜者联盟', desc: '敬拜主领、乐手与诗班成员交流平台：分享谱子、讨论流程、彼此代祷。',
    category: 'worship', city: '广州', cover: '🎵', owner: 'sarah',
    members: ['david', 'grace'],
    posts: ['推荐几首适合将临期的诗歌。', '关于现场混音的几个小技巧，写在文档里了。'],
  },
  {
    name: '职场光盐', desc: '在职基督徒的互助小组，分享职场伦理、时间管理与见证。',
    category: 'fellowship', city: '深圳', cover: '💼', owner: 'peter',
    members: ['timothy', 'david'],
    posts: ['如何在团队中坚持诚实又不显得高傲？', '本月主题：休息也是属灵操练。'],
  },
  {
    name: '神学读书会', desc: '每月读一本神学/灵修经典，月末线上讨论。本期：《认识神》。',
    category: 'study', city: '全国', cover: '📚', owner: 'timothy',
    members: ['mary', 'peter', 'grace'],
    posts: ['第三章读完了，巴刻对"启示"的定义很精彩。', '下次讨论改到周日晚八点。'],
  },
];

const PRAYERS: { user: string; body: string; amen: number; daysAgo: number; answered?: boolean }[] = [
  { user: 'grace', body: '为儿子高考祷告，求主赐他专心与平安，也赐我不再焦虑的心。', amen: 24, daysAgo: 1 },
  { user: 'peter', body: '为团队里的同事阿明祷告，他最近家里遇到困难，求主开路。', amen: 18, daysAgo: 2 },
  { user: 'mary', body: '感谢主，探访的李婆婆昨天决志了！求主坚固她的信心。', amen: 31, daysAgo: 3, answered: true },
  { user: 'sarah', body: '为下周的诗歌布道会祷告，愿圣灵自由运行。', amen: 15, daysAgo: 1 },
  { user: 'david', body: '为团契里几位软化的肢体祷告，求主把他们寻回。', amen: 22, daysAgo: 4 },
  { user: 'timothy', body: '为神学院期末论文祷告，也求主指示毕业后的服事方向。', amen: 12, daysAgo: 5 },
  { user: 'grace', body: '为母亲的膝关节手术祷告，求主赐医生智慧、赐母亲康复。', amen: 27, daysAgo: 6 },
  { user: 'peter', body: '为自己祷告，求主挪去我对成功的偶像化。', amen: 19, daysAgo: 7 },
];

type S = {
  title: string; author: string; category: string; tags: string; lyrics: string; plays: number;
};

const SONGS: S[] = [
  {
    title: '奇异恩典', author: 'John Newton', category: '经典圣诗', tags: '恩典,救赎,见证',
    plays: 1280,
    lyrics: `奇异恩典，何等甘甜，我罪已得赦免；
前我失丧，今被寻回，瞎眼今得看见。

浩大恩典，使我敬畏，使我心得安慰；
初信之时，即蒙恩惠，真是何等宝贵。

历尽艰险，饱受磨难，我今安然度过；
恩典引领，带我归回，天家永居之所。

将来禧年，圣徒欢聚，恩典如日辉煌；
千秋万载，赞美不息，颂赞我主真光。`,
  },
  {
    title: '千古保障', author: '马丁·路德', category: '经典圣诗', tags: '信靠,争战,坚固',
    plays: 860,
    lyrics: `上主是我坚固保障，庄严雄峻永坚强；
上主是我安稳慈航，助我乘风冲骇浪。

我们一生所遇艰险，全赖主恩去抵挡；
靠主威力，我无惧怕，因主是我力量。

纵有魔鬼盘踞世上，仍旧狰狞逞凶狂；
我们不怕，因神旨意，真理必定得胜。`,
  },
  {
    title: '我心灵得安宁', author: 'Horatio Spafford', category: '经典圣诗', tags: '安慰,平安,交托',
    plays: 742,
    lyrics: `有时享平安，如江河平又稳，
有时遇悲伤似浪滚；
不论在何环境，我已蒙主引领，
我心灵得安宁，得安宁。

撒旦虽来侵，众试炼虽来临，
我有把握在我心；
基督已顾念我环境，用宝血买赎我，
我心灵得安宁，得安宁。

我罪虽深重，主宝血完全遮盖，
我不绝望，因主爱；
我眼虽流泪，我心仍向主敞开，
我心灵得安宁，得安宁。`,
  },
  {
    title: '耶稣恩友', author: 'Joseph Scriven', category: '经典圣诗', tags: '祷告,主爱,依靠',
    plays: 690,
    lyrics: `耶稣是我亲爱朋友，担当我罪与忧愁；
何等权利能将万事，带到主恩座前求！

多少平安屡屡失去，多少痛苦白白受；
皆因未将各样事情，带到主恩座前求。

劳苦多愁，软弱不堪，挂虑重担压肩头；
主仍叫我前来求告，带到主恩座前求。`,
  },
  {
    title: '三一颂', author: '传统圣诗', category: '颂赞', tags: '三一,颂赞,崇拜',
    plays: 512,
    lyrics: `赞美真神万福之根，地上生灵当赞主恩，
天上万军颂主大名，赞美圣父、圣子、圣灵。阿们。`,
  },
  {
    title: '主祷文', author: '马太福音 6:9-13', category: '颂赞', tags: '经文,祷告,主祷文',
    plays: 455,
    lyrics: `我们在天上的父，愿人都尊你的名为圣。
愿你的国降临，愿你的旨意行在地上，如同行在天上。

我们日用的饮食，今日赐给我们。
免我们的债，如同我们免了人的债。

不叫我们遇见试探，救我们脱离凶恶。
因为国度、权柄、荣耀，全是你的，直到永远。阿们。`,
  },
  {
    title: '平安夜', author: 'Franz Gruber', category: '节期', tags: '圣诞,平安,赞美',
    plays: 623,
    lyrics: `平安夜，圣善夜，万暗中，光华射；
照着圣母也照着圣婴，多少慈祥也多少天真，
静享天赐安眠，静享天赐安眠。

平安夜，圣善夜，牧羊人，在旷野；
忽然看见了天上光华，听见天军唱哈利路亚，
救主今夜降生，救主今夜降生。`,
  },
  {
    title: '如鹿切慕溪水', author: '诗篇 42:1', category: '敬拜', tags: '渴慕,敬拜,诗篇',
    plays: 588,
    lyrics: `神啊，我的心切慕你，如鹿切慕溪水。
唯有你是我心所求，唯有你是我所爱。

你是我的力量，我的盾牌，
我专心倚靠你，就得帮助。
我心中欢喜，我要用诗歌颂赞你。`,
  },
];

export async function seedIfEmpty(pool: Pool) {
  // ---------- 支出公示(独立判断,老库升级也能补灌) ----------
  // users 非空的老库在下面会早退,但 expenses 为空时仍需补演示支出,保证公示页有内容
  await seedExpensesIfEmpty(pool);

  // ---------- 组织/机构(同样独立判断,保证组织管理页有可审核的数据) ----------
  await seedOrganizationsIfEmpty(pool);

  const [[row]] = await pool.query<any[]>('SELECT COUNT(*) AS c FROM users');
  if (Number(row.c) > 0) return;

  const day = 86400000;
  const ago = (d: number) => ts(new Date(Date.now() - d * day));
  const inDays = (d: number, plusHours = 0) =>
    ts(new Date(Date.now() + d * day + plusHours * 3600000));

  // ---------- 用户 ----------
  const idByUser: Record<string, string> = {};
  for (let i = 0; i < USERS.length; i++) {
    const u = USERS[i];
    const id = newId('usr');
    idByUser[u.username] = id;
    await pool.query(
      `INSERT INTO users (id, username, email, password_hash, display_name, role, status, avatar_color, bio, city, region, church, created_at)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)`,
      [id, u.username, u.email, bcrypt.hashSync(u.password, 8), u.name, u.role, 'active',
       COLORS[i % COLORS.length], u.bio, u.city, 'CN', u.church, ago(60 - i * 3)]
    );
  }

  // ---------- 内容 + 审核任务 ----------
  const idByContent: Record<string, string> = {};
  for (const c of CONTENTS) {
    const id = newId('cnt');
    idByContent[c.title] = id;
    const published = c.status === 'published' ? ago(c.createdDaysAgo) : null;
    await pool.query(
      `INSERT INTO contents (id, author_id, title, body, content_type, status, scope, region, tags, cover, like_count, comment_count, view_count, created_at, published_at)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
      [id, idByUser[c.author], c.title, c.body, c.type, c.status, 'global', 'CN', c.tags, c.cover,
       c.likes, c.comments.length, c.likes * 7 + 30, ago(c.createdDaysAgo), published]
    );

    if (c.status === 'pending_review') {
      await pool.query(
        `INSERT INTO review_tasks (id, content_id, status, reviewer_id, reason, created_at) VALUES (?,?,?,?,?,?)`,
        [newId('rvw'), id, 'pending', null, '', ago(c.createdDaysAgo)]
      );
    }
    if (c.status === 'rejected') {
      await pool.query(
        `INSERT INTO review_tasks (id, content_id, status, reviewer_id, reason, created_at, decided_at)
         VALUES (?,?,?,?,?,?,?)`,
        [newId('rvw'), id, 'rejected', idByUser.moderator, '含广告与导流内容，违反社区规范', ago(c.createdDaysAgo), ago(c.createdDaysAgo - 1)]
      );
    }
    if (c.status === 'published') {
      await pool.query(
        `INSERT INTO review_tasks (id, content_id, status, reviewer_id, reason, created_at, decided_at)
         VALUES (?,?,?,?,?,?,?)`,
        [newId('rvw'), id, 'approved', idByUser.moderator, '', ago(c.createdDaysAgo), ago(c.createdDaysAgo)]
      );
    }

    // 点赞
    const likers = Object.keys(idByUser).slice(0, Math.min(c.likes > 0 ? 5 : 0, 6));
    for (const lk of likers) {
      await pool.query(
        `INSERT IGNORE INTO content_likes (content_id, user_id, created_at) VALUES (?,?,?)`,
        [id, idByUser[lk], ago(c.createdDaysAgo)]
      );
    }
    // 评论
    for (let k = 0; k < c.comments.length; k++) {
      const author = Object.keys(idByUser)[(k + 2) % USERS.length];
      await pool.query(
        `INSERT INTO comments (id, content_id, user_id, body, created_at) VALUES (?,?,?,?,?)`,
        [newId('cmt'), id, idByUser[author], c.comments[k], ago(Math.max(0, c.createdDaysAgo - 1))]
      );
    }
  }

  // ---------- 活动 ----------
  for (const a of ACTIVITIES) {
    const id = newId('act');
    await pool.query(
      `INSERT INTO activities (id, organizer_id, title, description, category, location, city, start_at, end_at, capacity, cover, status, created_at)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)`,
      [id, idByUser[a.organizer], a.title, a.desc, a.category, a.location, a.city,
       inDays(a.startInDays), inDays(a.startInDays, a.hours), a.capacity, a.cover, 'published', ago(10)]
    );
    for (const r of a.registrants) {
      await pool.query(
        `INSERT IGNORE INTO activity_registrations (id, activity_id, user_id, status, created_at) VALUES (?,?,?,?,?)`,
        [newId('reg'), id, idByUser[r], 'confirmed', ago(3)]
      );
    }
  }

  // ---------- 团契 ----------
  for (const g of GROUPS) {
    const id = newId('grp');
    await pool.query(
      `INSERT INTO \`groups\` (id, name, description, category, owner_id, city, cover, created_at) VALUES (?,?,?,?,?,?,?,?)`,
      [id, g.name, g.desc, g.category, idByUser[g.owner], g.city, g.cover, ago(45)]
    );
    await pool.query(
      `INSERT INTO group_members (group_id, user_id, role, joined_at) VALUES (?,?,?,?)`,
      [id, idByUser[g.owner], 'owner', ago(45)]
    );
    for (const m of g.members) {
      await pool.query(
        `INSERT IGNORE INTO group_members (group_id, user_id, role, joined_at) VALUES (?,?,?,?)`,
        [id, idByUser[m], 'member', ago(30)]
      );
    }
    for (let k = 0; k < g.posts.length; k++) {
      const author = k % 2 === 0 ? g.owner : g.members[k % g.members.length] || g.owner;
      await pool.query(
        `INSERT INTO group_posts (id, group_id, user_id, body, created_at) VALUES (?,?,?,?,?)`,
        [newId('gps'), id, idByUser[author], g.posts[k], ago(k + 1)]
      );
    }
  }

  // ---------- 代祷 ----------
  for (const p of PRAYERS) {
    const id = newId('pry');
    await pool.query(
      `INSERT INTO prayers (id, user_id, body, amen_count, answered, created_at) VALUES (?,?,?,?,?,?)`,
      [id, idByUser[p.user], p.body, p.amen, p.answered ? 1 : 0, ago(p.daysAgo)]
    );
  }

  // ---------- 关注关系 ----------
  const followPairs: [string, string][] = [
    ['grace', 'david'], ['grace', 'mary'], ['david', 'jasonssun'], ['david', 'timothy'],
    ['sarah', 'david'], ['timothy', 'jasonssun'], ['peter', 'grace'], ['mary', 'grace'],
    ['peter', 'timothy'], ['sarah', 'jasonssun'], ['grace', 'jasonssun'], ['mary', 'sarah'],
  ];
  for (const [a, b] of followPairs) {
    await pool.query(
      `INSERT IGNORE INTO follows (follower_id, followee_id, created_at) VALUES (?,?,?)`,
      [idByUser[a], idByUser[b], ago(20)]
    );
  }

  // ---------- 私信 ----------
  const msgPairs: [string, string, string][] = [
    ['grace', 'mary', '阿姨，周日的探访我也能一起去吗？'],
    ['mary', 'grace', '当然可以，早上八点在教堂门口集合。'],
    ['david', 'peter', '职场门训的材料我发你邮箱了。'],
    ['peter', 'david', '收到，谢谢！这次一定认真读完。'],
  ];
  for (let i = 0; i < msgPairs.length; i++) {
    const [f, t, body] = msgPairs[i];
    await pool.query(
      `INSERT INTO messages (id, from_id, to_id, body, \`read\`, created_at) VALUES (?,?,?,?,?,?)`,
      [newId('msg'), idByUser[f], idByUser[t], body, i % 2 === 1 ? 0 : 1, ago(1)]
    );
  }

  // ---------- 通知 ----------
  const notifSeed: [string, string, string, string, string][] = [
    ['grace', 'content_approved', '内容已通过审核', '你的见证《当我为孩子的前途焦虑时》已发布', '/contents/' + (idByContent['当我为孩子的前途焦虑时'] || '')],
    ['grace', 'new_comment', '收到新评论', '姊妹在你的文章下留言：正在经历同样的事，谢谢姊妹。', ''],
    ['david', 'activity_reminder', '活动提醒', '你报名的「青年团契：查经《腓立比书》」将在 5 天后开始', ''],
    ['timothy', 'content_pending', '内容待审核', '《我该不该和非信徒结婚？》正在等待审核', ''],
    ['peter', 'welcome', '欢迎加入', '欢迎你来到圣约社区，先去完善一下个人资料吧', '/me'],
  ];
  for (const [u, type, title, body, link] of notifSeed) {
    await pool.query(
      `INSERT INTO notifications (id, user_id, type, title, body, link, \`read\`, created_at) VALUES (?,?,?,?,?,?,?,?)`,
      [newId('ntf'), idByUser[u], type, title, body, link, 0, ago(1)]
    );
  }

  // ---------- 诗歌 ----------
  for (const s of SONGS) {
    await pool.query(
      `INSERT INTO songs (id, title, author, category, tags, lyrics, audio_url, play_count, created_at)
       VALUES (?,?,?,?,?,?,?,?,?)`,
      [newId('sng'), s.title, s.author, s.category, s.tags, s.lyrics, '', s.plays, ago(30)]
    );
  }

  // ---------- 经文 ----------
  for (const v of VERSES) {
    for (let i = 0; i < v.verses.length; i++) {
      await pool.query(
        `INSERT IGNORE INTO bible_verses (version, book_id, chapter, verse, text) VALUES (?,?,?,?,?)`,
        [v.version, v.book, v.chapter, (v.start || 1) + i, v.verses[i]]
      );
    }
  }

  // ---------- 捐赠记录(自愿捐赠,金额仅管理员可见) ----------
  // 字段顺序: donor_id, display_name, donor_type, church_name, amount_cents, message, anonymous, status, reviewed_by, reviewed_at, created_at
  const DONATIONS: [string, string, string, string, number, string, number, string, string | null, number | null, number][] = [
    ['grace',   '陈恩惠',   'personal', '',        50000, '愿平台成为更多人的祝福',            0, 'confirmed', 'jasonssun', 0, 12],
    ['david',   '王大卫',   'personal', '',        20000, '感谢同工们的摆上',                0, 'confirmed', 'jasonssun', 1, 10],
    [ 'peter',  '光盐教会', 'church',   '光盐',    100000, '以教会名义支持福音事工',          0, 'confirmed', 'jasonssun', 2, 8],
    ['sarah',   '刘撒拉',   'personal', '',        10000, '一点心意,求主使用',               0, 'confirmed', 'jasonssun', 3, 6],
    ['timothy', '',         'personal', '',        30000, '愿主纪念每一位奉献的肢体',        1, 'confirmed', 'jasonssun', 4, 4],
    ['mary',    '孙马利亚', 'personal', '',        8000,  '退休了也要尽一份心',              0, 'pending',   null,  null, 2],
    ['moderator','守望教会','church',   '守望',    60000, '守望教会同工共同奉献',            0, 'pending',   null,  null, 1],
  ];
  for (const [uname, dname, dtype, church, cents, msg, anon, status, reviewer, reviewedDaysAgo, createdDaysAgo] of DONATIONS) {
    await pool.query(
      `INSERT INTO donations (id, donor_id, display_name, donor_type, church_name, amount_cents, message, anonymous, status, note, reviewed_by, reviewed_at, created_at)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)`,
      [newId('don'), idByUser[uname] || null, dname, dtype, church, cents, msg, anon, status, '',
       reviewer ? idByUser[reviewer] : null,
       reviewedDaysAgo === null ? null : ago(reviewedDaysAgo),
       ago(createdDaysAgo)]
    );
  }

  // ---------- 审计日志 ----------
  await pool.query(
    `INSERT INTO audit_logs (id, actor_id, action, entity_type, entity_id, detail, ip, created_at) VALUES (?,?,?,?,?,?,?,?)`,
    [newId('aud'), idByUser.admin, 'SEED_INIT', 'system', '', '初始化演示数据', '127.0.0.1', ago(0)]
  );
}

async function seedExpensesIfEmpty(pool: Pool) {
  const [[cnt]] = await pool.query<any[]>('SELECT COUNT(*) AS c FROM expenses');
  if (Number(cnt.c) > 0) return;

  // 老库升级时取 admin 作为录入人;查不到则留空(不影响公示)
  let adminId: string | undefined;
  try {
    const [[admin]] = await pool.query<any[]>(`SELECT id FROM users WHERE role='admin' LIMIT 1`);
    adminId = admin?.id;
  } catch { /* 忽略 */ }

  const day = 86400000;
  const ago = (d: number) => ts(new Date(Date.now() - d * day));
  // 近三个月的归属月份 YYYY-MM
  const months: string[] = [];
  const now = new Date();
  for (let i = 1; i <= 3; i++) {
    const dt = new Date(now.getFullYear(), now.getMonth() - i + 1, 1);
    months.push(`${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, '0')}`);
  }

  // [category, title, note, 元, 月份偏移(0=上个月,2=三个月前)]
  const EXPENSES: [string, string, string, number, number][] = [
    ['server',    '云服务器(2C4G)',   '平台主站、API 与 MySQL 数据库',            128, 2],
    ['bandwidth', 'CDN 流量包',       '媒体资源与圣经文本静态分发',                45, 2],
    ['server',    '云服务器(2C4G)',   '平台主站、API 与 MySQL 数据库',            128, 1],
    ['storage',   '对象存储扩容',     '诗歌音频与活动相册存储空间',                30, 1],
    ['bandwidth', '直播推流带宽',     '主日直播上行带宽按量计费',                  68, 1],
    ['domain',    '域名与SSL证书',    'shengyue.com 续费一年',                    80, 0],
    ['server',    '云服务器(2C4G)',   '平台主站、API 与 MySQL 数据库',            128, 0],
    ['ops',       '运维备份服务',     '数据库每日自动备份与异地容灾',              20, 0],
  ];
  for (const [category, title, note, yuan, mOffset] of EXPENSES) {
    await pool.query(
      `INSERT INTO expenses (id, category, title, note, amount_cents, period, status, created_by, created_at)
       VALUES (?,?,?,?,?,?,?,?,?)`,
      [newId('exp'), category, title, note, Math.round(yuan * 100), months[mOffset] || months[0],
       'published', adminId ?? null, ago(mOffset * 30)]
    );
  }
}

/**
 * 组织/机构演示数据。
 *
 * 组织的来源有两条路径：
 *   1) 前台「注册机构」申请 → 初始 pending，等审核员通过/驳回；
 *   2) 平台运营在后台录入（本 seed 就是这条路径的模拟）。
 * 因此这里独立判断 organizations 是否为空，老库升级也能补灌演示组织，
 * 不会因为 users 非空而整段跳过。
 */
async function seedOrganizationsIfEmpty(pool: Pool) {
  const [[cnt]] = await pool.query<any[]>('SELECT COUNT(*) AS c FROM organizations');
  if (Number(cnt.c) > 0) return;

  // 取库里已存在的若干用户当 owner（查不到就留空，不影响审核演示）
  const pick = async (role: string): Promise<string | null> => {
    const [[u]] = await pool.query<any[]>(
      `SELECT id FROM users WHERE role = ? ORDER BY created_at ASC LIMIT 1`, [role],
    );
    return u?.id ?? null;
  };

  const day = 86400000;
  const ago = (d: number) => ts(new Date(Date.now() - d * day));

  // [name, type, city, description, contact, status, ownerRole, aggDaysAgo]
  const ORGS: [string, string, string, string, string, string, string, number][] = [
    ['光盐城市教会',   'church',     '上海', '城市教会，主日两堂聚会，设有青年、关怀与诗班事工。', 'admin@example.com',    'approved', 'admin',     45],
    ['恩典青年团契',   'fellowship', '深圳', '面向职场青年的查经与团契生活，每周五晚聚会。',       'grace@example.com',    'approved', 'moderator', 38],
    ['晨光赞美事工',   'ministry',   '北京', '专注敬拜诗歌创作与诗班培训的跨教会事工。',           'dawn@example.com',     'pending',  'member',    20],
    ['橄榄山关怀中心', 'charity',    '成都', '为困境家庭与长者提供探访、物资与心理关怀服务。',     'olive@example.com',    'pending',  'member',    12],
    ['迦南乡村宣教站', 'ministry',   '昆明', '面向西南乡村的宣教与支教事工，长期招募志愿者。',     'canaan@example.com',   'rejected', 'member',    58],
  ];

  const roleOwners: Record<string, string | null> = {};
  for (const r of ['admin', 'moderator', 'member']) roleOwners[r] = await pick(r);

  for (const [name, type, city, description, contact, status, ownerRole, daysAgo] of ORGS) {
    const ownerId = roleOwners[ownerRole];
    await pool.query(
      `INSERT INTO organizations (id, name, type, description, city, region, contact, owner_id, status, created_at)
       VALUES (?,?,?,?,?,?,?,?,?,?)`,
      [newId('org'), name, type, description, city, 'CN', contact, ownerId, status, ago(daysAgo)]
    );
  }
}
