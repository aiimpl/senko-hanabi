# Senko hanabi（線香花火）— a Japanese sparkler in three.js

One senko hanabi, seen through a macro lens at night, from the moment it is lit to the fall of the fireball.
Hold it yourself: the pointer (or your finger) is the hand the paper hangs from. Move gently and it burns through all five stages; jerk it and the fireball drops.
No photos, videos or sound files. The sparks, the fireball, the paper, the smoke and the sound are computed in the browser.
The interface follows the browser language; the button at the top right (or `?lang=ja` / `?lang=en`) switches it.

**Play: https://aiimpl.github.io/senko-hanabi/**　（`?film` plays the film）

---

# 線香花火

夜の線香花火1本を、マクロレンズで寄って見たところです。火をつけてから、火の玉が落ちるまで。
自分で持てます。ポインター（スマホなら指）が、紙縒りを持つ手です。そっと持てば5つの段をすべて燃え切り、揺らすと火の玉が落ちます。
写真・動画・音声ファイルは使っていません。火花・火の玉・紙縒り・煙・音は、すべてブラウザの中の計算です。

## 燃え方（5つの段）
| 段 | 見た目 | 中身（この作品の設定） |
|---|---|---|
| 蕾 Tsubomi | 火の玉ができ、ふるえる | 火薬と紙が燃え、カリウムの塩が溶けて玉になる |
| 牡丹 Peony | 火花がぱっ、ぱっと間をおいて出る | 1秒に十数個、1〜2回分裂 |
| 松葉 Pine needles | 枝分かれの細かい火花が四方へ | 1秒に数百個、最大8回分裂 |
| 柳 Willow | 長く垂れる火花 | 空気抵抗を小さく、長く飛んで重力で垂れる |
| 散り菊 Scattered chrysanthemum | 玉のまわりに小さな火花 | 遅く、短く、1回だけ分裂 |

## しくみ
- **火花**（`web/src/sim.js`）：火の玉の表面から飛び出す液滴の1粒ずつに、重力と空気抵抗（速さに比例）の運動を解いた式（閉じた形）を使う。液滴は飛びながら熱くなり、中にガスができて破裂し、小さな液滴に分かれる。分かれた液滴もまた破裂し、最大8回続く（井上智博ほか, *Phys. Rev. Lett.* 118, 074502, 2017 の観察による）。式が閉じているので、どの瞬間もどのシャッター速度でも正確に描ける
- **写り方**（`web/src/sparks.js`）：シャッターが開いている間に液滴が通った線を、液滴が出した光の量（明るさ × 時間）が線の長さと太さに広がるように描く。速い液滴はかすかな線に、破裂した瞬間は明るい点になる。ピントから外れた火花は、錯乱円の大きさだけ太く柔らかくなる。色は黒体放射（火の玉 約880℃、火花 最高 約1070℃）を、タングステン光（3200K）に合わせたカメラで見た色
- **火の玉と紙縒り**（`web/src/ball.js`・`paper.js`）：紙縒りは22個の点の鎖（Verlet 法・曲げのこわさあり）で、火の玉はその先の重い点。手の揺れが紙を伝って玉を振る。玉に紙から加わる力が大きすぎると、玉は表面張力で持ちこたえられず落ちる。紙はねじれた楕円の筒で、灰・焦げ・和紙・染め紙を描き分け、明かりは火の玉と火花だけ（距離の2乗で弱まる）
- **煙**（`web/src/smoke.js`）：火の玉から上る細い煙。火の玉に近いところだけ照らされて見える
- **レンズ**（`web/src/post.js`・`backdrop.js`）：100mm のマクロレンズ（フルサイズ）。HDR で描き、にじみ・露出・フィルム風の階調・赤みのにじみ・周辺減光・粒子。背景は遠くの庭のぼけ
- **ハイスピードカメラ**：Space キー（スマホはボタン）を押している間、時間が 1/40 になり、シャッターが 1/2000 秒になる
- **音**（`web/src/audio.js`、動画用は `tools/audio.py`）：破裂1回ごとのパチッという音、火の玉の沸く音、紙の燃える音、鈴虫。すべて合成

## 動作環境
WebGL2 が動くブラウザ（Chrome / Safari / Edge）。スマホでも動きます。

## 使い方
```sh
make serve     # http://127.0.0.1:8796/ で開く
make setup     # 書き出し用の Python 環境（numpy・Playwright・pyflakes）
make frames    # 動画を1コマずつ書き出す（3200×1800、M 系の Mac で1コマ約3秒）
make video     # 音を合成して mp4 に（1920×1080・yuv420p）
make stills S="3.6 12 16.5"   # 動画の指定の秒の静止画
make check     # pyflakes
```

## 構成
```
web/index.html      ページ（three.js r160 を web/vendor に同梱）
web/src/main.js     描画のまとめ、静止画（window.__still）、書き出し（window.__renderAt）
web/src/sim.js      燃え方の表、火花の分裂、紙縒りの鎖、火の玉が落ちる判定
web/src/sparks.js   火花の写り方（シャッターと錯乱円）
web/src/ball.js     火の玉と、火をつけたときの炎
web/src/paper.js    紙縒り
web/src/smoke.js    煙
web/src/backdrop.js 背景のぼけ
web/src/post.js     レンズと仕上げ
web/src/color.js    黒体放射の色
web/src/film.js     動画（7カット・約31秒）
web/src/game.js     自分で持つ
web/src/audio.js    音（ブラウザ）
tools/              書き出し・音・確認の道具
```

燃え方の段の時間や火花の数は、写真と研究の記述に合わせて決めた設定で、実測の再現ではありません。

## License
MIT
