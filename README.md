# 🚀 Chat Navigator (GPT 对话问题导航)

**Chat Navigator** 是一款专为 AI 聊天界面设计的用户脚本（UserScript）。它为 ChatGPT、Gemini、豆包等平台提供了一个悬浮导航面板，帮助你在单个聊天长对话中快速定位历史提问，提高查找效率。

## ✨ 核心特性

- **🎯 多网站兼容**：完美适配 ChatGPT, Gemini (Google AI), 豆包 (Doubao), 以及deepseek、Kimi。
- **🤏 智能交互**：
  - **自动吸附**：展开时根据面板位置智能选择向左或向右展开，防止超出屏幕。
  - **一键折叠**：点击面板或折叠按钮即可变为极简的小圆球，减少视觉干扰。
  - **快捷键支持**：使用 `Alt + Q` 快速显示或隐藏整个面板。
  - **便捷搜索**：可在搜索栏按照关键词搜索询问。
- **🛡️ 安全可靠**：严格遵守原生 DOM 构建准则（无 `innerHTML`），兼容 Gemini 等高安全等级网站的 CSP 策略。

------

## 📦 安装方式

1. **准备环境**：确保你的浏览器已安装 [Tampermonkey (篡改猴)](https://www.tampermonkey.net/) 插件。
2. **一键安装**：点击下方的按钮，在弹出的窗口中点击“安装”或“更新”：

> [!IMPORTANT]
>
> ### [🚀 点击此处一键安装脚本](https://github.com/hechen-coder/chat-navigator/raw/refs/heads/main/ChatNavigator.user.js)

| **动作**            | **操作**                               |
| ------------------- | -------------------------------------- |
| **显示 / 隐藏面板** | `Alt + Q`                              |
| **折叠面板**        | 点击顶部的 `—` 图标                    |
| **移动位置**        | 鼠标按住面板顶部或折叠后的圆球进行拖拽 |
| **手动刷新列表**    | 点击顶部的 `↻` 图标                    |
| **展开面板**        | 点击折叠后的小圆球即可恢复             |

3. **页面展示：**

![image-20260130093325848](assets/image-20260130093325848.png)

## 🤝 贡献与反馈

欢迎提交 Issue 或 Pull Request 来优化脚本！

## 📄 开源协议

本项目采用 [MIT License](https://www.google.com/search?q=LICENSE) 开源协议。