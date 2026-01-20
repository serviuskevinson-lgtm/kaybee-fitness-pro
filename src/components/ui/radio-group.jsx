import React from "react";
import { Circle } from "lucide-react";

const RadioGroupContext = React.createContext(null);

export function RadioGroup({ defaultValue, onValueChange, className, children }) {
  const [value, setValue] = React.useState(defaultValue);

  const handleValueChange = (newValue) => {
    setValue(newValue);
    if (onValueChange) onValueChange(newValue);
  };

  return (
    <RadioGroupContext.Provider value={{ value, onChange: handleValueChange }}>
      <div className={className} role="radiogroup">
        {children}
      </div>
    </RadioGroupContext.Provider>
  );
}

export function RadioGroupItem({ value, id, className }) {
  const context = React.useContext(RadioGroupContext);
  const isChecked = context.value === value;

  return (
    <button
      type="button"
      role="radio"
      aria-checked={isChecked}
      id={id}
      onClick={() => context.onChange(value)}
      className={`
        h-4 w-4 rounded-full border border-primary text-primary ring-offset-background focus:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50
        flex items-center justify-center
        ${className}
      `}
    >
      {isChecked && (
        <div className="h-2.5 w-2.5 rounded-full bg-current" />
      )}
    </button>
  );
}