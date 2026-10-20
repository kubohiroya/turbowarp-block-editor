(() => {
    const url = new URL(location.href);
    if (!url.searchParams.has('extensionSecurityBatch')) {
        url.searchParams.set('extensionSecurityBatch', '1');
        history.replaceState(history.state, '', url.href);
    }
})();
