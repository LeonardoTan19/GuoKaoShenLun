#let default-fonts = (
  // 宋体：方正书宋_GBK（Typst 家族名 FZShuSong-Z01）
  // 首位 Times New Roman：拉丁字母/数字等非中文字符走 Times New Roman，中文回落方正书宋
  song: ("Times New Roman", "FZShuSong-Z01", "SimSun", "STSong", "Source Han Serif SC"),
  // 黑体：方正黑体_GBK（Typst 家族名 FZHei-B01）
  hei: ("FZHei-B01", "SimHei", "Microsoft YaHei", "Source Han Sans SC"),
  // 一级标题：方正准圆_GBK（Typst 家族名 FZZhunYuan-M02）
  zhunyuan: ("FZZhunYuan-M02", "FZHei-B01", "SimHei", "Microsoft YaHei", "Source Han Sans SC"),
  // 二级标题：汉仪中宋简（Typst 家族名 HYZHongSongJ）
  zhongsong: ("HYZHongSongJ", "STZhongsong", "FZShuSong-Z01", "SimSun"),
  kai: ("KaiTi", "STKaiti", "FZKai-Z03", "KaiTi_GB2312"),
  // 仿宋：方正仿宋_GBK（Typst 家族名 FZFangSong-Z02），非中文同样走 Times New Roman
  fangsong: ("Times New Roman", "FZFangSong-Z02", "FangSong", "STFangsong", "FangSong_GB2312"),
  xiaobiaosong: ("FZXiaoBiaoSong-B05S", "FZXiaoBiaoSong-B05", "SimSun", "STSong"),
)

