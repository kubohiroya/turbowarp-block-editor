(function (scope) {
    'use strict';
    const selectLanguage = (languages, saved) => {
        if (saved === 'ja' || saved === 'en') return saved;
        for (const candidate of languages || []) {
            const language = String(candidate).toLowerCase().split('-')[0];
            if (language === 'ja' || language === 'en') return language;
        }
        return 'en';
    };
    if (typeof module !== 'undefined' && module.exports) module.exports = {selectLanguage};
    else scope.PagesLanguage = {selectLanguage};
}(typeof window === 'undefined' ? {} : window));
