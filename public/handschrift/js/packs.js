// Zeichen-Pakete. Jedes Paket ist eine Liste von Zeichen-Gruppen (c = Zeichen, n = wie oft sie auf dem Bogen stehen).
// ACHTUNG: "bit" und die Reihenfolge der Pakete sind Teil des QR-Codes auf den Vorlagen und dürfen sich nie ändern,
// sonst werden alte, schon ausgefüllte Bögen falsch gelesen. Neue Pakete nur hinten mit neuem bit anhängen.
export const PACKS = [
  { id:'standard', bit:0, name:'Standard', icon:'Aa', empf:true, text:'Alle Buchstaben, Ziffern, Umlaute, ß und die wichtigsten Satzzeichen',
    groups:[
      { name:'Kleinbuchstaben', c:'abcdefghijklmnopqrstuvwxyz', n:4 },
      { name:'Großbuchstaben', c:'ABCDEFGHIJKLMNOPQRSTUVWXYZ', n:3 },
      { name:'Umlaute und ß', c:'äöüÄÖÜß', n:3 },
      { name:'Ziffern', c:'0123456789', n:3 },
      { name:'Satzzeichen', c:'.,:;!?\'"„“()-–/', n:2 } ] },
  { id:'sonder', bit:1, name:'Standard erweitert', icon:'#@', empf:true, text:'Klammern, Schrägstriche, @ # & § $ € % und weitere Zeichen für den Alltag',
    groups:[ { name:'Sonderzeichen', c:'[]{}\\|_…&@#*§$€%~^+=<>°£¥©®™•', n:2 } ] },
  { id:'mathe', bit:2, name:'Mathe', icon:'∑', text:'Rechenzeichen, Pfeile, Wurzel, Pi, Unendlich, Hoch- und Tiefzahlen, wichtige griechische Buchstaben',
    groups:[
      { name:'Mathe', c:'+−×·÷=≠≈<>≤≥±√π∞°∠⊥∥→⇒⇔∈ΔΣαβγδθλμφω%‰²³ⁿ', n:2 },
      { name:'Hoch- und tiefgestellt', c:'⁰¹⁴⁵⁶⁷⁸⁹⁺⁻⁼⁽⁾₀₁₂₃₄₅₆₇₈₉₊₋₌₍₎', n:1 } ] },
  { id:'mathe2', bit:3, name:'Mathe Plus', icon:'∀', text:'Mengen, Logik, Integral, Summe, Brüche, Zahlenmengen (ℕ ℤ ℚ ℝ ℂ)',
    groups:[ { name:'Mathe Plus', c:'∉⊂⊆∪∩∅∑∏∫∂∇∀∃¬∧∨∝≡≅∼∘←↔↑↓⇌ℕℤℚℝℂ′″½¼¾∴∵⌀∣⟨⟩⌈⌉⌊⌋', n:1 } ] },
  { id:'griechisch', bit:4, name:'Griechisch', icon:'Ωα', text:'Das ganze griechische Alphabet (klein und groß)',
    groups:[ { name:'Griechisch klein', c:'αβγδεζηθικλμνξοπρστυφχψως', n:2 }, { name:'Griechisch groß', c:'ΓΔΘΛΞΠΣΦΨΩ', n:1 } ] },
  { id:'franz', bit:5, name:'Französisch', icon:'é', text:'é è ê ë à â î ï ô ù û ÿ ç œ æ, große Varianten und « »',
    groups:[ { name:'Französisch klein', c:'éèêëàâîïôùûÿçœæ', n:2 }, { name:'Französisch groß', c:'ÉÈÊËÀÂÎÏÔÙÛÇŒ', n:1 }, { name:'Anführungszeichen', c:'«»', n:2 } ] },
  { id:'west', bit:6, name:'Spanisch, Italienisch und mehr', icon:'ñ', text:'á í ó ú ñ ã õ å ø ì ò sowie ¿ ¡ (Spanisch, Portugiesisch, Italienisch, Skandinavisch)',
    groups:[ { name:'Akzente klein', c:'áíóúñãõåøìò', n:2 }, { name:'Akzente groß', c:'ÁÍÓÚÑÃÕÅØÌÒ', n:1 }, { name:'Spanische Zeichen', c:'¿¡', n:2 } ] },
  { id:'ost', bit:7, name:'Osteuropa und Türkisch', icon:'ł', text:'Polnisch, Tschechisch, Rumänisch, Türkisch: ą ć č ě ł ř š ž ğ ş ı …',
    groups:[ { name:'Osteuropa klein', c:'ąćčďěęłńňřśšťůžźżőűğışıțăđ', n:1 }, { name:'Osteuropa groß', c:'ĄĆČĎĚĘŁŃŇŘŚŠŤŮŽŹŻŐŰĞİŞȚĂĐ', n:1 } ] },
  { id:'kyrill', bit:8, name:'Kyrillisch (Russisch)', icon:'Ж', text:'Das russische Alphabet, klein und groß',
    groups:[ { name:'Kyrillisch klein', c:'абвгдеёжзийклмнопрстуфхцчшщъыьэюя', n:2 }, { name:'Kyrillisch groß', c:'АБВГДЕЁЖЗИЙКЛМНОПРСТУФХЦЧШЩЪЫЬЭЮЯ', n:1 } ] },
  { id:'kana', bit:9, name:'Japanisch (Kana)', icon:'あ', text:'Hiragana und Katakana',
    groups:[ { name:'Hiragana', c:'あいうえおかきくけこさしすせそたちつてとなにぬねのはひふへほまみむめもやゆよらりるれろわをんゃゅょっ', n:1 },
             { name:'Katakana', c:'アイウエオカキクケコサシスセソタチツテトナニヌネノハヒフヘホマミムメモヤユヨラリルレロワヲンャュョッー', n:1 },
             { name:'Japanische Satzzeichen', c:'。、「」・', n:1 } ] },
  { id:'kanji', bit:10, name:'Japanisch (Kanji, 1. Klasse)', icon:'字', text:'Die 80 Kanji der ersten Schulklasse',
    groups:[ { name:'Kanji', c:'一右雨円王音下火花貝学気九休玉金空月犬見五口校左三山子四糸字耳七車手十出女小上森人水正生青夕石赤千川先早草足村大男竹中虫町天田土二日入年白八百文木本名目立力林六', n:1 } ] },
  { id:'zh1', bit:11, name:'Chinesisch 1 (häufigste 200)', icon:'汉', text:'Die 200 häufigsten chinesischen Schriftzeichen (vereinfacht)',
    groups:[ { name:'Chinesisch 1', c:'__Z1__', n:1 } ] },
  { id:'zh2', bit:12, name:'Chinesisch 2 (Rang 201 bis 500)', icon:'汉', text:'Die nächsten 300 häufigen Zeichen',
    groups:[ { name:'Chinesisch 2', c:'__Z2__', n:1 } ] },
  { id:'zh3', bit:13, name:'Chinesisch 3 (Rang 501 bis 1000)', icon:'汉', text:'Weitere 500 häufige Zeichen, damit lassen sich die meisten Texte schreiben',
    groups:[ { name:'Chinesisch 3', c:'__Z3__', n:1 } ] },
  { id:'symbole', bit:14, name:'Symbole', icon:'★', text:'Haken, Kreuze, Sterne, Herzen, Noten, Wetter und andere Zeichen für Notizen',
    groups:[ { name:'Symbole', c:'✓✔✗✘★☆♥♡☺☹♪♫☀☁☂❄✎✉☎⚠✂☑☐', n:1 } ] },
];
export const PACK_BY_ID = Object.fromEntries(PACKS.map(p => [p.id, p]));
const Z1 = '的是一人在有不了我这中为国个会来大年他上要以们和到时对能说么你日就于也发地出后可生家多过与成学用行现自没都下还得作开经好法事动看方而公月分里所之民吗主本政子新最那其前当天全业同定进部如美但关等因机长实被工样很去什小些理并三道内面间只然想心起点及力区从着电体种问者高加由将员重已意产文合外女制网无第情场该应市代名表此真正给题位计让相建资系比明西两果期次度任更性或通教她化使利怎活认特提世立手知东总结数物', Z2 = '话入爱做务展统社设目别己战受影把向信解回常司军安见变保何报接台治平选它界件论议品又府组少北权至记决共海运始再斯原各站视身持式快联处老据直车路反万口量才交金打今导基程放科感划改元完南规号术传院门强需领图际管求单历非水每太先带片党则指办队觉头达几布亚广级书游十专二约类告球师集参候技取必请色团吧像义城许史确服调儿造包称示马济难死证听收乐近根命条格友举语推京价况气线流争续英标支港士准且却尔较男干克委形官望走备容失拉未香啊观案整言众钱质查德字创校料哪识转织山费消研首育注照欢四即亲商空离获具算孩增华写护型供连投源神项律息构究省节风周州演音清谁跟边杀除喜便农响步境象声属找张企洲助击须职思医引版希功考光买赛住', Z3 = '试存态器害五装显易列白纪越群局戏超责复星曾族值协模吃够足环深另巴验段括警早往极断终客切革习故独随维远评错岁例继营呢妈罗精预玩份拿效致闻限速采仅房否艺朋录户严势控黑察优宣米止虽王负谢绝简花火叫施病百低满帮热兴置留讲域积频播读母土送欧画兰晚伤策志食监诉派底居令江武刚依股林尽待念愿县谈湾编围飞批古剧村破落眼密印哥苏初免轻承担范适半父险阿状占夫压修仍防判尼室排执似络双席般突财层均率普旅升笑假福停河角审测青择园卫奖配换乎甚移卡歌犯亿班票韩六久罪红微坚副富银讨抗销购紧检救款差博石养介俄馆您述斗庭威铁著益岛按陆汉景释镇章拍怕店央奇享拥互朝坏阳激乡药素核油波街充千脑卖黄载危婚善攻某钟宝败筑遇恶付背略媒降细答秘临靠刻减八货疗析输弟访哈束酒典码穿阶冲征弹短训兵射帝座姐纳永倒疑毛退胜届血额材异亡妇追盟词练温授困督厂健左劳伊误牌课础毒补页缺杂售航融梦暴藏奥遭顾楼签软毕币夜乱辑恐操味遗康讯亦努登稳吸牙竟云板爆址龙扩逐封私午枪露礼幸烈沙迎索块澳搞湖妹虑肯概季右守怀圣摄序七若趣禁综鲜附脸坐迫皇亮竞灵违跑宗舞寻贵曲翻抓衣九骗苦童含尚挥怪既旧啦谓草庆敢套培船掉汽狗睡急良忘呼余渐伦脱端轮架避炸献托针顺宁唯透探阅申饭弃慢招';
for (const p of PACKS) for (const g of p.groups) if (/^__Z\d__$/.test(g.c)) g.c = g.c === '__Z1__' ? Z1 : g.c === '__Z2__' ? Z2 : Z3;