#let shenlun-exam(
  // 试卷基本信息
  year: "2025",
  title: "中央机关及其直属机构录用公务员考试",
  subject: "申论（副省级）",
  date: "2023年1月",
  paper: "iso-b5", // ISO B5 (176mm × 250mm)
  columns: 1,      // 正文分栏数：1 为单栏，2 为双栏

  // 封面布局与虚线配置
  seal-x: 11.36%,               // 垂直密封线（虚线1）X位置或百分比（以176mm × 250mm计约20mm）
  split-y: 70%,                 // 水平分隔线（虚线2）Y位置或百分比
  dashed-line-length: auto,     // 水平虚线长度：auto 时自动精确计算为 100% - seal-x

  // 考生信息区配置（封面左侧 0 ~ seal-x 密封线区域）
  candidate-number-label: "准考证号",
  candidate-name-label: "姓名",
  candidate-line-width: 4.5cm,

  // 封面标题与科目格式配置
  title-size: 14pt,             // 考试全称字号
  subject-size: 20pt,           // 科目字号
  subject-notice-spacing: 1.2cm,// 科目与重要提示间距

  // 封面重要提示配置（无黑框）
  notice-title: "重要提示",
  notice-content: [
    为维护您的个人权益，确保公务员考试的公平公正，请您协助我们监督考试实施工作。

    本场考试规定：监考老师要向本考场全体考生展示题本密封情况，并邀请2名考生代表验封签字后，方能开启试卷袋。
  ],

  // 封面下方区域内容（虚线1与2围成的下方区域，默认留空）
  cover-bottom: none,

  // 封面页（2）：注意事项配置
  instructions-title: "注意事项",
  instructions-width: 90%,       // 注意事项区域宽度（相对版心宽度，100% 为不缩窄）
  instructions: (
    [一、本题本由给定材料与作答要求两部分构成。考试时限为180分钟。其中，阅读给定材料参考时限为50分钟，作答参考时限为130分钟。],
    [二、请在题本、答题卡指定位置上用黑色字迹的钢笔或签字笔填写自己的姓名和准考证号，并用2B铅笔在准考证号对应的数字上填涂。],
    [三、请用黑色字迹的钢笔或签字笔在答题卡上指定的区域内作答，超出答题区域的作答无效。],
    [四、待监考人员宣布考试开始后，应试者才可以开始答题。],
    [五、所有题目一律使用现代汉语作答。未按要求作答的，不得分。],
    [六、监考人员宣布考试结束时，应试者应立即停止作答，将题本、答题卡和草稿纸都翻过来留在桌上，待监考人员确认数量无误、允许离开后，方可离开。],
    [严禁折叠答题卡！],
  ),

  // 页眉页脚配置
  show-header: false,
  header-title: none,
  footer-format: "chinese", // "dash"（— 1 —）或 "chinese"（第1页 共X页）

  // 自定义字体（可选覆盖）
  custom-fonts: (:),

  // 正文内容
  body
) = {
  // 合并字体设置
  let fonts = default-fonts + custom-fonts

  // 中文引号专用字体栈：剔除首位的 Times New Roman，让引号保持宋体族
  // （否则 “ ” ‘ ’ 等标点因西文字体也含该字形而被 Times New Roman 抢先渲染）
  let song-cjk = fonts.song.filter(f => f != "Times New Roman")

  // 页面尺寸：paper 可为纸张名（如 "iso-b5"）或尺寸字典（如 (width: 176mm, height: 250mm)）
  // Typst 的 page(paper:) 只接受内置纸张名（无 "b5"，只有 "iso-b5"/"jis-b5" 等），自定义尺寸须经 width/height 传入（二者同时给出时 width/height 优先）
  let page-size = if type(paper) == dictionary {
    (width: paper.width, height: paper.height)
  } else {
    (paper: paper)
  }

  // 计算完整标题
  let full-title = if year != none and year != "" {
    str(year) + "年" + title
  } else {
    title
  }

  // 封面密封线右侧与分隔线下方的剩余尺寸
  let cover-width = 100% - seal-x
  let cover-bottom-height = 100% - split-y

  // 计算虚线 2（水平分隔线）的长度：从 seal-x 延伸至页面最右边缘
  let horiz-line-len = if dashed-line-length == auto {
    cover-width
  } else {
    dashed-line-length
  }

  // 页眉显示的文本
  let header-text = if header-title != none {
    header-title
  } else {
    full-title + " · " + subject
  }

  let candidate-field(label, y, height) = [
    #place(top + left, dx: 0pt, dy: y)[
      #box(width: seal-x, height: height)[
        #align(center + horizon)[
          #rotate(-90deg)[
            #box(width: candidate-line-width + 6em)[
              #text(font: fonts.song, size: 12pt)[
                #label#box(width: candidate-line-width, stroke: (bottom: 0.8pt))
              ]
            ]
          ]
        ]
      ]
    ]
  ]

  let indented-heading(it, size, above, below) = {
    set text(font: fonts.song, size: size, weight: "regular")
    block(above: above, below: below)[
      #set par(first-line-indent: 0pt, leading: 1.25em, justify: true)
      #h(2em)#if it.numbering != none {
        counter(heading).display(it.numbering)
      }#it.body
    ]
  }

  // ==========================================
  // 1. 封面页（1）：密封线、标题、重要提示（无黑框）
  // ==========================================
  set page(
    ..page-size,
    margin: 0pt,
    header: none,
    footer: none,
  )

  block(width: 100%, height: 100%)[
    #place(top + left, dx: seal-x, dy: 0%)[
      #line(start: (0pt, 0pt), end: (0pt, 100%), stroke: (dash: "dashed", thickness: 0.5pt))
    ]

    #place(top + left, dx: seal-x, dy: split-y)[
      #line(start: (0pt, 0pt), end: (horiz-line-len, 0pt), stroke: (dash: "dashed", thickness: 0.5pt))
    ]

    #candidate-field(candidate-number-label, -4%, split-y)
    #candidate-field(candidate-name-label, split-y - 6%, cover-bottom-height)

    #place(top + left, dx: seal-x, dy: 0%)[
      #box(
        width: cover-width,
        height: split-y,
        inset: (top: 4cm, bottom: 0.8cm, left: 1.5cm, right: 1.5cm),
      )[
        #align(center + horizon)[
          // 考试名称与科目
          #align(center)[
            #text(font: fonts.hei, size: title-size, weight: "bold", tracking: -0.2pt)[
              #full-title
            ]

            #text(font: fonts.xiaobiaosong, size: subject-size, weight: "bold")[
              #subject
            ]
          ]

          #v(subject-notice-spacing)

          // 重要提示区域（无黑框）
          // 整体居中；内部标题、内容、日期共用同一左缘（80% 宽）
          #align(center)[
            #block(width: 80%)[
              #set align(left)
              #text(font: fonts.hei, size: 13pt, weight: "bold")[
                #notice-title
              ]

              #block(width: 100%)[
                #set par(first-line-indent: (amount: 2em, all: true), leading: 1.2em, justify: true)
                #set text(font: fonts.fangsong, size: 11.5pt)

                #notice-content
              ]

              #align(right)[
                #text(font: fonts.hei, size: 12pt, weight: "bold")[
                  #date
                ]
              ]
            ]
          ]
        ]
      ]
    ]

    #if cover-bottom != none [
      #place(top + left, dx: seal-x, dy: split-y)[
        #box(
          width: cover-width,
          height: cover-bottom-height,
          inset: (x: 1.5cm, y: 1cm),
        )[
          #cover-bottom
        ]
      ]
    ]
  ]

  // ==========================================
  // 2. 封面页（2）：注意事项
  // ==========================================
  pagebreak()
  set page(
    ..page-size,
    margin: (top: 3cm, bottom: 2.5cm, left: 2.2cm, right: 2.2cm),
    header: none,
    footer: none,
  )

  align(center)[
    #block(width: instructions-width)[
      #set align(left)

      #align(center)[
        #text(font: fonts.hei, size: 18pt, weight: "bold")[
          #instructions-title
        ]
      ]

      #v(1cm)

      #set text(font: fonts.hei, size: 12pt)
      #set par(first-line-indent: (amount: 2em, all: true), leading: 1.3em, justify: true)

      #for item in instructions [
        #item
        #v(0.5em)
      ]
    ]
  ]

  // ==========================================
  // 3. 正文页配置
  // ==========================================
  pagebreak()
  counter(page).update(1)

  set page(
    ..page-size,
    columns: columns,
    margin: (top: 2.2cm, bottom: 2.2cm, left: 2.2cm, right: 2.2cm),
    header: if show-header {
      context [
        #set text(font: fonts.song, size: 9pt)
        #align(center)[#header-text]
        #v(-0.3em)
        #line(length: 100%, stroke: 0.5pt)
      ]
    } else {
      none
    },
    footer: context [
      #set text(font: fonts.song, size: 10.5pt)
      #align(center)[
        #if footer-format == "chinese" [
          第#counter(page).display("1")页　共#counter(page).final().first()页
        ] else [
          — #counter(page).display("1") —
        ]
      ]
    ],
  )

  // 正文段落与字体基础格式
  set text(font: fonts.song, size: 10.5pt)
  set par(first-line-indent: (amount: 2em, all: true), leading: 1.25em, justify: true)

  // 中文引号（含智能引号）强制使用宋体族，避免被 Times New Roman 渲染
  show "“": set text(font: song-cjk)
  show "”": set text(font: song-cjk)
  show "‘": set text(font: song-cjk)
  show "’": set text(font: song-cjk)
  show smartquote: set text(font: song-cjk)

  // 标题编号规则：仅三级标题自动使用中文编号（一、、二、、三、……），一二级标题不自动编号
  set heading(numbering: (..nums) => {
    let level = nums.pos().len()
    if level == 3 {
      let n = nums.pos().last()
      let numerals = ("一", "二", "三", "四", "五", "六", "七", "八", "九", "十")
      if n <= numerals.len() {
        numerals.at(n - 1) + "、"
      } else {
        str(n) + "、"
      }
    } else {
      none
    }
  })

  // 一级标题：给定资料、作答要求
  show heading.where(level: 1): it => {
    set text(font: fonts.zhunyuan, size: 10.5pt, weight: "bold")
    set align(left)
    block(above: 1.25em + 0.2cm, below: 1.25em + 0.2cm)[
      #h(2em)#it.body
    ]
  }

  // 二级标题：资料 1、资料 2 等
  show heading.where(level: 2): it => {
    set text(font: fonts.zhongsong, size: 10.5pt, weight: "bold")
    set align(left)
    block(above: 1.25em, below: 1.25em)[
      #h(2em)#it.body
    ]
  }

  // 三级标题（题号或子标题，宋体常规，首行缩进 2em，自动编号；第一题不额外加空行，后续各题上方空一行）
  show heading.where(level: 3): it => context {
    let n = counter(heading).get().last()
    let above = if n <= 1 { 1.25em } else { 2.5em }
    indented-heading(it, 10.5pt, above, 1.25em)
  }

  body
}

