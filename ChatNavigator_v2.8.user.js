// ==UserScript==
// @name         GPT 对话问题导航 (支持站点  chatgpt.com, gemini.google.com, 豆包, Kimi, DeepSeek, 千问)
// @namespace    http://tampermonkey.net/
// @version      2.8
// @description  增加导出功能 适配升级： 兼容 grok claude
// @match        https://gemini.google.com/app/*
// @match        https://chatgpt.com/c/*
// @match        https://www.doubao.com/chat/*
// @match        https://www.kimi.com/chat/*
// @match        https://chat.deepseek.com/a/chat/s/*
// @match        https://www.qianwen.com/chat/*
// @match        https://grok.com/*
// @match        https://claude.ai/chat/*
// @require      https://cdn.jsdelivr.net/npm/turndown@7.2.0/dist/turndown.js
// @require      https://cdn.jsdelivr.net/npm/turndown-plugin-gfm@1.0.2/dist/turndown-plugin-gfm.js
// @require      https://cdn.jsdelivr.net/npm/html2pdf.js@0.10.1/dist/html2pdf.bundle.min.js
// @grant        none
// @license      MIT
// @downloadURL  https://github.com/hechen-coder/chat-navigator/raw/main/ChatNavigator.user.js
// @updateURL    https://github.com/hechen-coder/chat-navigator/raw/main/ChatNavigator.user.js
// ==/UserScript==

