import * as React from "react"
import { ChevronDown } from "lucide-react"

export interface SelectProps {
  value?: string
  onValueChange?: (value: string) => void
  children: React.ReactNode
}

export interface SelectTriggerProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  className?: string
  children: React.ReactNode
}

export interface SelectContentProps {
  children: React.ReactNode
}

export interface SelectItemProps {
  value: string
  children: React.ReactNode
}

export interface SelectValueProps {
  placeholder?: string
}

const SelectContext = React.createContext<{
  value?: string
  onValueChange?: (value: string) => void
  isOpen: boolean
  setIsOpen: (open: boolean) => void
}>({
  isOpen: false,
  setIsOpen: () => {},
})

function Select({ value, onValueChange, children }: SelectProps) {
  const [isOpen, setIsOpen] = React.useState(false)

  return (
    <SelectContext.Provider value={{ value, onValueChange, isOpen, setIsOpen }}>
      <div className="relative">
        {children}
      </div>
    </SelectContext.Provider>
  )
}

function SelectTrigger({ className = '', children, ...props }: SelectTriggerProps) {
  const { isOpen, setIsOpen } = React.useContext(SelectContext)

  return (
    <button
      type="button"
      className={`flex h-10 w-full items-center justify-between rounded-md border border-gray-300 bg-white px-3 py-2 text-sm ring-offset-white placeholder:text-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 ${className}`}
      onClick={() => setIsOpen(!isOpen)}
      {...props}
    >
      {children}
      <ChevronDown className="h-4 w-4 opacity-50" />
    </button>
  )
}

function SelectValue({ placeholder }: SelectValueProps) {
  const { value } = React.useContext(SelectContext)
  
  return (
    <span className={value ? '' : 'text-gray-500'}>
      {value || placeholder}
    </span>
  )
}

function SelectContent({ children }: SelectContentProps) {
  const { isOpen } = React.useContext(SelectContext)

  if (!isOpen) return null

  return (
    <div className="absolute top-full left-0 right-0 z-50 mt-1 max-h-60 overflow-auto rounded-md border border-gray-200 bg-white shadow-lg">
      <div className="p-1">
        {children}
      </div>
    </div>
  )
}

function SelectItem({ value, children }: SelectItemProps) {
  const { onValueChange, setIsOpen } = React.useContext(SelectContext)

  return (
    <button
      type="button"
      className="w-full text-left rounded-sm px-2 py-1.5 text-sm hover:bg-gray-100 focus:bg-gray-100 focus:outline-none"
      onClick={() => {
        onValueChange?.(value)
        setIsOpen(false)
      }}
    >
      {children}
    </button>
  )
}

export { Select, SelectTrigger, SelectValue, SelectContent, SelectItem }