// ==========================================
// 辅助组件：作答题目自动编号
// ==========================================
#let chinese-question-number(..numbers) = {
  let numerals = ("一", "二", "三", "四", "五", "六", "七", "八", "九", "十")
  let number = numbers.pos().first()
  numerals.at(number - 1) + "、"
}

#let questions(body) = {
  set enum(numbering: chinese-question-number, spacing: 1.25em)
  body
}

// ==========================================
// 辅助组件：申论题目块
// 直接传入完整题目内容，题干与作答要求按实际填写连续排版。
// ==========================================
#let question(body, fonts: default-fonts) = {
  block(above: 1.1em, below: 1.1em)[
    #set par(first-line-indent: (amount: 2em, all: true), leading: 1.25em, justify: true)
    #set text(font: fonts.song, size: 12pt)
    #body
  ]
}

// ==========================================
// 辅助组件：给定资料引用框/案例说明框（可选）
// ==========================================
#let material-box(title: none, body, fonts: default-fonts) = {
  block(
    width: 100%,
    stroke: 0.5pt + luma(120),
    radius: 2pt,
    fill: luma(250),
    inset: 0.8em,
    above: 0.8em,
    below: 0.8em,
  )[
    #if title != none [
      #text(font: fonts.hei, weight: "bold")[#title] \
      #v(0.2em)
    ]
    #set text(font: fonts.kai, size: 9.5pt)
    #set par(first-line-indent: (amount: 2em, all: true), leading: 1.15em)
    #body
  ]
}
