(function () {
    'use strict';
    for (const link of document.querySelectorAll('[data-language]')) {
        link.addEventListener('click', () => {
            try { localStorage.setItem('tw-block-editor-site-language', link.dataset.language); }
            catch (error) { /* Language URLs also work without storage. */ }
        });
    }
    const extension = new URL('../static/extensions/block-editor.js', location.href).href;
    for (const field of document.querySelectorAll('[data-extension-url]')) field.value = extension;
    for (const button of document.querySelectorAll('[data-copy-extension]')) {
        button.addEventListener('click', async () => {
            const field = document.querySelector('[data-extension-url]');
            try {
                const response = await fetch(extension);
                if (!response.ok) throw new Error('The sample could not be loaded.');
                const code = await response.text();
                const fallback = document.querySelector('[data-extension-source]');
                fallback.value = code;
                try { await navigator.clipboard.writeText(code); }
                catch (error) { fallback.hidden = false; fallback.focus(); fallback.select(); }
                button.textContent = document.documentElement.lang === 'ja' ? 'コピーしました' : 'Copied';
            } catch (error) { field.focus(); field.select(); }
        });
    }
}());
