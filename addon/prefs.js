/* The root prefs.js is also evaluated for default preferences. No defaults are
 * needed; initialize the settings UI only when this runs in its window. */
var AIReaderPreferences;
if (typeof window !== 'undefined' && typeof document !== 'undefined') {
  AIReaderPreferences = window.AIReaderPreferences = {
    cleanup: null,
    init: function (doc) {
      const container = doc.getElementById('ai-reader-settings-root');
      if (!container || !Zotero.AIReader) return;
      if (this.cleanup) this.cleanup();
      const unmount = Zotero.AIReader.mountSettings(container);
      let disposed = false;
      const observer = new MutationObserver(() => {
        if (disposed) return;
        try { if (!container.isConnected) cleanup(); }
        catch { cleanup(); }
      });
      const cleanup = () => {
        if (disposed) return;
        disposed = true;
        try { observer.disconnect(); } catch {}
        try { window.removeEventListener('unload', cleanup); } catch {}
        try { unmount(); } catch {}
        if (this.cleanup === cleanup) this.cleanup = null;
      };
      this.cleanup = cleanup;
      observer.observe(container.ownerDocument.documentElement, { childList: true, subtree: true });
      window.addEventListener('unload', cleanup, { once: true });
    }
  };
}
