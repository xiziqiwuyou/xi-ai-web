type HistoryStripProps = {
  items: string[];
};

function HistoryStrip({ items }: HistoryStripProps) {
  if (!items.length) return null;
  return (
    <div className="history-strip">
      {items.map((item) => (
        <span key={item}>{item}</span>
      ))}
    </div>
  );
}

export default HistoryStrip;
