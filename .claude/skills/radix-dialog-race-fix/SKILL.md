---
name: radix-dialog-race-fix
description: This skill should be used when implementing nested dialogs, confirmation dialogs, or multi-step dialog flows using shadcn/ui or Radix UI. It resolves race conditions that occur when opening an AlertDialog from within a Dialog's onOpenChange handler, which can cause pointer events to get trapped, overlays to persist invisibly, or the page to become stuck/unresponsive. Use this skill when working with Dialog + AlertDialog combinations, Sheet + AlertDialog combinations, delete confirmations from row actions, unsaved changes prompts, or any scenario where one dialog/sheet needs to open another. Also use this skill when debugging stuck UI states where pointer-events are locked or Radix overlays persist after closing dialogs. Trigger on: nested dialog, confirmation dialog, delete confirmation, discard changes dialog, AlertDialog inside Dialog, AlertDialog inside Sheet, pointer-events stuck, dialog race condition, radix overlay stuck.
---

# Radix UI Dialog Race Condition Fix

## Problem

When using Radix UI (or shadcn/ui) Dialog/Sheet and AlertDialog together, interrupting a Dialog's close event (`onOpenChange`) to open an AlertDialog causes race conditions. Radix manages focus, overlays, and pointer events through internal state machines. When two dialogs change state simultaneously, the DOM is left in an inconsistent state:

- Body locked with `pointer-events: none`
- Invisible overlays persisting
- Page unresponsive to clicks
- Dialog states desynced from DOM

## The Fix: Decouple State Changes with `setTimeout`

The core principle: never open one dialog synchronously inside another dialog's close handler. Use `setTimeout(() => {}, 0)` to let Radix's internal cleanup complete before triggering the next dialog.

## Existing Hook — Use This First

This project already has a reusable hook at `hooks/use-dialog-confirmation.ts`. Read the reference file at `references/use-dialog-confirmation.ts` for the full implementation with JSDoc and types.

The hook provides three variants:

### 1. `useDialogConfirmation` — General confirmation flow

For Dialog/Sheet close with confirmation (e.g., unsaved changes):

```tsx
const {
  isMainOpen,
  isConfirmOpen,
  isProcessing,
  handleMainOpenChange,
  handleConfirm,
  handleCancelConfirm,
  openDialog,
  closeDialog,
  forceCloseAll,
} = useDialogConfirmation({
  shouldConfirm: () => hasUnsavedChanges, // Only show confirm when dirty
  onConfirm: () => saveAndClose(),
  onCancel: () => {}, // Optional
  onOpen: () => {},    // Optional
  onClose: () => {},   // Optional
});
```

```tsx
<Dialog open={isMainOpen} onOpenChange={handleMainOpenChange}>
  <DialogContent>{/* form content */}</DialogContent>
</Dialog>

<AlertDialog open={isConfirmOpen} onOpenChange={(open) => !open && handleCancelConfirm()}>
  <AlertDialogContent>
    <AlertDialogHeader>
      <AlertDialogTitle>Discard changes?</AlertDialogTitle>
      <AlertDialogDescription>You have unsaved changes.</AlertDialogDescription>
    </AlertDialogHeader>
    <AlertDialogFooter>
      <AlertDialogCancel onClick={handleCancelConfirm}>Cancel</AlertDialogCancel>
      <AlertDialogAction onClick={handleConfirm} disabled={isProcessing}>
        Discard
      </AlertDialogAction>
    </AlertDialogFooter>
  </AlertDialogContent>
</AlertDialog>
```

### 2. `useDeleteConfirmation` — Delete from within a dialog

For delete buttons inside a Dialog/Sheet that need a confirmation step:

```tsx
const {
  isConfirmOpen,
  isDeleting,
  showConfirmation,
  handleConfirmDelete,
  handleCancelDelete,
} = useDeleteConfirmation({
  onDelete: () => deleteItem(item.id),
});
```

