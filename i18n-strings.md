# i18n Strings — store1

## Context for the next assistant

This portfolio site (vanilla ES modules, no framework) is being
internationalised. The user has **finished the frontend animation** for
the Language chip — pressing it expands a tall pill with five language
options (EN · AR · GR · SP · 中) and an orb slides to the active item.
The selection currently only animates the orb; **nothing is wired to
swap strings yet.**

### What's done
- All user-facing strings have been **inventoried** (this file).
- **EN** reference collected.
- **AR** translation collected (complete for everything in this doc).

### What's still pending
1. **Translations for GR, SP, ZH** — every row below has empty cells.
2. **Plumbing** — no loader, no `applyLocale()`, no persistence. When you
   pick up, decide: inline `data-i18n` attrs vs dynamic `.textContent`
   writes from JS (the chip labels and many aria-labels are already set
   imperatively in `app.js`, so a JS dictionary + `applyLocale()` is
   probably cleanest). Current plan proposed:
   - `i18n.js` exporting `{ en, ar, gr, sp, zh }` keyed by the dot paths
     used below.
   - `applyLocale(lang)` that re-runs: chip labels, panel title for the
     currently-open panel, all toolbar button labels + aria-labels,
     contact markers, bio paragraph, minesweeper strings, in-situ
     entries, meta tags (via `document.title` + meta updates).
   - Listen for a `store1-locale` custom event dispatched from the
     Language chip's `moveLangOrbToIndex(...)` handler in
     `app.js` (~line 1123 / 1292).
   - Persist to `localStorage` key `store1-locale`; on boot read it and
     seed `selectedLangIndex` in the symposium chip setup (~line 1269).
   - RTL: set `document.documentElement.setAttribute("dir", "rtl")` when
     AR is active; check `styles.css` for logical-property friendliness
     (many values use `margin-left` / `translate(x,…)` etc. — audit is
     needed).

### Brand names that must NOT be translated
`Omar J`, `welcome.audio`, `QUOMMUNE`, `TEMPUS Katoomba`, `B'WIG'D`,
`Principalskinsticker`, `Rosy Sign Co.`, `2nd Model`, `Monument
Grotesk`, phone/email literals.

### Intentionally skipped
- Code-only strings (CSS class names, dataset keys, event names).
- Emoji glyphs in Minesweeper (🙂 😮 😵 😎 💣 🚩).
- Language-pill codes in the chip itself (`EN · AR · GR · SP · 中`).

### Source-of-truth file map
Each string has a home in the codebase; the columns below point to
where a future implementer should read/write values.

---

## 1. Chips (`index.html` — `.chip__label` children)

| Key | EN | AR | GR | SP | ZH |
|---|---|---|---|---|---|
| `chip.listening` | Listening | استماع | | | |
| `chip.language` | Language | اللغة | | | |
| `chip.label` | Type | النوع | | | |
| `chip.text` | Play | تشغيل | | | |
| `chip.projects` | Portfolio | الأعمال | | | |
| `chip.bio` | Bio | نبذة | | | |
| `chip.contact` | Contact | تواصل | | | |
| `chip.in-situ` | In situ | في الموقع | | | |

## 2. Meta tags (`index.html` `<head>`)

| Key | EN | AR | GR | SP | ZH |
|---|---|---|---|---|---|
| `meta.title` | Omar J — Design Engineer | عمر ج — مهندس تصميم | | | |
| `meta.description` | Omar J — Design Engineer. Portfolio of interactive work across listening, language, label, text, projects, bio, band, radio and in-situ pieces. | عمر ج — مهندس تصميم. معرض لأعمال تفاعلية تشمل الاستماع، اللغة، التسمية، النص، المشاريع، النبذة، الفرقة، الراديو وأعمال في الموقع. | | | |
| `meta.og.description` | Portfolio of interactive work across listening, language, label, text, projects, bio, band, radio and in-situ pieces. | معرض لأعمال تفاعلية تشمل الاستماع، اللغة، التسمية، النص، المشاريع، النبذة، الفرقة، الراديو وأعمال في الموقع. | | | |
| `meta.twitter.description` | Portfolio of interactive work — listening, language, label, text, projects, bio, band, radio, in-situ. | معرض أعمال تفاعلية — الاستماع، اللغة، التسمية، النص، المشاريع، النبذة، الفرقة، الراديو، في الموقع. | | | |

## 3. Panel titles (`app.js` — `CONTENT` map + `panelTitle.textContent` writes)

| Key | EN | AR | GR | SP | ZH |
|---|---|---|---|---|---|
| `panel.title.listening` | Touch canvas to play/stop | المس اللوحة للتشغيل/الإيقاف | | | |
| `panel.title.symposium` | Language | اللغة | | | |
| `panel.title.label` | Label | التسمية | | | |
| `panel.title.text` | Text | النص | | | |
| `panel.title.projects` | Portfolio - select | الأعمال - اختر | | | |
| `panel.title.projects.expanded` | Website - {name} | الموقع - {name} | | | |
| `panel.title.bio` | Bio | نبذة | | | |
| `panel.title.band` | Band | الفرقة | | | |
| `panel.title.radio` | Radio | الراديو | | | |
| `panel.title.contact` | Contact | تواصل | | | |
| `panel.title.in-situ` | In situ | في الموقع | | | |

