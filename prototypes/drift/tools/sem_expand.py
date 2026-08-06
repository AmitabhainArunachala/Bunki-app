# Expand the SEM semantic tier from the 27-word pilot with a curated core of
# high-frequency vocabulary (the words a learner navigates first), authored by
# hand as the LLM relation engine (design doc §8.11). Types:
#   syn synonym/near · fam kanji-family/morphological kin · col collocation ·
#   thm theme · reg register variant · ant antonym
import json, os

DATA = "/workspace/bunki-app/prototypes/drift/data"
sem = json.load(open(os.path.join(DATA, "sem.json"), encoding="utf-8"))

NEW = {
"勉強": [["学習","syn","study, more formal"],["勉強する","col","to study"],["復習","fam","review"],["予習","fam","prep before class"],["試験","thm","the exam it serves"],["宿題","thm","homework"],["努力","thm","the effort in it"],["怠ける","ant","to slack off"],["集中","col","集中して勉強 — study with focus"],["塾","thm","cram school"]],
"質問": [["問い","syn","a question, plainer"],["疑問","fam","a doubt"],["答え","ant","the answer"],["回答","syn","a formal reply"],["質問する","col","to ask"],["手を挙げる","col","raise your hand to ask"],["先生","thm","who you ask"],["解決","thm","what answers lead to"],["尋ねる","reg","to inquire, formal verb"]],
"答え": [["回答","syn","response, formal"],["返事","syn","a reply"],["質問","ant","the question"],["解答","fam","worked answer, math/test"],["正解","fam","the correct answer"],["答える","col","to answer"],["解決","thm","resolution"],["間違い","ant","a wrong answer"]],
"友達": [["友人","reg","friend, formal"],["親友","fam","best friend"],["仲間","syn","comrade, group member"],["知り合い","syn","acquaintance"],["友情","fam","friendship"],["友達になる","col","to become friends"],["敵","ant","enemy"],["信頼","thm","the trust between them"],["一緒","thm","being together"]],
"家族": [["家庭","fam","household, home life"],["親","fam","parents"],["兄弟","fam","siblings"],["親戚","syn","relatives"],["家族団らん","col","family togetherness"],["家","thm","the home"],["血縁","thm","blood ties"],["他人","ant","strangers, unrelated people"]],
"先生": [["教師","reg","teacher, formal/occupational"],["教授","fam","professor"],["生徒","ant","the pupil"],["学生","thm","students"],["恩師","fam","one's respected teacher"],["指導","col","guidance a teacher gives"],["授業","thm","the class"],["学校","thm","where they teach"]],
"学校": [["学園","fam","school, campus"],["大学","fam","university"],["高校","fam","high school"],["登校","col","going to school"],["生徒","thm","the students"],["授業","thm","classes"],["教室","fam","classroom"],["卒業","thm","graduation"],["入学","col","school entry"]],
"仕事": [["職業","syn","occupation"],["業務","reg","business duties, formal"],["作業","fam","manual/task work"],["労働","thm","labor"],["仕事をする","col","to work"],["会社","thm","the company"],["残業","thm","overtime"],["休み","ant","time off"],["職場","fam","workplace"],["転職","col","changing jobs"]],
"会社": [["企業","reg","enterprise, formal"],["職場","syn","workplace"],["社員","fam","company employee"],["出社","col","going in to work"],["会社員","fam","office worker"],["仕事","thm","the work"],["経営","thm","running it"],["倒産","thm","bankruptcy"],["就職","col","getting hired"]],
"お金": [["金銭","reg","money, formal"],["現金","fam","cash"],["貯金","fam","savings"],["給料","thm","salary"],["お金を払う","col","to pay"],["値段","thm","price"],["貧乏","ant","being poor"],["金持ち","thm","the wealthy"],["借金","fam","debt"],["節約","thm","frugality"]],
"時": [["時間","fam","time (duration)"],["時刻","fam","a point in time"],["瞬間","syn","a moment"],["時代","fam","an era"],["その時","col","at that time"],["時々","fam","sometimes"],["永遠","ant","forever"],["時計","thm","the clock"]],
"食べる": [["食う","reg","to eat, rough/casual"],["召し上がる","reg","to eat, honorific"],["飲む","thm","to drink, its pair"],["食事","fam","a meal"],["ご飯を食べる","col","eat a meal"],["料理","thm","cooking"],["空腹","thm","hunger"],["味わう","syn","to savor"],["食べ物","fam","food"]],
"飲む": [["飲食","fam","food and drink"],["食べる","thm","to eat, its pair"],["飲み物","fam","a drink"],["お酒を飲む","col","to drink alcohol"],["飲み会","col","a drinking party"],["喉が渇く","thm","being thirsty"],["酔う","thm","to get drunk"],["水","thm","water"]],
"見る": [["見える","fam","to be visible"],["見せる","fam","to show"],["観る","reg","to watch (film/show)"],["眺める","syn","to gaze"],["見物","fam","sightseeing"],["映画を見る","col","watch a movie"],["目","thm","the eyes"],["見学","fam","a study visit"],["観察","thm","observation"]],
"聞く": [["聴く","reg","to listen (music), attentive"],["尋ねる","syn","to ask"],["耳","thm","the ears"],["音楽を聞く","col","listen to music"],["聞こえる","fam","to be audible"],["質問","thm","asking questions"],["話す","ant","to speak"],["聴衆","fam","the audience"]],
"話す": [["喋る","reg","to chatter, casual"],["語る","syn","to narrate"],["話","fam","a talk, story"],["会話","fam","conversation"],["話し合う","col","to discuss"],["言葉","thm","words"],["黙る","ant","to be silent"],["聞く","ant","to listen"],["相談","thm","consultation"]],
"読む": [["読書","fam","reading (as a pastime)"],["本を読む","col","read a book"],["朗読","fam","reading aloud"],["読者","fam","the reader"],["書く","ant","to write"],["文章","thm","the text"],["黙読","fam","silent reading"],["理解","thm","understanding it"]],
"書く": [["描く","reg","to draw/depict"],["記す","syn","to note down, formal"],["書道","fam","calligraphy"],["手紙を書く","col","write a letter"],["文字","thm","the characters"],["読む","ant","to read"],["著者","thm","the author"],["書類","fam","documents"]],
"買う": [["購入","reg","to purchase, formal"],["売る","ant","to sell"],["買い物","fam","shopping"],["買い物をする","col","to go shopping"],["店","thm","the shop"],["値段","thm","the price"],["消費","thm","consumption"],["注文","syn","to order"]],
"歩く": [["歩む","reg","to walk (a path), literary"],["走る","thm","to run, its faster kin"],["散歩","fam","a stroll"],["歩行","fam","locomotion, formal"],["徒歩","fam","on foot"],["歩道","fam","the sidewalk"],["足","thm","the feet"],["立ち止まる","ant","to stop walking"]],
"元気": [["健康","syn","health"],["活発","syn","lively"],["元気を出す","col","cheer up"],["病気","ant","illness"],["体調","thm","physical condition"],["疲れ","ant","tiredness"],["笑顔","thm","a smile"],["回復","thm","recovery"]],
"病気": [["疾患","reg","disease, medical"],["体調不良","syn","feeling unwell"],["健康","ant","health"],["風邪","fam","a cold"],["病院","thm","the hospital"],["病気になる","col","to fall ill"],["治療","thm","treatment"],["症状","thm","symptoms"],["元気","ant","being well"]],
"天気": [["天候","reg","weather, formal"],["気候","fam","climate"],["晴れ","fam","clear sky"],["雨","fam","rain"],["天気予報","col","weather forecast"],["曇り","fam","cloudy"],["気温","thm","temperature"],["空","thm","the sky"]],
"空": [["空中","fam","midair"],["天","syn","the heavens"],["青空","fam","blue sky"],["雲","thm","clouds"],["空が晴れる","col","the sky clears"],["宇宙","thm","space beyond"],["星","thm","the stars"],["地","ant","the earth"],["飛ぶ","thm","to fly through it"]],
"海": [["海洋","reg","the ocean, formal"],["波","fam","waves"],["海岸","fam","the coast"],["山","ant","mountains, its pair"],["海water","col","seawater — see 海水"],["魚","thm","fish"],["泳ぐ","thm","to swim"],["船","thm","boats"],["深海","fam","the deep sea"]],
"花": [["草花","fam","flowering plants"],["桜","fam","cherry blossom"],["花見","col","flower viewing"],["咲く","col","花が咲く — to bloom"],["花束","fam","a bouquet"],["庭","thm","the garden"],["香り","thm","fragrance"],["枯れる","ant","to wither"],["春","thm","spring"]],
"夢": [["理想","syn","an ideal"],["希望","thm","hope"],["悪夢","fam","a nightmare"],["夢を見る","col","to dream"],["夢を叶える","col","fulfill a dream"],["現実","ant","reality"],["目標","thm","a goal"],["将来","thm","the future"],["憧れ","syn","a longing"]],
"希望": [["望み","syn","a wish"],["願い","syn","a wish/prayer"],["絶望","ant","despair"],["夢","thm","dreams"],["希望を持つ","col","to hold hope"],["期待","fam","expectation"],["未来","thm","the future"],["光","thm","light, as metaphor"]],
"問題": [["課題","syn","an issue/task"],["トラブル","syn","trouble, loanword"],["解決","ant","resolution"],["問題を解く","col","solve a problem"],["難問","fam","a hard problem"],["原因","thm","the cause"],["解答","thm","the answer"],["困難","thm","difficulty"],["社会問題","col","a social issue"]],
"解決": [["解消","syn","dissolving an issue"],["処理","syn","handling"],["問題","ant","the problem"],["解決する","col","to resolve"],["対策","thm","countermeasures"],["方法","thm","the method"],["合意","thm","agreement"],["未解決","ant","unresolved"]],
"方法": [["手段","syn","a means"],["やり方","reg","the way to do it, casual"],["手法","fam","a technique"],["方式","fam","a scheme/format"],["方法を探す","col","seek a way"],["解決","thm","what it achieves"],["工夫","thm","ingenuity"],["目的","ant","the end vs the means"]],
"理由": [["原因","fam","cause"],["訳","reg","reason, plainer (わけ)"],["根拠","syn","grounds/basis"],["理由がある","col","to have a reason"],["結果","ant","the result"],["説明","thm","explanation"],["言い訳","fam","an excuse"],["動機","syn","motive"]],
"結果": [["成果","syn","an achievement/outcome"],["結末","fam","the ending"],["原因","ant","the cause"],["結果が出る","col","results come out"],["効果","fam","an effect"],["影響","thm","impact"],["過程","ant","the process vs the result"],["成功","thm","success as a result"]],
"成功": [["達成","thm","attainment"],["勝利","syn","victory"],["失敗","ant","failure"],["成功する","col","to succeed"],["努力","thm","the effort behind it"],["成果","fam","the fruits of it"],["夢","thm","the dream realized"],["出世","thm","getting ahead"]],
"失敗": [["ミス","syn","a mistake, loanword"],["過ち","syn","a fault, literary"],["成功","ant","success"],["失敗する","col","to fail"],["失敗を恐れる","col","fear failure"],["反省","thm","reflection after"],["教訓","thm","the lesson learned"],["挫折","thm","a setback"]],
"自由": [["自在","fam","freely, at will"],["解放","thm","liberation"],["束縛","ant","restraint"],["自由な","col","free, unrestricted"],["権利","thm","rights"],["独立","thm","independence"],["制限","ant","restriction"],["平和","thm","peace"]],
"平和": [["和平","fam","peace (between nations)"],["安定","thm","stability"],["戦争","ant","war"],["平和な","col","peaceful"],["穏やか","syn","calm/serene"],["世界平和","col","world peace"],["争い","ant","conflict"],["自由","thm","freedom"]],
"努力": [["尽力","reg","dedication, formal"],["頑張り","reg","one's effort, casual"],["努力する","col","to make an effort"],["苦労","thm","hardship"],["成功","thm","what it earns"],["才能","ant","innate talent vs effort"],["継続","thm","persistence"],["努力家","fam","a hard worker"]],
"経験": [["体験","fam","first-hand experience"],["経歴","fam","one's track record"],["経験する","col","to experience"],["未経験","ant","inexperienced"],["ベテラン","thm","a veteran"],["知識","thm","knowledge"],["失敗","thm","learning from it"],["経験を積む","col","gain experience"]],
"文化": [["文明","fam","civilization"],["伝統","thm","tradition"],["風習","syn","customs"],["異文化","fam","other cultures"],["文化祭","col","culture festival"],["芸術","thm","the arts"],["歴史","thm","history"],["言語","thm","language"]],
"歴史": [["史実","fam","historical fact"],["過去","thm","the past"],["伝統","thm","tradition"],["歴史的","col","historic"],["文化","thm","culture"],["歴史を学ぶ","col","study history"],["未来","ant","the future"],["遺跡","thm","ruins/remains"]],
"社会": [["世間","syn","society, the public eye"],["共同体","fam","a community"],["社会人","fam","a working adult"],["個人","ant","the individual"],["社会問題","col","social issues"],["政治","thm","politics"],["経済","thm","the economy"],["世界","thm","the world"]],
"経済": [["景気","fam","economic conditions"],["財政","fam","public finance"],["経済的","col","economical"],["市場","thm","the market"],["金融","fam","finance"],["不況","thm","recession"],["貿易","thm","trade"],["成長","col","経済成長 — growth"]],
"技術": [["テクノロジー","syn","technology, loanword"],["技能","fam","a skill"],["科学技術","col","science and technology"],["技術者","fam","an engineer"],["最新技術","col","cutting-edge tech"],["発達","thm","its advance"],["工業","thm","industry"],["職人","thm","the artisan"]],
"研究": [["調査","syn","investigation"],["探求","syn","inquiry, literary"],["研究する","col","to research"],["研究者","fam","a researcher"],["実験","thm","experiments"],["論文","thm","the paper"],["発見","thm","discovery"],["大学","thm","the university"],["研究室","fam","the lab"]],
"健康": [["元気","syn","being well/energetic"],["丈夫","syn","sturdy/robust"],["病気","ant","illness"],["健康的","col","healthy"],["運動","thm","exercise"],["食事","thm","diet"],["長寿","thm","longevity"],["体","thm","the body"]],
"運動": [["スポーツ","syn","sports, loanword"],["体操","fam","gymnastics/exercises"],["運動する","col","to exercise"],["運動不足","col","lack of exercise"],["健康","thm","health it serves"],["筋肉","thm","muscles"],["練習","thm","practice"],["休養","ant","rest"]],
"旅行": [["旅","reg","a journey, literary"],["観光","fam","sightseeing"],["旅行する","col","to travel"],["海外旅行","col","overseas trip"],["出張","thm","a business trip"],["観光地","thm","tourist spots"],["宿泊","thm","lodging"],["帰省","fam","going home for holidays"]],
"料理": [["調理","reg","cooking, culinary/formal"],["食事","thm","the meal"],["料理する","col","to cook"],["手料理","fam","home cooking"],["レシピ","thm","the recipe"],["味","thm","the taste"],["食材","thm","ingredients"],["和食","fam","Japanese cuisine"]],
"約束": [["契約","fam","a contract, formal"],["誓い","syn","a vow"],["約束する","col","to promise"],["約束を守る","col","keep a promise"],["約束を破る","col","break a promise"],["信頼","thm","trust"],["嘘","ant","a lie"],["予定","thm","plans"]],
"意見": [["見解","reg","a view, formal"],["考え","syn","a thought"],["主張","fam","an assertion"],["意見を言う","col","voice an opinion"],["反対","thm","opposition"],["賛成","thm","agreement"],["議論","thm","debate"],["提案","syn","a proposal"]],
"努める": [["励む","syn","to strive"],["尽くす","syn","to devote oneself"],["努力","fam","effort (noun kin)"],["怠る","ant","to neglect"],["仕事に努める","col","apply oneself to work"],["頑張る","reg","to do one's best, casual"],["精進","syn","devotion/diligence, literary"],["改善に努める","col","strive to improve"],["解決に努める","col","work toward a solution"]],
"美しい": [["綺麗","syn","pretty/clean"],["麗しい","reg","lovely, literary"],["醜い","ant","ugly"],["美","fam","beauty (noun)"],["美人","fam","a beautiful person"],["景色","thm","scenery"],["優雅","syn","elegant"],["芸術","thm","art"]],
"静か": [["閑静","reg","quiet/secluded, formal"],["穏やか","syn","calm"],["うるさい","ant","noisy"],["静かな","col","quiet"],["静寂","fam","silence, literary"],["沈黙","thm","silence between people"],["夜","thm","the night"],["落ち着く","thm","to settle down"]],
"難しい": [["困難","fam","difficulty (noun)"],["ややこしい","reg","complicated, casual"],["易しい","ant","easy"],["簡単","ant","simple"],["難問","fam","a hard problem"],["複雑","syn","complex"],["理解","thm","understanding it"],["挑戦","thm","the challenge"]],
}

for k, v in NEW.items():
    sem[k] = v  # overwrite/add

out = json.dumps(sem, ensure_ascii=False, separators=(",", ":"))
open(os.path.join(DATA, "sem.json"), "w", encoding="utf-8").write(out)
print("SEM words:", len(sem), "(+%d new)" % len(NEW))
print("total relations:", sum(len(v) for v in sem.values()))
