# 划词翻译 · Zotero Selection Translator

一个面向 Zotero 7+ 的 PDF 划词翻译插件。在阅读器里选中文字，翻译面板会直接出现在选区下方；可以一键高亮/划线，并把译文写入标注评论。默认调用 DeepL 免费网页接口，也支持 DeepL API、Google、MyMemory、百度、Microsoft、LibreTranslate，以及 OpenAI 兼容 / DeepSeek / Anthropic / Gemini 等 AI 模型。

项目主页：<https://github.com/all11250/zotero-selection-translator>

![划词翻译面板](docs/images/panel.png)

## 功能

- **划词即译**：在 PDF/EPUB 阅读器中选中文字后，自动在选区下方显示翻译；也可以关闭自动翻译，点击按钮再请求。
- **直接标注**：面板内选择颜色，点击「高亮」或「划线」即可创建 Zotero 标注。
- **译文进评论**：勾选「将译文写入标注评论」后，译文会写入该标注的评论；再次点击会更新同一条标注，不会重复创建。
- **多种引擎**：DeepL 免费网页版、DeepL 官方 API、Google 翻译、MyMemory、百度翻译、Microsoft Translator、LibreTranslate。
- **AI 翻译**：支持 OpenAI 兼容接口（OpenAI、通义千问、Kimi、硅基流动、Ollama、LM Studio 等）、DeepSeek 专属接口、Anthropic Claude、Google Gemini。
- **学术提示词**：AI 翻译默认使用学术翻译提示词，可附带论文标题/摘要作为术语上下文，减少专有名词误译。
- **阅读器工具栏开关**：工具栏「译」按钮可快速开关自动翻译。
- **侧边栏标注翻译**：打开标注侧边栏后，每条高亮/划线标题旁有「译」按钮，可把该标注翻译后追加到评论。
- **译文操作**：复制译文、浏览器朗读、重新翻译、切换引擎、错误详情与重试。
- **字号与行距**：译文字号支持 8–48 px 自定义输入，行间距支持 1.0–3.0 倍；设置面板和翻译面板顶部的「Aa」都可以调整。
- **原文预览**：原文区域可上下滚动，鼠标拖动其右下角可以调高/调低显示高度。
- **置顶常驻**：译文右上角「置顶」按钮可把翻译框固定在阅读器页面上，不随选区消失。
- **置顶接管划词**：置顶后，后续划词不再弹出新的翻译卡片，而是直接更新置顶卡片中的原文和译文；关闭置顶卡片后恢复选区弹窗。
- **拖动与缩放**：置顶后按住卡片顶部空白处即可拖动；四条边框和四个角都可调整宽高，拖动/缩放使用 `requestAnimationFrame` 节流。
- **学术字体**：可让译文中文使用宋体、英文/数字使用 Times New Roman（默认开启）。
- **缓存与回退**：相同文本/语言/引擎的译文在会话内缓存；DeepL 免费接口失败时可自动尝试备用免费引擎。

## 安装

### 直接安装（推荐）

