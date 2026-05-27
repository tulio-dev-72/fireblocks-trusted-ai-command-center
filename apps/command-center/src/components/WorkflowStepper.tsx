interface WorkflowStepperProps {
  steps: string[];
  current: number;
  onStepClick?: (index: number) => void;
}

export function WorkflowStepper({ steps, current, onStepClick }: WorkflowStepperProps) {
  return (
    <div className="workflow-stepper">
      {steps.map((label, i) => (
        <button
          key={label}
          type="button"
          className={`workflow-step ${i <= current ? "active" : ""} ${i === current ? "current" : ""}`}
          onClick={() => onStepClick?.(i)}
          disabled={!onStepClick}
        >
          <span className="step-num">{i + 1}</span>
          <span className="step-label">{label}</span>
        </button>
      ))}
    </div>
  );
}
