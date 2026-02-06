/**
 * AppContent
 *
 * Main application content component
 * Uses contexts for state management
 */

import React, { useCallback, useEffect } from 'https://esm.sh/react@18.2.0';
import { VIEW_COMPONENTS } from '../utils/viewHelpers.js';

// Context hooks
import { useAppState } from '../contexts/AppStateContext.js';
import { useTheme } from '../contexts/ThemeContext.js';
import { useWebSocketConnection } from '../contexts/WebSocketContext.js';
import { useAuth } from '../contexts/AuthContext.js';

// Other hooks
import { useResponsiveLayout, useModal } from '../hooks/index.js';

// Components
import { Header, Sidebar, Footer, MobileNavFooter, StickyViewHeader } from './layout/index.js';
import { SetupWizardView, LoginView } from './views/index.js';
import { Portal } from './common/index.js';
import { AboutModal, WelcomeModal } from './modals/index.js';
import { useVersion } from '../contexts/index.js';

const { createElement: h } = React;

/**
 * ViewRenderer component - Renders the appropriate view
 * All views now use contexts directly, no prop drilling needed
 */
const ViewRenderer = React.memo(() => {
  const { appCurrentView } = useAppState();

  const ViewComponent = VIEW_COMPONENTS[appCurrentView];
  if (!ViewComponent) {
    return null;
  }

  return h(ViewComponent);
});

/**
 * AppContentInner - Main app content
 */