1. 打开 Zotero。
2. 菜单 **工具 → 插件**（macOS：**Zotero → 设置 → 插件**）。
3. 点击右上角齿轮 → **Install Add-on From File…**。
4. 选择从 [Releases](https://github.com/all11250/zotero-selection-translator/releases/latest) 下载的 `.xpi` 文件。
5. 按提示重启 Zotero。

> `.xpi` 就是 Zotero 的插件安装包；不需要解压，也不要把它改成 `.zip` 后安装。

### 从源码构建

需要 Node.js（只用于语法检查/静态测试）和 PowerShell 5.1+：

```powershell
git clone https://github.com/all11250/zotero-selection-translator.git
cd zotero-selection-translator
powershell -ExecutionPolicy Bypass -File scripts/build.ps1
```

构建产物：

```text
dist/zotero-selection-translator-1.5.0.xpi
dist/zotero-selection-translator.xpi
dist/SHA256SUMS.txt
```

> `manifest.json` 的 `update_url` 指向本仓库 `main` 分支的 `update.json`。发布新版本时请同步更新该文件中的版本号、下载地址和哈希。

静态检查：

```powershell
node test/smoke.mjs
powershell -ExecutionPolicy Bypass -File scripts/validate.ps1
```

## 快速使用

1. 用 Zotero 打开一篇 PDF。
2. 用鼠标选中一段英文（或其他语言）。
3. 选区下方会出现翻译面板；等待翻译完成。
4. 选择颜色，决定是否勾选「将译文写入标注评论」。
5. 点击「高亮」或「划线」保存标注。
6. 在右侧/左侧标注侧边栏可以看到该标注；评论中就是译文。

打开 **工具 → 划词翻译设置…** 可以配置引擎、语言、标注默认值、译文字号/行距和 AI API。

### 调整字号、行间距和字体

- **设置面板**：基本设置 → 译文字号（8–48 px，可直接输入任意值）、译文行间距（1.0–3.0 倍，支持 0.05 步进）。
- **翻译面板**：点击面板顶部「Aa」按钮，展开字号/行距输入框，立即作用于当前译文；修改会保存为后续默认值。
- **学术字体**：设置中勾选「译文中文使用宋体，英文/数字使用 Times New Roman」后，译文会使用 `"Times New Roman", "SimSun", "宋体", ...` 字体栈：英文/数字优先 TNR，中文字符回退到宋体。该选项默认开启。

### 原文预览 / 置顶 / 拖动 / 缩放

- **原文预览**：鼠标放在原文框内可用滚轮上下滚动；拖动原文框右下角可以调整高度。
- **置顶**：点击译文区域右上角的「置顶」按钮，翻译框会固定到阅读器页面上；按钮变为「关闭置顶」。置顶期间后续划词会直接更新这张卡片，不再在选区下方生成新卡片。
- **关闭置顶**：点击「关闭置顶」会移除常驻卡片，之后的划词恢复为选区弹窗翻译。
- **拖动**：置顶后，按住卡片顶部空白处（logo、空白区域）即可拖动；不要按住下拉框或按钮。
- **缩放**：置顶后，卡片的上、下、左、右四条边以及四个角都可以拖动调整尺寸；最小约 260×180 px。拖动和缩放使用 `requestAnimationFrame` 合并高频事件，减少卡顿。
- 置顶框仍然支持切换引擎、重新翻译、复制、朗读、保存高亮/划线和调整字号/行距。

![设置面板](docs/images/preferences.png)

## 翻译引擎

| 引擎 | 是否需要 Key | 说明 |
|---|---|---|
| DeepL 免费网页版 | 否 | 默认引擎。调用 deepl.com 网页端使用的匿名 oneshot 接口，无需注册；可能限流或随 DeepL 更新失效。 |
| DeepL API | 是 | 官方稳定接口。Free Key 以 `:fx` 结尾，自动走 `api-free.deepl.com`；Pro Key 走 `api.deepl.com`。 |
| Google 翻译 | 否 | 使用 `translate.googleapis.com` 的免费 gtx 接口；部分地区/网络可能不可达。 |
| MyMemory | 否 | 免费，单次约 500 字符；填邮箱可提高每日额度。 |
| 百度翻译 | 是 | 需要百度翻译开放平台的 AppID + 密钥；使用 `md5(appid+q+salt+key)` 签名。 |
| Microsoft Translator | 是 | 需要 Azure Translator Key，可选 Region。 |
| LibreTranslate | 视实例 | 可填公共实例或自建地址；公共实例通常需要 API Key。 |
| AI · OpenAI 兼容 | 通常是 | 兼容 OpenAI Chat Completions；本地 Ollama/LM Studio 可留空 Key。 |
| AI · DeepSeek | 是 | DeepSeek 专属配置（地址 / Key / 模型独立保存），不会覆盖 OpenAI 配置。 |
| AI · Anthropic Claude | 是 | 使用 Messages API；已加 `anthropic-dangerous-direct-browser-access` 头。 |
| AI · Google Gemini | 是 | 使用 `generateContent`。 |

### DeepL 免费网页版说明

插件的默认引擎不是 DeepL 官方 API，而是 DeepL 网页端使用的匿名接口：

```text
POST https://oneshot-free.www.deepl.com/v1/translate
```

它不需要 Key，但有 **1500 字符/请求** 的限制，插件会自动按句子边界切分到约 1200 字符再逐段翻译。该接口属于非官方接口，DeepL 可能随时调整或限流；如果需要长期稳定使用，请申请 DeepL API Free Key，并在设置中选择「DeepL API」。

如果 DeepL 返回 403/429，插件会显示明确错误。免费接口失败时可以在设置里开启「免费引擎失败时自动尝试备用引擎」，默认备用引擎是 MyMemory。

## AI 配置示例

在 **工具 → 划词翻译设置… → AI 模型** 中填写。接口地址可以填 Base URL，也可以填完整请求地址；插件会自动补全 `/v1/chat/completions`（已包含则不重复添加）。

| 服务 | API 地址 | 模型示例 | Key |
|---|---|---|---|
| OpenAI | `https://api.openai.com/v1` | `gpt-4o-mini` | 必填 |
| DeepSeek | `https://api.deepseek.com` | `deepseek-chat` | 必填 |
| 通义千问（兼容模式） | `https://dashscope.aliyuncs.com/compatible-mode/v1` | `qwen-plus` | 必填 |
| 硅基流动 | `https://api.siliconflow.cn/v1` | `deepseek-ai/DeepSeek-V3` | 必填 |
| Ollama | `http://localhost:11434/v1` | `qwen2.5:7b` | 留空 |
| LM Studio | `http://localhost:1234/v1` | 本地模型名 | 留空 |
| Anthropic | `https://api.anthropic.com/v1/messages` | `claude-sonnet-4-5` | 必填 |
| Gemini | `https://generativelanguage.googleapis.com/v1beta` | `gemini-2.0-flash` | 必填 |

DeepSeek 现在有独立的「DeepSeek 专属接口」配置区：地址、Key、模型、Temperature 都单独保存，不会覆盖 OpenAI 兼容配置。官方地址可填 `https://api.deepseek.com` 或 `https://api.deepseek.com/v1`；模型常用 `deepseek-chat`（通用）或 `deepseek-reasoner`（推理）。然后在翻译引擎下拉框选择 **AI · DeepSeek** 即可。

AI 提示词支持占位符：

- `${text}`：选中文本
- `${sourceLang}` / `${targetLang}`：源/目标语言
- `${title}` / `${abstract}`：论文标题/摘要
- `${context}`：标题+摘要上下文

默认提示词要求模型只输出译文，不要解释；如果修改提示词，请保留这一约束，否则评论会变得很长。

## 工作方式与兼容性

- 通过 `Zotero.Reader.registerEventListener("renderTextSelectionPopup", ...)` 把面板同步插入选区弹窗；网络请求异步进行，不阻塞阅读器。
- 标注通过 `Zotero.Annotations.saveFromJSON()` 保存；类型为 `highlight` 或 `underline`，颜色为 Zotero 调色板中的小写十六进制值。
- 保存标注时**不传**当前 reader 的 `_instanceID`，因此打开的阅读器会通过 notifier 自动刷新并显示新标注。
- 已在 Zotero 10.0.8（Windows）上实际验证：面板注入、DeepL 免费翻译、高亮+评论保存、工具栏按钮、侧边栏按钮、设置面板加载、MyMemory 翻译。
- v1.3.0 在隔离的 Zotero 10.0.8 测试配置中自动验证：工具栏只生成一个「译」按钮；长原文的滚动高度大于可视高度；置顶/取消置顶、四角缩放均通过；设置页字号/行间距字段可正常读取。
- 理论支持 Zotero 7+；`manifest.json` 的 `strict_max_version` 目前为 `10.*`。Zotero 11 发布后如仍兼容，可自行把该字段改为 `11.*`。

## 隐私与安全

- 插件没有遥测、统计或远程配置；不会上传整篇 PDF。
- 只有你选中的文本会发送给当前选择的翻译服务：
  - DeepL 免费网页版 / DeepL API → deepl.com
  - Google → Google
  - MyMemory → mymemory.translated.net
  - 百度 → fanyi-api.baidu.com
  - Microsoft → api.cognitive.microsofttranslator.com
  - LibreTranslate → 你填写的实例
  - AI → 你填写的 API 地址
- API Key 保存在本机 Zotero 配置（profile 的 `prefs.js`）中，是明文存储；请使用限额 Key，不要使用主账号的高权限密钥。
- 翻译请求由 Zotero 的网络栈发出，会遵循 Zotero/系统代理设置。

## 常见问题

**面板没有出现？**
- 确认 **工具 → 划词翻译设置… → 启用划词翻译** 已勾选。
- 确认当前是 PDF/EPUB 阅读器，且 PDF 不是只读状态。
- 某些快照/网页阅读器没有标准文本选择弹窗，插件会退化为不显示。

**DeepL 返回 429 / 403？**
- 429：免费接口限流，等待一段时间、降低划词频率，或改用 DeepL API Key / 其他引擎。
- 403：可能是 DeepL 网页客户端版本过期或 IP 被临时限制。可在设置中配置 DeepL API Key；或在「DeepL → 网页版版本/构建号/OS 版本」中更新兼容参数（通常不需要改）。

**Google 一直超时？**
- 部分网络无法访问 `translate.googleapis.com`。改用 DeepL、MyMemory、百度或 AI 引擎。

**API 报 401/404？**
- 401：Key 错误、余额不足或没有权限。
- 404：接口地址多写/少写了路径。OpenAI 兼容接口或 DeepSeek 专属接口建议填 Base URL（例如 `https://api.deepseek.com`），插件会补 `/v1/chat/completions`。
- 本地 Ollama 要确认 `http://localhost:11434` 正在运行，模型名与 `ollama list` 一致。

**标注保存了但看不到？**
- 打开阅读器的标注侧边栏；新标注会通过 Zotero notifier 自动渲染。
- 如果 PDF 是只读的（例如某些同步/权限受限的附件），Zotero 不允许写入标注。

**AI 输出带解释/前后缀？**
- 插件会清理常见代码块和 `Translation:` 前缀，但无法保证所有模型都严格只输出译文。建议使用默认提示词，或换用指令遵循更好的模型。

## 目录结构

```text
src/
  manifest.json
  bootstrap.js
  prefs.js
  content/
    preferences.xhtml
    icons/
    scripts/
      engines.js       # 各翻译引擎与请求实现
      translate.js     # 插件生命周期、阅读器 UI、标注保存
    styles/
      translate.css    # 阅读器面板样式
      preferences.css  # 设置面板样式
scripts/
  build.ps1            # 打包为 XPI（含目录项，兼容 nsJAR）
  validate.ps1         # 语法、manifest、XHTML 检查
docs/images/           # README 截图
test/smoke.mjs         # 静态回归检查
dist/                  # 构建产物
```

## 实现参考

本项目的交互和部分工程思路参考了以下开源项目，代码为独立实现：

- [windingwind/zotero-pdf-translate](https://github.com/windingwind/zotero-pdf-translate)：Zotero 阅读器划词弹窗、标注翻译、多引擎架构的成熟参考。
- [OwO-Network/DeepLX](https://github.com/OwO-Network/DeepLX)：DeepL 网页 oneshot 接口的逆向与语言/长度限制说明。
- [Zotero 官方插件开发文档](https://www.zotero.org/support/dev/zotero_7_for_developers)：bootstrap、阅读器事件、偏好设置面板 API。
- [DeepL API 文档](https://developers.deepl.com/docs)：官方 v2 接口与语言代码。

## License

MIT。详见 [LICENSE](LICENSE)。
