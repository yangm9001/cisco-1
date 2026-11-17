/* ==========================================================
   Cisco IOS Study Guide: interactive features
   1. Copy buttons on terminal blocks (copies commands only)
   2. "Mark as reviewed" checkboxes with a progress bar
   3. Quiz controls: reveal all, hide all, shuffle
   4. Contents list highlights the section you are reading
   5. Quiz answers open automatically when printing
   ========================================================== */

(() => {
    "use strict";

    const $ = (selector, root = document) => root.querySelector(selector);
    const $$ = (selector, root = document) => Array.from(root.querySelectorAll(selector));

    // Progress is saved in the browser. If storage is blocked, everything still works.
    const STORAGE_PREFIX = "cisco-study-guide:reviewed:";
    const store = {
        get(key) {
            try { return localStorage.getItem(STORAGE_PREFIX + key); } catch { return null; }
        },
        set(key, value) {
            try { localStorage.setItem(STORAGE_PREFIX + key, value); } catch { /* ignore */ }
        },
        remove(key) {
            try { localStorage.removeItem(STORAGE_PREFIX + key); } catch { /* ignore */ }
        }
    };

    /* ---------- 1. Copy buttons ---------- */

    // Strip the prompts so you copy what you would actually type.
    function commandsFrom(pre) {
        const clone = pre.cloneNode(true);
        $$(".p-user, .p-priv, .p-global, .p-iface, .p-line", clone).forEach(el => el.remove());
        return clone.textContent
            .split("\n")
            .map(line => line.trim())
            .filter(Boolean)
            .join("\n");
    }

    async function copyText(text) {
        if (navigator.clipboard && window.isSecureContext) {
            await navigator.clipboard.writeText(text);
            return;
        }
        // Fallback for pages opened straight from a file
        const box = document.createElement("textarea");
        box.value = text;
        box.setAttribute("readonly", "");
        box.style.position = "fixed";
        box.style.opacity = "0";
        document.body.appendChild(box);
        box.select();
        const ok = document.execCommand("copy");
        box.remove();
        if (!ok) throw new Error("Copy failed");
    }

    function addCopyButtons() {
        $$("pre.terminal").forEach(pre => {
            const wrap = document.createElement("div");
            wrap.className = "terminal-wrap";
            pre.parentNode.insertBefore(wrap, pre);
            wrap.appendChild(pre);

            const button = document.createElement("button");
            button.type = "button";
            button.className = "copy-btn";
            button.textContent = "Copy commands";
            button.setAttribute("aria-label", "Copy the commands in this example");
            wrap.appendChild(button);

            let timer;
            button.addEventListener("click", async () => {
                clearTimeout(timer);
                try {
                    await copyText(commandsFrom(pre));
                    button.textContent = "Copied";
                } catch {
                    button.textContent = "Copy failed";
                }
                timer = setTimeout(() => { button.textContent = "Copy commands"; }, 1800);
            });
        });
    }

    /* ---------- 2. Reviewed checkboxes and progress ---------- */

    function addProgress() {
        const toc = $(".toc");
        const topics = $$(".topic[id]");
        if (!toc || !topics.length) return;

        const summary = document.createElement("div");
        summary.className = "progress";
        summary.innerHTML =
            '<label for="progress-bar" class="progress-text"></label>' +
            '<progress id="progress-bar" max="' + topics.length + '" value="0"></progress>' +
            '<button type="button" class="link-btn" id="reset-progress">Reset</button>';
        toc.appendChild(summary);

        const text = $(".progress-text", summary);
        const bar = $("progress", summary);

        function refresh() {
            const done = topics.filter(t => $("input.reviewed-box", t).checked).length;
            bar.value = done;
            text.textContent = done + " of " + topics.length + " sections reviewed";
            topics.forEach(t => {
                const link = $('.toc a[href="#' + t.id + '"]');
                if (link) link.classList.toggle("is-reviewed", $("input.reviewed-box", t).checked);
            });
        }

        topics.forEach(topic => {
            const label = document.createElement("label");
            label.className = "reviewed";
            label.innerHTML = '<input type="checkbox" class="reviewed-box"> Mark as reviewed';
            const box = $("input", label);
            box.checked = store.get(topic.id) === "1";
            box.addEventListener("change", () => {
                if (box.checked) store.set(topic.id, "1"); else store.remove(topic.id);
                refresh();
            });
            $("h2", topic).insertAdjacentElement("afterend", label);
        });

        $("#reset-progress", summary).addEventListener("click", () => {
            topics.forEach(t => {
                $("input.reviewed-box", t).checked = false;
                store.remove(t.id);
            });
            refresh();
        });

        refresh();
    }

    /* ---------- 3. Quiz controls ---------- */

    function addQuizTools() {
        const quiz = $("#quiz");
        const cards = $$("details.check", quiz || document);
        if (!quiz || !cards.length) return;

        const tools = document.createElement("div");
        tools.className = "quiz-tools";
        tools.innerHTML =
            '<button type="button" data-action="reveal">Reveal all</button>' +
            '<button type="button" data-action="hide">Hide all</button>' +
            '<button type="button" data-action="shuffle">Shuffle</button>' +
            '<span class="quiz-count" role="status" aria-live="polite"></span>';
        cards[0].insertAdjacentElement("beforebegin", tools);

        const count = $(".quiz-count", tools);
        const updateCount = () => {
            const open = $$("details.check", quiz).filter(d => d.open).length;
            count.textContent = open + " of " + cards.length + " answers shown";
        };

        cards.forEach(card => card.addEventListener("toggle", updateCount));

        tools.addEventListener("click", event => {
            const action = event.target.dataset && event.target.dataset.action;
            if (!action) return;

            if (action === "reveal") $$("details.check", quiz).forEach(d => { d.open = true; });
            if (action === "hide") $$("details.check", quiz).forEach(d => { d.open = false; });

            if (action === "shuffle") {
                const list = $$("details.check", quiz);
                for (let i = list.length - 1; i > 0; i--) {
                    const j = Math.floor(Math.random() * (i + 1));
                    [list[i], list[j]] = [list[j], list[i]];
                }
                list.forEach(d => { d.open = false; tools.parentNode.appendChild(d); });
            }
            updateCount();
        });

        updateCount();
    }

    /* ---------- 4. Highlight the current section in the contents ---------- */

    function trackCurrentSection() {
        if (!("IntersectionObserver" in window)) return;
        const links = new Map($$('.toc a[href^="#"]').map(a => [a.getAttribute("href").slice(1), a]));

        const observer = new IntersectionObserver(entries => {
            entries.forEach(entry => {
                if (!entry.isIntersecting) return;
                links.forEach(a => a.classList.remove("is-active"));
                const active = links.get(entry.target.id);
                if (active) active.classList.add("is-active");
            });
        }, { rootMargin: "-15% 0px -75% 0px" });

        $$(".topic[id]").forEach(section => observer.observe(section));
    }

    /* ---------- 5. Printing ---------- */

    function prepareForPrint() {
        let opened = [];
        window.addEventListener("beforeprint", () => {
            opened = $$("details.check").filter(d => !d.open);
            opened.forEach(d => { d.open = true; });
        });
        window.addEventListener("afterprint", () => {
            opened.forEach(d => { d.open = false; });
            opened = [];
        });
    }

    /* ---------- Start ---------- */

    function init() {
        addCopyButtons();
        addProgress();
        addQuizTools();
        trackCurrentSection();
        prepareForPrint();
    }

    if (document.readyState === "loading") {
        document.addEventListener("DOMContentLoaded", init);
    } else {
        init();
    }
})();