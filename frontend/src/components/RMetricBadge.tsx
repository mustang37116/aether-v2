export default function RMetricBadge({ R }: { R: number | null }) {
  if (R == null) return null;
  return <span style={{padding:'2px 6px', background:'#222', color:'#fff', borderRadius:4}}>R {R.toFixed(2)}</span>;
}
