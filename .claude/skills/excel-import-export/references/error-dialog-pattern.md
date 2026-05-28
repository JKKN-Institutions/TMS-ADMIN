# Error Dialog Pattern

This document provides the complete implementation pattern for upload error dialogs.

## Error Dialog Component

```tsx
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle
} from "@/components/ui/alert-dialog"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { XCircle, AlertTriangle } from "lucide-react"

{/* Error Popup Dialog */}
<AlertDialog open={errorPopupOpen} onOpenChange={setErrorPopupOpen}>
  <AlertDialogContent className="max-w-4xl max-h-[80vh] overflow-y-auto rounded-3xl border-slate-200">
    <AlertDialogHeader>
      <div className="flex items-center gap-3">
        <div className="h-10 w-10 rounded-full bg-red-100 flex items-center justify-center">
          <XCircle className="h-5 w-5 text-red-600" />
        </div>
        <div>
          <AlertDialogTitle className="text-xl font-bold text-red-600">
            Data Validation Errors
          </AlertDialogTitle>
          <AlertDialogDescription className="text-sm text-muted-foreground mt-1">
            Please fix the following errors before importing the data
          </AlertDialogDescription>
        </div>
      </div>
    </AlertDialogHeader>

    <div className="space-y-4">
      {/* Upload Summary Cards */}
      {uploadSummary.total > 0 && (
        <div className="grid grid-cols-3 gap-3">
          <div className="bg-blue-50 border-blue-200 rounded-lg p-3">
            <div className="text-xs text-blue-600 font-medium mb-1">Total Rows</div>
            <div className="text-2xl font-bold text-blue-700">{uploadSummary.total}</div>
          </div>
          <div className="bg-green-50 border-green-200 rounded-lg p-3">
            <div className="text-xs text-green-600 font-medium mb-1">Successful</div>
            <div className="text-2xl font-bold text-green-700">{uploadSummary.success}</div>
          </div>
          <div className="bg-red-50 border-red-200 rounded-lg p-3">
            <div className="text-xs text-red-600 font-medium mb-1">Failed</div>
            <div className="text-2xl font-bold text-red-700">{uploadSummary.failed}</div>
          </div>
        </div>
      )}

      {/* Error Summary Banner */}
      <div className="bg-red-50 border border-red-200 rounded-lg p-4">
        <div className="flex items-center gap-2 mb-2">
          <AlertTriangle className="h-4 w-4 text-red-600" />
          <span className="font-semibold text-red-800">
            {importErrors.length} row{importErrors.length > 1 ? 's' : ''} failed validation
          </span>
        </div>
        <p className="text-sm text-red-700">
          Please correct these errors in your Excel file and try uploading again.
          Row numbers correspond to your Excel file (including header row).
        </p>
      </div>

      {/* Detailed Error List */}
      <div className="space-y-3">
        {importErrors.map((error, index) => (
          <div key={index} className="border border-red-200 rounded-xl p-4 bg-red-50/50">
            <div className="flex items-start justify-between mb-2">
              <div className="flex items-center gap-2">
                <Badge variant="outline"
                  className="text-xs bg-red-100 text-red-800 border-red-300 rounded-lg">
                  Row {error.row}
                </Badge>
                <span className="font-medium text-sm">
                  {error.[entity]_code} - {error.[entity]_name}
                </span>
              </div>
            </div>

            <div className="space-y-1">
              {error.errors.map((err, errIndex) => (
                <div key={errIndex} className="flex items-start gap-2 text-sm">
                  <XCircle className="h-3 w-3 text-red-500 mt-0.5 flex-shrink-0" />
                  <span className="text-red-700">{err}</span>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>

      {/* Common Fixes Section */}
      <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
        <div className="flex items-start gap-2">
          <div className="h-5 w-5 rounded-full bg-blue-100 flex items-center justify-center mt-0.5">
            <span className="text-xs font-bold text-blue-600">i</span>
          </div>
          <div>
            <h4 className="font-semibold text-blue-800 text-sm mb-1">Common Fixes:</h4>
            <ul className="text-xs text-blue-700 space-y-1">
              <li>• Ensure all required fields are provided and not empty</li>
              <li>• Foreign keys must reference existing records</li>
              <li>• Check field length constraints</li>
              <li>• Verify data format matches expected patterns</li>
              <li>• Status values: true/false or Active/Inactive</li>
            </ul>
          </div>
        </div>
      </div>
    </div>

    <AlertDialogFooter>
      <AlertDialogCancel className="bg-gray-100 hover:bg-gray-200">
        Close
      </AlertDialogCancel>
      <Button
        onClick={() => {
          setErrorPopupOpen(false)
          setImportErrors([])
        }}
        className="bg-blue-600 hover:bg-blue-700 text-white"
      >
        Try Again
      </Button>
    </AlertDialogFooter>
  </AlertDialogContent>
</AlertDialog>
```

## State Requirements

```typescript
const [errorPopupOpen, setErrorPopupOpen] = useState(false)
const [importErrors, setImportErrors] = useState<Array<{
  row: number
  [entity]_code: string
  [entity]_name: string
  errors: string[]
}>>([])
const [uploadSummary, setUploadSummary] = useState<{
  total: number
  success: number
  failed: number
}>({ total: 0, success: 0, failed: 0 })
```

## Required Imports

```typescript
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle
} from "@/components/ui/alert-dialog"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { XCircle, AlertTriangle } from "lucide-react"
```

## Dark Mode Support

Add these classes for dark mode compatibility:

```tsx
// Summary cards
<div className="bg-blue-50 dark:bg-blue-900/10 border border-blue-200 dark:border-blue-800">
  <div className="text-blue-600 dark:text-blue-400">...</div>
  <div className="text-blue-700 dark:text-blue-300">...</div>
</div>

// Error items
<div className="border border-red-200 dark:border-red-800 bg-red-50/50 dark:bg-red-900/5">
  <span className="text-red-700 dark:text-red-300">...</span>
</div>
```

## Accessibility Notes

- Use proper heading hierarchy (AlertDialogTitle)
- Include descriptive text (AlertDialogDescription)
- Ensure keyboard navigation works
- Error messages are screen-reader friendly
