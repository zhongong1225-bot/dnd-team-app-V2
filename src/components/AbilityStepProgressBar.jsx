export default function AbilityStepProgressBar({ step, labels }) {
  return (
    <div className="flex items-center justify-center px-4 py-2">
      {labels.map((label, i) => {
        const isCompleted = i < step
        const isCurrent = i === step
        return (
          <div key={i} className="flex items-center">
            {i > 0 && (
              <div
                className="h-[3px] w-8 sm:w-12"
                style={{ backgroundColor: isCompleted ? '#c79a42' : '#34455f' }}
              />
            )}
            <div className="flex flex-col items-center">
              <div
                className="w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold transition-all duration-200"
                style={{
                  backgroundColor: isCompleted || isCurrent ? '#c79a42' : '#34455f',
                  color: isCompleted || isCurrent ? '#1a1f2e' : '#6b7280',
                  boxShadow: isCurrent ? '0 0 8px rgba(199,154,66,0.5)' : 'none',
                }}
              >
                {isCompleted ? '✓' : i + 1}
              </div>
              <span
                className="text-[10px] mt-1.5"
                style={{ color: isCurrent ? '#c79a42' : isCompleted ? '#9ca3af' : '#4b5563' }}
              >
                {label}
              </span>
            </div>
          </div>
        )
      })}
    </div>
  )
}
