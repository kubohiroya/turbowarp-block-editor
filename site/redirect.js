(function () {
    'use strict';
    let saved;
    try { saved = localStorage.getItem('tw-block-editor-site-language'); } catch (error) { /* Optional storage. */ }
    const language = window.PagesLanguage.selectLanguage(navigator.languages || [navigator.language], saved);
    const target = new URL(`${language}/`, location.href);
    target.hash = location.hash;
    location.replace(target.href);
}());
