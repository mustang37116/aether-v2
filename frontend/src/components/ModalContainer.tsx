import React, { useEffect, useRef } from 'react';

let openModalCount = 0;

function getFocusable(container: HTMLElement): HTMLElement[] {
  const selectors = [
    'a[href]',
    'button:not([disabled])',
    'textarea:not([disabled])',
    'input:not([disabled])',
    'select:not([disabled])',
    '[tabindex]:not([tabindex="-1"])'
  ].join(',');
  return Array.from(container.querySelectorAll<HTMLElement>(selectors))
    .filter(el => !el.hasAttribute('disabled') && !el.getAttribute('aria-hidden'));
}

export default function ModalContainer({
  children,
  onClose,
  labelledById,
  className = 'modal'
}: {
  children: React.ReactNode;
  onClose: () => void;
  labelledById?: string;
  className?: string;
}){
  const ref = useRef<HTMLDivElement>(null);
  const prevFocusedRef = useRef<HTMLElement | null>(null);
  const onCloseRef = useRef(onClose);
  // Keep latest onClose without retriggering effect
  useEffect(()=>{ onCloseRef.current = onClose; }, [onClose]);

  // Update CSS --app-vh to reflect the actual innerHeight (better handling of mobile browser chrome)
  useEffect(() => {
    let raf = 0;
    const setVhVar = () => {
      raf = window.requestAnimationFrame(() => {
        const vh = window.innerHeight * 0.01;
        document.documentElement.style.setProperty('--app-vh', `${vh}px`);
      });
    };
    setVhVar();
    const onResize = () => setVhVar();
    window.addEventListener('resize', onResize);
    window.addEventListener('orientationchange', onResize);
    return () => {
      window.removeEventListener('resize', onResize);
      window.removeEventListener('orientationchange', onResize);
      if (raf) cancelAnimationFrame(raf);
    };
  }, []);

  useEffect(() => {
    openModalCount += 1;
    const prevOverflow = document.body.style.overflow;
    if (openModalCount > 0) {
      document.body.style.overflow = 'hidden';
    }

    prevFocusedRef.current = document.activeElement as HTMLElement | null;

    const node = ref.current;
    if (node) {
      // initial focus
      const focusables = getFocusable(node);
      const toFocus = focusables[0] || node;
      setTimeout(() => {
        try { (toFocus as HTMLElement).focus({ preventScroll: true }); } catch {}
      }, 0);
    }

    function onKeyDown(e: KeyboardEvent){
      if (e.key === 'Escape') {
        e.preventDefault();
        onCloseRef.current();
        return;
      }
      if (e.key === 'Tab') {
        const container = ref.current;
        if (!container) return;
        const focusables = getFocusable(container);
        if (focusables.length === 0) {
          e.preventDefault();
          (container as HTMLElement).focus();
          return;
        }
        const current = document.activeElement as HTMLElement | null;
        const idx = current ? focusables.indexOf(current) : -1;
        const forward = !e.shiftKey;
        let nextIdx = idx;
        if (forward) {
          nextIdx = idx === -1 || idx === focusables.length - 1 ? 0 : idx + 1;
        } else {
          nextIdx = idx <= 0 ? focusables.length - 1 : idx - 1;
        }
        e.preventDefault();
        focusables[nextIdx]?.focus();
      }
    }

    // Compute whether modal is "long" relative to the available overlay area
    const overlay = ref.current?.closest('.modal-overlay-view, .modal-overlay-edit') as HTMLElement | null;
    const updateLongState = () => {
      const node = ref.current;
      const ov = overlay;
      if (!node || !ov) return;
      const cs = getComputedStyle(ov);
      const pt = parseFloat(cs.paddingTop) || 0;
      const pb = parseFloat(cs.paddingBottom) || 0;
      const available = ov.clientHeight - pt - pb;
      // Use offsetHeight (actual rendered height) not scrollHeight (full scrollable content) to decide centering vs top anchor
      const rendered = node.offsetHeight;
      // Threshold: if modal consumes > 88% of available space, treat as long (anchor top)
      const isLong = rendered >= available * 0.88;
      ov.classList.toggle('modal-long', isLong);
      node.classList.toggle('modal-long', isLong);
      if ((import.meta as any)?.env?.DEV) {
        // Debug instrumentation (dev only)
        // eslint-disable-next-line no-console
        console.debug('[Modal sizing]', { available, rendered, isLong });
      }
    };

    const resizeObserver = new ResizeObserver(() => updateLongState());
    if (ref.current) resizeObserver.observe(ref.current);
    if (overlay) resizeObserver.observe(overlay);

    const onWindowResize = () => updateLongState();
    window.addEventListener('resize', onWindowResize);
    window.addEventListener('orientationchange', onWindowResize);
    // Initial measurement
    updateLongState();

    // Removed extra focus redirection logic to avoid unintended blur cycles

    document.addEventListener('keydown', onKeyDown);

    return () => {
      document.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('resize', onWindowResize);
      window.removeEventListener('orientationchange', onWindowResize);
      try { resizeObserver.disconnect(); } catch {}
      // removed listeners (none added)
      // restore focus
      try { prevFocusedRef.current?.focus({ preventScroll: true }); } catch {}
      // restore body scroll
      openModalCount = Math.max(0, openModalCount - 1);
      if (openModalCount === 0) {
        document.body.style.overflow = prevOverflow;
      }
    };
  }, []);

  return (
    <div
      ref={ref}
      className={className}
      role="dialog"
      aria-modal="true"
      aria-labelledby={labelledById}
      tabIndex={-1}
      onClick={e => e.stopPropagation()}
    >
      {children}
    </div>
  );
}
