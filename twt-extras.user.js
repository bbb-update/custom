// ==UserScript==
// @name         X - Custom Extras
// @namespace    x-custom-extras.personal
// @version      1.2.5
// @description  Personal X extras, direct post buttons, and profile cleanup
// @match        https://x.com/*
// @match        https://twitter.com/*
// @run-at       document-idle
// @grant        unsafeWindow
// @grant        GM_getValue
// @grant        GM_setValue
// @updateURL    https://raw.githubusercontent.com/bbb-update/custom/main/twt-extras.user.js
// @downloadURL  https://raw.githubusercontent.com/bbb-update/custom/main/twt-extras.user.js
// ==/UserScript==

(function () {
    'use strict';

    const SETTINGS_KEY = 'x-custom-extras-settings-v1';
    const DEFAULT_SETTINGS = {
        hideExtras: 'O',
        hideVerifiedBadge: 'O',
        showAnalytics: 'O',
        showLikes: 'O',
        showQuotes: 'O',
        showViewerPostButton: 'O',
        showOwnReactionCountsOnly: 'O',
        showFullLikeCounts: 'O',
        reactionCountExceptions: [],
        language: 'J',
        colorTheme: 5,
        hideFollowerCount: 'X',
        hideFollowerLink: 'X'
    };

    function normalizeSettings(value) {
        const source = value && typeof value === 'object' ? value : {};
        const result = Object.assign({}, DEFAULT_SETTINGS, source);
        for (const key of [
            'hideExtras', 'hideVerifiedBadge',
            'showAnalytics', 'showLikes', 'showQuotes',
            'showViewerPostButton',
            'showOwnReactionCountsOnly',
            'showFullLikeCounts',
            'hideFollowerCount', 'hideFollowerLink'
        ]) {
            result[key] = result[key] === 'X' ? 'X' : 'O';
        }
        result.language = ['J', 'E', 'K', 'SC', 'TC'].includes(
            result.language
        ) ? result.language : 'J';
        result.colorTheme = Math.min(6, Math.max(1,
            Number(result.colorTheme) || DEFAULT_SETTINGS.colorTheme));
        result.reactionCountExceptions = Array.isArray(
            source.reactionCountExceptions
        ) ? source.reactionCountExceptions.map(function (item) {
            const raw = typeof item === 'string'
                ? item
                : item && item.username;
            const username = String(raw || '')
                .trim().replace(/^@+/, '').toLowerCase();
            return {
                username,
                enabled: typeof item === 'string'
                    ? true
                    : Boolean(item && item.enabled !== false)
            };
        }).filter(function (item, index, array) {
            return item.username && array.findIndex(function (candidate) {
                return candidate.username === item.username;
            }) === index;
        }) : [];
        return result;
    }

    function loadSettings() {
        try {
            return normalizeSettings(GM_getValue(SETTINGS_KEY, DEFAULT_SETTINGS));
        } catch (e) {
            return normalizeSettings(DEFAULT_SETTINGS);
        }
    }

    function saveSettings(value = settings) {
        try {
            GM_setValue(SETTINGS_KEY, Object.assign({}, value));
        } catch (e) {}
    }

    let settings = loadSettings();

    function isMobileMode() {
        return /Android|Mobi|iPhone|iPad|iPod/i.test(
            navigator.userAgent
        ) || window.innerWidth <= 440;
    }

    // ============================================================

    const accentColors = {
        1: '#1d9bf0',
        2: '#ffd400',
        3: '#f91880',
        4: '#7856ff',
        5: '#ff7a00',
        6: '#00ba7c'
    };

    const pressedBrightness = {
        1: 1.25,
        2: 1.10,
        3: 1.80,
        4: 1.42,
        5: 1.38,
        6: 1.24
    };

    const analyticsIcon = {
        viewBox: '0 -960 960 960',
        path: 'M640-160v-280h160v280H640Zm-240 0v-640h160v640H400Zm-240 0v-440h160v440H160Z'
    };

    const quotesIcon = {
        viewBox: '0 -960 960 960',
        path: 'M320-60v-221q-101-8-170.5-82T80-540q0-109 75.5-184.5T340-800h27l-63-64 56-56 160 160-160 160-56-56 63-64h-27q-75 0-127.5 52.5T160-540q0 75 52.5 127.5T340-360h60v107l107-107h113q75 0 127.5-52.5T800-540q0-75-52.5-127.5T620-720h-20v-80h20q109 0 184.5 75.5T880-540q0 109-75.5 184.5T620-280h-80L320-60Z',
        offsetX: 0.3,
        offsetY: 0.3
    };

    const likesIcon = {
        viewBox: '0 -960 960 960',
        path: 'm480-120-58-52q-101-91-167-157T150-447.5Q111-500 95.5-544T80-634q0-94 63-157t157-63q52 0 99 22t81 62q34-40 81-62t99-22q94 0 157 63t63 157q0 46-15.5 90T810-447.5Q771-395 705-329T538-172l-58 52Zm0-108q96-86 158-147.5t98-107q36-45.5 50-81t14-70.5q0-60-40-100t-100-40q-47 0-87 26.5T518-680h-76q-15-41-55-67.5T300-774q-60 0-100 40t-40 100q0 35 14 70.5t50 81q36 45.5 98 107T480-228Zm0-273Z'
    };

    let History_push = null;
    let History_replace = null;
    let quotesOpenedByScript = false;
    let cachedMobileLoginUsername = '';
    let cachedMobileLoginUserId = '';
    let scrollAnchorSnapshot = null;
    let scrollRestoreToken = 0;
    let scrollRestoreActive = false;
    const quoteCountCache = new WeakMap();
    const likeCountCache = new WeakMap();
    const extraHidden = new Map();
    const followerHidden = new Map();
    const originalLikeMetricTexts = new Map();
    const originalPostLikeTexts = new Map();
    const viewerReplyHidden = new Map();
    const reactionCountHidden = new Map();

    function rememberAndHide(element, store) {
        if (!element) return;
        if (!store.has(element)) {
            store.set(element, {
                value: element.style.getPropertyValue('display'),
                priority: element.style.getPropertyPriority('display')
            });
        }
        element.style.setProperty('display', 'none', 'important');
    }

    function restoreHidden(store) {
        for (const [element, previous] of store) {
            if (previous.value) {
                element.style.setProperty('display', previous.value, previous.priority);
            } else {
                element.style.removeProperty('display');
            }
        }
        store.clear();
    }

    function getTopLevelProps() {
        const root = document.querySelector('#react-root');

        if (!root || !root.firstElementChild) {
            return null;
        }

        const element = root.firstElementChild;
        const reactPropsKey = Object.keys(element).find(
            key => key.indexOf('__reactProps') === 0
        );

        if (!reactPropsKey) {
            return null;
        }

        try {
            return element[reactPropsKey]
                .children.props.children.props || null;
        } catch (e) {
            return null;
        }
    }

    function tryFindHistory() {
        if (History_push && History_replace) {
            return true;
        }

        const props = getTopLevelProps();

        if (
            !props ||
            !props.history ||
            typeof props.history.push !== 'function'
        ) {
            return false;
        }

        History_push = props.history.push;
        History_replace = typeof props.history.replace === 'function'
            ? props.history.replace
            : null;
        return true;
    }

    function navigateWithXRouter(href, replace = false) {
        const url = document.createElement('a');
        url.href = href;

        if (/\/status\/\d+\/quotes\/?$/.test(url.pathname)) {
            quotesOpenedByScript = true;
        }

        if (tryFindHistory()) {
            try {
                if (replace && !History_replace) {
                    throw new Error('X router replace is unavailable');
                }
                const navigate = replace && History_replace
                    ? History_replace
                    : History_push;
                navigate({
                    pathname: url.pathname,
                    hash: url.hash,
                    query: {},
                    search: url.search
                });

                return;
            } catch (e) {}
        }

        if (replace) {
            location.replace(url.href);
        } else {
            location.href = url.href;
        }
    }

    function getCurrentRoute() {
        return location.pathname + location.search + location.hash;
    }

    function captureScrollAnchor(article) {
        if (!article) return;
        const postInfo = getPostInfo(article);
        if (!postInfo) return;

        scrollAnchorSnapshot = {
            sourceRoute: getCurrentRoute(),
            statusId: postInfo.statusId,
            viewportTop: article.getBoundingClientRect().top,
            scrollY: window.scrollY,
            leftSource: false,
            createdAt: Date.now()
        };
        scrollRestoreToken++;
        scrollRestoreActive = false;
    }

    function findScrollAnchorArticle(statusId) {
        for (const article of document.querySelectorAll('article')) {
            const postInfo = getPostInfo(article);
            if (postInfo && postInfo.statusId === statusId) return article;
        }
        return null;
    }

    function maybeRestoreScrollAnchor() {
        const snapshot = scrollAnchorSnapshot;
        if (!snapshot) return;

        if (Date.now() - snapshot.createdAt > 10 * 60 * 1000) {
            scrollAnchorSnapshot = null;
            return;
        }

        if (getCurrentRoute() !== snapshot.sourceRoute) {
            snapshot.leftSource = true;
            return;
        }
        if (!snapshot.leftSource || scrollRestoreActive) return;

        scrollRestoreActive = true;
        const token = ++scrollRestoreToken;
        const delays = [0, 50, 150, 300, 600, 1000];

        for (const delay of delays) {
            setTimeout(function () {
                if (
                    token !== scrollRestoreToken ||
                    !scrollAnchorSnapshot ||
                    getCurrentRoute() !== snapshot.sourceRoute
                ) {
                    return;
                }

                const article = findScrollAnchorArticle(snapshot.statusId);
                if (article) {
                    const delta =
                        article.getBoundingClientRect().top - snapshot.viewportTop;
                    if (Math.abs(delta) > 0.5) window.scrollBy(0, delta);
                } else if (delay === 0) {
                    window.scrollTo(0, snapshot.scrollY);
                }

                if (delay === delays[delays.length - 1]) {
                    scrollAnchorSnapshot = null;
                    scrollRestoreActive = false;
                }
            }, delay);
        }
    }

    for (const eventName of ['wheel', 'touchmove']) {
        window.addEventListener(eventName, function () {
            if (!scrollRestoreActive) return;
            scrollRestoreToken++;
            scrollAnchorSnapshot = null;
            scrollRestoreActive = false;
        }, {passive: true, capture: true});
    }

    document.addEventListener('click', function (event) {
        const target = event.target;
        if (!target || typeof target.closest !== 'function') return;
        const link = target.closest('a[href*="/status/"]');
        if (!link) return;

        let pathname = '';
        try {
            pathname = new URL(link.href, location.href).pathname;
        } catch (e) {
            return;
        }

        if (!/\/status\/\d+\/(?:photo\/\d+|video\/\d+|analytics|quotes|likes)\/?$/.test(pathname)) {
            return;
        }
        captureScrollAnchor(link.closest('article'));
    }, true);

    document.addEventListener(
        'click',
        function (event) {
            if (
                !quotesOpenedByScript ||
                !/\/status\/\d+\/quotes\/?$/.test(location.pathname)
            ) {
                return;
            }

            let backButton = null;
            let current = event.target;

            while (current && current.nodeType === 1) {
                if (current.tagName === 'BUTTON' &&
                    current.getAttribute('data-testid') === 'app-bar-back') {
                    backButton = current;
                    break;
                }
                current = current.parentElement;
            }

            if (!backButton) {
                return;
            }

            event.preventDefault();
            event.stopImmediatePropagation();

            quotesOpenedByScript = false;
            window.history.back();
        },
        true
    );

    window.addEventListener('popstate', function () {
        if (!/\/status\/\d+\/quotes\/?$/.test(location.pathname)) {
            quotesOpenedByScript = false;
        }
        setTimeout(maybeRestoreScrollAnchor, 0);
    });

    function isEnabled(value) {
        return String(value).toUpperCase() === 'O';
    }

    function getAccentColor() {
        return accentColors[settings.colorTheme] || accentColors[1];
    }

    function isLightTheme() {
        const color = getComputedStyle(document.body).backgroundColor;
        const match = color.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)/);

        if (!match) {
            return false;
        }

        const brightness =
            (Number(match[1]) * 299 +
             Number(match[2]) * 587 +
             Number(match[3]) * 114) / 1000;

        return brightness > 160;
    }

    function getBaseThemeColors() {
        return isLightTheme()
            ? {
                background: '#ffffff',
                border: '#dde5e9',
                text: '#536471'
            }
            : {
                background: '#0e1217',
                border: '#3f474e',
                text: '#71767b'
            };
    }

    function refreshButtonStyle(button) {
        const base = getBaseThemeColors();
        const active =
            button.dataset.hovered === 'true' ||
            button.dataset.pressed === 'true';

        button.style.background = active
            ? getAccentColor()
            : base.background;

        button.style.borderColor = active
            ? getAccentColor()
            : base.border;

        button.style.color = active
            ? (isLightTheme() ? '#0f1419' : '#e7e9ea')
            : base.text;

        button.style.filter =
            button.dataset.mobile !== 'true' &&
            button.dataset.pressed === 'true'
                ? `brightness(${pressedBrightness[settings.colorTheme] || 1.25})`
                : 'none';
    }

    function addButtonEffects(button) {
        button.dataset.hovered = 'false';
        button.dataset.pressed = 'false';

        button.addEventListener('mouseenter', function () {
            if (button.dataset.mobile === 'true') return;
            button.dataset.hovered = 'true';
            refreshButtonStyle(button);
        });

        button.addEventListener('mouseleave', function () {
            if (button.dataset.mobile === 'true') return;
            button.dataset.hovered = 'false';
            button.dataset.pressed = 'false';
            refreshButtonStyle(button);
        });

        button.addEventListener('mousedown', function () {
            if (button.dataset.mobile === 'true') return;
            button.dataset.pressed = 'true';
            refreshButtonStyle(button);
        });

        button.addEventListener('mouseup', function () {
            if (button.dataset.mobile === 'true') return;
            button.dataset.pressed = 'false';
            refreshButtonStyle(button);
        });

        button.addEventListener('touchstart', function () {
            button.dataset.pressed = 'true';
            refreshButtonStyle(button);
        });

        button.addEventListener('touchend', function () {
            setTimeout(function () {
                button.dataset.pressed = 'false';
                button.dataset.hovered = 'false';
                refreshButtonStyle(button);
            }, 120);
        });

        button.addEventListener('touchcancel', function () {
            button.dataset.pressed = 'false';
            button.dataset.hovered = 'false';
            refreshButtonStyle(button);
        });

        refreshButtonStyle(button);
    }

    function createSvgIcon(iconData) {
        const svg = document.createElementNS(
            'http://www.w3.org/2000/svg',
            'svg'
        );

        svg.setAttribute('viewBox', iconData.viewBox);
        svg.setAttribute('aria-hidden', 'true');
        svg.style.cssText = `
            width: 12px;
            height: 12px;
            display: block;
            fill: currentColor;
            transform: translate(
                ${iconData.offsetX || 0}px,
                ${iconData.offsetY || 0}px
            );
            pointer-events: none;
        `;

        const path = document.createElementNS(
            'http://www.w3.org/2000/svg',
            'path'
        );

        path.setAttribute('d', iconData.path);
        svg.appendChild(path);

        return svg;
    }

    function createShortcutLink(href, title, iconData) {
        const link = document.createElement('a');

        link.href = href;
        link.setAttribute('aria-label', title);
        link.className = 'x-tweet-direct-button';

        link.style.cssText = `
            width: 21px;
            height: 18px;
            padding: 0;

            border-style: solid;
            border-width: 1px;
            border-radius: 4px;

            display: flex;
            align-items: center;
            justify-content: center;

            text-decoration: none;
            cursor: pointer;
            box-sizing: border-box;

            transition:
                background-color 0.10s ease,
                border-color 0.10s ease,
                color 0.10s ease,
                filter 0.06s ease;
        `;

        link.appendChild(createSvgIcon(iconData));
        addButtonEffects(link);

        link.addEventListener('click', function (event) {
            if (
                event.button !== 0 ||
                event.ctrlKey ||
                event.shiftKey ||
                event.altKey ||
                event.metaKey
            ) {
                return;
            }

            event.preventDefault();
            event.stopPropagation();
            captureScrollAnchor(link.closest('article'));
            navigateWithXRouter(link.href);
        });

        return link;
    }

    function createMobileShortcutLink(href, label, iconData) {
        const link = createShortcutLink(href, label, iconData);
        link.dataset.mobile = 'true';
        link.dataset.hovered = 'false';
        link.dataset.pressed = 'false';
        link.style.width = '19px';
        link.style.height = '16px';
        link.style.webkitTapHighlightColor = 'transparent';
        link.style.transition = 'none';
        refreshButtonStyle(link);

        const svg = link.querySelector('svg');
        if (svg) {
            svg.style.width = '11px';
            svg.style.height = '11px';
        }
        return link;
    }

    function createViewerPostButton(label, onClick) {
        const button = document.createElement('button');
        button.type = 'button';
        button.setAttribute('aria-label', label);
        button.className = 'x-viewer-post-button';
        button.style.cssText = `
            width: 34px;
            height: 22px;
            padding: 0;
            border-style: solid;
            border-width: 1px;
            border-radius: 5px;
            font-size: 11px;
            font-weight: 600;
            line-height: 20px;
            text-align: center;
            white-space: nowrap;
            cursor: pointer;
            box-sizing: border-box;
            transition:
                background-color 0.10s ease,
                border-color 0.10s ease,
                color 0.10s ease,
                filter 0.06s ease;
        `;
        button.innerHTML =
            '<svg viewBox="0 -960 960 960" aria-hidden="true" ' +
            'style="width:14px;height:14px;display:block;fill:currentColor;pointer-events:none">' +
            '<path d="m296-224-56-56 240-240 240 240-56 56-184-183-184 183Zm0-240-56-56 240-240 240 240-56 56-184-183-184 183Z"/>' +
            '</svg>';
        button.style.display = 'flex';
        button.style.alignItems = 'center';
        button.style.justifyContent = 'center';
        addButtonEffects(button);
        button.addEventListener('click', function (event) {
            event.preventDefault();
            event.stopPropagation();
            onClick();
        });
        return button;
    }

    function getPostInfo(article) {
        const time = article.querySelector('a[href*="/status/"] time');
        let statusLink = time;

        while (statusLink && statusLink.nodeType === 1 &&
            statusLink.tagName !== 'A') {
            statusLink = statusLink.parentElement;
        }

        if (!statusLink) {
            return null;
        }

        let url;

        try {
            url = new URL(statusLink.href, location.origin);
        } catch (e) {
            return null;
        }

        const match = url.pathname.match(
            /^\/([^/]+)\/status\/(\d+)/
        );

        if (!match) {
            return null;
        }

        return {
            username: match[1],
            statusId: match[2],
            basePath: '/' + match[1] + '/status/' + match[2]
        };
    }

    function findQuoteCountInReactValue(rootValue, statusId) {
        const stack = [{ value: rootValue, depth: 0 }];
        const visited = new WeakSet();
        let checked = 0;

        while (stack.length && checked < 6000) {
            const item = stack.pop();
            const value = item.value;

            if (!value || typeof value !== 'object' ||
                item.depth > 14) {
                continue;
            }
            if (value.nodeType) {
                continue;
            }
            if (visited.has(value)) {
                continue;
            }

            visited.add(value);
            checked++;

            try {
                if (String(value.rest_id || '') === statusId &&
                    value.legacy &&
                    typeof value.legacy.quote_count === 'number') {
                    return value.legacy.quote_count;
                }

                if (String(value.id_str || '') === statusId &&
                    typeof value.quote_count === 'number') {
                    return value.quote_count;
                }
            } catch (e) {}

            let keys;
            try {
                keys = Object.keys(value);
            } catch (e) {
                continue;
            }

            for (let i = 0; i < keys.length; i++) {
                let child;
                try {
                    child = value[keys[i]];
                } catch (e) {
                    continue;
                }
                if (child && typeof child === 'object') {
                    stack.push({
                        value: child,
                        depth: item.depth + 1
                    });
                }
            }
        }

        return null;
    }

    function getQuoteCount(article, statusId) {
        const cached = quoteCountCache.get(article);
        const now = Date.now();

        if (cached && cached.statusId === statusId &&
            now - cached.checkedAt < (cached.count === null ? 5000 : 30000)) {
            return cached.count;
        }

        const elements = [article];
        for (const child of article.querySelectorAll('*')) {
            elements.push(child);
            if (elements.length >= 40) {
                break;
            }
        }

        for (const element of elements) {
            let keys;
            try {
                keys = Object.keys(element);
            } catch (e) {
                continue;
            }

            for (const key of keys) {
                if (key.indexOf('__reactProps') !== 0 &&
                    key.indexOf('__reactFiber') !== 0) {
                    continue;
                }

                const count = findQuoteCountInReactValue(
                    element[key],
                    statusId
                );
                if (count !== null) {
                    quoteCountCache.set(article, {
                        statusId,
                        count,
                        checkedAt: now
                    });
                    return count;
                }
            }
        }

        quoteCountCache.set(article, {
            statusId,
            count: null,
            checkedAt: now
        });
        return null;
    }

    function findLikeCountInReactValue(rootValue, statusId) {
        const stack = [{ value: rootValue, depth: 0 }];
        const visited = new WeakSet();
        let checked = 0;

        while (stack.length && checked < 6000) {
            const item = stack.pop();
            const value = item.value;

            if (!value || typeof value !== 'object' || item.depth > 14) continue;
            if (value.nodeType || visited.has(value)) continue;

            visited.add(value);
            checked++;

            try {
                if (String(value.rest_id || '') === statusId &&
                    value.legacy &&
                    typeof value.legacy.favorite_count === 'number') {
                    return value.legacy.favorite_count;
                }

                if (String(value.id_str || '') === statusId &&
                    typeof value.favorite_count === 'number') {
                    return value.favorite_count;
                }
            } catch (e) {}

            let keys;
            try {
                keys = Object.keys(value);
            } catch (e) {
                continue;
            }

            for (const key of keys) {
                let child;
                try {
                    child = value[key];
                } catch (e) {
                    continue;
                }
                if (child && typeof child === 'object') {
                    stack.push({ value: child, depth: item.depth + 1 });
                }
            }
        }

        return null;
    }

    function getLikeCount(article, statusId) {
        const cached = likeCountCache.get(article);
        const now = Date.now();

        if (cached && cached.statusId === statusId &&
            now - cached.checkedAt < (cached.count === null ? 5000 : 30000)) {
            return cached.count;
        }

        const elements = [article];
        for (const child of article.querySelectorAll('*')) {
            elements.push(child);
            if (elements.length >= 40) break;
        }

        for (const element of elements) {
            let keys;
            try {
                keys = Object.keys(element);
            } catch (e) {
                continue;
            }

            for (const key of keys) {
                if (key.indexOf('__reactProps') !== 0 &&
                    key.indexOf('__reactFiber') !== 0) {
                    continue;
                }

                const count = findLikeCountInReactValue(element[key], statusId);
                if (count !== null) {
                    likeCountCache.set(article, { statusId, count, checkedAt: now });
                    return count;
                }
            }
        }

        likeCountCache.set(article, { statusId, count: null, checkedAt: now });
        return null;
    }

    function getLoggedInUsername() {
        const profileLink = document.querySelector(
            'a[data-testid="AppTabBar_Profile_Link"][href]'
        );

        if (profileLink) {
            const match = profileLink.getAttribute('href').match(
                /^\/([A-Za-z0-9_]{1,15})\/?$/
            );

            if (match) {
                return match[1];
            }
        }

        const accountButton = document.querySelector(
            '[data-testid="SideNav_AccountSwitcher_Button"]'
        );

        const avatar = accountButton
            ? accountButton.querySelector(
                '[data-testid^="UserAvatar-Container-"]'
            )
            : null;

        if (avatar) {
            const username = (avatar.getAttribute('data-testid') || '')
                .replace('UserAvatar-Container-', '');

            if (/^[A-Za-z0-9_]{1,15}$/.test(username)) {
                return username;
            }
        }

        return null;
    }

    function findHeaderPlacement(article) {
        const userName = article.querySelector('[data-testid="User-Name"]');
        const caret = article.querySelector('button[data-testid="caret"]');

        if (!userName || !caret) {
            return null;
        }

        let host = userName;

        while (
            host &&
            host !== article &&
            !host.contains(caret)
        ) {
            host = host.parentElement;
        }

        if (!host || host === article) {
            return null;
        }

        const actionSection = Array.from(host.children).find(
            child => child.contains(caret)
        );

        const nameSection = Array.from(host.children).find(
            child => child.contains(userName)
        );

        if (
            !actionSection ||
            !nameSection ||
            actionSection === nameSection
        ) {
            return null;
        }

        return {
            host,
            actionSection,
            nameSection,
            belowAvatar: false
        };
    }

    function findAvatarPlacement(article) {
        const avatar = article.querySelector(
            '[data-testid="Tweet-User-Avatar"]'
        );

        if (!avatar || !avatar.parentElement) {
            return null;
        }

        return {
            host: avatar.parentElement,
            actionSection: null,
            belowAvatar: true
        };
    }

    function isInsideArticle(element) {
        let current = element;
        while (current && current.nodeType === 1) {
            if (current.tagName === 'ARTICLE') {
                return true;
            }
            current = current.parentElement;
        }
        return false;
    }

    function getAuthenticatedUserId() {
        const match = document.cookie.match(
            /(?:^|;\s*)twid=([^;]+)/
        );

        if (!match) return '';

        try {
            const decoded = decodeURIComponent(match[1]);
            const idMatch = decoded.match(/(?:^|\D)(\d{5,})(?:\D|$)/);
            return idMatch ? idMatch[1] : '';
        } catch (e) {
            return '';
        }
    }

    function findUsernameForUserId(userId) {
        if (!userId) return '';

        const roots = [];
        const topLevelProps = getTopLevelProps();
        if (topLevelProps) roots.push(topLevelProps);

        for (const avatar of document.querySelectorAll(
            '[data-testid^="UserAvatar-Container-"]'
        )) {
            if (isInsideArticle(avatar)) continue;

            let current = avatar;
            for (let level = 0; current && level < 5; level++) {
                for (const key of Object.keys(current)) {
                    if (key.indexOf('__reactProps') === 0 ||
                        key.indexOf('__reactFiber') === 0) {
                        roots.push(current[key]);
                    }
                }
                current = current.parentElement;
            }
        }

        const stack = roots.map(value => ({ value, depth: 0 }));
        const visited = new WeakSet();
        let checked = 0;

        while (stack.length && checked < 12000) {
            const item = stack.pop();
            const value = item.value;

            if (!value || typeof value !== 'object' ||
                value.nodeType || item.depth > 18 ||
                visited.has(value)) {
                continue;
            }

            visited.add(value);
            checked++;

            try {
                const candidateId = String(
                    value.rest_id || value.id_str || ''
                );
                const candidateName =
                    value.legacy && value.legacy.screen_name ||
                    value.screen_name || '';

                if (candidateId === userId &&
                    /^[A-Za-z0-9_]{1,15}$/.test(candidateName)) {
                    return candidateName;
                }
            } catch (e) {}

            let keys;
            try {
                keys = Object.keys(value);
            } catch (e) {
                continue;
            }

            for (const key of keys) {
                let child;
                try { child = value[key]; } catch (e) { continue; }
                if (child && typeof child === 'object') {
                    stack.push({
                        value: child,
                        depth: item.depth + 1
                    });
                }
            }
        }

        return '';
    }

    function detectMobileLoginUsername() {
        const userId = getAuthenticatedUserId();
        let username = getLoggedInUsername() || '';

        if (!username && userId) {
            username = findUsernameForUserId(userId);
        }

        if (!username && userId) {
            try {
                username = localStorage.getItem(
                    'x-analytics-login-username-' + userId
                ) || '';
            } catch (e) {}
        }

        if (!/^[A-Za-z0-9_]{1,15}$/.test(username)) {
            return null;
        }

        cachedMobileLoginUsername = username;
        cachedMobileLoginUserId = userId;

        if (userId) {
            try {
                localStorage.setItem(
                    'x-analytics-login-username-' + userId,
                    username
                );
            } catch (e) {}
        }

        return username;
    }

    function findMobileAvatarHost(article) {
        const avatar = article.querySelector(
            '[data-testid="Tweet-User-Avatar"]'
        );
        if (!avatar || !avatar.parentElement) {
            return null;
        }
        return avatar.parentElement.parentElement || avatar.parentElement;
    }

    function getThreadLineCenterX(article, host, avatarRect) {
        const elements = article.querySelectorAll('div');
        const hostRect = host.getBoundingClientRect();
        const avatarCenter = avatarRect.left + avatarRect.width / 2;
        let bestCenter = null;
        let bestDistance = 999;

        for (const element of elements) {
            const rect = element.getBoundingClientRect();
            if (rect.width < 1 || rect.width > 4 || rect.height < 12) {
                continue;
            }
            if (rect.top < avatarRect.bottom - 3) {
                continue;
            }

            const center = rect.left + rect.width / 2;
            const distance = Math.abs(center - avatarCenter);
            if (distance <= 6 && distance < bestDistance) {
                bestDistance = distance;
                bestCenter = center;
            }
        }

        return bestCenter === null
            ? null
            : bestCenter - hostRect.left;
    }

    function hideGrokButton(article) {
        let grokButton = null;

        for (const button of article.querySelectorAll('button[aria-label]')) {
            const label = button.getAttribute('aria-label') || '';

            if (label.toLowerCase().indexOf('grok') !== -1) {
                grokButton = button;
                break;
            }
        }

        if (!grokButton) {
            const grokSvg = article.querySelector(
                'button svg[viewBox="0 0 33 32"]'
            );

            let current = grokSvg;
            while (current && current !== article) {
                if (current.tagName === 'BUTTON') {
                    grokButton = current;
                    break;
                }
                current = current.parentElement;
            }
        }

        if (!grokButton) {
            return;
        }

        rememberAndHide(grokButton, extraHidden);
    }

    function getContainingArticle(element) {
        let current = element;
        while (current && current.nodeType === 1) {
            if (current.tagName === 'ARTICLE') {
                return current;
            }
            current = current.parentElement;
        }
        return null;
    }

    function findArticleButtonWrapper(article) {
        for (const wrapper of article.querySelectorAll(
            '.x-tweet-direct-buttons'
        )) {
            if (getContainingArticle(wrapper) === article) {
                return wrapper;
            }
        }
        return null;
    }

    function addMobileButtonsToArticle(article, postInfo) {
        const avatarHost = findMobileAvatarHost(article);
        const avatar = article.querySelector(
            '[data-testid="Tweet-User-Avatar"]'
        );

        if (!avatarHost || !avatar) {
            return;
        }

        const loggedInUsername = detectMobileLoginUsername();
        const isOwnPost =
            loggedInUsername &&
            loggedInUsername.toLowerCase() ===
                postInfo.username.toLowerCase();
        const showAnalytics =
            isEnabled(settings.showAnalytics) &&
            isOwnPost;
        const likeCount = getLikeCount(article, postInfo.statusId);
        const showLikes =
            isEnabled(settings.showLikes) &&
            isOwnPost &&
            likeCount !== 0;
        const quoteCount = getQuoteCount(article, postInfo.statusId);
        const showQuotes =
            isEnabled(settings.showQuotes) && quoteCount !== 0;
        const detailMatch = location.pathname.match(
            /^\/[^/]+\/status\/(\d+)\/?$/
        );
        const showQuotesInHeader =
            showQuotes &&
            detailMatch &&
            detailMatch[1] === postInfo.statusId;
        const showQuotesBelowAvatar =
            showQuotes && !showQuotesInHeader;

        const wrappers = Array.from(
            article.querySelectorAll('.x-tweet-direct-buttons')
        ).filter(wrapper =>
            getContainingArticle(wrapper) === article
        );

        for (const wrapper of wrappers) {
            if (!wrapper.dataset.mobileSlot) {
                wrapper.remove();
            }
        }

        const findSlot = slot =>
            Array.from(article.querySelectorAll(
                `.x-tweet-direct-buttons[data-mobile-slot="${slot}"]`
            )).find(wrapper =>
                getContainingArticle(wrapper) === article
            ) || null;

        const quoteSignature = [
            postInfo.statusId,
            showQuotesBelowAvatar ? 'quotes' : ''
        ].join('|');

        let quoteWrapper = findSlot('quotes');

        if (!showQuotesBelowAvatar) {
            if (quoteWrapper) quoteWrapper.remove();
        } else if (
            !quoteWrapper ||
            quoteWrapper.parentElement !== avatarHost ||
            quoteWrapper.dataset.signature !== quoteSignature
        ) {
            if (quoteWrapper) quoteWrapper.remove();

            const avatarRect = avatar.getBoundingClientRect();
            const hostRect = avatarHost.getBoundingClientRect();
            let centerX =
                avatarRect.left - hostRect.left + avatarRect.width / 2;
            const threadLineCenterX = getThreadLineCenterX(
                article,
                avatarHost,
                avatarRect
            );

            if (threadLineCenterX !== null) {
                centerX = threadLineCenterX;
            }

            quoteWrapper = document.createElement('div');
            quoteWrapper.className = 'x-tweet-direct-buttons';
            quoteWrapper.dataset.mobileSlot = 'quotes';
            quoteWrapper.dataset.signature = quoteSignature;
            quoteWrapper.dataset.statusId = postInfo.statusId;
            quoteWrapper.dataset.belowAvatar = 'true';
            quoteWrapper.style.cssText = `
                display: flex;
                align-items: center;
                justify-content: center;
                position: absolute;
                left: ${centerX}px;
                top: 45px;
                transform: translateX(-50%);
                z-index: 2;
                box-sizing: border-box;
            `;

            if (getComputedStyle(avatarHost).position === 'static') {
                avatarHost.style.position = 'relative';
            }

            quoteWrapper.appendChild(createMobileShortcutLink(
                postInfo.basePath + '/quotes',
                'Quotes',
                quotesIcon
            ));

            avatarHost.appendChild(quoteWrapper);
        }

        const headerSignature = [
            postInfo.statusId,
            showQuotesInHeader ? 'quotes' : '',
            showLikes ? 'likes' : '',
            showAnalytics ? 'analytics' : ''
        ].join('|');

        let headerWrapper = findSlot('header');

        if (!showQuotesInHeader && !showLikes && !showAnalytics) {
            if (headerWrapper) headerWrapper.remove();
            return;
        }

        const placement = findHeaderPlacement(article);
        if (!placement) {
            if (headerWrapper) headerWrapper.remove();
            return;
        }

        if (
            headerWrapper &&
            headerWrapper.parentElement === placement.host &&
            headerWrapper.dataset.signature === headerSignature
        ) {
            return;
        }

        if (headerWrapper) headerWrapper.remove();

        placement.host.style.flexWrap = 'nowrap';
        placement.nameSection.style.minWidth = '0';
        placement.nameSection.style.flex = '1 1 0';
        placement.nameSection.style.overflow = 'hidden';
        placement.actionSection.style.flex = '0 0 auto';

        const userName = placement.nameSection.querySelector(
            '[data-testid="User-Name"]'
        );
        if (userName) {
            userName.style.whiteSpace = 'nowrap';
            userName.style.overflow = 'hidden';
            userName.style.maxWidth = '100%';
        }

        headerWrapper = document.createElement('div');
        headerWrapper.className = 'x-tweet-direct-buttons';
        headerWrapper.dataset.mobileSlot = 'header';
        headerWrapper.dataset.signature = headerSignature;
        headerWrapper.dataset.statusId = postInfo.statusId;
        headerWrapper.dataset.belowAvatar = 'false';
        headerWrapper.style.cssText = `
            margin-left: auto;
            margin-right: -10px;
            flex: 0 0 auto;
            display: flex;
            align-items: center;
            justify-content: flex-end;
            gap: 2px;
            position: relative;
            z-index: 3;
        `;

        if (showQuotesInHeader) {
            headerWrapper.appendChild(createMobileShortcutLink(
                postInfo.basePath + '/quotes',
                'Quotes',
                quotesIcon
            ));
        }

        if (showLikes) {
            headerWrapper.appendChild(createMobileShortcutLink(
                postInfo.basePath + '/likes',
                'Likes',
                likesIcon
            ));
        }

        if (showAnalytics) {
            headerWrapper.appendChild(createMobileShortcutLink(
                postInfo.basePath + '/analytics',
                'Analytics',
                analyticsIcon
            ));
        }

        placement.host.insertBefore(
            headerWrapper,
            placement.actionSection
        );
    }

    function addButtonsToArticle(article) {
        if (isEnabled(settings.hideExtras)) {
            hideGrokButton(article);
        }

        if (
            !isEnabled(settings.showAnalytics) &&
            !isEnabled(settings.showQuotes) &&
            !isEnabled(settings.showLikes)
        ) {
            const existing = findArticleButtonWrapper(article);
            if (existing) existing.remove();
            return;
        }

        const postInfo = getPostInfo(article);

        if (!postInfo) {
            return;
        }

        const mobileMode = isMobileMode();

        if (mobileMode) {
            addMobileButtonsToArticle(article, postInfo);
            return;
        }

        for (const mobileWrapper of article.querySelectorAll(
            '.x-tweet-direct-buttons[data-mobile-slot]'
        )) {
            if (getContainingArticle(mobileWrapper) === article) {
                mobileWrapper.remove();
            }
        }

        const placement =
            findHeaderPlacement(article) ||
            findAvatarPlacement(article);

        if (!placement) {
            return;
        }

        const loggedInUsername = getLoggedInUsername();

        const showAnalyticsForThisPost =
            isEnabled(settings.showAnalytics) &&
            loggedInUsername &&
            loggedInUsername.toLowerCase() ===
                postInfo.username.toLowerCase();
        const likeCount = getLikeCount(article, postInfo.statusId);
        const showLikesForThisPost =
            isEnabled(settings.showLikes) &&
            loggedInUsername &&
            loggedInUsername.toLowerCase() ===
                postInfo.username.toLowerCase() &&
            likeCount !== 0;
        const quoteCount = getQuoteCount(article, postInfo.statusId);
        const showQuotesForThisPost =
            isEnabled(settings.showQuotes) && quoteCount !== 0;

        const buttonSignature = [
            postInfo.statusId,
            showAnalyticsForThisPost ? 'analytics' : '',
            showLikesForThisPost ? 'likes' : '',
            showQuotesForThisPost ? 'quotes' : ''
        ].join('|');

        const existing = findArticleButtonWrapper(article);

        if (existing) {
            if (
                existing.parentElement === placement.host &&
                existing.dataset.signature === buttonSignature &&
                existing.dataset.belowAvatar ===
                    String(placement.belowAvatar)
            ) {
                return;
            }

            existing.remove();
        }

        const wrapper = document.createElement('div');
        wrapper.className = 'x-tweet-direct-buttons';
        wrapper.dataset.statusId = postInfo.statusId;
        wrapper.dataset.signature = buttonSignature;
        wrapper.dataset.belowAvatar = String(placement.belowAvatar);

        wrapper.style.cssText = placement.belowAvatar
            ? `
                margin-top: 4px;
                flex: 0 0 auto;

                display: flex;
                align-items: center;
                justify-content: center;
                align-self: center;
                gap: 2px;

                width: max-content;
                position: relative;
                left: 50%;
                transform: translateX(-50%);
            `
            : `
                margin-left: auto;
                margin-right: -8px;
                flex: 0 0 auto;

                display: flex;
                align-items: center;
                justify-content: flex-end;
                gap: 2px;
            `;

        if (showQuotesForThisPost) {
            wrapper.appendChild(
                createShortcutLink(
                    postInfo.basePath + '/quotes',
                    'Quotes',
                    quotesIcon
                )
            );
        }

        if (showLikesForThisPost) {
            wrapper.appendChild(
                createShortcutLink(
                    postInfo.basePath + '/likes',
                    'Likes',
                    likesIcon
                )
            );
        }

        if (showAnalyticsForThisPost) {
            wrapper.appendChild(
                createShortcutLink(
                    postInfo.basePath + '/analytics',
                    'Analytics',
                    analyticsIcon
                )
            );
        }

        if (!wrapper.childElementCount) {
            return;
        }

        if (placement.belowAvatar) {
            placement.host.appendChild(wrapper);
        } else {
            placement.host.insertBefore(
                wrapper,
                placement.actionSection
            );
        }
    }

    function isProfilePage() {
        const match = location.pathname.match(
            /^\/([^/]+)(?:\/(?:all|with_replies|reposts|highlights|media))?\/?$/
        );
        if (!match) return false;
        return !new Set([
            'home', 'explore', 'notifications', 'messages', 'compose',
            'search', 'settings', 'i', 'jobs', 'communities'
        ]).has(match[1].toLowerCase());
    }

    function applyMiscVisibility() {
        if (!isEnabled(settings.hideExtras)) {
            restoreHidden(extraHidden);
            return;
        }

        for (const element of Array.from(extraHidden.keys())) {
            if (!element.isConnected) extraHidden.delete(element);
        }

        for (const article of document.querySelectorAll('article')) {
            hideGrokButton(article);
        }

        if (isEnabled(settings.hideVerifiedBadge)) {
            for (const badge of document.querySelectorAll(
                'svg[data-testid="icon-verified"]'
            )) {
                rememberAndHide(badge, extraHidden);
            }
        }

        for (const link of document.querySelectorAll('a[href="/i/premium_sign_up"]')) {
            let target = link;
            for (let i = 0; i < 3 && target.parentElement; i++) {
                const parent = target.parentElement;
                const rect = parent.getBoundingClientRect();
                if (rect.width > 0 && rect.width < 300 &&
                    rect.height > 0 && rect.height < 100) {
                    target = parent;
                } else break;
            }
            rememberAndHide(target, extraHidden);
        }

        if (!isProfilePage()) return;

        const cells = Array.from(document.querySelectorAll(
            '[data-testid="cellInnerDiv"]'));
        for (let i = 0; i < cells.length; i++) {
            if (!cells[i].querySelector('a[href^="/i/connect_people?user_id="]')) continue;
            let first = i;
            let users = 0;
            for (let j = i - 1; j >= 0; j--) {
                if (cells[j].querySelector('[data-testid="UserCell"]')) {
                    first = j;
                    users++;
                } else break;
            }
            if (users < 2) continue;
            let start = first;
            if (first > 0 && cells[first - 1].querySelector('h2')) start = first - 1;
            for (let j = start; j <= i; j++) rememberAndHide(cells[j], extraHidden);
            const next = cells[i + 1];
            if (next && !next.querySelector(
                '[data-testid="UserCell"], article[data-testid="tweet"], a[href*="/status/"]')) {
                rememberAndHide(next, extraHidden);
            }
        }

        for (const aside of document.querySelectorAll('aside[role="complementary"]')) {
            const heading = aside.querySelector('h2[role="heading"]');
            const list = aside.querySelector('ul[role="list"]');
            if (heading && list && heading.querySelector('button[role="button"]') &&
                list.querySelectorAll('[data-testid="UserCell"]').length >= 2) {
                rememberAndHide(aside, extraHidden);
            }
        }

        for (const separator of document.querySelectorAll(
            'main [data-testid="primaryColumn"] div.r-1adg3ll.r-1ny4l3l > ' +
            'div.r-l00any.r-109y4c4.r-gu4em3')) {
            rememberAndHide(separator.parentElement, extraHidden);
        }
    }

    function applyFollowerVisibility() {
        if (!isEnabled(settings.hideFollowerCount)) {
            restoreHidden(followerHidden);
            return;
        }

        for (const element of Array.from(followerHidden.keys())) {
            if (!element.isConnected) followerHidden.delete(element);
        }

        // ============================================================
        if (!isProfilePage()) return;

        for (const anchor of document.querySelectorAll('a[href*="/verified_followers"]')) {
            let pathname = '';
            try { pathname = new URL(anchor.href, location.href).pathname; } catch (e) {}
            if (!/^\/[^/]+\/verified_followers\/?$/.test(pathname)) continue;

            if (isEnabled(settings.hideFollowerLink)) {
                rememberAndHide(anchor.parentElement || anchor, followerHidden);
            } else {
                const number = anchor.firstElementChild;
                if (number) rememberAndHide(number, followerHidden);
            }
        }
    }

    function restoreLikeMetricTexts() {
        for (const [span, originalText] of originalLikeMetricTexts) {
            if (span.isConnected) span.textContent = originalText;
        }
        originalLikeMetricTexts.clear();
    }

    function applyFullLikeCounts() {
        if (!isEnabled(settings.showFullLikeCounts)) {
            restoreLikeMetricTexts();
            return;
        }

        for (const card of document.querySelectorAll('div[aria-label]')) {
            const heartPath = Array.from(card.querySelectorAll('svg path')).find(
                path => (path.getAttribute('d') || '').startsWith('M16.697 5.5c-1.222')
            );
            if (!heartPath) continue;

            const label = card.getAttribute('aria-label') || '';
            const numberMatch = label.match(/[0-9][0-9,\.\s\u00a0]*/);
            if (!numberMatch) continue;

            const digits = numberMatch[0].replace(/\D/g, '');
            if (!digits) continue;

            const visibleArea = card.querySelector(':scope > div[aria-hidden="true"]');
            if (!visibleArea) continue;
            const spans = visibleArea.querySelectorAll('span');
            const valueSpan = spans[spans.length - 1];
            if (!valueSpan) continue;

            if (!originalLikeMetricTexts.has(valueSpan)) {
                originalLikeMetricTexts.set(valueSpan, valueSpan.textContent);
            }
            valueSpan.textContent = digits.replace(/\B(?=(\d{3})+(?!\d))/g, ',');
        }

        for (const span of Array.from(originalLikeMetricTexts.keys())) {
            if (!span.isConnected) originalLikeMetricTexts.delete(span);
        }
    }

    function restorePostLikeTexts() {
        for (const [span, state] of originalPostLikeTexts) {
            if (span.isConnected) span.textContent = state.original;
        }
        originalPostLikeTexts.clear();
    }

    function formatPostLikeCount(count, originalText) {
        if (count < 1000) return originalText;

        if (count < 10000) {
            return String(count).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
        }

        if (/[万萬만]/.test(originalText)) {
            return (Math.floor(count / 100) / 100).toFixed(2) +
                originalText.match(/[万萬만]/)[0];
        }

        if (/k/i.test(originalText)) {
            return (Math.floor(count / 100) / 10).toFixed(1) +
                originalText.match(/k/i)[0];
        }

        if (/m/i.test(originalText)) {
            return (Math.floor(count / 100) / 10000).toFixed(4) +
                originalText.match(/m/i)[0];
        }

        return originalText;
    }

    function applyDetailedPostLikeCounts() {
        if (!isEnabled(settings.showFullLikeCounts)) {
            restorePostLikeTexts();
            return;
        }

        for (const button of document.querySelectorAll(
            'button[data-testid="like"][aria-label], ' +
            'button[data-testid="unlike"][aria-label], ' +
            'button[data-testid="retweet"][aria-label], ' +
            'button[data-testid="unretweet"][aria-label]'
        )) {
            const label = button.getAttribute('aria-label') || '';
            const numberMatch = label.match(/[0-9][0-9,\.\s\u00a0]*/);
            if (!numberMatch) continue;

            const digits = numberMatch[0].replace(/\D/g, '');
            const count = Number(digits);
            if (!Number.isFinite(count)) continue;

            const transition = button.querySelector(
                '[data-testid="app-text-transition-container"]'
            );
            if (!transition) continue;
            const spans = transition.querySelectorAll('span');
            const valueSpan = spans[spans.length - 1];
            if (!valueSpan) continue;

            if (count < 1000) {
                const previous = originalPostLikeTexts.get(valueSpan);
                if (previous && valueSpan.textContent === previous.rendered) {
                    valueSpan.textContent = previous.original;
                }
                originalPostLikeTexts.delete(valueSpan);
                continue;
            }

            let state = originalPostLikeTexts.get(valueSpan);
            if (!state) {
                state = { original: valueSpan.textContent, rendered: '' };
                originalPostLikeTexts.set(valueSpan, state);
            } else if (valueSpan.textContent !== state.rendered) {
                state.original = valueSpan.textContent;
            }

            const rendered = formatPostLikeCount(count, state.original);
            state.rendered = rendered;
            valueSpan.textContent = rendered;
        }

        for (const span of Array.from(originalPostLikeTexts.keys())) {
            if (!span.isConnected) originalPostLikeTexts.delete(span);
        }
    }

    function removeViewerPostButtons() {
        for (const wrapper of document.querySelectorAll(
            '.x-viewer-post-button-wrapper'
        )) {
            wrapper.remove();
        }
        restoreHidden(viewerReplyHidden);
    }

    function getMediaViewerContext() {
        const mediaMatch = location.pathname.match(
            /^\/([^/]+)\/status\/(\d+)\/(?:photo|video)\/\d+\/?$/
        );
        if (!mediaMatch) return null;

        const groups = Array.from(document.querySelectorAll('[role="group"]'))
            .filter(function (group) {
                if (group.closest('article')) return false;
                return Boolean(group.querySelector(
                    'button[data-testid="retweet"], ' +
                    'button[data-testid="unretweet"], ' +
                    'button[data-testid="like"], ' +
                    'button[data-testid="unlike"]'
                ));
            });

        return {
            username: mediaMatch[1],
            postPath: '/' + mediaMatch[1] + '/status/' + mediaMatch[2],
            groups
        };
    }

    function ensureViewerPostButton() {
        const viewer = getMediaViewerContext();

        if (!isEnabled(settings.showViewerPostButton) || !viewer) {
            removeViewerPostButtons();
            return;
        }

        const actionText = getSettingsText().viewerPostAction;
        let foundViewerToolbar = false;

        for (const group of viewer.groups) {
            foundViewerToolbar = true;
            const replyButton = group.querySelector(
                'button[data-testid="reply"]'
            );
            const replyCell = replyButton && replyButton.parentElement;
            if (replyCell && group.contains(replyCell)) {
                rememberAndHide(replyCell, viewerReplyHidden);
            }

            let wrapper = group.querySelector(
                ':scope > .x-viewer-post-button-wrapper'
            );
            if (wrapper && wrapper.tagName !== 'SPAN') {
                wrapper.remove();
                wrapper = null;
            }
            if (!wrapper) {

        // ============================================================

                wrapper = document.createElement('span');
                wrapper.className = 'x-viewer-post-button-wrapper';
                wrapper.style.cssText = `
                    flex: 1 1 0;
                    min-width: 34px;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    box-sizing: border-box;
                `;
                wrapper.appendChild(createViewerPostButton(
                    actionText,
                    function () {
                        navigateWithXRouter(viewer.postPath, true);
                    }
                ));
            }

        // ============================================================

            const firstVisibleReaction = group.querySelector(
                'button[data-testid="retweet"], ' +
                'button[data-testid="unretweet"], ' +
                'button[data-testid="like"], ' +
                'button[data-testid="unlike"]'
            );
            const firstVisibleCell = firstVisibleReaction &&
                firstVisibleReaction.parentElement;
            if (firstVisibleCell && firstVisibleCell.parentElement === group) {
                if (wrapper.nextElementSibling !== firstVisibleCell) {
                    group.insertBefore(wrapper, firstVisibleCell);
                }
            } else if (group.firstElementChild !== wrapper) {
                group.insertBefore(wrapper, group.firstElementChild);
            }
        }

        if (!foundViewerToolbar) {
            for (const element of Array.from(viewerReplyHidden.keys())) {
                if (!element.isConnected) viewerReplyHidden.delete(element);
            }
        }
    }

    function restoreReactionCount(element) {
        const previous = reactionCountHidden.get(element);
        if (!previous) return;
        if (previous.value) {
            element.style.setProperty(
                'display', previous.value, previous.priority
            );
        } else {
            element.style.removeProperty('display');
        }
        reactionCountHidden.delete(element);
    }

    function canShowReactionCounts(username, loggedInUsername) {
        const normalized = String(username || '').toLowerCase();
        if (normalized === String(loggedInUsername || '').toLowerCase()) {
            return true;
        }
        return settings.reactionCountExceptions.some(function (item) {
            return item.enabled && item.username === normalized;
        });
    }

    function applyOwnReactionCountVisibility() {
        if (!isEnabled(settings.showOwnReactionCountsOnly)) {
            restoreHidden(reactionCountHidden);
            return;
        }

        for (const element of Array.from(reactionCountHidden.keys())) {
            if (!element.isConnected) reactionCountHidden.delete(element);
        }

        const loggedInUsername = detectMobileLoginUsername();
        if (!loggedInUsername) {
            restoreHidden(reactionCountHidden);
            return;
        }

        for (const article of document.querySelectorAll('article')) {
            const postInfo = getPostInfo(article);
            if (!postInfo) continue;

            const isOwnPost = canShowReactionCounts(
                postInfo.username,
                loggedInUsername
            );

            for (const button of article.querySelectorAll(
                'button[data-testid="reply"], ' +
                'button[data-testid="retweet"], ' +
                'button[data-testid="unretweet"], ' +
                'button[data-testid="like"], ' +
                'button[data-testid="unlike"]'
            )) {
                const count = button.querySelector(
                    '[data-testid="app-text-transition-container"]'
                );
                if (!count) continue;

                if (isOwnPost) {
                    restoreReactionCount(count);
                } else {
                    rememberAndHide(count, reactionCountHidden);
                }
            }
        }

        const viewer = getMediaViewerContext();
        if (viewer) {
            const isOwnViewerPost = canShowReactionCounts(
                viewer.username,
                loggedInUsername
            );

            for (const group of viewer.groups) {
                for (const button of group.querySelectorAll(
                    'button[data-testid="reply"], ' +
                    'button[data-testid="retweet"], ' +
                    'button[data-testid="unretweet"], ' +
                    'button[data-testid="like"], ' +
                    'button[data-testid="unlike"]'
                )) {
                    const count = button.querySelector(
                        '[data-testid="app-text-transition-container"]'
                    );
                    if (!count) continue;

                    if (isOwnViewerPost) {
                        restoreReactionCount(count);
                    } else {
                        rememberAndHide(count, reactionCountHidden);
                    }
                }
            }
        }
    }

    function getSettingsText() {
        const texts = {
            J: {
                hideExtras: '雑多な要素を非表示',
                hideVerifiedBadge: '└ 認証バッジを非表示',
                showAnalytics: '分析表示 ボタン（自分）',
                showLikes: 'いいね一覧 ボタン（自分）',
                showQuotes: '引用一覧 ボタン',
                showViewerPostButton: 'メディアビューアー閉じる ボタン',
                viewerPostAction: 'メディアビューアーを閉じる',
                showOwnReactionCountsOnly: '自分のポストのみ反応数を表示',
                reactionCountExceptions: '└ 非表示対象外アカウント',
                register: '登録',
                exceptionTitle: '対象外アカウント',
                accountId: 'アカウントID',
                showFullLikeCounts: '分析：いいね数を全桁表示',
                hideFollowerCount: 'フォロワー数を非表示',
                hideFollowerLink: '└ 一覧リンクも非表示',
                language: '表示言語',
                color: 'カラー',
                cancel: 'キャンセル',
                save: '保存'
            },
            E: {
                hideExtras: 'Hide miscellaneous elements',
                hideVerifiedBadge: '└ Hide verification badges',
                showAnalytics: 'Analytics button (own posts)',
                showLikes: 'Likes list button (own posts)',
                showQuotes: 'Quotes list button',
                showViewerPostButton: 'Close media viewer button',
                viewerPostAction: 'Close media viewer',
                showOwnReactionCountsOnly: 'Show own-post reaction counts',
                reactionCountExceptions: '└ Account exceptions',
                register: 'Add',
                exceptionTitle: 'Accounts with counts',
                accountId: 'Account ID',
                showFullLikeCounts: 'Analytics: Show full like count',
                hideFollowerCount: 'Hide follower count',
                hideFollowerLink: '└ Hide follower list link too',
                language: 'Language',
                color: 'Color',
                cancel: 'Cancel',
                save: 'Save'
            },
            K: {
                hideExtras: '잡다 요소 비표시',
                hideVerifiedBadge: '└ 인증 배지 비표시',
                showAnalytics: '통계 표시 버튼 (본인만)',
                showLikes: '좋아요 목록 버튼 (본인만)',
                showQuotes: '인용 목록 버튼',
                showViewerPostButton: '미디어 뷰어 닫기 버튼',
                viewerPostAction: '미디어 뷰어 닫기',
                showOwnReactionCountsOnly: '본인 글에만 반응 수치 표시',
                reactionCountExceptions: '└ 비표시 예외 계정',
                register: '등록',
                exceptionTitle: '예외 계정 등록',
                accountId: '계정 ID',
                showFullLikeCounts: '통계 : 좋아요 전체 수치 표시',
                hideFollowerCount: '팔로워 숫자 비표시',
                hideFollowerLink: '└ 목록 링크도 비표시',
                language: '표시 언어',
                color: '컬러',
                cancel: '취소',
                save: '저장'
            },
            SC: {
                hideExtras: '隐藏杂项',
                hideVerifiedBadge: '└ 隐藏认证徽章',
                showAnalytics: '数据分析按钮（仅自己）',
                showLikes: '点赞列表按钮（仅自己）',
                showQuotes: '引用列表按钮',
                showViewerPostButton: '关闭媒体查看器按钮',
                viewerPostAction: '关闭媒体查看器',
                showOwnReactionCountsOnly: '仅在自己的帖子显示互动数',
                reactionCountExceptions: '└ 不隐藏的例外账号',
                register: '添加',
                exceptionTitle: '例外账号',
                accountId: '账号 ID',
                showFullLikeCounts: '数据分析：显示完整点赞数',
                hideFollowerCount: '隐藏粉丝数',
                hideFollowerLink: '└ 同时隐藏列表链接',
                language: '显示语言',
                color: '颜色',
                cancel: '取消',
                save: '保存'
            },
            TC: {
                hideExtras: '隱藏雜項',
                hideVerifiedBadge: '└ 隱藏認證徽章',
                showAnalytics: '數據分析按鈕（僅自己）',
                showLikes: '按讚列表按鈕（僅自己）',
                showQuotes: '引用列表按鈕',
                showViewerPostButton: '關閉媒體檢視器按鈕',
                viewerPostAction: '關閉媒體檢視器',
                showOwnReactionCountsOnly: '僅在自己的貼文顯示互動數',
                reactionCountExceptions: '└ 不隱藏的例外帳號',
                register: '新增',
                exceptionTitle: '例外帳號',
                accountId: '帳號 ID',
                showFullLikeCounts: '數據分析：顯示完整按讚數',
                hideFollowerCount: '隱藏追蹤者人數',
                hideFollowerLink: '└ 同時隱藏列表連結',
                language: '顯示語言',
                color: '顏色',
                cancel: '取消',
                save: '儲存'
            }
        };

        return texts[settings.language] || texts.J;
    }

    let settingsPreview = null;

    function closeSettingsPopup(commit = false) {
        const popup = document.querySelector('.x-extras-settings-popup');
        if (popup) popup.remove();
        const exceptionPopup = document.querySelector(
            '.x-extras-exception-popup'
        );
        if (exceptionPopup) exceptionPopup.remove();
        if (!commit && settingsPreview) {
            settings.showOwnReactionCountsOnly =
                settingsPreview.showOwnReactionCountsOnly;
            settings.showFullLikeCounts =
                settingsPreview.showFullLikeCounts;
            scanArticles();
        }
        settingsPreview = null;
    }

    function positionSettingsPopup(popup, button) {
        const width = 260;
        const mobilePopupMode = isMobileMode();
        const fixedTop = mobilePopupMode ? 28 : 10;
        let preferredTop = 10;
        let right = 10;
        let buttonRect = null;

        if (button) {
            buttonRect = button.getBoundingClientRect();
            preferredTop = buttonRect.top;
            right = Math.max(
                0,
                document.documentElement.clientWidth -
                buttonRect.right
            );
        }

        popup.style.width = `${width}px`;
        if (mobilePopupMode) {
            popup.style.maxWidth = 'calc(100vw - 20px)';
        }

        const popupRect = popup.getBoundingClientRect();

        if (buttonRect && !mobilePopupMode) {
            let left =
                buttonRect.right - popupRect.width;

            const wrapper = button.closest(
                '.x-custom-extras-settings-wrapper'
            );
            const profileHeader =
                wrapper && wrapper.parentElement;

            if (profileHeader) {
                const headerRect =
                    profileHeader.getBoundingClientRect();

                left = Math.max(
                    headerRect.left,
                    Math.min(
                        left,
                        headerRect.right - popupRect.width
                    )
                );
            }

            popup.style.left =
                `${Math.round(left)}px`;
            popup.style.right = 'auto';
        }

        const hasEnoughVerticalSpace =
            preferredTop + popupRect.height <= window.innerHeight - 10;

        const top = hasEnoughVerticalSpace ? preferredTop : fixedTop;

        if (!hasEnoughVerticalSpace) {
            popup.style.maxHeight =
                `calc(100dvh - ${fixedTop + 10}px)`;
            popup.style.overflowY = 'auto';
            popup.style.overscrollBehavior = 'contain';

        }

        popup.style.top = `${Math.round(top)}px`;

        if (!buttonRect || mobilePopupMode) {
            popup.style.right = `${right}px`;
        }
    }

    function openExceptionAccountsPopup() {
        const old = document.querySelector('.x-extras-exception-popup');
        if (old) old.remove();

        const base = getBaseThemeColors();
        const text = getSettingsText();
        const draft = settings.reactionCountExceptions.map(function (item) {
            return Object.assign({}, item);
        });
        const popup = document.createElement('div');
        popup.className = 'x-extras-exception-popup';
        popup.addEventListener('click', function (event) {
            event.stopPropagation();
        });
        popup.style.cssText = `position:fixed;z-index:2147483647;left:50%;top:50%;` +
            `transform:translate(-50%,-50%);width:240px;max-width:calc(100vw - 24px);` +
            `max-height:calc(100dvh - 24px);overflow-y:auto;padding:14px;` +
            `border:1px solid ${base.border};border-radius:12px;` +
            `background:${base.background};color:${isLightTheme() ? '#0f1419' : '#e7e9ea'};` +
            `box-shadow:0 8px 28px rgba(0,0,0,.28);font-family:-apple-system,` +
            `BlinkMacSystemFont,"Segoe UI",Roboto,Helvetica,Arial,sans-serif;` +
            `font-size:13px;box-sizing:border-box;`;

        function addPopupButtonEffects(button) {
            button.style.transition = 'filter 0.12s ease';
            button.addEventListener('mouseenter', function () {
                button.style.filter = 'brightness(1.12)';
            });
            button.addEventListener('mouseleave', function () {
                button.style.filter = 'none';
            });
            button.addEventListener('mousedown', function () {
                button.style.filter =
                    `brightness(${pressedBrightness[settings.colorTheme] || 1.25})`;
            });
            button.addEventListener('mouseup', function () {
                button.style.filter = 'brightness(1.12)';
            });
        }

        const title = document.createElement('div');
        title.textContent = '✦ ' + text.exceptionTitle;
        title.style.cssText =
            'font-size:15px;font-weight:700;margin-bottom:12px;text-align:left';

        const inputRow = document.createElement('div');
        inputRow.style.cssText = 'display:flex;align-items:center;gap:6px;margin-bottom:10px';
        const prefix = document.createElement('span');
        prefix.textContent = '@';
        prefix.style.fontWeight = '600';
        const input = document.createElement('input');
        input.type = 'text';
        input.placeholder = text.accountId;
        input.autocomplete = 'off';
        input.style.cssText = `min-width:0;flex:1;height:28px;padding:0 8px;` +
            `border:1px solid ${base.border};border-radius:6px;box-sizing:border-box;` +
            `background:${base.background};color:${isLightTheme() ? '#0f1419' : '#e7e9ea'};` +
            `text-align:left;`;
        const add = document.createElement('button');
        add.type = 'button';
        add.style.cssText = `width:28px;height:28px;padding:0;border:1px solid ${base.border};` +
            `border-radius:6px;background:${getAccentColor()};color:#fff;cursor:pointer;` +
            `font-size:17px;font-weight:700;line-height:1;display:flex;` +
            `align-items:center;justify-content:center;`;
        add.innerHTML = '<svg viewBox="0 -960 960 960" aria-hidden="true" ' +
            'style="width:14px;height:14px;display:block;fill:currentColor;pointer-events:none">' +
            '<path d="M440-440H200v-80h240v-240h80v240h240v80H520v240h-80v-240Z"/></svg>';
        addPopupButtonEffects(add);
        inputRow.append(prefix, input, add);

        const list = document.createElement('div');
        list.style.cssText = 'display:flex;flex-direction:column;gap:5px';

        function normalizeUsername(value) {
            return String(value || '').trim().replace(/^@+/, '').toLowerCase();
        }

        function renderList() {
            list.replaceChildren();
            draft.forEach(function (item, index) {
                const row = document.createElement('div');
                row.style.cssText = `height:28px;display:flex;align-items:center;gap:7px;` +
                    `padding:0 6px;border:1px solid ${base.border};border-radius:6px;` +
                    `box-sizing:border-box;`;
                const name = document.createElement('span');
                name.textContent = '@' + item.username;
                name.style.cssText =
                    'min-width:0;flex:1;overflow:hidden;text-overflow:ellipsis;' +
                    'white-space:nowrap;text-align:left';
                const remove = document.createElement('button');
                remove.type = 'button';
                remove.setAttribute('aria-label', 'Remove');
                remove.style.cssText = `width:22px;height:20px;padding:0;` +
                    `border:1px solid ${getAccentColor()};border-radius:5px;` +
                    `background:${getAccentColor()};color:#fff;cursor:pointer;` +
                    `font-size:10px;display:flex;align-items:center;justify-content:center;`;
                remove.innerHTML = '<svg viewBox="0 -960 960 960" aria-hidden="true" ' +
                    'style="width:13px;height:13px;display:block;fill:currentColor;pointer-events:none">' +
                    '<path d="M200-440v-80h560v80H200Z"/></svg>';
                addPopupButtonEffects(remove);
                remove.addEventListener('click', function (event) {
                    event.stopPropagation();
                    draft.splice(index, 1);
                    renderList();
                });
                const enabled = document.createElement('input');
                enabled.type = 'checkbox';
                enabled.checked = item.enabled;
                enabled.style.cssText = `width:15px;height:15px;margin:0;` +
                    `accent-color:${getAccentColor()};flex:0 0 auto;`;
                enabled.addEventListener('change', function () {
                    item.enabled = enabled.checked;
                });
                row.append(name, remove, enabled);
                list.appendChild(row);
            });
        }

        function addInputValue() {
            const username = normalizeUsername(input.value);
            if (!username || !/^[a-z0-9_]{1,15}$/i.test(username)) return;
            const existing = draft.find(function (item) {
                return item.username === username;
            });
            if (existing) {
                existing.enabled = true;
            } else {
                draft.push({username, enabled: true});
            }
            input.value = '';
            renderList();
        }

        add.addEventListener('click', addInputValue);
        input.addEventListener('keydown', function (event) {
            if (event.key !== 'Enter') return;
            event.preventDefault();
            addInputValue();
        });

        const actions = document.createElement('div');
        actions.style.cssText = 'margin-top:12px;display:flex;align-items:center;justify-content:center;gap:8px';
        const save = document.createElement('button');
        save.type = 'button';
        save.textContent = text.save;
        save.style.cssText = `width:80px;height:30px;padding:0 8px;border:1px solid ${getAccentColor()};` +
            `border-radius:7px;background:${getAccentColor()};` +
            `color:${isLightTheme() ? '#0f1419' : '#fff'};cursor:pointer;` +
            `font-size:12px;font-weight:600;display:flex;align-items:center;` +
            `justify-content:center;text-align:center;`;
        addPopupButtonEffects(save);
        const cancel = document.createElement('button');
        cancel.type = 'button';
        cancel.setAttribute('aria-label', text.cancel);
        cancel.style.cssText = `width:30px;height:30px;padding:0;border:1px solid ${base.border};` +
            `border-radius:7px;background:${base.background};` +
            `color:${isLightTheme() ? '#0f1419' : '#e7e9ea'};cursor:pointer;` +
            `display:flex;align-items:center;justify-content:center;`;
        cancel.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true" ' +
            'style="width:14px;height:14px;display:block;margin:auto;fill:currentColor;pointer-events:none">' +
            '<path d="M18.3 5.71 12 12l6.3 6.29-1.41 1.42L10.59 13.41 4.29 19.71 2.88 18.3 9.17 12 2.88 5.7 4.29 4.29 10.59 10.59 16.89 4.29z"/></svg>';
        cancel.addEventListener('click', function (event) {
            event.stopPropagation();
            popup.remove();
        });
        save.addEventListener('click', function (event) {
            event.stopPropagation();
            addInputValue();
            settings.reactionCountExceptions = draft.map(function (item) {
                return Object.assign({}, item);
            });
            settings = normalizeSettings(settings);
            const persisted = Object.assign({}, settings);
            if (settingsPreview) {
                persisted.showOwnReactionCountsOnly =
                    settingsPreview.showOwnReactionCountsOnly;
                persisted.showFullLikeCounts =
                    settingsPreview.showFullLikeCounts;
            }
            saveSettings(persisted);
            popup.remove();
            applyOwnReactionCountVisibility();
        });
        actions.append(save, cancel);
        popup.append(title, inputRow, list, actions);
        document.body.appendChild(popup);
        renderList();
        input.focus();
    }

    function openSettingsPopup(button = null) {
        const existing = document.querySelector('.x-extras-settings-popup');
        if (existing) {
            closeSettingsPopup();
            return;
        }

        settingsPreview = {
            showOwnReactionCountsOnly: settings.showOwnReactionCountsOnly,
            showFullLikeCounts: settings.showFullLikeCounts
        };

        // ============================================================

        const defaultAllPopup = document.querySelector(
            '.x-default-settings-popup'
        );
        if (defaultAllPopup) defaultAllPopup.remove();

        const base = getBaseThemeColors();
        const popup = document.createElement('div');
        popup.className = 'x-extras-settings-popup';
        popup.style.cssText = `position:fixed;z-index:2147483646;padding:14px;
            border:1px solid ${base.border};border-radius:12px;background:${base.background};
            color:${isLightTheme() ? '#0f1419' : '#e7e9ea'};box-shadow:0 8px 28px rgba(0,0,0,.24);
            font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,Helvetica,Arial,sans-serif;
            font-size:13px;box-sizing:border-box;`;

        const text = getSettingsText();

        const title = document.createElement('div');
        title.style.cssText = 'margin-bottom:10px;display:flex;align-items:baseline;gap:6px';
        title.innerHTML = '<span style="font-size:15px;font-weight:700">✦ Custom Extras</span>' +
            '<span style="font-size:10px;color:#71767b">【Ctrl+Shift+X】</span>';
        popup.appendChild(title);

        function checkboxRow(labelText, key, indent = false) {
            const label = document.createElement('label');
            label.style.cssText = `min-height:${indent ? 30 : 36}px;display:flex;align-items:center;` +
                `justify-content:space-between;gap:10px;${indent ? 'padding-left:14px;' : ''}cursor:pointer`;
            const text = document.createElement('span');
            text.textContent = labelText;
            text.style.fontWeight = indent ? '400' : '500';
            const input = document.createElement('input');
            input.type = 'checkbox';
            input.dataset.setting = key;
            input.checked = isEnabled(settings[key]);
            const checkboxSize = indent ? 14 : 17;
            const checkboxColor = getAccentColor();
            input.style.cssText = `width:${checkboxSize}px;height:${checkboxSize}px;` +
                `margin:0 ${indent ? 1.5 : 0}px 0 0;` +
                `accent-color:${checkboxColor};flex:0 0 auto;` +
                `${indent ? 'filter:brightness(0.67) saturate(0.80);' : ''}`;
            label.append(text, input);
            popup.appendChild(label);
            return input;
        }

        const hideExtras = checkboxRow(text.hideExtras, 'hideExtras');
        const hideVerifiedBadge = checkboxRow(
            text.hideVerifiedBadge,
            'hideVerifiedBadge',
            true
        );
        hideExtras.parentElement.style.minHeight = '30px';
        hideVerifiedBadge.parentElement.style.minHeight = '22px';
        hideVerifiedBadge.parentElement.style.marginTop = '-4px';
        hideVerifiedBadge.parentElement.querySelector('span').style.fontSize = '12px';

        function refreshExtrasDependency() {
            hideVerifiedBadge.disabled = !hideExtras.checked;
            hideVerifiedBadge.parentElement.style.opacity =
                hideExtras.checked ? '1' : '.45';
        }
        hideExtras.addEventListener('change', refreshExtrasDependency);
        refreshExtrasDependency();

        checkboxRow(text.showAnalytics, 'showAnalytics');
        checkboxRow(text.showLikes, 'showLikes');
        checkboxRow(text.showQuotes, 'showQuotes');

        const featureSeparator = document.createElement('div');
        featureSeparator.style.cssText =
            `height:1px;margin:6px 0;background:${base.border};opacity:.85;`;
        popup.appendChild(featureSeparator);

        checkboxRow(text.showViewerPostButton, 'showViewerPostButton');
        const showFullLikeCounts = checkboxRow(
            text.showFullLikeCounts,
            'showFullLikeCounts'
        );
        const showOwnReactionCountsOnly = checkboxRow(
            text.showOwnReactionCountsOnly,
            'showOwnReactionCountsOnly'
        );

        function applySettingsPreview() {
            settings.showFullLikeCounts =
                showFullLikeCounts.checked ? 'O' : 'X';
            settings.showOwnReactionCountsOnly =
                showOwnReactionCountsOnly.checked ? 'O' : 'X';
            scanArticles();
        }

        showFullLikeCounts.addEventListener('change', applySettingsPreview);
        showOwnReactionCountsOnly.addEventListener(
            'change',
            applySettingsPreview
        );

        const exceptionRow = document.createElement('div');
        exceptionRow.style.cssText =
            'min-height:23px;margin-top:-2px;display:flex;align-items:center;' +
            'justify-content:space-between;gap:10px;padding-left:14px';
        showOwnReactionCountsOnly.parentElement.style.minHeight = '30px';
        const exceptionLabel = document.createElement('span');
        exceptionLabel.textContent = text.reactionCountExceptions;
        exceptionLabel.style.cssText = 'font-size:12px;font-weight:400';
        const register = document.createElement('button');
        register.type = 'button';
        register.textContent = text.register;
        register.style.cssText = `height:18px;min-width:46px;padding:0 9px;` +
            `border:1px solid ${getAccentColor()};border-radius:5px;` +
            `background:${getAccentColor()};` +
            `color:${isLightTheme() ? '#0f1419' : '#fff'};cursor:pointer;` +
            `font-size:10px;font-weight:600;line-height:1;box-sizing:border-box;` +
            `display:flex;align-items:center;justify-content:center;text-align:center;` +
            `transition:filter 0.12s ease;`;
        register.addEventListener('mouseenter', function () {
            register.style.filter = 'brightness(1.12)';
        });
        register.addEventListener('mouseleave', function () {
            register.style.filter = 'none';
        });
        register.addEventListener('mousedown', function () {
            register.style.filter =
                `brightness(${pressedBrightness[settings.colorTheme] || 1.25})`;
        });
        register.addEventListener('mouseup', function () {
            register.style.filter = 'brightness(1.12)';
        });
        register.addEventListener('click', openExceptionAccountsPopup);
        exceptionRow.append(exceptionLabel, register);
        popup.appendChild(exceptionRow);

        const followerCount = checkboxRow(text.hideFollowerCount, 'hideFollowerCount');
        const followerLink = checkboxRow(text.hideFollowerLink, 'hideFollowerLink', true);

        followerCount.parentElement.style.minHeight = '30px';
        followerLink.parentElement.style.minHeight = '22px';
        followerLink.parentElement.style.marginTop = '-4px';
        followerLink.parentElement.querySelector('span').style.fontSize = '12px';

        function refreshFollowerDependency() {
            followerLink.disabled = !followerCount.checked;
            followerLink.parentElement.style.opacity = followerCount.checked ? '1' : '.45';
        }
        followerCount.addEventListener('change', refreshFollowerDependency);
        refreshFollowerDependency();

        const languageRow = document.createElement('label');
        languageRow.style.cssText =
            'margin-top:5px;min-height:31px;display:flex;align-items:center;' +
            'justify-content:space-between;gap:10px';
        const languageLabel = document.createElement('span');
        languageLabel.textContent = text.language;
        languageLabel.style.fontWeight = '500';
        const languageSelect = document.createElement('select');
        languageSelect.style.cssText = `width:112px;height:29px;padding:0 7px;` +
            `border:1px solid ${base.border};border-radius:6px;` +
            `background:${base.background};color:${isLightTheme() ? '#0f1419' : '#e7e9ea'};cursor:pointer`;

        for (const [value, label] of [
            ['J', '日本語'],
            ['E', 'English'],
            ['K', '한국어'],
            ['SC', '简体中文'],
            ['TC', '繁體中文']
        ]) {
            const option = document.createElement('option');
            option.value = value;
            option.textContent = label;
            languageSelect.appendChild(option);
        }

        languageSelect.value = settings.language;
        languageRow.append(languageLabel, languageSelect);
        popup.appendChild(languageRow);

        const colorRow = document.createElement('div');
        colorRow.style.cssText = 'min-height:42px;display:flex;align-items:center;justify-content:space-between;gap:10px';
        const colorLabel = document.createElement('span');
        colorLabel.textContent = text.color;
        colorLabel.style.fontWeight = '500';
        const choices = document.createElement('div');
        choices.style.cssText = 'display:flex;align-items:center;gap:9px';
        for (let i = 1; i <= 6; i++) {
            const choice = document.createElement('button');
            choice.type = 'button';
            choice.dataset.theme = String(i);
            choice.style.cssText = `width:17px;height:17px;padding:0;border:0;border-radius:50%;` +
                `background:${accentColors[i]};cursor:pointer;box-sizing:border-box;` +
                (i === settings.colorTheme ? `outline:2px solid ${isLightTheme() ? '#0f1419' : '#e7e9ea'};outline-offset:2px` : '');
            choice.addEventListener('click', function () {
                for (const item of choices.children) item.style.outline = 'none';
                choice.style.outline = `2px solid ${isLightTheme() ? '#0f1419' : '#e7e9ea'}`;
                choice.style.outlineOffset = '2px';
                choices.dataset.selected = String(i);
            });
            choices.appendChild(choice);
        }
        choices.dataset.selected = String(settings.colorTheme);
        colorRow.append(colorLabel, choices);
        popup.appendChild(colorRow);

        const actions = document.createElement('div');
        actions.style.cssText =
            'margin-top:12px;position:relative;height:30px';

        function action(text) {
            const buttonElement = document.createElement('button');
            buttonElement.type = 'button';
            buttonElement.textContent = text;
            buttonElement.style.cssText =
                `width:80px;min-width:80px;height:30px;padding:0 8px;` +
                `border:1px solid ${base.border};border-radius:7px;` +
                `background:${base.background};color:` +
                `${isLightTheme() ? '#0f1419' : '#e7e9ea'};` +
                'display:flex;align-items:center;justify-content:center;' +
                'font-size:12px;font-weight:600;line-height:1;text-align:center;' +
                'cursor:pointer;box-sizing:border-box';
            actions.appendChild(buttonElement);
            return buttonElement;
        }

        const cancel = action(text.cancel);
        cancel.textContent = '';
        cancel.setAttribute('aria-label', text.cancel);
        cancel.title = text.cancel;
        cancel.style.width = '30px';
        cancel.style.minWidth = '30px';
        cancel.style.padding = '0';
        cancel.style.position = 'absolute';
        cancel.style.left = 'calc(50% + 48px)';
        cancel.style.top = '0';
        cancel.innerHTML =
            '<svg viewBox="0 0 24 24" aria-hidden="true" ' +
            'style="width:14px;height:14px;display:block;fill:currentColor;pointer-events:none">' +
            '<path d="M18.3 5.71 12 12l6.3 6.29-1.41 1.42L10.59 13.41 4.29 19.71 2.88 18.3 9.17 12 2.88 5.7 4.29 4.29 10.59 10.59 16.89 4.29z"/>' +
            '</svg>';

        const save = action(text.save);
        save.style.background = getAccentColor();
        save.style.borderColor = getAccentColor();
        save.style.color = isLightTheme() ? '#0f1419' : '#fff';
        save.style.position = 'absolute';
        save.style.left = '50%';
        save.style.top = '0';
        save.style.transform = 'translateX(-50%)';
        save.style.transition = 'filter 0.12s ease';

        save.addEventListener('mouseenter', function () {
            save.style.filter = 'brightness(1.12)';
        });
        save.addEventListener('mouseleave', function () {
            save.style.filter = 'none';
        });
        save.addEventListener('mousedown', function () {
            save.style.filter =
                `brightness(${pressedBrightness[settings.colorTheme] || 1.25})`;
        });
        save.addEventListener('mouseup', function () {
            save.style.filter = 'brightness(1.12)';
        });

        cancel.addEventListener('click', function () {
            closeSettingsPopup();
        });
        save.addEventListener('click', function () {
            for (const input of popup.querySelectorAll('input[data-setting]')) {
                settings[input.dataset.setting] = input.checked ? 'O' : 'X';
            }
            settings.language = languageSelect.value;
            settings.colorTheme = Number(choices.dataset.selected) || 5;
            settings = normalizeSettings(settings);
            saveSettings();
            closeSettingsPopup(true);
            restoreHidden(extraHidden);
            restoreHidden(followerHidden);
            removeDirectButtonWrappers();
            scanArticles();
        });
        popup.appendChild(actions);
        document.body.appendChild(popup);
        positionSettingsPopup(popup, button);
    }

    function ensureSettingsButton() {
        if (!isProfilePage()) {
            const old = document.querySelector('.x-custom-extras-settings-wrapper');
            if (old) old.remove();
            return;
        }
        const userName = document.querySelector('[data-testid="UserName"]');
        const host = userName && userName.parentElement;
        if (!host) return;
        let wrapper = host.querySelector(':scope > .x-custom-extras-settings-wrapper');
        if (wrapper) {
            const existingButton = wrapper.querySelector('.x-custom-extras-settings-button');
            if (existingButton && existingButton.dataset.hovered !== 'true') {
                const colors = getBaseThemeColors();
                existingButton.style.background = colors.background;
                existingButton.style.borderColor = colors.border;
                existingButton.style.color = colors.text;
            }
            return;
        }
        if (getComputedStyle(host).position === 'static') host.style.position = 'relative';
        host.style.overflow = 'visible';
        wrapper = document.createElement('div');
        wrapper.className = 'x-custom-extras-settings-wrapper';
        wrapper.style.cssText = 'position:absolute;top:53px;right:35px;z-index:21;width:16px;height:16px;display:flex;align-items:center;justify-content:center;pointer-events:auto';
        const button = document.createElement('button');
        button.className = 'x-custom-extras-settings-button';
        button.type = 'button';
        button.setAttribute('aria-label', 'Custom Extras');
        button.dataset.hovered = 'false';
        button.style.cssText = `width:18px;height:18px;flex:0 0 18px;padding:0;border:1px solid ${getBaseThemeColors().border};` +
            `border-radius:50%;display:flex;align-items:center;justify-content:center;background:${getBaseThemeColors().background};` +
            `color:${getBaseThemeColors().text};cursor:pointer;box-sizing:border-box`;
        button.innerHTML = '<svg viewBox="0 -960 960 960" aria-hidden="true" style="width:12px;height:12px;display:block;fill:currentColor;pointer-events:none;transform:translateX(-0.2px)"><path d="m640-480 80 80v80H520v240l-40 40-40-40v-240H240v-80l80-80v-280h-40v-80h400v80h-40v280Zm-286 80h252l-46-46v-314H400v314l-46 46Zm126 0Z"/></svg>';
        button.addEventListener('mouseenter', () => {
            button.dataset.hovered = 'true';
            button.style.background = getAccentColor();
            button.style.borderColor = getAccentColor();
            button.style.color = isLightTheme() ? '#0f1419' : '#ffffff';
        });
        button.addEventListener('mouseleave', () => {
            button.dataset.hovered = 'false';
            const b = getBaseThemeColors();
            button.style.background = b.background;
            button.style.borderColor = b.border;
            button.style.color = b.text;
        });
        button.addEventListener('click', function (event) {
            event.preventDefault(); event.stopPropagation(); openSettingsPopup(button);
        });
        wrapper.appendChild(button);
        host.appendChild(wrapper);
    }

    function removeDirectButtonWrappers() {
        for (const wrapper of document.querySelectorAll('.x-tweet-direct-buttons')) {
            wrapper.remove();
        }
    }

    function scanArticles() {
        for (const article of document.querySelectorAll('article')) {
            try {
                addButtonsToArticle(article);
            } catch (e) {
            }
        }
        applyMiscVisibility();
        applyFollowerVisibility();
        applyFullLikeCounts();
        applyDetailedPostLikeCounts();
        ensureViewerPostButton();
        applyOwnReactionCountVisibility();
        maybeRestoreScrollAnchor();
        ensureSettingsButton();
    }

    let scanScheduled = false;

    function scheduleScan() {
        if (scanScheduled) {
            return;
        }

        scanScheduled = true;

        requestAnimationFrame(function () {
            scanScheduled = false;
            scanArticles();
        });
    }

    const observer = new MutationObserver(function () {
        const customPopup = document.querySelector(
            '.x-extras-settings-popup'
        );
        const defaultAllPopup = document.querySelector(
            '.x-default-settings-popup'
        );

        // ============================================================
        if (customPopup && defaultAllPopup) closeSettingsPopup();
        if (!customPopup && settingsPreview) {
            settings.showOwnReactionCountsOnly =
                settingsPreview.showOwnReactionCountsOnly;
            settings.showFullLikeCounts =
                settingsPreview.showFullLikeCounts;
            settingsPreview = null;
        }

        scheduleScan();
    });

    document.addEventListener('keydown', function (event) {
        if (!(event.ctrlKey && event.shiftKey && event.key.toLowerCase() === 'x')) return;
        const target = event.target;
        if (target && typeof target.closest === 'function' &&
            target.closest('textarea,select,[contenteditable="true"],[role="textbox"],input')) return;
        event.preventDefault();
        event.stopPropagation();
        openSettingsPopup(null);
    }, true);

    document.addEventListener('click', function (event) {
        const popup = document.querySelector('.x-extras-settings-popup');
        const exceptionPopup = document.querySelector(
            '.x-extras-exception-popup'
        );
        if (!popup || popup.contains(event.target) ||
            (exceptionPopup && exceptionPopup.contains(event.target)) ||
            event.target.closest('.x-custom-extras-settings-button')) return;
        closeSettingsPopup();
    });

    observer.observe(document.documentElement, {
        childList: true,
        subtree: true
    });

    scanArticles();

    setInterval(function () {
        tryFindHistory();
        scanArticles();

        for (
            const button of
            document.querySelectorAll('.x-tweet-direct-button')
        ) {
            refreshButtonStyle(button);
        }
        ensureSettingsButton();
    }, 1000);
})();