const AppContentInner = () => {
  // ============================================================================
  // CONTEXT STATE
  // ============================================================================

  const {
    appCurrentView,
    appErrors,
    clearAppErrors,
    appSuccesses,
    clearAppSuccesses,
    handleAppNavigate
  } = useAppState();

  const { theme, toggleTheme: toggleThemeHook } = useTheme();
  const { isLandscape } = useResponsiveLayout();

  // WebSocket connection from context
  const { wsConnected } = useWebSocketConnection();

  // Auth state from context
  const { isAuthenticated, authEnabled, loading: authLoading, isFirstRun, completeFirstRun, logout } = useAuth();

  // About modal state
  const aboutModal = useModal();

  // Version and What's New modal state
  const { version, showWhatsNew, whatsNewChangelog, markVersionSeen, markingAsSeen } = useVersion();

  // Fix iOS Safari: clamp scroll position when content shrinks (e.g. after item deletion).
  // Safari doesn't recalculate scroll bounds automatically, leaving empty space at the bottom.
  // Uses MutationObserver (not ResizeObserver) because min-height:100dvh + flex-1 keeps the
  // document element at viewport size even when inner content shrinks.
  useEffect(() => {
    let pending = false;
    const clampScroll = () => {
      if (pending) return;
      pending = true;
      // Double-rAF ensures iOS Safari has fully settled layout
      requestAnimationFrame(() => requestAnimationFrame(() => {
        pending = false;
        const maxScroll = document.documentElement.scrollHeight - window.innerHeight;
        if (maxScroll >= 0 && window.scrollY > maxScroll) {
          window.scrollTo(0, maxScroll);
        }
      }));
    };
    const observer = new MutationObserver(clampScroll);
    observer.observe(document.getElementById('app'), { childList: true, subtree: true });
    return () => observer.disconnect();
  }, []);

  // ============================================================================
  // CALLBACKS
  // ============================================================================

  // Stable callback handlers to prevent unnecessary re-renders of memoized children
  const handleNavigateHome = useCallback(() => handleAppNavigate('home'), [handleAppNavigate]);
  const handleClearError = useCallback(() => clearAppErrors(), [clearAppErrors]);
  const handleClearSuccess = useCallback(() => clearAppSuccesses(), [clearAppSuccesses]);

  // Logout handler
  const handleLogout = useCallback(async () => {
    await logout();
    window.location.href = '/login';
  }, [logout]);

  // ============================================================================
  // RENDER
  // ============================================================================

  // Show loading while checking first-run and auth status
  if (isFirstRun === null || authLoading) {
    return h('div', { className: 'min-h-screen bg-gray-100 dark:bg-gray-900 flex items-center justify-center' },
      h('div', { className: 'text-center' },
        h('div', { className: 'inline-block animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600' }),
        h('p', { className: 'mt-4 text-gray-600 dark:text-gray-400' }, 'Loading...')
      )
    );
  }

  // Show login page if auth is enabled and user is not authenticated
  if (!isFirstRun && authEnabled && !isAuthenticated) {
    return h(LoginView);
  }

  // Show setup wizard on first run
  if (isFirstRun) {
    return h(SetupWizardView, {
      onComplete: () => {
        completeFirstRun();
        window.location.reload();
      }
    });
  }

  // Normal app render
  return h('div', { className: 'flex-1 bg-gray-100 dark:bg-gray-900 flex flex-col' },
      // Error banner - supports multiple errors
      appErrors.length > 0 && h(Portal, null,
        h('div', {
          className: 'fixed top-20 left-1/2 transform -translate-x-1/2 z-[100] bg-red-600 text-white px-6 py-3 rounded-lg shadow-lg flex items-start gap-3 max-w-lg'
        },
          h('svg', { className: 'w-5 h-5 flex-shrink-0 mt-0.5', fill: 'currentColor', viewBox: '0 0 20 20' },
            h('path', {
              fillRule: 'evenodd',
              d: 'M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z',
              clipRule: 'evenodd'
            })
          ),
          h('div', { className: 'flex-1 whitespace-pre-line break-all' },
            appErrors.length === 1
              ? appErrors[0]
              : h('ul', { className: 'list-disc list-inside space-y-1' },
                  appErrors.map((err, idx) => h('li', { key: idx }, err))
                )
          ),
          h('button', {
            onClick: handleClearError,
            className: 'ml-2 text-white hover:text-gray-200 flex-shrink-0'
          }, '✕')
        )
      ),

      // Success banner - supports multiple success messages
      appSuccesses.length > 0 && h(Portal, null,
        h('div', {
          className: 'fixed left-1/2 transform -translate-x-1/2 z-[100] bg-green-600 text-white px-6 py-3 rounded-lg shadow-lg flex items-start gap-3 max-w-lg',
          style: { top: appErrors.length > 0 ? '8rem' : '5rem' }
        },
          h('svg', { className: 'w-5 h-5 flex-shrink-0 mt-0.5', fill: 'currentColor', viewBox: '0 0 20 20' },
            h('path', {
              fillRule: 'evenodd',
              d: 'M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z',
              clipRule: 'evenodd'
            })
          ),
          h('div', { className: 'flex-1 whitespace-pre-line break-all' },
            appSuccesses.length === 1
              ? appSuccesses[0]
              : h('ul', { className: 'list-disc list-inside space-y-1' },
                  appSuccesses.map((msg, idx) => h('li', { key: idx }, msg))
                )
          ),
          h('button', {
            onClick: handleClearSuccess,
            className: 'ml-2 text-white hover:text-gray-200 flex-shrink-0'
          }, '✕')
        )
      ),

      // Reconnecting overlay
      !wsConnected && h(Portal, null,
        h('div', {
          className: 'fixed inset-0 bg-black bg-opacity-40 flex items-center justify-center z-50 pointer-events-auto',
          style: { backdropFilter: 'blur(2px)' }
        },
          h('span', { className: 'text-white text-lg font-semibold' }, 'Reconnecting to server...')
        )
      ),

      h('div', { className: `flex-1 flex flex-col ${wsConnected ? '' : 'pointer-events-none opacity-50'}` },
        // Header (hides on mobile when scrolled)
        h(Header, {
          theme,
          onToggleTheme: toggleThemeHook,
          isLandscape,
          onNavigateHome: handleNavigateHome,
          onOpenAbout: aboutModal.open,
          authEnabled,
          onLogout: handleLogout
        }),

        // Sticky view header (shows on mobile when main header is hidden)
        h(StickyViewHeader),

        // Main layout - bg matches main content on mobile to avoid gap above nav
        h('div', { className: 'px-0 sm:px-3 py-0 sm:py-3 flex flex-col md:flex-row gap-0 sm:gap-3 flex-1 min-h-0 bg-white dark:bg-gray-800 sm:bg-transparent sm:dark:bg-transparent' },
          // Sidebar
          h(Sidebar, { currentView: appCurrentView, onNavigate: handleAppNavigate, isLandscape }),

          // Main content - Simplified view rendering using component mapping
          // Mobile: no border/padding/shadow for cleaner look
          // Desktop (sm+): full styling with border, shadow, rounded corners
          h('main', { className: 'flex-1 flex flex-col bg-white dark:bg-gray-800 py-2 sm:p-4 sm:rounded-lg sm:shadow sm:border sm:border-gray-200 sm:dark:border-gray-700' },
            h(ViewRenderer)
          )
        ),

        // Footer (desktop only) - uses useLiveData internally for stats
        h(Footer, { currentView: appCurrentView, onOpenAbout: aboutModal.open }),

        // Mobile nav footer
        h(MobileNavFooter, { currentView: appCurrentView, onNavigate: handleAppNavigate }),

        // Bottom spacer for mobile nav (prevents content from being hidden behind fixed nav)
        h('div', { className: 'md:hidden h-14 bg-white dark:bg-gray-800' })
      ),

      // About Modal
      h(AboutModal, {
        show: aboutModal.modal.show,
        onClose: aboutModal.close
      }),

      // Welcome Modal (shown after app update)
      h(WelcomeModal, {
        show: showWhatsNew,
        onContinue: markVersionSeen,
        version,
        changelog: whatsNewChangelog,
        loading: markingAsSeen
      })
  );
};

// Export AppContentInner as AppContent
export const AppContent = AppContentInner;
