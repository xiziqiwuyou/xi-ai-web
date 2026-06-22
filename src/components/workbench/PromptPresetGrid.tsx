type PromptPresetGridProps = {
  presets: string[];
  className?: string;
  onPick?: (value: string) => void;
};

function PromptPresetGrid({ presets, className = "", onPick }: PromptPresetGridProps) {
  if (!presets.length) return null;

  return (
    <div className={`prompt-preset-grid ${className}`.trim()}>
      {presets.map((preset) => (
        <button key={preset} type="button" onClick={() => onPick?.(preset)}>
          {preset}
        </button>
      ))}
    </div>
  );
}

export default PromptPresetGrid;
