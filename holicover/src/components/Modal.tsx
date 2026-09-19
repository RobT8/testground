import { useEffect, useRef } from 'react';

interface ModalProps {
  title: string;
  onClose: () => void;
  children: React.ReactNode;
}

/** A sheet anchored to the bottom of the screen, the usual mobile pattern. */
export default function Modal({ title, onClose, children }: ModalProps) {
  const sheetRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    // Android's back gesture surfaces as Escape in the WebView.
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') onClose();
    }
    document.addEventListener('keydown', onKeyDown);

    // Stop the list behind the sheet scrolling under the user's finger.
    const previous = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    sheetRef.current?.focus();

    return () => {
      document.removeEventListener('keydown', onKeyDown);
      document.body.style.overflow = previous;
    };
  }, [onClose]);

  return (
    <div className="modal" onClick={onClose}>
      <div
        className="modal__sheet"
        role="dialog"
        aria-modal="true"
        aria-label={title}
        tabIndex={-1}
        ref={sheetRef}
        onClick={(event) => event.stopPropagation()}
      >
        <header className="modal__header">
          <h2 className="modal__title">{title}</h2>
          <button type="button" className="icon-button" onClick={onClose}>
            Close
          </button>
        </header>
        {children}
      </div>
    </div>
  );
}
