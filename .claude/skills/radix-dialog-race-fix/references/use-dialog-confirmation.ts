import { useState, useCallback, useRef } from 'react';

/**
 * Hook for managing dialog + confirmation dialog flows without race conditions.
 *
 * This hook solves the Radix UI race condition where opening an AlertDialog
 * from a Dialog's onOpenChange handler causes pointer events to get trapped
 * or overlays to persist invisibly.
 *
 * @example
 * ```tsx
 * function MyDialog() {
 *   const {
 *     isMainOpen,
 *     isConfirmOpen,
 *     handleMainOpenChange,
 *     handleConfirm,
 *     handleCancelConfirm,
 *     openDialog,
 *   } = useDialogConfirmation({
 *     shouldConfirm: () => hasUnsavedChanges,
 *     onConfirm: () => saveData(),
 *   });
 *
 *   return (
 *     <>
 *       <Dialog open={isMainOpen} onOpenChange={handleMainOpenChange}>
 *         ...
 *       </Dialog>
 *       <AlertDialog open={isConfirmOpen}>
 *         <AlertDialogAction onClick={handleConfirm}>Confirm</AlertDialogAction>
 *         <AlertDialogCancel onClick={handleCancelConfirm}>Cancel</AlertDialogCancel>
 *       </AlertDialog>
 *     </>
 *   );
 * }
 * ```
 */

export interface UseDialogConfirmationOptions {
  /**
   * Called when user confirms the action.
   * Can be async - dialog will wait for completion.
   */
  onConfirm?: () => void | Promise<void>;

  /**
   * Called when user cancels the confirmation.
   */
  onCancel?: () => void;

  /**
   * Function to determine if confirmation should be shown.
   * If returns false, dialog closes immediately without confirmation.
   * @default () => true
   */
  shouldConfirm?: () => boolean;

  /**
   * Callback when main dialog opens
   */
  onOpen?: () => void;

  /**
   * Callback when main dialog closes (after confirmation if required)
   */
  onClose?: () => void;
}

export interface UseDialogConfirmationReturn {
  /** Whether the main dialog is open */
  isMainOpen: boolean;

  /** Whether the confirmation dialog is open */
  isConfirmOpen: boolean;

  /** Whether an async confirm action is in progress */
  isProcessing: boolean;

  /** Handler for main dialog's onOpenChange - use this directly */
  handleMainOpenChange: (open: boolean) => void;

  /** Handler for confirmation action - close confirm and then main dialog */
  handleConfirm: () => Promise<void>;

  /** Handler for cancel action - just close confirm dialog */
  handleCancelConfirm: () => void;

  /** Programmatically open the main dialog */
  openDialog: () => void;

  /** Programmatically close the main dialog (bypasses confirmation) */
  closeDialog: () => void;

  /** Force close both dialogs (emergency reset) */
  forceCloseAll: () => void;
}