## 4. Panel toolbar buttons (`app.js` — `panelSecondary` / `panelClose` / `panelNext`)

| Key | EN | AR | GR | SP | ZH |
|---|---|---|---|---|---|
| `btn.visit` | [Visit] | [زيارة] | | | |
| `btn.close` | [Close] | [إغلاق] | | | |
| `btn.back` | [Back] | [رجوع] | | | |
| `btn.next` | [Next] | [التالي] | | | |
| `btn.reset` | [Reset] | [إعادة ضبط] | | | |
| `btn.color` | [Color] | [لون] | | | |
| `btn.light` | [Light] | [فاتح] | | | |
| `btn.dark` | [Dark] | [داكن] | | | |

## 5. Aria-labels

| Key | EN | AR | GR | SP | ZH | Source |
|---|---|---|---|---|---|---|
| `aria.visit` | Visit welcome.audio | زيارة welcome.audio | | | | `app.js` |
| `aria.close` | Close panel | إغلاق اللوحة | | | | `app.js` |
| `aria.back` | Back to project grid | العودة إلى شبكة المشاريع | | | | `app.js` |
| `aria.reset.bio` | Reset bio — reattach the text | إعادة ضبط النبذة — إعادة إرفاق النص | | | | `app.js` |
| `aria.color` | Color | لون | | | | `app.js` |
| `aria.light` | Light appearance — tap for inverted view | المظهر الفاتح — اضغط لعكس الألوان | | | | `app.js` |
| `aria.dark` | Dark invert on — tap for light appearance | الوضع الداكن مفعّل — اضغط للمظهر الفاتح | | | | `app.js` |
| `projects.aria.grid` | Portfolio grid | شبكة الأعمال | | | | `projects-grid-portfolio.js` |
| `bio.aria.pull` | Pull word: {word} | اسحب الكلمة: {word} | | | | `bio-rope.js` |
| `label.aria.input` | Label text | نص التسمية | | | | `label-pretext.js` |

## 6. Bio paragraph (`app.js` — `CONTENT.bio.body`)

| Key | EN | AR | GR | SP | ZH |
|---|---|---|---|---|---|
| `bio.body` | Omar J's practice centers on design engineering: shaping how digital products look and operate as one connected system. His focus is on how structure, motion, and interaction shape the way people engage with a product. He works across interface design, frontend architecture, and backend systems, building products where concept and implementation develop together. His approach combines design direction with technical execution, turning ideas into clear, expressive, and high-performing outcomes. Across independent and collaborative work, he brings products from initial concept to final build, with form and function held in balance. | | | | |

## 7. Contact markers (`app.js` — `MARKER_SPECS` aria-labels + touch vCard)

| Key | EN | AR | GR | SP | ZH |
|---|---|---|---|---|---|
| `contact.call` | Call 0432 674 199 | اتصال 0432 674 199 | | | |
| `contact.instagram` | Instagram @omarj.www | إنستغرام @omarj.www | | | |
| `contact.email` | Email contact@omarj.com | بريد إلكتروني contact@omarj.com | | | |
| `contact.save` | Save Omar J to contacts | حفظ Omar J في جهات الاتصال | | | |

## 8. Listening panel (`listening-welcome-audio.js`)

| Key | EN | AR | GR | SP | ZH |
|---|---|---|---|---|---|
| `listening.title.idle` | Touch canvas to play/stop | المس اللوحة للتشغيل/الإيقاف | | | |
| `listening.title.loading` | Loading | جارٍ التحميل | | | |
| `listening.title.listening` | Listening | قيد الاستماع | | | |
| `listening.heading` | welcome.audio | welcome.audio | welcome.audio | welcome.audio | welcome.audio |

## 9. Listening chip (`welcome-audio-player.js` — `LISTENING_CHIP_PLAYING_HTML`)

| Key | EN | AR | GR | SP | ZH |
|---|---|---|---|---|---|
| `chip.listening.playing` | Listening (+ vol icon) | قيد الاستماع (+ أيقونة الصوت) | | | |

> Note: the volume icon is an inline SVG; only the text node changes.
> Keep the `<span class="chip__label-optiona">` wrapper intact.

## 10. Minesweeper (`text-minesweeper.js`)

| Key | EN | AR | GR | SP | ZH |
|---|---|---|---|---|---|
| `ms.title` | Minesweeper | كاسحة الألغام | | | |
| `ms.aria.close` | Close Minesweeper | إغلاق كاسحة الألغام | | | |
| `ms.aria.newgame` | New game | لعبة جديدة | | | |
| `ms.diff.beginner` | Beginner | مبتدئ | | | |
| `ms.diff.intermediate` | Intermediate | متوسط | | | |

## 11. In-situ entries (`in-situ.js` — `ENTRIES[i].words`)

