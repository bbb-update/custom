// ==UserScript==
// @name         X - Custom Extras
// @namespace    x-custom-extras.personal
// @version      1.5.0
// @description  Personal X extras, direct post buttons, and profile cleanup
// @match        https://x.com/*
// @match        https://twitter.com/*
// @run-at       document-idle
// @grant        unsafeWindow
// @grant        GM_getValue
// @grant        GM_setValue
// @grant        GM_openInTab
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
        showReactionCounts: 'O',
        showViewerPostButton: 'O',
        enableMediaThumbnailShortcut: 'O',
        showOwnReactionCountsOnly: 'O',
        showFullLikeCounts: 'O',
        reactionCountExceptions: [],
        hideMutedAccounts: 'O',
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
            'showReactionCounts',
            'showViewerPostButton',
            'enableMediaThumbnailShortcut',
            'showOwnReactionCountsOnly',
            'showFullLikeCounts',
            'hideMutedAccounts',
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
    let mediaThumbnailDetailKeyDown = false;
    let mutedUserFeature = null;

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
    const reactionCountsByStatusId = new Map();
    const reactionCountPageChecks = new Map();
    const extraHidden = new Map();
    const followerHidden = new Map();
    const originalLikeMetricTexts = new Map();
    const originalPostLikeTexts = new Map();
    const viewerReplyHidden = new Map();
    const reactionCountHidden = new Map();

    const reactionCountStyle = document.createElement('style');
    reactionCountStyle.textContent =
        '.x-quote-count-host{' +
        'display:flex!important;' +
        'flex-direction:row!important;' +
        'align-items:center!important;' +
        'flex-wrap:nowrap!important;' +
        'gap:0!important;' +
        'column-gap:0!important;' +
        'overflow:visible!important;' +
        'width:max-content!important;}' +
        '.x-quote-count-host.x-quote-count-stacked{' +
        'flex-direction:column!important;' +
        'align-items:flex-start!important;}';
    (document.head || document.documentElement)
        .appendChild(reactionCountStyle);

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

    document.addEventListener('keydown', function (event) {
        const target = event.target;
        if (target && typeof target.closest === 'function' &&
            target.closest(
                'textarea,select,[contenteditable="true"],' +
                '[role="textbox"],input'
            )) {
            return;
        }

        if (event.code === 'KeyD') {
            mediaThumbnailDetailKeyDown = true;
            return;
        }

        if (
            event.code === 'KeyF' &&
            mediaThumbnailDetailKeyDown &&
            !event.repeat
        ) {
            event.preventDefault();
            event.stopPropagation();
            event.stopImmediatePropagation();
            settings.showOwnReactionCountsOnly = isEnabled(
                settings.showOwnReactionCountsOnly
            ) ? 'X' : 'O';
            const persisted = loadSettings();
            persisted.showOwnReactionCountsOnly =
                settings.showOwnReactionCountsOnly;
            saveSettings(persisted);
            if (settingsPreview) {
                settingsPreview.showOwnReactionCountsOnly =
                    settings.showOwnReactionCountsOnly;
            }
            const popupCheckbox = document.querySelector(
                '.x-extras-settings-popup ' +
                'input[data-setting="showOwnReactionCountsOnly"]'
            );
            if (popupCheckbox) {
                popupCheckbox.checked = isEnabled(
                    settings.showOwnReactionCountsOnly
                );
            }
            scanArticles();
        }
    }, true);

    document.addEventListener('keyup', function (event) {
        if (event.code === 'KeyD') mediaThumbnailDetailKeyDown = false;
    }, true);

    window.addEventListener('blur', function () {
        mediaThumbnailDetailKeyDown = false;
    });

    document.addEventListener('click', function (event) {
        if (!isEnabled(settings.enableMediaThumbnailShortcut) ||
            !mediaThumbnailDetailKeyDown || event.button !== 0 ||
            !/^\/[^/]+\/media\/?$/.test(location.pathname)) {
            return;
        }

        const target = event.target;
        if (!target || typeof target.closest !== 'function') return;
        const link = target.closest('a[href*="/status/"]');
        if (!link) return;

        let match;
        try {
            match = new URL(link.href, location.href).pathname.match(
                /^(\/[^/]+\/status\/\d+)\/(?:photo|video)\/\d+\/?$/
            );
        } catch (e) {
            return;
        }
        if (!match) return;

        event.preventDefault();
        event.stopImmediatePropagation();
        if (typeof link.blur === 'function') link.blur();
        const clearFocus = function () {
            const active = document.activeElement;
            if (active && active !== document.body &&
                typeof active.blur === 'function') {
                active.blur();
            }
        };
        clearFocus();
        navigateWithXRouter(match[1]);
        requestAnimationFrame(clearFocus);
        setTimeout(clearFocus, 80);
        setTimeout(clearFocus, 250);
    }, true);

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

    function rememberReactionCounts(statusId, value) {
        let source = null;

        try {
            if (String(value.rest_id || '') === statusId && value.legacy) {
                source = value.legacy;
            } else if (String(value.id_str || '') === statusId) {
                source = value;
            }
        } catch (e) {
            return null;
        }

        if (!source) return null;

        const previous = reactionCountsByStatusId.get(statusId) || {};
        const next = {
            quotes: typeof source.quote_count === 'number'
                ? source.quote_count
                : previous.quotes,
            reposts: typeof source.retweet_count === 'number'
                ? source.retweet_count
                : previous.reposts,
            likes: typeof source.favorite_count === 'number'
                ? source.favorite_count
                : previous.likes,
            checkedAt: Date.now()
        };

        if (
            typeof next.quotes !== 'number' &&
            typeof next.reposts !== 'number' &&
            typeof next.likes !== 'number'
        ) {
            return null;
        }

        reactionCountsByStatusId.set(statusId, next);
        return next;
    }

    function findReactionCountsInReactValue(rootValue, statusId) {
        const stack = [{ value: rootValue, depth: 0 }];
        const visited = new WeakSet();
        let checked = 0;

        while (stack.length && checked < 8000) {
            const item = stack.pop();
            const value = item.value;

            if (!value || typeof value !== 'object' ||
                item.depth > 16 || value.nodeType || visited.has(value)) {
                continue;
            }

            visited.add(value);
            checked++;

            const counts = rememberReactionCounts(statusId, value);
            if (counts) return counts;

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

    function findReactionCountsOnPage(statusId) {
        const cached = reactionCountsByStatusId.get(statusId);
        const now = Date.now();

        if (cached && now - cached.checkedAt < 30000) {
            return cached;
        }

        if (now - (reactionCountPageChecks.get(statusId) || 0) < 5000) {
            return cached || null;
        }

        reactionCountPageChecks.set(statusId, now);

        const elements = [];
        const primary = document.querySelector(
            '[data-testid="primaryColumn"]'
        );
        const root = document.querySelector('#react-root');

        if (primary) elements.push(primary);
        if (root && root !== primary) elements.push(root);

        for (const element of document.querySelectorAll(
            '[data-testid="primaryColumn"] *, #react-root > *'
        )) {
            elements.push(element);
            if (elements.length >= 120) break;
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

                const counts = findReactionCountsInReactValue(
                    element[key],
                    statusId
                );

                if (counts) return counts;
            }
        }

        return cached || null;
    }

    function findReactionCountsNearElement(element, statusId) {
        const elements = [];
        let current = element;

        for (let i = 0; current && i < 10; i++) {
            elements.push(current);
            current = current.parentElement;
        }

        for (const child of element?.querySelectorAll('*') || []) {
            elements.push(child);
            if (elements.length >= 80) break;
        }

        for (const target of elements) {
            let keys;
            try {
                keys = Object.keys(target);
            } catch (e) {
                continue;
            }

            for (const key of keys) {
                if (key.indexOf('__reactProps') !== 0 &&
                    key.indexOf('__reactFiber') !== 0) {
                    continue;
                }

                const counts = findReactionCountsInReactValue(
                    target[key],
                    statusId
                );
                if (counts) return counts;
            }
        }

        return null;
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
                    rememberReactionCounts(statusId, value);
                    return value.legacy.quote_count;
                }

                if (String(value.id_str || '') === statusId &&
                    typeof value.quote_count === 'number') {
                    rememberReactionCounts(statusId, value);
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
                    rememberReactionCounts(statusId, value);
                    return value.legacy.favorite_count;
                }

                if (String(value.id_str || '') === statusId &&
                    typeof value.favorite_count === 'number') {
                    rememberReactionCounts(statusId, value);
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
            isEnabled(settings.showQuotes) && quoteCount > 0;
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
            !isEnabled(settings.showLikes) &&
            !isEnabled(settings.showReactionCounts)
        ) {
            const existing = findArticleButtonWrapper(article);
            if (existing) existing.remove();
            return;
        }

        const postInfo = getPostInfo(article);

        if (!postInfo) {
            return;
        }

        if (isEnabled(settings.showReactionCounts)) {
            getQuoteCount(article, postInfo.statusId);
            getLikeCount(article, postInfo.statusId);
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
            isEnabled(settings.showQuotes) && quoteCount > 0;

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
            const premiumAside = link.closest(
                'aside[role="complementary"]'
            );
            if (premiumAside) {
                rememberAndHide(
                    premiumAside.parentElement || premiumAside,
                    extraHidden
                );
                continue;
            }

            const premiumPrompt = link.closest(
                'div.r-1xpp3t0'
            );

            if (premiumPrompt) {
                rememberAndHide(
                    premiumPrompt,
                    extraHidden
                );
                continue;
            }

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

        for (const link of document.querySelectorAll(
            'a[href="/i/account_analytics"]'
        )) {
            const analyticsPrompt = link.closest(
                'div.r-1q9bdsx'
            );

            if (
                analyticsPrompt &&
                analyticsPrompt.querySelector(
                    'button[role="button"]'
                )
            ) {
                rememberAndHide(
                    analyticsPrompt.parentElement ||
                        analyticsPrompt,
                    extraHidden
                );
            }
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

        if (/[万萬\uB9CC]/.test(originalText)) {
            return (Math.floor(count / 100) / 100).toFixed(2) +
                originalText.match(/[万萬\uB9CC]/)[0];
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
                const reactionButton = group.querySelector(
                    'button[data-testid="retweet"], ' +
                    'button[data-testid="unretweet"], ' +
                    'button[data-testid="like"], ' +
                    'button[data-testid="unlike"]'
                );
                const reactionCell = reactionButton?.parentElement;
                const rect = group.getBoundingClientRect();
                const style = getComputedStyle(group);

                return Boolean(
                    reactionCell &&
                    reactionCell.parentElement === group &&
                    rect.width > 0 &&
                    rect.height > 0 &&
                    style.display !== 'none' &&
                    style.visibility !== 'hidden'
                );
            });

        return {
            username: mediaMatch[1],
            statusId: mediaMatch[2],
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
        const viewerGroups = new Set(viewer.groups);

        for (const wrapper of document.querySelectorAll(
            '.x-viewer-post-button-wrapper'
        )) {
            if (!viewerGroups.has(wrapper.parentElement)) {
                wrapper.remove();
            }
        }

        restoreHidden(viewerReplyHidden);

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

    function removeReactionCountDisplays() {
        for (const element of document.querySelectorAll(
            '.x-reaction-tab-count, .x-quote-count-after-retweet'
        )) {
            element.remove();
        }
        for (const element of document.querySelectorAll(
            '.x-quote-count-host'
        )) {
            element.classList.remove('x-quote-count-host');
            element.classList.remove('x-quote-count-stacked');
        }
    }

    function formatReactionCount(count) {
        return Number(count).toLocaleString();
    }

    function updateQuoteCountForButton(
        button,
        statusId,
        quoteCount
    ) {
        if (!button) return false;

        const transition = button.querySelector(
            '[data-testid="app-text-transition-container"]'
        );
        const existing = button.querySelector(
            '.x-quote-count-after-retweet'
        );
        const countHost = transition?.parentElement ||
            existing?.parentElement;

        if (
            !transition ||
            typeof quoteCount !== 'number' ||
            quoteCount <= 0
        ) {
            existing?.remove();
            countHost?.classList.remove('x-quote-count-host');
            countHost?.classList.remove('x-quote-count-stacked');
            return false;
        }

        countHost.classList.add('x-quote-count-host');
        const stacked = Boolean(
            button.closest('#cpftFocusedTweetActionBar') &&
            /\/status\/\d+\/(?:photo|video)\/\d+\/?$/.test(
                location.pathname
            )
        );
        countHost.classList.toggle('x-quote-count-stacked', stacked);

        let quoteLabel = existing;

        if (!quoteLabel) {
            quoteLabel = document.createElement('span');
            quoteLabel.className = 'x-quote-count-after-retweet';
            quoteLabel.style.cssText =
                'margin-left:4px;display:inline-block;' +
                'flex:0 0 auto;color:inherit;white-space:nowrap';
            transition.insertAdjacentElement(
                'afterend',
                quoteLabel
            );
        }

        quoteLabel.dataset.statusId = statusId;

        const valueSpans = transition.querySelectorAll('span');
        const valueSpan = valueSpans[valueSpans.length - 1] ||
            transition;
        const valueStyle = getComputedStyle(valueSpan);
        quoteLabel.style.fontFamily = valueStyle.fontFamily;
        quoteLabel.style.fontSize = stacked ? '11px' : valueStyle.fontSize;
        quoteLabel.style.fontWeight = valueStyle.fontWeight;
        quoteLabel.style.lineHeight = valueStyle.lineHeight;
        quoteLabel.style.marginLeft = stacked ? '0' : '4px';

        const nextText =
            '(\u200aQ\u2009' +
            formatReactionCount(quoteCount) +
            '\u200a)';
        if (quoteLabel.textContent !== nextText) {
            quoteLabel.textContent = nextText;
        }

        return true;
    }

    function refreshReactionCountDisplays() {
        if (!isEnabled(settings.showReactionCounts)) {
            removeReactionCountDisplays();
            return;
        }

        const match = location.pathname.match(
            /^\/([^/]+)\/status\/(\d+)(?:\/(?:quotes|retweets|likes)|\/(?:photo|video)\/\d+)?\/?$/
        );

        if (!match) {
            removeReactionCountDisplays();
            return;
        }

        const loggedInUsername = detectMobileLoginUsername();
        if (
            isEnabled(settings.showOwnReactionCountsOnly) &&
            loggedInUsername &&
            !canShowReactionCounts(match[1], loggedInUsername)
        ) {
            removeReactionCountDisplays();
            return;
        }

        const statusId = match[2];

        for (const element of document.querySelectorAll(
            '.x-reaction-tab-count, .x-quote-count-after-retweet'
        )) {
            if (element.dataset.statusId !== statusId) {
                if (element.classList.contains(
                    'x-quote-count-after-retweet'
                )) {
                    element.parentElement?.classList.remove(
                        'x-quote-count-host'
                    );
                    element.parentElement?.classList.remove(
                        'x-quote-count-stacked'
                    );
                }
                element.remove();
            }
        }

        const viewer = getMediaViewerContext();
        let counts = reactionCountsByStatusId.get(statusId);

        if (!counts && viewer && viewer.statusId === statusId) {
            for (const group of viewer.groups) {
                counts = findReactionCountsNearElement(group, statusId);
                if (counts) break;
            }

            if (!counts) {
                for (const article of document.querySelectorAll(
                    'article[data-testid="tweet"]'
                )) {
                    const postInfo = getPostInfo(article);
                    if (!postInfo || postInfo.statusId !== statusId) continue;

                    const quoteCount = getQuoteCount(article, statusId);
                    if (typeof quoteCount === 'number') {
                        counts = {
                            quotes: quoteCount,
                            checkedAt: Date.now()
                        };
                        reactionCountsByStatusId.set(statusId, counts);
                    }
                    break;
                }
            }
        }

        if (!counts) counts = findReactionCountsOnPage(statusId);

        if (!counts) return;

        const tabCounts = {
            quotes: counts.quotes,
            retweets: counts.reposts,
            likes: counts.likes
        };

        for (const [tab, count] of Object.entries(tabCounts)) {
            const anchor = document.querySelector(
                `a[href*="/status/${statusId}/${tab}"][role="tab"]`
            );

            if (!anchor || typeof count !== 'number') continue;

            const labels = Array.from(
                anchor.querySelectorAll('span')
            );
            const label = labels.find(function (span) {
                return !span.classList.contains(
                    'x-reaction-tab-count'
                ) && !span.querySelector('span') &&
                    span.textContent.trim();
            });

            if (!label || !label.parentElement) continue;

            let countLabel = anchor.querySelector(
                '.x-reaction-tab-count'
            );

            if (!countLabel) {
                countLabel = document.createElement('span');
                countLabel.className = 'x-reaction-tab-count';
                countLabel.style.cssText =
                    'margin-left:.25em;font:inherit;color:inherit;' +
                    'white-space:nowrap';
                label.insertAdjacentElement('afterend', countLabel);
            }

            countLabel.dataset.statusId = statusId;

            const nextText = ': ' + formatReactionCount(count);
            if (countLabel.textContent !== nextText) {
                countLabel.textContent = nextText;
            }
        }

        for (const article of document.querySelectorAll(
            'article[data-testid="tweet"]'
        )) {
            const postInfo = getPostInfo(article);
            if (!postInfo || postInfo.statusId !== statusId) continue;

            const button = article.querySelector(
                'button[data-testid="retweet"], ' +
                'button[data-testid="unretweet"]'
            );

            updateQuoteCountForButton(
                button,
                statusId,
                counts.quotes
            );
            break;
        }

        if (viewer && viewer.statusId === statusId) {
            for (const group of viewer.groups) {
                const button = group.querySelector(
                    'button[data-testid="retweet"], ' +
                    'button[data-testid="unretweet"]'
                );

                updateQuoteCountForButton(
                    button,
                    statusId,
                    counts.quotes
                );
            }
        }
    }

    function getSettingsText() {
        const texts = {
            J: {
                hideExtras: '雑多な要素を非表示',
                hideVerifiedBadge: '└ 認証バッジを非表示',
                showAnalytics: '分析表示 ボタン（自分のみ）',
                showLikes: 'いいね一覧 ボタン（自分のみ）',
                showQuotes: '引用一覧 ボタン',
                showReactionCounts: '└ タブ・リポストに反応数を表示',
                showViewerPostButton: 'メディアビューアー閉じる ボタン',
                viewerPostAction: 'メディアビューアーを閉じる',
                enableMediaThumbnailShortcut: 'メディアタブ用 ショートカット',
                mediaThumbnailShortcutNote: '【D+サムネをクリック】：詳細ページを表示',
                showOwnReactionCountsOnly: '自分のポストのみ反応数を表示',
                reactionCountExceptions: '└ 非表示の対象外アカウント',
                register: '登録',
                exceptionTitle: '対象外アカウント',
                accountId: 'アカウントID',
                showFullLikeCounts: '分析：いいね数を全桁表示',
                hideMutedAccounts: 'ミュートアカウントを非表示',
                mutedAccountsManager: 'ミュートリスト管理',
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
                showReactionCounts: '└ Show counts in tabs/repost area',
                showViewerPostButton: 'Close media viewer button',
                viewerPostAction: 'Close media viewer',
                enableMediaThumbnailShortcut: 'Shortcut for the Media tab',
                mediaThumbnailShortcutNote: '【D+thumbnail click】: Open post details',
                showOwnReactionCountsOnly: 'Show own-post reaction counts',
                reactionCountExceptions: '└ Account exceptions',
                register: 'Add',
                exceptionTitle: 'Accounts with counts',
                accountId: 'Account ID',
                showFullLikeCounts: 'Analytics: Show full like count',
                hideMutedAccounts: 'Hide muted accounts',
                mutedAccountsManager: 'Manage muted accounts',
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
                showReactionCounts: '└ 탭・리트윗에 반응 수치 표시',
                showViewerPostButton: '미디어 뷰어 닫기 버튼',
                viewerPostAction: '미디어 뷰어 닫기',
                enableMediaThumbnailShortcut: '미디어탭용 단축키 활성화',
                mediaThumbnailShortcutNote: '【D+섬네일 클릭】：상세 페이지 표시',
                showOwnReactionCountsOnly: '본인 글에만 반응 수치 표시',
                reactionCountExceptions: '└ 비표시 예외 계정',
                register: '등록',
                exceptionTitle: '예외 계정 등록',
                accountId: '계정 ID',
                showFullLikeCounts: '통계 : 좋아요 전체 수치 표시',
                hideMutedAccounts: '뮤트 계정 비표시',
                mutedAccountsManager: '뮤트 목록 관리',
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
                showReactionCounts: '└ 在标签页和转发栏显示互动数',
                showViewerPostButton: '关闭媒体查看器按钮',
                viewerPostAction: '关闭媒体查看器',
                enableMediaThumbnailShortcut: '媒体标签页内快捷操作',
                mediaThumbnailShortcutNote: '【D＋点击缩略图】：打开帖子详情',
                showOwnReactionCountsOnly: '仅在自己的帖子显示互动数',
                reactionCountExceptions: '└ 不隐藏的例外账号',
                register: '添加',
                exceptionTitle: '例外账号',
                accountId: '账号 ID',
                showFullLikeCounts: '数据分析：显示完整点赞数',
                hideMutedAccounts: '隐藏静音账号',
                mutedAccountsManager: '管理静音列表',
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
                showReactionCounts: '└ 在分頁和轉發欄顯示互動數',
                showViewerPostButton: '關閉媒體檢視器按鈕',
                viewerPostAction: '關閉媒體檢視器',
                enableMediaThumbnailShortcut: '媒體分頁內快速操作',
                mediaThumbnailShortcutNote: '【D＋點擊縮圖】：開啟貼文詳情',
                showOwnReactionCountsOnly: '僅在自己的貼文顯示互動數',
                reactionCountExceptions: '└ 不隱藏的例外帳號',
                register: '新增',
                exceptionTitle: '例外帳號',
                accountId: '帳號 ID',
                showFullLikeCounts: '數據分析：顯示完整按讚數',
                hideMutedAccounts: '隱藏靜音帳號',
                mutedAccountsManager: '管理靜音列表',
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
        const width = 270;
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
            const checkboxSize = indent ? 12 : 16;
            const checkboxColor = getAccentColor();
            input.style.cssText = `width:${checkboxSize}px;height:${checkboxSize}px;` +
                `margin:0 ${indent ? 2 : 0}px 0 0;` +
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
        const showQuotes = checkboxRow(text.showQuotes, 'showQuotes');
        const showReactionCounts = checkboxRow(
            text.showReactionCounts,
            'showReactionCounts',
            true
        );
        showQuotes.parentElement.style.minHeight = '30px';
        showReactionCounts.parentElement.style.minHeight = '22px';
        showReactionCounts.parentElement.style.marginTop = '-4px';
        showReactionCounts.parentElement.querySelector(
            'span'
        ).style.fontSize = '12px';

        const featureSeparator = document.createElement('div');
        featureSeparator.style.cssText =
            `height:1px;margin:6px 0;background:${base.border};opacity:.85;`;
        popup.appendChild(featureSeparator);

        checkboxRow(text.showViewerPostButton, 'showViewerPostButton');
        checkboxRow(
            text.enableMediaThumbnailShortcut,
            'enableMediaThumbnailShortcut'
        );
        const mediaThumbnailShortcutNote = document.createElement('div');
        mediaThumbnailShortcutNote.textContent =
            text.mediaThumbnailShortcutNote;
        mediaThumbnailShortcutNote.style.cssText =
            'margin-top:-7px;margin-bottom:0;padding-right:4px;' +
            'font-size:10px;line-height:1.45;white-space:pre-wrap;' +
            'color:#71767b';
        popup.appendChild(mediaThumbnailShortcutNote);
        const showFullLikeCounts = checkboxRow(
            text.showFullLikeCounts,
            'showFullLikeCounts'
        );
        const showOwnReactionCountsOnly = checkboxRow(
            text.showOwnReactionCountsOnly,
            'showOwnReactionCountsOnly'
        );
        showOwnReactionCountsOnly.parentElement.querySelector(
            'span'
        ).title = '(Shortcut: D + F)';

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

        const privacySeparator = document.createElement('div');
        privacySeparator.style.cssText =
            `height:1px;margin:6px 0;background:${base.border};opacity:.85;`;
        popup.appendChild(privacySeparator);

        const hideMutedAccounts = checkboxRow(
            text.hideMutedAccounts,
            'hideMutedAccounts'
        );
        const mutedAccountsManager = document.createElement('button');
        mutedAccountsManager.type = 'button';
        mutedAccountsManager.title = text.mutedAccountsManager;
        mutedAccountsManager.setAttribute(
            'aria-label',
            text.mutedAccountsManager
        );
        mutedAccountsManager.style.cssText =
            `width:24px;height:24px;margin-left:auto;padding:0;border:0;` +
            `background:transparent;color:${getAccentColor()};cursor:pointer;` +
            `display:flex;align-items:center;justify-content:center;`;
        mutedAccountsManager.innerHTML =
            '<svg viewBox="0 -960 960 960" aria-hidden="true" ' +
            'style="width:20px;height:20px;display:block;fill:currentColor;' +
            'pointer-events:none"><path d="M120-240v-80h720v80H120Zm0-200v-80h720v80H120Zm0-200v-80h720v80H120Z"/></svg>';
        mutedAccountsManager.addEventListener('click', function (event) {
            event.preventDefault();
            event.stopPropagation();
            if (mutedUserFeature) mutedUserFeature.openManager();
        });
        hideMutedAccounts.parentElement.insertBefore(
            mutedAccountsManager,
            hideMutedAccounts
        );

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
            'min-height:36px;display:flex;align-items:center;' +
            'justify-content:space-between;gap:10px';
        const languageLabel = document.createElement('span');
        languageLabel.textContent = text.language;
        languageLabel.style.fontWeight = '500';
        const languageSelect = document.createElement('select');
        languageSelect.style.cssText = `width:112px;height:29px;padding:0 7px;` +
            `border:1px solid ${isLightTheme() ? '#cfd9de' : '#536471'};border-radius:6px;` +
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
        colorRow.style.cssText = 'min-height:36px;margin-top:-3px;display:flex;align-items:center;justify-content:space-between;gap:10px';
        const colorLabel = document.createElement('span');
        colorLabel.textContent = text.color;
        colorLabel.style.fontWeight = '500';
        const choices = document.createElement('div');
        choices.style.cssText = 'display:flex;align-items:center;gap:8px';
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
        refreshReactionCountDisplays();
        maybeRestoreScrollAnchor();
        ensureSettingsButton();
        if (mutedUserFeature) mutedUserFeature.scan();
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


    mutedUserFeature = (function () {
    const STORAGE_KEY = 'x-custom-extras-muted-users-test-v1';
    const CATEGORIES_KEY = 'x-custom-extras-muted-categories-test-v1';
    const MENU_ITEM_CLASS = 'x-custom-extras-muted-add';
    const MANAGER_CLASS = 'x-custom-extras-muted-manager';

    function getMuteText() {
        const texts = {
            J: {
                importSuccess: 'ミュートリストの読み込みが完了しました',
                importError: '読み込めないミュートリストファイルです',
                renameCategory: '新しいカテゴリ名',
                deleteCategory: 'カテゴリを削除すると、中のアカウントは未分類へ移動します。',
                menuRegistered: 'Custom Extras：ミュートリストに登録済み',
                menuAdd: 'Custom Extras：ミュートリストに追加',
                added: '追加しました',
                mutedProfile: 'ミュート中のユーザーです',
                showAnyway: 'それでも表示',
                notePlaceholder: 'このアカウントを非表示にした理由',
                cancel: 'キャンセル', save: '保存', category: 'カテゴリ',
                uncategorized: '未分類', memo: 'メモ', noMemo: 'メモなし',
                remove: '削除', empty: '登録されたアカウントはありません',
                moveUp: '上へ移動', moveDown: '下へ移動', edit: '編集',
                managerTitle: 'ミュートアカウント',
                addCategory: 'カテゴリ追加', addCategoryPrompt: '追加するカテゴリ名',
                notice: 'プロフィールの…メニューから追加するか、Xのミュートリストページをスクロールすると自動登録されます'
            },
            E: {
                importSuccess: 'Mute list import complete',
                importError: 'This mute list file cannot be imported',
                renameCategory: 'New category name',
                deleteCategory: 'Deleting this category moves its accounts to Uncategorized.',
                menuRegistered: 'Custom Extras: Added to mute list',
                menuAdd: 'Custom Extras: Add to mute list',
                added: 'added', mutedProfile: 'This user is muted',
                showAnyway: 'Show anyway',
                notePlaceholder: 'Reason for hiding this account',
                cancel: 'Cancel', save: 'Save', category: 'Category',
                uncategorized: 'Uncategorized', memo: 'Note', noMemo: 'No note',
                remove: 'Delete', empty: 'No accounts registered',
                moveUp: 'Move up', moveDown: 'Move down', edit: 'Edit',
                managerTitle: 'Muted accounts',
                addCategory: 'Add category', addCategoryPrompt: 'Category name',
                notice: 'Add accounts from the profile … menu, or scroll through the X mute list page to import them automatically'
            },
            K: {
                importSuccess: '뮤트 목록 불러오기 완료',
                importError: '불러올 수 없는 뮤트 목록 파일입니다',
                renameCategory: '새 카테고리 이름',
                deleteCategory: '카테고리를 삭제하면 안의 계정은 미분류로 이동합니다',
                menuRegistered: 'Custom Extras : 뮤트 목록에 등록됨',
                menuAdd: 'Custom Extras : 뮤트 목록에 추가',
                added: '추가됨', mutedProfile: '뮤트 중인 유저입니다',
                showAnyway: '그래도 보기',
                notePlaceholder: '이 계정을 비표시한 이유',
                cancel: '취소', save: '저장', category: '카테고리',
                uncategorized: '미분류', memo: '메모', noMemo: '메모 없음',
                remove: '삭제', empty: '등록된 계정이 없음',
                moveUp: '위로 이동', moveDown: '아래로 이동', edit: '편집',
                managerTitle: '뮤트 비표시 계정',
                addCategory: '카테고리 추가', addCategoryPrompt: '추가할 카테고리 이름',
                notice: '프로필의 … 메뉴에서 추가하거나 X 뮤트 목록 페이지를 스크롤하면 자동으로 등록됩니다'
            },
            SC: {
                importSuccess: '静音列表导入完成', importError: '无法导入此静音列表文件',
                renameCategory: '新分类名称',
                deleteCategory: '删除分类后，其中的账号将移至未分类。',
                menuRegistered: 'Custom Extras：已添加到静音列表',
                menuAdd: 'Custom Extras：添加到静音列表', added: '已添加',
                mutedProfile: '这是已静音的用户', showAnyway: '仍然显示',
                notePlaceholder: '隐藏此账号的原因', cancel: '取消', save: '保存',
                category: '分类', uncategorized: '未分类', memo: '备注',
                noMemo: '无备注', remove: '删除', empty: '没有已添加的账号',
                moveUp: '上移', moveDown: '下移', edit: '编辑',
                managerTitle: '隐藏的静音账号', addCategory: '添加分类',
                addCategoryPrompt: '要添加的分类名称',
                notice: '可从个人资料的…菜单添加，或滚动 X 静音列表页面自动导入'
            },
            TC: {
                importSuccess: '靜音列表匯入完成', importError: '無法匯入此靜音列表檔案',
                renameCategory: '新分類名稱',
                deleteCategory: '刪除分類後，其中的帳號將移至未分類。',
                menuRegistered: 'Custom Extras：已加入靜音列表',
                menuAdd: 'Custom Extras：加入靜音列表', added: '已加入',
                mutedProfile: '這是已靜音的使用者', showAnyway: '仍然顯示',
                notePlaceholder: '隱藏此帳號的原因', cancel: '取消', save: '儲存',
                category: '分類', uncategorized: '未分類', memo: '備註',
                noMemo: '無備註', remove: '刪除', empty: '沒有已加入的帳號',
                moveUp: '上移', moveDown: '下移', edit: '編輯',
                managerTitle: '隱藏的靜音帳號', addCategory: '新增分類',
                addCategoryPrompt: '要新增的分類名稱',
                notice: '可從個人資料的…選單加入，或捲動 X 靜音列表頁面自動匯入'
            }
        };
        return texts[settings.language] || texts.J;
    }
    let hiddenCells = new Set();
    let profileHiddenElements = new Set();
    let profileMaskedStyles = new Map();
    let expandedManagerCategories = new Set();
    let scanScheduled = false;
    let importScheduled = false;
    let revealedProfileUsername = '';
    let previousPath = location.pathname;

    function normalizeUsername(value) {
        const username = String(value || '')
            .trim()
            .replace(/^@+/, '')
            .toLowerCase();
        return /^[a-z0-9_]{1,15}$/.test(username) ? username : '';
    }

    function normalizeEntry(value) {
        if (!value || typeof value !== 'object') return null;
        const username = normalizeUsername(value.username);
        if (!username) return null;
        return {
            username,
            name: String(value.name || '').trim(),
            category: String(value.category || '').trim(),
            note: String(value.note || '').trim()
        };
    }

    function loadEntries() {
        let source = [];
        try {
            source = GM_getValue(STORAGE_KEY, []);
        } catch (e) {}

        const result = [];
        for (const value of Array.isArray(source) ? source : []) {
            const entry = normalizeEntry(value);
            if (!entry) continue;
            const existing = result.find(function (item) {
                return item.username === entry.username;
            });
            if (existing) {
                if (!existing.name && entry.name) existing.name = entry.name;
            } else {
                result.push(entry);
            }
        }
        return result;
    }

    function saveEntries(entries) {
        const normalized = [];
        for (const value of entries) {
            const entry = normalizeEntry(value);
            if (!entry) continue;
            const existing = normalized.find(function (item) {
                return item.username === entry.username;
            });
            if (existing) {
                if (entry.name) existing.name = entry.name;
                if (entry.category) existing.category = entry.category;
                if (entry.note) existing.note = entry.note;
            } else {
                normalized.push(entry);
            }
        }
        normalized.sort(function (a, b) {
            return a.username.localeCompare(b.username);
        });
        GM_setValue(STORAGE_KEY, normalized);
        scheduleScan();
        refreshManager();
        return normalized;
    }

    function addEntry(username, name) {
        username = normalizeUsername(username);
        if (!username) return false;

        const entries = loadEntries();
        const existing = entries.find(function (item) {
            return item.username === username;
        });

        if (existing) {
            if (!existing.name && name) {
                existing.name = String(name).trim();
                saveEntries(entries);
            }
            return false;
        }

        entries.push({
            username,
            name: String(name || '').trim(),
            category: '',
            note: ''
        });
        saveEntries(entries);
        return true;
    }

    function removeEntry(username) {
        username = normalizeUsername(username);
        saveEntries(loadEntries().filter(function (item) {
            return item.username !== username;
        }));
    }

    function updateEntry(username, changes) {
        username = normalizeUsername(username);
        const entries = loadEntries();
        const entry = entries.find(function (item) {
            return item.username === username;
        });
        if (!entry) return;
        Object.assign(entry, changes);
        saveEntries(entries);
    }

    function loadCategories() {
        let source = [];
        try {
            source = GM_getValue(CATEGORIES_KEY, []);
        } catch (e) {}
        const result = [];
        for (const value of Array.isArray(source) ? source : []) {
            const category = String(value || '').trim();
            if (category && !result.includes(category)) result.push(category);
        }
        for (const entry of loadEntries()) {
            if (entry.category && !result.includes(entry.category)) {
                result.push(entry.category);
            }
        }
        return result;
    }

    function saveCategories(categories) {
        const result = [];
        for (const value of categories) {
            const category = String(value || '').trim();
            if (category && !result.includes(category)) result.push(category);
        }
        GM_setValue(CATEGORIES_KEY, result);
        refreshManager();
        return result;
    }

    function exportMuteData() {
        const data = {
            format: 'x-custom-extras-muted-users',
            version: 1,
            exportedAt: new Date().toISOString(),
            entries: loadEntries(),
            categories: loadCategories()
        };
        const blob = new Blob([
            JSON.stringify(data, null, 2)
        ], { type: 'text/plain;charset=utf-8' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = 'x-custom-extras-muted-users-' +
            new Date().toISOString().slice(0, 10) + '.txt';
        document.body.appendChild(link);
        link.click();
        link.remove();
        setTimeout(function () {
            URL.revokeObjectURL(url);
        }, 0);
    }

    function importMuteData(file) {
        if (!file) return;
        const reader = new FileReader();
        reader.addEventListener('load', function () {
            try {
                const data = JSON.parse(String(reader.result || ''));
                if (
                    !data ||
                    data.format !== 'x-custom-extras-muted-users' ||
                    !Array.isArray(data.entries)
                ) throw new Error('invalid');

                const merged = new Map(loadEntries().map(function (entry) {
                    return [entry.username, entry];
                }));
                for (const value of data.entries) {
                    const entry = normalizeEntry(value);
                    if (entry) merged.set(entry.username, entry);
                }

                const categories = loadCategories();
                for (const value of Array.isArray(data.categories)
                    ? data.categories
                    : []) {
                    const category = String(value || '').trim();
                    if (category && !categories.includes(category)) {
                        categories.push(category);
                    }
                }
                for (const entry of merged.values()) {
                    if (
                        entry.category &&
                        !categories.includes(entry.category)
                    ) categories.push(entry.category);
                }

                GM_setValue(CATEGORIES_KEY, categories);
                saveEntries(Array.from(merged.values()));
                window.alert(getMuteText().importSuccess);
            } catch (e) {
                window.alert(getMuteText().importError);
            }
        });
        reader.readAsText(file);
    }

    function renameCategory(category) {
        const value = window.prompt(getMuteText().renameCategory, category);
        const nextCategory = String(value || '').trim();
        if (!nextCategory || nextCategory === category) return;

        if (expandedManagerCategories.delete(category)) {
            expandedManagerCategories.add(nextCategory);
        }

        const categories = loadCategories().map(function (item) {
            return item === category ? nextCategory : item;
        });
        GM_setValue(CATEGORIES_KEY, Array.from(new Set(categories)));

        const entries = loadEntries();
        for (const entry of entries) {
            if (entry.category === category) {
                entry.category = nextCategory;
            }
        }
        saveEntries(entries);
    }

    function deleteCategory(category) {
        if (!window.confirm(
            '"' + category + '"\n' + getMuteText().deleteCategory
        )) return;

        expandedManagerCategories.delete(category);

        GM_setValue(
            CATEGORIES_KEY,
            loadCategories().filter(function (item) {
                return item !== category;
            })
        );

        const entries = loadEntries();
        for (const entry of entries) {
            if (entry.category === category) entry.category = '';
        }
        saveEntries(entries);
    }

    function moveCategory(category, offset) {
        const categories = loadCategories();
        const index = categories.indexOf(category);
        const nextIndex = index + offset;
        if (
            index < 0 ||
            nextIndex < 0 ||
            nextIndex >= categories.length
        ) return;
        const temporary = categories[index];
        categories[index] = categories[nextIndex];
        categories[nextIndex] = temporary;
        saveCategories(categories);
    }

    function getTheme() {
        const background = getComputedStyle(document.body).backgroundColor;
        const light = background === 'rgb(255, 255, 255)' ||
            background === 'rgba(0, 0, 0, 0)';
        return light ? {
            background: '#ffffff',
            text: '#0f1419',
            subtext: '#536471',
            border: '#cfd9de'
        } : {
            background: '#000000',
            text: '#e7e9ea',
            subtext: '#71767b',
            border: '#2f3336'
        };
    }

    function showToast(message) {
        document.querySelector('.x-custom-extras-muted-toast')?.remove();
        const toast = document.createElement('div');
        toast.className = 'x-custom-extras-muted-toast';
        toast.textContent = message;
        toast.style.cssText =
            'position:fixed;left:50%;bottom:32px;transform:translateX(-50%);' +
            'z-index:2147483647;padding:10px 16px;border-radius:8px;' +
            'background:var(--x-custom-accent, #1d9bf0);color:#fff;font:700 14px Arial,sans-serif;' +
            'box-shadow:0 4px 18px rgba(0,0,0,.3)';
        document.body.appendChild(toast);
        setTimeout(function () {
            toast.remove();
        }, 1600);
    }

    function getUsernameFromPath(pathname) {
        let decoded = '';
        try {
            decoded = decodeURIComponent(pathname || '');
        } catch (e) {
            decoded = pathname || '';
        }
        const match = decoded.match(/^\/([A-Za-z0-9_]{1,15})(?:\/|$)/);
        return match ? normalizeUsername(match[1]) : '';
    }

    function findProfileName(username) {
        const titleMatch = document.title.match(
            new RegExp('^(.+?)\\s*\\(@' + username + '\\)', 'i')
        );
        if (titleMatch && titleMatch[1].trim()) {
            return titleMatch[1].trim();
        }

        const header = document.querySelector(
            'main [data-testid="UserName"], [data-testid="UserName"]'
        );
        if (!header) return '';

        const texts = Array.from(header.querySelectorAll('span'))
            .map(function (span) {
                return span.textContent.trim();
            })
            .filter(Boolean);

        for (const text of texts) {
            if (text.toLowerCase() === '@' + username) continue;
            if (text.startsWith('@')) continue;
            return text;
        }
        return '';
    }

    function getProfileMenuTarget(menu) {
        const aboutLink = Array.from(menu.querySelectorAll(
            'a[href]'
        )).find(function (link) {
            return /^\/[A-Za-z0-9_]{1,15}\/about\/?$/.test(
                new URL(link.href, location.origin).pathname
            );
        });

        let username = '';
        if (aboutLink) {
            username = getUsernameFromPath(
                new URL(aboutLink.href, location.origin).pathname
            );
        }

        if (!username) {
            const blockText = menu.querySelector(
                '[data-testid="block"]'
            )?.textContent || '';
            const match = blockText.match(/@([A-Za-z0-9_]{1,15})/);
            if (match) username = normalizeUsername(match[1]);
        }

        if (!username) return null;
        return {
            username,
            name: findProfileName(username)
        };
    }

    function replaceMenuItemContent(item, text) {
        item.removeAttribute('data-testid');
        item.removeAttribute('href');
        item.setAttribute('role', 'menuitem');
        item.setAttribute('tabindex', '0');
        item.classList.add(MENU_ITEM_CLASS);
        item.querySelectorAll('[id]').forEach(function (element) {
            element.removeAttribute('id');
        });

        const svg = item.querySelector('svg');
        if (svg) {
            svg.setAttribute('viewBox', '0 0 24 24');
            svg.innerHTML =
                '<g><path d="M11 4h2v7h7v2h-7v7h-2v-7H4v-2h7V4z"></path></g>';
        }

        item.style.setProperty('color', 'var(--x-custom-accent, #1d9bf0)', 'important');
        for (const element of item.querySelectorAll('div, span, svg, path')) {
            element.style.setProperty('color', 'var(--x-custom-accent, #1d9bf0)', 'important');
            if (element.matches('svg, path')) {
                element.style.setProperty('fill', 'var(--x-custom-accent, #1d9bf0)', 'important');
            }
        }

        const spans = item.querySelectorAll('span');
        const label = spans[spans.length - 1];
        if (label) label.textContent = text;
    }

    function closeMenu(menu, afterClose) {
        const escapeEvent = {
            key: 'Escape',
            code: 'Escape',
            bubbles: true
        };
        document.dispatchEvent(new KeyboardEvent('keydown', escapeEvent));
        window.dispatchEvent(new KeyboardEvent('keydown', escapeEvent));

        setTimeout(function () {
            if (menu.isConnected) {
                const layers = document.getElementById('layers');
                let menuLayer = menu;
                if (layers && layers.contains(menu)) {
                    while (
                        menuLayer.parentElement &&
                        menuLayer.parentElement !== layers
                    ) {
                        menuLayer = menuLayer.parentElement;
                    }
                }
                menuLayer.remove();
            }
            if (typeof afterClose === 'function') afterClose();
        }, 0);
    }

    function addProfileMenuItem(menu) {
        if (menu.querySelector('.' + MENU_ITEM_CLASS)) return;
        const target = getProfileMenuTarget(menu);
        if (!target) return;

        const items = menu.querySelectorAll('[role="menuitem"]');
        const source = items[items.length - 1];
        if (!source) return;

        const item = source.cloneNode(true);
        const exists = loadEntries().some(function (entry) {
            return entry.username === target.username;
        });
        replaceMenuItemContent(
            item,
            exists
                ? getMuteText().menuRegistered
                : getMuteText().menuAdd
        );

        function activate(event) {
            event.preventDefault();
            event.stopPropagation();
            event.stopImmediatePropagation();
            if (exists) {
                closeMenu(menu, openManager);
                return;
            } else {
                addEntry(target.username, target.name);
                showToast(
                    (target.name ? target.name + '  ' : '') +
                    '@' + target.username + ' ' + getMuteText().added
                );
            }
            closeMenu(menu);
        }

        item.addEventListener('click', activate, true);
        item.addEventListener('keydown', function (event) {
            if (event.key === 'Enter' || event.key === ' ') {
                activate(event);
            }
        }, true);
        source.parentElement.appendChild(item);
    }

    function scanProfileMenus() {
        for (const menu of document.querySelectorAll('[role="menu"]')) {
            if (!menu.querySelector('[data-testid="mute"]')) continue;
            addProfileMenuItem(menu);
        }
    }

    function getUserCellEntry(cell) {
        const spans = Array.from(cell.querySelectorAll('span'))
            .map(function (span) {
                return span.textContent.trim();
            })
            .filter(Boolean);

        let username = '';
        let handleIndex = -1;
        for (let index = 0; index < spans.length; index++) {
            const match = spans[index].match(/^@([A-Za-z0-9_]{1,15})$/);
            if (!match) continue;
            username = normalizeUsername(match[1]);
            handleIndex = index;
            break;
        }

        if (!username) {
            for (const link of cell.querySelectorAll('a[href]')) {
                const pathUsername = getUsernameFromPath(
                    new URL(link.href, location.origin).pathname
                );
                if (pathUsername) {
                    username = pathUsername;
                    break;
                }
            }
        }

        if (!username) return null;

        let name = '';
        for (let index = handleIndex - 1; index >= 0; index--) {
            const text = spans[index];
            if (!text || text.startsWith('@')) continue;
            name = text;
            break;
        }

        return { username, name };
    }

    function importVisibleXMutedUsers() {
        if (!/^\/settings\/muted\/all\/?$/.test(location.pathname)) {
            return;
        }

        const entries = loadEntries();
        let changed = false;

        for (const cell of document.querySelectorAll(
            '[data-testid="UserCell"]'
        )) {
            const entry = getUserCellEntry(cell);
            if (!entry) continue;
            const existing = entries.find(function (item) {
                return item.username === entry.username;
            });
            if (!existing) {
                entries.push(entry);
                changed = true;
            } else if (!existing.name && entry.name) {
                existing.name = entry.name;
                changed = true;
            }
        }

        if (changed) saveEntries(entries);
    }

    function extractStatusUsernames(article) {
        const usernames = new Set();

        for (const link of article.querySelectorAll('a[href*="/status/"]')) {
            let pathname = '';
            try {
                pathname = new URL(link.href, location.origin).pathname;
            } catch (e) {
                continue;
            }
            const match = pathname.match(
                /^\/([A-Za-z0-9_]{1,15})\/status\/\d+/
            );
            if (match) usernames.add(normalizeUsername(match[1]));
        }

        const socialContext = article.querySelector(
            '[data-testid="socialContext"]'
        );
        if (socialContext) {
            for (const link of socialContext.querySelectorAll('a[href]')) {
                let pathname = '';
                try {
                    pathname = new URL(link.href, location.origin).pathname;
                } catch (e) {
                    continue;
                }
                const username = getUsernameFromPath(pathname);
                if (username) usernames.add(username);
            }

            const textMatch = socialContext.textContent.match(
                /@([A-Za-z0-9_]{1,15})/
            );
            if (textMatch) {
                usernames.add(normalizeUsername(textMatch[1]));
            }
        }

        usernames.delete('');
        return usernames;
    }

    function restoreHiddenCells() {
        for (const cell of hiddenCells) {
            if (!cell.isConnected) continue;
            cell.style.removeProperty('display');
            delete cell.dataset.customExtrasMutedHidden;
        }
        hiddenCells.clear();
    }

    function applyMutedFilter() {
        const mutedProfile = getCurrentMutedProfile();
        if (mutedProfile) {
            restoreHiddenCells();
            return;
        }

        if (/\/[A-Za-z0-9_]{1,15}\/status\/\d+/.test(
            location.pathname
        )) {
            restoreHiddenCells();
            return;
        }

        const muted = new Set(loadEntries().map(function (entry) {
            return entry.username;
        }));

        const seenCells = new Set();
        for (const article of document.querySelectorAll(
            'article[data-testid="tweet"], article'
        )) {
            const cell = article.closest('[data-testid="cellInnerDiv"]');
            if (!cell || seenCells.has(cell)) continue;
            seenCells.add(cell);

            const usernames = extractStatusUsernames(article);
            const shouldHide = Array.from(usernames).some(function (username) {
                return muted.has(username);
            });

            if (shouldHide) {
                cell.style.setProperty('display', 'none', 'important');
                cell.dataset.customExtrasMutedHidden = 'true';
                hiddenCells.add(cell);
            } else if (cell.dataset.customExtrasMutedHidden === 'true') {
                cell.style.removeProperty('display');
                delete cell.dataset.customExtrasMutedHidden;
                hiddenCells.delete(cell);
            }
        }

        for (const cell of Array.from(hiddenCells)) {
            if (!cell.isConnected) hiddenCells.delete(cell);
        }
    }

    function getCurrentProfileUsername() {
        const directMatch = location.pathname.match(
            /^\/([A-Za-z0-9_]{1,15})(?:\/(?:with_replies|media|likes|highlights|articles))?\/?$/
        );
        if (directMatch) return normalizeUsername(directMatch[1]);

        const candidates = new Map();
        for (const tab of document.querySelectorAll(
            '[data-testid="primaryColumn"] [role="tab"][href]'
        )) {
            let pathname = '';
            try {
                pathname = new URL(tab.href, location.origin).pathname;
            } catch (e) {
                continue;
            }
            const match = pathname.match(
                /^\/([A-Za-z0-9_]{1,15})(?:\/(?:with_replies|media|likes|highlights|articles))?\/?$/
            );
            if (!match) continue;
            const username = normalizeUsername(match[1]);
            if (!username) continue;
            candidates.set(username, (candidates.get(username) || 0) + 1);
        }

        for (const [username, count] of candidates) {
            if (count >= 2) return username;
        }
        return '';
    }

    function getCurrentMutedProfile() {
        const username = getCurrentProfileUsername();
        if (!username) return null;
        return loadEntries().find(function (entry) {
            return entry.username === username;
        }) || null;
    }

    function restoreMutedProfile() {
        for (const element of profileHiddenElements) {
            if (!element.isConnected) continue;
            element.style.removeProperty('display');
            delete element.dataset.customExtrasMutedProfileHidden;
        }
        profileHiddenElements.clear();
        for (const [element, properties] of profileMaskedStyles) {
            if (!element.isConnected) continue;
            for (const [property, original] of properties) {
                if (original.value) {
                    element.style.setProperty(
                        property,
                        original.value,
                        original.priority
                    );
                } else {
                    element.style.removeProperty(property);
                }
            }
        }
        profileMaskedStyles.clear();
        document.querySelector(
            '.x-custom-extras-muted-profile-gate'
        )?.remove();
    }

    function hideMutedProfileElement(element) {
        if (!element || element.dataset.customExtrasMutedProfileHidden) {
            return;
        }
        element.style.setProperty('display', 'none', 'important');
        element.dataset.customExtrasMutedProfileHidden = 'true';
        profileHiddenElements.add(element);
    }

    function setMutedProfileStyle(element, property, value, priority) {
        if (!element) return;
        if (!profileMaskedStyles.has(element)) {
            profileMaskedStyles.set(element, new Map());
        }
        const properties = profileMaskedStyles.get(element);
        if (!properties.has(property)) {
            properties.set(property, {
                value: element.style.getPropertyValue(property),
                priority: element.style.getPropertyPriority(property)
            });
        }
        element.style.setProperty(property, value, priority || '');
    }

    function revealMutedProfile() {
        revealedProfileUsername = getCurrentProfileUsername();
        restoreMutedProfile();
        restoreHiddenCells();
    }

    function applyMutedProfileGate() {
        const entry = getCurrentMutedProfile();
        if (
            !entry ||
            revealedProfileUsername === entry.username
        ) {
            restoreMutedProfile();
            return;
        }

        const column = document.querySelector(
            '[data-testid="primaryColumn"]'
        );
        if (!column) return;

        const tabList = column.querySelector('[role="tablist"]');
        const tabContainer =
            tabList?.closest('[role="navigation"]') ||
            tabList?.closest('[data-testid="cellInnerDiv"]') ||
            tabList?.parentElement ||
            null;
        const timelineRegions = Array.from(column.querySelectorAll(
            'section[role="region"]'
        )).filter(function (section) {
            return section.querySelector(
                '[data-testid="cellInnerDiv"], article[data-testid="tweet"]'
            );
        });

        hideMutedProfileElement(tabContainer);

        const description = column.querySelector(
            '[data-testid="UserDescription"]'
        );
        const profileItems = column.querySelector(
            '[data-testid="UserProfileHeader_Items"]'
        );
        hideMutedProfileElement(
            description?.closest('div.r-1adg3ll.r-6gpygo') ||
            description?.parentElement
        );
        hideMutedProfileElement(
            profileItems?.closest('div.r-1adg3ll.r-6gpygo') ||
            profileItems?.parentElement
        );

        const followingLink = column.querySelector(
            'a[href="/' + entry.username + '/following"]'
        );
        const followStats = followingLink?.parentElement?.parentElement || null;
        hideMutedProfileElement(followStats);
        if (
            followStats?.nextElementSibling &&
            !followStats.nextElementSibling.querySelector('[role="tablist"]')
        ) {
            hideMutedProfileElement(followStats.nextElementSibling);
        }

        const headerPhoto = column.querySelector(
            'a[href="/' + entry.username + '/header_photo"]'
        );
        if (headerPhoto) {
            const maskColor = getTheme().background === '#ffffff'
                ? '#cfd9de'
                : '#16181c';
            setMutedProfileStyle(
                headerPhoto,
                'background-color',
                maskColor,
                'important'
            );
            for (const image of headerPhoto.querySelectorAll(
                'img, [style*="background-image"]'
            )) {
                setMutedProfileStyle(
                    image,
                    'visibility',
                    'hidden',
                    'important'
                );
            }
        }

        for (const region of timelineRegions) {
            hideMutedProfileElement(region);
        }
        if (!timelineRegions.length) {
            for (const article of column.querySelectorAll('article')) {
                hideMutedProfileElement(
                    article.closest('[data-testid="cellInnerDiv"]') ||
                    article
                );
            }
        }

        let gate = column.querySelector(
            '.x-custom-extras-muted-profile-gate'
        );
        if (gate) return;

        const theme = getTheme();
        gate = document.createElement('div');
        gate.className = 'x-custom-extras-muted-profile-gate';
        gate.style.cssText =
            'padding:34px 20px;text-align:center;border-top:1px solid ' +
            theme.border + ';border-bottom:1px solid ' + theme.border +
            ';background:' + theme.background + ';color:' + theme.text;

        const message = document.createElement('div');
        message.textContent = getMuteText().mutedProfile;
        message.style.cssText =
            'font-size:17px;font-weight:700;margin-bottom:14px';

        const button = document.createElement('button');
        button.type = 'button';
        button.textContent = getMuteText().showAnyway;
        button.style.cssText =
            'border:1px solid var(--x-custom-accent, #1d9bf0);border-radius:999px;' +
            'padding:8px 18px;background:var(--x-custom-accent, #1d9bf0);color:#ffffff;' +
            'font-size:14px;font-weight:700;cursor:pointer';
        button.addEventListener('click', revealMutedProfile);
        gate.append(message, button);

        const firstTimelineRegion = timelineRegions[0] || null;
        if (tabContainer && tabContainer.parentElement) {
            tabContainer.parentElement.insertBefore(gate, tabContainer);
        } else if (firstTimelineRegion?.parentElement) {
            firstTimelineRegion.parentElement.insertBefore(
                gate,
                firstTimelineRegion
            );
        } else {
            column.appendChild(gate);
        }
    }

    function closeManager() {
        document.querySelector('.' + MANAGER_CLASS)?.remove();
    }

    function openNoteEditor(entry) {
        const manager = document.querySelector('.' + MANAGER_CLASS);
        if (!manager) return;
        manager.querySelector('[data-note-editor]')?.remove();

        const theme = getTheme();
        const overlay = document.createElement('div');
        overlay.dataset.noteEditor = 'true';
        overlay.style.cssText =
            'position:absolute;inset:0;z-index:3;background:rgba(0,0,0,.45);' +
            'display:flex;align-items:center;justify-content:center;padding:20px';

        const box = document.createElement('div');
        box.style.cssText =
            'width:100%;max-width:360px;padding:16px;border:1px solid ' +
            theme.border + ';border-radius:14px;background:' +
            theme.background + ';color:' + theme.text;

        const title = document.createElement('strong');
        title.textContent =
            (entry.name ? entry.name + '  ' : '') + '@' + entry.username;

        const textarea = document.createElement('textarea');
        textarea.value = entry.note || '';
        textarea.placeholder = getMuteText().notePlaceholder;
        textarea.style.cssText =
            'display:block;width:100%;height:110px;margin:12px 0;' +
            'padding:10px;resize:vertical;box-sizing:border-box;' +
            'border:1px solid ' + theme.border + ';border-radius:8px;' +
            'background:' + theme.background + ';color:' + theme.text +
            ';font:14px Arial,sans-serif';

        const actions = document.createElement('div');
        actions.style.cssText =
            'display:flex;justify-content:flex-end;gap:8px';

        const cancel = document.createElement('button');
        cancel.type = 'button';
        cancel.textContent = getMuteText().cancel;

        const save = document.createElement('button');
        save.type = 'button';
        save.textContent = getMuteText().save;

        for (const button of [cancel, save]) {
            button.style.cssText =
                'border:1px solid ' + theme.border + ';border-radius:999px;' +
                'padding:7px 14px;background:transparent;color:' +
                theme.text + ';cursor:pointer;font-weight:700';
        }
        save.style.background = 'var(--x-custom-accent, #1d9bf0)';
        save.style.color = '#ffffff';
        save.style.borderColor = 'var(--x-custom-accent, #1d9bf0)';

        cancel.addEventListener('click', function () {
            overlay.remove();
        });
        save.addEventListener('click', function () {
            updateEntry(entry.username, {
                note: textarea.value.trim()
            });
            overlay.remove();
        });
        overlay.addEventListener('click', function (event) {
            if (event.target === overlay) overlay.remove();
        });

        actions.append(cancel, save);
        box.append(title, textarea, actions);
        overlay.appendChild(box);
        manager.appendChild(overlay);
        textarea.focus();
    }

    function createProfileLink(entry) {
        const link = document.createElement('button');
        link.type = 'button';
        link.textContent = '@' + entry.username;
        link.style.cssText =
            'border:0;padding:0;background:transparent;color:var(--x-custom-accent, #1d9bf0);' +
            'text-decoration:none;flex:0 0 auto;cursor:pointer;font:inherit;' +
            'filter:brightness(0.67) saturate(0.80)';
        link.addEventListener('click', function (event) {
            event.preventDefault();
            event.stopPropagation();
            event.stopImmediatePropagation();
            const url = 'https://x.com/' + entry.username;
            if (typeof GM_openInTab === 'function') {
                GM_openInTab(url, {
                    active: true,
                    insert: true,
                    setParent: true
                });
            } else {
                window.open(url, '_blank', 'noopener,noreferrer');
            }
        }, true);
        return link;
    }

    function createManagerRow(entry, categories, theme) {
        const row = document.createElement('div');
        row.style.cssText =
            'display:flex;align-items:center;gap:7px;padding:8px 4px;' +
            'border-bottom:1px solid ' + theme.border + ';font-size:13px';

        const identity = document.createElement('div');
        identity.style.cssText =
            'min-width:0;flex:1;display:flex;align-items:baseline;' +
            'gap:7px;white-space:nowrap;overflow:hidden';

        if (entry.name) {
            const name = document.createElement('span');
            name.textContent = entry.name;
            name.style.cssText =
                'font-weight:700;overflow:hidden;text-overflow:ellipsis';
            identity.appendChild(name);
        }
        identity.appendChild(createProfileLink(entry));

        const category = document.createElement('select');
        category.title = getMuteText().category;
        category.style.cssText =
            'width:98px;height:26px;box-sizing:border-box;' +
            'border:1px solid ' + theme.border + ';border-radius:999px;' +
            'padding:4px 8px;background:' + theme.background + ';color:' +
            theme.text + ';font-size:11px;font-weight:700';
        const none = document.createElement('option');
        none.value = '';
        none.textContent = getMuteText().uncategorized;
        category.appendChild(none);
        for (const value of categories) {
            const option = document.createElement('option');
            option.value = value;
            option.textContent = value;
            category.appendChild(option);
        }
        category.value = entry.category || '';
        category.addEventListener('change', function () {
            updateEntry(entry.username, {
                category: category.value
            });
        });

        const memo = document.createElement('button');
        memo.type = 'button';
        memo.textContent = getMuteText().memo;
        memo.title = entry.note || getMuteText().noMemo;
        memo.style.cssText =
            'border:1px solid ' + theme.border + ';border-radius:999px;' +
            'padding:4px 8px;background:transparent;color:' + theme.text +
            ';cursor:pointer;font-size:11px;font-weight:700;' +
            'transition:opacity .12s ease .5s';
        if (entry.note) {
            memo.style.opacity = '1';
            memo.style.visibility = 'visible';
        } else {
            memo.style.opacity = '0';
            memo.style.visibility = 'hidden';
        }
        memo.addEventListener('click', function () {
            openNoteEditor(entry);
        });

        let hoverTimer = 0;
        row.addEventListener('mouseenter', function () {
            if (entry.note) return;
            clearTimeout(hoverTimer);
            hoverTimer = setTimeout(function () {
                memo.style.visibility = 'visible';
                memo.style.opacity = '1';
            }, 500);
        });
        row.addEventListener('mouseleave', function () {
            if (entry.note) return;
            clearTimeout(hoverTimer);
            memo.style.opacity = '0';
            setTimeout(function () {
                if (memo.style.opacity === '0') {
                    memo.style.visibility = 'hidden';
                }
            }, 120);
        });

        const remove = document.createElement('button');
        remove.type = 'button';
        remove.textContent = getMuteText().remove;
        remove.style.cssText =
            'border:1px solid ' + theme.border + ';border-radius:999px;' +
            'height:26px;box-sizing:border-box;padding:4px 8px;' +
            'background:transparent;color:' + theme.text +
            ';cursor:pointer;font-size:11px;font-weight:700';
        remove.addEventListener('click', function () {
            removeEntry(entry.username);
        });

        row.append(identity, category, memo, remove);
        return row;
    }

    function refreshManager() {
        const manager = document.querySelector('.' + MANAGER_CLASS);
        if (!manager) return;

        const list = manager.querySelector('[data-muted-list]');
        const count = manager.querySelector('[data-muted-count]');
        const theme = getTheme();
        const entries = loadEntries();
        const categories = loadCategories();
        count.textContent = String(entries.length);
        list.textContent = '';

        if (!entries.length) {
            const empty = document.createElement('div');
            empty.textContent = getMuteText().empty;
            empty.style.cssText =
                'padding:20px 8px;text-align:center;color:' +
                theme.subtext;
            list.appendChild(empty);
            return;
        }

        const groups = [''].concat(categories);
        for (const category of groups) {
            const members = entries.filter(function (entry) {
                return (entry.category || '') === category;
            });
            if (!members.length && !category) continue;

            const section = document.createElement('section');
            const headingRow = document.createElement('div');
            headingRow.style.cssText =
                'position:relative;display:flex;align-items:center;' +
                'border-bottom:1px solid ' +
                theme.border + ';background:' + theme.background;
            const heading = document.createElement('button');
            heading.type = 'button';
            heading.style.cssText =
                'min-width:0;flex:1;display:flex;align-items:center;gap:5px;' +
                'padding:11px 4px 8px;border:0;background:transparent;' +
                'color:var(--x-custom-accent, #1d9bf0);font-size:15px;font-weight:800;' +
                'cursor:pointer;text-align:left';

            const arrow = document.createElementNS(
                'http://www.w3.org/2000/svg', 'svg'
            );
            arrow.setAttribute('viewBox', '0 -960 960 960');
            arrow.setAttribute('width', '20');
            arrow.setAttribute('height', '20');
            arrow.setAttribute('fill', 'currentColor');
            const arrowPath = document.createElementNS(
                'http://www.w3.org/2000/svg', 'path'
            );
            arrowPath.setAttribute(
                'd', 'M400-280v-400l200 200-200 200Z'
            );
            arrow.appendChild(arrowPath);

            const headingText = document.createElement('span');
            headingText.textContent =
                (category || getMuteText().uncategorized) +
                ' (' + members.length + ')';
            heading.append(arrow, headingText);

            const categoryActions = document.createElement('div');
            categoryActions.style.cssText =
                'position:absolute;right:4px;display:flex;align-items:center;' +
                'gap:5px;padding-left:10px;background:' + theme.background +
                ';visibility:hidden;opacity:0;transition:opacity .12s ease';

            if (category) {
                const categoryIndex = categories.indexOf(category);
                const moveUp = document.createElement('button');
                moveUp.type = 'button';
                moveUp.textContent = '↑';
                moveUp.title = getMuteText().moveUp;
                const moveDown = document.createElement('button');
                moveDown.type = 'button';
                moveDown.textContent = '↓';
                moveDown.title = getMuteText().moveDown;
                const editCategory = document.createElement('button');
                editCategory.type = 'button';
                editCategory.textContent = getMuteText().edit;
                const removeCategory = document.createElement('button');
                removeCategory.type = 'button';
                removeCategory.textContent = getMuteText().remove;

                for (const button of [
                    moveUp,
                    moveDown,
                    editCategory,
                    removeCategory
                ]) {
                    button.style.cssText =
                        'height:26px;box-sizing:border-box;border:1px solid ' +
                        theme.border + ';border-radius:999px;padding:4px 8px;' +
                        'background:transparent;color:' + theme.text + ';' +
                        'font-size:11px;font-weight:700;cursor:pointer';
                }
                moveUp.disabled = categoryIndex === 0;
                moveDown.disabled = categoryIndex === categories.length - 1;
                for (const button of [moveUp, moveDown]) {
                    if (button.disabled) {
                        button.style.opacity = '.35';
                        button.style.cursor = 'default';
                    }
                }
                moveUp.addEventListener('click', function () {
                    moveCategory(category, -1);
                });
                moveDown.addEventListener('click', function () {
                    moveCategory(category, 1);
                });
                editCategory.addEventListener('click', function () {
                    renameCategory(category);
                });
                removeCategory.addEventListener('click', function () {
                    deleteCategory(category);
                });
                categoryActions.append(
                    moveUp,
                    moveDown,
                    editCategory,
                    removeCategory
                );

                let categoryHoverTimer = 0;
                headingRow.addEventListener('mouseenter', function () {
                    clearTimeout(categoryHoverTimer);
                    categoryHoverTimer = setTimeout(function () {
                        categoryActions.style.visibility = 'visible';
                        categoryActions.style.opacity = '1';
                    }, 500);
                });
                headingRow.addEventListener('mouseleave', function () {
                    clearTimeout(categoryHoverTimer);
                    categoryActions.style.opacity = '0';
                    setTimeout(function () {
                        if (categoryActions.style.opacity === '0') {
                            categoryActions.style.visibility = 'hidden';
                        }
                    }, 120);
                });
            }

            const body = document.createElement('div');
            const expanded = expandedManagerCategories.has(category);
            body.style.display = expanded ? 'block' : 'none';
            arrowPath.setAttribute(
                'd',
                expanded
                    ? 'M480-360 280-560h400L480-360Z'
                    : 'M400-280v-400l200 200-200 200Z'
            );

            for (const entry of members) {
                body.appendChild(
                    createManagerRow(entry, categories, theme)
                );
            }

            heading.addEventListener('click', function () {
                const expanded = body.style.display !== 'none';
                body.style.display = expanded ? 'none' : 'block';
                if (expanded) {
                    expandedManagerCategories.delete(category);
                } else {
                    expandedManagerCategories.add(category);
                }
                arrowPath.setAttribute(
                    'd',
                    expanded
                        ? 'M400-280v-400l200 200-200 200Z'
                        : 'M480-360 280-560h400L480-360Z'
                );
            });

            headingRow.append(heading, categoryActions);
            section.append(headingRow, body);
            list.appendChild(section);
        }
    }

    function openManager() {
        closeManager();
        expandedManagerCategories.clear();
        const theme = getTheme();
        const overlay = document.createElement('div');
        overlay.className = MANAGER_CLASS;
        overlay.style.cssText =
            'position:fixed;inset:0;z-index:2147483646;' +
            'background:rgba(0,0,0,.45);display:flex;align-items:center;' +
            'justify-content:center;padding:20px;font-family:Arial,sans-serif';

        const panel = document.createElement('div');
        panel.style.cssText =
            'width:min(550px,100%);max-height:72vh;display:flex;' +
            'flex-direction:column;border:1px solid ' + theme.border + ';' +
            'border-radius:16px;background:' + theme.background + ';' +
            'color:' + theme.text + ';box-shadow:0 10px 40px rgba(0,0,0,.4)';

        const header = document.createElement('div');
        header.style.cssText =
            'display:flex;align-items:center;padding:14px 16px;' +
            'border-bottom:1px solid ' + theme.border;

        const title = document.createElement('strong');
        title.innerHTML =
            '✦ ' + getMuteText().managerTitle +
            ' : <span data-muted-count></span>';
        title.style.fontSize = '18px';

        const addCategory = document.createElement('button');
        addCategory.type = 'button';
        addCategory.textContent = getMuteText().addCategory;
        addCategory.style.cssText =
            'margin-left:auto;border:1px solid ' +
            'var(--x-custom-accent, #1d9bf0);' +
            'border-radius:999px;padding:5px 9px;background:' +
            'var(--x-custom-accent, #1d9bf0);color:' +
            (isLightTheme() ? '#0f1419' : '#ffffff') +
            ';font-size:11px;font-weight:700;cursor:pointer';
        addCategory.addEventListener('click', function () {
            const value = window.prompt(getMuteText().addCategoryPrompt);
            const category = String(value || '').trim();
            if (!category) return;
            const categories = loadCategories();
            if (!categories.includes(category)) {
                categories.push(category);
                saveCategories(categories);
            }
        });

        const importButton = document.createElement('button');
        importButton.type = 'button';
        importButton.innerHTML =
            '<span class="x-muted-transfer-full">Import</span>' +
            '<span class="x-muted-transfer-short">I</span>';
        const exportButton = document.createElement('button');
        exportButton.type = 'button';
        exportButton.innerHTML =
            '<span class="x-muted-transfer-full">Export</span>' +
            '<span class="x-muted-transfer-short">E</span>';
        for (const button of [importButton, exportButton]) {
            button.style.cssText =
                'border:1px solid ' + theme.border + ';' +
                'border-radius:999px;padding:5px 9px;background:transparent;' +
                'color:' + theme.text + ';font-size:11px;font-weight:700;' +
                'cursor:pointer;white-space:nowrap';
        }

        const transferButtons = document.createElement('div');
        transferButtons.style.cssText =
            'display:flex;align-items:center;gap:2px;margin-left:6px';
        transferButtons.append(importButton, exportButton);

        const responsiveStyle = document.createElement('style');
        responsiveStyle.textContent =
            '.' + MANAGER_CLASS + ' .x-muted-transfer-short{display:none}' +
            '@media (max-width:600px){' +
            '.' + MANAGER_CLASS + ' .x-muted-transfer-full{display:none}' +
            '.' + MANAGER_CLASS + ' .x-muted-transfer-short{display:inline}' +
            '}';

        const importInput = document.createElement('input');
        importInput.type = 'file';
        importInput.accept = 'text/plain,.txt,application/json,.json';
        importInput.style.display = 'none';
        importButton.addEventListener('click', function () {
            importInput.value = '';
            importInput.click();
        });
        importInput.addEventListener('change', function () {
            importMuteData(importInput.files?.[0]);
        });
        exportButton.addEventListener('click', exportMuteData);

        const close = document.createElement('button');
        close.type = 'button';
        close.textContent = '×';
        close.style.cssText =
            'margin-left:8px;border:0;background:transparent;color:' +
            theme.text + ';font-size:26px;line-height:1;cursor:pointer';
        close.addEventListener('click', closeManager);

        const notice = document.createElement('div');
        notice.textContent = getMuteText().notice;
        notice.style.cssText =
            'padding:10px 16px;color:' + theme.subtext +
            ';font-size:13px;line-height:1.4;white-space:pre-line;' +
            'border-bottom:1px solid ' +
            theme.border;

        const list = document.createElement('div');
        list.dataset.mutedList = 'true';
        list.style.cssText =
            'overflow:auto;padding:0 12px 10px';

        header.append(
            title,
            addCategory,
            transferButtons,
            importInput,
            close
        );
        panel.append(header, notice, list);
        overlay.append(responsiveStyle, panel);
        overlay.addEventListener('click', function (event) {
            if (event.target === overlay) closeManager();
        });
        document.body.appendChild(overlay);
        refreshManager();
    }

    function scheduleImport() {
        if (importScheduled) return;
        importScheduled = true;
        requestAnimationFrame(function () {
            importScheduled = false;
            importVisibleXMutedUsers();
        });
    }

    function scheduleScan() {
        if (scanScheduled) return;
        scanScheduled = true;
        requestAnimationFrame(function () {
            scanScheduled = false;
            if (previousPath !== location.pathname) {
                previousPath = location.pathname;
                restoreMutedProfile();
                const currentProfileUsername =
                    getCurrentProfileUsername();
                if (
                    !currentProfileUsername ||
                    currentProfileUsername !== revealedProfileUsername
                ) {
                    revealedProfileUsername = '';
                }
            }
            scanProfileMenus();
            applyMutedProfileGate();
            applyMutedFilter();
            scheduleImport();
        });
    }


        function scan() {
            document.documentElement.style.setProperty(
                '--x-custom-accent',
                getAccentColor()
            );
            if (!isEnabled(settings.hideMutedAccounts)) {
                restoreHiddenCells();
                restoreMutedProfile();
                closeManager();
                for (const item of document.querySelectorAll(
                    '.' + MENU_ITEM_CLASS
                )) item.remove();
                return;
            }
            scheduleScan();
        }

        return {
            scan,
            openManager
        };
    })();
    mutedUserFeature.scan();
})();
