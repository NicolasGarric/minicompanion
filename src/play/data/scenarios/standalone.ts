import type { Scenario } from './types.ts';

/** Twelve short scenarios to play on their own or between two campaign battles (ids free.1 to free.12). */
export const STANDALONE: Scenario[] = [
  {
    title: ['Ambush at the pass', 'Embuscade au col', '峠の待ち伏せ', 'Emboscada en el paso', 'Hinterhalt am Pass', 'Imboscata al passo', 'Emboscada no desfiladeiro', '山口伏击', '고갯길 매복'],
    hook: ['{A} must get through a narrow pass before nightfall. {B} has been waiting since dawn.', '{A} doit franchir un col étroit avant la nuit. {B} l’attend depuis l’aube.', '{A}は日暮れまでに狭い峠を越えねばならない。{B}は夜明けから待ち構えている。', '{A} debe cruzar un paso estrecho antes del anochecer. {B} lo espera desde el alba.', '{A} muss vor Einbruch der Nacht einen engen Pass durchqueren. {B} wartet seit dem Morgengrauen.', '{A} deve attraversare uno stretto passo prima del buio. {B} lo aspetta dall’alba.', '{A} precisa atravessar um desfiladeiro estreito antes do anoitecer. {B} espera desde o amanhecer.', '{A} 必须在天黑前穿过狭窄的山口。{B} 从黎明起就在此等候。', '{A}는 해 지기 전에 좁은 고갯길을 넘어야 한다. {B}는 새벽부터 기다리고 있다.'],
    mission: 'ambush', rule: 'fog', deploy: 'short', after: 'take', theme: 'desert',
  },
  {
    title: ['The convoy', 'Le convoi', '輸送隊', 'El convoy', 'Der Konvoi', 'Il convoglio', 'O comboio', '车队', '호송대'],
    hook: ['Fuel, medicine, ammunition: everything the front needs is in these crates. {B} wants them more than {A} does.', 'Carburant, remèdes, munitions : tout ce qu’il faut au front est dans ces caisses. {B} les veut plus encore que {A}.', '燃料、薬、弾薬。前線に必要なすべてがこの箱にある。{B}は{A}以上にそれを欲している。', 'Combustible, medicinas, munición: todo lo que necesita el frente está en estas cajas. {B} las quiere aún más que {A}.', 'Treibstoff, Medizin, Munition: Alles, was die Front braucht, steckt in diesen Kisten. {B} will sie noch mehr als {A}.', 'Carburante, medicine, munizioni: tutto ciò che serve al fronte è in queste casse. {B} le vuole più di {A}.', 'Combustível, remédios, munição: tudo o que o front precisa está nessas caixas. {B} as quer ainda mais que {A}.', '燃料、药品、弹药：前线所需的一切都在这些箱子里。{B} 比 {A} 更想得到它们。', '연료, 약품, 탄약. 전선에 필요한 모든 것이 이 상자에 있다. {B}는 {A}보다 그것을 더 원한다.'],
    mission: 'escort', rule: 'none', deploy: 'long', after: 'spoils', theme: 'outpost',
  },
  {
    title: ['The last stand', 'Le dernier carré', '最後の砦', 'La última resistencia', 'Das letzte Gefecht', 'L’ultima resistenza', 'A última resistência', '最后的坚守', '최후의 저항'],
    hook: ['Cut off and outnumbered, {B} digs in around a ruined chapel. Help is coming, if they last long enough.', 'Coupé de tout et en infériorité, {B} se retranche autour d’une chapelle en ruine. Les secours arrivent, s’il tient assez longtemps.', '孤立し数でも劣る{B}は、崩れた礼拝堂の周りに陣取る。持ちこたえれば援軍が来る。', 'Aislado y en inferioridad, {B} se atrinchera junto a una capilla en ruinas. La ayuda llega, si resiste lo suficiente.', 'Abgeschnitten und unterlegen gräbt sich {B} um eine zerstörte Kapelle ein. Hilfe kommt, wenn sie lange genug durchhalten.', 'Isolati e in inferiorità, {B} si trincera attorno a una cappella in rovina. I soccorsi arrivano, se resistono abbastanza.', 'Isolados e em menor número, {B} se entrincheira numa capela em ruínas. A ajuda vem, se aguentarem o bastante.', '{B} 被切断补给且寡不敌众，在一座废弃礼拜堂周围固守。只要坚持够久，援军就会赶到。', '고립되고 수적으로도 열세인 {B}는 무너진 예배당 주위에 진을 친다. 충분히 버티면 지원군이 온다.'],
    mission: 'lastStand', rule: 'reinforcements', deploy: 'corners', after: 'lesson', theme: 'city',
  },
  {
    title: ['Salvage rights', 'Droit d’épave', 'サルベージ権', 'Derecho de rescate', 'Bergungsrecht', 'Diritto di recupero', 'Direito de salvamento', '打捞权', '인양권'],
    hook: ['A cargo ship broke up in orbit and rained crates across the plain. Finders keepers.', 'Un cargo s’est disloqué en orbite et a semé ses caisses sur la plaine. Qui trouve garde.', '貨物船が軌道上で分解し、平原一帯に箱をばらまいた。見つけた者のものだ。', 'Un carguero se partió en órbita y sembró sus cajas por la llanura. Quien lo encuentra se lo queda.', 'Ein Frachter zerbrach im Orbit und verstreute Kisten über die Ebene. Wer findet, behält.', 'Un cargo si è spezzato in orbita e ha sparso casse sulla pianura. Chi trova tiene.', 'Um cargueiro se partiu em órbita e espalhou caixas pela planície. Achado não é roubado.', '一艘货船在轨道上解体，箱子散落整片平原。谁找到归谁。', '화물선이 궤도에서 부서져 평원 곳곳에 상자를 뿌렸다. 먼저 찾는 자가 임자다.'],
    mission: 'scramble', rule: 'minefield', deploy: 'diagonal', after: 'spoils', theme: 'desert',
  },
  {
    title: ['The champion’s challenge', 'Le défi des champions', '勇者の挑戦', 'El desafío de los campeones', 'Die Herausforderung der Champions', 'La sfida dei campioni', 'O desafio dos campeões', '勇士之战', '챔피언의 도전'],
    hook: ['Both leaders have sworn to settle it face to face. Their troops have sworn to make sure it is a fair fight. Nobody believes it.', 'Les deux chefs ont juré de régler ça face à face. Leurs troupes ont juré de veiller à un duel loyal. Personne n’y croit.', '両軍の指揮官は一騎打ちで決着をつけると誓った。兵たちは公正な勝負を見届けると誓った。誰も信じていない。', 'Ambos líderes juraron resolverlo cara a cara. Sus tropas juraron velar por un duelo limpio. Nadie se lo cree.', 'Beide Anführer haben geschworen, es Mann gegen Mann zu klären. Ihre Truppen schworen, für Fairness zu sorgen. Niemand glaubt daran.', 'I due capi hanno giurato di risolverla faccia a faccia. Le truppe hanno giurato di garantire un duello leale. Nessuno ci crede.', 'Os dois líderes juraram resolver cara a cara. As tropas juraram garantir um duelo justo. Ninguém acredita.', '两位首领发誓要当面一决高下，部下发誓会确保公平决斗。没人相信。', '두 지휘관은 일대일로 결판내겠다고 맹세했다. 부하들은 공정한 대결을 지키겠다고 맹세했다. 아무도 믿지 않는다.'],
    mission: 'duel', rule: 'heroes', deploy: 'long', after: 'lesson', theme: 'forest',
  },
  {
    title: ['Eyes on the ridge', 'Des yeux sur la crête', '尾根の監視', 'Ojos en la cresta', 'Augen auf dem Kamm', 'Occhi sulla cresta', 'Olhos na crista', '山脊之眼', '능선 위의 눈'],
    hook: ['Nobody knows what lies beyond the ridge. The first to map it will choose where the next battle is fought.', 'Personne ne sait ce qu’il y a derrière la crête. Le premier à la cartographier choisira où aura lieu la prochaine bataille.', '尾根の向こうに何があるか誰も知らない。最初に地図を作った側が次の戦場を選ぶ。', 'Nadie sabe qué hay tras la cresta. El primero en cartografiarla elegirá dónde será la próxima batalla.', 'Niemand weiß, was hinter dem Kamm liegt. Wer ihn zuerst kartiert, wählt den Ort der nächsten Schlacht.', 'Nessuno sa cosa c’è oltre la cresta. Il primo a mapparla sceglierà dove si combatterà la prossima battaglia.', 'Ninguém sabe o que há além da crista. O primeiro a mapeá-la escolherá onde será a próxima batalha.', '无人知道山脊之后是什么。最先绘制地图的一方将决定下一场战斗的地点。', '능선 너머에 무엇이 있는지 아무도 모른다. 먼저 지도를 그린 쪽이 다음 전장을 고른다.'],
    mission: 'recon', rule: 'fog', deploy: 'short', after: 'initiative', theme: 'forest',
  },
  {
    title: ['Hunting the courier', 'La chasse au messager', '伝令狩り', 'La caza del mensajero', 'Jagd auf den Kurier', 'La caccia al corriere', 'A caça ao mensageiro', '追猎信使', '전령 사냥'],
    hook: ['One of {B}’s units carries the orders for the whole sector. {A} does not know which one.', 'Une des unités de {B} porte les ordres de tout le secteur. {A} ne sait pas laquelle.', '{B}のユニットの1つがセクター全体の命令書を運んでいる。{A}はそれがどれか知らない。', 'Una de las unidades de {B} lleva las órdenes de todo el sector. {A} no sabe cuál.', 'Eine Einheit von {B} trägt die Befehle für den ganzen Sektor. {A} weiß nicht, welche.', 'Una delle unità di {B} porta gli ordini dell’intero settore. {A} non sa quale.', 'Uma das unidades de {B} leva as ordens de todo o setor. {A} não sabe qual.', '{B} 的某个单位携带着整个星区的命令。{A} 不知道是哪一个。', '{B}의 유닛 하나가 섹터 전체의 명령서를 들고 있다. {A}는 그게 어느 것인지 모른다.'],
    mission: 'hunt', rule: 'night', deploy: 'diagonal', after: 'initiative', theme: 'city',
  },
  {
    title: ['Pull the plug', 'Couper le courant', '電源を落とせ', 'Cortar la corriente', 'Stecker ziehen', 'Staccare la corrente', 'Cortar a energia', '切断电源', '전원을 끊어라'],
    hook: ['Three generators feed the shield of the outpost. Without them, {B}’s defences are just walls.', 'Trois générateurs alimentent le bouclier de l’avant-poste. Sans eux, les défenses de {B} ne sont que des murs.', '前哨基地のシールドは3基の発電機で動いている。それがなければ{B}の防御はただの壁だ。', 'Tres generadores alimentan el escudo del puesto avanzado. Sin ellos, las defensas de {B} solo son muros.', 'Drei Generatoren speisen den Schild des Außenpostens. Ohne sie sind die Verteidigungen von {B} nur Mauern.', 'Tre generatori alimentano lo scudo dell’avamposto. Senza di loro, le difese di {B} sono solo muri.', 'Três geradores alimentam o escudo do posto avançado. Sem eles, as defesas de {B} são só muros.', '三台发电机为前哨的护盾供能。没有它们，{B} 的防御不过是几堵墙。', '세 대의 발전기가 전초기지의 방어막을 돌린다. 그것이 없으면 {B}의 방어는 그저 벽일 뿐이다.'],
    mission: 'sabotage', rule: 'jamming', deploy: 'long', after: 'cut', theme: 'outpost',
  },
  {
    title: ['Evacuation', 'Évacuation', '避難', 'Evacuación', 'Evakuierung', 'Evacuazione', 'Evacuação', '撤离', '대피'],
    hook: ['The colony is falling. The last shuttle leaves at dawn, and both sides want to be the ones who saved the survivors.', 'La colonie tombe. La dernière navette part à l’aube, et chaque camp veut être celui qui a sauvé les survivants.', 'コロニーは陥落寸前。最後のシャトルは夜明けに出る。どちらの陣営も生存者を救った側になりたい。', 'La colonia cae. La última lanzadera sale al alba y cada bando quiere ser quien salvó a los supervivientes.', 'Die Kolonie fällt. Das letzte Shuttle startet im Morgengrauen, und jede Seite will die Überlebenden gerettet haben.', 'La colonia sta cadendo. L’ultima navetta parte all’alba e ogni schieramento vuole essere quello che ha salvato i superstiti.', 'A colônia está caindo. A última nave parte ao amanhecer, e cada lado quer ser quem salvou os sobreviventes.', '殖民地即将陷落。最后一班穿梭机将在黎明起飞，双方都想成为拯救幸存者的人。', '식민지가 무너지고 있다. 마지막 셔틀은 새벽에 떠나고, 양측 모두 생존자를 구한 쪽이 되고 싶어 한다.'],
    mission: 'evacuate', rule: 'countdown', deploy: 'long', after: 'spoils', theme: 'city',
  },
  {
    title: ['No man’s land', 'No man’s land', '無人地帯', 'Tierra de nadie', 'Niemandsland', 'Terra di nessuno', 'Terra de ninguém', '无人区', '무인지대'],
    hook: ['Between the two lines, five craters and a lot of mud. Every metre will be paid for.', 'Entre les deux lignes, cinq cratères et beaucoup de boue. Chaque mètre se paiera cher.', '両軍の戦線の間には5つのクレーターと泥の海。1メートルごとに代償を払う。', 'Entre las dos líneas, cinco cráteres y mucho barro. Cada metro costará caro.', 'Zwischen den Linien fünf Krater und viel Schlamm. Jeder Meter wird teuer bezahlt.', 'Tra le due linee, cinque crateri e tanto fango. Ogni metro si pagherà caro.', 'Entre as duas linhas, cinco crateras e muita lama. Cada metro custará caro.', '两条战线之间，是五个弹坑和无尽的泥泞。每一米都要付出代价。', '두 전선 사이엔 크레이터 다섯 개와 진흙뿐. 1미터마다 대가를 치러야 한다.'],
    mission: 'tug', rule: 'minefield', deploy: 'long', after: 'fort', theme: 'desert',
  },
  {
    title: ['The breakout', 'La percée', '突破', 'La ruptura', 'Der Ausbruch', 'Lo sfondamento', 'A ruptura', '突围', '돌파'],
    hook: ['Surrounded on three sides, {A} throws everything at the weakest point of the line.', 'Encerclé sur trois côtés, {A} jette toutes ses forces sur le point le plus faible de la ligne.', '三方を包囲された{A}は、戦線の最も弱い一点に全戦力を叩きつける。', 'Rodeado por tres lados, {A} lanza todo contra el punto más débil de la línea.', 'Von drei Seiten umzingelt wirft {A} alles gegen die schwächste Stelle der Linie.', 'Circondato su tre lati, {A} getta tutto contro il punto più debole della linea.', 'Cercado por três lados, {A} joga tudo contra o ponto mais fraco da linha.', '三面被围的 {A} 将全部兵力投向防线最薄弱之处。', '삼면이 포위된 {A}는 전선의 가장 약한 지점에 전력을 쏟아붓는다.'],
    mission: 'breakthrough', rule: 'reinforcements', deploy: 'short', after: 'secret', theme: 'forest',
  },
  {
    title: ['The relic vault', 'La crypte aux reliques', '遺物の地下室', 'La cripta de las reliquias', 'Die Reliquiengruft', 'La cripta delle reliquie', 'A cripta das relíquias', '遗物地窖', '유물 지하실'],
    hook: ['Under the old monastery, a vault nobody has opened in three hundred years. Something in there still hums.', 'Sous le vieux monastère, une crypte que personne n’a ouverte depuis trois cents ans. Quelque chose y bourdonne encore.', '古い修道院の地下、三百年誰も開けていない地下室。中で何かがまだ唸っている。', 'Bajo el viejo monasterio, una cripta que nadie ha abierto en trescientos años. Algo aún zumba dentro.', 'Unter dem alten Kloster eine Gruft, die seit dreihundert Jahren niemand geöffnet hat. Etwas darin summt noch.', 'Sotto il vecchio monastero, una cripta che nessuno apre da trecento anni. Qualcosa lì dentro ronza ancora.', 'Sob o velho mosteiro, uma cripta que ninguém abre há trezentos anos. Algo lá dentro ainda zumbe.', '古老修道院之下，有一座三百年无人开启的地窖。里面仍有东西在嗡嗡作响。', '오래된 수도원 아래, 삼백 년 동안 아무도 열지 않은 지하실. 그 안에서 무언가가 아직 웅웅거린다.'],
    mission: 'relic', rule: 'signal', deploy: 'corners', after: 'takeRes', theme: 'city',
  },
];