| Key | EN | AR | GR | SP | ZH |
|---|---|---|---|---|---|
| `insitu.t2330` | FUCK let's grab some chicken tenders before Sayles closes! | يلا نجيب تشيكن تندرز قبل ما سايلز يقفل! | | | |
| `insitu.t0030` | churros con chocolate pa'la fiesta <3 | تشوروس مع شوكولاتة للحفلة <3 | | | |
| `insitu.t0200` | don't you think it's funny how we were just sipping on $18 cocktails, and now we're munching on these bland, lukewarm dollar slices? | مش غريب إننا كنا بنشرب كوكتيلات بـ18 دولار ودلوقتي بناكل سلايسز رخيصة وباردة؟ | | | |
| `insitu.t0330` | shin ramyun with cheese and a runny egg hits so different when you're severely jetlagged after traveling across continents | شين رامين مع جبنة وبيضة سايلة بيجي مختلف لما تكون متعب من السفر بين القارات | | | |
| `insitu.t0600` | bagel with peanut butter for pre-run fuel again... LET'S GO | بيغل مع زبدة فول سوداني قبل الجري… يلا! | | | |
| `insitu.t0640` | what are you craving for today? porridge or tangyuan or water lily? | نفسك في إيه النهارده؟ بوريدج ولا تانغيوان ولا ووتر ليلي؟ | | | |
| `insitu.t0700` | auntie, a toast set with black coffee please! | لو سمحتي، توست سِت مع قهوة سادة! | | | |
| `insitu.t0725` | *buys bread and coffee in the bakery by Lehel Tér before boarding the North-bound M3* | بيشتري خبز وقهوة من المخبز جنب ليهيل تير قبل ما يركب المترو إم3 شمال | | | |
| `insitu.t0800` | *brewing coffee in my Aeropress, two slices of French brioche on the side* | بحضر قهوتي بالأيروبرس مع شريحتين بريوش فرنسي | | | |
| `insitu.t0830` | *gets an omelette with everything inside and drowns it in Cholula* | بيجيب أومليت بكل حاجة ويغرقه بشطة تشولولا | | | |
| `insitu.t0900` | ham and cheese croissant with decaffeinated cappucino please— | كرواسون جبنة ولحم مع كابتشينو ديكاف لو سمحت— | | | |
| `insitu.t0920` | are you kidding me i love the lowdown!! have you even seen another café with sweetcorn fritters on the menu!? | بتهزر؟ أنا بحب اللو داون!! شفت كافيه بيقدم سويت كورن فريترز قبل كده!؟ | | | |
| `insitu.t1030` | eh should I get Chinese or Jap or Ban Mian ah? ⇝ | أجيب صيني ولا ياباني ولا بان ميان؟ ⇝ | | | |
| `insitu.t1135` | Hurry up! You don't want to waste forever in the line for Mala! | يلا بسرعة! مش عايز تضيع عمرك في طابور المالا! | | | |
| `insitu.t1245` | i bet Budapest has the best hummus in the world! ⇝ | أراهن بودابست فيها أحسن حمص في العالم! ⇝ | | | |
| `insitu.t1330` | my Sunday service is visiting the farmer's market and savoring the dishes i so lovingly and patiently cooked afterwards | طقوسي يوم الأحد: أزور سوق المزارعين وأستمتع بالأكل اللي طبخته بحب | | | |
| `insitu.t1400` | Good afternoon, what's on the special menu today? | مساء الخير، إيه الموجود في قائمة اليوم؟ | | | |
| `insitu.t1530` | i'm craving for pizza-flavored chips and longan water! let's go get some? | نفسي في شيبس بطعم البيتزا ومية لونغان! نروح نجيب؟ | | | |
| `insitu.t1600` | I have 3 coins left, do you want fried chicken or fried rice cake? | معايا 3 عملات بس، عايز فرايد تشيكن ولا كعك رز مقلي؟ | | | |
| `insitu.t1645` | miao, pause your game? I made your favorite Tofu Soup. | مياو، توقف لعبك؟ عملت لك شوربة التوفو اللي بتحبها | | | |
| `insitu.t1730` | *walking towards Trader Joe's, eating freshly made key lime pie Ellenos as if all i knew was hunger* | ماشي ناحية تريدر جو وأكل كي لايم باي كأني ما أعرف غير الجوع | | | |
| `insitu.t1845` | yes bb see you at LDC / Burton! | تمام يا بيبي، نشوفك في إل دي سي / بورتون! | | | |
| `insitu.t1930` | jesus CHRIST I **always** eat so much after barry's!! | يا نهار أبيض دايمًا باكل كتير بعد باريز!! | | | |
| `insitu.t2030` | *starving; heating up leftover soup after my evening class* | جعان؛ بسخن بواقي الشوربة بعد الكلاس المسائي | | | |
| `insitu.t2100` | miaoye, dinner is ready! | مياوي، العشا جاهز! | | | |
| `insitu.t2200` | *whispers* the best way to get a reservation at these coveted spots is choosing the most ungodly hours | أحسن طريقة تحجز في الأماكن الزحمة؟ تختار مواعيد غريبة جدًا | | | |
