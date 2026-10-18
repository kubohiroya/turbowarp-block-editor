// A failed opening has no draft or save path; retain a closeable diagnostic modal.
const createBlockEditorErrorSession = (reference, error) => {
    let status = 'editing';
    const listeners = new Set();
    const finish = next => {
        if (status !== 'editing') return false;
        status = next;
        for (const listener of [...listeners]) listener();
        listeners.clear();
        return true;
    };
    return Object.freeze({
        reference,
        getState: () => ({status, canSave: false, issues: [], error}),
        subscribe: listener => {
            listeners.add(listener);
            return () => listeners.delete(listener);
        },
        mount: () => () => {},
        save: () => Promise.resolve({status: 'failed', error}),
        cancel: () => finish('cancelled'),
        dispose: () => {
            finish('disposed'); return true;
        }
    });
};

export default createBlockEditorErrorSession;