export function useDialogConfirmation(
  options: UseDialogConfirmationOptions = {}
): UseDialogConfirmationReturn {
  const {
    onConfirm,
    onCancel,
    shouldConfirm = () => true,
    onOpen,
    onClose,
  } = options;

  const [isMainOpen, setIsMainOpen] = useState(false);
  const [isConfirmOpen, setIsConfirmOpen] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);

  // Track if we're in a pending close state
  const pendingCloseRef = useRef(false);

  const handleMainOpenChange = useCallback(
    (open: boolean) => {
      if (open) {
        // Opening the dialog
        setIsMainOpen(true);
        onOpen?.();
        return;
      }

      // Closing the dialog - check if confirmation needed
      if (shouldConfirm()) {
        pendingCloseRef.current = true;

        // CRITICAL: Delay opening confirmation to let Dialog's close event settle
        // This prevents the race condition with Radix UI's internal state machine
        setTimeout(() => {
          setIsConfirmOpen(true);
        }, 0);
        return;
      }

      // No confirmation needed - close immediately
      setIsMainOpen(false);
      onClose?.();
    },
    [shouldConfirm, onOpen, onClose]
  );

  const handleConfirm = useCallback(async () => {
    setIsProcessing(true);

    // CRITICAL: Close AlertDialog first and let it clean up
    setIsConfirmOpen(false);

    try {
      // Execute the confirm callback if provided
      if (onConfirm) {
        await onConfirm();
      }

      // CRITICAL: Delay closing main dialog to let AlertDialog cleanup complete
      // This ensures Radix UI's overlay and pointer-events are properly reset
      setTimeout(() => {
        setIsMainOpen(false);
        pendingCloseRef.current = false;
        setIsProcessing(false);
        onClose?.();
      }, 0);
    } catch (error) {
      // On error, reset state but keep main dialog open
      pendingCloseRef.current = false;
      setIsProcessing(false);
      throw error;
    }
  }, [onConfirm, onClose]);

  const handleCancelConfirm = useCallback(() => {
    setIsConfirmOpen(false);
    pendingCloseRef.current = false;
    onCancel?.();
  }, [onCancel]);

  const openDialog = useCallback(() => {
    setIsMainOpen(true);
    onOpen?.();
  }, [onOpen]);

  const closeDialog = useCallback(() => {
    // Bypass confirmation - direct close
    setIsMainOpen(false);
    setIsConfirmOpen(false);
    pendingCloseRef.current = false;
    onClose?.();
  }, [onClose]);

  const forceCloseAll = useCallback(() => {
    // Emergency reset - close everything and reset body state
    setIsMainOpen(false);
    setIsConfirmOpen(false);
    setIsProcessing(false);
    pendingCloseRef.current = false;

    // Reset any stuck pointer-events on body
    if (typeof document !== 'undefined') {
      document.body.style.pointerEvents = '';
    }

    onClose?.();
  }, [onClose]);

  return {
    isMainOpen,
    isConfirmOpen,
    isProcessing,
    handleMainOpenChange,
    handleConfirm,
    handleCancelConfirm,
    openDialog,
    closeDialog,
    forceCloseAll,
  };
}

/**
 * Variant for delete confirmation flows
 */
export interface UseDeleteConfirmationOptions {
  onDelete: () => void | Promise<void>;
  onCancel?: () => void;
}

export function useDeleteConfirmation(options: UseDeleteConfirmationOptions) {
  const { onDelete, onCancel } = options;

  const [isConfirmOpen, setIsConfirmOpen] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);

  const showConfirmation = useCallback(() => {
    // Delay showing confirmation
    setTimeout(() => {
      setIsConfirmOpen(true);
    }, 0);
  }, []);

  const handleConfirmDelete = useCallback(async () => {
    setIsDeleting(true);
    setIsConfirmOpen(false);

    try {
      // Delay the deletion to let AlertDialog cleanup
      await new Promise<void>((resolve) => {
        setTimeout(async () => {
          await onDelete();
          resolve();
        }, 0);
      });
    } finally {
      setIsDeleting(false);
    }
  }, [onDelete]);

  const handleCancelDelete = useCallback(() => {
    setIsConfirmOpen(false);
    onCancel?.();
  }, [onCancel]);

  return {
    isConfirmOpen,
    isDeleting,
    showConfirmation,
    handleConfirmDelete,
    handleCancelDelete,
  };
}

/**
 * Hook for nested dialog management (Dialog opening another Dialog)
 */
export interface UseNestedDialogOptions {
  onInnerClose?: () => void;
}

export function useNestedDialog(options: UseNestedDialogOptions = {}) {
  const { onInnerClose } = options;

  const [isOuterOpen, setIsOuterOpen] = useState(false);
  const [isInnerOpen, setIsInnerOpen] = useState(false);

  const openOuter = useCallback(() => {
    setIsOuterOpen(true);
  }, []);

  const closeOuter = useCallback(() => {
    // If inner is open, close it first
    if (isInnerOpen) {
      setIsInnerOpen(false);
      setTimeout(() => {
        setIsOuterOpen(false);
      }, 0);
    } else {
      setIsOuterOpen(false);
    }
  }, [isInnerOpen]);

  const openInner = useCallback(() => {
    // Delay opening inner dialog
    setTimeout(() => {
      setIsInnerOpen(true);
    }, 0);
  }, []);

  const closeInner = useCallback(() => {
    setIsInnerOpen(false);
    onInnerClose?.();
  }, [onInnerClose]);

  return {
    isOuterOpen,
    isInnerOpen,
    openOuter,
    closeOuter,
    openInner,
    closeInner,
    setIsOuterOpen,
    setIsInnerOpen,
  };
}
