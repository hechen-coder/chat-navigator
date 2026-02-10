// ==UserScript==
// @name         GPT 对话问题导航 (支持站点  chatgpt.com, gemini.google.com, 豆包, Kimi, DeepSeek, 千问)
// @namespace    http://tampermonkey.net/
// @version      2.6
// @description  UI升级：修复搜索复原逻辑、消除遮挡、完美交互体验
// @match        https://gemini.google.com/app/*
// @match        https://chatgpt.com/c/*
// @match        https://www.doubao.com/chat/*
// @match        https://www.kimi.com/chat/*
// @match        https://chat.deepseek.com/a/chat/s/*
// @match        https://www.qianwen.com/chat/*
// @grant        none
// @license      MIT
// @downloadURL  https://github.com/hechen-coder/chat-navigator/raw/main/ChatNavigator.user.js
// @updateURL    https://github.com/hechen-coder/chat-navigator/raw/main/ChatNavigator.user.js
// ==/UserScript==

(function () {
    'use strict';

    if (window.top !== window.self) return;

    // === 1. 站点配置 ===
    const SITE_CONFIGS = [
        { name: 'GPT', match: url => url.startsWith('https://chatgpt.com/c/'), selector: 'div.whitespace-pre-wrap' },
        { name: 'Gemini', match: url => { try { return new URL(url).host === 'gemini.google.com'; } catch(e){return false;} }, selector: 'div.query-text.gds-body-l' },
        { name: '豆包', match: url => url.startsWith('https://www.doubao.com/chat/'), selector: 'div[data-testid="send_message"]' },
        { name: 'Kimi', match: url => url.startsWith('https://www.kimi.com/chat/'), selector: 'div.user-content' },
        { name: 'DeepSeek', match: url => url.startsWith('https://chat.deepseek.com/a/chat/s/'), selector: 'div.fbb737a4' },
        { name: 'Qianwen', match: url => url.startsWith('https://www.qianwen.com/chat/'), selector: 'div.bubble-uo23is' }
    ];

    const site = SITE_CONFIGS.find(cfg => cfg.match(location.href));
    if (!site) return;

    const OBSERVE_ROOT = document.body;
    const DEBOUNCE_MS = 250;

    function waitForBody(cb) {
        document.body ? cb() : setTimeout(() => waitForBody(cb), 50);
    }

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
        `;
        document.head.appendChild(style);
    });

    // === 4. 构建 UI ===
    waitForBody(() => {
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

        btnGroup.appendChild(createBtn(ICONS.minimize, '折叠', () => toggleCollapsed(true)));
        btnGroup.appendChild(createBtn(ICONS.close, '关闭', () => panel.style.display = 'none'));

        header.appendChild(btnGroup);
        panel.appendChild(header);

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
            let nodes = [];
            try { nodes = Array.from(document.querySelectorAll(site.selector)); } catch(e){}

            // 1. 生成页面快照
            const currentSnapshot = nodes.length + ":" + nodes.map(n => {
                 const t = n.querySelector('[data-testid="message_text_content"]');
                 return (t ? t.textContent : (n.innerText||n.textContent)).trim();
            }).join('|');
            
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
                if (msg.closest('[data-gpt-nav-ignore]')) return null;
                const raw = msg.innerText || msg.textContent || '';
                const text = raw.trim();
                if(!text) return null;
                
                // 搜索过滤
                if (searchTerm && !text.toLowerCase().includes(searchTerm)) {
                    return null; 
                }
                return { msg, text, idx: idx + 1 };
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
                    item.msg.scrollIntoView({ behavior: 'smooth', block: 'center' });
                    div.classList.add('gpt-item-active');
                    setTimeout(() => div.classList.remove('gpt-item-active'), 500);
                    
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