```tsx
<Button variant="destructive" onClick={showConfirmation} disabled={isDeleting}>
  Delete
</Button>

<AlertDialog open={isConfirmOpen} onOpenChange={(open) => !open && handleCancelDelete()}>
  <AlertDialogContent>
    <AlertDialogHeader>
      <AlertDialogTitle>Delete {item.name}?</AlertDialogTitle>
      <AlertDialogDescription>This action cannot be undone.</AlertDialogDescription>
    </AlertDialogHeader>
    <AlertDialogFooter>
      <AlertDialogCancel onClick={handleCancelDelete}>Cancel</AlertDialogCancel>
      <AlertDialogAction onClick={handleConfirmDelete}>Delete</AlertDialogAction>
    </AlertDialogFooter>
  </AlertDialogContent>
</AlertDialog>
```

### 3. `useNestedDialog` — Dialog opening another Dialog

For multi-step flows where one dialog opens another:

```tsx
const {
  isOuterOpen, isInnerOpen,
  openOuter, closeOuter,
  openInner, closeInner,
} = useNestedDialog({ onInnerClose: () => refreshData() });
```

## Manual Pattern (When Hook Doesn't Fit)

If the hook variants don't match your use case, apply the pattern manually. The two critical rules:

1. **Delay opening** the second dialog with `setTimeout(() => {}, 0)`
2. **Close inner first**, then delay closing outer

```typescript
// Inside Dialog's onOpenChange or a button handler:
const handleOpenConfirmation = () => {
  setTimeout(() => {
    setShowConfirm(true);
  }, 0);
};

const handleConfirmAction = () => {
  setShowConfirm(false); // Close AlertDialog first
  setTimeout(() => {
    onOpenChange(false);  // Then close Dialog
  }, 0);
};
```

## Sheet + AlertDialog (Same Problem)

Sheet uses the same Radix Dialog primitive internally. The exact same race condition applies when opening an AlertDialog from a Sheet's close handler or from within Sheet content. Use the same hooks — `useDialogConfirmation` works identically with Sheet:

```tsx
<Sheet open={isMainOpen} onOpenChange={handleMainOpenChange}>
  <SheetContent>{/* content with delete button */}</SheetContent>
</Sheet>

<AlertDialog open={isConfirmOpen}>
  {/* Same AlertDialog pattern as above */}
</AlertDialog>
```

## Common MyJKKN Pattern: Row Actions Delete

The most frequent pattern in this codebase is delete confirmation from row action dropdowns. These are simpler because DropdownMenu doesn't have the same race condition — but if the dropdown is inside a Dialog/Sheet, use `useDeleteConfirmation`:

```tsx
// Inside a Dialog/Sheet content with a data table
function RowActions({ item, onDelete }) {
  const { isConfirmOpen, isDeleting, showConfirmation, handleConfirmDelete, handleCancelDelete } =
    useDeleteConfirmation({ onDelete: () => onDelete(item.id) });

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" size="icon"><MoreHorizontal /></Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent>
          <DropdownMenuItem onClick={showConfirmation}>Delete</DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <AlertDialog open={isConfirmOpen} onOpenChange={(open) => !open && handleCancelDelete()}>
        {/* Standard confirmation content */}
      </AlertDialog>
    </>
  );
}
```

## Debugging Stuck State

If the page becomes stuck despite using this pattern:

```typescript
// Emergency reset — use in useEffect cleanup or error boundaries
function resetDialogState() {
  document.body.style.pointerEvents = '';
  document.querySelectorAll('[data-radix-portal]').forEach(el => {
    if (!el.querySelector('[data-state="open"]')) {
      el.remove();
    }
  });
}
```

The `forceCloseAll()` method on `useDialogConfirmation` also handles this automatically.

## Checklist

When implementing nested dialogs:

- [ ] Use `useDialogConfirmation` or `useDeleteConfirmation` hook from `hooks/use-dialog-confirmation.ts`
- [ ] If manual: opening second dialog uses `setTimeout(() => {}, 0)`
- [ ] If manual: close inner dialog first, then delay closing outer
- [ ] Test: escape key on both dialogs
- [ ] Test: overlay click on both dialogs
- [ ] Test: rapid open/close cycles
- [ ] AlertDialog rendered as sibling to Dialog/Sheet (not nested inside DialogContent)