(function () {
    'use strict';
    // 确保只在主页运行
    if (window.top !== window.self) return;

    // === 1. 站点配置 ===
    // 通过不同站点配置导航条目、消息容器、消息内容提取节点
    const SITE_CONFIGS = [
        {
            name: 'GPT',
            match: url => url.startsWith('https://chatgpt.com/c/'),
            navSelector: 'div.whitespace-pre-wrap',
            messageSelector: '[data-message-author-role]',
            contentSelectors: ['[data-testid="message_text_content"]', 'div.markdown.prose', '.markdown', '.prose']
        },
        {
            name: 'Gemini',
            match: url => { try { return new URL(url).host === 'gemini.google.com'; } catch(e){return false;} },
            navSelector: 'div.query-text.gds-body-l',
            messageSelector: '[data-message-author-role], message-content, div.query-text.gds-body-l',
            contentSelectors: ['.markdown', '.prose', 'div.query-text.gds-body-l']
        },
        {
            name: '豆包',
            match: url => url.startsWith('https://www.doubao.com/chat/'),
            navSelector: 'div[data-testid="send_message"]',
            messageSelector: '[data-message-author-role], div[data-testid="send_message"], div[data-testid="receive_message"]',
            contentSelectors: ['.markdown', '.prose', '[data-testid="message_text_content"]']
        },
        {
            name: 'Kimi',
            match: url => url.startsWith('https://www.kimi.com/chat/'),
            navSelector: 'div.user-content, div.segment-content-box',
            messageSelector: '[data-message-author-role], div.user-content, div.assistant-content, div.segment-content-box',
            contentSelectors: [
                '.segment-content-box .markdown-container .markdown',
                '.segment-content-box .markdown',
                '.markdown-container .markdown',
                '.markdown-container',
                '.markdown',
                '.prose',
                'div.user-content',
                'div.assistant-content'
            ]
        },
        {
            name: 'DeepSeek',
            match: url => url.startsWith('https://chat.deepseek.com/a/chat/s/'),
            navSelector: 'div.fbb737a4',
            messageSelector: '[data-message-author-role], div.fbb737a4',
            contentSelectors: ['.markdown', '.prose', 'div.fbb737a4']
        },
        {
            name: 'Qianwen',
            match: url => url.startsWith('https://www.qianwen.com/chat/'),
            navSelector: 'div.bubble-uo23is, div.qk-markdown, #qk-markdown-react',
            messageSelector: '[data-message-author-role], div.bubble-VIVxZ8, div.qk-markdown, #qk-markdown-react',
            contentSelectors: [
                'div.qk-markdown',
                '#qk-markdown-react',
                '.qk-md-paragraph',
                '.qk-md-text',
                '.markdown',
                '.prose',
                'div.bubble-uo23is'
            ]
        },
        {
            name: 'Grok',
            match: url => { try { return new URL(url).host === 'grok.com'; } catch(e){return false;} },
            navSelector: 'div.message-bubble',
            messageSelector: '[data-message-author-role], div.message-bubble',
            contentSelectors: [
                '.response-content-markdown.markdown',
                '.response-content-markdown',
                '.markdown',
                '.prose',
                'div.message-bubble'
            ]
        },
        {
            name: 'Claude',
            match: url => url.startsWith('https://claude.ai/chat/'),
            navSelector: 'div[data-testid="user-message"], div.standard-markdown',
            messageSelector: '[data-message-author-role], div[data-testid="user-message"], div[data-testid="assistant-message"], div.standard-markdown',
            contentSelectors: ['div.standard-markdown', '.markdown', '.prose', '[data-testid="user-message"]', '[data-testid="assistant-message"]']
        }
    ];

    const site = SITE_CONFIGS.find(cfg => cfg.match(location.href));
    if (!site) return;
    const EXPORT_DISABLED_REASON = site.name === 'Gemini'
        ? 'Gemini 页面启用 Trusted Types 安全策略，导出功能暂不可用。'
        : '';

    // 监听变化根节点
    const OBSERVE_ROOT = document.body;
    // 防抖延迟，防止频繁刷新卡顿
    const DEBOUNCE_MS = 250;

    // 等待 DOM 加载完毕的工具函数
    function waitForBody(cb) {
        document.body ? cb() : setTimeout(() => waitForBody(cb), 50);
    }

    const ROLE_LABELS = {
        user: '用户',
        assistant: 'AI助手',
        system: '系统'
    };

    function normalizeText(text) {
        return (text || '')
            .replace(/\r\n/g, '\n')
            .replace(/\u00a0/g, ' ')
            .replace(/该消息暂时不支持查看，请前往千问手机端查看/g, '')
            .replace(/[ \t]+\n/g, '\n')
            .replace(/\n{3,}/g, '\n\n')
            .trim();
    }

    function queryAll(selector, root = document) {
        try {
            return Array.from(root.querySelectorAll(selector));
        } catch (e) {
            return [];
        }
    }

    function firstBySelectors(root, selectors = []) {
        for (const selector of selectors) {
            if (!selector) continue;
            try {
                const node = root.querySelector(selector);
                if (node) return node;
            } catch (e) {}
        }
        return null;
    }

    function getNavigationNodes() {
        const selector = site.navSelector || site.selector;
        if (!selector) return [];
        return queryAll(selector).filter(el => !el.closest('[data-gpt-nav-ignore]'));
    }

    function getMessageContainers() {
        const selectors = [
            site.messageSelector,
            '[data-message-author-role]',
            'article',
            '[role="listitem"]'
        ].filter(Boolean);

        const seen = new Set();
        const result = [];
        selectors.forEach(selector => {
            queryAll(selector).forEach(el => {
                if (!el || el.closest('[data-gpt-nav-ignore]') || seen.has(el)) return;
                seen.add(el);
                result.push(el);
            });
        });
        return result;
    }

    function getMessageContentElement(containerEl) {
        if (!containerEl) return null;
        const selectors = [
            ...(site.contentSelectors || []),
            '[data-testid="message_text_content"]',
            '.markdown',
            '.prose'
        ];
        return firstBySelectors(containerEl, selectors) || containerEl;
    }

    function getCleanText(el) {
        if (!el) return '';
        const clone = el.cloneNode(true);
        const hiddenElements = clone.querySelectorAll('.cdk-visually-hidden, .sr-only, .visually-hidden, script, style, button, svg, textarea, input');
        hiddenElements.forEach(hiddenEl => hiddenEl.remove());
        return normalizeText(clone.innerText || clone.textContent || '');
    }

    function getCleanHtml(el) {
        if (!el) return null;
        const clone = el.cloneNode(true);
        const hiddenElements = clone.querySelectorAll('.cdk-visually-hidden, .sr-only, .visually-hidden, script, style, button, svg, textarea, input');
        hiddenElements.forEach(hiddenEl => hiddenEl.remove());
        const html = (clone.innerHTML || '').trim();
        return html || null;
    }

    function detectRole(el, index, fallbackRole = 'assistant') {
        const roleOwner = el?.closest?.('[data-message-author-role]') || el;
        const roleHint = [
            roleOwner?.getAttribute?.('data-message-author-role'),
            roleOwner?.getAttribute?.('data-role'),
            roleOwner?.dataset?.role,
            roleOwner?.closest?.('[data-message-author-role]')?.getAttribute?.('data-message-author-role')
        ].filter(Boolean).join(' ').toLowerCase();

        if (roleHint.includes('system')) return 'system';
        if (/(assistant|model|bot|ai)/.test(roleHint)) return 'assistant';
        if (/(user|human)/.test(roleHint)) return 'user';

        const classHint = [
            roleOwner?.className,
            roleOwner?.id,
            roleOwner?.getAttribute?.('data-testid'),
            roleOwner?.getAttribute?.('aria-label')
        ].filter(Boolean).join(' ').toLowerCase();

        if (classHint.includes('system')) return 'system';
        if (/(assistant|model|bot|answer|response)/.test(classHint)) return 'assistant';
        if (/(user|human|question|prompt|send_message)/.test(classHint)) return 'user';

        if (fallbackRole) return fallbackRole;
        return index % 2 === 0 ? 'assistant' : 'user';
    }

    function extractMessageTime(el) {
        if (!el) return null;
        const timeEl = el.querySelector('time');
        if (!timeEl) return null;
        const value = timeEl.getAttribute('datetime') || timeEl.textContent || '';
        const result = normalizeText(value);
        return result || null;
    }

    function sanitizeFileName(name) {
        const clean = (name || 'chat-export').replace(/[\\/:*?"<>|]/g, '_').trim();
        return clean.slice(0, 80) || 'chat-export';
    }

    function formatDateTime(date = new Date()) {
        const pad = (n) => String(n).padStart(2, '0');
        return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`;
    }

    function formatTimestamp(date = new Date()) {
        const pad = (n) => String(n).padStart(2, '0');
        return `${date.getFullYear()}${pad(date.getMonth() + 1)}${pad(date.getDate())}_${pad(date.getHours())}${pad(date.getMinutes())}${pad(date.getSeconds())}`;
    }

    function getPageTitle() {
        const raw = normalizeText(document.title || '');
        if (!raw) return '对话导出';
        const stripped = raw.replace(/\s*[\-|｜|丨]\s*(ChatGPT|Gemini|Claude|Grok|Kimi|DeepSeek|Qianwen|豆包).*$/i, '').trim();
        return stripped || raw;
    }

    function downloadBlob(filename, blob) {
        const link = document.createElement('a');
        const url = URL.createObjectURL(blob);
        link.href = url;
        link.download = filename;
        document.body.appendChild(link);
        link.click();
        link.remove();
        setTimeout(() => URL.revokeObjectURL(url), 2000);
    }

    function htmlToMarkdown(html) {
        const source = (html || '').trim();
        if (!source) return '';

        if (typeof TurndownService !== 'undefined') {
            try {
                const service = new TurndownService({
                    headingStyle: 'atx',
                    codeBlockStyle: 'fenced',
                    bulletListMarker: '-'
                });
                if (typeof turndownPluginGfm !== 'undefined' && turndownPluginGfm.gfm) {
                    service.use(turndownPluginGfm.gfm);
                }
                return normalizeText(service.turndown(source));
            } catch (e) {}
        }
        const doc = parseHtmlDocument(source);
        return normalizeText((doc.body && (doc.body.innerText || doc.body.textContent)) || '');
    }

    function escapeHtml(text) {
        return (text || '')
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#39;');
    }

    function conversationToMarkdown(messages) {
        const lines = [];
        lines.push(`# ${getPageTitle()}`);
        lines.push('');
        lines.push(`- 导出时间: ${formatDateTime()}`);
        lines.push(`- 来源: ${location.href}`);
        lines.push(`- 条数: ${messages.length}`);
        lines.push('');

        messages.forEach(msg => {
            const roleLabel = ROLE_LABELS[msg.role] || msg.role || '未知';
            lines.push(`## ${msg.index}. ${roleLabel}`);
            if (msg.time) lines.push(`- 时间: ${msg.time}`);
            lines.push('');
            const body = htmlToMarkdown(msg.html || '') || msg.text || '';
            lines.push(body);
            lines.push('');
        });

        return lines.join('\n').replace(/\n{3,}/g, '\n\n');
    }

    function parseHtmlDocument(html) {
        const parser = new DOMParser();
        return parser.parseFromString(html || '', 'text/html');
    }

    function parseHtmlFragment(html) {
        const doc = parseHtmlDocument(`<div id="__cn_root__">${html || ''}</div>`);
        const root = doc.getElementById('__cn_root__') || doc.body;
        const fragment = document.createDocumentFragment();
        while (root.firstChild) {
            fragment.appendChild(root.firstChild);
        }
        return fragment;
    }

    function sanitizeMessageHtmlForExport(html) {
        const source = (html || '').trim();
        if (!source) return null;
        const fragment = parseHtmlFragment(source);
        const walker = document.createTreeWalker(fragment, NodeFilter.SHOW_ELEMENT);
        const whitelistAttrs = new Set(['href', 'src', 'alt', 'title', 'colspan', 'rowspan']);
        const removeTags = new Set(['SCRIPT', 'STYLE', 'NOSCRIPT', 'IFRAME', 'OBJECT', 'EMBED']);
        while (walker.nextNode()) {
            const node = walker.currentNode;
            if (removeTags.has(node.tagName)) {
                node.remove();
                continue;
            }
            Array.from(node.attributes || []).forEach(attr => {
                if (!whitelistAttrs.has(attr.name)) node.removeAttribute(attr.name);
            });
            if (node.tagName === 'A' && node.getAttribute('href')) {
                node.setAttribute('target', '_blank');
                node.setAttribute('rel', 'noopener noreferrer');
            }
        }
        return fragment;
    }

    function buildExportDocumentElement(messages) {
        const root = document.createElement('div');
        root.className = 'cn-pdf-doc';

        const header = document.createElement('header');
        const h1 = document.createElement('h1');
        h1.textContent = getPageTitle();
        header.appendChild(h1);

        const meta1 = document.createElement('div');
        meta1.className = 'meta-line';
        meta1.textContent = `导出时间: ${formatDateTime()}`;
        header.appendChild(meta1);

        const meta2 = document.createElement('div');
        meta2.className = 'meta-line';
        meta2.textContent = `来源: ${location.href}`;
        header.appendChild(meta2);

        const meta3 = document.createElement('div');
        meta3.className = 'meta-line';
        meta3.textContent = `条数: ${messages.length}`;
        header.appendChild(meta3);

        root.appendChild(header);

        messages.forEach(msg => {
            const section = document.createElement('section');
            section.className = 'msg';

            const h2 = document.createElement('h2');
            const roleLabel = ROLE_LABELS[msg.role] || msg.role || '未知';
            h2.textContent = `${msg.index}. ${roleLabel}`;
            section.appendChild(h2);

            if (msg.time) {
                const meta = document.createElement('div');
                meta.className = 'meta';
                meta.textContent = `时间: ${msg.time}`;
                section.appendChild(meta);
            }

            const body = document.createElement('div');
            body.className = 'body';
            const frag = sanitizeMessageHtmlForExport(msg.html);
            if (frag) {
                body.appendChild(frag);
            } else {
                const p = document.createElement('p');
                p.textContent = msg.text || '';
                body.appendChild(p);
            }
            section.appendChild(body);
            root.appendChild(section);
        });

        return root;
    }

    function buildExportWrapper(messages) {
        const wrapper = document.createElement('div');
        wrapper.style.position = 'fixed';
        wrapper.style.left = '0';
        wrapper.style.top = '0';
        wrapper.style.width = '1000px';
        wrapper.style.opacity = '0';
        wrapper.style.pointerEvents = 'none';
        wrapper.style.zIndex = '-1';

        const style = document.createElement('style');
        style.textContent = `
            .cn-pdf-doc { font-family: "PingFang SC","Microsoft YaHei","Segoe UI",Arial,sans-serif; color: #111827 !important; line-height: 1.7; font-size: 14px; padding: 20px 24px; background: #ffffff; width: 900px; }
            .cn-pdf-doc, .cn-pdf-doc * { box-sizing: border-box; }
            .cn-pdf-doc header { border-bottom: 1px solid #e5e7eb; margin-bottom: 16px; padding-bottom: 12px; }
            .cn-pdf-doc h1 { margin: 0 0 8px; font-size: 26px; line-height: 1.3; color: #111827 !important; }
            .cn-pdf-doc .meta-line { color: #6b7280 !important; font-size: 12px; }
            .cn-pdf-doc .msg { margin-bottom: 16px; border-bottom: 1px dashed #e5e7eb; padding-bottom: 12px; }
            .cn-pdf-doc .msg h2 { margin: 0 0 8px; font-size: 17px; line-height: 1.4; color: #111827 !important; }
            .cn-pdf-doc .msg .meta { color: #6b7280 !important; font-size: 12px; margin-bottom: 8px; }
            .cn-pdf-doc .body, .cn-pdf-doc .body * { color: #111827 !important; background: transparent !important; }
            .cn-pdf-doc .body p { margin: 0 0 8px; }
            .cn-pdf-doc .body ul, .cn-pdf-doc .body ol { margin: 0 0 8px 22px; }
            .cn-pdf-doc .body pre { background: #f3f4f6 !important; border-radius: 6px; padding: 10px; overflow-x: auto; }
            .cn-pdf-doc .body code { background: #f3f4f6 !important; border-radius: 4px; padding: 1px 4px; }
            .cn-pdf-doc .body pre code { background: transparent !important; padding: 0; }
            .cn-pdf-doc .body blockquote { border-left: 3px solid #d1d5db; margin: 8px 0; padding: 4px 10px; color: #374151 !important; }
            .cn-pdf-doc .body img { max-width: 100%; height: auto; }
        `;
        wrapper.appendChild(style);

        const docRoot = buildExportDocumentElement(messages);
        wrapper.appendChild(docRoot);
        return { wrapper, docRoot };
    }

    function waitForNextPaint() {
        return new Promise(resolve => {
            requestAnimationFrame(() => requestAnimationFrame(resolve));
        });
    }

    function isTrustedTypesError(err) {
        const msg = (err && (err.message || err.toString())) || '';
        return /TrustedHTML|Trusted Types/i.test(String(msg));
    }

    function isTrustedTypesRestricted() {
        try {
            const probe = document.createElement('div');
            probe.innerHTML = '<span></span>';
            return false;
        } catch (e) {
            return isTrustedTypesError(e);
        }
    }

    function splitTextToLines(ctx, text, maxWidth) {
        const lines = [];
        const blocks = String(text || '').replace(/\r\n/g, '\n').split('\n');
        blocks.forEach(block => {
            if (!block) {
                lines.push('');
                return;
            }
            let current = '';
            for (const ch of block) {
                const test = current + ch;
                if (ctx.measureText(test).width > maxWidth && current) {
                    lines.push(current);
                    current = ch;
                } else {
                    current = test;
                }
            }
            if (current) lines.push(current);
        });
        return lines;
    }

    function buildConversationTextCanvas(messages) {
        const width = 1400;
        const paddingX = 48;
        const paddingY = 52;
        const maxWidth = width - paddingX * 2;
        const measureCanvas = document.createElement('canvas');
        const mctx = measureCanvas.getContext('2d');
        const ops = [];
        let y = paddingY;

        const addWrappedText = (text, cfg = {}) => {
            const fontSize = cfg.fontSize || 24;
            const lineHeight = cfg.lineHeight || Math.round(fontSize * 1.55);
            const color = cfg.color || '#111827';
            const fontWeight = cfg.fontWeight || 400;
            const x = cfg.x || paddingX;
            const w = cfg.width || maxWidth;
            const before = cfg.before || 0;
            const after = cfg.after || 0;

            y += before;
            mctx.font = `${fontWeight} ${fontSize}px "PingFang SC","Microsoft YaHei","Segoe UI",Arial,sans-serif`;
            const lines = splitTextToLines(mctx, text, w);
            lines.forEach(line => {
                ops.push({
                    type: 'text',
                    text: line || ' ',
                    x,
                    y,
                    font: mctx.font,
                    color
                });
                y += lineHeight;
            });
            y += after;
        };

        addWrappedText(getPageTitle(), { fontSize: 46, fontWeight: 700, lineHeight: 62, after: 14 });
        addWrappedText(`导出时间: ${formatDateTime()}`, { fontSize: 20, color: '#6b7280', lineHeight: 32 });
        addWrappedText(`来源: ${location.href}`, { fontSize: 18, color: '#6b7280', lineHeight: 30 });
        addWrappedText(`条数: ${messages.length}`, { fontSize: 18, color: '#6b7280', lineHeight: 30, after: 16 });

        messages.forEach(msg => {
            const roleLabel = ROLE_LABELS[msg.role] || msg.role || '未知';
            addWrappedText(`${msg.index}. ${roleLabel}`, { fontSize: 30, fontWeight: 700, lineHeight: 44, before: 10, after: 4 });
            if (msg.time) {
                addWrappedText(`时间: ${msg.time}`, { fontSize: 18, color: '#6b7280', lineHeight: 28, after: 2 });
            }
            const bodyText = htmlToMarkdown(msg.html || '') || msg.text || '';
            addWrappedText(bodyText, { fontSize: 23, lineHeight: 36, after: 10 });
        });

        const height = Math.max(900, Math.ceil(y + paddingY));
        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');

        ctx.fillStyle = '#ffffff';
        ctx.fillRect(0, 0, width, height);
        ops.forEach(op => {
            if (op.type === 'text') {
                ctx.font = op.font;
                ctx.fillStyle = op.color;
                ctx.textBaseline = 'top';
                ctx.fillText(op.text, op.x, op.y);
            }
        });
        return canvas;
    }

    function canvasToBlob(canvas, type = 'image/png', quality) {
        return new Promise((resolve, reject) => {
            canvas.toBlob((blob) => {
                if (!blob) {
                    reject(new Error('Failed to create blob from canvas'));
                    return;
                }
                resolve(blob);
            }, type, quality);
        });
    }

    async function exportImageWithCanvas(messages) {
        const canvas = buildConversationTextCanvas(messages);
        const filename = `${sanitizeFileName(getPageTitle())}_${formatTimestamp()}.png`;
        const blob = await canvasToBlob(canvas, 'image/png');
        downloadBlob(filename, blob);
    }

    async function exportPdfWithCanvas(messages) {
        const jsPdfCtor = (window.jspdf && window.jspdf.jsPDF) || window.jsPDF;
        if (!jsPdfCtor) throw new Error('jsPDF not available');

        const canvas = buildConversationTextCanvas(messages);
        const pdf = new jsPdfCtor({ orientation: 'p', unit: 'mm', format: 'a4' });
        const pageW = 210;
        const pageH = 297;
        const margin = 8;
        const contentW = pageW - margin * 2;
        const contentH = pageH - margin * 2;

        const pageHeightPx = Math.floor(contentH * canvas.width / contentW);
        let offsetPx = 0;
        let page = 0;
        while (offsetPx < canvas.height) {
            const slicePx = Math.min(pageHeightPx, canvas.height - offsetPx);
            const slice = document.createElement('canvas');
            slice.width = canvas.width;
            slice.height = slicePx;
            const sctx = slice.getContext('2d');
            sctx.fillStyle = '#ffffff';
            sctx.fillRect(0, 0, slice.width, slice.height);
            sctx.drawImage(canvas, 0, offsetPx, canvas.width, slicePx, 0, 0, canvas.width, slicePx);
            if (page > 0) pdf.addPage();
            const img = slice.toDataURL('image/jpeg', 0.98);
            const hMm = slicePx * contentW / canvas.width;
            pdf.addImage(img, 'JPEG', margin, margin, contentW, hMm);
            offsetPx += slicePx;
            page += 1;
        }

        const filename = `${sanitizeFileName(getPageTitle())}_${formatTimestamp()}.pdf`;
        pdf.save(filename);
    }

    function extractConversationData() {
        const containers = getMessageContainers();
        const sourceItems = containers.length
            ? containers.map(el => ({ el, fallbackRole: null }))
            : getNavigationNodes().map(el => ({ el, fallbackRole: 'user' }));

        const messages = [];
        sourceItems.forEach((item, idx) => {
            const containerEl = item.el;
            const contentEl = getMessageContentElement(containerEl);
            const text = getCleanText(contentEl);
            if (!text) return;

            const role = detectRole(containerEl, idx + 1, item.fallbackRole);
            const html = getCleanHtml(contentEl);
            const time = extractMessageTime(containerEl);

            messages.push({
                role,
                text,
                html,
                el: containerEl,
                index: messages.length + 1,
                time
            });
        });

        return messages;
    }

    window._gptNavExtractConversation = extractConversationData;

    // === 2. 纯 DOM 创建 SVG ===
    function createSVGIcon(pathData) {
        const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
        svg.setAttribute("viewBox", "0 0 24 24");
        svg.style.width = "18px";
        svg.style.height = "18px";
        svg.style.fill = "currentColor";
        svg.style.display = "block";
        const path = document.createElementNS("http://www.w3.org/2000/svg", "path");
        path.setAttribute("d", pathData);
        svg.appendChild(path);
        return svg;
    }

    const ICONS = {
        search: "M15.5 14h-.79l-.28-.27C15.41 12.59 16 11.11 16 9.5 16 5.91 13.09 3 9.5 3S3 5.91 3 9.5 5.91 16 9.5 16c1.61 0 3.09-.59 4.23-1.57l.27.28v.79l5 4.99L20.49 19l-4.99-5zm-6 0C7.01 14 5 11.99 5 9.5S7.01 5 9.5 5 14 7.01 14 9.5 11.99 14 9.5 14z",
        refresh: "M17.65 6.35C16.2 4.9 14.21 4 12 4c-4.42 0-7.99 3.58-7.99 8s3.57 8 7.99 8c3.73 0 6.84-2.55 7.73-6h-2.08c-.82 2.33-3.04 4-5.65 4-3.31 0-6-2.69-6-6s2.69-6 6-6c1.66 0 3.14.69 4.22 1.78L13 11h7V4l-2.35 2.35z",
        export: "M5 20h14v-2H5v2zm7-18L5.33 8h3.84v6h5.66V8h3.84L12 2z",
        minimize: "M19 13H5v-2h14v2z",
        close: "M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z",
        logo: "M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z"
    };

    // === 3. 浅色系现代化 CSS (注入) ===
    waitForBody(() => {
        const style = document.createElement('style');
        style.textContent = `
            /* --- 核心面板：布局修复 --- */
            #gpt-nav-panel {
                font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif;
                background: rgba(255, 255, 255, 0.90);
                backdrop-filter: blur(25px) saturate(180%);
                -webkit-backdrop-filter: blur(25px) saturate(180%);
                border: 1px solid rgba(255, 255, 255, 0.6);
                box-shadow: 0 6px 24px rgba(0,0,0,0.08), 0 1px 4px rgba(0,0,0,0.04), inset 0 0 0 1px rgba(255,255,255,0.5);
                border-radius: 14px;
                transition: width 0.3s cubic-bezier(0.34, 1.56, 0.64, 1), 
                            height 0.3s cubic-bezier(0.34, 1.56, 0.64, 1),
                            border-radius 0.3s ease;
                color: #374151;
                /* 关键布局：Flex 列布局 */
                display: flex;
                flex-direction: column;
            }

            /* --- 顶部栏 --- */
            .gpt-nav-header {
                background: rgba(240, 240, 245, 0.3);
                border-bottom: 1px solid rgba(0, 0, 0, 0.05);
                padding: 12px 14px;
                border-radius: 14px 14px 0 0;
                /* 防止顶部栏被压缩 */
                flex-shrink: 0;
            }
            .gpt-nav-title {
                font-weight: 600;
                font-size: 14px;
                color: #1f2937;
                letter-spacing: 0.3px;
            }

            /* --- 搜索框区域 --- */
            .gpt-search-box {
                /* 默认高度 0，不占据空间 */
                height: 0;
                opacity: 0;
                overflow: hidden;
                transition: height 0.3s cubic-bezier(0.4, 0, 0.2, 1), opacity 0.2s ease, padding 0.3s ease;
                /* 防止搜索框被压缩 */
                flex-shrink: 0;
                border-bottom: 1px solid transparent; 
            }
            .gpt-search-box.open {
                height: 42px;
                opacity: 1;
                padding: 4px 12px;
                border-bottom: 1px solid rgba(0,0,0,0.03); /* 分割线 */
            }
            .gpt-search-input {
                width: 100%;
                height: 30px;
                background: rgba(0, 0, 0, 0.04);
                border: 1px solid rgba(0, 0, 0, 0.08);
                border-radius: 6px;
                padding: 0 8px;
                font-size: 13px;
                color: #374151;
                outline: none;
                transition: all 0.2s;
                box-sizing: border-box; 
            }
            /* 取消边缘发亮效果
            .gpt-search-input:focus {
                background: #fff;
                border-color: rgba(59, 130, 246, 0.5);
                box-shadow: 0 0 0 3px rgba(59, 130, 246, 0.1);
            }
            */
            .gpt-search-input::placeholder {
                color: #9ca3af;
            }

            /* --- 按钮美化 --- */
            .gpt-nav-btn {
                width: 28px;
                height: 28px;
                border-radius: 6px;
                color: #6b7280;
                transition: all 0.2s ease;
                display: flex;
                align-items: center;
                justify-content: center;
                background: transparent;
                border: none;
                cursor: pointer;
            }
            .gpt-nav-btn:hover, .gpt-nav-btn.active {
                color: #111;
                background: rgba(0, 0, 0, 0.06);
                transform: scale(1.05);
            }
            .gpt-nav-btn.active {
                color: #2563eb;
                background: rgba(59, 130, 246, 0.1);
            }
            .gpt-nav-btn-wrap {
                position: relative;
            }
            .gpt-export-menu {
                position: absolute;
                top: 34px;
                right: 0;
                min-width: 132px;
                background: rgba(255, 255, 255, 0.98);
                border: 1px solid rgba(0, 0, 0, 0.08);
                border-radius: 8px;
                box-shadow: 0 8px 24px rgba(0,0,0,0.12);
                padding: 4px;
                display: none;
                z-index: 1000001;
            }
            .gpt-export-menu.open {
                display: block;
                animation: gpt-drop-in 0.16s ease;
            }
            .gpt-export-item {
                width: 100%;
                border: none;
                background: transparent;
                text-align: left;
                font-size: 12px;
                color: #374151;
                padding: 7px 8px;
                border-radius: 6px;
                cursor: pointer;
            }
            .gpt-export-item:hover {
                background: rgba(59, 130, 246, 0.08);
                color: #1d4ed8;
            }

            .gpt-nav-toast {
                position: fixed;
                left: 50%;
                bottom: 32px;
                transform: translateX(-50%) translateY(10px);
                opacity: 0;
                background: rgba(17, 24, 39, 0.92);
                color: #fff;
                font-size: 12px;
                line-height: 1;
                padding: 10px 12px;
                border-radius: 999px;
                z-index: 1000002;
                pointer-events: none;
                transition: opacity 0.18s ease, transform 0.18s ease;
            }
            .gpt-nav-toast.show {
                opacity: 1;
                transform: translateX(-50%) translateY(0);
            }

            /* --- 列表内容区 (自适应剩余空间) --- */
            .gpt-nav-content {
                padding: 6px;
                flex: 1; 
                overflow-y: auto;
                min-height: 0; 
            }
            .gpt-nav-content::-webkit-scrollbar { width: 4px; }
            .gpt-nav-content::-webkit-scrollbar-track { background: transparent; }
            .gpt-nav-content::-webkit-scrollbar-thumb {
                background: rgba(0, 0, 0, 0.15);
                border-radius: 4px;
            }
            .gpt-nav-content::-webkit-scrollbar-thumb:hover { background: rgba(0, 0, 0, 0.3); }

            /* --- 列表单项 --- */
            .gpt-nav-item {
                padding: 8px 10px;
                margin-bottom: 2px;
                border-radius: 8px;
                color: #4b5563;
                font-size: 13px;
                line-height: 1.5;
                cursor: pointer;
                transition: all 0.2s cubic-bezier(0.25, 0.8, 0.25, 1);
                border: 1px solid transparent;
            }
            .gpt-nav-item:hover {
                background: rgba(0, 0, 0, 0.04);
                color: #000;
                transform: translateX(2px);
            }
        
            @keyframes flash-active {
                0% { background: rgba(0, 0, 0, 0.04); }
                50% { background: rgba(59, 130, 246, 0.15); color: #2563eb; }
                100% { background: rgba(0, 0, 0, 0.04); }
            }
            .gpt-item-active {
                animation: flash-active 0.4s ease;
            }

            /* --- 折叠态 --- */
            #gpt-nav-panel.collapsed {
                width: 50px !important;
                height: 50px !important;
                border-radius: 25px !important;
                background: #ffffff !important;
                box-shadow: 0 4px 16px rgba(0,0,0,0.15), 0 0 0 1px rgba(0,0,0,0.05) !important;
                cursor: pointer;
            }
            #gpt-nav-panel.collapsed > div:not(.gpt-collapsed-view) {
                display: none !important;
            }
            
            .gpt-collapsed-view {
                display: none;
                width: 100%;
                height: 100%;
                align-items: center;
                justify-content: center;
                color: #333;
            }
            #gpt-nav-panel.collapsed .gpt-collapsed-view {
                display: flex;
                animation: fadeIn 0.3s ease;
            }
            @keyframes fadeIn { from { opacity: 0; transform: scale(0.8); } to { opacity: 1; transform: scale(1); } }
            @keyframes gpt-drop-in { from { opacity: 0; transform: translateY(-4px); } to { opacity: 1; transform: translateY(0); } }
        `;
        document.head.appendChild(style);
    });

    // === 4. 构建 UI ===
    waitForBody(() => {
        // 创建主面板 DOM
        const panel = document.createElement('div');
        panel.id = 'gpt-nav-panel';
        panel.setAttribute('data-gpt-nav-ignore', '1');

        Object.assign(panel.style, {
            position: 'fixed',
            top: '100px',
            right: '20px',
            width: '280px',
            height: 'auto',
            maxHeight: '65vh',
            zIndex: '999999',
        });
        document.body.appendChild(panel);

        // --- 共享变量 ---
        let searchTerm = ''; // 当前搜索词
        let searchInputRef = null; // 输入框引用

        let exportMenuRef = null;
        let exportBtnRef = null;
        let toastTimer = null;

        function showToast(message) {
            let toast = document.getElementById('gpt-nav-toast');
            if (!toast) {
                toast = document.createElement('div');
                toast.id = 'gpt-nav-toast';
                toast.className = 'gpt-nav-toast';
                document.body.appendChild(toast);
            }
            toast.textContent = message;
            toast.classList.add('show');
            if (toastTimer) clearTimeout(toastTimer);
            toastTimer = setTimeout(() => toast.classList.remove('show'), 2200);
        }

        function setExportMenuOpen(open) {
            if (!exportMenuRef || !exportBtnRef) return;
            exportMenuRef.classList.toggle('open', open);
            exportBtnRef.classList.toggle('active', open);
        }

        function exportConversationAsMarkdown() {
            const messages = extractConversationData();
            if (!messages.length) {
                showToast('未提取到可导出的对话内容');
                return;
            }
            const markdown = conversationToMarkdown(messages);
            const filename = `${sanitizeFileName(getPageTitle())}_${formatTimestamp()}.md`;
            downloadBlob(filename, new Blob([markdown], { type: 'text/markdown;charset=utf-8' }));
            showToast(`Markdown 已导出（${messages.length} 条）`);
        }

        async function exportConversationAsPdf() {
            const messages = extractConversationData();
            if (!messages.length) {
                showToast('未提取到可导出的对话内容');
                return;
            }

            const forceSafe = isTrustedTypesRestricted();

            if (!forceSafe && typeof html2pdf !== 'undefined') {
                const { wrapper, docRoot } = buildExportWrapper(messages);
                document.body.appendChild(wrapper);
                await waitForNextPaint();

                const filename = `${sanitizeFileName(getPageTitle())}_${formatTimestamp()}.pdf`;
                try {
                    await html2pdf()
                        .set({
                            margin: [10, 10, 10, 10],
                            filename,
                            image: { type: 'jpeg', quality: 0.98 },
                            html2canvas: { scale: 2, useCORS: true, backgroundColor: '#ffffff' },
                            jsPDF: { unit: 'mm', format: 'a4', orientation: 'portrait' },
                            pagebreak: { mode: ['css', 'legacy'] }
                        })
                        .from(docRoot)
                        .save();
                    showToast(`PDF 已导出（${messages.length} 条）`);
                    return;
                } catch (err) {
                    if (!isTrustedTypesError(err)) {
                        console.error('[ChatNavigator] PDF export (html mode) failed:', err);
                    }
                } finally {
                    wrapper.remove();
                }
            }

            try {
                await exportPdfWithCanvas(messages);
                showToast(`PDF 已导出（${messages.length} 条）`);
            } catch (err) {
                showToast('PDF 导出失败，请稍后重试');
                console.error('[ChatNavigator] PDF export fallback failed:', err);
            }
        }

        async function exportConversationAsImage() {
            const messages = extractConversationData();
            if (!messages.length) {
                showToast('未提取到可导出的对话内容');
                return;
            }

            const forceSafe = isTrustedTypesRestricted();

            if (!forceSafe && typeof html2pdf !== 'undefined') {
                const { wrapper, docRoot } = buildExportWrapper(messages);
                document.body.appendChild(wrapper);

                try {
                    await waitForNextPaint();
                    const canvas = await html2pdf()
                        .set({
                            html2canvas: { scale: 2, useCORS: true, backgroundColor: '#ffffff' }
                        })
                        .from(docRoot)
                        .toCanvas()
                        .get('canvas');

                    if (!canvas) throw new Error('Canvas not generated');
                    const filename = `${sanitizeFileName(getPageTitle())}_${formatTimestamp()}.png`;
                    const blob = await canvasToBlob(canvas, 'image/png');
                    downloadBlob(filename, blob);
                    showToast(`图片已导出（${messages.length} 条）`);
                    return;
                } catch (err) {
                    if (!isTrustedTypesError(err)) {
                        console.error('[ChatNavigator] image export (html mode) failed:', err);
                    }
                } finally {
                    wrapper.remove();
                }
            }

            try {
                await exportImageWithCanvas(messages);
                showToast(`图片已导出（${messages.length} 条）`);
            } catch (err) {
                showToast('图片导出失败，请稍后重试');
                console.error('[ChatNavigator] image export fallback failed:', err);
            }
        }

        // --- Header ---
        const header = document.createElement('div');
        header.className = 'gpt-nav-header';
        Object.assign(header.style, { display: 'flex', justifyContent: 'space-between', alignItems: 'center' });

        const title = document.createElement('div');
        title.className = 'gpt-nav-title';
        title.textContent = '导航';
        header.appendChild(title);

        const btnGroup = document.createElement('div');
        btnGroup.style.display = 'flex';
        btnGroup.style.gap = '2px';

        const createBtn = (iconPath, titleText, onClick) => {
            const btn = document.createElement('button');
            btn.className = 'gpt-nav-btn';
            btn.title = titleText;
            btn.appendChild(createSVGIcon(iconPath));
            btn.onclick = (e) => { e.stopPropagation(); onClick(e, btn); };
            return btn;
        };

        // 1. 搜索按钮 
        const btnSearch = createBtn(ICONS.search, '搜索问题', (e, btn) => {
            const box = document.querySelector('.gpt-search-box');
            if (box) {
                const isOpen = box.classList.contains('open');
                if (isOpen) {
                    // === 关闭逻辑 ===
                    box.classList.remove('open');
                    btn.classList.remove('active');
                    
                    // 清空输入框和逻辑变量
                    if (searchInputRef) searchInputRef.value = '';
                    searchTerm = '';
                    
                    // 强制刷新 (复原列表)
                    window._gptNavRefresh(); 
                } else {
                    // === 打开逻辑 ===
                    box.classList.add('open');
                    btn.classList.add('active');
                    setTimeout(() => searchInputRef && searchInputRef.focus(), 100);
                }
            }
        });
        btnGroup.appendChild(btnSearch);

        const exportWrap = document.createElement('div');
        exportWrap.className = 'gpt-nav-btn-wrap';

        exportBtnRef = createBtn(ICONS.export, EXPORT_DISABLED_REASON ? '导出不可用' : '导出', () => {
            if (EXPORT_DISABLED_REASON) {
                showToast(EXPORT_DISABLED_REASON);
                return;
            }
            setExportMenuOpen(!exportMenuRef.classList.contains('open'));
        });
        if (EXPORT_DISABLED_REASON) {
            exportBtnRef.title = EXPORT_DISABLED_REASON;
            exportBtnRef.style.opacity = '0.55';
        }
        exportWrap.appendChild(exportBtnRef);

        exportMenuRef = document.createElement('div');
        exportMenuRef.className = 'gpt-export-menu';

        const createExportItem = (text, onClick) => {
            const item = document.createElement('button');
            item.className = 'gpt-export-item';
            item.type = 'button';
            item.textContent = text;
            item.addEventListener('click', (event) => {
                event.stopPropagation();
                setExportMenuOpen(false);
                onClick();
            });
            exportMenuRef.appendChild(item);
        };

        if (!EXPORT_DISABLED_REASON) {
            createExportItem('导出为图片', exportConversationAsImage);
            createExportItem('导出为 Markdown', exportConversationAsMarkdown);
            createExportItem('导出为 PDF', exportConversationAsPdf);
        } else {
            const reasonItem = document.createElement('button');
            reasonItem.className = 'gpt-export-item';
            reasonItem.type = 'button';
            reasonItem.disabled = true;
            reasonItem.textContent = 'Gemini 暂不支持导出';
            reasonItem.style.opacity = '0.7';
            reasonItem.style.cursor = 'not-allowed';
            exportMenuRef.appendChild(reasonItem);
        }

        exportWrap.appendChild(exportMenuRef);
        btnGroup.appendChild(exportWrap);

        // 2. 刷新按钮
        btnGroup.appendChild(createBtn(ICONS.refresh, '刷新列表', (e, btn) => {
             const svg = btn.querySelector('svg');
             if(svg) {
                 svg.style.transition = 'transform 0.5s ease';
                 svg.style.transform = 'rotate(360deg)';
                 setTimeout(()=> svg.style.transform = 'none', 500);
             }
             scheduleRefresh(0);
        }));

        btnGroup.appendChild(createBtn(ICONS.minimize, '折叠', () => { setExportMenuOpen(false); toggleCollapsed(true); }));
        btnGroup.appendChild(createBtn(ICONS.close, '关闭', () => { setExportMenuOpen(false); panel.style.display = 'none'; }));

        header.appendChild(btnGroup);
        panel.appendChild(header);

        document.addEventListener('pointerdown', (event) => {
            if (!exportMenuRef || !exportMenuRef.classList.contains('open')) return;
            if (exportWrap.contains(event.target)) return;
            setExportMenuOpen(false);
        });

        // --- 搜索框容器 ---
        const searchContainer = document.createElement('div');
        searchContainer.className = 'gpt-search-box';
        
        const searchInput = document.createElement('input');
        searchInput.className = 'gpt-search-input';
        searchInput.type = 'text';
        searchInput.placeholder = '输入关键词搜索...';
        searchInput.addEventListener('pointerdown', e => e.stopPropagation());
        searchInput.addEventListener('click', e => e.stopPropagation());
        
        // 绑定输入逻辑：实时响应
        searchInput.addEventListener('input', (e) => {
            searchTerm = e.target.value.trim().toLowerCase();
            window._gptNavRefresh(); // 触发刷新
        });
        
        searchInputRef = searchInput;
        searchContainer.appendChild(searchInput);
        panel.appendChild(searchContainer);

        // --- Content ---
        const contentContainer = document.createElement('div');
        contentContainer.className = 'gpt-nav-content';
        panel.appendChild(contentContainer);

        // --- Collapsed View ---
        const collapsedView = document.createElement('div');
        collapsedView.className = 'gpt-collapsed-view';
        collapsedView.appendChild(createSVGIcon(ICONS.logo));
        panel.appendChild(collapsedView);

        // === 5. 核心逻辑 ===
        let isCollapsed = false;

        function toggleCollapsed(targetState) {
            const desiredState = (typeof targetState === 'boolean') ? targetState : !isCollapsed;
            if (desiredState === isCollapsed) return;
            isCollapsed = desiredState;
            setExportMenuOpen(false);

            if (isCollapsed) {
                panel.classList.add('collapsed');
            } else {
                const rect = panel.getBoundingClientRect();
                const screenWidth = window.innerWidth;
                panel.style.top = rect.top + 'px';

                if ((rect.left + rect.width / 2) > screenWidth / 2) {
                    const rightDist = screenWidth - rect.right;
                    panel.style.right = rightDist + 'px';
                    panel.style.left = 'auto';
                } else {
                    panel.style.left = rect.left + 'px';
                    panel.style.right = 'auto';
                }
                panel.classList.remove('collapsed');
            }
        }

        panel.addEventListener('click', (e) => {
            if (isCollapsed) {
                e.stopPropagation();
                toggleCollapsed(false);
            }
        });

        // --- 拖拽功能实现 ---
        (function enablePanelDrag() {
            let dragging = false;
            let startX, startY, startLeft, startTop;

            panel.addEventListener('pointerdown', e => {
                if (e.target.closest('button') || e.target.closest('input') || (!isCollapsed && contentContainer.contains(e.target))) return;
                dragging = true;
                panel.setPointerCapture(e.pointerId);
                startX = e.clientX;
                startY = e.clientY;
                const rect = panel.getBoundingClientRect();
                startLeft = rect.left;
                startTop = rect.top;
            });

            panel.addEventListener('pointermove', e => {
                if (!dragging) return;
                const dx = e.clientX - startX;
                const dy = e.clientY - startY;
                if (Math.abs(dx) > 2 || Math.abs(dy) > 2) {
                    panel.style.left = (startLeft + dx) + 'px';
                    panel.style.top = (startTop + dy) + 'px';
                    panel.style.right = 'auto';
                    e.preventDefault();
                }
            });
            panel.addEventListener('pointerup', () => { dragging = false; });
        })();

        // === 核心刷新逻辑 (修复版) ===
        let lastSnapshot = "";
        let lastSearchTerm = "";

        window._gptNavRefresh = () => {
            const allMessages = extractConversationData();
            const navSource = allMessages.filter(m => m.role === 'user');
            const baseMessages = navSource.length ? navSource : allMessages;

            const seenText = new Set();
            const nodes = baseMessages.filter((msg) => {
                const key = (msg.text || '').trim();
                if (!key || seenText.has(key)) return false;
                seenText.add(key);
                return true;
            });

            const currentSnapshot = nodes.length + ":" + nodes.map(n => n.text).join('|');
            
            // 2. 判定是否需要重绘
            // 只有当【页面内容没变】且【搜索词也没变】时，才跳过
            // 如果搜索词变了（比如从"apple"变成了""），必须强制重绘
            if (currentSnapshot === lastSnapshot && searchTerm === lastSearchTerm) {
                return;
            }
            
            // 更新状态记录
            lastSnapshot = currentSnapshot;
            lastSearchTerm = searchTerm; // 关键修复

            contentContainer.textContent = '';
            
            // 3. 过滤与生成
            const validNodes = nodes.map((msg, idx) => {
                const text = msg.text || '';

                if (!text) return null;

                // 搜索过滤
                if (searchTerm && !text.toLowerCase().includes(searchTerm)) {
                    return null;
                }
                return { msg: msg.el, text, idx: idx + 1 };
            }).filter(Boolean);

            if (!validNodes.length) {
                const empty = document.createElement('div');
                empty.textContent = searchTerm ? '无匹配结果' : '暂无提问';
                empty.style.padding = '15px';
                empty.style.textAlign = 'center';
                empty.style.fontSize = '12px';
                empty.style.color = '#9ca3af';
                contentContainer.appendChild(empty);
                return;
            }

            const renderList = validNodes.length > 300 ? validNodes.slice(0, 300) : validNodes;

            renderList.forEach(item => {
                const div = document.createElement('div');
                div.className = 'gpt-nav-item';
                
                const display = item.text.length > 60 ? item.text.slice(0, 30) + ' ... ' + item.text.slice(-30) : item.text;
                div.textContent = `${item.idx}. ${display}`;

                // 只有当文本长度超过 60（即被截断隐藏了）时，才添加 title 属性
                if (item.text.length > 60) {
                    div.title = item.text;
                }
                div.onclick = () => {
                    // 滚动到目标元素
                    item.msg.style.scrollMarginTop = '80px';
                    item.msg.scrollIntoView({ behavior: 'smooth', block: 'start' });
                    // 导航栏自身的点击闪烁反馈
                    div.classList.add('gpt-item-active');
                    setTimeout(() => div.classList.remove('gpt-item-active'), 500);
                    // 目标元素的背景高亮反馈
                    const target = item.msg.querySelector('[data-testid="message_text_content"]') || item.msg;
                    const oldTrans = target.style.transition;
                    const oldBg = target.style.backgroundColor;
                    target.style.transition = 'background-color 0.5s';
                    target.style.backgroundColor = 'rgba(59, 130, 246, 0.2)';
                    setTimeout(() => {
                        target.style.backgroundColor = oldBg;
                        setTimeout(() => target.style.transition = oldTrans, 500);
                    }, 1000);
                };
                contentContainer.appendChild(div);
            });
            
            // 仅在非搜索模式下自动滚到底部
            if (!searchTerm) {
                setTimeout(() => contentContainer.scrollTo({ top: contentContainer.scrollHeight, behavior: 'auto' }), 50);
            }
        };
    });

    // === 6. 观察器 ===
    let timer = null;
    const scheduleRefresh = (ms=DEBOUNCE_MS) => {
        if (timer) clearTimeout(timer);
        timer = setTimeout(() => {
            if (window._gptNavRefresh) {
                observer.disconnect();
                window._gptNavRefresh();
                observer.observe(OBSERVE_ROOT, { childList: true, subtree: true });
            }
        }, ms);
    };

    const observer = new MutationObserver(mutations => {
        let needsUpdate = false;
        for (const m of mutations) {
            let isInternal = false;
            for (const n of m.addedNodes) {
                if (n.nodeType===1 && n.closest && n.closest('[data-gpt-nav-ignore]')) { isInternal=true; break; }
            }
            if (!isInternal) { needsUpdate = true; break; }
        }
        if (needsUpdate) scheduleRefresh();
    });

    scheduleRefresh(500);
    observer.observe(OBSERVE_ROOT, { childList: true, subtree: true });

    document.addEventListener('keydown', e => {
        if (e.altKey && e.code === 'KeyQ') {
            const p = document.getElementById('gpt-nav-panel');
            if(p) p.style.display = p.style.display==='none'?'flex':'none';
        }
    });
})();