export const COLS = 8, ROWS = 13, PER_PAGE = COLS * ROWS;

// Alle Kästchen für eine Auswahl: Pakete in fester Reihenfolge, doppelte Zeichen nur einmal.
// custom = { chars:'…', n:1..3 } (eigene Zeichen, immer zuletzt)
export function buildCells(mask, custom) {
  const seen = new Set(), cells = [];
  for (const p of PACKS) {
    if (!((mask >> p.bit) & 1)) continue;
    for (const g of p.groups) for (const ch of [...g.c]) {
      if (seen.has(ch)) continue; seen.add(ch);
      for (let v = 0; v < g.n; v++) cells.push({ ch, v, pack: p.id, grp: g.name });
    }
  }
  if (custom && custom.chars) {
    const n = Math.min(3, Math.max(1, custom.n | 0 || 1));
    for (const ch of [...custom.chars.normalize('NFC')]) {
      if (/\s/.test(ch) || seen.has(ch)) continue; seen.add(ch);
      for (let v = 0; v < n; v++) cells.push({ ch, v, pack: 'eigen', grp: 'Eigene Zeichen' });
    }
  }
  return cells;
}
export const pageCount = (cells) => Math.max(1, Math.ceil(cells.length / PER_PAGE));
export const maskOf = (ids) => ids.reduce((m, id) => m | (1 << PACK_BY_ID[id].bit), 0);
export const idsOf = (mask) => PACKS.filter(p => (mask >> p.bit) & 1).map(p => p.id);
export function hashOf(custom) {   // kurze Kennung der eigenen Zeichen (FNV-1a), 0 = keine
  if (!custom || !custom.chars) return '0';
  let h = 0x811c9dc5; const t = custom.chars.normalize('NFC') + '|' + (custom.n | 0 || 1);
  for (let i = 0; i < t.length; i++) { h ^= t.charCodeAt(i); h = Math.imul(h, 0x01000193) >>> 0; }
  return h.toString(36);
}
// Anzahl Zeichen und Seiten eines Pakets (allein betrachtet)
export const packInfo = (p) => { const c = buildCells(1 << p.bit); return { zeichen: new Set(c.map(x => x.ch)).size, kaesten: c.length, seiten: pageCount(c) }; };
